-- Many-to-many: clients <-> organizations (and staged organizations_tmp)
-- Replaces clients.organization_id / clients.organization_tmp_id

CREATE TABLE IF NOT EXISTS client_organization_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  organization_tmp_id UUID REFERENCES organizations_tmp(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_org_link_target_chk CHECK (
    (organization_id IS NOT NULL AND organization_tmp_id IS NULL)
    OR (organization_id IS NULL AND organization_tmp_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_org_link_org
  ON client_organization_links (client_id, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_org_link_tmp
  ON client_organization_links (client_id, organization_tmp_id)
  WHERE organization_tmp_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_org_links_client
  ON client_organization_links (client_id);

CREATE INDEX IF NOT EXISTS idx_client_org_links_org
  ON client_organization_links (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_org_links_tmp
  ON client_organization_links (organization_tmp_id)
  WHERE organization_tmp_id IS NOT NULL;

COMMENT ON TABLE client_organization_links IS 'M:N link between tenant clients and global Organization / staged OrganizationTmp';
COMMENT ON COLUMN client_organization_links.is_primary IS 'Preferred org profile for this client (UI default)';

-- Migrate legacy clients.organization_id / organization_tmp_id only if those columns still exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'organization_id'
  ) THEN
    INSERT INTO client_organization_links (id, client_id, organization_id, is_primary, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, c.organization_id, true, NOW(), NOW()
    FROM clients c
    WHERE c.organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM client_organization_links l
        WHERE l.client_id = c.id AND l.organization_id = c.organization_id
      );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'organization_tmp_id'
  ) THEN
    INSERT INTO client_organization_links (id, client_id, organization_tmp_id, is_primary, created_at, updated_at)
    SELECT gen_random_uuid(), c.id, c.organization_tmp_id, false, NOW(), NOW()
    FROM clients c
    WHERE c.organization_tmp_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM client_organization_links l
        WHERE l.client_id = c.id AND l.organization_tmp_id = c.organization_tmp_id
      );
  END IF;
END $$;

-- Fallback: metadata.organizationId (when legacy columns already dropped)
INSERT INTO client_organization_links (id, client_id, organization_id, is_primary, created_at, updated_at)
SELECT gen_random_uuid(), c.id, (c.metadata->>'organizationId')::uuid, true, NOW(), NOW()
FROM clients c
WHERE c.metadata->>'organizationId' IS NOT NULL
  AND (c.metadata->>'organizationId') ~* '^[0-9a-f-]{36}$'
  AND NOT EXISTS (
    SELECT 1 FROM client_organization_links l
    WHERE l.client_id = c.id
      AND l.organization_id = (c.metadata->>'organizationId')::uuid
  );

-- Ensure id default when table was created by Sequelize sync (no PG default)
ALTER TABLE client_organization_links
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
