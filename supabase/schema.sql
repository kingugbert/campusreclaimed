-- ============================================
-- Donation Inventory Management System Schema
-- ============================================

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    donor_name VARCHAR(255) NOT NULL,
    donor_email VARCHAR(255),
    address TEXT NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    date_accepted DATE NOT NULL,
    item_description TEXT NOT NULL,
    storage_location VARCHAR(255) NOT NULL,
    item_image_url TEXT,
    notification_sent TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public)
VALUES ('inventory', 'inventory', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS (Row Level Security) policies
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Allow public to insert (restrict in production with auth)
CREATE POLICY "Allow public insert" ON inventory_items
    FOR INSERT TO anon
    WITH CHECK (true);

-- Allow public to read (restrict in production with auth)
CREATE POLICY "Allow public read" ON inventory_items
    FOR SELECT TO anon
    USING (true);

-- Allow public to update (restrict in production with auth)
CREATE POLICY "Allow public update" ON inventory_items
    FOR UPDATE TO anon
    USING (true);

-- Allow public to delete (restrict in production with auth)
CREATE POLICY "Allow public delete" ON inventory_items
    FOR DELETE TO anon
    USING (true);

-- Storage policies for inventory bucket
CREATE POLICY "Allow public upload" ON storage.objects
    FOR INSERT TO anon
    WITH CHECK (bucket_id = 'inventory');

CREATE POLICY "Allow public read storage" ON storage.objects
    FOR SELECT TO anon
    USING (bucket_id = 'inventory');

CREATE POLICY "Allow public delete storage" ON storage.objects
    FOR DELETE TO anon
    USING (bucket_id = 'inventory');

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE
    ON inventory_items FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Indexes for faster queries
CREATE INDEX idx_inventory_date_accepted ON inventory_items(date_accepted);
CREATE INDEX idx_inventory_notification_sent ON inventory_items(notification_sent);
CREATE INDEX idx_inventory_donor_name ON inventory_items(donor_name);
CREATE INDEX idx_inventory_storage_location ON inventory_items(storage_location);
