const { Op } = require('sequelize');
const JobCandidate = require('../models/JobCandidate');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const clientUsageSettingService = require('./clientUsageSettingService');
const { resolveStatusGroup } = require('../utils/recruitmentStatusGroups');

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
  return records.map(buildCandidateView).filter((payload) => payload.id);
};

/** Job rows linked to a candidate (התעניינות במשרה) — from job_candidates + jobs. */
const listForCandidate = async (candidateId) => {
  if (!candidateId) return [];
  const records = await JobCandidate.findAll({
    where: { candidateId, jobId: { [Op.ne]: null } },
    // Optional join: if a job row was deleted but job_candidates.job_id remains, still return the link row.
    include: [{ model: Job, as: 'job', required: false }],
    order: [
      ['updatedAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });
  return records.map((jc) => {
    const plain = jc.get({ plain: true });
    const job = plain.job || {};
    return {
      jobCandidateId: plain.id,
      jobId: plain.jobId,
      candidateId: plain.candidateId,
      status: plain.status,
      source: plain.source,
      manualOverride: Boolean(plain.manualOverride),
      workflowMeta: plain.workflowMeta && typeof plain.workflowMeta === 'object' ? plain.workflowMeta : {},
      lastStatusGroup: plain.lastStatusGroup ?? null,
      lastExitAt: plain.lastExitAt ?? null,
      lastExitReason: plain.lastExitReason ?? null,
      screeningEnteredAt: plain.screeningEnteredAt ?? null,
      updatedAt: plain.updatedAt,
      createdAt: plain.createdAt,
      job,
    };
  });
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

  return record;
};

module.exports = { listForJob, listForCandidate, associateCandidateWithJob };

