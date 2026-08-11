-- Optional: add candidate portal magic link placeholder to welcome_email templates.
-- If the placeholder is absent, the backend auto-appends a footer when sending welcome mail.

UPDATE message_templates
SET body = body || E'\n\nלהיכנס לאזור האישי שלך וליצור סיסמה:\n{candidate_portal_link}',
    updated_at = NOW()
WHERE name ILIKE 'welcome_email'
  AND body NOT ILIKE '%candidate_portal_link%';
