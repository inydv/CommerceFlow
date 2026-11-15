
-- Inventory for this learning experiment only.
CREATE TABLE IF NOT EXISTS inventory_demo (
  product_id UUID PRIMARY KEY
    REFERENCES products(id),

  -- Total physical units.
  on_hand INTEGER NOT NULL DEFAULT 0
    CHECK (on_hand >= 0),

  -- Units temporarily held for checkout.
  reserved INTEGER NOT NULL DEFAULT 0
    CHECK (reserved >= 0),

  -- We cannot reserve more than physical inventory.
  CONSTRAINT valid_inventory
    CHECK (reserved <= on_hand)
);

-- Track every temporary stock reservation.
CREATE TABLE IF NOT EXISTS inventory_reservations_demo (
  id UUID PRIMARY KEY,

  product_id UUID NOT NULL
    REFERENCES inventory_demo(product_id),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'CONFIRMED', 'RELEASED')),

  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_product
ON inventory_reservations_demo(product_id);
