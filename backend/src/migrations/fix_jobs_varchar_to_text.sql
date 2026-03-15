-- Fix "value too long for type character varying(255)" on job update.
-- description, internalNotes, location: VARCHAR(255) -> TEXT
-- requirements: VARCHAR(255)[] -> TEXT[] (each requirement string can be long)
-- Run against your PostgreSQL DB. Use double-quoted camelCase names.

ALTER TABLE jobs ALTER COLUMN "description" TYPE TEXT;
ALTER TABLE jobs ALTER COLUMN "internalNotes" TYPE TEXT;
ALTER TABLE jobs ALTER COLUMN "location" TYPE TEXT;
ALTER TABLE jobs ALTER COLUMN "requirements" TYPE TEXT[] USING "requirements"::TEXT[];
