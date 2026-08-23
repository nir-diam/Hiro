const { v4: uuidv4 } = require('uuid');
const systemEventEmitter = require('./systemEventEmitter');
const SYSTEM_EVENTS = require('./systemEventCatalog');
const candidateService = require('../services/candidateService');
const clientService = require('../services/clientService');
const JobCandidate = require('../models/JobCandidate');
const ClientContact = require('../models/ClientContact');
const jobCandidateProcessJournalService = require('../services/jobCandidateProcessJournalService');
const { resolveClientIdsForCandidateJournal } = require('../services/pipelineOutcomeService');

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

/** Candidate journal event when display-required profile fields are all filled. */
const CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE = 'השלמת פרטים חסרים';

const normalizeTypes = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
  }
  const s = raw == null ? '' : String(raw).trim();
  return s ? [s] : [];
};

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

const hasMissingDetailsCompletedEvent = (events) =>
  (Array.isArray(events) ? events : []).some((event) =>
    normalizeTypes(event?.type).includes(CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE),
  );

const hasClientMissingDetailsEvent = (events, candidateId) => {
  const cid = String(candidateId || '').trim();
  return (Array.isArray(events) ? events : []).some((event) => {
    if (event?.metadata?.missingDetailsCompletedCandidate === cid) return true;
    if (!normalizeTypes(event?.type).includes(CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE)) {
      return false;
    }
    const linked = event?.linkedTo;
    if (linked && typeof linked === 'object' && !Array.isArray(linked)) {
      return String(linked.id || '') === cid;
    }
    return false;
  });
};

const hasJobLinkMissingDetails = (meta, candidateId) => {
  const cid = String(candidateId || '').trim();
  const journal = Array.isArray(meta?.statusJournal) ? meta.statusJournal : [];
  return journal.some((entry) => {
    if (String(entry?.status || '').trim() === CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE) {
      return true;
    }
    if (entry?.metadata?.missingDetailsCompletedCandidate === cid) return true;
    return (Array.isArray(entry?.updates) ? entry.updates : []).some((update) =>
      normalizeTypes(update?.title).includes(CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE),
    );
  });
};

