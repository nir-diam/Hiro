-- Ensures picklist key job_scope exists with מלאה / משמרות / זמנית for candidate job scope (multi). Idempotent.

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
