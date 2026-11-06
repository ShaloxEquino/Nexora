-- Migration 002: Audit and performance indexes

CREATE INDEX IF NOT EXISTS idx_licenses_status
  ON licenses(status);

CREATE INDEX IF NOT EXISTS idx_licenses_expires_at
  ON licenses(expires_at);

CREATE INDEX IF NOT EXISTS idx_licenses_customer_id
  ON licenses(customer_id);

CREATE INDEX IF NOT EXISTS idx_licenses_plan
  ON licenses(plan);

CREATE INDEX IF NOT EXISTS idx_devices_license_id
  ON devices(license_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user
  ON sessions(user_kind, user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_events(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_events(actor_kind, actor_id);

CREATE INDEX IF NOT EXISTS idx_security_kind
  ON security_events(kind, created_at DESC);
