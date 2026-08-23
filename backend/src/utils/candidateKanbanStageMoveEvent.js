const { v4: uuidv4 } = require('uuid');
const candidateService = require('../services/candidateService');
const clientService = require('../services/clientService');
const candidatePipelineService = require('../services/candidatePipelineService');
const JobCandidate = require('../models/JobCandidate');
const ClientContact = require('../models/ClientContact');
const jobCandidateProcessJournalService = require('../services/jobCandidateProcessJournalService');
const jobCandidateStatusService = require('../services/jobCandidateStatusService');
const { resolveOutcomeSlaDays, dueDateAfterDaysFromToday } = require('./pipelineMoveTargets');

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const phonesMatch = (a, b) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const tail = (digits) => (digits.length >= 9 ? digits.slice(-9) : digits);
  return tail(left) === tail(right);
};

const resolveClientContactForCandidate = async (clientId, candidate) => {
  const cid = String(clientId || '').trim();
  if (!cid) return null;
  const email = String(candidate?.email || '').trim().toLowerCase();
  const phone = normalizePhone(candidate?.phone);
  if (!email && !phone) return null;

  const contacts = await ClientContact.findAll({
    where: { clientId: cid, isActive: true },
    attributes: ['id', 'name', 'email', 'phone', 'mobilePhone'],
    limit: 500,
  });

  for (const contact of contacts) {
    const contactEmail = String(contact.email || '').trim().toLowerCase();
    if (email && contactEmail && contactEmail === email) {
      return { id: String(contact.id), name: String(contact.name || '').trim() || 'איש קשר' };
    }
    if (
      phone &&
      (phonesMatch(phone, contact.phone) || phonesMatch(phone, contact.mobilePhone))
    ) {
      return { id: String(contact.id), name: String(contact.name || '').trim() || 'איש קשר' };
    }
  }
  return null;
};

const resolveActorLabel = (req, candidate) => {
  const dbUser = req?.dbUser;
  const jwtUser = req?.user || {};
  return (
    jobCandidateProcessJournalService.displayNameFromUser(dbUser) ||
    trim(jwtUser.name) ||
    trim(jwtUser.email) ||
    trim(candidate?.fullName) ||
    'משתמש'
  );
};

const eventLinkedToCandidate = (event, candidateId, contactId, candidateName) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return false;
  const name = trim(candidateName).toLowerCase();
  if (name && trim(event?.contactName).toLowerCase() === name) return true;
  if (String(event?.contactId || '') === cid) return true;
  if (event?.metadata?.candidateId === cid) return true;
  if (event?.metadata?.missingDetailsCompletedCandidate === cid) return true;
  if (event?.metadata?.profileApprovedByCandidate === cid) return true;
  if (contactId && String(event?.contactId || '') === String(contactId)) return true;
  const linked = event?.linkedTo;
  if (linked && typeof linked === 'object' && !Array.isArray(linked)) {
    if (String(linked.id || '') === cid) return true;
    if (contactId && String(linked.id || '') === String(contactId)) return true;
  }
  if (Array.isArray(linked)) {
    return linked.some(
      (item) =>
        String(item?.id || '') === cid ||
        (contactId && String(item?.id || '') === String(contactId)),
    );
  }
  return false;
};

const findLinkedEventIndexes = (prevEvents, candidateId, contactId, candidateName, pipeline) => {
  const linked = [];
  for (let i = 0; i < prevEvents.length; i += 1) {
    const event = prevEvents[i];
    if (event?.isActive === false) continue;
    if (!eventLinkedToCandidate(event, candidateId, contactId, candidateName)) continue;
    linked.push({
      index: i,
      pipelineMatch: eventMatchesPipeline(event, pipeline),
    });
  }
  const pipelineMatched = linked.filter((row) => row.pipelineMatch).map((row) => row.index);
  if (pipelineMatched.length) return pipelineMatched;
  if (linked.length) return [linked[0].index];
  return [];
};

