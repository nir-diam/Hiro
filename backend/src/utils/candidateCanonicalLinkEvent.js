const { v4: uuidv4 } = require('uuid');
const Candidate = require('../models/Candidate');
const redis = require('../services/redisService');
const systemEventEmitter = require('./systemEventEmitter');
const SYSTEM_EVENTS = require('./systemEventCatalog');

const CANDIDATE_CACHE_KEY = (id) => `candidate:${id}`;

/** Candidate journal type when a profile version is linked to a primary row. */
const CANDIDATE_PROFILE_LINKED_EVENT_TYPE = 'קישור פרופיל מועמד';

/** Candidate journal type when a linked profile is detached from its primary. */
const CANDIDATE_PROFILE_UNLINKED_EVENT_TYPE = 'ניתוק פרופיל מועמד';

/** Candidate journal type when an ingest row is merged into an existing primary profile. */
const CANDIDATE_IDENTITY_MERGED_EVENT_TYPE = 'מיזוג מועמד למועמד קיים';

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

const normalizeTypes = (raw) => {
  if (Array.isArray(raw)) {
    return raw.map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
  }
  const s = raw == null ? '' : String(raw).trim();
  return s ? [s] : [];
};

const candidateLabel = (row) =>
  trim(row?.fullName) ||
  [row?.firstName, row?.lastName].filter(Boolean).join(' ').trim() ||
  trim(row?.profileName) ||
  trim(row?.title) ||
  'מועמד';

const resolveActorLabel = (req) => {
  const dbUser = req?.dbUser;
  const jwtUser = req?.user || {};
  return (
    trim(dbUser?.name) ||
    trim(dbUser?.email) ||
    trim(jwtUser?.name) ||
    trim(jwtUser?.email) ||
    'מערכת'
  );
};

const appendCandidateJournalEvent = async (candidateId, event) => {
  const cid = trim(candidateId);
  if (!cid || !event) return false;
  const row = await Candidate.findByPk(cid, { attributes: ['id', 'events'], raw: true });
  if (!row) return false;
  const prev = Array.isArray(row.events) ? row.events : [];
  await Candidate.update({ events: [event, ...prev] }, { where: { id: cid } });
  try {
    await redis.del(CANDIDATE_CACHE_KEY(cid));
  } catch {
    // non-fatal
  }
  return true;
};

const buildJournalEvent = ({
  type,
  description,
  actor,
  linkedTo,
  metadata,
}) => {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    type: normalizeTypes(type),
    date: now,
    coordinator: actor,
    status: 'הושלם',
    linkedTo: Array.isArray(linkedTo) ? linkedTo : linkedTo ? [linkedTo] : [],
    description: trim(description),
    notes: '',
    history: [{ user: actor, timestamp: now, summary: normalizeTypes(type)[0] || 'עדכון פרופיל' }],
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
};

const loadCandidateBrief = async (candidateId) => {
  const cid = trim(candidateId);
  if (!cid) return null;
  return Candidate.findByPk(cid, {
    attributes: ['id', 'fullName', 'firstName', 'lastName', 'profileName', 'title', 'phone', 'email'],
    raw: true,
  });
};

/**
 * Record profile link / unlink in candidate.events journals.
 * Primary row receives "linked" events; linked row receives link + unlink events.
 */
