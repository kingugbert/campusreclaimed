-- Migration: Stage 4 — Ambassador Commissions
-- Run in Supabase SQL Editor after migration_sku_by_category.sql
--
-- Adds:
--   ambassador_profiles.commission_rate  — default 10 (%)
--   donation_items.ambassador_id         — FK to ambassador_profiles
--   donation_items.ambassador_commission — calculated dollar amount stored on sale
--   donation_items.ambassador_commission_paid        — boolean flag
--   donation_items.ambassador_commission_paid_date   — date when commission was paid out

-- 1. Ambassador commission rate (default 10%)
ALTER TABLE ambassador_profiles
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 10;

-- 2. Link donation_items to the ambassador who added the item
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS ambassador_id UUID REFERENCES ambassador_profiles(id) ON DELETE SET NULL;

-- 3. Calculated commission amount (set by shopify-webhook on sale)
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS ambassador_commission NUMERIC(10,2);

-- 4. Payout tracking
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS ambassador_commission_paid BOOLEAN DEFAULT false;

ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS ambassador_commission_paid_date DATE;

-- 5. Idempotency tracker for monthly-payout-recap email
ALTER TABLE ambassador_profiles
  ADD COLUMN IF NOT EXISTS last_recap_sent_at TIMESTAMPTZ;

-- 6. Index for fast unpaid-commission queries
CREATE INDEX IF NOT EXISTS idx_donation_items_amb_commission_unpaid
  ON donation_items (ambassador_id)
  WHERE ambassador_commission IS NOT NULL
    AND ambassador_commission_paid = false;
