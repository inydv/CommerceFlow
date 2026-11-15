
-- Track which logical request created which order.
CREATE TABLE IF NOT EXISTS idempotency_demo (
  idempotency_key VARCHAR(100) PRIMARY KEY,

  -- Hash of the request body.
  -- Prevents using one key for two different orders.
  request_hash VARCHAR(64) NOT NULL,

  -- The order created by the first successful attempt.
  order_id UUID NOT NULL UNIQUE
    REFERENCES orders_lifecycle_demo(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
