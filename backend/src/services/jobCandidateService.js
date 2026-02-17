const JobCandidate = require('../models/JobCandidate');
const Candidate = require('../models/Candidate');

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

module.exports = { listForJob, associateCandidateWithJob };

