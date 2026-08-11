CREATE TABLE IF NOT EXISTS candidate_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_pipelines_client
  ON candidate_pipelines (client_id, sort_index);

CREATE TABLE IF NOT EXISTS candidate_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES candidate_pipelines(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(120) NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
  sort_index INTEGER NOT NULL DEFAULT 0,
  sla_limit INTEGER NOT NULL DEFAULT 0,
  outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_pipeline_stages_pipeline
  ON candidate_pipeline_stages (pipeline_id, sort_index);

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "candidatePipelineId" UUID NULL,
  ADD COLUMN IF NOT EXISTS "pipelineStageId" UUID NULL;
