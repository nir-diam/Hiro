-- =============================================================================
-- Run this FIRST if you get: relation "message_templates" does not exist
-- Requires existing tables: public.clients, public.users (for FKs)
-- Timestamps use snake_case to match Sequelize model (underscored: true)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE "enum_message_templates_scope" AS ENUM ('admin', 'client');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope "enum_message_templates_scope" NOT NULL,
  client_id UUID NULL REFERENCES clients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  template_key VARCHAR(128) NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  updated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_templates_client_scope_chk CHECK (
    (scope = 'admin' AND client_id IS NULL)
    OR (scope = 'client' AND client_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_message_templates_scope_client ON message_templates(scope, client_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_message_templates_admin_key
  ON message_templates(template_key)
  WHERE scope = 'admin' AND template_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_message_templates_client_key
  ON message_templates(client_id, template_key)
  WHERE scope = 'client' AND template_key IS NOT NULL;
