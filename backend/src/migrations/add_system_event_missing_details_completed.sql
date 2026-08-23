INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'שלמות נתוני מועמד',
  'השלמת פרטים חסרים',
  'מועמד {name}: הושלמו פרטים שהיו חסרים ({fields}) על ידי {actor}.',
  true, false, false, '#000000', '#ecfccb', 24
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'שלמות נתוני מועמד'
    AND e."eventName" = 'השלמת פרטים חסרים'
);
