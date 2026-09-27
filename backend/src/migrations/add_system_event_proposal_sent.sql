-- Proposal template sent to contact (SendMessageModal / journal "נשלחה הצעת מחיר").
-- Catalog label: "הצעת מחיר" (short); journal titles use "נשלחה הצעת מחיר".

INSERT INTO system_events (
  "isActive", "triggerName", "eventName", "contentTemplate",
  "forCandidate", "forJob", "forClient", "textColor", "bgColor", "sortOrder"
)
SELECT
  true,
  'דיוור ודיווח',
  'הצעת מחיר',
  'נשלחה הצעת מחיר · נושא: {subject} · אל: {to} · מאת: {from}{proposalNames}{candidateName}{message}',
  true,
  true,
  true,
  '#000000',
  '#dcfce7',
  22
WHERE NOT EXISTS (
  SELECT 1 FROM system_events e
  WHERE e."triggerName" = 'דיוור ודיווח'
    AND e."eventName" IN ('הצעת מחיר', 'נשלחה הצעת מחיר')
);

-- Align legacy long-form catalog rows with the short filter label.
UPDATE system_events
SET "eventName" = 'הצעת מחיר'
WHERE "triggerName" = 'דיוור ודיווח' AND "eventName" = 'נשלחה הצעת מחיר';
