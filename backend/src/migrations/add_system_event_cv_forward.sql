-- CV auto-forward audit events.

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'דיוור ודיווח',
  'שיגור קו״ח לנמען נוסף',
  'שוגרו קורות חיים למשרה {jobTitle} · אל: {to} · נושא: {subject}',
  true,
  true,
  true,
  '#000000',
  '#dbeafe',
  22
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'דיוור ודיווח' AND e."eventName" = 'שיגור קו״ח לנמען נוסף'
);

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'דיוור ודיווח',
  'כשל בשיגור קו״ח לנמען נוסף',
  'כשל בשיגור קורות חיים · משרה: {jobTitle} · נמען: {to} · סיבה: {error}',
  true,
  true,
  true,
  '#000000',
  '#fee2e2',
  23
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'דיוור ודיווח' AND e."eventName" = 'כשל בשיגור קו״ח לנמען נוסף'
);
