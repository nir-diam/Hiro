/**
 * Home dashboard (personal + company) — live aggregates for DashboardView.
 * Reuses BI period metrics; adds funnel, offers, interviews, tasks, activity.
 */
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const bi = require('./biDashboardReportService');
const recruitmentSourcesReportService = require('./recruitmentSourcesReportService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toYmd = (d) => d.toISOString().slice(0, 10);

const clientJobs = (clientId) => (clientId ? `AND j.client_id = :clientId::uuid` : '');
const clientCand = (clientId) =>
  clientId
    ? `
      AND (
        c."userId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)
        OR EXISTS (
          SELECT 1 FROM job_candidates jc2
          INNER JOIN jobs j2 ON j2.id = jc2."jobId"
          WHERE jc2."candidateId" = c.id AND j2.client_id = :clientId::uuid
        )
      )`
    : '';

async function scalarCount(sql, replacements) {
  try {
    const rows = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    return Number(rows?.[0]?.count ?? 0) || 0;
  } catch (err) {
    console.warn('[homeDashboard] count failed:', err.message || err);
    return 0;
  }
}

async function scalarAvg(sql, replacements) {
  try {
    const rows = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    const v = rows?.[0]?.avg;
    if (v == null) return 0;
    return Math.round(Number(v) * 10) / 10;
  } catch (err) {
    console.warn('[homeDashboard] avg failed:', err.message || err);
    return 0;
  }
}

async function queryRows(sql, replacements) {
  try {
    return await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
  } catch (err) {
    console.warn('[homeDashboard] query failed:', err.message || err);
    return [];
  }
}

function relativeTimeHe(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `${mins}ד׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}ש׳`;
  const days = Math.round(hours / 24);
  return `${days}י׳`;
}

/**
 * @param {{ scope: 'personal'|'company', userId: string, clientId: string|null, startDate?: string, endDate?: string, range?: string }} opts
 */
async function getHomeDashboard(opts = {}) {
  const scope = opts.scope === 'company' ? 'company' : 'personal';
  const userId = String(opts.userId || '').trim();
  const clientId =
    opts.clientId && UUID_RE.test(String(opts.clientId)) ? String(opts.clientId) : null;

  const { start, endExclusive } = bi.resolveDateWindow({
    startDate: opts.startDate,
    endDate: opts.endDate,
    range: opts.range || 'this_month',
  });
  const prev = bi.previousWindow(start, endExclusive);

  const recruiterIds = scope === 'personal' && userId ? [userId] : null;
  const staffFilterCand = recruiterIds ? `AND c."userId" IN (:staffIds)` : '';
  const staffFilterEvt = recruiterIds ? `AND e."changedByUserId" IN (:staffIds)` : '';
  const staffFilterNotif = recruiterIds ? `AND nm."senderUserId" IN (:staffIds)` : '';
  const clientNotif = clientId
    ? `AND nm."senderUserId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)`
    : '';
  const staffFilterJcOwner = recruiterIds
    ? `AND EXISTS (SELECT 1 FROM candidates c0 WHERE c0.id = jc."candidateId" AND c0."userId" IN (:staffIds))`
    : '';

  const replacements = {
    startAt: start.toISOString(),
    endAt: endExclusive.toISOString(),
    prevStartAt: prev.start.toISOString(),
    prevEndAt: prev.endExclusive.toISOString(),
    today: toYmd(new Date()),
    ...(clientId ? { clientId } : {}),
    ...(recruiterIds ? { staffIds: recruiterIds } : {}),
    ...(userId ? { userId } : {}),
  };

  const [
    biCurrent,
    biPrevious,
    activeCandidates,
    activeCandidatesPrev,
    waitingScreening,
    waitingScreeningPrev,
    exceptions,
    exceptionsPrev,
    avgStatusDays,
    avgStatusDaysPrev,
    offersSent,
    offersAccepted,
    interviewsTodayRows,
    funnelRows,
    tthSeriesRows,
    openJobsRows,
    recentUpdatesRows,
    taskEventRows,
    sourcesReport,
    recruiters,
  ] = await Promise.all([
    bi.computePeriodMetrics({ start, endExclusive, clientId, recruiterIds }),
    bi.computePeriodMetrics({
      start: prev.start,
      endExclusive: prev.endExclusive,
      clientId,
      recruiterIds,
    }),
    scalarCount(
      `SELECT COUNT(DISTINCT c.id)::int AS count
       FROM candidates c
       INNER JOIN job_candidates jc ON jc."candidateId" = c.id
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('applied','screening','advanced')
         ${staffFilterCand} ${clientCand(clientId)} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(DISTINCT c.id)::int AS count
       FROM candidates c
       INNER JOIN job_candidates jc ON jc."candidateId" = c.id
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('applied','screening','advanced')
         AND c."updatedAt" >= :prevStartAt AND c."updatedAt" < :prevEndAt
         ${staffFilterCand} ${clientCand(clientId)} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') = 'screening'
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') = 'screening'
         AND jc."updatedAt" >= :prevStartAt AND jc."updatedAt" < :prevEndAt
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    // SLA-ish: active process links with no status change in 7+ days
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('screening','advanced')
         AND COALESCE(
           (SELECT MAX(e."changedAt") FROM job_candidate_status_events e WHERE e."jobCandidateId" = jc.id),
           jc."createdAt"
         ) < (NOW() - INTERVAL '7 days')
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('screening','advanced')
         AND COALESCE(
           (SELECT MAX(e."changedAt") FROM job_candidate_status_events e WHERE e."jobCandidateId" = jc.id),
           jc."createdAt"
         ) < ((:prevEndAt)::timestamptz - INTERVAL '7 days')
         AND COALESCE(
           (SELECT MAX(e."changedAt") FROM job_candidate_status_events e WHERE e."jobCandidateId" = jc.id),
           jc."createdAt"
         ) >= ((:prevStartAt)::timestamptz - INTERVAL '7 days')
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarAvg(
      `SELECT AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(
          (SELECT MAX(e."changedAt") FROM job_candidate_status_events e WHERE e."jobCandidateId" = jc.id),
          jc."createdAt"
        ))) / 86400.0) AS avg
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('applied','screening','advanced')
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    scalarAvg(
      `SELECT AVG(EXTRACT(EPOCH FROM ((:prevEndAt)::timestamptz - COALESCE(
          (SELECT MAX(e."changedAt") FROM job_candidate_status_events e
           WHERE e."jobCandidateId" = jc.id AND e."changedAt" < :prevEndAt),
          jc."createdAt"
        ))) / 86400.0) AS avg
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') IN ('applied','screening','advanced')
         ${staffFilterCand} ${clientJobs(clientId)}`,
      replacements,
    ),
    // Offers sent in range (pipeline "הצעה"/"offer" + screening-cv at/after offer)
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT e.id::text AS sid
         FROM job_candidate_status_events e
         INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
         LEFT JOIN jobs j ON j.id = jc."jobId"
         WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
           AND (
             COALESCE(e."toStatus",'') ILIKE '%הצעה%'
             OR COALESCE(e."toStatus",'') ILIKE '%offer%'
           )
           ${staffFilterEvt} ${clientJobs(clientId)}
         UNION ALL
         SELECT nm.id::text AS sid
         FROM notification_messages nm
         WHERE nm.category = 'screening_cv'
           AND (
             COALESCE(NULLIF(TRIM(nm.metadata->>'referralWorkflowStatus'), ''), nm.status, '')
               IN ('הצעה', 'התקבל', 'התקבל לעבודה')
           )
           AND ${bi.HIRED_SCREENING_CV_AT} >= :startAt
           AND ${bi.HIRED_SCREENING_CV_AT} < :endAt
           ${staffFilterNotif} ${clientNotif}
       ) o`,
      replacements,
    ),
    // Offers accepted in range (hired only when an offer path exists / screening התקבל)
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT e.id::text AS sid
         FROM job_candidate_status_events e
         INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
         LEFT JOIN jobs j ON j.id = jc."jobId"
         WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
           AND (
             COALESCE(e."toGroup",'') = 'hired'
             OR COALESCE(e."toStatus",'') IN ('התקבל', 'התקבל לעבודה')
             OR COALESCE(e."toStatus",'') ILIKE '%התקבל%'
           )
           AND EXISTS (
             SELECT 1 FROM job_candidate_status_events e2
             WHERE e2."jobCandidateId" = e."jobCandidateId"
               AND e2."changedAt" <= e."changedAt"
               AND (
                 COALESCE(e2."toStatus",'') ILIKE '%הצעה%'
                 OR COALESCE(e2."toStatus",'') ILIKE '%offer%'
               )
           )
           ${staffFilterEvt} ${clientJobs(clientId)}
         UNION ALL
         SELECT nm.id::text AS sid
         FROM notification_messages nm
         WHERE nm.category = 'screening_cv'
           AND ${bi.HIRED_SCREENING_CV_PRED}
           AND ${bi.HIRED_SCREENING_CV_AT} >= :startAt
           AND ${bi.HIRED_SCREENING_CV_AT} < :endAt
           ${staffFilterNotif} ${clientNotif}
       ) a`,
      replacements,
    ),
    // Interviews today from candidates.events JSONB
    queryRows(
      `SELECT c.id, c."fullName", ev.elem
       FROM candidates c
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS ev(elem)
       WHERE c."isDeleted" = false
         ${staffFilterCand} ${clientCand(clientId)}
         AND COALESCE(ev.elem->>'date', '') LIKE :today || '%'
         AND (
           COALESCE(ev.elem->>'type','') ILIKE '%ראיון%'
           OR COALESCE(ev.elem->'type'->>0,'') ILIKE '%ראיון%'
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(ev.elem->'type') = 'array' THEN ev.elem->'type' ELSE '[]'::jsonb END
             ) t(val) WHERE t.val ILIKE '%ראיון%'
           )
         )
         AND (
           :userId::text IS NULL OR :userId::text = ''
           OR COALESCE(ev.elem->>'coordinatorUserId','') = :userId
           OR COALESCE(ev.elem->>'userId','') = :userId
           OR c."userId"::text = :userId
         )
       LIMIT 50`,
      { ...replacements, userId: scope === 'personal' ? userId : '' },
    ),
    // Active funnel by lastStatusGroup
    queryRows(
      `SELECT COALESCE(jc."lastStatusGroup",'applied') AS grp, COUNT(*)::int AS count
       FROM job_candidates jc
       LEFT JOIN jobs j ON j.id = jc."jobId"
       INNER JOIN candidates c ON c.id = jc."candidateId"
       WHERE c."isDeleted" = false
         AND COALESCE(jc."lastStatusGroup",'') NOT IN ('exit')
         ${staffFilterCand} ${clientJobs(clientId)}
       GROUP BY 1
       ORDER BY count DESC`,
      replacements,
    ),
    // Time-to-hire by month (pipeline ∪ screening-cv)
    queryRows(
      `SELECT period, ROUND(AVG(days)::numeric, 1) AS avg_days FROM (
         SELECT to_char(date_trunc('month', e."changedAt"), 'YYYY-MM') AS period,
                EXTRACT(EPOCH FROM (e."changedAt" - jc."createdAt")) / 86400.0 AS days
         FROM job_candidate_status_events e
         INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
         LEFT JOIN jobs j ON j.id = jc."jobId"
         WHERE e."changedAt" >= (:endAt::timestamptz - INTERVAL '12 months')
           AND e."changedAt" < :endAt
           AND ${bi.HIRED_EVENT_PRED}
           ${staffFilterEvt} ${clientJobs(clientId)}
         UNION ALL
         SELECT to_char(date_trunc('month', ${bi.HIRED_SCREENING_CV_AT}), 'YYYY-MM') AS period,
                EXTRACT(EPOCH FROM (${bi.HIRED_SCREENING_CV_AT} - nm."createdAt")) / 86400.0 AS days
         FROM notification_messages nm
         WHERE nm.category = 'screening_cv'
           AND ${bi.HIRED_SCREENING_CV_PRED}
           AND ${bi.HIRED_SCREENING_CV_AT} >= (:endAt::timestamptz - INTERVAL '12 months')
           AND ${bi.HIRED_SCREENING_CV_AT} < :endAt
           ${staffFilterNotif} ${clientNotif}
       ) t
       GROUP BY 1
       ORDER BY 1 ASC`,
      replacements,
    ),
    queryRows(
      `SELECT j.id, j.title, j.company, j."clientName", j.status, j."updatedAt"
       FROM jobs j
       WHERE j.status = 'פתוחה'
         ${clientJobs(clientId)}
         ${
           scope === 'personal' && userId
             ? `AND (
                  EXISTS (
                    SELECT 1 FROM users u
                    WHERE u.id = :userId::uuid
                      AND (
                        LOWER(TRIM(COALESCE(j.recruiter,''))) = LOWER(TRIM(COALESCE(u.name,'')))
                        OR LOWER(TRIM(COALESCE(j."recruitingCoordinator",''))) = LOWER(TRIM(COALESCE(u.name,'')))
                      )
                  )
                  OR EXISTS (
                    SELECT 1 FROM job_candidates jc
                    INNER JOIN candidates c ON c.id = jc."candidateId"
                    WHERE jc."jobId" = j.id AND c."userId" = :userId::uuid
                  )
                )`
             : ''
         }
       ORDER BY j."updatedAt" DESC NULLS LAST
       LIMIT 8`,
      replacements,
    ),
    queryRows(
      `SELECT e.id, e."changedAt", e."toStatus", e."fromStatus",
              COALESCE(u.name, u.email, 'מערכת') AS user_name,
              COALESCE(c."fullName", 'מועמד') AS candidate_name,
              COALESCE(j.title, '') AS job_title
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       LEFT JOIN candidates c ON c.id = jc."candidateId"
       LEFT JOIN users u ON u.id = e."changedByUserId"
       WHERE e."changedAt" >= (:endAt::timestamptz - INTERVAL '14 days')
         AND e."changedAt" < :endAt
         ${staffFilterEvt} ${clientJobs(clientId)}
         ${staffFilterJcOwner}
       ORDER BY e."changedAt" DESC
       LIMIT 12`,
      replacements,
    ),
    // Upcoming tasks from candidate events (next 7 days) for personal; client-wide for company
    queryRows(
      `SELECT c.id AS candidate_id, c."fullName", ev.elem
       FROM candidates c
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS ev(elem)
       WHERE c."isDeleted" = false
         ${staffFilterCand} ${clientCand(clientId)}
         AND COALESCE(ev.elem->>'date','') >= :today
         AND COALESCE(ev.elem->>'date','') < to_char((:today::date + INTERVAL '7 days'), 'YYYY-MM-DD')
         AND COALESCE(ev.elem->>'status','') NOT ILIKE '%בוטל%'
         AND (
           :scope = 'company'
           OR COALESCE(ev.elem->>'coordinatorUserId','') = :userId
           OR c."userId"::text = :userId
         )
       ORDER BY ev.elem->>'date' ASC
       LIMIT 15`,
      { ...replacements, scope, userId: userId || '' },
    ),
    clientId
      ? recruitmentSourcesReportService.getRecruitmentSourcesReport({
          startDate: toYmd(start),
          endDate: toYmd(new Date(endExclusive.getTime() - 86400000)),
          clientId,
        }).catch(() => ({ rows: [] }))
      : Promise.resolve({ rows: [] }),
    bi.loadRecruiters({ clientId }),
  ]);

  const changePct = bi.changePct;

  // Interview breakdown
  let frontal = 0;
  let phone = 0;
  for (const row of interviewsTodayRows || []) {
    const elem = row.elem || {};
    const typeStr = Array.isArray(elem.type)
      ? elem.type.join(' ')
      : String(elem.type || elem.title || '');
    if (/טלפון|phone/i.test(typeStr)) phone += 1;
    else frontal += 1;
  }
  const interviewsToday = frontal + phone;

  const FUNNEL_LABELS = {
    applied: 'CV / חדש',
    screening: 'סינון',
    advanced: 'בראיון / בתהליך',
    hired: 'התקבל',
  };
  const funnelMap = Object.fromEntries(
    (funnelRows || []).map((r) => [String(r.grp || 'applied'), Number(r.count) || 0]),
  );
  const funnel = ['applied', 'screening', 'advanced', 'hired'].map((g) => ({
    label: FUNNEL_LABELS[g] || g,
    group: g,
    value: funnelMap[g] || 0,
  }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  const HEBREW_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const timeToHireSeries = (tthSeriesRows || []).map((r) => {
    const [y, m] = String(r.period || '').split('-');
    const mi = Math.max(0, Number(m) - 1);
    return {
      label: `${HEBREW_MONTHS[mi] || m} ${String(y || '').slice(2)}`,
      period: r.period,
      value: Number(r.avg_days) || 0,
    };
  });
  const tthMax = Math.max(1, ...timeToHireSeries.map((p) => p.value), Number(biCurrent.time_to_hire) || 0);

  // No offers in range → 0% (never invent 100% from hires alone)
  const offerAcceptance =
    offersSent > 0
      ? Math.min(100, Math.round((offersAccepted / offersSent) * 1000) / 10)
      : 0;

  // Goals
  let goalCurrent = Number(biCurrent.hires) || 0;
  let goalTarget = 20;
  if (scope === 'personal' && userId) {
    const me = (recruiters || []).find((r) => r.id === userId);
    if (me?.monthlyHireTarget != null) goalTarget = me.monthlyHireTarget;
    else goalTarget = Math.max(goalTarget, Math.ceil(goalCurrent * 1.2) || 20);
  } else {
    const sumTarget = (recruiters || []).reduce(
      (acc, r) => acc + (r.monthlyHireTarget != null ? Number(r.monthlyHireTarget) : 0),
      0,
    );
    goalTarget = sumTarget > 0 ? sumTarget : Math.max(60, Math.ceil(goalCurrent * 1.3) || 60);
  }

  // Recruiter performance (company)
  const recruiterPerformance = [];
  if (scope === 'company') {
    for (const r of (recruiters || []).slice(0, 12)) {
      const m = await bi.computePeriodMetrics({
        start,
        endExclusive,
        clientId,
        recruiterIds: [r.id],
      });
      recruiterPerformance.push({
        recruiterId: r.id,
        name: r.name,
        sent: Number(m.referrals) || 0,
        interviewed: Number(m.passed_screening) || 0,
        hired: Number(m.hires) || 0,
      });
    }
  }

  const topSources = (sourcesReport?.topSources || sourcesReport?.items || [])
    .slice(0, 8)
    .map((row) => ({
      label: String(row.sourceName || row.source || row.name || row.label || '(לא מוגדר)'),
      value: Number(row.candidates ?? row.count ?? row.total ?? row.value ?? 0) || 0,
    }))
    .filter((r) => r.value > 0);
  const topSourcesMax = Math.max(1, ...topSources.map((s) => s.value));

  const openJobs = (openJobsRows || []).map((j) => ({
    id: j.id,
    main: String(j.title || 'משרה'),
    sub: String(j.company || j.clientName || '').trim() || undefined,
  }));

  const recentUpdates = (recentUpdatesRows || []).map((u) => ({
    id: String(u.id),
    user: String(u.user_name || 'מערכת'),
    action: `העביר/ה את ${u.candidate_name} ל-${u.toStatus || 'סטטוס חדש'}${u.job_title ? ` (${u.job_title})` : ''}`,
    time: relativeTimeHe(u.changedAt),
    at: u.changedAt,
  }));

  const tasks = (taskEventRows || []).map((row, idx) => {
    const elem = row.elem || {};
    const typeStr = Array.isArray(elem.type)
      ? elem.type.join(', ')
      : String(elem.type || elem.title || 'משימה');
    const dateStr = String(elem.date || '').slice(0, 10);
    const isToday = dateStr === replacements.today;
    const urgency =
      String(elem.status || '').includes('דחוף') || isToday
        ? 'urgent'
        : String(elem.status || '').includes('הושלם')
          ? 'done'
          : 'pending';
    return {
      id: `${row.candidate_id}-${idx}`,
      title: `${typeStr} — ${row.fullName || 'מועמד'}`,
      time: isToday ? 'היום' : dateStr,
      status: urgency,
    };
  });

  const personalKpis = [
    {
      id: 'exceptions',
      value: exceptions,
      previous: exceptionsPrev,
      changePct: changePct(exceptions, exceptionsPrev),
      sentiment: exceptions > 0 ? 'critical' : 'success',
      unit: null,
    },
    {
      id: 'referrals',
      value: biCurrent.referrals,
      previous: biPrevious.referrals,
      changePct: changePct(biCurrent.referrals, biPrevious.referrals),
      sentiment: 'neutral',
      unit: null,
    },
    {
      id: 'open_jobs',
      value: biCurrent.open_jobs,
      previous: biPrevious.open_jobs,
      changePct: changePct(biCurrent.open_jobs, biPrevious.open_jobs),
      sentiment: 'neutral',
      unit: null,
    },
    {
      id: 'active_candidates',
      value: activeCandidates,
      previous: activeCandidatesPrev,
      changePct: changePct(activeCandidates, activeCandidatesPrev),
      sentiment: 'success',
      unit: null,
    },
    {
      id: 'interviews_today',
      value: interviewsToday,
      previous: 0,
      changePct: 0,
      sentiment: 'neutral',
      unit: null,
      subtext: `${frontal} פרונטלי, ${phone} טלפוני`,
    },
    {
      id: 'avg_status_time',
      value: avgStatusDays,
      previous: avgStatusDaysPrev,
      changePct: changePct(avgStatusDays, avgStatusDaysPrev),
      sentiment: avgStatusDays > 7 ? 'warning' : 'neutral',
      unit: 'days',
    },
  ];

  const companyKpis = [
    {
      id: 'hires',
      value: biCurrent.hires,
      previous: biPrevious.hires,
      changePct: changePct(biCurrent.hires, biPrevious.hires),
      sentiment: 'success',
      unit: null,
    },
    {
      id: 'time_to_hire',
      value: biCurrent.time_to_hire,
      previous: biPrevious.time_to_hire,
      changePct: changePct(biCurrent.time_to_hire, biPrevious.time_to_hire),
      sentiment: 'success',
      unit: 'days',
    },
    {
      id: 'offer_acceptance',
      value: offerAcceptance,
      previous: 0,
      changePct: 0,
      sentiment: 'neutral',
      unit: 'pct',
      subtext: offersSent > 0 ? `מתוך ${offersSent} הצעות` : 'אין הצעות בטווח',
      offers: offersSent,
      accepted: offersAccepted,
    },
    {
      id: 'waiting_screening',
      value: waitingScreening,
      previous: waitingScreeningPrev,
      changePct: changePct(waitingScreening, waitingScreeningPrev),
      sentiment: waitingScreening > 50 ? 'warning' : 'neutral',
      unit: null,
    },
  ];

  return {
    scope,
    startDate: toYmd(start),
    endDate: toYmd(new Date(endExclusive.getTime() - 86400000)),
    previousStartDate: toYmd(prev.start),
    previousEndDate: toYmd(new Date(prev.endExclusive.getTime() - 86400000)),
    clientId,
    userId: scope === 'personal' ? userId : null,
    kpis: scope === 'personal' ? personalKpis : companyKpis,
    goal: { current: goalCurrent, target: goalTarget },
    funnel: { max: funnelMax, data: funnel },
    timeToHireSeries: { max: tthMax, avg: biCurrent.time_to_hire, changePct: changePct(biCurrent.time_to_hire, biPrevious.time_to_hire), data: timeToHireSeries },
    recruiterPerformance,
    openJobs,
    topSources: { max: topSourcesMax, data: topSources },
    tasks,
    recentUpdates,
  };
}

module.exports = { getHomeDashboard };
