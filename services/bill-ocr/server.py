"""FastAPI server for bill OCR using Gemini 3.5 Flash."""

import base64
import json
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root (two levels up)
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(_env_path)

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from google import genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

EXTRACTION_PROMPT = """
Extract all fields from this invoice/bill and return ONLY valid JSON.
No explanation. No markdown. Raw JSON only.

{
  "vendor_name": "",
  "vendor_vat": "",
  "vendor_pan": "",
  "vendor_address": "",
  "vendor_phone": "",
  "vendor_city": "",
  "vendor_state": "",
  "vendor_pincode": "",
  "bill_number": "",
  "bill_date": "",
  "due_date": "",
  "po_number": "",
  "line_items": [
    {
      "item_name": "",
      "quantity": 0,
      "uom": "NOS",
      "rate": 0,
      "amount": 0,
      "vat_rate": 0,
      "account": "",
      "taxable": false,
      "non_taxable": false,
      "exempted": false
    }
  ],
  "subtotal": 0,
  "total_vat": 0,
  "transportation": 0,
  "other_charges": 0,
  "discount": 0,
  "final_amount": 0
}

Rules:
- Numbers must be actual numbers, not strings
- If a field is missing, use null
- Never guess or hallucinate
- taxable/non_taxable/exempted are mutually exclusive per line
- bill_date and due_date should be in DD/MM/YYYY or YYYY-MM-DD format
- uom is unit of measure (NOS, KG, LTR, PCS, BOX, etc.)
- Extract vendor address details if visible on the bill
- Extract PO number if present on the bill
"""


class OCRResponse(BaseModel):
    ok: bool
    error: Optional[str] = None
    extracted: Optional[dict] = None
    raw_text: Optional[str] = None


class Base64Request(BaseModel):
    image: str
    filename: str = "image.png"


class HealthResponse(BaseModel):
    status: str
    engine: str
    configured: bool


