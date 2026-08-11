-- System event: candidate approved their portal profile (approveByCandidate).
INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'מועמד',
  'אישר את הפרופיל',
  'מועמד {name} אישר/ה את הפרופיל בפורטל המועמדים.',
  true, false, false, '#000000', '#dcfce7', 23
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'מועמד' AND e."eventName" = 'אישר את הפרופיל'
);
