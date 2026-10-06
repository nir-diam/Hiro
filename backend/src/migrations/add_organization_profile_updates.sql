CREATE TABLE IF NOT EXISTS organization_profile_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  "organizationId" UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  "previousFields" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "proposedFields" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "submittedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  "submittedByName" TEXT NULL,
  "reviewedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  "reviewedByName" TEXT NULL,
  "reviewedAt" TIMESTAMPTZ NULL,
  "reviewNote" TEXT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_profile_updates_status
  ON organization_profile_updates (status);

CREATE INDEX IF NOT EXISTS idx_org_profile_updates_client_pending
  ON organization_profile_updates ("clientId")
  WHERE status = 'pending';

COMMENT ON TABLE organization_profile_updates IS
  'Client-submitted organization profile field changes awaiting admin approval.';