const resolveActorLabel = (candidate, req) => {
  const dbUser = req?.dbUser;
  const jwtUser = req?.user || {};
  return (
    (dbUser && `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim()) ||
    trim(dbUser?.fullName) ||
    trim(jwtUser.name) ||
    trim(jwtUser.email) ||
    trim(dbUser?.email) ||
    trim(candidate?.fullName) ||
    'משתמש'
  );
};

const buildDescription = (candidate, resolvedFields) => {
  const label = trim(candidate?.fullName) || 'מועמד';
  const fieldsLine =
    Array.isArray(resolvedFields) && resolvedFields.length
      ? resolvedFields.join(', ')
      : 'כל השדות הנדרשים';
  return `${label}: הושלמו פרטים שהיו חסרים (${fieldsLine}).`;
};

const buildJournalEvent = (candidate, actor, resolvedFields) => {
  const label = trim(candidate?.fullName) || 'מועמד';
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: [CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE],
    date: now,
    coordinator: actor,
    status: 'הושלם',
    linkedTo: [{ type: 'מועמד', name: label }],
    description: buildDescription(candidate, resolvedFields),
    notes: '',
    history: [{ user: actor, timestamp: now, summary: 'יצר את האירוע' }],
  };
};

/**
 * Append rows to job_candidates.workflowMeta.statusJournal for all job links.
 */
const recordMissingDetailsJobLinkJournals = async (
  candidateId,
  { candidateRow, actorLabel, resolvedFields } = {},
) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return { recorded: 0 };

  const candidate = candidateRow || (await candidateService.getById(cid));
  const actor = actorLabel || resolveActorLabel(candidate, null);
  const description = buildDescription(candidate, resolvedFields);

  const links = await JobCandidate.findAll({
    where: { candidateId: cid },
    attributes: ['id', 'workflowMeta'],
    order: [['updatedAt', 'DESC']],
    limit: 24,
  });

  let recorded = 0;
  for (const link of links) {
    const meta = jobCandidateProcessJournalService.plainWorkflowMeta(link.workflowMeta);
    if (hasJobLinkMissingDetails(meta, cid)) continue;

    const nextMeta = jobCandidateProcessJournalService.appendStatusJournal(meta, {
      status: CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE,
      description,
      creator: actor,
      forceNew: true,
    });
    if (nextMeta.statusJournal?.[0]) {
      nextMeta.statusJournal[0].metadata = { missingDetailsCompletedCandidate: cid };
    }
    await link.update({ workflowMeta: nextMeta });
    recorded += 1;
  }

  return { recorded };
};

/**
 * Append completed rows to clients.events for the cross-client process journal.
 */
const recordMissingDetailsClientJournal = async (
  req,
  candidateId,
  { candidateRow, actorLabel, resolvedFields } = {},
) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return { recorded: false };

  const clientIds = await resolveClientIdsForCandidateJournal(cid, req);
  if (!clientIds.length) return { recorded: false, reason: 'no_client' };

  const candidate = candidateRow || (await candidateService.getById(cid));
  const label = trim(candidate?.fullName) || 'מועמד';
  const actor = actorLabel || resolveActorLabel(candidate, req);
  const now = new Date().toISOString();
  const description = buildDescription(candidate, resolvedFields);
  const fieldsLine =
    Array.isArray(resolvedFields) && resolvedFields.length
      ? resolvedFields.join(', ')
      : 'כל השדות הנדרשים';

  const clients = [];
  for (const clientId of clientIds) {
    const client = await clientService.getById(clientId);
    const prevEvents = Array.isArray(client?.events) ? client.events : [];
    if (hasClientMissingDetailsEvent(prevEvents, cid)) {
      clients.push({ clientId, recorded: false, reason: 'already_recorded' });
      continue;
    }

    const contact = await resolveClientContactForCandidate(clientId, candidate);
    const linkedTo = contact
      ? { type: 'איש קשר', id: contact.id, name: contact.name }
      : { type: 'מועמד', id: cid, name: label };
    const event = {
      id: uuidv4(),
      title: `השלמת פרטים: ${label}`.slice(0, 240),
      type: ['שלמות נתוני מועמד', CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE],
      process: 'שלמות נתוני מועמד',
      stage: CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE,
      date: now,
      coordinator: actor,
      creator: actor,
      status: 'הושלם',
      contactId: contact?.id || cid,
      contactName: contact?.name || label,
      linkedTo,
      description,
      history: [
        {
          user: actor,
          timestamp: now,
          summary: CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE,
        },
      ],
      metadata: {
        missingDetailsCompletedCandidate: cid,
        candidateId: cid,
        resolvedFields: fieldsLine,
      },
      isActive: true,
    };

    await clientService.update(clientId, { events: [event, ...prevEvents] });
    clients.push({ clientId, recorded: true, eventId: event.id });
  }

  const recorded = clients.some((row) => row.recorded);
  return { recorded, clients };
};

/**
 * When profile display fields go from missing → complete, append journal event + emit system event.
 * Idempotent: skips if journal already contains this event type.
 */
const recordMissingDetailsCompleted = async (
  req,
  candidateId,
  { candidateRow, previousMissingLabels, actorLabel } = {},
) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return { recorded: false };

  const candidate = candidateRow || (await candidateService.getById(cid));
  const prevEvents = Array.isArray(candidate?.events) ? candidate.events : [];
  const alreadyOnCandidate = hasMissingDetailsCompletedEvent(prevEvents);

  const actor = actorLabel || resolveActorLabel(candidate, req);
  const resolvedFields = Array.isArray(previousMissingLabels)
    ? previousMissingLabels.filter(Boolean)
    : [];

  let candidateRecorded = false;
  if (!alreadyOnCandidate) {
    const event = buildJournalEvent(candidate, actor, resolvedFields);
    await candidateService.update(cid, { events: [event, ...prevEvents] });
    candidateRecorded = true;

    const label = trim(candidate?.fullName) || cid;
    await systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CANDIDATE_MISSING_DETAILS_COMPLETED,
      entityType: 'Candidate',
      entityId: cid,
      entityName: label,
      params: {
        name: label,
        actor,
        fields: resolvedFields.length ? resolvedFields.join(', ') : 'כל השדות',
      },
    });
  }

  const clientResult = await recordMissingDetailsClientJournal(req, cid, {
    candidateRow: candidate,
    actorLabel: actor,
    resolvedFields,
  });
  const jobLinkResult = await recordMissingDetailsJobLinkJournals(cid, {
    candidateRow: candidate,
    actorLabel: actor,
    resolvedFields,
  });

  const recorded =
    candidateRecorded || clientResult.recorded || (jobLinkResult.recorded || 0) > 0;
  if (!recorded && alreadyOnCandidate) {
    return { recorded: false, reason: 'already_recorded' };
  }

  return {
    recorded,
    candidateRecorded,
    clientRecorded: clientResult.recorded,
    jobLinksRecorded: jobLinkResult.recorded || 0,
  };
};

module.exports = {
  CANDIDATE_MISSING_DETAILS_COMPLETED_EVENT_TYPE,
  hasMissingDetailsCompletedEvent,
  recordMissingDetailsCompleted,
  recordMissingDetailsClientJournal,
  recordMissingDetailsJobLinkJournals,
};
