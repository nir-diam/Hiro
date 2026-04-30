-- Per-client recruitment pipeline statuses (חברתי), ordered list with group/color.
CREATE TABLE IF NOT EXISTS recruitment_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  status_group VARCHAR(120) NOT NULL,
  name VARCHAR(500) NOT NULL,
  text_color VARCHAR(32) NOT NULL DEFAULT '#000000',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recruitment_statuses_client_id_idx ON recruitment_statuses(client_id);
CREATE INDEX IF NOT EXISTS recruitment_statuses_client_sort_idx ON recruitment_statuses(client_id, sort_index);

COMMENT ON TABLE recruitment_statuses IS 'Configurable candidate statuses per recruiting client (ordering, grouping, visibility).';
