-- Normalize message_templates to snake_case for raw SQL INSERTs and Sequelize underscored.
-- Prerequisite: table must exist. If you get "relation message_templates does not exist",
-- run create_message_templates.sql first (do not run this script on an empty DB).
-- Safe to run multiple times: only renames when the old name exists and the new one does not.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'message_templates'
  ) THEN
    RAISE EXCEPTION 'Table public.message_templates does not exist. Run backend/src/migrations/create_message_templates.sql first.';
  END IF;
END $$;

-- Inspect current column names before/after:
-- SELECT a.attnum, a.attname
-- FROM pg_attribute a
-- JOIN pg_class c ON c.oid = a.attrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname = 'message_templates' AND a.attnum > 0 AND NOT a.attisdropped
-- ORDER BY a.attnum;

DO $$
DECLARE
  mappings text[] := ARRAY[
    'clientId',
    'client_id',
    'templateKey',
    'template_key',
    'isSystem',
    'is_system',
    'updatedByUserId',
    'updated_by_user_id',
    'updatedByName',
    'updated_by_name',
    'createdAt',
    'created_at',
    'updatedAt',
    'updated_at'
  ];
  i int;
  old_nm text;
  new_nm text;
  old_exists boolean;
  new_exists boolean;
  len int;
BEGIN
  len := array_length(mappings, 1);
  i := 1;
  WHILE i <= len LOOP
    old_nm := mappings[i];
    new_nm := mappings[i + 1];
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'message_templates'
        AND a.attname = old_nm
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO old_exists;
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'message_templates'
        AND a.attname = new_nm
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) INTO new_exists;
    IF old_exists AND NOT new_exists THEN
      EXECUTE format('ALTER TABLE public.message_templates RENAME COLUMN %I TO %I', old_nm, new_nm);
      RAISE NOTICE 'Renamed column % -> %', old_nm, new_nm;
    END IF;
    i := i + 2;
  END LOOP;
END $$;
