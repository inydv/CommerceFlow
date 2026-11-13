
-- Create the products table if it does not already exist.
CREATE TABLE IF NOT EXISTS products (
    -- Each product gets a unique UUID from our Node.js application.
    id UUID PRIMARY KEY,

    -- Product information
    name VARCHAR(100) NOT NULL,
    description VARCHAR(1000),

    -- NUMERIC stores decimal values accurately.
    -- We use 12 total digits and 2 digits after the decimal point.
    -- the Node.js pg driver returns PostgreSQL NUMERIC values as strings by default.
    -- This is intentional because automatically converting them to JavaScript numbers could lose precision.
    price NUMERIC(12, 2) NOT NULL CHECK (price > 0),

    -- A product can have zero stock, but never negative stock.
    stock INTEGER NOT NULL CHECK (stock >= 0),

    category VARCHAR(50) NOT NULL,

    -- PostgreSQL automatically sets these when a row is created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
