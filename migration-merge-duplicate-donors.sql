-- migration-merge-duplicate-donors.sql
-- Merges duplicate donors (same name + email + phone) and adds a unique constraint.
-- Run in Supabase SQL Editor.

-- Step 1: Reassign donations from duplicate donors to the earliest (canonical) donor
WITH dupes AS (
  SELECT
    donor_name,
    donor_email,
    phone_number,
    MIN(created_at) AS first_created,
    COUNT(*) AS cnt
  FROM donors
  GROUP BY LOWER(donor_name), donor_email, phone_number, donor_name
  HAVING COUNT(*) > 1
),
canonical AS (
  SELECT DISTINCT ON (LOWER(d.donor_name), d.donor_email, d.phone_number)
    d.id AS keep_id,
    LOWER(d.donor_name) AS norm_name,
    d.donor_email,
    d.phone_number
  FROM donors d
  JOIN dupes dp
    ON LOWER(d.donor_name) = LOWER(dp.donor_name)
    AND d.donor_email IS NOT DISTINCT FROM dp.donor_email
    AND d.phone_number IS NOT DISTINCT FROM dp.phone_number
  ORDER BY LOWER(d.donor_name), d.donor_email, d.phone_number, d.created_at ASC
)
UPDATE donations
SET donor_id = c.keep_id
FROM donors d
JOIN canonical c
  ON LOWER(d.donor_name) = c.norm_name
  AND d.donor_email IS NOT DISTINCT FROM c.donor_email
  AND d.phone_number IS NOT DISTINCT FROM c.phone_number
  AND d.id != c.keep_id
WHERE donations.donor_id = d.id;

-- Step 2: Delete the now-orphaned duplicate donor rows
WITH canonical AS (
  SELECT DISTINCT ON (LOWER(donor_name), donor_email, phone_number)
    id AS keep_id
  FROM donors
  ORDER BY LOWER(donor_name), donor_email, phone_number, created_at ASC
)
DELETE FROM donors
WHERE id NOT IN (SELECT keep_id FROM canonical);

-- Step 3: Add a unique index to prevent future duplicates at the DB level
-- Uses LOWER(donor_name) for case-insensitive matching
-- Uses COALESCE to handle NULLs consistently
CREATE UNIQUE INDEX IF NOT EXISTS idx_donors_unique_identity
  ON donors (LOWER(donor_name), COALESCE(donor_email, ''), COALESCE(phone_number, ''));
