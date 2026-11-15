
-- Separate table for learning Order State Machines.
CREATE TABLE IF NOT EXISTS orders_lifecycle_demo (
  id UUID PRIMARY KEY,

  product_id UUID NOT NULL
    REFERENCES inventory_demo(product_id),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (
      status IN (
        'PENDING_PAYMENT',
        'CONFIRMED',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Useful for querying orders by status and creation time.
CREATE INDEX IF NOT EXISTS idx_orders_lifecycle_status
ON orders_lifecycle_demo(status, created_at DESC);
