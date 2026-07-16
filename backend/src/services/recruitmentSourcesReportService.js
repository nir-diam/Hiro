/**
 * Recruitment sources report — aggregate candidates by arrival source + funnel stages.
 * Optional tenant scope via clientId (agency): candidates linked by recruitment source,
 * owning staff user, or job_candidates → jobs of that client.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UNDEFINED_SOURCE = '(לא מוגדר)';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseDayStart = (raw) => {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Inclusive end-date → exclusive upper bound (next UTC day). */
const parseDayEndExclusive = (raw) => {
  const start = parseDayStart(raw);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
};

/**
 * Optional: candidate IDs in the cohort that have a screening_cv referral notification.
 * When clientId is set, only notifications sent by staff of that client are counted.
 */
async function loadReferralCandidateIds(candidateIds, clientId = null) {
  const ids = Array.isArray(candidateIds) ? candidateIds.map(String).filter(Boolean) : [];
  if (!ids.length) return new Set();
  try {
    const clientClause = clientId
      ? `AND nm."senderUserId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)`
      : '';
    const rows = await sequelize.query(
      `
      SELECT DISTINCT NULLIF(BTRIM(nm.metadata #>> '{taskPayload,candidateId}'), '') AS candidate_id
      FROM notification_messages nm
      WHERE nm.category = 'screening_cv'
        AND NULLIF(BTRIM(nm.metadata #>> '{taskPayload,candidateId}'), '') IN (:ids)
        ${clientClause}
      `,
      {
        replacements: clientId ? { ids, clientId } : { ids },
        type: QueryTypes.SELECT,
      },
    );
    return new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.candidate_id)).filter(Boolean));
  } catch (err) {
    console.warn('[recruitmentSourcesReport] referral notifications skipped:', err.message || err);
    return new Set();
  }
}

/**
 * @param {object} opts
 * @param {string} opts.startDate YYYY-MM-DD
 * @param {string} opts.endDate YYYY-MM-DD
 * @param {string} [opts.source] exact source name, or empty / "הכל" for all
 * @param {string|null} [opts.clientId] UUID — null = all clients (admin only)
 */
