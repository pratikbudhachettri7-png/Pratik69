import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Plus, Trash2, Loader2, CheckCircle2, Save } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EntityCombobox, type EntityOption } from "./EntityCombobox";
import {
  vendorSchema,
  vendorFields,
  itemSchema,
  itemFields,
  fixedAssetSchema,
  fixedAssetFields,
} from "@/components/masters/schemas";
import { computeBillTotals, computeLineAmount } from "@/lib/vat";
import { inr, num, toNumber } from "@/lib/format";
import { extractBillFromFile } from "@/lib/bill-extract.functions";

type BillType = "items" | "services" | "fixed_assets";

interface Line {
  id?: string;
  sno: number;
  ref_id: string | null;
  code: string;
  name: string;
  uom: string;
  quantity: number;
  per_unit: number;
  vat_rate: number;
  lot_number: string;
  expiry_date: string;
}

function toISODate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  // DD/MM/YYYY → YYYY-MM-DD
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr;
}

interface BillFormProps {
  billId?: string;
  initialType?: BillType;
  initial?: {
    bill: Record<string, unknown> | null;
    lines: Array<Record<string, unknown>>;
  } | null;
  pendingOcrResult?: Record<string, unknown> | null;
}

const TYPE_LABEL: Record<BillType, string> = {
  items: "Items / Inventory",
  services: "Services",
  fixed_assets: "Fixed Assets",
};

const emptyLine = (sno: number): Line => ({
  sno,
  ref_id: null,
  code: "",
  name: "",
  uom: "NOS",
  quantity: 1,
  per_unit: 0,
  vat_rate: 0,
  lot_number: "",
  expiry_date: "",
});

