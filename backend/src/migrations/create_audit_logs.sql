-- Audit / system event log. Backs the AdminEventsView screen.
-- Stores one row per noteworthy action: login, create/update/delete, export, system error.
-- Filterable columns are flat; freeform context lives in JSONB blobs.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  action VARCHAR(32) NOT NULL DEFAULT 'system',
  description TEXT NOT NULL DEFAULT '',

  -- Actor
  "userId" UUID,
  "userName" VARCHAR(255),
  "userEmail" VARCHAR(255),
  "userRole" VARCHAR(64),
  "userIp" VARCHAR(64),
  "userAvatar" VARCHAR(8),

  -- Linked entity (optional)
  "entityType" VARCHAR(64),
  "entityId" VARCHAR(128),
  "entityName" VARCHAR(255),

  -- Free-form context
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  changes  JSONB NOT NULL DEFAULT '[]'::jsonb,

  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp  ON audit_logs ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level      ON audit_logs (level);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs ("userEmail");
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity     ON audit_logs ("entityType", "entityId");

-- Enforce sane values without locking us into an ENUM that's hard to alter later.
DO $$ BEGIN
  ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_level_chk
      CHECK (level IN ('info','warning','error','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_action_chk
      CHECK (action IN ('create','update','delete','login','export','system'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
