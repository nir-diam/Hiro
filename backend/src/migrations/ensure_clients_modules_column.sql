-- Tenant feature flags for staff UI (see permissionService MODULE_KEY_TO_PAGE_KEYS).
-- The Sequelize Client model already defines `modules` JSONB; this migration is for DBs created before that column existed.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN clients.modules IS 'Per-tenant module toggles from admin UI; gates page:* permissions for staff (not super_admin).';
