-- Speed up organization lookup used by the candidate list grid.
--
-- `candidateService.loadOrganizationsForCompanyNames` resolves every company name on the page
-- against organizations.name and organizations.aliases. Before this index the query scanned all
-- 4,140 organizations and evaluated LOWER(TRIM(...)) per row, with no index available at all
-- (pg_indexes showed only organizations_pkey).
--
-- Measured on production before the index:
--   200 lookup keys → 2,535 ms
--   400 lookup keys → 4,495 ms
-- A 100-candidate page expands to 400+ keys via companyLookupKeys, so the request exceeded the
-- 20 s statement_timeout and GET /api/candidates returned 503
-- ("canceling statement due to statement timeout").
--
-- Non-unique on purpose: 201 rows currently share a lower/trimmed name with another row.
-- Add both statements with CONCURRENTLY so no write lock is taken on a live table.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_name_lower_trim
  ON organizations (LOWER(TRIM(name)));

-- Alias matching is `EXISTS (SELECT 1 FROM unnest(aliases) a WHERE LOWER(TRIM(a)) = ANY(...))`.
-- A GIN index over the array supports containment-style probes; the planner can also use it for
-- the unnest semi-join once the alias set is normalized.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_aliases_gin
  ON organizations USING GIN (aliases);
