const { Op } = require('sequelize');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateStatusEvent = require('../models/JobCandidateStatusEvent');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const jobHealthRuleService = require('./jobHealthRuleService');

const DAY_MS = 86_400_000;
const DISQUAL_RE = /פסיל|disqual|reject|נדחה/i;

function toTrafficLight(color) {
  const c = String(color || 'gray');
  if (c === 'red') return 'red';
  if (c === 'orange' || c === 'yellow' || c === 'purple') return 'yellow';
  if (c === 'green' || c === 'blue') return 'green';
  return 'yellow';
}

function compare(operator, left, right, maxValue) {
  switch (operator) {
    case 'gt':
      return left > right;
    case 'lt':
      return left < right;
    case 'eq':
      return left === right;
    case 'between':
      return left >= right && left <= (maxValue != null ? maxValue : right);
    default:
      return false;
  }
}

function evaluateRules(rules, metrics) {
  const enabled = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && r.enabled !== false)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

  for (const rule of enabled) {
    let left;
    switch (rule.condition) {
      case 'days_open':
        left = metrics.daysOpen;
        break;
      case 'candidates_total':
        left = metrics.candidatesTotal;
        break;
      case 'days_since_contact':
        left = metrics.daysSinceContact;
        break;
      case 'disqualification_rate':
        left = metrics.disqualificationRate;
        break;
      case 'candidates_at_stage':
        left = metrics.candidatesByStage[String(rule.stage || '')] || 0;
        break;
      case 'time_in_stage':
        left = metrics.maxDaysInStage[String(rule.stage || '')] || 0;
        break;
      default:
        continue;
    }

    if (!compare(rule.operator, left, Number(rule.value) || 0, rule.maxValue)) continue;

    const level = toTrafficLight(rule.color);
    let message = rule.condition;
    if (rule.condition === 'days_open') message = `פתוחה ${left} ימים`;
    else if (rule.condition === 'candidates_total') message = `${left} מועמדים`;
    else if (rule.condition === 'days_since_contact') message = `${left} ימים ללא עדכון`;
    else if (rule.condition === 'disqualification_rate') message = `${left}% פסילות`;
    else if (rule.condition === 'candidates_at_stage') message = `${left} בסטטוס ${rule.stage || ''}`;
    else if (rule.condition === 'time_in_stage') message = `${left} ימים בסטטוס ${rule.stage || ''}`;

    return {
      level,
      color: rule.color,
      message,
      pulse: level === 'red',
      matchedRuleId: rule.id || null,
      metrics,
    };
  }

  return {
    level: 'green',
    color: 'green',
    message: 'תקין: אף חוק אזהרה לא התקיים',
    pulse: false,
    matchedRuleId: null,
    metrics,
  };
}

async function computeJobMetrics(job) {
  const openDate = job.openDate || job.createdAt;
  const daysOpen = openDate
    ? Math.max(0, Math.floor((Date.now() - new Date(openDate).getTime()) / DAY_MS))
    : 0;
  const updatedAt = job.updatedAt || openDate;
  const daysSinceContact = updatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / DAY_MS))
    : daysOpen;

  const candidates = await JobCandidate.findAll({
    where: { jobId: job.id },
    attributes: ['id', 'status', 'updatedAt', 'createdAt'],
  });

  const candidatesByStage = {};
  let disqualified = 0;
  for (const c of candidates) {
    const st = String(c.status || 'חדש');
    candidatesByStage[st] = (candidatesByStage[st] || 0) + 1;
    if (DISQUAL_RE.test(st)) disqualified += 1;
  }

  const maxDaysInStage = {};
  const jcIds = candidates.map((c) => c.id);
  if (jcIds.length) {
    const events = await JobCandidateStatusEvent.findAll({
      where: { jobCandidateId: { [Op.in]: jcIds } },
      attributes: ['jobCandidateId', 'toStatus', 'changedAt'],
      order: [['changedAt', 'DESC']],
    });
    const latestByJc = new Map();
    for (const ev of events) {
      const key = String(ev.jobCandidateId);
      if (!latestByJc.has(key)) latestByJc.set(key, ev);
    }
    for (const c of candidates) {
      const st = String(c.status || 'חדש');
      const ev = latestByJc.get(String(c.id));
      const since = ev?.changedAt || c.updatedAt || c.createdAt;
      if (!since) continue;
      const days = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / DAY_MS));
      maxDaysInStage[st] = Math.max(maxDaysInStage[st] || 0, days);
    }
  }

  const total = candidates.length;
  return {
    daysOpen,
    daysSinceContact,
    candidatesTotal: total || Number(job.associatedCandidates) || 0,
    candidatesByStage,
    maxDaysInStage,
    disqualificationRate: total ? Math.round((disqualified / total) * 100) : 0,
  };
}

