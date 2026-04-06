-- Add super_admin to users.role (Sequelize + PostgreSQL enum).
--
-- 1) Confirm enum type name:
--    SELECT t.typname
--    FROM pg_type t
--    JOIN pg_enum e ON t.oid = e.enumtypid
--    WHERE e.enumlabel = 'candidate'
--      AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
--    Typical: enum_users_role
--
-- 2) Add value (PostgreSQL 15+):
ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'super_admin';

-- PostgreSQL 14 and older (only if value missing):
-- ALTER TYPE "enum_users_role" ADD VALUE 'super_admin';

-- Optional: promote one user (replace email):
-- UPDATE users SET role = 'super_admin' WHERE email = 'admin@example.com';
