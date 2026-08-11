-- Proposal templates (company settings / Document Studio)
CREATE TABLE IF NOT EXISTS proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_client
  ON proposal_templates (client_id, updated_at DESC);

-- Proposals (quotes)
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id UUID NULL REFERENCES client_contacts(id) ON DELETE SET NULL,
  template_id UUID NULL REFERENCES proposal_templates(id) ON DELETE SET NULL,
  number VARCHAR(64) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'ILS',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 17,
  include_vat BOOLEAN NOT NULL DEFAULT true,
  close_probability INTEGER NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  notes TEXT NULL DEFAULT '',
  content_html TEXT NULL DEFAULT '',
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, number)
);

CREATE INDEX IF NOT EXISTS idx_proposals_client
  ON proposals (client_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_contact
  ON proposals (contact_id, date DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals (client_id, status);
