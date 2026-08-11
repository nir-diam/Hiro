-- Event type for candidate self-approval journal entries (portal profile).
INSERT INTO event_types (
  "isActive", name, "textColor", "bgColor", "forCandidate", "forJob", "forClient", "sortOrder"
)
SELECT
  true,
  'אישור הפרופיל על ידי המועמד',
  '#1d4ed8',
  '#dbeafe',
  true,
  false,
  false,
  90
WHERE NOT EXISTS (
  SELECT 1 FROM event_types WHERE name = 'אישור הפרופיל על ידי המועמד'
);
