-- PicklistCategory.key = 'mobility' | 'driving_license' (Candidate profile + cv_parsing LLM).
-- Run once. Idempotent.

INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'ניידות', 'mobility', 'ניידות מועמד (מועמדים)', 'candidates', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'mobility');

INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'רישיון נהיגה', 'driving_license', 'רישיון נהיגה (מועמדים)', 'candidates', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'driving_license');

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('-', '-', 0),
  ('כן', 'כן', 10),
  ('לא', 'לא', 20),
  ('בעל/ת רכב', 'בעל/ת רכב', 30)
) AS v(label, value, ord)
WHERE c.key = 'mobility'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('ללא', '-', 0),
  ('A (אופנוע)', 'A', 10),
  ('A1', 'A1', 20),
  ('A2', 'A2', 30),
  ('B (רכב פרטי)', 'B', 40),
  ('C (משאית)', 'C', 50),
  ('C1', 'C1', 60),
  ('D (אוטובוס)', 'D', 70),
  ('D1', 'D1', 80),
  ('E (גורר)', 'E', 90),
  ('1 (טרקטור)', '1', 100)
) AS v(label, value, ord)
WHERE c.key = 'driving_license'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );
