-- ============================================================
-- Campus Reclaimed — Shopify Sync Schema Update
-- ============================================================
-- Run this AFTER the original migration.sql
-- Adds columns to support item lifecycle and Shopify integration
-- ============================================================

-- Item lifecycle status
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_storage';
-- Valid values: 'in_storage', 'listed', 'sold', 'claimed', 'removed'

-- Shopify product ID (links to Shopify when published)
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS shopify_product_id TEXT;

-- Shopify variant ID (needed for inventory/order matching)
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;

-- Price set by staff when publishing to store
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);

-- Timestamp when item was sold via Shopify
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Shopify order ID for reference
ALTER TABLE donation_items
  ADD COLUMN IF NOT EXISTS shopify_order_id TEXT;

-- Index for status filtering (used heavily in inventory views)
CREATE INDEX IF NOT EXISTS idx_donation_items_status
  ON donation_items(status);

-- Index for Shopify product lookup (used by webhook handler)
CREATE INDEX IF NOT EXISTS idx_donation_items_shopify_product
  ON donation_items(shopify_product_id);

CREATE INDEX IF NOT EXISTS idx_donation_items_shopify_variant
  ON donation_items(shopify_variant_id);

-- ============================================================
-- Webhook log table — tracks all Shopify webhook events
-- Useful for debugging and audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS shopify_webhook_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic       TEXT NOT NULL,          -- e.g. 'orders/paid'
  shopify_id  TEXT,                   -- order or product ID
  payload     JSONB,                  -- full webhook payload
  processed   BOOLEAN DEFAULT false,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE POLICY "Allow all on shopify_webhook_log"
  ON shopify_webhook_log FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE shopify_webhook_log ENABLE ROW LEVEL SECURITY;
