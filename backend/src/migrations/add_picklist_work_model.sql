-- Picklist for candidate "מודל עבודה מועדף" (preferredWorkModels). Key: work_model. Idempotent.

INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'מודל עבודה', 'work_model', 'מודל עבודה מועדף (בית / היברידי / משרד)', 'candidates', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'work_model');

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('בית', 'בית', 0),
  ('היברידי', 'היברידי', 10),
  ('משרד', 'משרד', 20)
) AS v(label, value, ord)
WHERE c.key = 'work_model'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );
