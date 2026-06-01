/**
 * candidateJobMatchingService
 * Computes AI + parametric job matches for a given candidate.
 * Uses the full multi-dimensional scoring engine (matchingScoreService)
 * driven by the admin-configured weights (matchingEngineService).
 */
const { Op }       = require('sequelize');
const Job          = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');

const candidateService = require('./candidateService');
const jobService = require('./jobService');
const clientUsageSettingService  = require('./clientUsageSettingService');
const screeningInclusionService  = require('./screeningInclusionService');
const { embedCandidateAndSave, normalizeEmbedding } = require('./vectorSearchService');
const { resolveEngineConfigForJob } = require('./matchingEngineService');
const {
  computeMatchPackage,
  getJobEmbedding,
  buildLinkedInfoFromJobCandidate,
  buildIntentScoreOptions,
} = require('./matchingScoreService');
const { hydrateJobSkills } = require('./candidateTagService');
const { findOpenJobsForFieldSelection } = require('./jobTaxonomyResolver');

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute full multi-dimensional match scores for all relevant jobs for a candidate.
 *
 * @param {string} candidateId
 * @param {object} opts
 * @param {number}   [opts.limit=50]
 * @param {number}   [opts.minScore=0]
 * @param {string[]} [opts.statuses=['פתוחה','מוקפאת']]
 * @param {string[]} [opts.clientIds]
 * @param {string[]} [opts.cities]
 * @param {string[]} [opts.jobTypes]
 * @param {boolean}  [opts.useVector=true]
 * @param {object}   [opts.configOverride]  – when set, used as engine config for every job instead of resolveEngineConfigForJob()
 * @param {string}   [opts.tenantClientId]  – logged-in staff client UUID (Company Settings preset)
 */
