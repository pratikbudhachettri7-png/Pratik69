"""FastAPI server for bill OCR using PaddleOCR — bill document extraction."""

import base64
import io
import os
import re
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

ocr_engine = None


def _init_ocr():
    """Initialize PaddleOCR engine (called once at startup)."""
    global ocr_engine
    from paddleocr import PaddleOCR
    print("[OCR] Loading PaddleOCR model...", flush=True)
    ocr_engine = PaddleOCR(
        use_textline_orientation=True,
        lang="en",
    )
    print("[OCR] PaddleOCR model loaded.", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_ocr()
    yield
    print("[OCR] Shutting down.", flush=True)


app = FastAPI(title="Bill OCR Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _pdf_to_images(pdf_path: str, dpi: int = 192) -> list[Image.Image]:
    """Convert PDF pages to PIL images."""
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(pdf_path)
    images = []
    for i in range(len(doc)):
        page = doc[i]
        bitmap = page.render(scale=dpi / 72)
        images.append(bitmap.to_pil())
    return images


def _run_paddleocr(img: Image.Image) -> str:
    """Run PaddleOCR on a PIL Image and return extracted text."""
    import numpy as np
    img_array = np.array(img)
    result = ocr_engine.predict(img_array)
    texts = []
    for page in result:
        rec_texts = page.get("rec_texts", [])
        for t in rec_texts:
            if t and t.strip():
                texts.append(t.strip())
    return "\n".join(texts)


def _parse_bill_fields(text: str) -> dict:
    """Extract structured bill fields from OCR text using regex heuristics."""
    lines = text.split("\n")
    full_text = "\n".join(lines)

    # Detect if VAT/GST is present in the bill
    has_vat = bool(re.search(r"\b(vat|uat|gst|tax)\b", full_text, re.IGNORECASE))

    # Extract VAT rate (from line items OR tax summary table)
    vat_rate = 0
    vat_rate_match = re.search(r"(?:vat|uat|gst)\s*(\d{1,2})\s*%", full_text, re.IGNORECASE)
    if not vat_rate_match:
        vat_rate_match = re.search(r"(?:vat|uat|gst)\s+(\d{1,2})\s*%", full_text, re.IGNORECASE)
    if not vat_rate_match:
        # Handle OCR typo: "VAT 138" means "VAT 13%"
        vat_rate_match = re.search(r"(?:vat|uat|gst)\s+(\d{1,2})[8%]", full_text, re.IGNORECASE)
    if vat_rate_match:
        vat_rate = int(vat_rate_match.group(1))

    # Vendor name
    vendor_name = ""
    thank_match = re.search(r"thank\s+(?:you\s+)?(?:for\s+)?(?:shopping|visiting|patronizing)\s+(?:at|our)\s+(.+?)(?:\.|$)", full_text, re.IGNORECASE)
    if thank_match:
        vendor_name = thank_match.group(1).strip().rstrip(".!").strip()
    if not vendor_name:
        store_match = re.search(r"\b(?:stores?|shops?|mart|market|bazaar|pharmacy|medical|trading)\s*[:\s]+\s*(.+?)(?:\n|$)", full_text, re.IGNORECASE)
        if store_match:
            candidate = store_match.group(0).strip()
            if not re.search(r"\d{3,}\s+(?:st|street|rd|road|ave|avenue|blvd|dr|drive|ln|lane|ct|court)", candidate, re.IGNORECASE):
                vendor_name = re.sub(r"^(?:stores?|shops?|mart|market|bazaar|pharmacy|medical|trading)\s*[:\s]+\s*", "", candidate, flags=re.IGNORECASE).strip()
    if not vendor_name:
        skip_words = {"invoice", "bill", "receipt", "tax", "date", "customer", "particulars", "qty", "netrate", "netamt", "memo", "cash", "credit", "debit", "**", "product", "description", "item", "subtotal", "total", "gross", "net", "taxable", "promo", "discount", "return", "condition", "exchange", "thank", "no", "print"}
        buyer_indicators = {"bill to", "billed to", "sold to", "ship to", "shipped to", "customer", "client", "buyer", "purchaser", "m/s", "messrs", "to:", "delivery to", "consignee"}
        vendor_prefixes = re.compile(r"^(vendor|supplier|seller|from|company|firm)\s*[:\-]?\s*", re.IGNORECASE)
        for line in lines[:15]:
            cleaned = line.strip()
            cleaned = re.sub(r"^[\s\*\-\#\.\,]+|[\s\*\-\#\.\,]+$", "", cleaned).strip()
            if len(cleaned) < 3:
                continue
            if not any(c.isalpha() for c in cleaned):
                continue
            cleaned_lower = cleaned.lower()
            if any(indicator in cleaned_lower for indicator in buyer_indicators):
                continue
            words = cleaned.split()
            if not words:
                continue
            first_word = words[0].lower().rstrip(":")
            if first_word in skip_words:
                continue
            if re.match(r"^(vat|gst|pan|tin|crm|phone|tel|email|www|http|address|condition|serial|s\.?n\.?o?|inv|date|time)", cleaned, re.IGNORECASE):
                continue
            if "@" in cleaned or ("." in cleaned and ("com" in cleaned_lower or "net" in cleaned_lower or "org" in cleaned_lower or "www" in cleaned_lower)):
                continue
            if re.match(r"^\d+\s+(?:n|s|e|w)\s+", cleaned, re.IGNORECASE):
                continue
            if re.match(r"^\(\d{3}\)", cleaned):
                continue
            stripped_vendor = vendor_prefixes.sub("", cleaned).strip()
            if stripped_vendor and len(stripped_vendor) >= 2:
                vendor_name = stripped_vendor
                break
            elif len(cleaned) >= 3:
                vendor_name = cleaned
                break

    # Bill number
    bill_number = ""
    bill_patterns = [
        r"b\w+\s*no\.?\s*[:\s]+\s*([A-Z0-9\-/]+)",
        r"bill\s*no\.?\s*[:\s]+\s*(\d+)",
        r"bill\s*no\.?\s*\n\s*(\d+)",
        r"invoice\s*(?:no|number|#)\.?\s*[:\s]+\s*([A-Z0-9\-/]+)",
        r"no\.?\s*invoice\s*[:\s]+([A-Z0-9\-/]+)",
        r"receipt\s*no\.?\s*[:\s]+\s*([A-Z0-9\-/]+)",
        r"transaction\s*id\s*[:\s]+(\d+)",
        r"trans(?:action)?\s*#?\s*[:\s]+(\d+)",
    ]
    for pat in bill_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            bill_number = m.group(1).strip()
            break

    # Date
    issue_date = ""
    date_patterns = [
        r"b\w+\s*date\s*[:\s]+(\d{1,2}[\/\-]\w+[\/\-]\d{2,4})",
        r"b\w+\s*date\s*[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"date\s*[:\s]+(\d{1,2}[\/\-]\w+[\/\-]\d{2,4})",
        r"date\s*[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"(\d{1,2}[\/\-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/\-]\d{2,4})",
        r"(\w+\s+\d{1,2},?\s+\d{4})",
        r"(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})",
        r"(\d{1,2}[\/\-]\w+[\/\-]\d{4})",
    ]
    for pat in date_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            issue_date = m.group(1).strip()
            break

    # Due date
    due_date = ""
    due_patterns = [
        r"due\s*date\s*[:\s]*(\d{1,2}[\/\-]\w+[\/\-]\d{2,4})",
        r"due\s*date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        r"payment\s*due\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
    ]
    for pat in due_patterns:
        m = re.search(pat, full_text, re.IGNORECASE)
        if m:
            due_date = m.group(1).strip()
            break

    if not issue_date:
        date_fallback = [
            r"date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
            r"date\s*[:\s]*(\d{1,2}[\/\-]\w+[\/\-]\d{2,4})",
            r"date\s*[:\s]*(\d{1,2}[\/\-]\d{1,2})",
        ]
        for pat in date_fallback:
            m = re.search(pat, full_text, re.IGNORECASE)
            if m:
                issue_date = m.group(1).strip()
                break

    # VAT / PAN
    vat_number = ""
    pan = ""
    vat_match = re.search(r"\b(?:vat|uat|gst|tin|gstin)\s*(?:no\.?|num\.?)?\s*[:\s-]*([A-Z0-9]{9,15})\b", full_text, re.IGNORECASE)
    if vat_match:
        vat_number = vat_match.group(1).strip()
    pan_match = re.search(r"\bpan\s*(?:no\.?|num\.?)?\s*[:\s-]*([A-Z0-9]{9,10})\b", full_text, re.IGNORECASE)
    if pan_match:
        pan = pan_match.group(1).strip()

    if vat_number and len(vat_number) == 9 and not pan:
        pan = vat_number
    elif pan and len(pan) == 9 and not vat_number:
        if has_vat:
            vat_number = pan

    # Email
    email = ""
    email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", full_text)
    if email_match:
        email = email_match.group(0).strip()

    # Phone
    phone = ""
    phone_match = re.search(r"\b(?:phone|tel|contact|mob|mobile|cell)\s*[:\s]*([0-9\-\+\s\(\)]{7,15})", full_text, re.IGNORECASE)
    if phone_match:
        phone = phone_match.group(1).strip()
    else:
        phone_match = re.search(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", full_text)
        if phone_match:
            phone = phone_match.group(0).strip()

    # Address
    address = ""
    address_match = re.search(r"\baddress\s*[:\s]+([^\n]+)", full_text, re.IGNORECASE)
    if address_match:
        address = address_match.group(1).strip()
    else:
        for line in lines[:10]:
            if any(k in line.lower() for k in ["street", "road", "chowk", "lane", "tole", "bazar", "highway", "district"]):
                address = line.strip()
                break

    pincode = ""
    pincode_match = re.search(r"\b\d{5,6}\b", full_text)
    if pincode_match:
        pincode = pincode_match.group(0).strip()

    city = ""
    state = ""
    if address:
        parts = [p.strip() for p in address.split(",")]
        if len(parts) >= 2:
            city = parts[-2]
            state = parts[-1]
            city = re.sub(r"\b\d{5,6}\b", "", city).strip()
            state = re.sub(r"\b\d{5,6}\b", "", state).strip()

    # Currency
    currency = "USD"
    if re.search(r"\bNPR\b|Rs\.?\s|\u0930\u0942", full_text):
        currency = "NPR"
    elif re.search(r"\bEUR\b|\u20ac", full_text):
        currency = "EUR"
    elif re.search(r"\bGBP\b|\u00a3", full_text):
        currency = "GBP"
    elif re.search(r"\bINR\b|\u20b9", full_text):
        currency = "INR"

    def extract_amount(label_patterns):
        for pat in label_patterns:
            m = re.search(pat, full_text, re.IGNORECASE)
            if m:
                try:
                    return float(m.group(1).replace(",", ""))
                except ValueError:
                    pass
        return 0

    CURRENCY = r"(?:rs\.?\s*|\u20b9\s*)?"

    def _amount_pat(label):
        """Build pattern: label + colon(s)/spaces + optional Rs + amount."""
        return label + r"\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})"

    total = extract_amount([
        r"grand\s*total\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"total\s*(?:amount|due|price\s*paid)?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"amount\s*due\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"final\s*(?:bill)?\s*amount\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
    ])

    subtotal = extract_amount([
        r"taxable\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"net\s*total\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"sub\s*total\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"gross\s*(?:amt|amount)\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
    ])

    exempted_amount = extract_amount([
        r"exempted\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"exempted\s*(?:amount)?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"exempt\s*(?:amount)?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"exempted\s*\n\s*([\d,]+\.?\d{0,2})",
    ])

    discount = extract_amount([
        r"discount\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"less\s*discount\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"promo\s*discount\s*[:]+\s*" + CURRENCY + r"[\-\s]*([\d,]+\.?\d{0,2})",
    ])

    transportation = extract_amount([
        r"transport(?:ation)?\s*(?:charges?)?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"freight\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"cartage\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
    ])

    other_charges = extract_amount([
        r"other\s*charges?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"additional\s*charges?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
    ])

    tax_total = extract_amount([
        r"tax\s*collected\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"(?:vat|uat)\s*\d*%?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"gst\s*\d*%?\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"tax\s*(?:amt|amount)\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
        r"sales\s*tax\s*[:]+\s*" + CURRENCY + r"([\d,]+\.?\d{0,2})",
    ])

    if subtotal == 0 and total > 0:
        subtotal = total - tax_total

    tax_type = "vat"
    if pan and not vat_number:
        tax_type = "pan"
    elif has_vat or tax_total > 0 or vat_rate > 0:
        tax_type = "vat"
    else:
        if pan and tax_total == 0:
            tax_type = "pan"
        else:
            tax_type = "vat"

    line_items = []

    def clean_desc(text):
        patterns_to_remove = [
            r"HSCODE:.*", r"PAN No\.:.*", r"Date:.*", r"Patient.*",
            r"Address:.*", r"Contact:.*", r"Age/Sex:.*", r"Regd\. No\.:.*",
            r"Tel\.:.*", r"E-mail.*", r"Particulars.*", r"Qty.*",
            r"Rate.*", r"Amount.*", r"S\.N\..*", r"Bill No.*",
            r"Bill Date.*", r"Customer.*", r"Tax Invoice.*",
        ]
        for pat in patterns_to_remove:
            text = re.sub(pat, "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"\n+", " ", text)
        text = re.sub(r"\s{2,}", " ", text).strip()
        if len(text) > 60:
            text = text[:60].rsplit(" ", 1)[0]
        return text

    def _split_merged_number(s: str) -> list[float]:
        """Split OCR-merged numbers like '163.721.020.0' → [163.72, 1020.0].

        When OCR merges two numbers, the result has too many decimal groups.
        Tries every character-level split point and picks the best one.
        """
        if not s:
            return []
        clean = s.replace(",", "")
        try:
            val = float(clean)
        except ValueError:
            return []

        parts = clean.split(".")
        if len(parts) <= 2:
            return [val]

        # 3+ dots → try every possible split position in the string
        best = None
        best_score = float("inf")
        for i in range(1, len(clean)):
            left_str = clean[:i]
            right_str = clean[i:]
            try:
                l_val = float(left_str)
                r_val = float(right_str)
            except ValueError:
                continue
            if l_val <= 0 or r_val <= 0:
                continue
            # Score based on typical bill number patterns:
            # rate: usually has 2 decimal places, amount: 0-2 decimal places
            score = 0
            left_has_2dec = "." in left_str and len(left_str.split(".")[-1]) == 2
            right_has_01dec = "." in right_str and len(right_str.split(".")[-1]) <= 1
            if left_has_2dec and right_has_01dec:
                score -= 10  # strong preference
            # Penalize unreasonable ranges
            if l_val > 50000:
                score += (l_val - 25000) / 1000
            if r_val > 100000:
                score += (r_val - 50000) / 1000
            if 1 <= l_val <= 50000 and 1 <= r_val <= 100000:
                score -= 5
            if score < best_score:
                best_score = score
                best = (l_val, r_val)

        if best:
            return [best[0], best[1]]
        return [val]

    def _parse_numbers_from_text(text: str) -> list[float]:
        """Extract all numbers from a text string, splitting merged ones.
        Captures full number strings including multiple dots."""
        raw_nums = []
        for m in re.finditer(r"(?<![A-Za-z])(\d[\d,]*(?:\.\d+)*)\b", text):
            raw_nums.append(m.group(1))
        result = []
        for n in raw_nums:
            result.extend(_split_merged_number(n))
        return result

    def extract_numbers_from_line(line):
        nums = []
        for m in re.finditer(r"(\d[\d,]*\.?\d{0,2})", line):
            try:
                val = float(m.group(1).replace(",", ""))
                nums.append((val, m.start()))
            except ValueError:
                pass
        return nums

    # Pipe-separated items
    pipe_items = re.findall(r"(?:\d+\)\s*)?(.+?)\s*\|\s*([\d,]+\.?\d*)\s*\|\s*([\d,]+\.?\d*)\s*\|\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    pipe_items = [(d, q, r, a) for d, q, r, a in pipe_items
                  if not re.match(r"^\s*(particulars|description|item|qty|quantity|rate|amount|total|subtotal|tax|discount|gross|net|exempted|grand|paid|refund|condition|exchange|return|receipt|print|thank)\s*$", d.strip(), re.IGNORECASE)
                  and not re.match(r"^\s*\|", d)
                  and float(a.replace(",", "")) > 0]

    for desc, qty_str, rate_str, amt_str in pipe_items:
        try:
            qty = float(qty_str.replace(",", ""))
            rate = float(rate_str.replace(",", ""))
            amt = float(amt_str.replace(",", ""))
            if amt > 0:
                line_items.append({
                    "description": clean_desc(desc)[:100] if clean_desc(desc) else "Item",
                    "quantity": qty,
                    "rate": rate,
                    "total": amt,
                })
        except (ValueError, IndexError):
            pass

    # Tab-separated items
    if not line_items:
        tab_items = re.findall(r"\d+\)\s+(.+?)\t+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", full_text)
        for desc, qty_str, rate_str, amt_str in tab_items:
            try:
                qty = float(qty_str.replace(",", ""))
                rate = float(rate_str.replace(",", ""))
                amt = float(amt_str.replace(",", ""))
                if amt > 0:
                    line_items.append({
                        "description": clean_desc(desc)[:100] if clean_desc(desc) else "Item",
                        "quantity": qty,
                        "rate": rate,
                        "total": amt,
                    })
            except (ValueError, IndexError):
                pass

    # Numbered items: "N) DESCRIPTION qty rate amount" (with or without colon)
    if not line_items:
        same_line_items = re.findall(r"\d+\)\s+(.+?):?\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", full_text)
        for desc, qty_str, rate_str, amt_str in same_line_items:
            try:
                qty = float(qty_str.replace(",", ""))
                rate = float(rate_str.replace(",", ""))
                amt = float(amt_str.replace(",", ""))
                if amt > 0:
                    line_items.append({
                        "description": clean_desc(desc)[:100] if clean_desc(desc) else "Item",
                        "quantity": qty,
                        "rate": rate,
                        "total": amt,
                    })
            except (ValueError, IndexError):
                pass

        # Fallback: handle merged numbers like "1). GORKHA STRONG 6.00 163.721.020.0"
        # Also handles multi-line: desc on one line, numbers on next
        if not line_items:
            for m in re.finditer(r"\n\s*\d+\)\.\s*(.+?)(?:\n|$)", full_text):
                desc_line = m.group(1).strip()
                # Extract description (text before first digit)
                desc_match = re.match(r"([A-Za-z][A-Za-z\d\s.,/&'-]+?)(?:\s+\d|\s*$)", desc_line)
                desc = clean_desc(desc_match.group(1)) if desc_match else ""
                # Get numbers from this line
                nums = _parse_numbers_from_text(desc_line)
                # If fewer than 3 numbers, look at the next line for more
                if len(nums) < 3:
                    next_line_start = m.end()
                    next_line_match = re.match(r"\s*([\d,\. \-]+)", full_text[next_line_start:next_line_start+100])
                    if next_line_match:
                        next_nums = _parse_numbers_from_text(next_line_match.group(1))
                        nums.extend(next_nums)
                # Take first 3 numbers as qty, rate, amt
                if len(nums) >= 3:
                    qty, rate, amt = nums[0], nums[1], nums[2]
                    if qty > 0 and amt > 0:
                        line_items.append({
                            "description": desc[:100] if desc else "Item",
                            "quantity": qty,
                            "rate": rate,
                            "total": amt,
                        })

    # Numbered items: description on one line, numbers on next
    if not line_items:
        item_chunks = re.split(r"\n\s*\d+\)\.\s*|\n\s*\d+\)\s+", full_text)
        if len(item_chunks) > 1:
            for chunk in item_chunks[1:]:
                chunk_lines = chunk.strip().split("\n")
                desc_lines = []
                all_numbers = []
                found_first_number = False
                for line in chunk_lines:
                    line = line.strip()
                    if not line:
                        continue
                    if line.lower() in ("qty", "netrate", "netamt", "particulars", "qty.", "rate", "amount", "s.n."):
                        continue
                    if re.search(r"(hscode|pan\s*no)", line, re.IGNORECASE):
                        continue
                    is_number_only = bool(re.match(r"^[\d,\. \-]+$", line))
                    if is_number_only:
                        nums = _parse_numbers_from_text(line)
                        if nums:
                            all_numbers.extend(nums)
                            found_first_number = True
                    elif not found_first_number and len(desc_lines) < 2:
                        clean = clean_desc(line)
                        if clean:
                            desc_lines.append(clean)

                desc = " ".join(desc_lines).strip()

                if len(all_numbers) >= 3:
                    qty = all_numbers[0]
                    rate = all_numbers[1]
                    amt = all_numbers[2]
                    if qty > 0 and amt > 0:
                        per_unit = round(amt / qty, 2) if qty > 0 else rate
                        line_items.append({
                            "description": desc[:100] if desc else "Item",
                            "quantity": qty,
                            "rate": per_unit,
                            "total": amt,
                        })

    # Items with "Item N:" prefix
    if not line_items:
        item_pattern = r"(?:item|article|product|service)\s*\d*\s*[:\-]\s*(.+?)(?:\n|$)"
        for m in re.finditer(item_pattern, full_text, re.IGNORECASE):
            desc = clean_desc(m.group(1))
            line_text = m.group(0)
            nums = extract_numbers_from_line(line_text)
            if len(nums) >= 3:
                if nums[0][0] == int(nums[0][0]) and nums[0][0] <= 20:
                    nums = nums[1:]
                if len(nums) >= 3:
                    qty = nums[0][0]
                    rate = nums[1][0]
                    amt = nums[2][0]
                else:
                    qty = 1
                    rate = nums[0][0] if nums else 0
                    amt = nums[1][0] if len(nums) > 1 else 0
            elif len(nums) >= 2:
                qty = 1
                rate = nums[0][0]
                amt = nums[1][0]
            else:
                continue
            if amt > 0:
                line_items.append({
                    "description": desc[:100] if desc else "Item",
                    "quantity": qty,
                    "rate": rate,
                    "total": amt,
                })

    # Items with special chars like ①, ②
    if not line_items:
        special_pattern = r"[①②③④⑤⑥⑦⑧⑨⑩]\s*\n?\s*(.+?)\n[①②③④⑤⑥⑦⑧⑨⑩]\s*\n?\s*([\d,]+\.?\d{0,2})-?\s*\n[\s]*([\d,]+\.?\d{0,2})-?"
        for m in re.finditer(special_pattern, full_text, re.DOTALL):
            desc = clean_desc(m.group(1))
            try:
                rate = float(m.group(2).replace(",", ""))
                amt = float(m.group(3).replace(",", ""))
                qty = amt / rate if rate > 0 else 1
                if rate > 0 and amt > 0:
                    line_items.append({
                        "description": desc[:100] if desc else "Item",
                        "quantity": round(qty, 2),
                        "rate": rate,
                        "total": amt,
                    })
            except (ValueError, IndexError):
                pass

    # Space-separated items: "DESCRIPTION qty rate amount" (no prefix)
    if not line_items:
        space_sep_items = re.findall(r"^([A-Z][A-Z\s]+?)\s+(\d[\d,]*\.?\d{0,2})\s+(\d[\d,]*\.?\d{0,2})\s+(\d[\d,]*\.?\d{0,2})\s*$", full_text, re.MULTILINE)
        for desc, qty_str, rate_str, amt_str in space_sep_items:
            try:
                qty = float(qty_str.replace(",", ""))
                rate = float(rate_str.replace(",", ""))
                amt = float(amt_str.replace(",", ""))
                if amt > 0 and qty > 0:
                    line_items.append({
                        "description": clean_desc(desc)[:100] if clean_desc(desc) else "Item",
                        "quantity": qty,
                        "rate": rate,
                        "total": amt,
                    })
            except (ValueError, IndexError):
                pass

    # Pipe-separated with header like "Particulars | Qty | Rate | Amount"
    if not line_items:
        pipe_pattern = r"\|\s*(?:particulars|description|item)\s*\|.*?\|\s*(?:qty|quantity)\s*\|.*?\|\s*(?:rate|price|unit\s*rate)\s*\|.*?\|\s*(?:amount|total|amt)\s*\|"
        pipe_header_match = re.search(pipe_pattern, full_text, re.IGNORECASE)
        if pipe_header_match:
            header_pos = pipe_header_match.end()
            remaining = full_text[header_pos:]
            for line in remaining.split("\n"):
                line = line.strip()
                if not line or "|" not in line:
                    continue
                parts = [p.strip() for p in line.split("|") if p.strip()]
                if len(parts) >= 4:
                    try:
                        desc = clean_desc(parts[0])
                        qty = float(parts[1].replace(",", ""))
                        rate = float(parts[2].replace(",", ""))
                        amt = float(parts[3].replace(",", ""))
                        if amt > 0 and desc:
                            line_items.append({
                                "description": desc[:100],
                                "quantity": qty,
                                "rate": rate,
                                "total": amt,
                            })
                    except (ValueError, IndexError):
                        pass
                elif len(parts) >= 3:
                    try:
                        desc = clean_desc(parts[0])
                        qty = float(parts[1].replace(",", ""))
                        amt = float(parts[2].replace(",", ""))
                        if amt > 0 and desc:
                            rate = round(amt / qty, 2) if qty > 0 else amt
                            line_items.append({
                                "description": desc[:100],
                                "quantity": qty,
                                "rate": rate,
                                "total": amt,
                            })
                    except (ValueError, IndexError):
                        pass

    if not line_items and total > 0:
        line_items.append({
            "description": "Bill total",
            "quantity": 1,
            "rate": total,
            "total": total,
        })

    # Parse tax summary table
    exempted_total_from_summary = 0.0
    taxable_total_from_summary = 0.0
    vat_rate_from_summary = 0

    exempted_match = re.search(r"exempted\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if exempted_match:
        exempted_total_from_summary = float(exempted_match.group(1).replace(",", ""))

    vat_summary_match = re.search(r"(?:uat|vat)\s*(\d+)%\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if not vat_summary_match:
        # Handle OCR typo: "VAT 138" means "VAT 13%"
        vat_summary_match = re.search(r"(?:uat|vat)\s*(\d+)[8%]\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)", full_text, re.IGNORECASE)
    if vat_summary_match:
        vat_rate_from_summary = int(vat_summary_match.group(1))
        taxable_total_from_summary = float(vat_summary_match.group(2).replace(",", ""))
    else:
        sales_tax_match = re.search(r"(?:sales\s*tax|vat|gst|tax)\s*\|?\s*([\d,]+\.?\d*)\s*\|?\s*([\d,]+\.?\d*)", full_text, re.IGNORECASE)
        if sales_tax_match:
            taxable_total_from_summary = float(sales_tax_match.group(1).replace(",", ""))
            if not vat_rate_from_summary:
                vat_pct_match = re.search(r"(\d{1,2})%\s*(?:gst|vat|sales\s*tax)", full_text, re.IGNORECASE)
                if vat_pct_match:
                    vat_rate_from_summary = int(vat_pct_match.group(1))

    if exempted_total_from_summary > 0 and line_items:
        indexed_items = sorted(enumerate(line_items), key=lambda x: x[1]["total"], reverse=True)
        remaining_exempted = exempted_total_from_summary
        item_vat_status = {}
        for idx, item in indexed_items:
            item_total = item["total"]
            if item_total <= remaining_exempted + 0.01:
                item_vat_status[idx] = False
                remaining_exempted = round(remaining_exempted - item_total, 2)
            else:
                item_vat_status[idx] = True
        for i, item in enumerate(line_items):
            has_vat_item = item_vat_status.get(i, True)
            item["has_vat"] = has_vat_item
            item["vat_rate"] = vat_rate_from_summary if has_vat_item else 0
    else:
        for item in line_items:
            item["has_vat"] = has_vat
            item["vat_rate"] = vat_rate if has_vat else 0

    return {
        "vendor_name": vendor_name or None,
        "vendor_vat_number": vat_number or None,
        "vendor_pan": pan or None,
        "tax_type": tax_type,
        "vendor_address": address or None,
        "vendor_phone": phone or None,
        "vendor_email": email or None,
        "vendor_state": state or None,
        "vendor_city": city or None,
        "vendor_pincode": pincode or None,
        "bill_number": bill_number or None,
        "issue_date": issue_date or None,
        "due_date": due_date or None,
        "has_vat": has_vat,
        "vat_rate": vat_rate,
        "subtotal": round(subtotal, 2),
        "exempted_amount": round(exempted_amount, 2),
        "discount": round(discount, 2),
        "transportation": round(transportation, 2),
        "other_charges": round(other_charges, 2),
        "tax_total": round(tax_total, 2),
        "total": round(total, 2),
        "currency": currency,
        "line_items": line_items,
    }


def process_image(image_bytes: bytes, filename: str = "image") -> dict:
    """
    Core processing function — takes raw image bytes, runs OCR, extracts fields.
    Returns {"ok": True, "extracted": {...}, "raw_text": "..."}.
    """
    suffix = Path(filename).suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        if suffix.lower() == ".pdf":
            images = _pdf_to_images(tmp_path)
        else:
            images = [Image.open(tmp_path)]

        print(f"[OCR] Processing {len(images)} page(s) via PaddleOCR...")
        texts = []
        for i, img in enumerate(images):
            text = _run_paddleocr(img)
            texts.append(text)
            print(f"[OCR] Page {i+1}: {len(text)} chars")
        full_text = "\n".join(texts)
        print(f"[OCR] Extracted text length: {len(full_text)}")
        print(f"[OCR] FULL TEXT:\n{full_text}")

        bill_data = _parse_bill_fields(full_text)

        return {
            "ok": True,
            "extracted": bill_data,
            "raw_text": full_text[:5000],
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
    finally:
        os.unlink(tmp_path)


@app.post("/ocr")
async def ocr_extract(file: UploadFile = File(...)):
    """Primary endpoint — multipart file upload."""
    content = await file.read()
    result = process_image(content, file.filename or "image")
    return result


@app.post("/ocr/base64")
async def ocr_extract_base64(payload: dict):
    """Secondary endpoint — JSON body with base64-encoded image."""
    b64 = payload.get("image")
    if not b64:
        return {"ok": False, "error": "Missing 'image' field (base64 string)."}
    try:
        image_bytes = base64.b64decode(b64)
    except Exception:
        return {"ok": False, "error": "Invalid base64 data."}
    filename = payload.get("filename", "image.png")
    result = process_image(image_bytes, filename)
    return result


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "paddleocr"}
