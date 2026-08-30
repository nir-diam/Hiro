-- Journal + audit catalog rows for canonicalCandidateId link / unlink.
INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'מועמד',
  'קישור פרופיל',
  'פרופיל "{name}" קושר לפרופיל הראשי "{primaryName}" על ידי {actor}.',
  true, false, false, '#000000', '#dbeafe', 25
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'מועמד' AND e."eventName" = 'קישור פרופיל'
);

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'מועמד',
  'ניתוק פרופיל',
  'פרופיל "{name}" נותק מהפרופיל הראשי "{primaryName}" על ידי {actor}.',
  true, false, false, '#000000', '#fee2e2', 26
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'מועמד' AND e."eventName" = 'ניתוק פרופיל'
);
