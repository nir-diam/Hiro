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
const clientUsageSettingService  = require('./clientUsageSettingService');
const screeningInclusionService  = require('./screeningInclusionService');
const { embedCandidateAndSave, normalizeEmbedding } = require('./vectorSearchService');
const { resolveEngineConfigForJob } = require('./matchingEngineService');
const {
  computeFullMatchScore,
  getJobEmbedding,
  buildLinkedInfoFromJobCandidate,
} = require('./matchingScoreService');

// ─── Parameter-match breakdown (for UI display) ───────────────────────────────

function reasonsToParamMatches(reasons, job) {
  const failed   = new Set(reasons);
  const result   = (code) => (failed.has(code) ? 'gap' : 'match');
  const lic      = job.licenseType ? String(job.licenseType).trim() : '';
  const hasLicense  = lic && lic !== 'לא חשוב';
  const hasAge      = Number.isFinite(Number(job.ageMin)) || Number.isFinite(Number(job.ageMax));
  const hasGender   = job.gender && String(job.gender).trim() !== 'לא משנה';
  const hasMobility = job.mobility === true;
  const jType       = Array.isArray(job.jobType) ? job.jobType.join(',') : String(job.jobType || '');
  const hasScope    = jType.includes('מלאה') || jType.includes('חלקית');

  return {
    mandatory_skill:    failed.has('mandatory_skill') ? 'gap' : (
      Array.isArray(job.skills) && job.skills.some((s) => s?.mode === 'mandatory') ? 'match' : 'unknown'
    ),
    license:            hasLicense  ? result('license') : 'unknown',
    age:                hasAge ? (
      failed.has('age_unknown') ? 'unknown' :
      (failed.has('age_min') || failed.has('age_max')) ? 'gap' : 'match'
    ) : 'unknown',
    gender:             hasGender   ? (failed.has('gender')   ? 'gap' : 'match') : 'unknown',
    mobility:           hasMobility ? (failed.has('mobility') ? 'gap' : 'match') : 'unknown',
    scope:              hasScope    ? (failed.has('mandatory_skill') ? 'gap' : 'match') : 'unknown',
    mandatory_language: failed.has('mandatory_language') ? 'gap' : (
      Array.isArray(job.languages) && job.languages.some((l) => l?.mandatory === true) ? 'match' : 'unknown'
    ),
    salary: 'unknown',
  };
}

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

  // 3. Load existing links (determines intentType)
  const linkedRows = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['jobId', 'id', 'status', 'source'],
  });
  const linkedMap = new Map(
    linkedRows.map((r) => {
      const p = r.get ? r.get({ plain: true }) : r;
      return [String(p.jobId), buildLinkedInfoFromJobCandidate(p)];
    }),
  );

  // 4. Load jobs with filters
  const jobWhere = {};
  if (statuses.length)                              jobWhere.status = { [Op.in]: statuses };
  if (Array.isArray(opts.clientIds) && opts.clientIds.length) jobWhere.client = { [Op.in]: opts.clientIds };
  if (Array.isArray(opts.cities)    && opts.cities.length)    jobWhere.city   = { [Op.in]: opts.cities };
  if (Array.isArray(opts.jobTypes)  && opts.jobTypes.length) {
    jobWhere[Op.or] = opts.jobTypes.map((jt) => ({ jobType: { [Op.contains]: [jt] } }));
  }

  const allJobs = await Job.findAll({ where: jobWhere });

  // 5. Score each job using the full engine
  const scored = [];
  for (const jobRow of allJobs) {
    const jobPlain = jobRow.get({ plain: true });
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

    const config = globalOverrideConfig || (await resolveEngineConfigForJob(jobPlain));

    let scoreResult;
    try {
      scoreResult = await computeFullMatchScore(candidate, jobPlain, jobEmb, config, linkedInfo);
    } catch (e) {
      console.warn('[candidateJobMatchingService] scoring failed', jid, e.message);
      scoreResult = { finalScore: 0, breakdown: {} };
    }

    if (scoreResult.finalScore < minScore) continue;

    // Hard requirements check (for UI display — does NOT affect score)
    let requirementsMet = true;
    let parameterMatches = {};
    try {
      const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(jobRow);
      const hard      = screeningInclusionService.checkHardRequirements(candidate, jobPlain, settings);
      requirementsMet  = hard.ok;
      parameterMatches = reasonsToParamMatches(hard.reasons, jobPlain);
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
      matchScore:       scoreResult.finalScore,
      scoreBreakdown:   scoreResult.breakdown,
      matchType:        linkedInfo ? 'application' : 'ai',
      requirementsMet,
      parameterMatches,
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

module.exports = { computeMatchesForCandidate };
