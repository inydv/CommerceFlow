
-- Every product starts with version 1.
-- Existing products also receive version 1.
ALTER TABLE products
ADD COLUMN IF NOT EXISTS version INTEGER
NOT NULL DEFAULT 1
CHECK (version > 0);
