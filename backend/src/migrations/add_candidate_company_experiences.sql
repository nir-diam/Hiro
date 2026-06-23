-- Add companyExperiences column to candidates table
-- Stores denormalized array of enriched company experience objects for fast cross-experience filtering
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "companyExperiences" JSONB NOT NULL DEFAULT '[]';

-- GIN index for fast JSONB containment and jsonb_path_query searches
CREATE INDEX IF NOT EXISTS idx_candidates_company_experiences
  ON candidates USING GIN ("companyExperiences");

-- Backfill: derive companyExperiences from existing workExperience JSONB data
UPDATE candidates
SET "companyExperiences" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'company',     COALESCE(exp->>'company', ''),
        'industry',    COALESCE(exp->>'companyIndustry', exp->>'industry', exp->>'companyField', ''),
        'sector',      COALESCE(exp->>'sector', exp->>'companyType', exp->>'orgType', exp->>'type', ''),
        'companySize', COALESCE(exp->>'companySize', exp->>'size', ''),
        'isCurrent',   (exp->>'endDate' IS NULL OR (exp->>'isCurrent')::boolean = true),
        'startDate',   exp->>'startDate',
        'endDate',     exp->>'endDate'
      )
    ) FILTER (WHERE COALESCE(exp->>'company', '') != ''),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof("workExperience") = 'array' THEN "workExperience" ELSE '[]'::jsonb END
  ) AS exp
)
WHERE jsonb_typeof("workExperience") = 'array'
  AND jsonb_array_length("workExperience") > 0;
