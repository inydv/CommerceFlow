
-- Users and refresh sessions for CommerceFlow.
-- Passwords plaintext mein kabhi store nahi karenge.
-- PostgreSQL constraints final integrity layer hain.

CREATE TABLE users (
    -- UUID har user ko stable unique identity deta hai.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- trim() app layer mein hoga; DB bhi blank name reject karegi.
    full_name TEXT NOT NULL
        CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),

    -- Email normalized lowercase form mein store hogi.
    email TEXT NOT NULL
        CHECK (length(email) BETWEEN 3 AND 254),

    -- Argon2id password hash; actual password nahi.
    password_hash TEXT NOT NULL,

    -- Public registration se admin role kabhi accept nahi karenge.
    role TEXT NOT NULL DEFAULT 'customer'
        CHECK (role IN ('customer', 'admin')),

    -- Disabled users authentication access lose karenge.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive email uniqueness.
-- WHY: User@Example.com and user@example.com
-- separate accounts nahi banne chahiye.
CREATE UNIQUE INDEX users_email_unique
ON users (lower(email));


CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Same login/rotation chain ko ek family ID milegi.
    -- WHY: Old rotated token reuse ho toh related
    -- refresh sessions revoke kar sakenge.
    family_id UUID NOT NULL,

    user_id UUID NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    -- Plain refresh token database mein nahi rakhenge.
    -- WHY: Database leak se raw refresh tokens expose na hon.
    token_hash TEXT NOT NULL UNIQUE,

    expires_at TIMESTAMPTZ NOT NULL,

    -- Previous token rotate hua ya nahi.
    rotated_at TIMESTAMPTZ,

    -- Logout/replay ke baad session invalid ho sakti hai.
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Family revoke karte waqt related sessions efficiently find hon.
CREATE INDEX refresh_sessions_family_idx
ON refresh_sessions (family_id);

-- User ke sessions list/revoke karna future mein useful hoga.
CREATE INDEX refresh_sessions_user_idx
ON refresh_sessions (user_id);
