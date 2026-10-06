function jobMetaFromContext(ctx) {
  const meta = {};
  if (ctx?.candidateId) meta.candidateId = String(ctx.candidateId);
  if (ctx?.jobCandidateId) meta.jobCandidateId = String(ctx.jobCandidateId);
  if (ctx?.job?.id) {
    meta.jobId = String(ctx.job.id);
    const title = trim(ctx.job.title || ctx.job.publicJobTitle);
    if (title) meta.jobTitle = title;
    const company = trim(ctx.job.client);
    if (company) meta.jobCompany = company;
  }
  return meta;
}

function trim(v) {
  return v != null && v !== undefined ? String(v).trim() : '';
}

const { v4: uuidv4 } = require('uuid');
const Candidate = require('../models/Candidate');
const CandidatePipeline = require('../models/CandidatePipeline');
const JobCandidate = require('../models/JobCandidate');
const Job = require('../models/Job');
const User = require('../models/User');
const ClientContact = require('../models/ClientContact');
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
  applyOutcomeSlaDueDateTime,
  dueDateAfterDaysFromToday,
} = require('../utils/pipelineMoveTargets');
const {
  appendClientEventActivity,
  EVENT_CLOSED_SUMMARY,
} = require('../utils/clientEventHistory');
const { resolvePipelineDefaultCoordinatorString } = require('../utils/pipelineDefaultAssignees');

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

async function resolveAutomationTargetPipeline(clientId, pipelineId, pipelineKind = 'client') {
  if (!pipelineId) return { pipeline: null, pipelineKind: null };
  let targetKind = pipelineKind;
  let targetPipeline = await loadPipelineDto(targetKind, clientId, pipelineId);
  if (!targetPipeline) {
    targetKind = pipelineKind === 'candidate' ? 'client' : 'candidate';
    targetPipeline = await loadPipelineDto(targetKind, clientId, pipelineId);
  }
  return { pipeline: targetPipeline, pipelineKind: targetPipeline ? targetKind : null };
}

function resolveAutomationTargetStage(targetPipeline, stageId) {
  const stages = [...(targetPipeline?.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!stages.length) return null;
  if (stageId) {
    return stages.find((s) => String(s.id) === String(stageId)) || stages[0];
  }
  return stages[0];
}

function normalizeCandidatePipelineProcesses(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry, i) => {
      if (!entry || typeof entry !== 'object') return null;
      const pipelineId = String(entry.pipelineId || '').trim();
      const stageId = String(entry.stageId || '').trim();
      if (!pipelineId || !stageId) return null;
      return {
        id: String(entry.id || `cproc-${Date.now()}-${i}`),
        pipelineId,
        stageId,
        targetOutcomeId: entry.targetOutcomeId ? String(entry.targetOutcomeId) : null,
        isActive: entry.isActive !== false,
        openedAt: entry.openedAt || new Date().toISOString(),
        parentPipelineId: entry.parentPipelineId ? String(entry.parentPipelineId) : null,
        parentStageId: entry.parentStageId ? String(entry.parentStageId) : null,
      };
    })
    .filter(Boolean);
}

/** Open a parallel candidate pipeline without changing the primary candidatePipelineId. */
async function appendCandidateParallelPipelineProcess(
  candidateId,
  {
    pipelineId,
    stageId,
    targetOutcomeId = null,
    parentPipelineId = null,
    parentStageId = null,
  } = {},
) {
  const cid = String(candidateId || '').trim();
  const pid = String(pipelineId || '').trim();
  const sid = String(stageId || '').trim();
  if (!cid || !pid || !sid) return null;

  const candidate = await Candidate.findByPk(cid, {
    attributes: ['id', 'candidatePipelineId', 'pipelineStageId', 'candidatePipelineProcesses'],
  });
  if (!candidate) return null;

  if (String(candidate.candidatePipelineId || '') === pid) {
    return { skipped: 'already_primary_pipeline' };
  }

  const now = new Date().toISOString();
  const prev = normalizeCandidatePipelineProcesses(candidate.candidatePipelineProcesses);
  const withoutSameActive = prev.filter(
    (p) => !(p.isActive !== false && String(p.pipelineId) === pid),
  );
  const entry = {
    id: uuidv4(),
    pipelineId: pid,
    stageId: sid,
    targetOutcomeId: targetOutcomeId ? String(targetOutcomeId) : null,
    isActive: true,
    openedAt: now,
    parentPipelineId: parentPipelineId ? String(parentPipelineId) : null,
    parentStageId: parentStageId ? String(parentStageId) : null,
  };

  await candidateService.update(cid, {
    candidatePipelineProcesses: [entry, ...withoutSameActive],
  });
  return { processId: entry.id, entry };
}

async function applyCandidatePrimaryPipelineTransfer(candidateId, targetPipelineId, targetStageId) {
  const cid = String(candidateId || '').trim();
  const pid = String(targetPipelineId || '').trim();
  const sid = targetStageId ? String(targetStageId) : null;
  if (!cid || !pid) return;

  const candidate = await Candidate.findByPk(cid, {
    attributes: ['id', 'candidatePipelineProcesses'],
  });
  const patch = {
    candidatePipelineId: pid,
    pipelineStageId: sid,
  };
  if (candidate) {
    const processes = normalizeCandidatePipelineProcesses(candidate.candidatePipelineProcesses);
    const filtered = processes.filter((p) => String(p.pipelineId) !== pid);
    if (filtered.length !== processes.length) {
      patch.candidatePipelineProcesses = filtered;
    }
  }
  await candidateService.update(cid, patch);
}