const eventMatchesPipeline = (event, pipeline) => {
  if (!pipeline) return false;
  if (event?.processId && String(event.processId) === String(pipeline.id)) return true;
  const proc = trim(event?.process).toLowerCase();
  const pipeName = trim(pipeline.name).toLowerCase();
  if (proc && pipeName && (proc === pipeName || proc.includes(pipeName) || pipeName.includes(proc))) {
    return true;
  }
  return false;
};

async function recordJobLinkJournals(req, candidateId, toStageName, note, dueDate) {
  const cid = String(candidateId || '').trim();
  if (!cid || !toStageName) return { recorded: 0 };

  const links = await JobCandidate.findAll({
    where: { candidateId: cid },
    order: [['updatedAt', 'DESC']],
    limit: 24,
  });

  const actor = resolveActorLabel(req, null);
  let recorded = 0;

  for (const link of links) {
    const jc = await JobCandidate.findByPk(link.id);
    if (!jc) continue;
    const prevStatus = String(jc.status || '').trim();
    if (prevStatus === toStageName && !note) continue;

    let prevMeta = await jobCandidateProcessJournalService.materializeStatusJournalForPatch(jc);
    if (dueDate) prevMeta.dueDate = dueDate;
    if (note) prevMeta.internalNote = note;
    prevMeta.workflowUpdatedAt = new Date().toISOString();

    const journalMeta = jobCandidateProcessJournalService.applyJournalOnStatusPatch({
      workflowMeta: prevMeta,
      prevStatus,
      newStatus: toStageName,
      actor,
      internalNoteChanged: Boolean(note),
      internalNote: note || prevMeta.internalNote || '',
      dueDate: prevMeta.dueDate || null,
      dueTime: prevMeta.dueTime || null,
      forceAppendStatus: true,
    });

    await jobCandidateStatusService.applyJobCandidateStatusChange({
      jobCandidateId: link.id,
      newStatus: toStageName,
      workflowMeta: journalMeta,
      req,
      source: 'kanban',
    });
    recorded += 1;
  }

  return { recorded };
}

async function recordClientJournal(req, candidateId, pipeline, fromStage, toStage, outcome, dueDate) {
  const cid = String(candidateId || '').trim();
  if (!cid || !pipeline || !toStage) return { recorded: 0 };

  const { resolveClientIdsForCandidateJournal } = require('../services/pipelineOutcomeService');
  const clientIds = await resolveClientIdsForCandidateJournal(cid, req);
  if (!clientIds.length) return { recorded: 0, reason: 'no_client' };

  const candidate = await candidateService.getById(cid);
  const label = trim(candidate?.fullName) || 'מועמד';
  const actor = resolveActorLabel(req, candidate);
  const now = new Date().toISOString();
  const toStageName = trim(toStage.name || toStage.id);
  const summary = toStageName || outcome?.name || trim(toStage.id);
  const note =
    fromStage && toStage && fromStage.id !== toStage.id
      ? `${fromStage.name || fromStage.id} → ${toStageName}`
      : summary;

  let recorded = 0;
  for (const clientId of clientIds) {
    const client = await clientService.getById(clientId);
    const prevEvents = Array.isArray(client?.events) ? client.events : [];
    const contact = await resolveClientContactForCandidate(clientId, candidate);
    const contactId = contact?.id || null;

    const matchingIndexes = findLinkedEventIndexes(
      prevEvents,
      cid,
      contactId,
      label,
      pipeline,
    );

    const newUpdate = {
      id: `u-${Date.now()}-${recorded}`,
      title: summary,
      date: now,
      creator: actor,
    };

    if (matchingIndexes.length > 0) {
      const nextEvents = prevEvents.map((event, index) => {
        if (!matchingIndexes.includes(index)) return event;
        const pipelineMatch = eventMatchesPipeline(event, pipeline);
        return {
          ...event,
          stage: toStageName || event.stage,
          stageId: toStage.id || event.stageId,
          ...(pipelineMatch
            ? {
                processId: pipeline.id,
                process: pipeline.name || event.process,
              }
            : {}),
          status:
            outcome?.actionType === 'freeze'
              ? 'הושלם'
              : event.status === 'הושלם'
                ? event.status
                : event.status || 'עתידי',
          dueDate: dueDate || event.dueDate || null,
          updates: [newUpdate, ...(Array.isArray(event.updates) ? event.updates : [])],
          history: [
            { user: actor, timestamp: now, summary },
            ...(Array.isArray(event.history) ? event.history : []),
          ],
          metadata: {
            ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
            candidateId: cid,
            lastKanbanStageId: toStage.id || null,
            lastKanbanStageName: toStageName || null,
          },
        };
      });
      await clientService.update(clientId, { events: nextEvents });
      recorded += matchingIndexes.length;
      continue;
    }

    const linkedTo = contact
      ? { type: 'איש קשר', id: contact.id, name: contact.name }
      : { type: 'מועמד', id: cid, name: label };
    const event = {
      id: uuidv4(),
      title: `${summary}: ${label}`.slice(0, 240),
      type: [pipeline.name || 'תהליך מועמדים'],
      process: pipeline.name || 'תהליך מועמדים',
      processId: pipeline.id,
      stage: toStage.name || summary,
      stageId: toStage.id || null,
      date: now,
      coordinator: actor,
      creator: actor,
      status: outcome?.actionType === 'freeze' ? 'הושלם' : 'עתידי',
      contactId: contactId || cid,
      contactName: contact?.name || label,
      linkedTo,
      description: note,
      updates: [newUpdate],
      history: [{ user: actor, timestamp: now, summary }],
      metadata: { candidateId: cid, kanbanStageMove: true },
      isActive: true,
      dueDate: dueDate || null,
    };

    await clientService.update(clientId, { events: [event, ...prevEvents] });
    recorded += 1;
  }

  return { recorded };
}

