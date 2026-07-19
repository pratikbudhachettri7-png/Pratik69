import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  file_base64: z.string().min(10),
  mime_type: z.string(),
  bill_type: z.enum(["items", "services", "fixed_assets"]),
  bill_id: z.string().optional(),
});

const OutputSchema = z.object({
  vendor_name: z.string().nullable(),
  vendor_vat_number: z.string().nullable(),
  vendor_pan: z.string().nullable(),
  vendor_address: z.string().nullable(),
  vendor_phone: z.string().nullable(),
  vendor_email: z.string().nullable(),
  vendor_state: z.string().nullable(),
  vendor_city: z.string().nullable(),
  vendor_pincode: z.string().nullable(),
  tax_type: z.string().nullable(),
  bill_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
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
  raw_text: z.string().nullable(),
  validation_errors: z.array(z.string()).nullable(),
});

const serviceUrl = process.env.BILL_OCR_SERVICE_URL || "http://localhost:8001";

function mapExtractedToOutput(ex: any, raw_text: string | null): z.infer<typeof OutputSchema> {
  return {
    vendor_name: ex.vendor_name || null,
    vendor_vat_number: ex.vendor_vat_number || null,
    vendor_pan: ex.vendor_pan || null,
    vendor_address: ex.vendor_address || null,
    vendor_phone: ex.vendor_phone || null,
    vendor_email: ex.vendor_email || null,
    vendor_state: ex.vendor_state || null,
    vendor_city: ex.vendor_city || null,
    vendor_pincode: ex.vendor_pincode || null,
    tax_type: "vat",
    bill_number: ex.bill_number || null,
    invoice_date: ex.issue_date || null,
    due_date: ex.due_date || null,
    po_number: ex.po_number || null,
    lines: (ex.line_items || []).map((item: any) => ({
      code: item.account || null,
      name: item.description || "Item",
      uom: item.uom || "NOS",
      quantity: item.quantity || 1,
      per_unit: item.rate || 0,
      vat_rate: item.vat_rate || null,
      lot_number: null,
      expiry_date: null,
    })),
    taxable_amount: ex.taxable_amount || null,
    exempted_amount: null,
    discount: ex.discount || null,
    transportation: ex.transportation || null,
    other_charges: ex.other_charges || null,
    vat_amount: ex.tax_total || null,
    final_amount: ex.total || null,
    raw_text: raw_text || null,
    validation_errors: ex._validation_errors || null,
  };
}

/**
 * Synchronous OCR — calls Gemini-powered Python service directly.
 */
async function callBillOCRService(
  file_base64: string,
  mime_type: string,
  _bill_type: string,
): Promise<z.infer<typeof OutputSchema>> {
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

  return mapExtractedToOutput(result.extracted, result.raw_text);
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
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Could not extract text")) {
        throw new Error(
          "Couldn't read the bill automatically. Please ensure the image is clear and try again.",
        );
      }
      if (message.includes("503") || message.includes("UNAVAILABLE") || message.includes("busy")) {
        throw new Error("AI service is temporarily busy. Please try again in a few seconds.");
      }
      if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("AI service rate limit reached. Please try again later.");
      }
      throw new Error("Bill extraction failed. Please try again or fill manually.");
    }
  });

/**
 * Check health of the OCR service
 */
export async function checkOCRServiceHealth(): Promise<{
  status: string;
  engine: string;
}> {
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { status: "unhealthy", engine: "unknown" };
    }

    return await response.json();
  } catch {
    return { status: "unreachable", engine: "unknown" };
  }
}