async function computeMatchesForCandidate(candidateId, opts = {}) {
  const limit    = Math.min(Math.max(parseInt(opts.limit,    10) || 50, 1), 100);
  const minScore = Math.min(Math.max(parseInt(opts.minScore, 10) || 0,  0), 100);
  const useVector = opts.useVector !== false;
  const statuses  = Array.isArray(opts.statuses) && opts.statuses.length
    ? opts.statuses
    : ['פתוחה', 'מוקפאת'];

  // 1. Default admin/client preset merge happens per job below (opts.configOverride wins globally when set — rarely used)
  const globalOverrideConfig = opts.configOverride || null;
  const staffTenantId = opts.tenantClientId ? String(opts.tenantClientId).trim() : '';

  // 2. Load candidate (+ AI tags join — same shape as list / screening scoring)
  const candidateRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
  if (!candidateRow) {
    const e = new Error('Candidate not found'); e.status = 404; throw e;
  }
  let candidate = candidateService.toPlainCandidateForMatchScore(candidateRow);

  // Ensure embedding exists
  let candidateEmb = normalizeEmbedding(candidate.embedding);
  if (useVector && (!candidateEmb || !candidateEmb.length)) {
    try {
      const rebuilt = await embedCandidateAndSave(candidateId);
      candidateEmb  = normalizeEmbedding(rebuilt);
    } catch (e) {
      console.warn('[candidateJobMatchingService] rebuild embedding failed', e.message);
    }
  }
  candidate.embedding = candidateEmb; // inject normalised version so computeFullMatchScore uses it

  // 3. Load existing links (intent + per-job linkedInfo)
  const linkedRows = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['jobId', 'id', 'status', 'source'],
    include: [{ model: Job, as: 'job', attributes: ['id', 'field', 'role'], required: false }],
  });
  const linkedMap = new Map(
    linkedRows.map((r) => {
      const p = r.get ? r.get({ plain: true }) : r;
      return [String(p.jobId), buildLinkedInfoFromJobCandidate(p)];
    }),
  );
  const linkedJobsForIntent = linkedRows
    .map((r) => {
      const p = r.get ? r.get({ plain: true }) : r;
      return p.job || { id: p.jobId, field: null, role: null };
    })
    .filter((j) => j && j.id);
  const intentScoreOptions = await buildIntentScoreOptions(linkedJobsForIntent);

  // 4. Load jobs with filters
  const jobWhere = {};
  if (statuses.length)                              jobWhere.status = { [Op.in]: statuses };
  if (Array.isArray(opts.clientIds) && opts.clientIds.length) jobWhere.client = { [Op.in]: opts.clientIds };
  if (Array.isArray(opts.cities)    && opts.cities.length)    jobWhere.city   = { [Op.in]: opts.cities };
  if (Array.isArray(opts.jobTypes)  && opts.jobTypes.length) {
    jobWhere[Op.or] = opts.jobTypes.map((jt) => ({ jobType: { [Op.contains]: [jt] } }));
  }

  const allJobs = await Job.findAll({ where: jobWhere, attributes: { exclude: ['skills'] } });
  await jobService.hydrateJobsSkills(allJobs);

  // 5. Score each job using the full engine
  const scored = [];
  for (const jobRow of allJobs) {
    const jobPlain = jobService.toPlainJobForMatchScore(jobRow);
    const jid      = String(jobPlain.id);

    // Get job embedding (cached)
    let jobEmb = [];
    if (useVector) {
      try {
        jobEmb = await getJobEmbedding(jobPlain);
      } catch (e) {
        console.warn('[candidateJobMatchingService] job embed failed', jid, e.message);
      }
    }

    const linkedInfo = linkedMap.get(jid) || null;

    let configTenant = staffTenantId;
    if (!configTenant) {
      const screeningDefaults = await clientUsageSettingService.resolveScreeningDefaultsForJob(jobRow);
      configTenant = screeningDefaults.clientId ? String(screeningDefaults.clientId) : '';
    }
    const config =
      globalOverrideConfig ||
      (await resolveEngineConfigForJob(jobPlain, { tenantClientId: configTenant || null }));

    let scoreResult;
    try {
      scoreResult = await computeMatchPackage(
        candidate,
        jobPlain,
        jobEmb,
        config,
        linkedInfo,
        intentScoreOptions,
      );
    } catch (e) {
      console.warn('[candidateJobMatchingService] scoring failed', jid, e.message);
      scoreResult = { matchScore: 0, scoreBreakdown: {}, parameterMatches: {} };
    }

    if (scoreResult.matchScore < minScore) continue;

    // Hard requirements check (for UI display — does NOT affect score)
    let requirementsMet = true;
    try {
      const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(jobRow);
      const hard      = screeningInclusionService.checkHardRequirements(candidate, jobPlain, settings);
      requirementsMet  = hard.ok;
    } catch (e) {
      console.warn('[candidateJobMatchingService] hard requirements check failed', jid, e.message);
    }

    scored.push({
      id:               jid,
      title:            jobPlain.title   || '',
      client:           jobPlain.client  || '',
      status:           jobPlain.status  || '',
      city:             jobPlain.city    || '',
      region:           jobPlain.region  || '',
      jobType:          Array.isArray(jobPlain.jobType) ? jobPlain.jobType : [],
      salaryMin:        jobPlain.salaryMin  || null,
      salaryMax:        jobPlain.salaryMax  || null,
      description:      jobPlain.description || '',
      requirements:     Array.isArray(jobPlain.requirements) ? jobPlain.requirements : [],
      skills:           Array.isArray(jobPlain.skills)       ? jobPlain.skills       : [],
      languages:        Array.isArray(jobPlain.languages)    ? jobPlain.languages    : [],
      role:             jobPlain.role  || '',
      field:            jobPlain.field || '',
      matchScore:       scoreResult.matchScore,
      scoreBreakdown:   scoreResult.scoreBreakdown,
      parameterMatches: scoreResult.parameterMatches,
      matchType:        linkedInfo ? 'application' : 'ai',
      requirementsMet,
      jobCandidateId:   linkedInfo?.jcId || null,
      lastAnalyzed:     new Date().toLocaleDateString('he-IL'),
    });
  }

  // Sort: linked first (within same score tier), then by score desc
  scored.sort((a, b) => {
    if (a.matchType === 'application' && b.matchType !== 'application') return -1;
    if (b.matchType === 'application' && a.matchType !== 'application') return  1;
    return b.matchScore - a.matchScore;
  });

  return { rows: scored.slice(0, limit) };
}

