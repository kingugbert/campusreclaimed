-- ============================================================
-- Campus Reclaimed — Payout Tracking Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- Consignor payout percentage (defaults to 20%)
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS payout_percentage NUMERIC(5, 2) DEFAULT 20;

-- Whether the consignor has been paid
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS payout_paid BOOLEAN DEFAULT false;

-- Date the payout was made
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS payout_paid_date DATE;

-- Index for filtering unpaid consignment payouts
CREATE INDEX IF NOT EXISTS idx_donation_items_payout_paid
  ON donation_items (payout_paid, agreement_type)
  WHERE agreement_type = 'consignment';

-- ============================================================
-- Useful queries:
--
-- All unpaid consignment payouts:
--   SELECT di.item_description, di.shopify_payout,
--          di.payout_percentage,
--          ROUND(di.shopify_payout * di.payout_percentage / 100, 2) AS amount_owed,
--          d.donor_name, d.donor_email,
--          pa.venmo_handle
--   FROM donation_items di
--   JOIN donations don ON di.donation_id = don.id
--   JOIN donors d ON don.donor_id = d.id
--   LEFT JOIN participation_agreements pa
--     ON LOWER(pa.first_name || ' ' || pa.last_name) = LOWER(d.donor_name)
--   WHERE di.status = 'sold'
--   AND di.agreement_type = 'consignment'
--   AND (di.payout_paid IS NULL OR di.payout_paid = false)
--   ORDER BY di.sold_at DESC;
-- ============================================================
