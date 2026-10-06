-- Multiple job taxonomy selections per job (primary field/role remain on jobs.field / jobs.role)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS "jobFields" JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs."jobFields" IS 'Array of { category, fieldType, role, categoryId?, clusterId?, roleId? }';
