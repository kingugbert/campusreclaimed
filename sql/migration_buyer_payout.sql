-- ============================================================
-- Campus Reclaimed — Buyer Info & Payout Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Buyer name (from Shopify order billing/customer)
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS buyer_name TEXT;

-- Gross payout from Shopify (what the buyer paid, before any fees)
-- Consignor payout calculation is done separately from this value
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS shopify_payout NUMERIC(10, 2);

-- Index for reporting on payouts
CREATE INDEX IF NOT EXISTS idx_donation_items_shopify_payout
  ON donation_items (shopify_payout)
  WHERE shopify_payout IS NOT NULL;

-- ============================================================
-- Useful queries:
--
-- All sold items with buyer and payout:
--   SELECT di.item_description, di.buyer_name, di.shopify_payout,
--          d.donor_name, di.agreement_type, di.sold_at
--   FROM donation_items di
--   JOIN donations don ON di.donation_id = don.id
--   JOIN donors d ON don.donor_id = d.id
--   WHERE di.status = 'sold'
--   ORDER BY di.sold_at DESC;
--
-- Consignment items sold (payout owed to consignor):
--   SELECT di.item_description, di.buyer_name, di.shopify_payout,
--          d.donor_name, d.donor_email
--   FROM donation_items di
--   JOIN donations don ON di.donation_id = don.id
--   JOIN donors d ON don.donor_id = d.id
--   WHERE di.status = 'sold'
--   AND di.agreement_type = 'consignment'
--   ORDER BY di.sold_at DESC;
-- ============================================================
