/**
 * Staff shadow ↔ live primary sync:
 * - Live updates fill shadows for fields the recruiter did not override.
 * - Overridden fields get pendingLiveSync with קבל / השאר.
 * - Staff edits on live become pendingStaffProfileProposal until the candidate approves.
 */
const Candidate = require('../models/Candidate');
const redis = require('./redisService');

const cacheDel = async (id) => {
  const cid = String(id || '').trim();
  if (!cid) return;
  try {
    await redis.del(`candidate:${cid}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[candidateShadowSync] cache del failed', cid, err?.message || err);
  }
};

const LIVE_TO_SHADOW_SYNC_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'phone',
  'email',
  'idNumber',
  'address',
  'location',
  'gender',
  'maritalStatus',
  'birthYear',
  'birthMonth',
  'birthDay',
  'age',
  'title',
  'professionalSummary',
  'keyFacts',
  'workExperience',
  'education',
  'militaryService',
  'languages',
  'skills',
  'softSkills',
  'techSkills',
  'desiredRoles',
  'salaryMin',
  'salaryMax',
  'drivingLicense',
  'drivingLicenses',
  'mobility',
  'employmentType',
  'employmentTypes',
  'jobScope',
  'jobScopes',
  'preferredWorkModels',
  'preferredWorkingHours',
  'availability',
  'physicalWork',
  'profilePicture',
];

const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const valuesEqual = (a, b) => stableStringify(a) === stableStringify(b);

const asOverrides = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
};

const asPendingLive = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...raw };
};

const changedSyncFields = (before, after) => {
  const keys = [];
  for (const field of LIVE_TO_SHADOW_SYNC_FIELDS) {
    if (!(field in after) && !(field in (before || {}))) continue;
    if (!valuesEqual(before?.[field], after?.[field])) keys.push(field);
  }
  return keys;
};

async function listStaffShadowsForPrimary(primaryId) {
  const pid = String(primaryId || '').trim();
  if (!pid) return [];
  return Candidate.findAll({
    where: {
      isDeleted: false,
      staffProfileCopy: true,
      canonicalCandidateId: pid,
    },
  });
}

/**
 * When a shadow is saved, mark CV fields the recruiter changed as overrides
 * so later live updates do not overwrite them silently.
 */
async function markShadowFieldOverrides(shadowRow, previousPlain, nextPlain) {
  if (!shadowRow?.id || shadowRow.staffProfileCopy !== true) return null;
  const changed = changedSyncFields(previousPlain, nextPlain);
  if (!changed.length) return null;

  const overrides = asOverrides(shadowRow.shadowFieldOverrides);
  let dirty = false;
  for (const field of changed) {
    if (!overrides[field]) {
      overrides[field] = true;
      dirty = true;
    }
  }
  if (!dirty) return null;
  await shadowRow.update({ shadowFieldOverrides: overrides });
  await cacheDel(String(shadowRow.id));
  return overrides;
}

/**
 * After the live primary is updated, push unoverridden fields into each staff shadow.
 * Overridden fields that also changed on live → pendingLiveSync for קבל/השאר.
 */
async function syncLiveChangesToStaffShadows(primaryId, previousPlain, nextPlain) {
  const pid = String(primaryId || '').trim();
  if (!pid) return { synced: 0 };

  const changed = changedSyncFields(previousPlain, nextPlain);
  if (!changed.length) return { synced: 0, changed: [] };

  const shadows = await listStaffShadowsForPrimary(pid);
  if (!shadows.length) return { synced: 0, changed };

  const now = new Date().toISOString();
  let synced = 0;

  for (const shadow of shadows) {
    const overrides = asOverrides(shadow.shadowFieldOverrides);
    const pending = asPendingLive(shadow.pendingLiveSync);
    const patch = {};
    let pendingDirty = false;

    for (const field of changed) {
      const liveValue = nextPlain?.[field];
      if (overrides[field]) {
        if (!valuesEqual(shadow[field], liveValue)) {
          pending[field] = {
            liveValue,
            previousShadowValue: shadow[field] ?? null,
            updatedAt: now,
          };
          pendingDirty = true;
        }
        continue;
      }
      if (!valuesEqual(shadow[field], liveValue)) {
        patch[field] = liveValue;
      }
    }

    if (pendingDirty) patch.pendingLiveSync = pending;
    if (Object.keys(patch).length) {
      await shadow.update(patch);
      await cacheDel(String(shadow.id));
      synced += 1;
    }
  }

  return { synced, changed };
}

/**
 * After CV ingest/enrichment finishes, push current live values into shadows
 * for fields the recruiter has not overridden (or queue קבל/השאר when overridden).
 */
async function refreshUnoverriddenShadowFieldsFromLive(primaryId) {
  const pid = String(primaryId || '').trim();
  if (!pid) return { synced: 0 };

  const primary = await Candidate.findByPk(pid);
  if (!primary || primary.isDeleted) return { synced: 0 };
  const rowCanon =
    primary.canonicalCandidateId != null ? String(primary.canonicalCandidateId).trim() : '';
  if (rowCanon && rowCanon !== pid) {
    return refreshUnoverriddenShadowFieldsFromLive(rowCanon);
  }

  const plain = primary.toJSON ? primary.toJSON() : primary.get({ plain: true });
  const syntheticBefore = {};
  for (const field of LIVE_TO_SHADOW_SYNC_FIELDS) {
    syntheticBefore[field] = undefined;
  }
  return syncLiveChangesToStaffShadows(pid, syntheticBefore, plain);
}

async function acceptLiveSyncField(shadowId, field) {
  const sid = String(shadowId || '').trim();
  const key = String(field || '').trim();
  if (!sid || !key) {
    const err = new Error('shadowId and field are required');
    err.status = 400;
    throw err;
  }
  const shadow = await Candidate.findByPk(sid);
  if (!shadow || shadow.isDeleted || shadow.staffProfileCopy !== true) {
    const err = new Error('Staff shadow not found');
    err.status = 404;
    throw err;
  }
  const pending = asPendingLive(shadow.pendingLiveSync);
  const entry = pending[key];
  if (!entry) {
    const err = new Error('No pending live sync for field');
    err.status = 404;
    throw err;
  }
  delete pending[key];
  const overrides = asOverrides(shadow.shadowFieldOverrides);
  delete overrides[key];
  await shadow.update({
    [key]: entry.liveValue,
    pendingLiveSync: pending,
    shadowFieldOverrides: overrides,
  });
  await cacheDel(sid);
  return shadow.toJSON ? shadow.toJSON() : { ...shadow.get({ plain: true }) };
}

async function keepShadowField(shadowId, field) {
  const sid = String(shadowId || '').trim();
  const key = String(field || '').trim();
  if (!sid || !key) {
    const err = new Error('shadowId and field are required');
    err.status = 400;
    throw err;
  }
  const shadow = await Candidate.findByPk(sid);
  if (!shadow || shadow.isDeleted || shadow.staffProfileCopy !== true) {
    const err = new Error('Staff shadow not found');
    err.status = 404;
    throw err;
  }
  const pending = asPendingLive(shadow.pendingLiveSync);
  if (!pending[key]) {
    const err = new Error('No pending live sync for field');
    err.status = 404;
    throw err;
  }
  delete pending[key];
  const overrides = asOverrides(shadow.shadowFieldOverrides);
  overrides[key] = true;
  await shadow.update({
    pendingLiveSync: pending,
    shadowFieldOverrides: overrides,
  });
  await cacheDel(sid);
  return shadow.toJSON ? shadow.toJSON() : { ...shadow.get({ plain: true }) };
}

/**
 * Staff proposes CV edits on the live profile — does not mutate live fields until candidate approves.
 */
async function proposeStaffProfileEdits(primaryId, { fields, proposedBy, note } = {}) {
  const pid = String(primaryId || '').trim();
  if (!pid || !fields || typeof fields !== 'object') {
    const err = new Error('primaryId and fields are required');
    err.status = 400;
    throw err;
  }
  const primary = await Candidate.findByPk(pid);
  if (!primary || primary.isDeleted) {
    const err = new Error('Primary candidate not found');
    err.status = 404;
    throw err;
  }
  const rowCanon =
    primary.canonicalCandidateId != null ? String(primary.canonicalCandidateId).trim() : '';
  if (rowCanon && rowCanon !== pid) {
    const err = new Error('Proposals must target the live primary profile');
    err.status = 400;
    throw err;
  }

  const proposedFields = {};
  for (const [field, nextValue] of Object.entries(fields)) {
    if (!LIVE_TO_SHADOW_SYNC_FIELDS.includes(field)) continue;
    if (valuesEqual(primary[field], nextValue)) continue;
    proposedFields[field] = {
      from: primary[field] ?? null,
      to: nextValue,
    };
  }
  if (!Object.keys(proposedFields).length) {
    const err = new Error('No changed fields to propose');
    err.status = 400;
    throw err;
  }

  const crypto = require('crypto');
  const proposal = {
    id: `psp-${Date.now()}`,
    accessToken: crypto.randomBytes(24).toString('hex'),
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    proposedBy: proposedBy || null,
    note: note || null,
    fields: proposedFields,
  };
  await primary.update({ pendingStaffProfileProposal: proposal });
  await cacheDel(pid);
  return proposal;
}

async function getPendingStaffProfileProposal(primaryId, { accessToken } = {}) {
  const pid = String(primaryId || '').trim();
  const primary = await Candidate.findByPk(pid);
  if (!primary || primary.isDeleted) {
    const err = new Error('Primary candidate not found');
    err.status = 404;
    throw err;
  }
  const proposal = primary.pendingStaffProfileProposal;
  if (!proposal || proposal.status !== 'pending') {
    const err = new Error('No pending staff proposal');
    err.status = 404;
    throw err;
  }
  if (!accessToken || String(proposal.accessToken || '') !== String(accessToken)) {
    const err = new Error('Invalid proposal token');
    err.status = 403;
    throw err;
  }
  return {
    candidateId: pid,
    fullName: primary.fullName || null,
    proposal: {
      id: proposal.id,
      status: proposal.status,
      createdAt: proposal.createdAt,
      expiresAt: proposal.expiresAt,
      proposedBy: proposal.proposedBy || null,
      note: proposal.note || null,
      fields: proposal.fields,
    },
  };
}

/**
 * Candidate resolves a staff proposal field-by-field.
 * @param {{ decisions: Record<string, 'approve'|'reject'>, actor?: string }} opts
 */
async function resolveStaffProfileProposal(primaryId, { decisions, actor, accessToken } = {}) {
  const pid = String(primaryId || '').trim();
  const primary = await Candidate.findByPk(pid);
  if (!primary || primary.isDeleted) {
    const err = new Error('Primary candidate not found');
    err.status = 404;
    throw err;
  }
  const proposal = primary.pendingStaffProfileProposal;
  if (!proposal || proposal.status !== 'pending' || !proposal.fields) {
    const err = new Error('No pending staff proposal');
    err.status = 404;
    throw err;
  }
  if (!accessToken || String(proposal.accessToken || '') !== String(accessToken)) {
    const err = new Error('Invalid proposal token');
    err.status = 403;
    throw err;
  }
  if (proposal.expiresAt && new Date(proposal.expiresAt).getTime() < Date.now()) {
    await primary.update({
      pendingStaffProfileProposal: { ...proposal, status: 'expired', resolvedAt: new Date().toISOString() },
    });
    await cacheDel(pid);
    const err = new Error('Proposal expired');
    err.status = 410;
    throw err;
  }

  const patch = {};
  const resolved = {};
  for (const [field, entry] of Object.entries(proposal.fields)) {
    const decision = decisions?.[field];
    if (decision === 'approve') {
      patch[field] = entry.to;
      resolved[field] = 'approved';
    } else if (decision === 'reject') {
      resolved[field] = 'rejected';
    }
  }
  if (!Object.keys(resolved).length) {
    const err = new Error('No field decisions provided');
    err.status = 400;
    throw err;
  }

  const previousPlain = primary.toJSON ? primary.toJSON() : primary.get({ plain: true });
  const nextProposal = {
    ...proposal,
    status: 'resolved',
    resolvedAt: new Date().toISOString(),
    resolvedBy: actor || null,
    decisions: resolved,
  };
  await primary.update({
    ...patch,
    pendingStaffProfileProposal: nextProposal,
  });
  await cacheDel(pid);

  const nextPlain = { ...previousPlain, ...patch };
  await syncLiveChangesToStaffShadows(pid, previousPlain, nextPlain);

  return { proposal: nextProposal, appliedFields: Object.keys(patch) };
}

module.exports = {
  LIVE_TO_SHADOW_SYNC_FIELDS,
  changedSyncFields,
  markShadowFieldOverrides,
  syncLiveChangesToStaffShadows,
  refreshUnoverriddenShadowFieldsFromLive,
  acceptLiveSyncField,
  keepShadowField,
  proposeStaffProfileEdits,
  getPendingStaffProfileProposal,
  resolveStaffProfileProposal,
  listStaffShadowsForPrimary,
};