/**
 * After Kanban drag (or any candidate pipeline stage change), sync job-link and client journals.
 */
async function recordCandidateKanbanStageMove(
  req,
  {
    candidateId,
    clientId,
    pipelineId,
    fromStageId,
    toStageId,
    outcome = null,
  } = {},
) {
  const cid = String(candidateId || '').trim();
  const pid = String(pipelineId || '').trim();
  const toId = String(toStageId || '').trim();
  if (!cid || !pid || !toId) return { recorded: false, reason: 'missing_params' };

  const pipelines = await candidatePipelineService.listOrSeedByClientId(clientId);
  const pipeline = pipelines.find((p) => String(p.id) === pid);
  if (!pipeline) return { recorded: false, reason: 'pipeline_not_found' };

  const stages = pipeline.stages || [];
  const fromStage = fromStageId ? stages.find((s) => String(s.id) === String(fromStageId)) : null;
  const toStage = stages.find((s) => String(s.id) === toId);
  if (!toStage) return { recorded: false, reason: 'stage_not_found' };

  let dueDate = null;
  if (outcome) {
    const slaDays = resolveOutcomeSlaDays(outcome, stages);
    if (slaDays > 0) dueDate = dueDateAfterDaysFromToday(slaDays);
  }

  const note =
    outcome?.name && fromStage
      ? `${outcome.name} → ${toStage.name || toStage.id}`
      : fromStage
        ? `${fromStage.name || fromStage.id} → ${toStage.name || toStage.id}`
        : toStage.name || '';

  const toStageName = String(toStage.name || toStage.id).trim();
  const jobLinks = await recordJobLinkJournals(req, cid, toStageName, note, dueDate);
  const clientJournal = await recordClientJournal(
    req,
    cid,
    pipeline,
    fromStage,
    toStage,
    outcome,
    dueDate,
  );

  return {
    recorded: jobLinks.recorded > 0 || clientJournal.recorded > 0,
    jobLinks,
    clientJournal,
  };
}

module.exports = {
  recordCandidateKanbanStageMove,
};
