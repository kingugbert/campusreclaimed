-- Migration: Category-prefixed SKUs
-- Run in Supabase SQL Editor
-- Creates per-category sequences and updates generate_next_sku() to accept a category argument.
--
-- SKU prefixes:
--   B   = Bedding
--   BK  = Books
--   C   = Clothing
--   F   = Furniture
--   K   = Kitchen
--   O   = Other (catch-all for Electronics, Headboards, Desk & Study, etc.)
--
-- Sequences start at 1 and are independent per category.
-- Existing global sequence (cr_sku_seq) is left in place so old SKUs remain valid.

CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_b  START 1;
CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_bk START 1;
CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_c  START 1;
CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_f  START 1;
CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_k  START 1;
CREATE SEQUENCE IF NOT EXISTS cr_sku_seq_o  START 1;

CREATE OR REPLACE FUNCTION public.generate_next_sku(category TEXT DEFAULT 'Other')
  RETURNS TEXT
  LANGUAGE plpgsql
AS $$
DECLARE
  prefix   TEXT;
  seq_name TEXT;
  next_val BIGINT;
BEGIN
  CASE lower(trim(category))
    WHEN 'bedding'         THEN prefix := 'B';  seq_name := 'cr_sku_seq_b';
    WHEN 'books'           THEN prefix := 'BK'; seq_name := 'cr_sku_seq_bk';
    WHEN 'clothing'        THEN prefix := 'C';  seq_name := 'cr_sku_seq_c';
    WHEN 'furniture'       THEN prefix := 'F';  seq_name := 'cr_sku_seq_f';
    WHEN 'kitchen'         THEN prefix := 'K';  seq_name := 'cr_sku_seq_k';
    ELSE                        prefix := 'O';  seq_name := 'cr_sku_seq_o';
  END CASE;

  EXECUTE 'SELECT nextval($1)' INTO next_val USING seq_name;
  RETURN prefix || '-' || LPAD(next_val::TEXT, 3, '0');
END;
$$;

-- Grant execute to anon and authenticated (same as before)
GRANT EXECUTE ON FUNCTION public.generate_next_sku(TEXT) TO anon, authenticated;