const recordCanonicalCandidateLinkChange = async (
  req,
  linkedCandidateId,
  { previousCanonicalId = null, nextCanonicalId = null, actorLabel } = {},
) => {
  const linkedId = trim(linkedCandidateId);
  if (!linkedId) return { recorded: false, reason: 'missing_linked_id' };

  const prevPrimary = previousCanonicalId != null ? trim(previousCanonicalId) : null;
  const nextPrimary = nextCanonicalId != null ? trim(nextCanonicalId) : null;
  if (prevPrimary === nextPrimary) return { recorded: false, reason: 'unchanged' };

  const linkedRow = await loadCandidateBrief(linkedId);
  if (!linkedRow) return { recorded: false, reason: 'linked_not_found' };

  const actor = trim(actorLabel) || resolveActorLabel(req);
  const linkedName = candidateLabel(linkedRow);
  const phoneSuffix = trim(linkedRow.phone) ? ` (${linkedRow.phone})` : '';
  const results = { recorded: false, linked: false, unlinked: false };

  if (prevPrimary && prevPrimary !== linkedId) {
    const oldPrimary = await loadCandidateBrief(prevPrimary);
    const oldPrimaryName = candidateLabel(oldPrimary) || prevPrimary;
    const unlinkDescription = `פרופיל "${linkedName}"${phoneSuffix} נותק מהפרופיל הראשי "${oldPrimaryName}".`;

    const unlinkOnLinked = buildJournalEvent({
      type: CANDIDATE_PROFILE_UNLINKED_EVENT_TYPE,
      description: unlinkDescription,
      actor,
      linkedTo: { type: 'מועמד', id: prevPrimary, name: oldPrimaryName },
      metadata: {
        action: 'unlinked',
        linkedCandidateId: linkedId,
        primaryCandidateId: prevPrimary,
        previousCanonicalCandidateId: prevPrimary,
        canonicalCandidateId: null,
      },
    });
    await appendCandidateJournalEvent(linkedId, unlinkOnLinked);

    const unlinkOnPrimary = buildJournalEvent({
      type: CANDIDATE_PROFILE_UNLINKED_EVENT_TYPE,
      description: unlinkDescription,
      actor,
      linkedTo: { type: 'מועמד', id: linkedId, name: linkedName },
      metadata: {
        action: 'unlinked',
        linkedCandidateId: linkedId,
        primaryCandidateId: prevPrimary,
        previousCanonicalCandidateId: prevPrimary,
        canonicalCandidateId: null,
      },
    });
    await appendCandidateJournalEvent(prevPrimary, unlinkOnPrimary);
    results.unlinked = true;
    results.recorded = true;

    await systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CANDIDATE_PROFILE_UNLINKED,
      entityType: 'Candidate',
      entityId: prevPrimary,
      entityName: oldPrimaryName,
      params: {
        name: linkedName,
        primaryName: oldPrimaryName,
        actor,
        linkedCandidateId: linkedId,
        primaryCandidateId: prevPrimary,
      },
    });
  }

  if (nextPrimary && nextPrimary !== linkedId) {
    const newPrimary = await loadCandidateBrief(nextPrimary);
    const newPrimaryName = candidateLabel(newPrimary) || nextPrimary;
    const linkDescription = `פרופיל "${linkedName}"${phoneSuffix} קושר לפרופיל הראשי "${newPrimaryName}".`;

    const linkOnLinked = buildJournalEvent({
      type: CANDIDATE_PROFILE_LINKED_EVENT_TYPE,
      description: linkDescription,
      actor,
      linkedTo: { type: 'מועמד', id: nextPrimary, name: newPrimaryName },
      metadata: {
        action: 'linked',
        linkedCandidateId: linkedId,
        primaryCandidateId: nextPrimary,
        previousCanonicalCandidateId: prevPrimary,
        canonicalCandidateId: nextPrimary,
      },
    });
    await appendCandidateJournalEvent(linkedId, linkOnLinked);

    const linkOnPrimary = buildJournalEvent({
      type: CANDIDATE_PROFILE_LINKED_EVENT_TYPE,
      description: linkDescription,
      actor,
      linkedTo: { type: 'מועמד', id: linkedId, name: linkedName },
      metadata: {
        action: 'linked',
        linkedCandidateId: linkedId,
        primaryCandidateId: nextPrimary,
        previousCanonicalCandidateId: prevPrimary,
        canonicalCandidateId: nextPrimary,
      },
    });
    await appendCandidateJournalEvent(nextPrimary, linkOnPrimary);
    results.linked = true;
    results.recorded = true;

    await systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CANDIDATE_PROFILE_LINKED,
      entityType: 'Candidate',
      entityId: nextPrimary,
      entityName: newPrimaryName,
      params: {
        name: linkedName,
        primaryName: newPrimaryName,
        actor,
        linkedCandidateId: linkedId,
        primaryCandidateId: nextPrimary,
      },
    });
  }

  return results;
};

/**
 * Record identity dedup merge in the primary candidate's events journal
 * (duplicate row soft-deleted or ingest attached without creating a new row).
 */
const recordCandidateIdentityMerge = async (
  req,
  {
    primaryCandidateId,
    duplicateCandidateId = null,
    sourceLabel = null,
    actorLabel,
  } = {},
) => {
  const primaryId = trim(primaryCandidateId);
  if (!primaryId) return { recorded: false, reason: 'missing_primary_id' };

  const primaryRow = await loadCandidateBrief(primaryId);
  if (!primaryRow) return { recorded: false, reason: 'primary_not_found' };

  const dupId = duplicateCandidateId != null ? trim(duplicateCandidateId) : null;
  const duplicateRow = dupId ? await loadCandidateBrief(dupId) : null;
  const actor = trim(actorLabel) || resolveActorLabel(req);
  const primaryName = candidateLabel(primaryRow);
  const duplicateName =
    trim(sourceLabel) || (duplicateRow ? candidateLabel(duplicateRow) : 'מועמד חדש');
  const phoneSuffix =
    trim(duplicateRow?.phone) ? ` (${duplicateRow.phone})` : '';

  const description = dupId
    ? `פרופיל "${duplicateName}"${phoneSuffix} מוזג לפרופיל קיים "${primaryName}".`
    : `פרופיל "${duplicateName}" מוזג לפרופיל קיים "${primaryName}" (זיהוי כפול).`;

  const mergeEvent = buildJournalEvent({
    type: CANDIDATE_IDENTITY_MERGED_EVENT_TYPE,
    description,
    actor,
    linkedTo: dupId
      ? { type: 'מועמד', id: dupId, name: duplicateName }
      : { type: 'מועמד', id: primaryId, name: primaryName },
    metadata: {
      action: 'identity_merged',
      primaryCandidateId: primaryId,
      duplicateCandidateId: dupId,
      canonicalCandidateId: null,
    },
  });
  await appendCandidateJournalEvent(primaryId, mergeEvent);

  await systemEventEmitter.emit(req, {
    ...SYSTEM_EVENTS.CANDIDATE_IDENTITY_MERGED,
    entityType: 'Candidate',
    entityId: primaryId,
    entityName: primaryName,
    params: {
      name: duplicateName,
      primaryName,
      actor,
      duplicateCandidateId: dupId,
      primaryCandidateId: primaryId,
    },
  });

  return { recorded: true, primaryCandidateId: primaryId, duplicateCandidateId: dupId };
};

module.exports = {
  CANDIDATE_PROFILE_LINKED_EVENT_TYPE,
  CANDIDATE_PROFILE_UNLINKED_EVENT_TYPE,
  CANDIDATE_IDENTITY_MERGED_EVENT_TYPE,
  recordCanonicalCandidateLinkChange,
  recordCandidateIdentityMerge,
};