async function patchCandidatePipelinePlacement(candidateId, pipelineId, stageId) {
  const cid = String(candidateId || '').trim();
  const pid = String(pipelineId || '').trim();
  const sid = String(stageId || '').trim();
  if (!cid || !pid || !sid) return null;

  const candidate = await Candidate.findByPk(cid, {
    attributes: ['id', 'candidatePipelineId', 'pipelineStageId', 'candidatePipelineProcesses'],
  });
  if (!candidate) return null;

  const isPrimary = String(candidate.candidatePipelineId || '') === pid;
  if (isPrimary || !candidate.candidatePipelineId) {
    return candidateService.update(cid, {
      candidatePipelineId: pid,
      pipelineStageId: sid,
    });
  }

  const processes = normalizeCandidatePipelineProcesses(candidate.candidatePipelineProcesses);
  const idx = processes.findIndex(
    (p) => p.isActive !== false && String(p.pipelineId) === pid,
  );
  if (idx >= 0) {
    processes[idx] = { ...processes[idx], stageId: sid };
    return candidateService.update(cid, { candidatePipelineProcesses: processes });
  }

  return appendCandidateParallelPipelineProcess(cid, { pipelineId: pid, stageId });
}

function summarizeOpenProcess(event) {
  if (!event) return null;
  return {
    eventId: event.id || null,
    processId: event.processId || null,
    stageId: event.stageId || null,
    processName: event.process || null,
    stageName: event.stage || null,
    isActive: event.isActive !== false,
  };
}

async function runOpenAdditionalProcessAutomation(req, automation, ctx, { pipelineKind = 'client' } = {}) {
  if (!automation.pipelineId || !automation.stageId) {
    return { status: 'skipped', reason: 'missing_pipeline_or_stage' };
  }

  const { pipeline: targetPipeline, pipelineKind: targetKind } = await resolveAutomationTargetPipeline(
    ctx.clientId,
    automation.pipelineId,
    pipelineKind,
  );
  if (!targetPipeline) return { status: 'skipped', reason: 'pipeline_not_found' };

  const targetStage = resolveAutomationTargetStage(targetPipeline, automation.stageId);
  if (!targetStage) return { status: 'skipped', reason: 'stage_not_found' };

  let parallelCandidateProcess = null;
  if (ctx.candidateId && targetKind === 'candidate') {
    parallelCandidateProcess = await appendCandidateParallelPipelineProcess(ctx.candidateId, {
      pipelineId: targetPipeline.id,
      stageId: targetStage.id,
      targetOutcomeId: automation.targetOutcomeId || null,
      parentPipelineId: ctx.pipelineId || null,
      parentStageId: ctx.stageId || null,
    });
  }

  const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
  const defaultCoordinator = await resolvePipelineDefaultCoordinatorString(targetPipeline);
  const coordinator = defaultCoordinator || actor;
  const now = new Date().toISOString();
  const client = await clientService.getById(ctx.clientId);
  const prevEvents = Array.isArray(client?.events) ? client.events : [];

  let contactId = null;
  let contactName = '';
  let linkedTo = null;
  let metadata = {};
  let titleBase = '';
  let sourceEvent = ctx.kind === 'client' ? ctx.event : null;

  if (!sourceEvent && ctx.clientEventId) {
    sourceEvent = prevEvents.find((e) => String(e.id) === String(ctx.clientEventId)) || null;
  }

  if (sourceEvent) {
    contactId = sourceEvent.contactId || null;
    contactName = sourceEvent.contactName || '';
    linkedTo = sourceEvent.linkedTo || null;
    metadata = { ...(sourceEvent.metadata && typeof sourceEvent.metadata === 'object' ? sourceEvent.metadata : {}) };
    titleBase = String(sourceEvent.title || contactName || 'אירוע').trim() || 'אירוע';
  } else if (ctx.candidateId) {
    contactId = ctx.candidateId;
    contactName = String(ctx.candidate?.fullName || '').trim() || 'מועמד';
    linkedTo = { type: 'מועמד', id: ctx.candidateId, name: contactName };
    metadata = {
      candidateId: ctx.candidateId,
      ...(ctx.jobCandidateId ? { jobCandidateId: ctx.jobCandidateId } : {}),
      ...(ctx.job?.id ? { jobId: ctx.job.id } : {}),
    };
    titleBase = contactName;
  } else {
    return { status: 'skipped', reason: 'missing_entity' };
  }

  const newEvent = {
    id: uuidv4(),
    title: `${targetPipeline.name}: ${titleBase}`.slice(0, 240),
    type: [targetPipeline.name],
    process: targetPipeline.name,
    processId: targetPipeline.id,
    stage: targetStage.name || '',
    stageId: targetStage.id,
    date: now,
    coordinator,
    creator: coordinator,
    status: 'עתידי',
    contactId,
    contactName,
    linkedTo,
    description: `תהליך נוסף נפתח אוטומטית (${targetPipeline.name} · ${targetStage.name || ''})`,
    updates: [
      {
        id: `u-${Date.now()}`,
        title: `נפתח תהליך נוסף: ${targetPipeline.name}`,
        date: now,
        creator: actor,
      },
    ],
    history: [
      {
        user: actor,
        timestamp: now,
        summary: `נפתח תהליך נוסף: ${targetPipeline.name}`,
      },
    ],
    metadata: {
      ...metadata,
      additionalProcessFromAutomation: true,
      parentEventId: sourceEvent?.id || ctx.clientEventId || null,
    },
    isActive: true,
  };

  await clientService.update(ctx.clientId, { events: [newEvent, ...prevEvents] });

  const openProcesses = [];
  if (sourceEvent && sourceEvent.isActive !== false) {
    openProcesses.push(summarizeOpenProcess(sourceEvent));
  } else if (ctx.pipelineId) {
    const currentPipeline = await loadPipelineDto(pipelineKind, ctx.clientId, ctx.pipelineId);
    const currentStage = (currentPipeline?.stages || []).find((s) => String(s.id) === String(ctx.stageId));
    openProcesses.push({
      eventId: ctx.clientEventId || null,
      processId: ctx.pipelineId,
      stageId: ctx.stageId || null,
      processName: currentPipeline?.name || null,
      stageName: currentStage?.name || null,
      isActive: true,
    });
  }

  openProcesses.push(summarizeOpenProcess(newEvent));

  return {
    status: 'applied',
    action: 'open_additional_process',
    newEventId: newEvent.id,
    pipelineId: targetPipeline.id,
    stageId: targetStage.id,
    pipelineKind: targetKind,
    parallelCandidateProcess,
    openProcesses: openProcesses.filter(Boolean),
  };
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
    const job = await Job.findByPk(jc.jobId, { attributes: ['id', 'clientId', 'client', 'recruiter'] });
    if (job?.clientId) {
      clientId = String(job.clientId);
    } else if (job?.client) {
      clientId = await getClientIdForJobClientLabel(job.client);
    }
  }
  return { jc, clientId, candidateId: jc.candidateId };
}