async function getRecruitmentSourcesReport(opts = {}) {
  const startAt = parseDayStart(opts.startDate);
  const endAt = parseDayEndExclusive(opts.endDate);
  if (!startAt || !endAt) {
    const err = new Error('startDate and endDate are required (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  if (startAt >= endAt) {
    const err = new Error('startDate must be on or before endDate');
    err.status = 400;
    throw err;
  }

  let sourceFilter = String(opts.source || '').trim();
  if (!sourceFilter || sourceFilter === 'הכל' || sourceFilter.toLowerCase() === 'all') {
    sourceFilter = '';
  }

  const rawClientId = opts.clientId != null ? String(opts.clientId).trim() : '';
  const clientId = UUID_RE.test(rawClientId) ? rawClientId : null;

  const clientScopeSql = clientId
    ? `
      AND (
        c."recruitmentSourceId" IN (
          SELECT id FROM recruitment_sources WHERE client_id = :clientId::uuid
        )
        OR c."userId" IN (
          SELECT id FROM users WHERE "clientId" = :clientId::uuid
        )
        OR EXISTS (
          SELECT 1
          FROM job_candidates jc_scope
          INNER JOIN jobs j_scope ON j_scope.id = jc_scope."jobId"
          WHERE jc_scope."candidateId" = c.id
            AND j_scope.client_id = :clientId::uuid
        )
      )
    `
    : '';

  /** When tenant-scoped, only count funnel stages from jobs of that client. */
  const jcJoinSql = clientId
    ? `
      LEFT JOIN job_candidates jc ON jc."candidateId" = f.id
      LEFT JOIN jobs j_funnel ON j_funnel.id = jc."jobId" AND j_funnel.client_id = :clientId::uuid
    `
    : `
      LEFT JOIN job_candidates jc ON jc."candidateId" = f.id
    `;

  const replacements = {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    sourceFilter,
    undefinedSource: UNDEFINED_SOURCE,
    ...(clientId ? { clientId } : {}),
  };

  const candidateRows = await sequelize.query(
    `
    WITH dated_candidates AS (
      SELECT
        c.id,
        COALESCE(
          NULLIF(BTRIM(rs.name), ''),
          NULLIF(BTRIM(c.source), ''),
          :undefinedSource
        ) AS source_name
      FROM candidates c
      LEFT JOIN recruitment_sources rs ON rs.id = c."recruitmentSourceId"
      WHERE c."isDeleted" = false
        AND c."createdAt" >= :startAt
        AND c."createdAt" < :endAt
        ${clientScopeSql}
    ),
    filtered AS (
      SELECT *
      FROM dated_candidates
      WHERE (:sourceFilter = '' OR source_name = :sourceFilter)
    )
    SELECT
      f.id::text AS "candidateId",
      f.source_name AS "sourceName",
      BOOL_OR(
        ${clientId ? 'j_funnel.id IS NOT NULL AND (' : '('}
          COALESCE(jc."lastStatusGroup", '') = 'advanced'
          OR COALESCE(jc.status, '') ILIKE '%הפניה%'
          OR COALESCE(jc.status, '') ILIKE '%נשלחו קו%'
          OR COALESCE(jc.status, '') ILIKE '%נשלחו קורות%'
        )
      ) AS "isReferralJc",
      BOOL_OR(
        ${clientId ? 'j_funnel.id IS NOT NULL AND (' : '('}
          COALESCE(jc."lastStatusGroup", '') = 'hired'
          OR COALESCE(jc.status, '') = 'התקבל לעבודה'
        )
      ) AS "isPlacement",
      BOOL_OR(
        ${clientId ? 'j_funnel.id IS NOT NULL AND (' : '('}
          COALESCE(jc."lastStatusGroup", '') = 'hired'
          OR COALESCE(jc.status, '') IN ('התקבל', 'התקבל לעבודה')
        )
      ) AS "isAccepted",
      BOOL_OR(
        ${clientId ? 'j_funnel.id IS NOT NULL AND (' : '('}
          COALESCE(jc."lastStatusGroup", '') IN ('applied', 'screening', 'advanced')
          OR (
            jc.id IS NOT NULL
            AND COALESCE(jc."lastStatusGroup", '') NOT IN ('exit', 'hired')
            AND COALESCE(NULLIF(BTRIM(jc.status), ''), 'חדש')
              NOT IN ('התקבל לעבודה', 'נדחה', 'בארכיון', 'לא רלוונטי')
          )
        )
      ) AS "isCurrent",
      BOOL_OR(
        ${clientId ? 'j_funnel.id IS NOT NULL AND' : ''}
        jc.id IS NOT NULL
        AND (
          COALESCE(NULLIF(BTRIM(jc.status), ''), 'חדש') = 'חדש'
          OR COALESCE(jc."lastStatusGroup", '') = 'screening'
        )
      ) AS "isInitial"
    FROM filtered f
    ${jcJoinSql}
    GROUP BY f.id, f.source_name
    `,
    { replacements, type: QueryTypes.SELECT },
  );

  const list = Array.isArray(candidateRows) ? candidateRows : [];
  const referralNotifIds = await loadReferralCandidateIds(
    list.map((r) => r.candidateId),
    clientId,
  );

  const bySource = new Map();
  for (const row of list) {
    const name = String(row.sourceName || UNDEFINED_SOURCE);
    let bucket = bySource.get(name);
    if (!bucket) {
      bucket = {
        sourceName: name,
        candidates: 0,
        referrals: 0,
        placements: 0,
        accepted: 0,
        current: 0,
        initial: 0,
      };
      bySource.set(name, bucket);
    }
    bucket.candidates += 1;
    const cid = String(row.candidateId || '');
    if (row.isReferralJc || referralNotifIds.has(cid)) bucket.referrals += 1;
    if (row.isPlacement) bucket.placements += 1;
    if (row.isAccepted) bucket.accepted += 1;
    if (row.isCurrent) bucket.current += 1;
    if (row.isInitial) bucket.initial += 1;
  }

  const items = [...bySource.values()]
    .sort((a, b) => b.candidates - a.candidates || a.sourceName.localeCompare(b.sourceName, 'he'))
    .map((r, idx) => ({ id: idx + 1, ...r }));

  const totals = items.reduce(
    (acc, row) => {
      acc.candidates += row.candidates;
      acc.referrals += row.referrals;
      acc.placements += row.placements;
      acc.accepted += row.accepted;
      acc.current += row.current;
      acc.initial += row.initial;
      return acc;
    },
    { candidates: 0, referrals: 0, placements: 0, accepted: 0, current: 0, initial: 0 },
  );

  const conversionRate =
    totals.candidates > 0
      ? Math.round((totals.placements / totals.candidates) * 1000) / 10
      : 0;

  const topSources = items.slice(0, 5).map((r) => ({
    sourceName: r.sourceName,
    candidates: r.candidates,
  }));

  let sourceOptions = [];
  try {
    const optionRows = await sequelize.query(
      `
      SELECT DISTINCT COALESCE(
        NULLIF(BTRIM(rs.name), ''),
        NULLIF(BTRIM(c.source), ''),
        :undefinedSource
      ) AS "sourceName"
      FROM candidates c
      LEFT JOIN recruitment_sources rs ON rs.id = c."recruitmentSourceId"
      WHERE c."isDeleted" = false
        AND c."createdAt" >= :startAt
        AND c."createdAt" < :endAt
        ${clientScopeSql}
      ORDER BY 1 ASC
      `,
      { replacements, type: QueryTypes.SELECT },
    );
    sourceOptions = (Array.isArray(optionRows) ? optionRows : [])
      .map((r) => String(r.sourceName || '').trim())
      .filter(Boolean);
  } catch {
    sourceOptions = items.map((i) => i.sourceName);
  }

  // Prefer catalog names for the selected client when available.
  if (clientId) {
    try {
      const catalog = await sequelize.query(
        `
        SELECT name
        FROM recruitment_sources
        WHERE client_id = :clientId::uuid
        ORDER BY sort_index ASC NULLS LAST, name ASC
        `,
        { replacements: { clientId }, type: QueryTypes.SELECT },
      );
      const names = (Array.isArray(catalog) ? catalog : [])
        .map((r) => String(r.name || '').trim())
        .filter(Boolean);
      sourceOptions = [...new Set([...names, ...sourceOptions])].sort((a, b) => a.localeCompare(b, 'he'));
    } catch {
      /* keep sourceOptions */
    }
  }

  return {
    startDate: opts.startDate,
    endDate: opts.endDate,
    source: sourceFilter || null,
    clientId,
    totals: { ...totals, conversionRate },
    topSources,
    sourceOptions,
    items,
  };
}

module.exports = {
  getRecruitmentSourcesReport,
  UNDEFINED_SOURCE,
};
