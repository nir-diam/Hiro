const { v4: uuidv4 } = require('uuid');
const clientService = require('../services/clientService');
const candidateService = require('../services/candidateService');
const JobCandidate = require('../models/JobCandidate');
const ClientContact = require('../models/ClientContact');
const jobCandidateProcessJournalService = require('../services/jobCandidateProcessJournalService');
const { resolveClientIdsForCandidateJournal } = require('../services/pipelineOutcomeService');

/** Candidate journal event type when the candidate approves their portal profile. */
const CANDIDATE_PROFILE_APPROVED_EVENT_TYPE = 'אישור הפרופיל על ידי המועמד';

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const phonesMatch = (a, b) => {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const tail = (digits) => (digits.length >= 9 ? digits.slice(-9) : digits);
  return tail(left) === tail(right);
};

/** Match CRM contact by email/phone so the event appears on the contact profile tab. */
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

const hasJobLinkProfileApproval = (meta, candidateId) => {
  const cid = String(candidateId || '').trim();
  const journal = Array.isArray(meta?.statusJournal) ? meta.statusJournal : [];
  return journal.some((entry) => {
    if (String(entry?.status || '').trim() === CANDIDATE_PROFILE_APPROVED_EVENT_TYPE) return true;
    if (entry?.metadata?.profileApprovedByCandidate === cid) return true;
    return (Array.isArray(entry?.updates) ? entry.updates : []).some((update) =>
      normalizeTypes(update?.title).includes(CANDIDATE_PROFILE_APPROVED_EVENT_TYPE),
    );
  });
};

/**
 * Append profile approval rows to each job_candidates.workflowMeta.statusJournal.
 */
const recordProfileApprovalJobLinkJournals = async (
  candidateId,
  { candidateRow, actorLabel } = {},
) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return { recorded: 0 };

  const candidate = candidateRow || (await candidateService.getById(cid));
  const label = String(candidate?.fullName || candidate?.name || 'מועמד').trim() || 'מועמד';
  const actor = actorLabel || resolveActorLabel(candidate, null);
  const description = `${label} אישר/ה את הפרופיל בפורטל המועמדים.`;

  const links = await JobCandidate.findAll({
    where: { candidateId: cid },
    attributes: ['id', 'workflowMeta'],
    order: [['updatedAt', 'DESC']],
    limit: 24,
  });

  let recorded = 0;
  for (const link of links) {
    const meta = jobCandidateProcessJournalService.plainWorkflowMeta(link.workflowMeta);
    if (hasJobLinkProfileApproval(meta, cid)) continue;

    const nextMeta = jobCandidateProcessJournalService.appendStatusJournal(meta, {
      status: CANDIDATE_PROFILE_APPROVED_EVENT_TYPE,
      description,
      creator: actor,
      forceNew: true,
    });
    if (nextMeta.statusJournal?.[0]) {
      nextMeta.statusJournal[0].metadata = { profileApprovedByCandidate: cid };
    }
    await link.update({ workflowMeta: nextMeta });
    recorded += 1;
  }

  return { recorded };
};

const normalizeTypes = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
  }
  const s = raw == null ? '' : String(raw).trim();
  return s ? [s] : [];
};

const hasProfileApprovalEvent = (events) =>
  (Array.isArray(events) ? events : []).some((event) =>
    normalizeTypes(event?.type).includes(CANDIDATE_PROFILE_APPROVED_EVENT_TYPE),
  );

const buildProfileApprovalEvent = (candidate, actorLabel) => {
  const label = String(candidate?.fullName || candidate?.name || 'מועמד').trim() || 'מועמד';
  const actor = String(actorLabel || label || 'המועמד').trim() || 'המועמד';
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: [CANDIDATE_PROFILE_APPROVED_EVENT_TYPE],
    date: now,
    coordinator: actor,
    status: 'הושלם',
    linkedTo: [{ type: 'מועמד', name: label }],
    description: `${label} אישר/ה את הפרופיל בפורטל המועמדים.`,
    notes: '',
    history: [{ user: actor, timestamp: now, summary: 'יצר את האירוע' }],
  };
};

