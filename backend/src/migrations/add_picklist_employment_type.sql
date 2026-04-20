-- Picklist for candidate "סוג תעסוקה רצוי" (multi-select). Idempotent.

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
