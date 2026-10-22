const JobCandidate = require('../models/JobCandidate');
const candidatePipelineService = require('./candidatePipelineService');
const candidateService = require('./candidateService');
const jobCandidateProcessJournalService = require('./jobCandidateProcessJournalService');
const jobCandidateStatusService = require('./jobCandidateStatusService');
const { readStageSla, dueDateTimeAfterSla } = require('../utils/slaDuration');

const DEFAULT_NEW_LINK_STATUS = 'חדש';

function isOnboardingCandidatePipeline(pipelineOrName) {
  const name =
    pipelineOrName && typeof pipelineOrName === 'object'
      ? pipelineOrName.name
      : pipelineOrName;
  return /onboarding|קליטת מועמד/i.test(String(name || ''));
}

function isRecruitmentCandidatePipeline(pipelineOrName) {
  const name =
    pipelineOrName && typeof pipelineOrName === 'object'
      ? pipelineOrName.name
      : pipelineOrName;
  return /גיוס/i.test(String(name || ''));
}

/** First recruitment candidate pipeline by sort (e.g. "גיוס — …"), not portal onboarding. */
async function resolvePrimaryCandidatePipelineFirstStage(clientId) {
  const cid = clientId != null ? String(clientId).trim() : '';
  if (!cid) return null;

  const pipelines = await candidatePipelineService.listOrSeedByClientId(cid);
  const pipeline =
    pipelines.find((p) => isRecruitmentCandidatePipeline(p)) ||
    pipelines.find((p) => !isOnboardingCandidatePipeline(p)) ||
    pipelines[0] ||
    null;
  if (!pipeline?.stages?.length) return null;

  const sorted = [...pipeline.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stage = sorted[0];
  const stageName = stage?.name != null ? String(stage.name).trim() : '';
  if (!stageName) return null;

  return { pipeline, stage, stageName };
}

/**
 * After email (or similar) ingest: set job link to recruitment pipeline stage 01 instead of generic "חדש".
 */
async function applyJobLinkOnboardingStageOne({
  jobCandidateId,
  clientId,
  req,
  journalDescription,
  source = 'email_ingest',
} = {}) {
  const jcId = jobCandidateId != null ? String(jobCandidateId).trim() : '';
  if (!jcId || !clientId) return { applied: false, reason: 'missing_ids' };

  const jc = await JobCandidate.findByPk(jcId);
  if (!jc) return { applied: false, reason: 'link_not_found' };

  const primary = await resolvePrimaryCandidatePipelineFirstStage(clientId);
  if (!primary) return { applied: false, reason: 'no_candidate_pipeline' };

  const current = String(jc.status || '').trim() || DEFAULT_NEW_LINK_STATUS;
  if (current === primary.stageName) {
    return { applied: false, reason: 'already_on_stage_one', stageName: primary.stageName };
  }
  if (current !== DEFAULT_NEW_LINK_STATUS) {
    return { applied: false, reason: 'status_already_advanced', status: current };
  }

  const desc =
    (journalDescription && String(journalDescription).trim()) ||
    `קליטת קורות חיים → ${primary.stageName}`;

  const sla = readStageSla(primary.stage);
  const { dueDate, dueTime } =
    sla.value > 0 ? dueDateTimeAfterSla(sla.value, sla.unit) : { dueDate: null, dueTime: null };

  let prevMeta = await jobCandidateProcessJournalService.materializeStatusJournalForPatch(jc);
  if (dueDate) prevMeta.dueDate = dueDate;
  if (dueTime) prevMeta.dueTime = dueTime;
  prevMeta.internalNote = desc;
  prevMeta.workflowUpdatedAt = new Date().toISOString();

  const journalMeta = jobCandidateProcessJournalService.applyJournalOnStatusPatch({
    workflowMeta: prevMeta,
    prevStatus: current,
    newStatus: primary.stageName,
    actor: 'מערכת',
    internalNoteChanged: true,
    internalNote: desc,
    dueDate: prevMeta.dueDate || null,
    dueTime: prevMeta.dueTime || null,
    forceAppendStatus: true,
  });

  await jobCandidateStatusService.applyJobCandidateStatusChange({
    jobCandidateId: jcId,
    newStatus: primary.stageName,
    workflowMeta: journalMeta,
    req,
    source,
  });

  if (jc.candidateId && primary.pipeline?.id && primary.stage?.id) {
    try {
      await candidateService.update(jc.candidateId, {
        candidatePipelineId: primary.pipeline.id,
        pipelineStageId: primary.stage.id,
      });
    } catch (e) {
      console.warn('[jobCandidateOnboardingIngest] kanban sync failed', e?.message || e);
    }
  }

  return { applied: true, stageName: primary.stageName };
}

function outcomeDefersMoveUntilCandidateEmail(outcome, { pipelineKind, source, skipCandidateAction }) {
  if (skipCandidateAction) return false;
  if (pipelineKind !== 'candidate') return false;
  if (source !== 'system_event') return false;
  if (outcome?.actionType !== 'move' || !outcome?.targetStageId) return false;
  const automations = Array.isArray(outcome.automations) ? outcome.automations : [];
  return automations.some(
    (a) => a?.actionType === 'send_email' && a?.recipients && a.recipients.candidate === true,
  );
}

function candidateInviteEmailSent(automationResults) {
  return (automationResults || []).some(
    (r) => r && r.status === 'sent' && r.channel === 'email',
  );
}

async function appendJobLinkJournalSubUpdate(jobCandidateId, title, req) {
  const jcId = jobCandidateId != null ? String(jobCandidateId).trim() : '';
  const summary = String(title || '').trim();
  if (!jcId || !summary) return;

  const jc = await JobCandidate.findByPk(jcId);
  if (!jc) return;

  let meta = jobCandidateProcessJournalService.plainWorkflowMeta(jc.workflowMeta);
  meta = jobCandidateProcessJournalService.applyJournalOnStatusPatch({
    workflowMeta: meta,
    prevStatus: String(jc.status || '').trim(),
    newStatus: String(jc.status || '').trim(),
    actor: jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser) || 'מערכת',
    internalNoteChanged: true,
    internalNote: summary,
    forceAppendStatus: false,
  });
  await jc.update({ workflowMeta: meta });
}

module.exports = {
  DEFAULT_NEW_LINK_STATUS,
  isOnboardingCandidatePipeline,
  isRecruitmentCandidatePipeline,
  resolvePrimaryCandidatePipelineFirstStage,
  /** @deprecated alias */
  resolveOnboardingFirstStage: resolvePrimaryCandidatePipelineFirstStage,
  applyJobLinkOnboardingStageOne,
  outcomeDefersMoveUntilCandidateEmail,
  candidateInviteEmailSent,
  appendJobLinkJournalSubUpdate,
};
