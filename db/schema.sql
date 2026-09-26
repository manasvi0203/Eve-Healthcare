-- EVE Healthcare - Diagnostic Bookings & Payments
-- Plain, hand-written SQL schema (no ORM). Safe to re-run (IF NOT EXISTS everywhere).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    full_name       TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Diagnostic centres & the tests they offer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnostic_centres (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    location        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_centres_location ON diagnostic_centres (location);

CREATE TABLE IF NOT EXISTS diagnostic_tests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centre_id       UUID NOT NULL REFERENCES diagnostic_centres(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price           NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The same centre shouldn't list the same test name twice.
    UNIQUE (centre_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tests_centre_id ON diagnostic_tests (centre_id);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS bookings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    test_id                 UUID NOT NULL REFERENCES diagnostic_tests(id),
    centre_id               UUID NOT NULL REFERENCES diagnostic_centres(id),
    appointment_datetime    TIMESTAMPTZ NOT NULL,
    -- Snapshot of the test's price at booking time, so a later price change
    -- at the centre never rewrites what an existing booking is expected to pay.
    amount                  NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    status                  booking_status NOT NULL DEFAULT 'PENDING',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings (user_id, status);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount                  NUMERIC(10, 2) NOT NULL,
    status                  payment_status NOT NULL DEFAULT 'PENDING',
    -- The (simulated) payment provider's id for this transaction attempt.
    -- Unique so the same provider transaction can never be recorded twice,
    -- which is what makes the webhook idempotent.
    provider_reference      TEXT NOT NULL UNIQUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id);

-- ---------------------------------------------------------------------------
-- Webhook events ledger (idempotency for POST /payments/webhook/)
-- ---------------------------------------------------------------------------
-- Every inbound webhook delivery carries a unique event_id from the provider.
-- We record it here, inside the SAME transaction that applies its effect, so
-- a replayed delivery (same event_id) is rejected by the UNIQUE constraint
-- before any booking/payment row is touched a second time.
CREATE TABLE IF NOT EXISTS webhook_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        TEXT NOT NULL UNIQUE,
    payload         JSONB,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
