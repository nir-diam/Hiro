const { Op } = require('sequelize');
const JobCandidate = require('../models/JobCandidate');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');

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
    include: [{ model: Job, as: 'job', required: true }],
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
      workflowMeta: plain.workflowMeta && typeof plain.workflowMeta === 'object' ? plain.workflowMeta : {},
      updatedAt: plain.updatedAt,
      createdAt: plain.createdAt,
      job,
    };
  });
};

const associateCandidateWithJob = async ({ jobId, candidateId, status, source }) => {
  if (!candidateId) return null;
  const whereClause = jobId ? { jobId, candidateId } : { jobId: null, candidateId };
  const [record, created] = await JobCandidate.findOrCreate({
    where: whereClause,
    defaults: { status: status || 'חדש', source },
  });

  if (!created) {
    const updates = {};
    if (status && record.status !== status) updates.status = status;
    if (source && record.source !== source) updates.source = source;
    if (Object.keys(updates).length) {
      await record.update(updates);
    }
  }

  return record;
};

module.exports = { listForJob, listForCandidate, associateCandidateWithJob };