const resolveActorLabel = (candidate, req) => {
  const label = String(candidate?.fullName || '').trim();
  if (label) return label;
  const jwtUser = req?.user || {};
  const dbUser = req?.dbUser;
  return (
    String(jwtUser.name || '').trim() ||
    String(jwtUser.email || '').trim() ||
    String(dbUser?.email || '').trim() ||
    'המועמד'
  );
};

/**
 * When approveByCandidate flips to true, prepend a journal event (unless one already exists).
 */
const mergeProfileApprovalEvent = (previous, body, req) => {
  if (!Object.prototype.hasOwnProperty.call(body, 'approveByCandidate')) {
    return body;
  }
  if (body.approveByCandidate !== true || previous?.approveByCandidate === true) {
    return body;
  }
  const prevEvents = Array.isArray(previous?.events) ? previous.events : [];
  if (hasProfileApprovalEvent(prevEvents)) {
    return body;
  }
  const actorLabel = resolveActorLabel(previous, req);
  const event = buildProfileApprovalEvent(previous, actorLabel);
  return {
    ...body,
    events: [event, ...prevEvents],
  };
};

const hasClientProfileApprovalEvent = (events, candidateId) => {
  const cid = String(candidateId || '').trim();
  return (Array.isArray(events) ? events : []).some((event) => {
    if (event?.metadata?.profileApprovedByCandidate === cid) return true;
    if (!normalizeTypes(event?.type).includes(CANDIDATE_PROFILE_APPROVED_EVENT_TYPE)) return false;
    const linked = event?.linkedTo;
    if (linked && typeof linked === 'object' && !Array.isArray(linked)) {
      return String(linked.id || '') === cid;
    }
    return false;
  });
};

/**
 * Append a completed row to clients.events so it appears in the cross-client process journal.
 */
const recordProfileApprovalClientJournal = async (
  req,
  candidateId,
  { candidateRow, actorLabel } = {},
) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return { recorded: false };

  const clientIds = await resolveClientIdsForCandidateJournal(cid, req);
  if (!clientIds.length) return { recorded: false, reason: 'no_client' };

  const candidate = candidateRow || (await candidateService.getById(cid));
  const label = String(candidate?.fullName || candidate?.name || 'מועמד').trim() || 'מועמד';
  const actor = actorLabel || resolveActorLabel(candidate, req);
  const now = new Date().toISOString();

  const clients = [];
  for (const clientId of clientIds) {
    const client = await clientService.getById(clientId);
    const prevEvents = Array.isArray(client?.events) ? client.events : [];
    if (hasClientProfileApprovalEvent(prevEvents, cid)) {
      clients.push({ clientId, recorded: false, reason: 'already_recorded' });
      continue;
    }

    const contact = await resolveClientContactForCandidate(clientId, candidate);
    const linkedTo = contact
      ? { type: 'איש קשר', id: contact.id, name: contact.name }
      : { type: 'מועמד', id: cid, name: label };
    const event = {
      id: uuidv4(),
      title: `אישור פרופיל: ${label}`.slice(0, 240),
      type: ['פורטל מועמד', CANDIDATE_PROFILE_APPROVED_EVENT_TYPE],
      process: 'פורטל מועמד',
      stage: CANDIDATE_PROFILE_APPROVED_EVENT_TYPE,
      date: now,
      coordinator: actor,
      creator: actor,
      status: 'הושלם',
      contactId: contact?.id || cid,
      contactName: contact?.name || label,
      linkedTo,
      description: `${label} אישר/ה את הפרופיל בפורטל המועמדים.`,
      history: [
        {
          user: actor,
          timestamp: now,
          summary: CANDIDATE_PROFILE_APPROVED_EVENT_TYPE,
        },
      ],
      metadata: { profileApprovedByCandidate: cid, candidateId: cid },
      isActive: true,
    };

    await clientService.update(clientId, { events: [event, ...prevEvents] });
    clients.push({ clientId, recorded: true, eventId: event.id });
  }

  const recorded = clients.some((row) => row.recorded);
  return { recorded, clients };
};

module.exports = {
  CANDIDATE_PROFILE_APPROVED_EVENT_TYPE,
  mergeProfileApprovalEvent,
  recordProfileApprovalClientJournal,
  recordProfileApprovalJobLinkJournals,
};
