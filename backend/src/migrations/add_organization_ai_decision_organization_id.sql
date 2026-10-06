-- Link organization AI decisions to the live Organization record they created or resolved to.

ALTER TABLE organization_ai_decisions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_ai_decisions_organization_id
  ON organization_ai_decisions(organization_id);

-- Backfill from original_term → organizations.name (case-insensitive)
UPDATE organization_ai_decisions d
SET organization_id = o.id
FROM organizations o
WHERE d.organization_id IS NULL
  AND d.ai_decision = 'create_company'
  AND LOWER(TRIM(d.original_term)) = LOWER(TRIM(o.name));
