-- NEXORA Development Seed Data
-- DO NOT USE IN PRODUCTION
-- Run after migrations in dev environment only.
-- Admin accounts are created via the bootstrap-owner script.
-- This seed only inserts non-sensitive reference data.

-- Insert some system config defaults
INSERT INTO system_config (key, value, updated_at)
VALUES
  ('maintenance_mode', 'false', NOW()),
  ('max_trial_per_ip', '3', NOW()),
  ('license_check_interval_ms', '3600000', NOW())
ON CONFLICT (key) DO NOTHING;