app = FastAPI(
    title="Ledgerly Bill OCR API",
    description="AI-powered bill/invoice OCR extraction using Google Gemini. Upload a bill image or PDF and get structured data back.",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_mime_type(filename: str) -> str:
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "jpg"
    return {
        "pdf": "application/pdf",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
    }.get(ext, "image/jpeg")


MODELS = ["gemini-3.1-flash-lite", "gemini-3-flash-preview", "gemini-3.5-flash"]


def extract_bill_with_gemini(file_bytes: bytes, mime_type: str) -> dict:
    image_part = {
        "inline_data": {
            "mime_type": mime_type,
            "data": base64.b64encode(file_bytes).decode(),
        }
    }

    last_error = None
    for model in MODELS:
        for attempt in range(2):
            try:
                print(f"[OCR] Trying {model} (attempt {attempt+1})...", flush=True)
                response = client.models.generate_content(
                    model=model,
                    contents=[image_part, EXTRACTION_PROMPT],
                )
                text = response.text.strip()

                if text.startswith("```"):
                    text = text.split("\n", 1)[1] if "\n" in text else text[3:]
                    if text.endswith("```"):
                        text = text[:-3]
                    text = text.strip()

                print(f"[OCR] Success with {model}", flush=True)
                return json.loads(text)
            except Exception as e:
                last_error = e
                error_str = str(e)
                if "503" in error_str or "429" in error_str or "UNAVAILABLE" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                    wait = 2 ** attempt
                    print(f"[OCR] {model} attempt {attempt+1} failed, retrying in {wait}s...", flush=True)
                    time.sleep(wait)
                else:
                    break
        continue

    raise last_error


def validate_bill(data: dict) -> list[str]:
    errors = []

    for item in data.get("line_items", []):
        qty = item.get("quantity") or 0
        rate = item.get("rate") or 0
        amt = item.get("amount") or 0
        expected = round(qty * rate, 2)
        if qty > 0 and rate > 0 and abs(expected - amt) > 0.01:
            name = item.get("item_name", "Item")
            errors.append(f"{name}: qty x rate != amount")

    line_items = data.get("line_items", [])
    if line_items:
        line_sum = round(sum(i.get("amount", 0) or 0 for i in line_items), 2)
        subtotal = data.get("subtotal") or 0
        if subtotal > 0 and abs(line_sum - subtotal) > 0.01:
            errors.append(f"Line items sum ({line_sum}) != subtotal ({subtotal})")

    subtotal = data.get("subtotal") or 0
    vat = data.get("total_vat") or 0
    final = data.get("final_amount") or 0
    if subtotal > 0 and final > 0:
        calc_total = round(subtotal + vat, 2)
        if abs(calc_total - final) > 0.01:
            errors.append(f"Subtotal ({subtotal}) + VAT ({vat}) != final ({final})")

    return errors


@app.post("/ocr", response_model=OCRResponse, tags=["OCR"])
async def ocr_extract(
    file: UploadFile = File(..., description="Bill image (JPEG/PNG/WebP/GIF) or PDF"),
):
    """
    Extract structured data from a bill/invoice image.

    - Accepts JPEG, PNG, WebP, GIF, or PDF
    - Returns vendor, bill number, date, line items, amounts
    - Validates extracted data (qty × rate = amount, subtotal checks)
    - Uses Gemini AI with automatic model fallback
    - Typical response time: 3–5 seconds
    """
    if not client:
        return {"ok": False, "error": "GEMINI_API_KEY not configured. Add it to .env"}

    content = await file.read()
    mime_type = get_mime_type(file.filename or "image.jpg")

    try:
        result = extract_bill_with_gemini(content, mime_type)
    except json.JSONDecodeError:
        return {"ok": False, "error": "Could not parse invoice. Please fill manually."}
    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "UNAVAILABLE" in error_str:
            return {"ok": False, "error": "AI service is temporarily busy. Please try again in a few seconds."}
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            return {"ok": False, "error": "AI service rate limit reached. Please try again later."}
        return {"ok": False, "error": "Failed to extract bill. Please fill manually."}

    errors = validate_bill(result)
    if errors:
        result["_validation_errors"] = errors

    extracted = {
        "vendor_name": result.get("vendor_name"),
        "vendor_vat_number": result.get("vendor_vat"),
        "vendor_pan": result.get("vendor_pan"),
        "vendor_address": result.get("vendor_address"),
        "vendor_phone": result.get("vendor_phone"),
        "vendor_city": result.get("vendor_city"),
        "vendor_state": result.get("vendor_state"),
        "vendor_pincode": result.get("vendor_pincode"),
        "bill_number": result.get("bill_number"),
        "issue_date": result.get("bill_date"),
        "due_date": result.get("due_date"),
        "po_number": result.get("po_number"),
        "total": result.get("final_amount"),
        "taxable_amount": result.get("subtotal"),
        "tax_total": result.get("total_vat"),
        "discount": result.get("discount"),
        "transportation": result.get("transportation"),
        "other_charges": result.get("other_charges"),
        "line_items": [
            {
                "description": item.get("item_name", ""),
                "quantity": item.get("quantity", 1),
                "uom": item.get("uom", "NOS"),
                "rate": item.get("rate", 0),
                "amount": item.get("amount", 0),
                "vat_rate": item.get("vat_rate"),
                "account": item.get("account"),
                "taxable": item.get("taxable", False),
                "non_taxable": item.get("non_taxable", False),
                "exempted": item.get("exempted", False),
            }
            for item in result.get("line_items", [])
        ],
        "_validation_errors": errors or None,
    }

    return {"ok": True, "extracted": extracted, "raw_text": json.dumps(result, indent=2)}


@app.post("/ocr/base64", response_model=OCRResponse, tags=["OCR"])
async def ocr_extract_base64(payload: Base64Request):
    """
    Extract structured data from a base64-encoded bill image.

    Same as /ocr but accepts JSON with a base64 string instead of a file upload.
    Useful for client-side scenarios where the image is already encoded.
    """
    if not client:
        return {"ok": False, "error": "GEMINI_API_KEY not configured. Add it to .env"}

    b64 = payload.get("image")
    if not b64:
        return {"ok": False, "error": "Missing 'image' field (base64 string)."}
    try:
        image_bytes = base64.b64decode(b64)
    except Exception:
        return {"ok": False, "error": "Invalid base64 data."}

    filename = payload.get("filename", "image.png")
    mime_type = get_mime_type(filename)

    try:
        result = extract_bill_with_gemini(image_bytes, mime_type)
    except json.JSONDecodeError:
        return {"ok": False, "error": "Could not parse invoice. Please fill manually."}
    except Exception as e:
        error_str = str(e)
        if "503" in error_str or "UNAVAILABLE" in error_str:
            return {"ok": False, "error": "AI service is temporarily busy. Please try again in a few seconds."}
        if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
            return {"ok": False, "error": "AI service rate limit reached. Please try again later."}
        return {"ok": False, "error": "Failed to extract bill. Please fill manually."}

    errors = validate_bill(result)
    if errors:
        result["_validation_errors"] = errors

    extracted = {
        "vendor_name": result.get("vendor_name"),
        "vendor_vat_number": result.get("vendor_vat"),
        "vendor_pan": result.get("vendor_pan"),
        "vendor_address": result.get("vendor_address"),
        "vendor_phone": result.get("vendor_phone"),
        "vendor_city": result.get("vendor_city"),
        "vendor_state": result.get("vendor_state"),
        "vendor_pincode": result.get("vendor_pincode"),
        "bill_number": result.get("bill_number"),
        "issue_date": result.get("bill_date"),
        "due_date": result.get("due_date"),
        "po_number": result.get("po_number"),
        "total": result.get("final_amount"),
        "taxable_amount": result.get("subtotal"),
        "tax_total": result.get("total_vat"),
        "discount": result.get("discount"),
        "transportation": result.get("transportation"),
        "other_charges": result.get("other_charges"),
        "line_items": [
            {
                "description": item.get("item_name", ""),
                "quantity": item.get("quantity", 1),
                "uom": item.get("uom", "NOS"),
                "rate": item.get("rate", 0),
                "amount": item.get("amount", 0),
                "vat_rate": item.get("vat_rate"),
                "account": item.get("account"),
                "taxable": item.get("taxable", False),
                "non_taxable": item.get("non_taxable", False),
                "exempted": item.get("exempted", False),
            }
            for item in result.get("line_items", [])
        ],
        "_validation_errors": errors or None,
    }

    return {"ok": True, "extracted": extracted, "raw_text": json.dumps(result, indent=2)}


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Check if the OCR service is running and Gemini API key is configured."""
    return {"status": "ok", "engine": "gemini", "configured": bool(client)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
