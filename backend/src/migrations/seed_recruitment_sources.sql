-- Seed default recruitment sources for every row in `clients` (run after create_recruitment_sources.sql).
-- Uses NOT EXISTS so it works even if UNIQUE (client_id, name) is missing (e.g. table created only by Sequelize sync).
--
-- Only one client — add to the final WHERE:
--   AND c.id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid

INSERT INTO recruitment_sources (id, client_id, sort_index, name, addresses, exclusivity_months, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.id,
  v.sort_index,
  v.name,
  v.addresses,
  v.exclusivity_months,
  NOW(),
  NOW()
FROM clients c
CROSS JOIN (VALUES
  (0, 'AllJobs', 'alljob.co.il;alljobs', 0),
  (1, 'Facebook', 'facebook;facebookmail', 0),
  (2, 'Indeed', 'indeed;indeedemail;indeedemployers', 0),
  (3, 'Jobhunt', 'jobhunt.co.il', 0),
  (4, 'JobMaster', 'jobmaster', 0),
  (5, 'JobNet', 'jobnet', 0),
  (6, 'LinkedIn', '', 0),
  (7, 'mploy', 'mploy', 0),
  (8, 'techit', 'techit@techit.co.il', 0),
  (9, $$ג'וב קרוב$$, 'jobkarov.com', 0),
  (10, 'הומלס', 'homeless.co.il', 0),
  (11, 'חבר מביא חבר', '', 0),
  (12, 'יבוא', '', 0),
  (13, 'לשכת התעסוקה', 'taasukaservice@ies.gov.il', 0),
  (14, 'מובטל', 'muvtal', 0),
  (15, $$נגב ג'ובס$$, 'negevjobs', 0),
  (16, 'סחבק', 'sahbak.co.il', 0),
  (17, 'ע.יזומה - ווצאפים', '', 0),
  (18, 'ע.יזומה - פייסבוק', '', 0),
  (19, 'פורטל דרושים', 'drushim.co.il', 0)
) AS v(sort_index, name, addresses, exclusivity_months)
WHERE NOT EXISTS (
  SELECT 1
  FROM recruitment_sources rs
  WHERE rs.client_id = c.id
    AND rs.name = v.name
);
