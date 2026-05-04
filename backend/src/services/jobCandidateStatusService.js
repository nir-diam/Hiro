const JobCandidateStatusEvent = require('../models/JobCandidateStatusEvent');
const JobCandidate = require('../models/JobCandidate');
const Job = require('../models/Job');
const { resolveStatusGroup, canonicalizeStatusGroup } = require('../utils/recruitmentStatusGroups');
const clientUsageSettingService = require('./clientUsageSettingService');

/**
 * Persist job–candidate status change + denormalized screening meta + audit row.
 * Caller builds full workflowMeta object (merged JSONB).
 */
async function applyJobCandidateStatusChange({
  jobCandidateId,
  newStatus,
  workflowMeta,
  req,
  source = 'patch',
}) {
  const jc = await JobCandidate.findByPk(jobCandidateId);
  if (!jc) {
    const err = new Error('Job link not found');
    err.status = 404;
    throw err;
  }

  const job = jc.jobId ? await Job.findByPk(jc.jobId, { attributes: ['id', 'client'] }) : null;
  const clientId = job?.client ? await clientUsageSettingService.getClientIdForJobClientLabel(job.client) : null;

  const prevStatus = jc.status;
  const prevGroupStored = jc.lastStatusGroup ? canonicalizeStatusGroup(jc.lastStatusGroup) : null;
  const fromGroup = prevGroupStored || (await resolveStatusGroup(clientId, prevStatus));
  const toGroup = await resolveStatusGroup(clientId, newStatus);

  const updates = {
    status: newStatus,
    workflowMeta: workflowMeta || {},
    lastStatusGroup: toGroup,
  };

  if (toGroup === 'screening' && fromGroup !== 'screening') {
    updates.screeningEnteredAt = new Date();
  }

  if (toGroup === 'exit') {
    updates.lastExitAt = new Date();
    updates.lastExitReason = newStatus;
  }

  await jc.update(updates);

  await JobCandidateStatusEvent.create({
    jobCandidateId: jc.id,
    fromStatus: prevStatus,
    toStatus: newStatus,
    fromGroup,
    toGroup,
    changedByUserId: req?.user?.sub ? String(req.user.sub) : null,
    source,
  });

  return jc.reload();
}

module.exports = {
  applyJobCandidateStatusChange,
};
