const { v4: uuidv4 } = require('uuid');

/** Candidate journal event type when the candidate approves their portal profile. */
const CANDIDATE_PROFILE_APPROVED_EVENT_TYPE = 'אישור הפרופיל על ידי המועמד';

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

module.exports = {
  CANDIDATE_PROFILE_APPROVED_EVENT_TYPE,
  mergeProfileApprovalEvent,
};