async function resolveClientIdForCandidate(candidateId, explicitClientId = null) {
  if (explicitClientId) return explicitClientId;

  const candidate = await Candidate.findByPk(candidateId, {
    attributes: ['id', 'candidatePipelineId', 'userId'],
  });

  if (candidate?.candidatePipelineId) {
    const pipeline = await CandidatePipeline.findByPk(candidate.candidatePipelineId, {
      attributes: ['clientId'],
    });
    if (pipeline?.clientId) return pipeline.clientId;
  }

  const links = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['id'],
    order: [['updatedAt', 'DESC']],
    limit: 12,
  });
  for (const link of links) {
    const resolved = await resolveClientIdForJobCandidate(link.id);
    if (resolved.clientId) return resolved.clientId;
  }

  if (candidate?.userId) {
    const user = await User.findByPk(candidate.userId, { attributes: ['clientId'] });
    if (user?.clientId) return user.clientId;
  }

  return null;
}

/** All tenant clients that should receive candidate journal rows (CRM + pipeline + jobs). */
async function resolveClientIdsForCandidateJournal(candidateId, req = null) {
  const ids = new Set();
  const cid = String(candidateId || '').trim();
  if (!cid) return [];

  if (req?.dbUser?.clientId) ids.add(String(req.dbUser.clientId));

  const candidate = await Candidate.findByPk(cid, {
    attributes: ['id', 'userId', 'candidatePipelineId'],
  });
  if (!candidate) return [...ids];

  if (candidate.userId) {
    const user = await User.findByPk(candidate.userId, { attributes: ['clientId'] });
    if (user?.clientId) ids.add(String(user.clientId));
  }

  if (candidate.candidatePipelineId) {
    const pipeline = await CandidatePipeline.findByPk(candidate.candidatePipelineId, {
      attributes: ['clientId'],
    });
    if (pipeline?.clientId) ids.add(String(pipeline.clientId));
  }

  const links = await JobCandidate.findAll({
    where: { candidateId: cid },
    attributes: ['id'],
    order: [['updatedAt', 'DESC']],
    limit: 12,
  });
  for (const link of links) {
    const resolved = await resolveClientIdForJobCandidate(link.id);
    if (resolved.clientId) ids.add(String(resolved.clientId));
  }

  return [...ids];
}

