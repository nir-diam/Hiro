ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(2048) NULL,
  ADD COLUMN IF NOT EXISTS attachment_file_name VARCHAR(512) NULL,
  ADD COLUMN IF NOT EXISTS attachment_content_type VARCHAR(128) NULL,
  ADD COLUMN IF NOT EXISTS attachment_file_size INTEGER NULL;
