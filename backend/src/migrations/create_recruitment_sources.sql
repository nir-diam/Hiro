-- Per-client recruitment sources (מקורות גיוס): display name, email/domain hints, exclusivity window.
CREATE TABLE IF NOT EXISTS recruitment_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(500) NOT NULL,
  addresses TEXT NOT NULL DEFAULT '',
  exclusivity_months INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT recruitment_sources_exclusivity_non_negative CHECK (exclusivity_months >= 0),
  CONSTRAINT recruitment_sources_client_name_unique UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS recruitment_sources_client_id_idx ON recruitment_sources(client_id);
CREATE INDEX IF NOT EXISTS recruitment_sources_client_sort_idx ON recruitment_sources(client_id, sort_index);

COMMENT ON TABLE recruitment_sources IS 'Configurable recruitment source labels per client (matching hints for inbound mail, exclusivity months).';
