-- Align system_events catalog with portal journal type «אישור הפרופיל על ידי המועמד».
UPDATE system_events
SET
  "eventName" = 'אישור הפרופיל על ידי המועמד',
  "contentTemplate" = COALESCE(NULLIF(TRIM("contentTemplate"), ''), 'מועמד {name} אישר/ה את הפרופיל בפורטל המועמדים.')
WHERE "triggerName" = 'מועמד'
  AND "eventName" IN ('אישר את הפרופיל', 'אישור הפרופיל על ידי המועמד');

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'מועמד',
  'אישור הפרופיל על ידי המועמד',
  'מועמד {name} אישר/ה את הפרופיל בפורטל המועמדים.',
  true, false, false, '#000000', '#dcfce7', 23
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'מועמד'
    AND e."eventName" = 'אישור הפרופיל על ידי המועמד'
);
