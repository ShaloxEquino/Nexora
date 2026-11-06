-- Migration 001: Initial schema
-- Applied inside a transaction by migrate.ts

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------
-- Updated-at trigger function
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------
CREATE TABLE admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('OWNER', 'DEVELOPER')),
  permissions    TEXT[] NOT NULL DEFAULT '{}',
  is_suspended   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admins_email_unique UNIQUE (email)
);

CREATE TRIGGER admins_touch_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      CITEXT,
  is_banned  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_email_unique UNIQUE (email)
);

-- ---------------------------------------------------------------
-- Licenses
-- ---------------------------------------------------------------
CREATE TABLE licenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan                  TEXT NOT NULL CHECK (plan IN ('TRIAL','DAY','3DAY','WEEK','MONTH','LIFE')),
  key_hash              BYTEA NOT NULL,
  status                TEXT NOT NULL DEFAULT 'unused'
                          CHECK (status IN ('unused','active','expired','revoked','suspended')),
  device_limit          INT NOT NULL DEFAULT 1 CHECK (device_limit BETWEEN 1 AND 10),
  activation_policy     TEXT NOT NULL DEFAULT 'on_first_use'
                          CHECK (activation_policy IN ('on_first_use','immediate','scheduled')),
  activation_started_at TIMESTAMPTZ,
  activation_at         TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  revoked_reason        TEXT,
  suspended_at          TIMESTAMPTZ,
  created_by            UUID NOT NULL REFERENCES admins(id),
  customer_id           UUID REFERENCES customers(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT licenses_key_hash_unique UNIQUE (key_hash)
);

CREATE TRIGGER licenses_touch_updated_at
  BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------
CREATE TABLE devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  fingerprint     TEXT,
  user_agent      TEXT,
  ip              INET,
  activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ,
  CONSTRAINT devices_license_device_unique UNIQUE (license_id, device_id)
);

-- ---------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_kind   TEXT NOT NULL CHECK (user_kind IN ('admin', 'customer')),
  user_id     UUID NOT NULL,
  token_hash  BYTEA NOT NULL,
  csrf_token  TEXT NOT NULL,
  user_agent  TEXT,
  ip          INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);

-- ---------------------------------------------------------------
-- Audit events
-- ---------------------------------------------------------------
CREATE TABLE audit_events (
  id          BIGSERIAL PRIMARY KEY,
  actor_kind  TEXT NOT NULL,
  actor_id    UUID,
  action      TEXT NOT NULL,
  target_kind TEXT,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- Security events
-- ---------------------------------------------------------------
CREATE TABLE security_events (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- System config
-- ---------------------------------------------------------------
CREATE TABLE system_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
