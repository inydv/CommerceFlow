
-- For now, one order contains one product.
-- We'll add multi-product orders later.

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,

    -- An order must reference an existing product.
    product_id UUID NOT NULL REFERENCES products(id),

    quantity INTEGER NOT NULL CHECK (quantity > 0),

    -- Store the price at purchase time.
    -- Future product price changes should not change old orders.
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price > 0),

    total_amount NUMERIC(14, 2) NOT NULL
        CHECK (total_amount > 0),

    status VARCHAR(20) NOT NULL DEFAULT 'PLACED'
        CHECK (status IN ('PLACED', 'CANCELLED')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful when finding orders for a particular product.
CREATE INDEX IF NOT EXISTS idx_orders_product_id
ON orders(product_id);
