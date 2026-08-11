const { v4: uuidv4 } = require('uuid');
const Candidate = require('../models/Candidate');
const JobCandidate = require('../models/JobCandidate');
const Job = require('../models/Job');
const User = require('../models/User');
const MessageTemplate = require('../models/MessageTemplate');
const clientPipelineService = require('./clientPipelineService');
const candidatePipelineService = require('./candidatePipelineService');
const clientService = require('./clientService');
const candidateService = require('./candidateService');
const jobCandidateStatusService = require('./jobCandidateStatusService');
const jobCandidateProcessJournalService = require('./jobCandidateProcessJournalService');
const messageTemplateService = require('./messageTemplateService');
const inforuService = require('./inforuService');
const smsService = require('./smsService');
const auditLogger = require('../utils/auditLogger');
const { getClientIdForJobClientLabel } = require('./clientUsageSettingService');
const {
  resolveMoveTarget,
  resolveOutcomeSlaDays,
  dueDateAfterDaysFromToday,
} = require('../utils/pipelineMoveTargets');
const {
  appendClientEventActivity,
  EVENT_CLOSED_SUMMARY,
} = require('../utils/clientEventHistory');

function matchStageByName(stages, name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized || !Array.isArray(stages)) return null;
  const exact = stages.find((s) => String(s.name || '').trim().toLowerCase() === normalized);
  if (exact) return exact;
  return (
    stages.find((s) => {
      const stageName = String(s.name || '').trim().toLowerCase();
      return stageName.includes(normalized) || normalized.includes(stageName);
    }) || null
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scheduleDelayMs = (scheduleType, scheduleValue) => {
  const n = Math.max(1, Number(scheduleValue) || 1);
  switch (scheduleType) {
    case 'minutes':
      return n * 60 * 1000;
    case 'hours':
      return n * 60 * 60 * 1000;
    case 'days':
      return n * 24 * 60 * 60 * 1000;
    default:
      return 0;
  }
};

async function loadPipelineDto(pipelineKind, clientId, pipelineId) {
  const list =
    pipelineKind === 'candidate'
      ? await candidatePipelineService.listOrSeedByClientId(clientId)
      : await clientPipelineService.listByClientId(clientId);
  return list.find((p) => p.id === pipelineId) || null;
}

function findOutcomeInPipeline(pipeline, stageId, outcomeId) {
  if (!pipeline) return { stage: null, outcome: null };
  const stage = (pipeline.stages || []).find((s) => s.id === stageId);
  if (!stage) return { stage: null, outcome: null };
  const outcome = (stage.outcomes || []).find((o) => o.id === outcomeId);
  return { stage, outcome: outcome || null };
}

async function resolveClientIdForJobCandidate(jobCandidateId) {
  const jc = await JobCandidate.findByPk(jobCandidateId, { attributes: ['id', 'jobId', 'candidateId'] });
  if (!jc) return { jc: null, clientId: null, candidateId: null };
  let clientId = null;
  if (jc.jobId) {
    const job = await Job.findByPk(jc.jobId, { attributes: ['id', 'client', 'recruiter'] });
    if (job?.client) {
      clientId = await getClientIdForJobClientLabel(job.client);
    }
  }
  return { jc, clientId, candidateId: jc.candidateId };
}

async function resolveClientIdForCandidate(candidateId, explicitClientId = null) {
  if (explicitClientId) return explicitClientId;
  const link = await JobCandidate.findOne({
    where: { candidateId },
    attributes: ['id'],
    order: [['updatedAt', 'DESC']],
  });
  if (link) {
    const resolved = await resolveClientIdForJobCandidate(link.id);
    if (resolved.clientId) return resolved.clientId;
  }
  return null;
}

async function buildCandidateDispatchContexts(clientId, candidateId) {
  const candidate = await Candidate.findByPk(candidateId, {
    attributes: ['id', 'candidatePipelineId', 'pipelineStageId'],
  });
  if (!candidate) return [];

  const pipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
  if (!pipelines.length) return [];

  const seen = new Set();
  const contexts = [];

  const pushContext = (pipelineId, stageId, context) => {
    if (!pipelineId || !stageId) return;
    const key = `${pipelineId}::${stageId}::${context.jobCandidateId || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    contexts.push({
      pipelineKind: 'candidate',
      pipelineId,
      stageId,
      context,
    });
  };

  if (candidate.candidatePipelineId && candidate.pipelineStageId) {
    pushContext(candidate.candidatePipelineId, candidate.pipelineStageId, { candidateId });
  }

  const links = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['id', 'status'],
    order: [['updatedAt', 'DESC']],
    limit: 8,
  });

  for (const link of links) {
    const statusName = String(link.status || '').trim();
    let matched = null;

    if (candidate.candidatePipelineId) {
      const pipe = pipelines.find((p) => p.id === candidate.candidatePipelineId);
      if (pipe) {
        const stage =
          (candidate.pipelineStageId
            ? (pipe.stages || []).find((s) => s.id === candidate.pipelineStageId)
            : null) || matchStageByName(pipe.stages || [], statusName);
        if (stage) {
          pushContext(pipe.id, stage.id, { candidateId, jobCandidateId: link.id });
          continue;
        }
      }
    }

    for (const pipeline of pipelines) {
      const stage = matchStageByName(pipeline.stages || [], statusName);
      if (stage) {
        matched = { pipelineId: pipeline.id, stageId: stage.id };
        break;
      }
    }
    if (matched) {
      pushContext(matched.pipelineId, matched.stageId, { candidateId, jobCandidateId: link.id });
    }
  }

  if (!contexts.length) {
    const firstPipeline = pipelines[0];
    const sortedStages = [...(firstPipeline.stages || [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const firstStage = sortedStages[0];
    if (firstStage) {
      pushContext(firstPipeline.id, firstStage.id, {
        candidateId,
        jobCandidateId: links[0]?.id || null,
      });
    }
  }

  return contexts;
}

async function buildCandidateContext(clientId, jobCandidateId, candidateId) {
  let jc = null;
  if (jobCandidateId) {
    jc = await JobCandidate.findByPk(jobCandidateId);
    if (!jc) throw Object.assign(new Error('Job link not found'), { status: 404 });
    candidateId = jc.candidateId;
  }
  const candidate = await Candidate.findByPk(candidateId);
  if (!candidate) throw Object.assign(new Error('Candidate not found'), { status: 404 });

  let job = null;
  if (jc?.jobId) {
    job = await Job.findByPk(jc.jobId);
  }

  let coordinatorEmail = null;
  if (job?.recruiter) {
    const recruiterName = String(job.recruiter).trim();
    const user = await User.findOne({
      where: { name: recruiterName },
      attributes: ['id', 'email', 'name'],
    });
    coordinatorEmail = user?.email || null;
  }

  return {
    kind: 'candidate',
    clientId,
    candidateId: candidate.id,
    candidate,
    jobCandidateId: jc?.id || null,
    jobCandidate: jc,
    job,
    coordinatorEmail,
  };
}

async function buildClientEventContext(clientId, clientEventId) {
  const client = await clientService.getById(clientId);
  const events = Array.isArray(client.events) ? client.events : [];
  const event = events.find((e) => String(e.id) === String(clientEventId));
  if (!event) throw Object.assign(new Error('Client event not found'), { status: 404 });
  return {
    kind: 'client',
    clientId,
    clientEventId: String(event.id),
    event,
    client,
  };
}

async function dispatchSms({ to, message }) {
  const phones = Array.isArray(to) ? to : [to];
  if (inforuService.isConfigured()) {
    const recipients = phones.map((phone, index) => ({
      phone,
      customerMessageId: `auto_${Date.now()}_${index}`,
    }));
    await inforuService.sendSms({ message, recipients });
    return { provider: 'inforu' };
  }
  if (smsService.isConfigured()) {
    for (const phone of phones) {
      await smsService.sendSms({ to: phone, message });
    }
    return { provider: 'inforu-soap' };
  }
  throw Object.assign(new Error('SMS provider not configured'), { status: 503 });
}

async function sendTemplateSms({ templateId, clientId, toPhones, candidateRecord, placeholderContext }) {
  const row = await MessageTemplate.findByPk(templateId);
  if (!row) throw Object.assign(new Error('Template not found'), { status: 404 });
  const plain = row.get({ plain: true });
  if (!Array.isArray(plain.channels) || !plain.channels.includes('sms')) {
    throw Object.assign(new Error('Template is not an SMS template'), { status: 400 });
  }

  let namedMap = {};
  if (candidateRecord) {
    namedMap = await messageTemplateService.buildNamedPlaceholdersFromCandidate(
      candidateRecord,
      placeholderContext || {},
    );
  }
  let body = messageTemplateService.applyNamedPlaceholders(String(plain.body || ''), namedMap);
  body = messageTemplateService.applyNumberedPlaceholders(body, []);

  const phones = (Array.isArray(toPhones) ? toPhones : [toPhones]).filter(Boolean);
  if (!phones.length) throw Object.assign(new Error('No valid SMS recipients'), { status: 400 });

  await dispatchSms({ to: phones, message: body });
  return { templateName: plain.name, phones };
}

async function sendTemplateEmail({ templateId, clientId, toEmails, candidateRecord, placeholderContext }) {
  const row = await MessageTemplate.findByPk(templateId);
  if (!row) throw Object.assign(new Error('Template not found'), { status: 404 });
  const plain = row.get({ plain: true });
  const emails = (Array.isArray(toEmails) ? toEmails : [toEmails]).filter((e) => e && String(e).includes('@'));
  if (!emails.length) throw Object.assign(new Error('No valid email recipients'), { status: 400 });

  const results = [];
  for (const toEmail of emails) {
    const result = await messageTemplateService.sendScopedTemplateEmail({
      name: plain.name,
      toEmail,
      clientId,
      candidateRecord,
      placeholderContext,
    });
    results.push(result);
  }
  return { templateName: plain.name, emails, results };
}

function parseExtraRecipients(extra) {
  const raw = String(extra || '').trim();
  if (!raw) return { emails: [], phones: [] };
  const parts = raw.split(/[;,\n]+/).map((s) => s.trim()).filter(Boolean);
  const emails = parts.filter((p) => p.includes('@'));
  const phones = parts.filter((p) => !p.includes('@'));
  return { emails, phones };
}

async function resolveAutomationRecipients(automation, ctx) {
  const r = automation.recipients || {};
  const emails = [];
  const phones = [];
  const extra = parseExtraRecipients(r.extra);

  if (ctx.kind === 'candidate' && ctx.candidate) {
    if (r.candidate) {
      if (ctx.candidate.email) emails.push(ctx.candidate.email);
      if (ctx.candidate.phone) phones.push(ctx.candidate.phone);
      if (ctx.candidate.mobile) phones.push(ctx.candidate.mobile);
    }
    if (r.coordinator && ctx.coordinatorEmail) emails.push(ctx.coordinatorEmail);
    // hiringManager — best-effort from job metadata when available
    if (r.hiringManager && ctx.job?.contactEmail) emails.push(ctx.job.contactEmail);
  }

  emails.push(...extra.emails);
  phones.push(...extra.phones);

  return {
    emails: [...new Set(emails.map((e) => String(e).trim()).filter(Boolean))],
    phones: [...new Set(phones.map((p) => String(p).trim()).filter(Boolean))],
  };
}

async function runAutomation(req, automation, ctx, { skipManualApproval = false, pipelineKind = 'client' } = {}) {
  if (automation.requireManualApproval && !skipManualApproval) {
    return { status: 'pending_approval', automationId: automation.id };
  }

  const delayMs = scheduleDelayMs(automation.scheduleType, automation.scheduleValue);
  if (delayMs > 0) {
    await sleep(Math.min(delayMs, 5000));
  }

  const placeholderContext = ctx.job ? { jobId: ctx.job.id } : {};

  switch (automation.actionType) {
    case 'send_email': {
      if (!automation.templateId) {
        return { status: 'skipped', reason: 'missing_template' };
      }
      const { emails } = await resolveAutomationRecipients(automation, ctx);
      if (!emails.length) return { status: 'skipped', reason: 'no_recipients' };
      const sent = await sendTemplateEmail({
        templateId: automation.templateId,
        clientId: ctx.clientId,
        toEmails: emails,
        candidateRecord: ctx.candidate || null,
        placeholderContext,
      });
      return { status: 'sent', channel: 'email', ...sent };
    }
    case 'send_sms': {
      if (!automation.templateId) {
        return { status: 'skipped', reason: 'missing_template' };
      }
      const { phones } = await resolveAutomationRecipients(automation, ctx);
      if (!phones.length) return { status: 'skipped', reason: 'no_recipients' };
      const sent = await sendTemplateSms({
        templateId: automation.templateId,
        clientId: ctx.clientId,
        toPhones: phones,
        candidateRecord: ctx.candidate || null,
        placeholderContext,
      });
      return { status: 'sent', channel: 'sms', ...sent };
    }
    case 'start_pipeline': {
      if (!automation.pipelineId) return { status: 'skipped', reason: 'missing_pipeline' };
      const targetKind = pipelineKind === 'candidate' ? 'candidate' : 'client';
      const targetPipeline = await loadPipelineDto(targetKind, ctx.clientId, automation.pipelineId);
      if (!targetPipeline) return { status: 'skipped', reason: 'pipeline_not_found' };
      const firstStage = [...(targetPipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
      if (ctx.kind === 'client' && ctx.event) {
        const events = Array.isArray(ctx.client.events) ? ctx.client.events : [];
        const next = events.map((e) =>
          String(e.id) === String(ctx.clientEventId)
            ? {
                ...e,
                processId: targetPipeline.id,
                process: targetPipeline.name,
                stageId: firstStage?.id || e.stageId,
                stage: firstStage?.name || e.stage,
                updates: [
                  {
                    id: `u-${Date.now()}`,
                    title: `הועבר לתהליך: ${targetPipeline.name}`,
                    date: new Date().toISOString(),
                    creator: jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser),
                  },
                  ...(Array.isArray(e.updates) ? e.updates : []),
                ],
              }
            : e,
        );
        await clientService.update(ctx.clientId, { events: next });
        return { status: 'applied', action: 'start_pipeline', pipelineId: targetPipeline.id };
      }
      if (ctx.kind === 'candidate' && ctx.candidateId) {
        await candidateService.update(ctx.candidateId, {
          candidatePipelineId: automation.pipelineId,
          pipelineStageId: firstStage?.id || null,
        });
        return { status: 'applied', action: 'start_pipeline', pipelineId: targetPipeline.id };
      }
      return { status: 'skipped', reason: 'unsupported_context' };
    }
    case 'close_event': {
      if (ctx.kind === 'client' && ctx.event) {
        const events = Array.isArray(ctx.client.events) ? ctx.client.events : [];
        const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
        const next = events.map((e) => {
          if (String(e.id) !== String(ctx.clientEventId)) return e;
          return appendClientEventActivity({ ...e, isActive: false }, {
            summary: EVENT_CLOSED_SUMMARY,
            actor,
          });
        });
        await clientService.update(ctx.clientId, { events: next });
        return { status: 'applied', action: 'close_event' };
      }
      if (ctx.kind === 'candidate' && ctx.jobCandidate) {
        const wm = jobCandidateProcessJournalService.plainWorkflowMeta(ctx.jobCandidate.workflowMeta);
        const journal = Array.isArray(wm.statusJournal) ? wm.statusJournal : [];
        if (journal[0]) {
          const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
          journal[0] = jobCandidateProcessJournalService.appendJournalEntryActivity(journal[0], {
            summary: EVENT_CLOSED_SUMMARY,
            actor,
            isActive: false,
          });
          wm.statusJournal = journal;
          await JobCandidate.update({ workflowMeta: wm }, { where: { id: ctx.jobCandidate.id } });
        }
        return { status: 'applied', action: 'close_event' };
      }
      return { status: 'skipped', reason: 'unsupported_context' };
    }
    default:
      return { status: 'skipped', reason: 'unknown_action' };
  }
}

async function applyCandidateOutcomeAction(req, ctx, outcome, pipeline) {
  const stages = pipeline.stages || [];
  const currentStage = stages.find((s) => s.id === ctx.stageId) || null;
  let nextStageId = currentStage?.id || ctx.stageId;
  let nextStageName = currentStage?.name || ctx.jobCandidate?.status || '';
  let note = outcome.name;
  let dueDate =
    ctx.jobCandidate?.workflowMeta?.dueDate ||
    (ctx.jobCandidate?.workflowMeta && typeof ctx.jobCandidate.workflowMeta === 'object'
      ? ctx.jobCandidate.workflowMeta.dueDate
      : null) ||
    null;

  if (outcome.actionType === 'move' && outcome.targetStageId) {
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    if (resolved) {
      nextStageId = resolved.stageId;
      nextStageName = resolved.stageName;
      note = resolved.outcomeName ? `${outcome.name} → ${resolved.outcomeName}` : `${outcome.name} → ${resolved.stageName}`;
    } else {
      const target = stages.find((s) => s.id === outcome.targetStageId);
      nextStageId = outcome.targetStageId;
      nextStageName = target?.name || outcome.name;
      note = target ? `${outcome.name} → ${target.name}` : outcome.name;
    }
    const slaDays = resolveOutcomeSlaDays(outcome, stages);
    if (slaDays > 0) dueDate = dueDateAfterDaysFromToday(slaDays);
  } else if (outcome.actionType === 'freeze') {
    note = outcome.name;
  } else if (outcome.actionType === 'close') {
    if (ctx.jobCandidate) {
      const wm = jobCandidateProcessJournalService.plainWorkflowMeta(ctx.jobCandidate.workflowMeta);
      const journal = Array.isArray(wm.statusJournal) ? wm.statusJournal : [];
      if (journal[0]) {
        const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
        const closeSummary =
          outcome.name && String(outcome.name).trim() && outcome.name !== EVENT_CLOSED_SUMMARY
            ? `${EVENT_CLOSED_SUMMARY} · ${String(outcome.name).trim()}`
            : EVENT_CLOSED_SUMMARY;
        journal[0] = jobCandidateProcessJournalService.appendJournalEntryActivity(journal[0], {
          summary: closeSummary,
          actor,
          isActive: false,
        });
        wm.statusJournal = journal;
        await JobCandidate.update({ workflowMeta: wm }, { where: { id: ctx.jobCandidate.id } });
      }
    }
    return { nextStageId, nextStageName, note, dueDate, closed: true };
  } else {
    const slaDays = resolveOutcomeSlaDays(outcome, stages);
    if (slaDays > 0) dueDate = dueDateAfterDaysFromToday(slaDays);
  }

  if (ctx.candidateId && nextStageId) {
    await candidateService.update(ctx.candidateId, {
      candidatePipelineId: pipeline.id,
      pipelineStageId: nextStageId,
    });
  }

  if (ctx.jobCandidateId) {
    const jc = await JobCandidate.findByPk(ctx.jobCandidateId);
    if (!jc) throw Object.assign(new Error('Job link not found'), { status: 404 });
    ctx.jobCandidate = jc;
    const actorName = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
    let prevMeta = await jobCandidateProcessJournalService.materializeStatusJournalForPatch(ctx.jobCandidate);
    if (dueDate) prevMeta.dueDate = dueDate;
    prevMeta.internalNote = note;
    prevMeta.workflowUpdatedAt = new Date().toISOString();
    const journalMeta = jobCandidateProcessJournalService.applyJournalOnStatusPatch({
      workflowMeta: prevMeta,
      prevStatus: ctx.jobCandidate.status,
      newStatus: String(nextStageName || ctx.jobCandidate.status).trim(),
      actor: actorName,
      internalNoteChanged: true,
      internalNote: note,
      dueDate: prevMeta.dueDate || null,
      dueTime: prevMeta.dueTime || null,
      forceAppendStatus: true,
    });
    await jobCandidateStatusService.applyJobCandidateStatusChange({
      jobCandidateId: ctx.jobCandidateId,
      newStatus: String(nextStageName || ctx.jobCandidate.status).trim(),
      workflowMeta: journalMeta,
      req,
      source: 'pipeline_outcome',
    });
  }

  return { nextStageId, nextStageName, note, dueDate, closed: false };
}

async function applyClientOutcomeAction(req, ctx, outcome, pipeline) {
  const stages = pipeline.stages || [];
  const event = ctx.event;
  let nextStageName = event.stage;
  let nextStageId = event.stageId || null;
  let nextStatus = event.status;
  let nextDueDate = event.dueDate || null;
  let nextIsActive = event.isActive !== false;

  if (outcome.actionType === 'move' && outcome.targetStageId) {
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    if (resolved) {
      nextStageId = resolved.stageId;
      nextStageName = resolved.stageName;
    } else {
      const target = stages.find((s) => s.id === outcome.targetStageId);
      nextStageId = outcome.targetStageId;
      nextStageName = target?.name || outcome.name;
    }
    const slaDays = resolveOutcomeSlaDays(outcome, stages);
    if (slaDays > 0) {
      nextDueDate = dueDateAfterDaysFromToday(slaDays);
      nextStatus = 'עתידי';
    }
  } else if (outcome.actionType === 'freeze') {
    nextStatus = 'הושלם';
  } else if (outcome.actionType === 'close') {
    nextIsActive = false;
  } else {
    const slaDays = resolveOutcomeSlaDays(outcome, stages);
    if (slaDays > 0) {
      nextDueDate = dueDateAfterDaysFromToday(slaDays);
      nextStatus = 'עתידי';
    }
  }

  const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
  const activitySummary =
    outcome.actionType === 'close'
      ? outcome.name && String(outcome.name).trim() && outcome.name !== EVENT_CLOSED_SUMMARY
        ? `${EVENT_CLOSED_SUMMARY} · ${String(outcome.name).trim()}`
        : EVENT_CLOSED_SUMMARY
      : outcome.name;
  const newUpdate = {
    id: `u-${Date.now()}`,
    title: activitySummary,
    date: new Date().toISOString(),
    creator: actor,
  };
  const events = Array.isArray(ctx.client.events) ? ctx.client.events : [];
  const nextEvents = events.map((e) =>
    String(e.id) === String(ctx.clientEventId)
      ? {
          ...e,
          stage: nextStageName,
          stageId: nextStageId,
          status: nextStatus,
          dueDate: nextDueDate,
          isActive: nextIsActive,
          updates: [newUpdate, ...(Array.isArray(e.updates) ? e.updates : [])],
          history: [
            { user: actor, timestamp: newUpdate.date, summary: activitySummary },
            ...(Array.isArray(e.history) ? e.history : []),
          ],
        }
      : e,
  );
  await clientService.update(ctx.clientId, { events: nextEvents });
  const updatedEvent = nextEvents.find((e) => String(e.id) === String(ctx.clientEventId));

  return {
    event: updatedEvent,
    nextStageId,
    nextStageName,
    nextStatus,
    nextDueDate,
    nextIsActive,
  };
}

async function executeOutcome(req, params) {
  const {
    pipelineKind,
    clientId,
    pipelineId,
    stageId,
    outcomeId,
    context = {},
    source = 'manual',
  } = params;

  if (!clientId || !pipelineId || !stageId || !outcomeId) {
    throw Object.assign(new Error('clientId, pipelineId, stageId and outcomeId are required'), { status: 400 });
  }

  const pipeline = await loadPipelineDto(pipelineKind, clientId, pipelineId);
  if (!pipeline) throw Object.assign(new Error('Pipeline not found'), { status: 404 });

  const { stage, outcome } = findOutcomeInPipeline(pipeline, stageId, outcomeId);
  if (!stage || !outcome) throw Object.assign(new Error('Outcome not found'), { status: 404 });

  let ctx;
  if (pipelineKind === 'candidate') {
    ctx = await buildCandidateContext(clientId, context.jobCandidateId, context.candidateId);
    ctx.stageId = stageId;
    ctx.pipelineId = pipelineId;
  } else {
    ctx = await buildClientEventContext(clientId, context.clientEventId);
    ctx.stageId = stageId;
    ctx.pipelineId = pipelineId;
  }

  let actionResult;
  if (pipelineKind === 'candidate') {
    actionResult = await applyCandidateOutcomeAction(req, ctx, outcome, pipeline);
  } else {
    actionResult = await applyClientOutcomeAction(req, ctx, outcome, pipeline);
  }

  const automations = Array.isArray(outcome.automations) ? outcome.automations : [];
  const automationResults = [];
  // Staff manual clicks and system-event triggers both execute configured automations.
  const skipManualApproval = source === 'system_event' || source === 'manual';

  for (const automation of automations) {
    try {
      const result = await runAutomation(req, automation, ctx, { skipManualApproval, pipelineKind });
      automationResults.push({ automationId: automation.id, ...result });
    } catch (err) {
      automationResults.push({
        automationId: automation.id,
        status: 'error',
        message: err.message || String(err),
      });
    }
  }

  await auditLogger.log(req, {
    level: 'info',
    action: 'pipeline_outcome',
    description: `תוצאת pipeline: ${outcome.name}`,
    entityType: pipelineKind === 'candidate' ? 'Candidate' : 'Client',
    entityId: pipelineKind === 'candidate' ? ctx.candidateId : ctx.clientId,
    metadata: {
      pipelineKind,
      pipelineId,
      stageId,
      outcomeId,
      outcomeName: outcome.name,
      source,
      actionResult,
      automationResults,
    },
  });

  return {
    outcome: { id: outcome.id, name: outcome.name, actionType: outcome.actionType },
    actionResult,
    automationResults,
  };
}

const LEGACY_SYSTEM_EVENT_KEYS = {
  candidate_confirmed_profile: 'מועמד.אישר את הפרופיל',
  candidate_confirmed_interview: 'מועמד.אישר_הגעה_לראיון',
  candidate_canceled_interview: 'מועמד.ביטל_הגעה_לראיון',
  candidate_requested_reschedule: 'מועמד.ביקש_לשנות_מועד',
  form_completed_onboarding: 'טופס.קליטה_הושלם',
  form_completed_tech_test: 'טופס.מבחן_מקצועי_הוגש',
  bg_check_passed: 'בדיקת_רקע.עבר_בהצלחה',
  hris_sync_completed: 'מערכת_HR.סנכרון_הושלם',
};

function triggerMatchesOutcome(trigger, systemEventRowId, triggerName, eventName) {
  if (!trigger || trigger.type !== 'system_event' || !trigger.systemEventId) return false;
  const configured = String(trigger.systemEventId);
  if (configured === String(systemEventRowId)) return true;
  if (configured === `${triggerName}::${eventName}`) return true;
  const legacyLabel = LEGACY_SYSTEM_EVENT_KEYS[configured];
  if (legacyLabel) {
    const composite = `${triggerName}.${eventName}`;
    if (legacyLabel === composite) return true;
  }
  return false;
}

async function dispatchFromSystemEvent(req, payload) {
  const {
    systemEventRowId,
    triggerName,
    eventName,
    entityType,
    entityId,
    clientId: explicitClientId,
  } = payload;

  if (!systemEventRowId && (!triggerName || !eventName)) return [];

  let clientId = explicitClientId || req?.dbUser?.clientId || null;
  let contexts = [];

  if (String(entityType || '').toLowerCase() === 'candidate' && entityId) {
    clientId = await resolveClientIdForCandidate(entityId, clientId);
    if (!clientId) return [];
    contexts = await buildCandidateDispatchContexts(clientId, entityId);
  } else if (String(entityType || '').toLowerCase() === 'client' && entityId) {
    clientId = clientId || entityId;
    const client = await clientService.getById(entityId);
    const events = Array.isArray(client.events) ? client.events : [];
    for (const ev of events.filter((e) => e.isActive !== false).slice(0, 20)) {
      if (ev.processId && ev.stageId) {
        contexts.push({
          pipelineKind: 'client',
          pipelineId: ev.processId,
          stageId: ev.stageId,
          context: { clientEventId: ev.id },
        });
      }
    }
  }

  if (!clientId || !contexts.length) return [];

  const clientPipelines = await clientPipelineService.listByClientId(clientId);
  const candidatePipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
  const results = [];

  for (const item of contexts) {
    const pipelines = item.pipelineKind === 'candidate' ? candidatePipelines : clientPipelines;
    const pipeline = pipelines.find((p) => p.id === item.pipelineId);
    if (!pipeline) continue;
    const stage = (pipeline.stages || []).find((s) => s.id === item.stageId);
    if (!stage) continue;

    for (const outcome of stage.outcomes || []) {
      if (!triggerMatchesOutcome(outcome.trigger, systemEventRowId, triggerName, eventName)) continue;
      try {
        const result = await executeOutcome(req, {
          pipelineKind: item.pipelineKind,
          clientId,
          pipelineId: item.pipelineId,
          stageId: item.stageId,
          outcomeId: outcome.id,
          context: item.context,
          source: 'system_event',
        });
        results.push(result);
      } catch (err) {
        console.error('[pipelineOutcomeService.dispatchFromSystemEvent]', err.message || err);
      }
    }
  }

  return results;
}

module.exports = {
  executeOutcome,
  dispatchFromSystemEvent,
  triggerMatchesOutcome,
};
