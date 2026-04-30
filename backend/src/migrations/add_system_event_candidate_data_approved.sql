-- System event: CandidateProfile «אישור תיקונים» — transition חסר נתונים → פעיל.
-- Table system_events already has all required columns; no ALTER TABLE is mandatory.
--
-- Optional: one catalog row per (triggerName, eventName) for idempotent upserts:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_system_events_trigger_event_unique
--   ON system_events ("triggerName", "eventName");

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'שלמות נתוני מועמד',
  'אישור תיקונים',
  'מועמד {name}: אושרה השלמת שדות חובה (אישור תיקונים) על ידי {actor}. מעבר מ-{fromStatus} ל-{toStatus}.',
  true,
  false,
  false,
  '#000000',
  '#ecfccb',
  21
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'שלמות נתוני מועמד' AND e."eventName" = 'אישור תיקונים'
);
