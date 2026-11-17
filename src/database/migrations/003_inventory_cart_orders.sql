
-- =====================================================
-- CP-04: INVENTORY + CART + ORDERS
-- =====================================================
-- Apply using the CP-02 migration runner.
-- WHY: Schema changes are versioned and reproducible.
--
-- IMPORTANT:
-- pending_payment orders HOLD reserved stock.
-- Payment success will consume that reservation in CP-05.
-- Cancellation releases it.

-- -----------------------------------------------------
-- INVENTORY
-- -----------------------------------------------------

CREATE TABLE inventory (
    -- One inventory record per product.
    product_id UUID PRIMARY KEY
        REFERENCES products(id) ON DELETE RESTRICT,

    -- Physical quantity owned by the business.
    on_hand INTEGER NOT NULL DEFAULT 0
        CHECK (on_hand >= 0),

    -- Quantity already committed to pending orders.
    reserved INTEGER NOT NULL DEFAULT 0
        CHECK (reserved >= 0),

    -- Final safety rule.
    -- WITHOUT THIS: Bugs/direct SQL could make
    -- reserved inventory exceed physical stock.
    CONSTRAINT inventory_stock_valid
        CHECK (reserved <= on_hand),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------
-- SHOPPING CART
-- -----------------------------------------------------

CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- A customer has one active cart in this version.
    user_id UUID NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cart_items (
    cart_id UUID NOT NULL
        REFERENCES carts(id) ON DELETE CASCADE,

    product_id UUID NOT NULL
        REFERENCES products(id) ON DELETE RESTRICT,

    quantity INTEGER NOT NULL
        CHECK (quantity BETWEEN 1 AND 100),

    -- Same product cannot appear twice in one cart.
    PRIMARY KEY (cart_id, product_id)
);

-- -----------------------------------------------------
-- ORDERS
-- -----------------------------------------------------

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    -- Client-generated unique key per checkout attempt.
    -- Same user + same key cannot create another order.
    idempotency_key UUID NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending_payment'
        CHECK (
          status IN (
            'pending_payment',
            'paid',
            'cancelled'
          )
        ),

    currency_code TEXT NOT NULL DEFAULT 'INR'
        CHECK (currency_code = 'INR'),

    -- Sum of item snapshots, in paise.
    -- BIGINT avoids floating-point pricing errors.
    total_minor BIGINT NOT NULL
        CHECK (total_minor >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT orders_user_idempotency_unique
        UNIQUE (user_id, idempotency_key)
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID NOT NULL
        REFERENCES orders(id) ON DELETE RESTRICT,

    product_id UUID NOT NULL
        REFERENCES products(id) ON DELETE RESTRICT,

    -- Snapshots preserve purchased information even
    -- if catalog name/price changes later.
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,

    quantity INTEGER NOT NULL CHECK (quantity > 0),

    unit_price_minor BIGINT NOT NULL
        CHECK (unit_price_minor >= 0),

    line_total_minor BIGINT NOT NULL
        CHECK (line_total_minor >= 0),

    UNIQUE (order_id, product_id)
);

-- -----------------------------------------------------
-- STOCK AUDIT TRAIL
-- -----------------------------------------------------

CREATE TABLE inventory_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    product_id UUID NOT NULL
        REFERENCES products(id) ON DELETE RESTRICT,

    order_id UUID
        REFERENCES orders(id) ON DELETE RESTRICT,

    -- Positive: stock increased.
    -- Negative: stock decreased.
    delta_on_hand INTEGER NOT NULL DEFAULT 0,

    -- Positive: reservation created.
    -- Negative: reservation released/consumed.
    delta_reserved INTEGER NOT NULL DEFAULT 0,

    reason TEXT NOT NULL
        CHECK (
          reason IN (
            'stock_adjustment',
            'order_reserved',
            'order_cancelled',
            'order_fulfilled'
          )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Each movement must actually change something.
    CHECK (
      delta_on_hand <> 0 OR delta_reserved <> 0
    )
);

-- -----------------------------------------------------
-- QUERY INDEXES
-- -----------------------------------------------------

-- Customer order history, newest first.
CREATE INDEX orders_user_recent_idx
ON orders (user_id, created_at DESC, id DESC);

-- Efficiently load all items of an order.
CREATE INDEX order_items_order_idx
ON order_items (order_id);

-- Efficiently load a customer's cart items.
CREATE INDEX cart_items_product_idx
ON cart_items (product_id);

-- Stock movement history for audit/diagnostics.
CREATE INDEX inventory_movements_product_recent_idx
ON inventory_movements (product_id, created_at DESC);

-- Partial index useful for future payment-expiry workers.
CREATE INDEX orders_pending_payment_idx
ON orders (created_at)
WHERE status = 'pending_payment';
