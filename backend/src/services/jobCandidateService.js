const { Op } = require('sequelize');
const redis = require('./redisService');
const JobCandidate = require('../models/JobCandidate');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const clientUsageSettingService = require('./clientUsageSettingService');
const { resolveStatusGroup } = require('../utils/recruitmentStatusGroups');

const JC_JOB_KEY = (jobId) => `jobcandidates:job:${jobId}`;
const JC_CANDIDATE_KEY = (candidateId) => `jobcandidates:candidate:${candidateId}`;
const JC_TTL = 5 * 60; // 5 minutes — high-churn data, short TTL

const jcCacheInvalidate = async (jobId, candidateId) => {
  try {
    const keys = [jobId && JC_JOB_KEY(jobId), candidateId && JC_CANDIDATE_KEY(candidateId)].filter(Boolean);
    if (keys.length) await redis.del(...keys);
  } catch (e) {
    console.warn('[jobCandidateService] redis del failed (non-fatal):', e.message);
  }
};

const candidateAttributes = [
  'id',
  'fullName',
  'status',
  'email',
  'phone',
  'address',
  'location',
  'title',
  'matchScore',
  'lastActivity',
  'lastActive',
  'source',
];

const buildCandidateView = (record) => {
  const candidate = record.candidate?.toJSON?.() || {};
  const plain = record.get ? record.get({ plain: true }) : record;
  const createdRaw = plain.createdAt ?? record.createdAt;
  const createdDate = createdRaw ? new Date(createdRaw).toISOString() : null;
  const name = candidate.fullName || 'מועמד';
  const address = candidate.address || candidate.location || '';
  const status = record.status || candidate.status || 'חדש';
  const source = record.source || candidate.source || 'מערכת';
  const lastActivity = candidate.lastActivity || candidate.lastActive || '';

  return {
    id: candidate.id,
    name,
    title: candidate.title || '',
    status,
    address,
    matchScore: Number(candidate.matchScore) || 0,
    source,
    lastActivity,
    avatar: name.trim().charAt(0) || '#',
    createdDate,
  };
};

const listForJob = async (jobId) => {
  if (!jobId) return [];

  try {
    const cached = await redis.get(JC_JOB_KEY(jobId));
    if (cached) return cached;
  } catch (e) {
    console.warn('[jobCandidateService] redis get failed (non-fatal):', e.message);
  }

  const records = await JobCandidate.findAll({
    where: { jobId },
    order: [['createdAt', 'DESC']],
    include: [
      {
        model: Candidate,
        as: 'candidate',
        required: true,
        attributes: candidateAttributes,
      },
    ],
  });
  const result = records.map(buildCandidateView).filter((payload) => payload.id);

  try {
    await redis.set(JC_JOB_KEY(jobId), result, { ttlSeconds: JC_TTL });
  } catch (e) {
    console.warn('[jobCandidateService] redis set failed (non-fatal):', e.message);
  }

  return result;
};

const { syntheticJobFromWorkflowMeta } = require('../utils/jobCandidateInterestUtils');

/** Job rows linked to a candidate (התעניינות במשרה) — from job_candidates + jobs. */
const listForCandidate = async (candidateId) => {
  if (!candidateId) return [];

  try {
    const cached = await redis.get(JC_CANDIDATE_KEY(candidateId));
    if (cached) return cached;
  } catch (e) {
    console.warn('[jobCandidateService] redis get failed (non-fatal):', e.message);
  }

  const records = await JobCandidate.findAll({
    where: {
      candidateId,
      [Op.or]: [
        { jobId: { [Op.ne]: null } },
        { source: 'field_interest', jobId: null },
      ],
    },
    include: [{ model: Job, as: 'job', required: false }],
    order: [
      ['updatedAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });
  const result = records.map((jc) => {
    const plain = jc.get({ plain: true });
    const wm =
      plain.workflowMeta && typeof plain.workflowMeta === 'object' && !Array.isArray(plain.workflowMeta)
        ? plain.workflowMeta
        : {};
    let job = plain.job || {};
    const rowBase = {
      jobCandidateId: plain.id,
      jobId: plain.jobId,
      candidateId: plain.candidateId,
      status: plain.status,
      source: plain.source,
      manualOverride: Boolean(plain.manualOverride),
      workflowMeta: wm,
      lastStatusGroup: plain.lastStatusGroup ?? null,
      lastExitAt: plain.lastExitAt ?? null,
      lastExitReason: plain.lastExitReason ?? null,
      screeningEnteredAt: plain.screeningEnteredAt ?? null,
      updatedAt: plain.updatedAt,
      createdAt: plain.createdAt,
    };
    if (!plain.jobId && plain.source === 'field_interest') {
      job = syntheticJobFromWorkflowMeta(wm, rowBase);
    }
    return { ...rowBase, job };
  });

  try {
    await redis.set(JC_CANDIDATE_KEY(candidateId), result, { ttlSeconds: JC_TTL });
  } catch (e) {
    console.warn('[jobCandidateService] redis set failed (non-fatal):', e.message);
  }

  return result;
};

const associateCandidateWithJob = async ({
  jobId,
  candidateId,
  status,
  source,
  workflowMetaPatch,
  manualOverride,
} = {}) => {
  if (!candidateId) return null;
  const whereClause = jobId ? { jobId, candidateId } : { jobId: null, candidateId };
  const patch =
    workflowMetaPatch && typeof workflowMetaPatch === 'object' && !Array.isArray(workflowMetaPatch)
      ? { ...workflowMetaPatch }
      : {};
  const wantManualOverride = manualOverride === true;
  const [record, created] = await JobCandidate.findOrCreate({
    where: whereClause,
    defaults: {
      status: status || 'חדש',
      source: source || null,
      workflowMeta: Object.keys(patch).length ? patch : {},
      manualOverride: wantManualOverride,
    },
  });

  if (!created) {
    const updates = {};
    if (status && record.status !== status) updates.status = status;
    if (source) updates.source = source;
    if (wantManualOverride) updates.manualOverride = true;
    if (Object.keys(patch).length) {
      const prev =
        record.workflowMeta && typeof record.workflowMeta === 'object' && !Array.isArray(record.workflowMeta)
          ? { ...record.workflowMeta }
          : {};
      Object.assign(prev, patch);
      updates.workflowMeta = prev;
    }
    if (Object.keys(updates).length) {
      await record.update(updates);
    }
  }

  await record.reload();

  if (record.jobId) {
    try {
      const jobRow = await Job.findByPk(record.jobId, { attributes: ['client'] });
      const clientId = await clientUsageSettingService.getClientIdForJobClientLabel(jobRow?.client);
      const g = await resolveStatusGroup(clientId, record.status);
      const plainRow = record.get ? record.get({ plain: true }) : record;
      if (plainRow.lastStatusGroup !== g) {
        await record.update({ lastStatusGroup: g });
      }
    } catch (_) {
      /* ignore link meta sync failures */
    }
  }

  // Invalidate cached lists so next read reflects new association
  await jcCacheInvalidate(record.jobId, record.candidateId);

  return record;
};

module.exports = { listForJob, listForCandidate, associateCandidateWithJob };

