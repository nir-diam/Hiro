-- Scope client tasks to pending (staging) organizations before admin approval.
ALTER TABLE client_tasks
  ADD COLUMN IF NOT EXISTS "organizationTmpId" UUID NULL REFERENCES organizations_tmp(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_tasks_org_tmp
  ON client_tasks ("organizationTmpId")
  WHERE "organizationTmpId" IS NOT NULL;
