-- PicklistCategory.key = 'sector' for organization מגזר (AdminCompaniesView).
-- Run once against your Postgres DB. Idempotent.

INSERT INTO "picklist_categories" (id, name, key, description, module, "isSystem", "parentId", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'מגזר', 'sector', 'סוג ארגון / מגזר (חברות)', 'clients', true, NULL, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "picklist_categories" WHERE key = 'sector');

INSERT INTO "picklist_category_values" (
  id, label, value, display_name, color, "isActive", "order", "isSystem",
  "categoryId", "parentCategoryId", "parentValueId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), v.label, v.value, v.label, NULL, true, v.ord, false, c.id, NULL, NULL, NOW(), NOW()
FROM "picklist_categories" c
CROSS JOIN (VALUES
  ('הייטק', 'הייטק', 0),
  ('תעשייה', 'תעשייה', 10),
  ('פיננסים', 'פיננסים', 20),
  ('שירותים', 'שירותים', 30),
  ('מסחר וקמעונאות', 'מסחר וקמעונאות', 40),
  ('אחר (אחזקות ועוד)', 'אחר', 50)
) AS v(label, value, ord)
WHERE c.key = 'sector'
  AND NOT EXISTS (
    SELECT 1 FROM "picklist_category_values" pcv
    WHERE pcv."categoryId" = c.id AND pcv.value = v.value
  );