/**
 * Augment linked-job rows (GET …/linked-jobs) with engine matchScore + scoreBreakdown,
 * same pipeline as job-matches / job candidates list.
 *
 * @param {string} candidateId
 * @param {object[]} linkedRows – from jobCandidateService.listForCandidate (with nested `job`)
 * @param {object}   [opts]
 * @param {string}   [opts.tenantClientId]
 * @returns {Promise<object[]>}
 */
async function enrichLinkedJobsRowsWithScores(candidateId, linkedRows, opts = {}) {
  if (!candidateId || !Array.isArray(linkedRows) || linkedRows.length === 0) {
    return linkedRows;
  }

  let candidateRow;
  try {
    candidateRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
  } catch (e) {
    console.warn('[enrichLinkedJobsRowsWithScores] load candidate failed', e.message);
    return linkedRows;
  }
  if (!candidateRow) return linkedRows;

  let candidate = candidateService.toPlainCandidateForMatchScore(candidateRow);
  let candidateEmb = normalizeEmbedding(candidate.embedding);
  if (!candidateEmb || !candidateEmb.length) {
    try {
      const rebuilt = await embedCandidateAndSave(candidateId);
      candidateEmb = normalizeEmbedding(rebuilt);
    } catch (e) {
      console.warn('[enrichLinkedJobsRowsWithScores] embed failed', e.message);
    }
  }
  candidate.embedding = candidateEmb;

  const staffTenantId = opts.tenantClientId ? String(opts.tenantClientId).trim() : '';

  const intentJobRows = [];
  for (const row of linkedRows) {
    const j = row.job;
    if (j?.id) intentJobRows.push(j);
    else if (row.source === 'field_interest' && row.workflowMeta) {
      const wm = row.workflowMeta;
      intentJobRows.push({
        id: row.jobCandidateId,
        field: wm.category,
        role: wm.role,
      });
    }
  }
  const intentScoreOptions = await buildIntentScoreOptions(intentJobRows);

  const out = [];
  for (const row of linkedRows) {
    let jobPlain = row.job;
    if (!jobPlain?.id && row.source === 'field_interest' && row.workflowMeta) {
      try {
        const proxyJobs = await findOpenJobsForFieldSelection(row.workflowMeta, 1);
        if (proxyJobs[0]) {
          jobPlain = jobService.toPlainJobForMatchScore(proxyJobs[0]);
        }
      } catch (e) {
        console.warn('[enrichLinkedJobsRowsWithScores] field-interest proxy job failed', e.message);
      }
    }
    if (!jobPlain || !jobPlain.id) {
      out.push({ ...row, matchScore: 0, scoreBreakdown: null, parameterMatches: null });
      continue;
    }

    try {
      await hydrateJobSkills(jobPlain);
    } catch (e) {
      console.warn('[enrichLinkedJobsRowsWithScores] hydrate job skills failed', row.jobId, e.message);
    }

    const linkedInfo = buildLinkedInfoFromJobCandidate({
      id: row.jobCandidateId,
      candidateId: row.candidateId,
      jobId: row.jobId,
      source: row.source,
      status: row.status,
    });

    let scoreResult = { matchScore: 0, scoreBreakdown: null, parameterMatches: {} };
    try {
      const jobEmb = await getJobEmbedding(jobPlain);
      let configTenant = staffTenantId;
      if (!configTenant) {
        const screeningDefaults = await clientUsageSettingService.resolveScreeningDefaultsForJob(jobPlain);
        configTenant = screeningDefaults.clientId ? String(screeningDefaults.clientId) : '';
      }
      const config = await resolveEngineConfigForJob(jobPlain, { tenantClientId: configTenant || null });
      scoreResult = await computeMatchPackage(
        candidate,
        jobPlain,
        jobEmb,
        config,
        linkedInfo,
        intentScoreOptions,
      );
    } catch (e) {
      console.warn('[enrichLinkedJobsRowsWithScores] score failed', row.jobId, e.message);
    }

    out.push({
      ...row,
      matchScore: Math.round(Number(scoreResult.matchScore) || 0),
      scoreBreakdown: scoreResult.scoreBreakdown || null,
      parameterMatches: scoreResult.parameterMatches || null,
    });
  }
  return out;
}

module.exports = { computeMatchesForCandidate, enrichLinkedJobsRowsWithScores };
