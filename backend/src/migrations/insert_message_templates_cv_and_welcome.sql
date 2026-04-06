-- Two starter templates: CV arrival approval (client) + Welcome email (admin).
-- 0) REQUIRED: run create_message_templates.sql first if the table does not exist.
-- 1) If the table exists but columns are camelCase (clientId…), run rename_message_templates_to_snake_case.sql.
-- 2) Replace PASTE_CLIENT_UUID in the first INSERT with a real clients.id (see query at end).

-- CV arrival approval (tenant / client scope)
INSERT INTO message_templates (
  scope,
  client_id,
  template_key,
  name,
  subject,
  body,
  channels,
  is_system,
  updated_by_name,
  created_at,
  updated_at
) VALUES (
  'client',
  'PASTE_CLIENT_UUID'::uuid,
  'cv_arrival_approval',
  'אישור הגעת קורות חיים',
  'קיבלנו את קורות החיים שלך!',
  'היי {candidate_first_name}, קורות החיים שלך למשרת {job_title} התקבלו בהצלחה. ניצור קשר בהמשך במידה ותימצא התאמה. תודה, צוות {company_name}.',
  '["email"]'::jsonb,
  false,
  'seed',
  NOW(),
  NOW()
);

-- Welcome email (Hiro / admin scope — e.g. new coordinators)
INSERT INTO message_templates (
  scope,
  client_id,
  template_key,
  name,
  subject,
  body,
  channels,
  is_system,
  updated_by_name,
  created_at,
  updated_at
) VALUES (
  'admin',
  NULL,
  'welcome_email',
  'Welcome email',
  'ברוך הבא ל-Hiro',
  'שלום {recruiter_name},\n\nחשבון המשתמש שלך נוצר. אפשר להתחבר עם המייל {recruiter_email}.\n\nבברכה,\nצוות Hiro',
  '["email"]'::jsonb,
  false,
  'seed',
  NOW(),
  NOW()
);

-- Pick a client id for the first INSERT:
-- SELECT id, name FROM clients ORDER BY "createdAt" DESC LIMIT 20;
