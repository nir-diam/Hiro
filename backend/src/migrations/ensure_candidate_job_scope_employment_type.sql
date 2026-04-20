-- One-shot: columns + backfill + picklists for candidate "היקף משרה" (jobScopes) and "סוג תעסוקה רצוי" (employmentTypes).
-- Picklist keys must match frontend: job_scope, employment_type
-- Idempotent.

-- --- Columns (candidates) ---
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "employmentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "jobScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill arrays from legacy single-value columns
UPDATE candidates c
SET
  "employmentTypes" = ARRAY[TRIM(c."employmentType")]
WHERE COALESCE(array_length(c."employmentTypes", 1), 0) = 0
  AND c."employmentType" IS NOT NULL
  AND TRIM(c."employmentType") <> '';

UPDATE candidates c
SET
  "jobScopes" = ARRAY[TRIM(c."jobScope")]
WHERE COALESCE(array_length(c."jobScopes", 1), 0) = 0
  AND c."jobScope" IS NOT NULL
  AND TRIM(c."jobScope") <> '';

-- --- Picklist: employment_type (סוג תעסוקה רצוי) ---
INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'סוג תעסוקה', 'employment_type', 'סוג תעסוקה רצוי (מועמדים)', 'candidates', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'employment_type');

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('שכיר', 'שכיר', 0),
  ('עצמאי', 'עצמאי', 10),
  ('קבלן', 'קבלן', 20),
  ('שכיר / קבלן', 'שכיר / קבלן', 30)
) AS v(label, value, ord)
WHERE c.key = 'employment_type'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );

-- --- Picklist: job_scope (היקף משרה) ---
INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'היקף משרה', 'job_scope', 'היקף משרה (מועמדים / משרות)', 'jobs', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'job_scope');

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('מלאה', 'מלאה', 0),
  ('משמרות', 'משמרות', 10),
  ('זמנית', 'זמנית', 20)
) AS v(label, value, ord)
WHERE c.key = 'job_scope'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );
