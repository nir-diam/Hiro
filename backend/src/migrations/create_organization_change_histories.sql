CREATE TABLE IF NOT EXISTS organization_change_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL DEFAULT 'update',
  actor VARCHAR(255) NOT NULL DEFAULT 'system',
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_change_histories_org_id
  ON organization_change_histories (organization_id, created_at DESC);
