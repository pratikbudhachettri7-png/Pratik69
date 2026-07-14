-- Remove lot_number and expiry_date from items master (these belong on bill_lines only)
ALTER TABLE public.items DROP COLUMN IF EXISTS lot_number;
ALTER TABLE public.items DROP COLUMN IF EXISTS expiry_date;

-- Add alternative unit support to items
-- alt_uom: the alternative unit name (e.g., "BOX", "CASE", "DOZEN")
-- alt_uom_conversion: 1 main unit = X alt units (e.g., 1 NOS = 12 DOZEN)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS alt_uom TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS alt_uom_conversion NUMERIC(14,4);

-- Add PAN column to fixed_assets for Nepal tax registration
ALTER TABLE public.fixed_assets ADD COLUMN IF NOT EXISTS pan TEXT;
