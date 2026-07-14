
CREATE TYPE public.bill_type AS ENUM ('items','services','fixed_assets');
CREATE TYPE public.bill_status AS ENUM ('draft','approved');
CREATE TYPE public.line_ref_type AS ENUM ('item','service','asset');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vat_number TEXT,
  pan TEXT,
  address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  phone TEXT,
  email TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO anon, authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vat_number TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  vat_number TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  payment_terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO anon, authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all vendors" ON public.vendors FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_vendors_name ON public.vendors (lower(name));
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code TEXT NOT NULL UNIQUE,
  item_name TEXT NOT NULL,
  uom TEXT NOT NULL DEFAULT 'NOS',
  hsn_code TEXT,
  default_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
  lot_number TEXT,
  expiry_date DATE,
  is_service BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO anon, authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all items" ON public.items FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_items_name ON public.items (lower(item_name));
CREATE TRIGGER trg_items_updated BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code TEXT NOT NULL UNIQUE,
  asset_name TEXT NOT NULL,
  category TEXT,
  uom TEXT NOT NULL DEFAULT 'NOS',
  hsn_code TEXT,
  default_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
  depreciation_rate NUMERIC(5,2),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO anon, authenticated;
GRANT ALL ON public.fixed_assets TO service_role;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all fixed_assets" ON public.fixed_assets FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_assets_name ON public.fixed_assets (lower(asset_name));
CREATE TRIGGER trg_assets_updated BEFORE UPDATE ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_type public.bill_type NOT NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  bill_number TEXT,
  invoice_date DATE,
  po_number TEXT,
  internal_bill_number TEXT,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  exempted_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  transportation NUMERIC(14,2) NOT NULL DEFAULT 0,
  other_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  final_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.bill_status NOT NULL DEFAULT 'draft',
  attachment_url TEXT,
  extracted_json JSONB,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bills TO anon, authenticated;
GRANT ALL ON public.bills TO service_role;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_bills_type ON public.bills (bill_type);
CREATE INDEX idx_bills_vendor ON public.bills (vendor_id);
CREATE INDEX idx_bills_status ON public.bills (status);
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  sno INT NOT NULL DEFAULT 1,
  ref_type public.line_ref_type,
  ref_id UUID,
  code TEXT,
  name TEXT NOT NULL,
  uom TEXT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  per_unit NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  lot_number TEXT,
  expiry_date DATE,
  line_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bill_lines TO anon, authenticated;
GRANT ALL ON public.bill_lines TO service_role;
ALTER TABLE public.bill_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public all bill_lines" ON public.bill_lines FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_bill_lines_bill ON public.bill_lines (bill_id);