/**
 * Evaluate pulse for jobs in a client scope (optional organization filter).
 * Uses org-scoped rules when present; otherwise client-level rules.
 * Returns { isSystemActive, byJobId }
 */
async function evaluatePulseForClient(clientId, organizationIdRaw = null) {
  let organizationId = null;
  if (organizationIdRaw) {
    organizationId = String(organizationIdRaw).trim();
    const link = await ClientOrganizationLink.findOne({ where: { clientId, organizationId } });
    if (!link) {
      const err = new Error('Organization is not linked to this client');
      err.status = 400;
      throw err;
    }
  }

  let isSystemActive = true;
  let profiles = null;

  if (organizationId) {
    const orgProfiles = await jobHealthRuleService.listProfilesOnly(clientId, organizationId);
    if (orgProfiles) {
      profiles = orgProfiles;
      isSystemActive = await jobHealthRuleService.getIsActive(clientId, organizationId);
    }
  }
  if (!profiles) {
    const data = await jobHealthRuleService.listOrSeedByScope(clientId, null);
    profiles = data.profiles;
    isSystemActive = data.isSystemActive;
  }

  if (!isSystemActive) {
    return { isSystemActive: false, byJobId: {} };
  }

  const jobWhere = { status: 'פתוחה' };
  if (organizationId) {
    jobWhere.organizationId = organizationId;
  } else {
    const links = await ClientOrganizationLink.findAll({
      where: { clientId, organizationId: { [Op.ne]: null } },
      attributes: ['organizationId'],
    });
    const orgIds = links.map((l) => l.organizationId).filter(Boolean);
    jobWhere[Op.or] = [
      { clientId },
      ...(orgIds.length ? [{ organizationId: { [Op.in]: orgIds } }] : []),
    ];
  }

  const jobs = await Job.findAll({
    where: jobWhere,
    attributes: [
      'id',
      'status',
      'openDate',
      'createdAt',
      'updatedAt',
      'healthProfile',
      'associatedCandidates',
      'organizationId',
      'clientId',
    ],
    limit: 500,
  });

  const byJobId = {};
  await Promise.all(
    jobs.map(async (job) => {
      const profile = String(job.healthProfile || 'standard');
      if (profile === 'disabled') {
        byJobId[String(job.id)] = {
          level: 'yellow',
          color: 'gray',
          message: 'בקרת בריאות כבויה למשרה זו',
          pulse: false,
        };
        return;
      }
      const rules = profiles[profile] || profiles.standard || [];
      try {
        const metrics = await computeJobMetrics(job);
        byJobId[String(job.id)] = evaluateRules(rules, metrics);
      } catch (err) {
        byJobId[String(job.id)] = {
          level: 'yellow',
          message: err.message || 'שגיאה בחישוב דופק',
          pulse: false,
        };
      }
    }),
  );

  return { isSystemActive: true, byJobId };
}

module.exports = {
  evaluatePulseForClient,
  evaluateRules,
  computeJobMetrics,
};
