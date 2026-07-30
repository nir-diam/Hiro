-- Organization contacts (Admin companies DB / מאגר חברות)
CREATE TABLE IF NOT EXISTS organization_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL DEFAULT '',
  last_name VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(255) NULL DEFAULT '',
  office_phone VARCHAR(255) NULL DEFAULT '',
  mobile VARCHAR(255) NULL DEFAULT '',
  website VARCHAR(255) NULL DEFAULT '',
  linkedin VARCHAR(255) NULL DEFAULT '',
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_contacts_org
  ON organization_contacts (organization_id, sort_index);
