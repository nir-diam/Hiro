-- Optional: catalog row for staff “open WhatsApp” from SendMessageModal.
-- Run after create_system_events.sql. Safe to re-run.

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'תקשורת צוות',
  'פתיחת WhatsApp',
  'נפתח קישור WhatsApp למועמד {name} · טלפון {phoneDisplay}. תצוגת הודעה: {messagePreview}',
  true,
  false,
  false,
  '#000000',
  '#dcfce7',
  22
WHERE NOT EXISTS (
  SELECT 1
  FROM system_events e
  WHERE e."triggerName" = 'תקשורת צוות'
    AND e."eventName" = 'פתיחת WhatsApp'
);
