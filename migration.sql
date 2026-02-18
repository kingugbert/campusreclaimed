-- ============================================================
-- Campus Reclaimed — Normalized Schema Migration
-- ============================================================
-- Replaces the single "inventory_items" table with three tables:
--   donors          → persistent donor accounts
--   donations       → each donation session / visit
--   donation_items  → individual items within a donation
-- ============================================================

-- 1. DONORS — one row per unique person
CREATE TABLE IF NOT EXISTS donors (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_name    TEXT        NOT NULL,
  donor_email   TEXT,
  address       TEXT        NOT NULL,
  phone_number  TEXT        NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. DONATIONS — each time a donor brings items in
CREATE TABLE IF NOT EXISTS donations (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donor_id       UUID        NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  date_accepted  DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. DONATION_ITEMS — individual items within a donation
CREATE TABLE IF NOT EXISTS donation_items (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  donation_id       UUID        NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
  item_description  TEXT        NOT NULL,
  storage_location  TEXT        NOT NULL,
  item_image_url    TEXT,
  notification_sent TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_donations_donor     ON donations(donor_id);
CREATE INDEX IF NOT EXISTS idx_donation_items_don  ON donation_items(donation_id);
CREATE INDEX IF NOT EXISTS idx_donors_name         ON donors(donor_name);
CREATE INDEX IF NOT EXISTS idx_donors_email        ON donors(donor_email);

-- Auto-update updated_at on donors
CREATE OR REPLACE FUNCTION update_donors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_donors_updated ON donors;
CREATE TRIGGER trg_donors_updated
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION update_donors_updated_at();

-- Enable RLS (adjust policies to suit your auth setup)
ALTER TABLE donors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_items ENABLE ROW LEVEL SECURITY;

-- Open policies (for anon/service role — tighten for production)
CREATE POLICY "Allow all on donors"         ON donors         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on donations"      ON donations      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on donation_items" ON donation_items  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Optional: Migrate existing data from inventory_items
-- Uncomment and run ONCE if you have existing data.
-- ============================================================
/*
-- Step A: Create donor rows (deduplicated by name + phone)
INSERT INTO donors (donor_name, donor_email, address, phone_number, created_at)
SELECT DISTINCT ON (donor_name, phone_number)
  donor_name, donor_email, address, phone_number, MIN(created_at)
FROM inventory_items
GROUP BY donor_name, phone_number, donor_email, address;

-- Step B: Create donation rows (one per original item for simplicity)
INSERT INTO donations (donor_id, date_accepted, created_at)
SELECT d.id, i.date_accepted, i.created_at
FROM inventory_items i
JOIN donors d ON d.donor_name = i.donor_name AND d.phone_number = i.phone_number;

-- Step C: Create donation_item rows
INSERT INTO donation_items (donation_id, item_description, storage_location, item_image_url, notification_sent, created_at)
SELECT dn.id, i.item_description, i.storage_location, i.item_image_url, i.notification_sent, i.created_at
FROM inventory_items i
JOIN donors d ON d.donor_name = i.donor_name AND d.phone_number = i.phone_number
JOIN donations dn ON dn.donor_id = d.id AND dn.date_accepted = i.date_accepted;
*/