async function buildCandidateDispatchContexts(clientId, candidateId) {
  const candidate = await Candidate.findByPk(candidateId, {
    attributes: ['id', 'candidatePipelineId', 'pipelineStageId', 'candidatePipelineProcesses'],
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

  for (const proc of normalizeCandidatePipelineProcesses(candidate.candidatePipelineProcesses)) {
    if (proc.isActive === false) continue;
    pushContext(proc.pipelineId, proc.stageId, { candidateId });
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

  if (!jc) {
    jc = await JobCandidate.findOne({
      where: { candidateId: candidate.id },
      order: [['updatedAt', 'DESC']],
    });
  }

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

/** Reload clients.events from DB — required before each automation (ctx.client is stale after prior writes). */
async function reloadClientEventContext(ctx) {
  if (!ctx || ctx.kind !== 'client' || !ctx.clientId) return ctx;
  const client = await clientService.getById(ctx.clientId);
  ctx.client = client;
  if (ctx.clientEventId) {
    const events = Array.isArray(client.events) ? client.events : [];
    ctx.event = events.find((e) => String(e.id) === String(ctx.clientEventId)) || ctx.event;
  }
  return ctx;
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

  if (ctx.kind === 'client' && ctx.event) {
    const meta = ctx.event.metadata && typeof ctx.event.metadata === 'object' ? ctx.event.metadata : {};
    const linkedCandidateId =
      meta.candidateId || meta.missingDetailsCompletedCandidate || meta.profileApprovedByCandidate || null;

    const pushCandidateContact = (candidateRow) => {
      if (!candidateRow || !r.candidate) return;
      if (candidateRow.email) emails.push(candidateRow.email);
      if (candidateRow.phone) phones.push(candidateRow.phone);
    };

    if (linkedCandidateId) {
      const candidateRow = await Candidate.findByPk(linkedCandidateId, {
        attributes: ['id', 'email', 'phone'],
      });
      pushCandidateContact(candidateRow);
    }

    const contactId = ctx.event.contactId;
    if (contactId && r.candidate && !linkedCandidateId) {
      const contact = await ClientContact.findByPk(contactId, {
        attributes: ['id', 'email', 'phone', 'mobilePhone'],
      });
      if (contact) {
        if (contact.email) emails.push(contact.email);
        if (contact.phone) phones.push(contact.phone);
        if (contact.mobilePhone) phones.push(contact.mobilePhone);
      } else {
        const candidateRow = await Candidate.findByPk(contactId, {
          attributes: ['id', 'email', 'phone'],
        });
        pushCandidateContact(candidateRow);
      }
    }
  }

  emails.push(...extra.emails);
  phones.push(...extra.phones);

  return {
    emails: [...new Set(emails.map((e) => String(e).trim()).filter(Boolean))],
    phones: [...new Set(phones.map((p) => String(p).trim()).filter(Boolean))],
  };
}

function formatAutomationRecipientLabels(automation, ctx) {
  const r = automation.recipients || {};
  const labels = [];

  if (r.candidate) {
    if (ctx.kind === 'client' && ctx.event) {
      const meta = ctx.event.metadata && typeof ctx.event.metadata === 'object' ? ctx.event.metadata : {};
      const linkedCandidateId =
        meta.candidateId || meta.missingDetailsCompletedCandidate || meta.profileApprovedByCandidate || null;
      const usesClientContact = Boolean(ctx.event.contactId) && !linkedCandidateId;
      labels.push(usesClientContact ? 'איש קשר' : 'מועמד/ת');
    } else {
      labels.push('מועמד/ת');
    }
  }
  if (r.hiringManager) labels.push('מנהל/ת גיוס');
  if (r.coordinator) labels.push('רכז/ת משרה');
  if (String(r.extra || '').trim()) labels.push('נמענים נוספים');

  return labels;
}

async function buildPendingApprovalResult(automation, ctx) {
  let templateName = null;
  if (automation.templateId) {
    const templateRow = await MessageTemplate.findByPk(automation.templateId, { attributes: ['name'] });
    templateName = templateRow?.name || null;
  }

  return {
    status: 'pending_approval',
    automationId: automation.id,
    actionType: automation.actionType || null,
    templateId: automation.templateId || null,
    templateName,
    statusName: automation.statusName || null,
    recipientLabels: formatAutomationRecipientLabels(automation, ctx),
  };
}

async function runAutomation(req, automation, ctx, { skipManualApproval = false, pipelineKind = 'client' } = {}) {
  if (automation.requireManualApproval && !skipManualApproval) {
    return buildPendingApprovalResult(automation, ctx);
  }

  if (ctx.kind === 'client') {
    await reloadClientEventContext(ctx);
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
      const { pipeline: targetPipeline, pipelineKind: targetKind } = await resolveAutomationTargetPipeline(
        ctx.clientId,
        automation.pipelineId,
        pipelineKind,
      );
      if (!targetPipeline) return { status: 'skipped', reason: 'pipeline_not_found' };
      const firstStage = resolveAutomationTargetStage(targetPipeline, automation.stageId);
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
        const fromStageId = ctx.stageId || null;
        if (targetKind === 'candidate') {
          await applyCandidatePrimaryPipelineTransfer(
            ctx.candidateId,
            targetPipeline.id,
            firstStage?.id || null,
          );
          try {
            const { recordCandidateKanbanStageMove } = require('../utils/candidateKanbanStageMoveEvent');
            await recordCandidateKanbanStageMove(req, {
              candidateId: ctx.candidateId,
              clientId: ctx.clientId,
              pipelineId: targetPipeline.id,
              fromStageId,
              toStageId: firstStage?.id,
            });
          } catch (journalErr) {
            console.warn(
              '[pipelineOutcomeService] start_pipeline journal sync failed',
              journalErr?.message || journalErr,
            );
          }
        } else if (ctx.clientEventId) {
          const events = Array.isArray(ctx.client?.events) ? ctx.client.events : [];
          const next = events.map((e) =>
            String(e.id) === String(ctx.clientEventId)
              ? {
                  ...e,
                  processId: targetPipeline.id,
                  process: targetPipeline.name,
                  stageId: firstStage?.id || e.stageId,
                  stage: firstStage?.name || e.stage,
                }
              : e,
          );
          await clientService.update(ctx.clientId, { events: next });
        }
        return { status: 'applied', action: 'start_pipeline', pipelineId: targetPipeline.id };
      }
      if (ctx.candidateId && targetKind === 'candidate') {
        await applyCandidatePrimaryPipelineTransfer(
          ctx.candidateId,
          targetPipeline.id,
          firstStage?.id || null,
        );
        try {
          const { recordCandidateKanbanStageMove } = require('../utils/candidateKanbanStageMoveEvent');
          await recordCandidateKanbanStageMove(req, {
            candidateId: ctx.candidateId,
            clientId: ctx.clientId,
            pipelineId: targetPipeline.id,
            fromStageId: ctx.stageId || null,
            toStageId: firstStage?.id,
          });
        } catch (journalErr) {
          console.warn(
            '[pipelineOutcomeService] start_pipeline journal sync failed',
            journalErr?.message || journalErr,
          );
        }
        return { status: 'applied', action: 'start_pipeline', pipelineId: targetPipeline.id };
      }
      return { status: 'skipped', reason: 'unsupported_context' };
    }
    case 'open_additional_process':
      return runOpenAdditionalProcessAutomation(req, automation, ctx, { pipelineKind });
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
    case 'change_status': {
      const statusName = automation.statusName ? String(automation.statusName).trim() : '';
      if (!statusName) return { status: 'skipped', reason: 'missing_status' };

      let jobCandidateId = ctx.jobCandidateId || ctx.jobCandidate?.id || null;
      if (!jobCandidateId && ctx.candidateId) {
        const links = await JobCandidate.findAll({
          where: { candidateId: ctx.candidateId },
          attributes: ['id'],
          order: [['updatedAt', 'DESC']],
          limit: 1,
        });
        jobCandidateId = links[0]?.id || null;
      }
      if (!jobCandidateId) return { status: 'skipped', reason: 'missing_job_candidate' };

      const jc = ctx.jobCandidate || (await JobCandidate.findByPk(jobCandidateId));
      if (!jc) return { status: 'skipped', reason: 'job_link_not_found' };
      if (String(jc.status || '').trim() === statusName) {
        return { status: 'skipped', reason: 'already_status', statusName };
      }

      const actorName = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser) || 'אוטומציה';
      let prevMeta = await jobCandidateProcessJournalService.materializeStatusJournalForPatch(jc);
      prevMeta.workflowUpdatedAt = new Date().toISOString();
      const journalMeta = jobCandidateProcessJournalService.applyJournalOnStatusPatch({
        workflowMeta: prevMeta,
        prevStatus: jc.status,
        newStatus: statusName,
        actor: actorName,
        internalNoteChanged: false,
        internalNote: prevMeta.internalNote != null ? String(prevMeta.internalNote).trim() : '',
        dueDate: prevMeta.dueDate || null,
        dueTime: prevMeta.dueTime || null,
        forceAppendStatus: true,
      });
      await jobCandidateStatusService.applyJobCandidateStatusChange({
        jobCandidateId,
        newStatus: statusName,
        workflowMeta: journalMeta,
        req,
        source: 'automation',
      });
      return { status: 'applied', action: 'change_status', statusName };
    }
    default:
      return { status: 'skipped', reason: 'unknown_action' };
  }
}

function resolveManualOutcomeJournal(options = {}) {
  const historyTitle = trim(options.historyTitle);
  const historyComment = trim(options.historyComment);
  return {
    historyTitle: historyTitle || null,
    historyComment: historyComment || null,
  };
}

function defaultOutcomeActivitySummary(outcome) {
  if (outcome.actionType === 'close') {
    return outcome.name && trim(outcome.name) && outcome.name !== EVENT_CLOSED_SUMMARY
      ? `${EVENT_CLOSED_SUMMARY} · ${trim(outcome.name)}`
      : EVENT_CLOSED_SUMMARY;
  }
  return outcome.name;
}

function buildClientEventStatusUpdate(actor, outcome, options = {}) {
  const { historyTitle, historyComment } = resolveManualOutcomeJournal(options);
  const activitySummary = historyTitle || defaultOutcomeActivitySummary(outcome);
  const date = new Date().toISOString();
  const newUpdate = {
    id: `u-${Date.now()}`,
    title: activitySummary,
    date,
    creator: actor,
    ...(historyComment ? { comment: historyComment } : {}),
  };
  const historyRow = {
    user: actor,
    timestamp: date,
    summary: activitySummary,
    ...(historyComment ? { comment: historyComment } : {}),
  };
  return { newUpdate, historyRow };
}

async function applyCandidateOutcomeAction(req, ctx, outcome, pipeline, options = {}) {
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
  let dueTime =
    ctx.jobCandidate?.workflowMeta?.dueTime ||
    (ctx.jobCandidate?.workflowMeta && typeof ctx.jobCandidate.workflowMeta === 'object'
      ? ctx.jobCandidate.workflowMeta.dueTime
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
    const slaDue = applyOutcomeSlaDueDateTime(outcome, stages);
    if (slaDue.dueDate) {
      dueDate = slaDue.dueDate;
      dueTime = slaDue.dueTime;
    }
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
    const manualJournal = resolveManualOutcomeJournal(options);
    return {
      nextStageId,
      nextStageName,
      note: manualJournal.historyTitle || note,
      dueDate,
      closed: true,
      historyComment: manualJournal.historyComment || undefined,
    };
  } else {
    const slaDue = applyOutcomeSlaDueDateTime(outcome, stages);
    if (slaDue.dueDate) {
      dueDate = slaDue.dueDate;
      dueTime = slaDue.dueTime;
    }
  }

  const manualJournal = resolveManualOutcomeJournal(options);
  if (manualJournal.historyTitle) note = manualJournal.historyTitle;

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
    if (dueTime !== undefined) prevMeta.dueTime = dueTime;
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

  return {
    nextStageId,
    nextStageName,
    note,
    dueDate,
    dueTime,
    closed: false,
    historyComment: manualJournal.historyComment || undefined,
  };
}

async function applyClientOutcomeAction(req, ctx, outcome, pipeline, options = {}) {
  const stages = pipeline.stages || [];
  const event = ctx.event;
  let nextStageName = event.stage;
  let nextStageId = event.stageId || null;
  let nextStatus = event.status;
  let nextDueDate = event.dueDate || null;
  let nextDueTime = event.dueTime || null;
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
    const slaDue = applyOutcomeSlaDueDateTime(outcome, stages);
    if (slaDue.dueDate) {
      nextDueDate = slaDue.dueDate;
      nextDueTime = slaDue.dueTime;
      nextStatus = 'עתידי';
    }
  } else if (outcome.actionType === 'freeze') {
    nextStatus = 'הושלם';
  } else if (outcome.actionType === 'close') {
    nextIsActive = false;
  } else {
    const slaDue = applyOutcomeSlaDueDateTime(outcome, stages);
    if (slaDue.dueDate) {
      nextDueDate = slaDue.dueDate;
      nextDueTime = slaDue.dueTime;
      nextStatus = 'עתידי';
    }
  }

  const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
  const { newUpdate, historyRow } = buildClientEventStatusUpdate(actor, outcome, options);
  const events = Array.isArray(ctx.client.events) ? ctx.client.events : [];
  const nextEvents = events.map((e) =>
    String(e.id) === String(ctx.clientEventId)
      ? {
          ...e,
          stage: nextStageName,
          stageId: nextStageId,
          status: nextStatus,
          dueDate: nextDueDate,
          dueTime: nextDueTime,
          isActive: nextIsActive,
          updates: [newUpdate, ...(Array.isArray(e.updates) ? e.updates : [])],
          history: [historyRow, ...(Array.isArray(e.history) ? e.history : [])],
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
    nextDueTime,
    nextIsActive,
  };
}

async function syncClientEventAfterCandidateOutcome(
  req,
  clientId,
  clientEventId,
  outcome,
  actionResult,
  ctx = null,
  options = {},
) {
  const cid = String(clientId || '').trim();
  const eventId = String(clientEventId || '').trim();
  if (!cid || !eventId) return null;

  const client = await clientService.getById(cid);
  const events = Array.isArray(client?.events) ? client.events : [];
  const event = events.find((e) => String(e.id) === eventId);
  if (!event) return null;

  const actor = jobCandidateProcessJournalService.displayNameFromUser(req?.dbUser);
  const now = new Date().toISOString();
  const manualJournal = resolveManualOutcomeJournal(options);
  const activitySummary =
    manualJournal.historyTitle ||
    (actionResult?.note && trim(actionResult.note)) ||
    outcome.name;
  const historyComment =
    manualJournal.historyComment || trim(actionResult?.historyComment) || null;

  let nextStageName = actionResult?.nextStageName || event.stage;
  let nextStageId = actionResult?.nextStageId || event.stageId || null;
  let nextStatus = event.status;
  let nextDueDate = actionResult?.dueDate || event.dueDate || null;
  let nextDueTime = actionResult?.dueTime ?? event.dueTime ?? null;
  let nextIsActive = event.isActive !== false;

  if (outcome.actionType === 'freeze') nextStatus = 'הושלם';
  if (outcome.actionType === 'close') nextIsActive = false;

  const newUpdate = {
    id: `u-${Date.now()}`,
    title: activitySummary,
    date: now,
    creator: actor,
    ...(historyComment ? { comment: historyComment } : {}),
  };
  const historyRow = {
    user: actor,
    timestamp: now,
    summary: activitySummary,
    ...(historyComment ? { comment: historyComment } : {}),
  };
  const nextEvents = events.map((e) =>
    String(e.id) === eventId
      ? {
          ...e,
          stage: nextStageName,
          stageId: nextStageId,
          status: nextStatus,
          dueDate: nextDueDate,
          dueTime: nextDueTime,
          isActive: nextIsActive,
          updates: [newUpdate, ...(Array.isArray(e.updates) ? e.updates : [])],
          history: [historyRow, ...(Array.isArray(e.history) ? e.history : [])],
          metadata: {
            ...(e.metadata && typeof e.metadata === 'object' ? e.metadata : {}),
            ...(ctx ? jobMetaFromContext(ctx) : {}),
            lastKanbanStageId: nextStageId,
            lastKanbanStageName: nextStageName,
          },
        }
      : e,
  );
  await clientService.update(cid, { events: nextEvents });
  return nextEvents.find((e) => String(e.id) === eventId) || null;
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
    skipCandidateAction = false,
    historyTitle = '',
    historyComment = '',
  } = params;

  const journalOptions = { historyTitle, historyComment };

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
    if (context.clientEventId) ctx.clientEventId = String(context.clientEventId);
  } else {
    ctx = await buildClientEventContext(clientId, context.clientEventId);
    ctx.stageId = stageId;
    ctx.pipelineId = pipelineId;
    if (context.candidateId) ctx.candidateId = context.candidateId;
    if (context.jobCandidateId) ctx.jobCandidateId = context.jobCandidateId;
  }

  let actionResult;
  if (pipelineKind === 'candidate') {
    if (skipCandidateAction) {
      actionResult = { skippedAction: true };
    } else {
      actionResult = await applyCandidateOutcomeAction(req, ctx, outcome, pipeline, journalOptions);
      if (context.clientEventId) {
        const updatedEvent = await syncClientEventAfterCandidateOutcome(
          req,
          clientId,
          context.clientEventId,
          outcome,
          actionResult,
          ctx,
          journalOptions,
        );
        if (updatedEvent) actionResult.event = updatedEvent;
      }
    }
  } else {
    actionResult = await applyClientOutcomeAction(req, ctx, outcome, pipeline, journalOptions);
    await reloadClientEventContext(ctx);
  }

  const automations = Array.isArray(outcome.automations) ? outcome.automations : [];
  const automationResults = [];
  const skipManualApproval = params.skipManualApproval === true;

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

