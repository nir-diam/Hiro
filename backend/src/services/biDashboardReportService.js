/**
 * BI dashboard aggregations — KPIs, series, comparison, recruiter heatmap.
 * No mock data; missing event types return 0.
 */
const { QueryTypes, Op } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('../models/User');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ['manager', 'recruiter'];

const HEBREW_MONTHS = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

const KPI_IDS = [
  'hires',
  'cv_ingestions',
  'referrals',
  'screenings',
  'open_jobs',
  'time_to_hire',
  'portal_submissions',
  'communications',
  'passed_screening',
];

const HEATMAP_METRIC_IDS = [
  'cv_ingestions',
  'referrals',
  'screenings_done',
  'passed_screening',
  'rejected_screening',
  'moved_to_process',
  'moved_to_no_process',
  'status_changes',
  'sms_sent',
  'user_actions',
  'candidates_fixed',
  'cross_sections',
  'all_events',
  'logins',
  'started_work',
  'moved_to_hired',
];

const emptyMetrics = () =>
  HEATMAP_METRIC_IDS.reduce((acc, id) => {
    acc[id] = 0;
    return acc;
  }, {});

const parseDayStart = (raw) => {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const parseDayEndExclusive = (raw) => {
  const start = parseDayStart(raw);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return end;
};

const toYmd = (d) => d.toISOString().slice(0, 10);

function resolveDateWindow(opts = {}) {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const defaultEndExclusive = new Date(todayUtc);
  defaultEndExclusive.setUTCDate(defaultEndExclusive.getUTCDate() + 1);

  let start = parseDayStart(opts.startDate);
  let endEx = parseDayEndExclusive(opts.endDate);

  if (start && endEx && start < endEx) {
    return { start, endExclusive: endEx };
  }

  const preset = String(opts.range || opts.dateRange || 'last_30_days');
  endEx = defaultEndExclusive;
  start = new Date(todayUtc);

  switch (preset) {
    case 'last_7_days':
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case 'this_month':
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
      break;
    case 'last_month':
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, 1));
      endEx = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
      break;
    case 'this_quarter': {
      const q = Math.floor(todayUtc.getUTCMonth() / 3) * 3;
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), q, 1));
      break;
    }
    case 'this_year':
      start = new Date(Date.UTC(todayUtc.getUTCFullYear(), 0, 1));
      break;
    case 'last_30_days':
    default:
      start.setUTCDate(start.getUTCDate() - 29);
      break;
  }

  return { start, endExclusive: endEx };
}

function previousWindow(start, endExclusive) {
  const ms = endExclusive.getTime() - start.getTime();
  return {
    start: new Date(start.getTime() - ms),
    endExclusive: new Date(start),
  };
}

function changePct(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return Math.round(((c - p) / p) * 1000) / 10;
}

