-- Candidate journal event type: identity dedup merge into existing profile.
INSERT INTO event_types (
  "isActive", name, "textColor", "bgColor", "forCandidate", "forJob", "forClient", "sortOrder"
)
SELECT
  true,
  'מיזוג מועמד למועמד קיים',
  '#7c3aed',
  '#ede9fe',
  true,
  false,
  false,
  91
WHERE NOT EXISTS (
  SELECT 1 FROM event_types WHERE name = 'מיזוג מועמד למועמד קיים'
);

INSERT INTO event_types (
  "isActive", name, "textColor", "bgColor", "forCandidate", "forJob", "forClient", "sortOrder"
)
SELECT
  true,
  'קישור פרופיל מועמד',
  '#1d4ed8',
  '#dbeafe',
  true,
  false,
  false,
  92
WHERE NOT EXISTS (
  SELECT 1 FROM event_types WHERE name = 'קישור פרופיל מועמד'
);

INSERT INTO event_types (
  "isActive", name, "textColor", "bgColor", "forCandidate", "forJob", "forClient", "sortOrder"
)
SELECT
  true,
  'ניתוק פרופיל מועמד',
  '#b91c1c',
  '#fee2e2',
  true,
  false,
  false,
  93
WHERE NOT EXISTS (
  SELECT 1 FROM event_types WHERE name = 'ניתוק פרופיל מועמד'
);

-- System event catalog row for identity merge audit feed.
INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'מועמד',
  'מיזוג מועמד למועמד קיים',
  'פרופיל "{name}" מוזג לפרופיל קיים "{primaryName}" על ידי {actor}.',
  true, false, false, '#000000', '#ede9fe', 27
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'מועמד' AND e."eventName" = 'מיזוג מועמד למועמד קיים'
);