async function approveAutomations(req, params) {
  const {
    pipelineKind,
    clientId,
    pipelineId,
    stageId,
    outcomeId,
    context = {},
    automationIds = [],
  } = params;

  if (!clientId || !pipelineId || !stageId || !outcomeId) {
    throw Object.assign(new Error('clientId, pipelineId, stageId and outcomeId are required'), { status: 400 });
  }
  const ids = Array.isArray(automationIds)
    ? automationIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (!ids.length) {
    throw Object.assign(new Error('automationIds are required'), { status: 400 });
  }

  const pipeline = await loadPipelineDto(pipelineKind, clientId, pipelineId);
  if (!pipeline) throw Object.assign(new Error('Pipeline not found'), { status: 404 });

  const { outcome } = findOutcomeInPipeline(pipeline, stageId, outcomeId);
  if (!outcome) throw Object.assign(new Error('Outcome not found'), { status: 404 });

  let ctx;
  if (pipelineKind === 'candidate') {
    ctx = await buildCandidateContext(clientId, context.jobCandidateId, context.candidateId);
    ctx.stageId = stageId;
    ctx.pipelineId = pipelineId;
    if (context.clientEventId) ctx.clientEventId = String(context.clientEventId);
  } else {
    ctx = await buildClientEventContext(clientId, context.clientEventId);
    ctx.stageId = stageId;
    ctx.pipelineId = pipelineId;
    if (context.candidateId) ctx.candidateId = context.candidateId;
    if (context.jobCandidateId) ctx.jobCandidateId = context.jobCandidateId;
  }

  if (pipelineKind !== 'candidate') {
    await reloadClientEventContext(ctx);
  }

  const automations = (Array.isArray(outcome.automations) ? outcome.automations : []).filter((a) =>
    ids.includes(String(a.id)),
  );
  if (!automations.length) {
    throw Object.assign(new Error('No matching automations to approve'), { status: 404 });
  }

  const automationResults = [];
  for (const automation of automations) {
    try {
      const result = await runAutomation(req, automation, ctx, { skipManualApproval: true, pipelineKind });
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
    action: 'pipeline_automation_approved',
    description: `אישור ידני לאוטומציות: ${outcome.name}`,
    entityType: pipelineKind === 'candidate' ? 'Candidate' : 'Client',
    entityId: pipelineKind === 'candidate' ? ctx.candidateId : ctx.clientId,
    metadata: {
      pipelineKind,
      pipelineId,
      stageId,
      outcomeId,
      automationIds: ids,
      automationResults,
    },
  });

  return { automationResults };
}

