-- Staff outbound email (SendMessageModal / journal "נשלח מייל").

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'דיוור ודיווח',
  'נשלח מייל',
  'נשלח מייל · נושא: {subject} · אל: {to} · מאת: {from}{candidateName}{message}',
  true,
  true,
  true,
  '#000000',
  '#dcfce7',
  21
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'דיוור ודיווח' AND e."eventName" = 'נשלח מייל'
);
