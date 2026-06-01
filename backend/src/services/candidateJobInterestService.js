/**
 * Candidate job-field interest ("התעניינות במשרה" from taxonomy picker).
 * Persists selection, updates candidate profile for matching, links open jobs in taxonomy.
 */
const Candidate = require('../models/Candidate');
const jobCandidateService = require('./jobCandidateService');
const jobService = require('./jobService');
const candidateJobMatchingService = require('./candidateJobMatchingService');
const { findOpenJobsForFieldSelection } = require('./jobTaxonomyResolver');

const DEFAULT_LINK_LIMIT = 25;

function norm(s) {
  return String(s ?? '').trim();
}

function buildWorkflowMetaFromSelection(sel) {
  const category = norm(sel.category);
  const fieldType = norm(sel.fieldType);
  const role = norm(sel.role);
  return {
    interestType: 'field_taxonomy',
    category,
    fieldType,
    role,
    categoryId: sel.categoryId ? String(sel.categoryId) : null,
    clusterId: sel.clusterId ? String(sel.clusterId) : null,
    roleId: sel.roleId ? String(sel.roleId) : null,
    interestLabel: role && category ? `${category} › ${role}` : role || category || 'התעניינות בתחום',
  };
}

async function updateCandidateInterestProfile(candidateId, selection) {
  const category = norm(selection.category);
  const role = norm(selection.role);
  if (!category && !role) return;

  const row = await Candidate.findByPk(candidateId);
  if (!row) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }

  const updates = {};
  if (category) updates.field = category;
  if (role) updates.title = role;
  await row.update(updates);
}

/**
 * Add field interest: update candidate, link matching open jobs, optional placeholder row.
 *
 * @param {string} candidateId
 * @param {object} selection – { category, fieldType, role, categoryId?, clusterId?, roleId? }
 * @param {object} [opts]
 * @returns {Promise<{ linkedJobIds: string[], fieldOnlyLinkId: string|null, linkedCount: number }>}
 */
async function addFieldInterest(candidateId, selection, opts = {}) {
  const cid = norm(candidateId);
  if (!cid) {
    const err = new Error('candidateId is required');
    err.status = 400;
    throw err;
  }

  const category = norm(selection?.category);
  const role = norm(selection?.role);
  if (!category || !role) {
    const err = new Error('category and role are required');
    err.status = 400;
    throw err;
  }

  const limit = Math.min(Math.max(parseInt(opts.maxJobs, 10) || DEFAULT_LINK_LIMIT, 1), 50);
  const workflowMeta = buildWorkflowMetaFromSelection(selection);

  await updateCandidateInterestProfile(cid, selection);

  const existingLinks = await jobCandidateService.listForCandidate(cid);
  const linkedJobIds = new Set(
    existingLinks.map((r) => (r.jobId ? String(r.jobId) : '')).filter(Boolean),
  );

  const matchingJobs = await findOpenJobsForFieldSelection(selection, limit);
  const linkedJobIdsOut = [];

  for (const jobRow of matchingJobs) {
    const jid = String(jobRow.id);
    if (linkedJobIds.has(jid)) continue;
    await jobService.hydrateJobSkills(jobRow);
    await jobCandidateService.associateCandidateWithJob({
      jobId: jid,
      candidateId: cid,
      status: typeof opts.status === 'string' && opts.status.trim() ? opts.status.trim() : 'חדש',
      source: 'field_interest',
      workflowMetaPatch: { ...workflowMeta, matchedVia: 'taxonomy' },
      manualOverride: false,
    });
    linkedJobIds.add(jid);
    linkedJobIdsOut.push(jid);
  }

  let fieldOnlyLinkId = null;
  if (linkedJobIdsOut.length === 0) {
    const record = await jobCandidateService.associateCandidateWithJob({
      jobId: null,
      candidateId: cid,
      status: typeof opts.status === 'string' && opts.status.trim() ? opts.status.trim() : 'חדש',
      source: 'field_interest',
      workflowMetaPatch: workflowMeta,
      manualOverride: false,
    });
    fieldOnlyLinkId = record?.id ? String(record.id) : null;
  }

  return {
    linkedJobIds: linkedJobIdsOut,
    fieldOnlyLinkId,
    linkedCount: linkedJobIdsOut.length,
  };
}

/**
 * After addFieldInterest, return enriched linked-jobs list (matching engine scores).
 */
async function addFieldInterestAndList(candidateId, selection, opts = {}) {
  await addFieldInterest(candidateId, selection, opts);
  const rows = await jobCandidateService.listForCandidate(candidateId);
  const tenantClientId = opts.tenantClientId ? String(opts.tenantClientId).trim() : '';
  const enriched = await candidateJobMatchingService.enrichLinkedJobsRowsWithScores(
    candidateId,
    rows,
    { tenantClientId },
  );
  return enriched;
}

module.exports = {
  addFieldInterest,
  addFieldInterestAndList,
  buildWorkflowMetaFromSelection,
};
