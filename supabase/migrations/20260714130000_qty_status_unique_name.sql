-- ============================================================
-- Migration: Add qty, status, new columns + UNIQUE on names
-- Items: qty, selling_price, reorder_level, warehouse, status
-- Fixed Assets: qty, purchase_date, purchase_cost, total_cost,
--               depreciation_method, status
-- ============================================================

-- ── ITEMS ────────────────────────────────────────────────────
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS qty NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warehouse TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

-- ── FIXED ASSETS ─────────────────────────────────────────────
ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_date DATE,
  ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_method TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

-- ── UNIQUE CONSTRAINTS ON NAMES ──────────────────────────────
ALTER TABLE public.items
  ADD CONSTRAINT unique_item_name UNIQUE (item_name);

ALTER TABLE public.fixed_assets
  ADD CONSTRAINT unique_asset_name UNIQUE (asset_name);
