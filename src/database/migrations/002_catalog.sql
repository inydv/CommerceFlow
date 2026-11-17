
-- =====================================================
-- COMMERCEFLOW CATALOG
-- =====================================================
-- WHAT: Categories aur Products ka persistent schema.
-- WHY: Database itself uniqueness, valid prices aur
-- relationships enforce karegi.
-- WITHOUT CONSTRAINTS: Invalid data scripts/direct SQL
-- se insert ho sakta hai, even if API uses Zod.

CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL
        CHECK (length(btrim(name)) BETWEEN 2 AND 100),

    -- Human-readable URL identifier: mobile-phones.
    -- UNIQUE prevents duplicate category slugs.
    slug TEXT NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

    -- Deactivate category instead of deleting its history.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- SKU is the unique catalog product identifier.
    sku TEXT NOT NULL UNIQUE
        CHECK (sku ~ '^[A-Z0-9_-]{3,64}$'),

    name TEXT NOT NULL
        CHECK (length(btrim(name)) BETWEEN 2 AND 200),

    description TEXT,

    -- Foreign key prevents referencing unknown categories.
    -- RESTRICT protects related products from accidental
    -- physical category deletion.
    category_id UUID NOT NULL
        REFERENCES categories(id) ON DELETE RESTRICT,

    -- Money stored in minor units, e.g. ₹499.99 = 49999.
    -- WHY: Floating-point money precision issues avoid.
    price_minor BIGINT NOT NULL CHECK (price_minor >= 0),

    -- For now, CommerceFlow supports INR only.
    currency_code TEXT NOT NULL DEFAULT 'INR'
        CHECK (currency_code = 'INR'),

    -- Draft isn't public; archived keeps historical record.
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer listing frequently filters active products
-- and sorts newest first.
-- Partial index avoids indexing draft/archived products.
CREATE INDEX products_active_recent_idx
ON products (created_at DESC, id DESC)
WHERE status = 'active';

-- Category-filtered product listing uses category_id
-- as the leading equality condition.
CREATE INDEX products_active_category_recent_idx
ON products (category_id, created_at DESC, id DESC)
WHERE status = 'active';

-- Used for product category FK lookups and joins.
-- Partial index above alone doesn't cover every status.
CREATE INDEX products_category_id_idx
ON products (category_id);
