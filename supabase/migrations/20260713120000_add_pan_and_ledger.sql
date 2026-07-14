-- Add pan column to vendors table if not exists
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS pan TEXT;

-- Add tax_type column to bills table if not exists
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS tax_type TEXT DEFAULT 'vat';

-- Create unique indexes for vendor validation to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS vendors_vat_number_uidx ON public.vendors (vat_number) WHERE vat_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendors_pan_uidx ON public.vendors (pan) WHERE pan IS NOT NULL;

-- Create ledgers table
CREATE TABLE IF NOT EXISTS public.ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant permissions for ledgers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledgers TO anon, authenticated;
GRANT ALL ON public.ledgers TO service_role;
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;

-- Create policy for full public access on ledgers (matching other tables)
CREATE POLICY "public all ledgers" ON public.ledgers FOR ALL USING (true) WITH CHECK (true);

-- Create trigger for setting updated_at on ledgers table
CREATE TRIGGER trg_ledgers_updated BEFORE UPDATE ON public.ledgers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add ledger entries for existing approved/saved bills to initialize the ledger
-- Note: All bills in public.bills are purchase bills, so they credit the vendor's ledger.
INSERT INTO public.ledgers (vendor_id, bill_id, date, description, debit, credit, created_at, updated_at)
SELECT 
  vendor_id, 
  id as bill_id, 
  COALESCE(invoice_date, CURRENT_DATE) as date, 
  'Bill #' || COALESCE(bill_number, id::text) as description, 
  0.00 as debit, 
  final_amount as credit,
  created_at,
  updated_at
FROM public.bills
WHERE vendor_id IS NOT NULL;
