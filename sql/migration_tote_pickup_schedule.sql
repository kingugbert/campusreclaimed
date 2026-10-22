-- ============================================================
-- Campus Reclaimed — Tote Pickup Schedule Migration
-- Stage 3: adds pickup window tracking to tote_requests
-- Run in Supabase SQL Editor (Project: vkfzeojkxfuehgtwysrn)
-- ============================================================

-- Ambassador-entered pickup time window, e.g. "Thursday, May 7th between 9 a.m. and 12 p.m."
ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS pickup_window TEXT;

-- Timestamp when the pickup schedule email was sent (used by day-of Email 4 automation)
ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS pickup_scheduled_at TIMESTAMPTZ;

-- Idempotency guard: true once Email 4 (day-of reminder) has been sent
ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS pickup_reminder_sent BOOLEAN DEFAULT false;

-- Index for the day-of reminder query: find requests scheduled for today
CREATE INDEX IF NOT EXISTS idx_tote_requests_pickup_scheduled_at
  ON tote_requests (pickup_scheduled_at)
  WHERE status = 'tote_out';
