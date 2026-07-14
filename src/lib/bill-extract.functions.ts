import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  file_base64: z.string().min(10),
  mime_type: z.string(),
  bill_type: z.enum(["items", "services", "fixed_assets"]),
});

const OutputSchema = z.object({
  vendor_name: z.string().nullable(),
  vendor_vat_number: z.string().nullable(),
  vendor_pan: z.string().nullable(),
  tax_type: z.string().nullable(),
  vendor_address: z.string().nullable(),
  vendor_phone: z.string().nullable(),
  vendor_email: z.string().nullable(),
  vendor_state: z.string().nullable(),
  vendor_city: z.string().nullable(),
  vendor_pincode: z.string().nullable(),
  bill_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  po_number: z.string().nullable(),
  lines: z.array(
    z.object({
      code: z.string().nullable(),
      name: z.string(),
      uom: z.string().nullable(),
      quantity: z.number(),
      per_unit: z.number(),
      vat_rate: z.number().nullable(),
      lot_number: z.string().nullable(),
      expiry_date: z.string().nullable(),
    }),
  ),
  taxable_amount: z.number().nullable(),
  exempted_amount: z.number().nullable(),
  discount: z.number().nullable(),
  transportation: z.number().nullable(),
  other_charges: z.number().nullable(),
  vat_amount: z.number().nullable(),
  final_amount: z.number().nullable(),
});

/**
 * Bill OCR Service client
 * Calls the Python Surya OCR microservice via multipart file upload
 */
async function callBillOCRService(
  file_base64: string,
  mime_type: string,
  _bill_type: string,
): Promise<z.infer<typeof OutputSchema>> {
  const serviceUrl = process.env.BILL_OCR_SERVICE_URL || "http://localhost:8001";

  // Convert base64 to Blob
  const byteString = atob(file_base64.split(",")[1] || file_base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mime_type });

  const ext = mime_type.includes("pdf") ? ".pdf" : mime_type.includes("png") ? ".png" : ".jpg";
  const file = new File([blob], `bill${ext}`, { type: mime_type });

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${serviceUrl}/ocr`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || `OCR service error: ${response.status}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "Extraction failed");
  }

  const ex = result.extracted;

  // Convert date from DD/MMM/YYYY or DD/MM/YYYY to YYYY-MM-DD
  function normalizeDate(d: string | null): string | null {
    if (!d) return null;
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    // Try DD/MMM/YYYY
    let m = d.match(/^(\d{1,2})[\/\-](\w+)[\/\-](\d{2,4})$/);
    if (m) {
      const day = m[1].padStart(2, "0");
      const mon = months[m[2].slice(0, 3).toLowerCase()];
      const year = m[3].length === 2 ? "20" + m[3] : m[3];
      if (mon) return `${year}-${mon}-${day}`;
    }
    // Try DD/MM/YYYY
    m = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      const day = m[1].padStart(2, "0");
      const mon = m[2].padStart(2, "0");
      const year = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${year}-${mon}-${day}`;
    }
    // Try YYYY-MM-DD (already correct)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return d;
  }

  // Map Surya OCR response to frontend schema
  return {
    vendor_name: ex.vendor_name || null,
    vendor_vat_number: ex.vendor_vat_number || null,
    vendor_pan: ex.vendor_pan || null,
    tax_type: ex.tax_type || "vat",
    vendor_address: ex.vendor_address || null,
    vendor_phone: ex.vendor_phone || null,
    vendor_email: ex.vendor_email || null,
    vendor_state: ex.vendor_state || null,
    vendor_city: ex.vendor_city || null,
    vendor_pincode: ex.vendor_pincode || null,
    bill_number: ex.bill_number || null,
    invoice_date: normalizeDate(ex.issue_date),
    po_number: null,
    lines: (ex.line_items || []).map((item: any) => ({
      code: null,
      name: item.description || "Item",
      uom: "NOS",
      quantity: item.quantity || 1,
      per_unit: item.rate || 0,
      vat_rate: item.has_vat ? (item.vat_rate || (ex.vat_rate || 0)) : 0,
      lot_number: null,
      expiry_date: null,
    })),
    taxable_amount: ex.subtotal || null,
    exempted_amount: ex.exempted_amount || null,
    discount: ex.discount || null,
    transportation: ex.transportation || null,
    other_charges: ex.other_charges || null,
    vat_amount: ex.tax_total || null,
    final_amount: ex.total || null,
  };
}

export const extractBillFromFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const output = await callBillOCRService(
        data.file_base64,
        data.mime_type,
        data.bill_type,
      );

      // Clamp lines to 40
      return { ...output, lines: (output.lines ?? []).slice(0, 40) };
    } catch (error) {
      // Re-throw with user-friendly message
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not extract text")) {
        throw new Error(
          "Couldn't read the bill automatically. Please ensure the image is clear and try again.",
        );
      }
      throw new Error(`Bill extraction failed: ${message}`);
    }
  });

/**
 * Check health of the OCR service
 */
export async function checkOCRServiceHealth(): Promise<{
  status: string;
  surya: boolean;
  ollama: boolean;
}> {
  const serviceUrl = process.env.BILL_OCR_SERVICE_URL || "http://localhost:8001";

  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { status: "unhealthy", surya: false, ollama: false };
    }

    return await response.json();
  } catch {
    return { status: "unreachable", surya: false, ollama: false };
  }
}