function periodLabel(bucketStart, granularity) {
  const d = new Date(bucketStart);
  if (granularity === 'quarter') {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} ${d.getUTCFullYear()}`;
  }
  return `${HEBREW_MONTHS[d.getUTCMonth()] || d.getUTCMonth() + 1} ${String(d.getUTCFullYear()).slice(2)}`;
}

async function loadRecruiters({ clientId }) {
  const where = {
    role: { [Op.in]: STAFF_ROLES },
    isActive: true,
  };
  if (clientId) where.clientId = clientId;

  const rows = await User.findAll({
    where,
    attributes: ['id', 'name', 'email', 'role', 'isActive', 'clientId', 'uiPreferences'],
    order: [['name', 'ASC']],
  });

  return rows.map((r) => {
    const plain = r.get({ plain: true });
    const prefs =
      plain.uiPreferences && typeof plain.uiPreferences === 'object' ? plain.uiPreferences : {};
    const targetRaw = prefs.monthlyHireTarget ?? prefs.hireTarget ?? prefs.monthlyGoal;
    const target =
      targetRaw != null && Number.isFinite(Number(targetRaw)) ? Number(targetRaw) : null;
    return {
      id: String(plain.id),
      name: String(plain.name || plain.email || 'רכז').trim() || 'רכז',
      role: plain.role,
      isActive: Boolean(plain.isActive),
      clientId: plain.clientId != null ? String(plain.clientId) : null,
      monthlyHireTarget: target,
    };
  });
}

async function scalarCount(sql, replacements) {
  try {
    const rows = await sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
    return Number(rows?.[0]?.count ?? 0) || 0;
  } catch (err) {
    console.warn('[biDashboard] count failed:', err.message || err);
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
    console.warn('[biDashboard] avg failed:', err.message || err);
    return 0;
  }
}

async function computePeriodMetrics({ start, endExclusive, clientId, recruiterIds }) {
  const hasStaff = Array.isArray(recruiterIds) && recruiterIds.length > 0;
  const replacements = {
    startAt: start.toISOString(),
    endAt: endExclusive.toISOString(),
    ...(clientId ? { clientId } : {}),
    ...(hasStaff ? { staffIds: recruiterIds } : {}),
  };

  const staffFilterCand = hasStaff ? `AND c."userId" IN (:staffIds)` : '';
  const staffFilterNotif = hasStaff ? `AND nm."senderUserId" IN (:staffIds)` : '';
  const staffFilterEvt = hasStaff ? `AND e."changedByUserId" IN (:staffIds)` : '';
  const staffFilterLog = hasStaff ? `AND al."userId" IN (:staffIds)` : '';
  const clientJobs = clientId ? `AND j.client_id = :clientId::uuid` : '';
  const clientCand = clientId
    ? `
      AND (
        c."recruitmentSourceId" IN (SELECT id FROM recruitment_sources WHERE client_id = :clientId::uuid)
        OR c."userId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)
        OR EXISTS (
          SELECT 1 FROM job_candidates jc2
          INNER JOIN jobs j2 ON j2.id = jc2."jobId"
          WHERE jc2."candidateId" = c.id AND j2.client_id = :clientId::uuid
        )
      )`
    : '';
  const clientNotif = clientId
    ? `AND nm."senderUserId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)`
    : '';
  const clientLog = clientId
    ? `AND al."userId" IN (SELECT id FROM users WHERE "clientId" = :clientId::uuid)`
    : '';

  const [
    cv_ingestions,
    referrals,
    hires,
    screenings,
    passed_screening,
    rejected_screening,
    moved_to_process,
    moved_to_no_process,
    status_changes,
    open_jobs,
    time_to_hire,
    portal_submissions,
    communications,
    sms_sent,
    logins,
    user_actions,
  ] = await Promise.all([
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM candidates c
       WHERE c."isDeleted" = false
         AND c."createdAt" >= :startAt AND c."createdAt" < :endAt
         ${staffFilterCand} ${clientCand}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM notification_messages nm
       WHERE nm.category = 'screening_cv'
         AND nm."createdAt" >= :startAt AND nm."createdAt" < :endAt
         ${staffFilterNotif} ${clientNotif}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND (COALESCE(e."toGroup",'') = 'hired' OR COALESCE(e."toStatus",'') = 'התקבל לעבודה')
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND COALESCE(e."toGroup",'') = 'screening'
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND COALESCE(e."toGroup",'') = 'advanced'
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND COALESCE(e."toGroup",'') = 'exit'
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND COALESCE(e."toGroup",'') IN ('screening','advanced')
         AND COALESCE(e."fromGroup",'') IN ('applied','')
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND COALESCE(e."toGroup",'') = 'exit'
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM jobs j WHERE j.status = 'פתוחה' ${clientJobs}`,
      replacements,
    ),
    scalarAvg(
      `SELECT AVG(EXTRACT(EPOCH FROM (e."changedAt" - jc."createdAt")) / 86400.0) AS avg
       FROM job_candidate_status_events e
       INNER JOIN job_candidates jc ON jc.id = e."jobCandidateId"
       LEFT JOIN jobs j ON j.id = jc."jobId"
       WHERE e."changedAt" >= :startAt AND e."changedAt" < :endAt
         AND (COALESCE(e."toGroup",'') = 'hired' OR COALESCE(e."toStatus",'') = 'התקבל לעבודה')
         ${staffFilterEvt} ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count
       FROM candidate_applications a
       LEFT JOIN jobs j ON j.id = a."jobId"
       WHERE COALESCE(a."createdAt", a."applicationDate"::timestamptz) >= :startAt
         AND COALESCE(a."createdAt", a."applicationDate"::timestamptz) < :endAt
         ${clientJobs}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM notification_messages nm
       WHERE nm."createdAt" >= :startAt AND nm."createdAt" < :endAt
         AND COALESCE(nm.category,'') <> 'screening_cv'
         ${staffFilterNotif} ${clientNotif}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM notification_messages nm
       WHERE nm."createdAt" >= :startAt AND nm."createdAt" < :endAt
         AND COALESCE(nm.category,'') ILIKE '%sms%'
         ${staffFilterNotif} ${clientNotif}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM app_logs al
       WHERE al.timestamp >= :startAt AND al.timestamp < :endAt
         AND (
           COALESCE(al.message,'') ILIKE '%login%'
           OR COALESCE(al.source,'') ILIKE '%login%'
           OR COALESCE(al.context->>'action','') ILIKE '%login%'
         )
         ${staffFilterLog} ${clientLog}`,
      replacements,
    ),
    scalarCount(
      `SELECT COUNT(*)::int AS count FROM app_logs al
       WHERE al.timestamp >= :startAt AND al.timestamp < :endAt
         ${staffFilterLog} ${clientLog}`,
      replacements,
    ),
  ]);

  return {
    hires,
    cv_ingestions,
    referrals,
    screenings,
    screenings_done: screenings,
    open_jobs,
    time_to_hire,
    portal_submissions,
    communications,
    passed_screening,
    rejected_screening,
    moved_to_process,
    moved_to_no_process,
    status_changes,
    sms_sent,
    user_actions,
    candidates_fixed: 0,
    cross_sections: 0,
    all_events: user_actions,
    logins,
    started_work: hires,
    moved_to_hired: hires,
  };
}

async function buildSeries({ metricId, start, endExclusive, clientId, recruiterIds, granularity }) {
  const points = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  if (granularity === 'quarter') {
    cursor.setUTCMonth(Math.floor(cursor.getUTCMonth() / 3) * 3);
  }

  while (cursor < endExclusive) {
    const bucketStart = new Date(cursor);
    const bucketEnd = new Date(cursor);
    if (granularity === 'quarter') bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 3);
    else bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 1);

    const winStart = bucketStart < start ? start : bucketStart;
    const winEnd = bucketEnd > endExclusive ? endExclusive : bucketEnd;
    if (winStart < winEnd) {
      const m = await computePeriodMetrics({
        start: winStart,
        endExclusive: winEnd,
        clientId,
        recruiterIds,
      });
      points.push({
        label: periodLabel(bucketStart, granularity),
        periodStart: toYmd(bucketStart),
        value: Number(m[metricId] ?? 0) || 0,
      });
    }
    if (granularity === 'quarter') cursor.setUTCMonth(cursor.getUTCMonth() + 3);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return points;
}

async function buildSparklineBuckets({ start, endExclusive, clientId, recruiterIds, buckets = 7 }) {
  const ms = endExclusive.getTime() - start.getTime();
  const step = Math.max(Math.floor(ms / buckets), 1);
  const out = [];
  for (let i = 0; i < buckets; i++) {
    const bStart = new Date(start.getTime() + i * step);
    const bEnd = i === buckets - 1 ? endExclusive : new Date(start.getTime() + (i + 1) * step);
    out.push(
      await computePeriodMetrics({
        start: bStart,
        endExclusive: bEnd,
        clientId,
        recruiterIds,
      }),
    );
  }
  return out;
}

async function buildHeatmap({ start, endExclusive, clientId, recruiters }) {
  const rows = [];
  const chunkSize = 5;
  for (let i = 0; i < recruiters.length; i += chunkSize) {
    const chunk = recruiters.slice(i, i + chunkSize);
    const part = await Promise.all(
      chunk.map(async (r) => {
        const metrics = await computePeriodMetrics({
          start,
          endExclusive,
          clientId,
          recruiterIds: [r.id],
        });
        return {
          recruiterId: r.id,
          name: r.name,
          ...emptyMetrics(),
          ...Object.fromEntries(HEATMAP_METRIC_IDS.map((id) => [id, Number(metrics[id]) || 0])),
        };
      }),
    );
    rows.push(...part);
  }
  return rows;
}

async function getBiDashboard(opts = {}) {
  const { start, endExclusive } = resolveDateWindow(opts);
  const prev = previousWindow(start, endExclusive);

  const rawClientId = opts.clientId != null ? String(opts.clientId).trim() : '';
  const clientId = UUID_RE.test(rawClientId) ? rawClientId : null;

  const rawRecruiterId = opts.recruiterId != null ? String(opts.recruiterId).trim() : '';
  const recruiterId = UUID_RE.test(rawRecruiterId) ? rawRecruiterId : null;

  const granularity = opts.granularity === 'quarter' ? 'quarter' : 'month';
  const metricId = KPI_IDS.includes(opts.metric) ? opts.metric : 'hires';

  const recruiters = await loadRecruiters({ clientId });
  const recruiterIds = recruiterId ? [recruiterId] : null;

  const [currentMetrics, previousMetrics, seriesPoints, sparkBuckets] = await Promise.all([
    computePeriodMetrics({ start, endExclusive, clientId, recruiterIds }),
    computePeriodMetrics({
      start: prev.start,
      endExclusive: prev.endExclusive,
      clientId,
      recruiterIds,
    }),
    buildSeries({ metricId, start, endExclusive, clientId, recruiterIds, granularity }),
    buildSparklineBuckets({ start, endExclusive, clientId, recruiterIds, buckets: 7 }),
  ]);

  const kpis = KPI_IDS.map((id) => {
    const current = Number(currentMetrics[id]) || 0;
    const previous = Number(previousMetrics[id]) || 0;
    return { id, current, previous, changePct: changePct(current, previous) };
  });

  const comparison = KPI_IDS.map((id) => {
    const current = Number(currentMetrics[id]) || 0;
    const previous = Number(previousMetrics[id]) || 0;
    return {
      id,
      metric: `metric.${id}`,
      current,
      previous,
      changePct: changePct(current, previous),
      sparkline: sparkBuckets.map((b) => Number(b[id]) || 0),
    };
  });

  const heatmapRecruiters = recruiterId
    ? recruiters.filter((r) => r.id === recruiterId)
    : recruiters;

  const heatmap = await buildHeatmap({
    start,
    endExclusive,
    clientId,
    recruiters: heatmapRecruiters,
  });

  const hireValues = heatmap.map((h) => h.moved_to_hired || 0);
  const avgHires =
    hireValues.length > 0 ? hireValues.reduce((a, b) => a + b, 0) / hireValues.length : 0;

  const recruiterGaps = heatmapRecruiters.map((r, idx) => {
    const actual = heatmap[idx]?.moved_to_hired || 0;
    const target =
      r.monthlyHireTarget != null && Number.isFinite(r.monthlyHireTarget)
        ? r.monthlyHireTarget
        : Math.round(avgHires * 10) / 10;
    return {
      recruiterId: r.id,
      name: r.name,
      actualHires: actual,
      target,
      delta: Math.round((actual - target) * 10) / 10,
    };
  });

  return {
    startDate: toYmd(start),
    endDate: toYmd(new Date(endExclusive.getTime() - 86400000)),
    previousStartDate: toYmd(prev.start),
    previousEndDate: toYmd(new Date(prev.endExclusive.getTime() - 86400000)),
    clientId,
    recruiterId,
    granularity,
    metricId,
    recruiters: recruiters.map(({ id, name, role, isActive }) => ({ id, name, role, isActive })),
    kpis,
    series: { metricId, points: seriesPoints },
    comparison,
    recruiterGaps,
    funnel: {
      cv_ingestions: currentMetrics.cv_ingestions,
      screenings_done: currentMetrics.screenings_done,
      passed_screening: currentMetrics.passed_screening,
      moved_to_hired: currentMetrics.moved_to_hired,
    },
    heatmap,
  };
}

module.exports = {
  getBiDashboard,
  resolveDateWindow,
  KPI_IDS,
  HEATMAP_METRIC_IDS,
};
