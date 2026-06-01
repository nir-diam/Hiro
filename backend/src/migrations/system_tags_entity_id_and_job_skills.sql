-- Rename candidate_id → entity_id, add job skill mode, migrate jobs.skills JSONB → system_tags.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_tags' AND column_name = 'candidate_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_tags' AND column_name = 'entity_id'
  ) THEN
    ALTER TABLE system_tags RENAME COLUMN candidate_id TO entity_id;
  END IF;
END $$;

-- entity_id is polymorphic (candidate.id OR job.id per type) — drop legacy FK to candidates only.
ALTER TABLE system_tags DROP CONSTRAINT IF EXISTS candidate_tags_candidate_id_fkey;
ALTER TABLE system_tags DROP CONSTRAINT IF EXISTS system_tags_candidate_id_fkey;
ALTER TABLE system_tags DROP CONSTRAINT IF EXISTS system_tags_entity_id_fkey;

ALTER TABLE system_tags
  ADD COLUMN IF NOT EXISTS mode VARCHAR(20);

-- Replace legacy unique (entity_id, tag_id) with (entity_id, tag_id, type).
ALTER TABLE system_tags DROP CONSTRAINT IF EXISTS candidate_tags_unique;
ALTER TABLE system_tags DROP CONSTRAINT IF EXISTS system_tags_entity_tag_unique;
DROP INDEX IF EXISTS system_tags_entity_id_tag_id_type_key;
ALTER TABLE system_tags
  DROP CONSTRAINT IF EXISTS system_tags_entity_tag_type_unique;
ALTER TABLE system_tags
  ADD CONSTRAINT system_tags_entity_tag_type_unique UNIQUE (entity_id, tag_id, type);

ALTER INDEX IF EXISTS idx_system_tags_candidate_id_active
  RENAME TO idx_system_tags_entity_type_active;

DROP INDEX IF EXISTS idx_system_tags_candidate_type_active;

CREATE INDEX IF NOT EXISTS idx_system_tags_entity_type_active
  ON system_tags (entity_id, type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_system_tags_entity_job
  ON system_tags (entity_id)
  WHERE type = 'job';

-- Migrate jobs.skills JSONB → system_tags (type = job). Deduped; safe to re-run.
INSERT INTO system_tags (
  id,
  name,
  type,
  entity_id,
  tag_id,
  mode,
  raw_type,
  tag_reason,
  quote,
  confidence_score,
  raw_type_reason,
  is_active,
  is_current,
  is_in_summary,
  created_at
)
SELECT DISTINCT ON (j.id, t.id)
  gen_random_uuid(),
  gen_random_uuid(),
  'job',
  j.id,
  t.id,
  NULLIF(trim(elem->>'mode'), ''),
  NULLIF(trim(elem->>'tagType'), ''),
  NULLIF(trim(elem->>'tag_reason'), ''),
  NULLIF(trim(elem->>'quote'), ''),
  CASE
    WHEN elem->>'relevance_score' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (elem->>'relevance_score')::float
    ELSE NULL
  END,
  NULLIF(trim(elem->>'aiMode'), ''),
  COALESCE(
    (t.status IS NOT NULL AND lower(trim(t.status::text)) = 'active'),
    false
  ),
  true,
  false,
  COALESCE(j."openDate", NOW())
FROM jobs j
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(j.skills, '[]'::jsonb)) AS elem
INNER JOIN tags t ON (
  (
    elem->>'id' ~* '^[0-9a-f-]{36}$'
    AND t.id = (elem->>'id')::uuid
  )
  OR lower(trim(COALESCE(t.tag_key, ''))) = lower(trim(COALESCE(NULLIF(elem->>'key', ''), elem->>'name', '')))
  OR lower(trim(COALESCE(t.display_name_he, ''))) = lower(trim(COALESCE(elem->>'name', '')))
  OR lower(trim(COALESCE(t.display_name_en, ''))) = lower(trim(COALESCE(elem->>'name', '')))
)
WHERE jsonb_array_length(COALESCE(j.skills, '[]'::jsonb)) > 0
ORDER BY j.id, t.id, elem ASC
ON CONFLICT (entity_id, tag_id, type) DO NOTHING;
