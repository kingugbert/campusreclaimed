-- Migration: Stage 5 — Cal.com Scheduling Integration
-- Run in Supabase SQL Editor after migration_stage4_commissions.sql
--
-- Adds:
--   ambassador_profiles.calcom_url       — ambassador's personal Cal.com booking link
--   tote_requests.scheduled_at           — timestamp when student booked pickup via Cal.com
--   tote_requests.calcom_booking_uid     — Cal.com booking UID (for cancellation matching)
--   tote_requests.calcom_event_uri       — Cal.com event URI (for reference)

-- 1. Cal.com booking link on each ambassador's profile
ALTER TABLE ambassador_profiles
  ADD COLUMN IF NOT EXISTS calcom_url TEXT;

-- 2. Scheduled pickup tracking on tote requests
ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS calcom_booking_uid TEXT;

ALTER TABLE tote_requests
  ADD COLUMN IF NOT EXISTS calcom_event_uri TEXT;

-- 3. Index for looking up tote requests by Cal.com booking UID
--    (used by calcom-webhook to find the right request on BOOKING_CANCELLED)
CREATE INDEX IF NOT EXISTS idx_tote_requests_calcom_booking_uid
  ON tote_requests (calcom_booking_uid)
  WHERE calcom_booking_uid IS NOT NULL;
