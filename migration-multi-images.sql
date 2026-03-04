-- migration-multi-images.sql
-- Adds support for 2-4 images per donation item
-- Run in Supabase SQL Editor after previous migrations

-- ── New table: item_images ──
CREATE TABLE IF NOT EXISTS item_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES donation_items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by item
CREATE INDEX IF NOT EXISTS idx_item_images_item_id ON item_images(item_id);

-- ── Migrate existing single images ──
-- Move any existing item_image_url values into the new table
INSERT INTO item_images (item_id, image_url, display_order)
SELECT id, item_image_url, 0
FROM donation_items
WHERE item_image_url IS NOT NULL AND item_image_url != '';

-- ── RLS policies ──
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything
CREATE POLICY "auth_all_item_images"
  ON item_images FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Service role (for Edge Functions / webhooks)
CREATE POLICY "service_all_item_images"
  ON item_images FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Update storage policies for multiple uploads ──
-- (These should already exist from migration-auth.sql, but ensure they're present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Auth upload inventory images'
  ) THEN
    CREATE POLICY "Auth upload inventory images"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'inventory');
  END IF;
END
$$;
