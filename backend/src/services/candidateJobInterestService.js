/**
 * Candidate job-field interest ("התעניינות במשרה" from taxonomy picker).
 * Persists selection, updates candidate profile for matching, links open jobs in taxonomy.
 */
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
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

async function loadUnlinkedMatchingJobs(candidateId, selection, limit) {
  const existingLinks = await jobCandidateService.listForCandidate(candidateId);
  const linkedJobIds = new Set(
    existingLinks.map((r) => (r.jobId ? String(r.jobId) : '')).filter(Boolean),
  );
  const matchingJobs = await findOpenJobsForFieldSelection(selection, limit);
  const unlinked = matchingJobs.filter((jobRow) => !linkedJobIds.has(String(jobRow.id)));
  return { matchingJobs, unlinked, linkedJobIds };
}

/**
 * Preview open jobs for taxonomy selection (no DB writes).
 * @returns {Promise<object[]>} scored pseudo linked-job rows
 */
async function previewFieldInterest(candidateId, selection, opts = {}) {
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
  const { unlinked } = await loadUnlinkedMatchingJobs(cid, selection, limit);
  if (!unlinked.length) return [];

  const workflowMeta = buildWorkflowMetaFromSelection(selection);
  const pseudoRows = [];
  for (const jobRow of unlinked) {
    await jobService.hydrateJobSkills(jobRow);
    const jobPlain = jobService.toPlainJobForMatchScore(jobRow);
    pseudoRows.push({
      jobCandidateId: `preview-${jobPlain.id}`,
      jobId: String(jobPlain.id),
      candidateId: cid,
      status: typeof opts.status === 'string' && opts.status.trim() ? opts.status.trim() : 'חדש',
      source: 'field_interest',
      workflowMeta: { ...workflowMeta, matchedVia: 'taxonomy' },
      job: jobPlain,
    });
  }

  return candidateJobMatchingService.enrichLinkedJobsRowsWithScores(cid, pseudoRows, opts);
}

/**
 * Add field interest: update candidate, link selected open jobs, optional placeholder row.
 *
 * @param {string} candidateId
 * @param {object} selection – { category, fieldType, role, categoryId?, clusterId?, roleId? }
 * @param {object} [opts] – { jobIds?: string[] } when set, link only those jobs (may be empty)
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
  const status =
    typeof opts.status === 'string' && opts.status.trim() ? opts.status.trim() : 'חדש';

  await updateCandidateInterestProfile(cid, selection);

  const { matchingJobs, unlinked, linkedJobIds } = await loadUnlinkedMatchingJobs(
    cid,
    selection,
    limit,
  );
  const linkedJobIdsOut = [];
  const hasExplicitJobIds = Array.isArray(opts.jobIds);

  if (hasExplicitJobIds) {
    const requested = opts.jobIds.map((id) => String(id).trim()).filter(Boolean);
    for (const jid of requested) {
      if (linkedJobIds.has(jid)) continue;
      let jobRow =
        matchingJobs.find((j) => String(j.id) === jid) ||
        unlinked.find((j) => String(j.id) === jid);
      if (!jobRow) {
        jobRow = await Job.findByPk(jid, { attributes: { exclude: ['skills'] } });
      }
      if (!jobRow) continue;
      await jobService.hydrateJobSkills(jobRow);
      await jobCandidateService.associateCandidateWithJob({
        jobId: jid,
        candidateId: cid,
        status,
        source: 'field_interest',
        workflowMetaPatch: { ...workflowMeta, matchedVia: 'taxonomy' },
        manualOverride: false,
      });
      linkedJobIds.add(jid);
      linkedJobIdsOut.push(jid);
    }
  } else if (matchingJobs.length === 0) {
    const record = await jobCandidateService.associateCandidateWithJob({
      jobId: null,
      candidateId: cid,
      status,
      source: 'field_interest',
      workflowMetaPatch: workflowMeta,
      manualOverride: false,
    });
    return {
      linkedJobIds: linkedJobIdsOut,
      fieldOnlyLinkId: record?.id ? String(record.id) : null,
      linkedCount: 0,
    };
  }

  return {
    linkedJobIds: linkedJobIdsOut,
    fieldOnlyLinkId: null,
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
  previewFieldInterest,
  addFieldInterest,
  addFieldInterestAndList,
  buildWorkflowMetaFromSelection,
};
