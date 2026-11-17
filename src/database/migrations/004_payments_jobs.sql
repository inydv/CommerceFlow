
-- ======================================================
-- CP-05: PAYMENT / REFUND / OUTBOX
-- ======================================================
-- PostgreSQL is the source of truth.
-- Redis jobs are delivery/processing mechanisms, NOT
-- the authoritative record of a successful payment.

-- Pending orders need an expiry deadline.
-- Old orders get deadline based on their original creation.
ALTER TABLE orders
ADD COLUMN payment_deadline_at TIMESTAMPTZ;

UPDATE orders
SET payment_deadline_at =
    created_at + INTERVAL '15 minutes';

ALTER TABLE orders
ALTER COLUMN payment_deadline_at SET NOT NULL;

-- New orders automatically receive a deadline.
ALTER TABLE orders
ALTER COLUMN payment_deadline_at
SET DEFAULT (NOW() + INTERVAL '15 minutes');

-- Extend existing order states for refund lifecycle.
ALTER TABLE orders
DROP CONSTRAINT orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (
    status IN (
        'pending_payment',
        'paid',
        'cancelled',
        'refund_pending',
        'refunded'
    )
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- One payment intent per order in this implementation.
    -- WHY: Duplicate initiation cannot create two charges.
    order_id UUID NOT NULL UNIQUE
        REFERENCES orders(id) ON DELETE RESTRICT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed', 'expired')),

    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
    currency_code TEXT NOT NULL CHECK (currency_code = 'INR'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- This version supports one full refund per payment.
    payment_id UUID NOT NULL UNIQUE
        REFERENCES payments(id) ON DELETE RESTRICT,

    order_id UUID NOT NULL
        REFERENCES orders(id) ON DELETE RESTRICT,

    amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'succeeded', 'failed')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_webhook_events (
    -- External event ID for webhook deduplication.
    event_id UUID PRIMARY KEY,

    event_type TEXT NOT NULL,

    -- Store only verified, minimal event metadata.
    -- Never store secret headers or raw credentials.
    reference_id UUID NOT NULL,

    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- One logical event should not be inserted repeatedly.
    event_key TEXT NOT NULL UNIQUE,

    event_type TEXT NOT NULL,

    payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Means successfully handed to Redis queue.
    -- Does NOT mean an email/notification was delivered.
    published_at TIMESTAMPTZ
);

-- Small batches of unpublished events can be discovered.
CREATE INDEX outbox_unpublished_idx
ON outbox_events (created_at, id)
WHERE published_at IS NULL;

-- Expiry worker can efficiently discover overdue orders.
CREATE INDEX orders_payment_expiry_idx
ON orders (payment_deadline_at, id)
WHERE status = 'pending_payment';