const LEGACY_SYSTEM_EVENT_KEYS = {
  candidate_confirmed_profile: 'מועמד.אישור הפרופיל על ידי המועמד',
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

function collectTriggeredOutcomes(clientPipelines, candidatePipelines, systemEventRowId, triggerName, eventName) {
  const matches = [];
  const seen = new Set();
  const scan = (pipelineKind, pipelines) => {
    for (const pipeline of pipelines || []) {
      for (const stage of pipeline.stages || []) {
        for (const outcome of stage.outcomes || []) {
          if (!triggerMatchesOutcome(outcome.trigger, systemEventRowId, triggerName, eventName)) continue;
          const key = `${pipelineKind}::${pipeline.id}::${stage.id}::${outcome.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          matches.push({
            pipelineKind,
            pipelineId: pipeline.id,
            stageId: stage.id,
            outcomeId: outcome.id,
            pipeline,
            stage,
            outcome,
          });
        }
      }
    }
  };
  scan('candidate', candidatePipelines);
  scan('client', clientPipelines);
  return matches;
}

async function ensureClientEventForCandidate(
  clientId,
  candidateId,
  { pipeline, stage, candidateName, jobCandidateId } = {},
) {
  const cid = String(candidateId || '').trim();
  if (!clientId || !cid) return null;

  const { resolveCandidateJobEventMeta } = require('../utils/candidateKanbanStageMoveEvent');
  const jobMeta = await resolveCandidateJobEventMeta(cid, jobCandidateId);

  const client = await clientService.getById(clientId);
  const prevEvents = Array.isArray(client?.events) ? client.events : [];
  const existing = prevEvents.find((event) => {
    if (event?.isActive === false) return false;
    const meta = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    if (meta.profileCompletenessOnly || meta.missingDetailsCompletedCandidate || meta.profileApprovedByCandidate) {
      return false;
    }
    if (String(event?.contactId || '') === cid) return true;
    if (String(meta.candidateId || '') === cid) return true;
    return false;
  });
  if (existing?.id) {
    const needsJobMeta =
      jobMeta.jobId &&
      (!existing.metadata?.jobId || String(existing.metadata.jobId) !== String(jobMeta.jobId));
    if (needsJobMeta) {
      const nextEvents = prevEvents.map((event) =>
        String(event.id) === String(existing.id)
          ? {
              ...event,
              metadata: {
                ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
                ...jobMeta,
                candidateId: cid,
              },
            }
          : event,
      );
      await clientService.update(clientId, { events: nextEvents });
    }
    return String(existing.id);
  }

  const now = new Date().toISOString();
  const label = String(candidateName || 'מועמד').trim() || 'מועמד';
  const bootstrapCoordinator =
    (await resolvePipelineDefaultCoordinatorString(pipeline)) || 'מערכת';
  const event = {
    id: uuidv4(),
    title: `קליטת קו"ח: ${label}`.slice(0, 240),
    type: [pipeline?.name || 'תהליך'],
    process: pipeline?.name || 'תהליך',
    processId: pipeline?.id || null,
    stage: stage?.name || '',
    stageId: stage?.id || null,
    date: now,
    coordinator: bootstrapCoordinator,
    creator: bootstrapCoordinator,
    status: 'עתידי',
    contactId: cid,
    contactName: label,
    linkedTo: { type: 'מועמד', id: cid, name: label },
    description: '',
    updates: [],
    history: [],
    metadata: { candidateId: cid, systemEventBootstrap: true, ...jobMeta },
    isActive: true,
  };
  await clientService.update(clientId, { events: [event, ...prevEvents] });
  return String(event.id);
}

async function dispatchFromSystemEvent(req, payload) {
  const {
    systemEventRowId,
    triggerName,
    eventName,
    entityType,
    entityId,
    clientId: explicitClientId,
    jobCandidateId: explicitJobCandidateId,
  } = payload;

  if (!systemEventRowId && (!triggerName || !eventName)) return [];

  let clientId = explicitClientId || req?.dbUser?.clientId || null;
  const results = [];

  if (String(entityType || '').toLowerCase() === 'candidate' && entityId) {
    clientId = await resolveClientIdForCandidate(entityId, clientId);
    if (!clientId) {
      console.warn('[pipelineOutcomeService.dispatchFromSystemEvent] no clientId for candidate', entityId);
      return [];
    }

    const clientPipelines = await clientPipelineService.listByClientId(clientId);
    const candidatePipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
    const triggered = collectTriggeredOutcomes(
      clientPipelines,
      candidatePipelines,
      systemEventRowId,
      triggerName,
      eventName,
    );
    if (!triggered.length) return [];

    const candidate = await Candidate.findByPk(entityId, { attributes: ['id', 'fullName'] });
    let jobCandidateId = explicitJobCandidateId ? String(explicitJobCandidateId) : null;
    if (!jobCandidateId) {
      const links = await JobCandidate.findAll({
        where: { candidateId: entityId },
        attributes: ['id'],
        order: [['updatedAt', 'DESC']],
        limit: 1,
      });
      jobCandidateId = links[0]?.id ? String(links[0].id) : null;
    }

    for (const match of triggered) {
      let context = { candidateId: entityId, jobCandidateId };
      if (match.pipelineKind === 'client') {
        const clientEventId = await ensureClientEventForCandidate(clientId, entityId, {
          pipeline: match.pipeline,
          stage: match.stage,
          candidateName: candidate?.fullName,
          jobCandidateId,
        });
        if (!clientEventId) continue;
        context = { clientEventId, candidateId: entityId, jobCandidateId };
      }

      try {
        const result = await executeOutcome(req, {
          pipelineKind: match.pipelineKind,
          clientId,
          pipelineId: match.pipelineId,
          stageId: match.stageId,
          outcomeId: match.outcomeId,
          context,
          source: 'system_event',
        });
        results.push(result);
      } catch (err) {
        console.error('[pipelineOutcomeService.dispatchFromSystemEvent]', err.message || err);
      }
    }

    return results;
  }

  if (String(entityType || '').toLowerCase() === 'client' && entityId) {
    clientId = clientId || entityId;
    const clientPipelines = await clientPipelineService.listByClientId(clientId);
    const candidatePipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
    const triggered = collectTriggeredOutcomes(
      clientPipelines,
      candidatePipelines,
      systemEventRowId,
      triggerName,
      eventName,
    );

    const client = await clientService.getById(entityId);
    const events = Array.isArray(client.events) ? client.events : [];
    const activeEvents = events.filter((e) => e.isActive !== false && e.processId && e.stageId);

    const clientMatches = triggered.filter((m) => m.pipelineKind === 'client');
    for (const match of clientMatches) {
      const linkedEvent =
        activeEvents.find((e) => String(e.processId) === String(match.pipelineId)) || activeEvents[0];
      if (!linkedEvent) continue;
      try {
        const result = await executeOutcome(req, {
          pipelineKind: 'client',
          clientId,
          pipelineId: match.pipelineId,
          stageId: match.stageId,
          outcomeId: match.outcomeId,
          context: { clientEventId: linkedEvent.id },
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

function findMoveOutcomeForTransition(stages, fromStageId, toStageId) {
  if (!fromStageId || !toStageId || fromStageId === toStageId) return null;
  const sourceStage = (stages || []).find((s) => s.id === fromStageId);
  if (!sourceStage) return null;
  for (const outcome of sourceStage.outcomes || []) {
    if (outcome.actionType !== 'move' || !outcome.targetStageId) continue;
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    if (resolved?.stageId === toStageId) return outcome;
  }
  return null;
}

async function inferFirstPipelineStageId(clientId, pipelineId) {
  if (!clientId || !pipelineId) return null;
  const pipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  if (!pipeline) return null;
  const sorted = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted[0]?.id || null;
}

/**
 * Kanban / manual stage drag: run the configured "move" outcome (and its automations)
 * when staff moves a candidate between pipeline stages.
 */
async function executeCandidateKanbanStageMove(req, params) {
  const { candidateId, clientId, pipelineId, fromStageId, toStageId } = params || {};
  if (!candidateId || !clientId || !pipelineId || !fromStageId || !toStageId) {
    return { executed: false, reason: 'missing_params' };
  }
  if (fromStageId === toStageId) {
    return { executed: false, reason: 'same_stage' };
  }

  const pipeline = await loadPipelineDto('candidate', clientId, pipelineId);
  if (!pipeline) return { executed: false, reason: 'pipeline_not_found' };

  const outcome = findMoveOutcomeForTransition(pipeline.stages, fromStageId, toStageId);

  const links = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['id'],
    order: [['updatedAt', 'DESC']],
    limit: 1,
  });
  const jobCandidateId = links[0]?.id || null;

  const { recordCandidateKanbanStageMove } = require('../utils/candidateKanbanStageMoveEvent');
  const journalResult = await recordCandidateKanbanStageMove(req, {
    candidateId,
    clientId,
    pipelineId,
    fromStageId,
    toStageId,
    outcome,
    jobCandidateId,
  });

  if (!outcome) {
    return { executed: false, reason: 'no_matching_outcome', journalResult };
  }

  const result = await executeOutcome(req, {
    pipelineKind: 'candidate',
    clientId,
    pipelineId,
    stageId: fromStageId,
    outcomeId: outcome.id,
    context: { candidateId, jobCandidateId },
    source: 'manual',
    skipCandidateAction: true,
  });

  return { executed: true, outcome, result, journalResult };
}

module.exports = {
  executeOutcome,
  approveAutomations,
  dispatchFromSystemEvent,
  executeCandidateKanbanStageMove,
  findMoveOutcomeForTransition,
  inferFirstPipelineStageId,
  triggerMatchesOutcome,
  collectTriggeredOutcomes,
  resolveClientIdForCandidate,
  resolveClientIdsForCandidateJournal,
  patchCandidatePipelinePlacement,
};