export function BillForm({ billId, initialType = "items", initial, pendingOcrResult }: BillFormProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const existing = initial?.bill;
  const isNew = !billId;

  // Apply pending OCR result passed via sessionStorage (after navigate from new-bill page)
  const pendingOcrAppliedRef = useRef(false);
  const pendingOcrVendorRef = useRef<Awaited<ReturnType<typeof extractBillFromFile>> | null>(null);

  useEffect(() => {
    if (pendingOcrResult && !pendingOcrAppliedRef.current) {
      pendingOcrAppliedRef.current = true;
      const r = pendingOcrResult as Awaited<ReturnType<typeof extractBillFromFile>>;
      // Apply header fields immediately (no vendor dependency)
      applyExtractionHeaders(r);
      // Store for vendor matching once vendors load
      pendingOcrVendorRef.current = r;
      const errs = (pendingOcrResult as any)?.validation_errors;
      if (errs && errs.length > 0) {
        setValidationErrors(errs);
        toast.warning("Some values may be inaccurate — please review highlighted fields.");
      } else {
        toast.success("Bill details extracted — please review and edit as needed.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOcrResult]);

  const [billType, setBillType] = useState<BillType>(
    (existing?.bill_type as BillType) || initialType,
  );
  const billTypeRef = useRef(billType);
  billTypeRef.current = billType;
  const [ocrTaxType, setOcrTaxType] = useState<string | null>(
    (existing?.tax_type as string) ?? null,
  );
  const [vendorId, setVendorId] = useState<string | null>(
    (existing?.vendor_id as string) ?? null,
  );
  const [vendorRow, setVendorRow] = useState<Record<string, unknown> | null>(null);

  const taxType = useMemo<"vat" | "pan">(() => {
    if (vendorRow) {
      if (vendorRow.pan && !vendorRow.vat_number) return "pan";
      if (vendorRow.vat_number && !vendorRow.pan) return "vat";
    }
    if (ocrTaxType === "pan") return "pan";
    if (ocrTaxType === "vat") return "vat";
    if (existing?.tax_type === "pan") return "pan";
    return "vat";
  }, [vendorRow, ocrTaxType, existing]);
  const [billNumber, setBillNumber] = useState<string>((existing?.bill_number as string) ?? "");
  const [invoiceDate, setInvoiceDate] = useState<string>(
    (existing?.invoice_date as string) ?? "",
  );
  const [poNumber, setPoNumber] = useState<string>((existing?.po_number as string) ?? "");
  const [internalBillNumber, setInternalBillNumber] = useState<string>(
    (existing?.internal_bill_number as string) ?? "",
  );
  const [notes, setNotes] = useState<string>((existing?.notes as string) ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(
    (existing?.attachment_url as string) ?? null,
  );
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);

  const [exempted, setExempted] = useState<number>(Number(existing?.exempted_amount ?? 0));
  const [discount, setDiscount] = useState<number>(Number(existing?.discount ?? 0));
  const [transportation, setTransportation] = useState<number>(
    Number(existing?.transportation ?? 0),
  );
  const [otherCharges, setOtherCharges] = useState<number>(Number(existing?.other_charges ?? 0));
  const [manualVat, setManualVat] = useState<number | null>(
    existing?.vat_amount != null ? Number(existing.vat_amount) : null,
  );

  const [lines, setLines] = useState<Line[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l, i) => ({
        id: l.id as string,
        sno: (l.sno as number) ?? i + 1,
        ref_id: (l.ref_id as string) ?? null,
        code: (l.code as string) ?? "",
        name: (l.name as string) ?? "",
        uom: (l.uom as string) ?? "NOS",
        quantity: Number(l.quantity ?? 1),
        per_unit: Number(l.per_unit ?? 0),
        vat_rate: Number(l.vat_rate ?? 0),
        lot_number: (l.lot_number as string) ?? "",
        expiry_date: (l.expiry_date as string) ?? "",
      }));
    }
    return [emptyLine(1)];
  });

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [ocrRawText, setOcrRawText] = useState<string | null>(null);
  const [showOcrText, setShowOcrText] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null);

  // Auto-suggest internal bill number for new bills
  useEffect(() => {
    if (!isNew) return;
    if (internalBillNumber) return;
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
    setInternalBillNumber(`INT-${ym}-${Math.floor(Math.random() * 900 + 100)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data loads
  const vendors = useQuery({
    queryKey: ["vendors", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Deferred vendor matching — runs once vendors data is loaded after OCR
  useEffect(() => {
    if (pendingOcrVendorRef.current && vendors.data) {
      const r = pendingOcrVendorRef.current;
      pendingOcrVendorRef.current = null;
      applyExtractionVendor(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors.data]);

  const items = useQuery({
    queryKey: ["items", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").order("item_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const assets = useQuery({
    queryKey: ["fixed_assets", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fixed_assets").select("*").order("asset_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const companies = useQuery({
    queryKey: ["companies", "list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const vendorOptions: EntityOption[] = useMemo(
    () =>
      (vendors.data ?? []).map((v: Record<string, unknown>) => ({
        id: v.id as string,
        label: v.name as string,
        sublabel: [(v.vat_number as string), (v.pan as string), (v.state as string)].filter(Boolean).join(" · "),
        raw: v,
      })),
    [vendors.data],
  );

  const itemOptions: EntityOption[] = useMemo(() => {
    const source = billType === "services"
      ? (items.data ?? []).filter((i: Record<string, unknown>) => i.is_service)
      : billType === "items"
        ? (items.data ?? []).filter((i: Record<string, unknown>) => !i.is_service)
        : (assets.data ?? []);
    return source.map((i: Record<string, unknown>) => ({
      id: i.id as string,
      label: (i.item_name || i.asset_name) as string,
      sublabel: `${(i.item_code || i.asset_code) as string} · ${(i.uom as string) ?? ""}`,
      raw: i,
    }));
  }, [billType, items.data, assets.data]);

  // Load vendor row when vendorId changes but row not set
  useEffect(() => {
    if (vendorId && !vendorRow) {
      const found = (vendors.data ?? []).find((v) => v.id === vendorId);
      if (found) setVendorRow(found as Record<string, unknown>);
    }
  }, [vendorId, vendorRow, vendors.data]);

  const activeCompany = useMemo(() => {
    const list = (companies.data ?? []) as Array<Record<string, unknown>>;
    return (list.find((c) => c.is_default) ?? list[0]) as
      | Record<string, unknown>
      | undefined;
  }, [companies.data]);

  const computedTotals = useMemo(
    () =>
      computeBillTotals({
        lines,
        exempted_amount: exempted,
        discount,
        transportation: billType === "services" ? 0 : transportation,
        other_charges: otherCharges,
      }),
    [lines, exempted, discount, transportation, otherCharges, billType],
  );

  const totals = useMemo(() => {
    if (manualVat !== null) {
      const discountAmt = Number(discount) || 0;
      const transportAmt = billType === "services" ? 0 : Number(transportation) || 0;
      const otherAmt = Number(otherCharges) || 0;
      return {
        taxable_amount: computedTotals.taxable_amount,
        vat_amount: manualVat,
        final_amount: computedTotals.taxable_amount + manualVat + transportAmt + otherAmt - discountAmt,
      };
    }
    return computedTotals;
  }, [computedTotals, manualVat, discount, transportation, otherCharges, billType]);

  // Line handlers
  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine(prev.length + 1)]);
  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== i).map((l, idx) => ({ ...l, sno: idx + 1 })));

  // Upload + extract
  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      // Upload to storage
      const path = `bills/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("bill-attachments")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("bill-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      setAttachmentPath(path);
      setAttachmentUrl(signed?.signedUrl ?? null);

      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);

      // OCR FIRST — before creating any draft bill
      setExtracting(true);
      const result = await extractBillFromFile({
        data: {
          file_base64: base64,
          mime_type: file.type || "application/pdf",
          bill_type: billType,
        },
      });
      setExtracting(false);

      // OCR succeeded — create draft and navigate, passing extraction via router state
      let targetBillId = billId;
      if (!targetBillId) {
        const { data: draftBill, error: draftErr } = await supabase
          .from("bills")
          .insert({
            bill_type: billType,
            status: "draft",
            company_id: (activeCompany?.id as string) ?? null,
            attachment_url: signed?.signedUrl ?? null,
          })
          .select()
          .single();
        if (draftErr) throw draftErr;
        targetBillId = draftBill.id as string;
        // Pass OCR result via router state (more reliable than sessionStorage)
        navigate({
          to: "/bills/$id",
          params: { id: targetBillId },
          state: { ocrResult: result } as any,
        });
      } else {
        // Already on the bill page — apply extraction directly
        applyExtractionHeaders(result);
        applyExtractionVendor(result);
        if (result.validation_errors && result.validation_errors.length > 0) {
          setValidationErrors(result.validation_errors);
          toast.warning("Some values may be inaccurate — please review highlighted fields.");
        } else {
          toast.success("Bill details extracted — please review and edit as needed.");
        }
      }

      setUploading(false);
    } catch (e) {
      toast.error((e as Error).message);
      setUploading(false);
      setExtracting(false);
    }
  };

  const applyExtractionHeaders = (r: Awaited<ReturnType<typeof extractBillFromFile>>) => {
    // Store OCR results for display
    if (r.raw_text) {
      setOcrRawText(r.raw_text);
      setShowOcrText(true);
    }

    // Store validation errors
    if (r.validation_errors && r.validation_errors.length > 0) {
      setValidationErrors(r.validation_errors);
    } else {
      setValidationErrors(null);
    }

    // Auto-fill reliable form fields
    if (r.bill_number) setBillNumber(r.bill_number);
    if (r.invoice_date) setInvoiceDate(toISODate(r.invoice_date));
    if (r.po_number) setPoNumber(r.po_number);
    if (typeof r.discount === "number") setDiscount(r.discount);
    if (typeof r.vat_amount === "number") setManualVat(r.vat_amount);
    if (typeof r.transportation === "number") setTransportation(r.transportation);
    if (typeof r.other_charges === "number") setOtherCharges(r.other_charges);
    if (typeof r.exempted_amount === "number") setExempted(r.exempted_amount);

    // Populate line items from OCR, auto-linking to masters
    if (r.lines && r.lines.length > 0) {
      const masterList = billTypeRef.current === "fixed_assets"
        ? (assets.data ?? [])
        : (items.data ?? []);
      const nameField = billTypeRef.current === "fixed_assets" ? "asset_name" : "item_name";
      const codeField = billTypeRef.current === "fixed_assets" ? "asset_code" : "item_code";

      setLines(r.lines.map((l, i) => {
        // Auto-link: match by code first, then by name
        let refId: string | null = null;
        if (l.code) {
          const byCode = masterList.find((m: Record<string, unknown>) =>
            (m[codeField] as string)?.toLowerCase() === l.code!.toLowerCase()
          );
          if (byCode) refId = byCode.id as string;
        }
        if (!refId && l.name) {
          const normalizedName = l.name.trim().toLowerCase();
          const byName = masterList.find((m: Record<string, unknown>) =>
            ((m[nameField] as string) ?? "").trim().toLowerCase() === normalizedName
          );
          if (byName) refId = byName.id as string;
        }

        return {
          id: crypto.randomUUID(),
          sno: i + 1,
          ref_id: refId,
          code: l.code || "",
          name: l.name || "",
          uom: l.uom || "NOS",
          quantity: l.quantity || 1,
          per_unit: l.per_unit || 0,
          vat_rate: l.vat_rate || 0,
          lot_number: l.lot_number || "",
          expiry_date: l.expiry_date || "",
        };
      }));
    }
  };

  const applyExtractionVendor = (r: Awaited<ReturnType<typeof extractBillFromFile>>) => {
    // Vendor matching — validate by VAT/PAN first (strongest match), then by name
    let match = null;
    if (r.vendor_vat_number || r.vendor_pan) {
      match = (vendors.data ?? []).find((v) => {
        if (r.vendor_vat_number && (v.vat_number as string)?.trim().toLowerCase() === r.vendor_vat_number.trim().toLowerCase()) return true;
        if (r.vendor_pan && (v.pan as string)?.trim().toLowerCase() === r.vendor_pan.trim().toLowerCase()) return true;
        return false;
      });
    }

    if (!match && r.vendor_name) {
      const nameNorm = r.vendor_name.trim().toLowerCase();
      match = (vendors.data ?? []).find(
        (v) => (v.name as string).trim().toLowerCase() === nameNorm,
      );
    }

    // Fuzzy fallback: try contains match
    if (!match && r.vendor_name) {
      const nameNorm = r.vendor_name.trim().toLowerCase();
      match = (vendors.data ?? []).find(
        (v) => {
          const vName = (v.name as string).trim().toLowerCase();
          return vName.includes(nameNorm) || nameNorm.includes(vName);
        },
      );
    }

    if (match) {
      setVendorId(match.id as string);
      setVendorRow(match as Record<string, unknown>);
    } else if (r.vendor_name || r.vendor_vat_number || r.vendor_pan) {
      setCreatingVendor(true);
      (async () => {
        try {
          const finalName = r.vendor_name?.trim() || `Vendor (VAT/PAN: ${r.vendor_vat_number || r.vendor_pan})`;
          const insertPayload: Record<string, unknown> = {
            name: finalName,
            vat_number: r.vendor_vat_number || null,
            pan: r.vendor_pan || null,
            address: r.vendor_address || null,
            phone: r.vendor_phone || null,
            email: r.vendor_email || null,
            state: r.vendor_state || null,
            city: r.vendor_city || null,
            pincode: r.vendor_pincode || null,
          };
          const { data: newVendor, error } = await supabase
            .from("vendors")
            .insert(insertPayload as never)
            .select()
            .single();
          if (error) throw error;
          setVendorId(newVendor.id as string);
          setVendorRow(newVendor as Record<string, unknown>);
          qc.invalidateQueries({ queryKey: ["vendors"] });
          toast.success(`Vendor "${finalName}" created`);
        } catch (e) {
          toast.error(`Failed to create vendor: ${(e as Error).message}`);
        } finally {
          setCreatingVendor(false);
        }
      })();
    }
  };

  const save = useMutation({
    mutationFn: async (opts: { approve: boolean }) => {
      const payload = {
        bill_type: billType,
        vendor_id: vendorId,
        company_id: (activeCompany?.id as string) ?? null,
        bill_number: billNumber || null,
        invoice_date: invoiceDate || null,
        po_number: poNumber || null,
        internal_bill_number: internalBillNumber || null,
        taxable_amount: totals.taxable_amount,
        exempted_amount: toNumber(exempted),
        discount: toNumber(discount),
        transportation: billType === "services" ? 0 : toNumber(transportation),
        other_charges: toNumber(otherCharges),
        vat_amount: totals.vat_amount,
        final_amount: totals.final_amount,
        status: (opts.approve ? "approved" : "draft") as "approved" | "draft",
        approved_at: opts.approve ? new Date().toISOString() : null,
        attachment_url: attachmentUrl,
        notes: notes || null,
        extracted_json: (() => {
          if (!ocrRawText) return null;
          try { return JSON.parse(ocrRawText); } catch { return { raw: ocrRawText }; }
        })(),
      };

      // ── Duplicate bill check (runs for BOTH new bills AND first-time saves of OCR drafts) ──
      if (billNumber) {
        const candidateVendorIds = new Set<string>();
        if (vendorId) {
          candidateVendorIds.add(vendorId);
          const { data: vRow } = await supabase
            .from("vendors")
            .select("vat_number, pan")
            .eq("id", vendorId)
            .maybeSingle();
          // Find vendors with same VAT
          if (vRow?.vat_number) {
            const { data: byVat } = await supabase
              .from("vendors")
              .select("id")
              .eq("vat_number", vRow.vat_number);
            for (const v of byVat ?? []) candidateVendorIds.add(v.id);
          }
          // Find vendors with same PAN
          if (vRow?.pan) {
            const { data: byPan } = await supabase
              .from("vendors")
              .select("id")
              .eq("pan", vRow.pan);
            for (const v of byPan ?? []) candidateVendorIds.add(v.id);
          }
        }

        // Query 1: same bill_number + vendor_id in candidate set
        let foundDup: { id: string; bill_number: string | null; invoice_date: string | null; final_amount: number } | null = null;
        if (candidateVendorIds.size > 0) {
          const { data } = await supabase
            .from("bills")
            .select("id, bill_number, invoice_date, final_amount")
            .eq("bill_number", billNumber)
            .in("vendor_id", [...candidateVendorIds])
            .maybeSingle();
          if (data && data.id !== billId) foundDup = data;
        }
        // Query 2: same bill_number + vendor_id IS NULL (unassigned bills)
        if (!foundDup) {
          const { data } = await supabase
            .from("bills")
            .select("id, bill_number, invoice_date, final_amount")
            .eq("bill_number", billNumber)
            .is("vendor_id", null)
            .maybeSingle();
          if (data && data.id !== billId) foundDup = data;
        }

        if (foundDup) {
          const dateStr = foundDup.invoice_date ? ` dated ${foundDup.invoice_date}` : "";
          throw new Error(
            `Duplicate bill detected — Bill #${billNumber}${dateStr} (₹${foundDup.final_amount}) already exists. ` +
            `Please review the existing bill before saving.`,
          );
        }
      }

      let id = billId;
      if (id) {
        const { error } = await supabase.from("bills").update(payload as never).eq("id", id);
        if (error) throw error;
        await supabase.from("bill_lines").delete().eq("bill_id", id);
      } else {
        const { data, error } = await supabase
          .from("bills")
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }

      const linePayloads = lines
        .filter((l) => l.name.trim())
        .map((l) => ({
          bill_id: id!,
          sno: l.sno,
          ref_type: (billType === "items"
            ? "item"
            : billType === "services"
              ? "service"
              : "asset") as "item" | "service" | "asset",
          ref_id: l.ref_id,
          code: l.code || null,
          name: l.name,
          uom: l.uom || null,
          quantity: toNumber(l.quantity, 1),
          per_unit: toNumber(l.per_unit, 0),
          vat_rate: toNumber(l.vat_rate, 0),
          lot_number: l.lot_number || null,
          expiry_date: l.expiry_date || null,
          line_amount: computeLineAmount(l.quantity, l.per_unit),
        }));
      if (linePayloads.length) {
        const { error } = await supabase.from("bill_lines").insert(linePayloads as never);
        if (error) throw error;
      }

      // Post ledger entry when bill is approved and has a vendor
      if (opts.approve && vendorId && id) {
        // Remove any existing ledger entry for this bill to avoid duplicates on re-approve
        await supabase.from("ledgers").delete().eq("bill_id", id);
        const { error: ledgerErr } = await supabase.from("ledgers").insert({
          vendor_id: vendorId,
          bill_id: id,
          date: invoiceDate || new Date().toISOString().slice(0, 10),
          description: `Bill #${billNumber || internalBillNumber || id}`,
          debit: 0,
          credit: totals.final_amount,
        } as never);
        if (ledgerErr) {
          console.error("Ledger entry failed:", ledgerErr);
          // Non-fatal — bill is already saved
        }
      }

      return id;
    },
    onSuccess: (id, vars) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["ledgers"] });
      toast.success(vars.approve ? "Bill approved & saved" : "Draft saved");

      // Auto-create master records on approve (inventory, services, fixed assets)
      if (vars.approve) {
        const isFixedAssets = billTypeRef.current === "fixed_assets";
        const isServices = billTypeRef.current === "services";
        const table = isFixedAssets ? "fixed_assets" : "items";
        const codeField = isFixedAssets ? "asset_code" : "item_code";
        const nameField = isFixedAssets ? "asset_name" : "item_name";
        const label = isFixedAssets ? "fixed assets" : isServices ? "services" : "inventory";

        (async () => {
          let created = 0;
          let updated = 0;

          // ── 1. Increment qty for MATCHED lines (ref_id is set) ──
          const matched = lines.filter((l) => l.ref_id && l.name.trim());
          for (const line of matched) {
            const { data: item } = await supabase
              .from(table)
              .select("id, qty")
              .eq("id", line.ref_id!)
              .maybeSingle();
            if (item) {
              const newQty = Number(item.qty || 0) + Number(line.quantity || 0);
              await supabase
                .from(table)
                .update({ qty: newQty } as never)
                .eq("id", item.id);
              updated++;
            }
          }

          // ── 2. Create or update UNMATCHED lines (no ref_id) ──
          const unmatched = lines.filter((l) => !l.ref_id && l.name.trim());
          for (const line of unmatched) {
            const autoCode = line.name
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9 ]/g, "")
              .replace(/\s+/g, "-")
              .slice(0, 50);

            // Normalize name for fuzzy matching: collapse spaces, lowercase
            const normalizedInput = line.name.trim().toLowerCase().replace(/\s+/g, " ");
            const normalizedName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

            // For items/services table, also filter by is_service to avoid cross-matching
            const { data: existingCandidates } = await supabase
              .from(table)
              .select("id, qty, is_service")
              .or(`${codeField}.eq.${autoCode},${nameField}.eq.${line.name.trim()}`);

            // Filter by is_service client-side (generated types may not include it in .eq)
            let existing = isFixedAssets
              ? existingCandidates?.[0] ?? null
              : (existingCandidates as any)?.find((r: any) => r.is_service === isServices) ?? null;

            // Fuzzy fallback: try normalized name match if exact match failed
            if (!existing && !isFixedAssets) {
              const fuzzyCandidates = await supabase
                .from(table)
                .select("id, qty, is_service, item_name")
                .like("item_name", `%${line.name.trim().split(/\s+/)[0]}%`);
              const candidates = (fuzzyCandidates.data ?? []) as any[];
              existing = candidates.find((r) =>
                r.is_service === isServices &&
                normalizedName(r.item_name).replace(/\s+/g, " ") === normalizedInput
              ) ?? null;
            }

            if (existing) {
              const newQty = Number(existing.qty || 0) + Number(line.quantity || 1);
              await supabase
                .from(table)
                .update({ qty: newQty } as never)
                .eq("id", existing.id);
              updated++;
            } else {
              const payload: Record<string, unknown> = {
                [codeField]: autoCode,
                [nameField]: line.name.trim(),
                uom: line.uom || "NOS",
                default_rate: line.per_unit,
                vat_rate: line.vat_rate,
                qty: Number(line.quantity) || 1,
              };
              // Mark as service
              if (!isFixedAssets) {
                payload.is_service = isServices;
              }
              // Add purchase fields for fixed assets
              if (isFixedAssets) {
                payload.purchase_date = invoiceDate || null;
                payload.purchase_cost = line.per_unit;
                payload.total_cost = computeLineAmount(line.quantity, line.per_unit);
                payload.category = "Other";
              }
              const { error } = await supabase
                .from(table)
                .insert(payload as never);
              if (!error) created++;
            }
          }
          qc.invalidateQueries({ queryKey: [table] });
          if (created || updated) {
            const parts = [];
            if (created) parts.push(`${created} new`);
            if (updated) parts.push(`${updated} qty updated`);
            toast.success(`${label} ${parts.join(", ")}`);
          }
        })();
      }

      if (isNew && id) {
        navigate({ to: "/bills/$id", params: { id } });
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const isServiceMode = billType === "services";
  const isApproved = existing?.status === "approved";

  const vendorSublabel = vendorRow
    ? [(vendorRow.vat_number as string), (vendorRow.pan as string), (vendorRow.state as string)]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <>
      <PageHeader
        title={isNew ? "New Bill" : `Bill ${billNumber || existing?.internal_bill_number || ""}`}
        description={
          isNew
            ? "Upload a bill for AI extraction, or fill in the fields manually."
            : `Type: ${TYPE_LABEL[billType]} · Status: ${existing?.status ?? "draft"}`
        }
        actions={
          <div className="flex items-center gap-2">
            {isApproved ? (
              <Badge variant="secondary" className="bg-success text-success-foreground">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
              </Badge>
            ) : (
              <Badge variant="outline">Draft</Badge>
            )}
            <Button
              variant="outline"
              onClick={() => save.mutate({ approve: false })}
              disabled={save.isPending || creatingVendor}
            >
              <Save className="mr-1 h-4 w-4" /> Save Draft
            </Button>
            <Button
              onClick={() => save.mutate({ approve: true })}
              disabled={save.isPending || creatingVendor}
            >
              <CheckCircle2 className="mr-1 h-4 w-4" /> Approve &amp; Save
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-6">
        {/* Type selector + upload */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-[220px_1fr]">
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bill Type
              </Label>
              <Select value={billType} onValueChange={(v) => setBillType(v as BillType)} disabled={!isNew}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="items">Items / Inventory</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="fixed_assets">Fixed Assets</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Upload Bill (PDF or image) — AI will extract details
              </Label>
              <div className="flex items-center gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {uploading || extracting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {extracting ? "Extracting with AI…" : "Uploading…"}
                    </span>
                  ) : attachmentUrl ? (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View uploaded file
                    </a>
                  ) : (
                    <span>Click to upload PDF / JPG / PNG</span>
                  )}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
                {attachmentUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAttachmentUrl(null);
                      setAttachmentPath(null);
                      setOcrRawText(null);
                      setShowOcrText(false);
                      setValidationErrors(null);
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* OCR Extracted Info Panel */}
        {ocrRawText && (
          <Card>
            <CardHeader
              className="cursor-pointer select-none py-3"
              onClick={() => setShowOcrText(!showOcrText)}
            >
              <CardTitle className="flex items-center justify-between text-base">
                <span>OCR Extracted Text</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {showOcrText ? "Click to collapse" : "Click to expand"}
                </span>
              </CardTitle>
            </CardHeader>
            {showOcrText && (
              <CardContent>
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-relaxed">
                  {ocrRawText}
                </pre>
                <p className="mt-2 text-xs text-muted-foreground">
                  Review the extracted text above and fill in the bill details manually below. Vendor and date have been auto-filled where possible.
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Validation Errors */}
        {validationErrors && validationErrors.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="py-3">
              <CardTitle className="text-base text-destructive">
                Extraction Warnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-4 text-sm text-destructive">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Some values may be inaccurate. Please review the bill details below and correct any issues before saving.
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bill Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="mb-1 block text-xs font-medium text-muted-foreground">
                Vendor
              </Label>
              <EntityCombobox
                value={vendorId}
                onChange={(id, row) => {
                  setVendorId(id);
                  setVendorRow(row);
                }}
                options={vendorOptions}
                placeholder="Select or add vendor"
                addLabel="Add new vendor"
                table="vendors"
                schema={vendorSchema}
                fields={vendorFields}
                nameKey="name"
              />
              {vendorSublabel ? (
                <p className="mt-1 text-xs text-muted-foreground">{vendorSublabel}</p>
              ) : null}
            </div>
            <Field label="Bill Number">
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
            </Field>
            <Field label="Invoice Date">
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </Field>
            <Field label="PO Number">
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </Field>
            <Field label="Internal Bill Number">
              <Input
                value={internalBillNumber}
                onChange={(e) => setInternalBillNumber(e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        {/* Lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Line Items — {TYPE_LABEL[billType]}</CardTitle>
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="mr-1 h-4 w-4" /> Add Line
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S.No</TableHead>
                  <TableHead className="min-w-[280px]">
                    {billType === "fixed_assets" ? "Asset" : billType === "services" ? "Service" : "Item"}
                  </TableHead>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead className="w-20">UOM</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-32 text-right">Per Unit</TableHead>
                  <TableHead className="w-20 text-right">{taxType === "pan" ? "Tax %" : "VAT %"}</TableHead>
                  <TableHead className="w-28">Lot Number</TableHead>
                  <TableHead className="w-36">Expiry Date</TableHead>
                  <TableHead className="w-32 text-right">Line Amount</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => {
                  const lineAmt = computeLineAmount(l.quantity, l.per_unit);
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{l.sno}</TableCell>
                      <TableCell>
                        <EntityCombobox
                          value={l.ref_id}
                          onChange={(id, row) => {
                            if (row) {
                              updateLine(i, {
                                ref_id: id,
                                code: (row.item_code || row.asset_code || "") as string,
                                name: (row.item_name || row.asset_name || "") as string,
                                uom: (row.uom as string) || "NOS",
                                per_unit: Number(row.default_rate) || l.per_unit,
                                vat_rate: Number(row.vat_rate) || l.vat_rate,
                                lot_number: (row.lot_number as string) || l.lot_number,
                                expiry_date: (row.expiry_date as string) || l.expiry_date,
                              });
                            } else {
                              updateLine(i, { ref_id: null });
                            }
                          }}
                          options={itemOptions}
                          placeholder={l.name || "Select…"}
                          addLabel={
                            billType === "fixed_assets"
                              ? "Add new fixed asset"
                              : billType === "services"
                                ? "Add new service"
                                : "Add new item"
                          }
                          table={billType === "fixed_assets" ? "fixed_assets" : "items"}
                          schema={billType === "fixed_assets" ? fixedAssetSchema : itemSchema}
                          fields={billType === "fixed_assets" ? fixedAssetFields : itemFields}
                          nameKey={billType === "fixed_assets" ? "asset_name" : "item_name"}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.code}
                          onChange={(e) => updateLine(i, { code: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.uom}
                          onChange={(e) => updateLine(i, { uom: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          className="text-right"
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(i, { quantity: toNumber(e.target.value, 0) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          className="text-right"
                          value={l.per_unit}
                          onChange={(e) =>
                            updateLine(i, { per_unit: toNumber(e.target.value, 0) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="any"
                          className="text-right"
                          value={l.vat_rate}
                          onChange={(e) =>
                            updateLine(i, { vat_rate: toNumber(e.target.value, 0) })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={l.lot_number}
                          onChange={(e) => updateLine(i, { lot_number: e.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={l.expiry_date}
                          onChange={(e) => updateLine(i, { expiry_date: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {num(lineAmt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Totals */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totals</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <TotalRow label="Taxable Amount" value={inr(totals.taxable_amount)} />
              <NumField label="Exempted Amount" value={exempted} onChange={setExempted} />
              <NumField label="Discount" value={discount} onChange={setDiscount} />
              {!isServiceMode ? (
                <NumField
                  label="Transportation"
                  value={transportation}
                  onChange={setTransportation}
                />
              ) : null}
              <NumField label="Other Charges" value={otherCharges} onChange={setOtherCharges} />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm">{taxType === "pan" ? "Tax" : "VAT"}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="any"
                    className="w-36 text-right"
                    value={manualVat !== null ? manualVat : totals.vat_amount}
                    onChange={(e) => setManualVat(toNumber(e.target.value, 0))}
                  />
                  {manualVat !== null && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setManualVat(null)}
                      title="Reset to auto-calculated VAT"
                    >
                      ↺
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-6 rounded-md border border-primary/30 bg-primary/5 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Final Bill Amount
                </div>
                <div className="mt-1 text-3xl font-bold text-primary">
                  {inr(totals.final_amount)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes about this bill…"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TotalRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number"
        step="any"
        className="w-36 text-right"
        value={value}
        onChange={(e) => onChange(toNumber(e.target.value, 0))}
      />
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
