import { round2 } from "./format";

export interface BillTotalsInput {
  lines: Array<{ quantity: number; per_unit: number; vat_rate: number }>;
  exempted_amount?: number;
  discount?: number;
  transportation?: number;
  other_charges?: number;
}

export interface BillTotals {
  taxable_amount: number;
  vat_amount: number;
  final_amount: number;
}

export const computeLineAmount = (qty: number, per: number) =>
  round2((Number(qty) || 0) * (Number(per) || 0));

export const computeBillTotals = (input: BillTotalsInput): BillTotals => {
  let taxable = 0;
  let vat_amount = 0;
  for (const l of input.lines) {
    const amt = computeLineAmount(l.quantity, l.per_unit);
    const rate = Number(l.vat_rate) || 0;
    if (rate > 0) {
      // amt includes VAT (e.g., ₹99 = ₹87.61 + ₹11.39 at 13%)
      // Extract pre-VAT taxable portion: taxable = amt / (1 + rate/100)
      const line_taxable = round2(amt / (1 + rate / 100));
      taxable += line_taxable;
      vat_amount += round2(line_taxable * rate / 100);
    } else {
      taxable += amt;
    }
  }
  const discount = Number(input.discount) || 0;
  const transportation = Number(input.transportation) || 0;
  const other = Number(input.other_charges) || 0;
  // Exempted amount is already included in taxable, do NOT add it again
  const final_amount = round2(
    taxable + vat_amount + transportation + other - discount,
  );
  return {
    taxable_amount: round2(taxable),
    vat_amount: round2(vat_amount),
    final_amount,
  };
};