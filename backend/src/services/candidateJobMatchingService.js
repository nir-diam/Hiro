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
const { hydrateJobSkills, assignJobSkills } = require('./candidateTagService');
const { findOpenJobsForFieldSelection } = require('./jobTaxonomyResolver');
const redisService = require('./redisService');
const { isRedisAvailable } = require('../config/redis');

// Cache keys + TTLs
const CANDIDATE_CACHE_TTL   = 300;  // 5 min — profile changes are rare
const LINKED_JOBS_CACHE_TTL = 30;   // 30 sec — link status changes more often
const JOB_SKILLS_CACHE_TTL  = 300;  // 5 min — job skills are rarely edited
const candidateCacheKey   = (id) => `candidate:match-data:${id}`;
const linkedJobsCacheKey  = (id) => `candidate:linked-jobs:${id}`;
const jobSkillsCacheKey   = (id) => `job:skills-match:${id}`;

/** Default job statuses included in candidate→job matching (Hebrew Job.status enum). */
const DEFAULT_MATCH_JOB_STATUSES = ['פתוחה', 'מוקפאת'];

/** Bounded parallel scoring — keeps DB/Redis/API load predictable. */
const JOB_MATCH_SCORE_CONCURRENCY = 12;

const runWithConcurrency = async (items, limit, fn) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const cap = Math.max(1, Math.min(limit, list.length));
  const results = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: cap }, async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return results;
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute full multi-dimensional match scores for all relevant jobs for a candidate.
 *
 * @param {string} candidateId
 * @param {object} opts
 * @param {number}   [opts.limit=50]
 * @param {number}   [opts.minScore=0]
 * @param {string[]} [opts.statuses=['פתוחה','מוקפאת']] – open + frozen by default; excludes מאוישת/טיוטה
 * @param {string[]} [opts.clientIds]
 * @param {string[]} [opts.cities]
 * @param {string[]} [opts.jobTypes]
 * @param {boolean}  [opts.useVector=true]
 * @param {object}   [opts.configOverride]  – when set, used as engine config for every job instead of resolveEngineConfigForJob()
 * @param {string}   [opts.tenantClientId]  – logged-in staff client UUID (Company Settings preset)
 */
async function computeMatchesForCandidate(candidateId, opts = {}) {
  const t0 = Date.now();
  const lap = (label, extra = '') => {
    const now = Date.now();
    const elapsed = now - t0;
    console.log(`[job-matches ⏱] ${elapsed.toString().padStart(5)}ms | ${label}${extra ? ' — ' + extra : ''}`);
    return now;
  };

  console.log(`\n[job-matches ▶] START candidateId=${candidateId}`);

  const limit    = Math.min(Math.max(parseInt(opts.limit,    10) || 50, 1), 100);
  const minScore = Math.min(Math.max(parseInt(opts.minScore, 10) || 0,  0), 100);
  const useVector = opts.useVector !== false;
  const statuses  = Array.isArray(opts.statuses) && opts.statuses.length
    ? opts.statuses
    : DEFAULT_MATCH_JOB_STATUSES;

  // 1. Default admin/client preset merge happens per job below (opts.configOverride wins globally when set — rarely used)
  const globalOverrideConfig = opts.configOverride || null;
  const staffTenantId = opts.tenantClientId ? String(opts.tenantClientId).trim() : '';

  // 2. Load candidate (+ AI tags join) — Redis-cached for 5 min
  let candidate;
  const cachedCandidate = await redisService.get(candidateCacheKey(candidateId));
  if (cachedCandidate) {
    candidate = cachedCandidate;
    lap('candidate loaded from Redis cache ⚡');
  } else {
    const candidateRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
    if (!candidateRow) {
      const e = new Error('Candidate not found'); e.status = 404; throw e;
    }
    candidate = candidateService.toPlainCandidateForMatchScore(candidateRow);
    lap('candidate loaded from DB');
    if (isRedisAvailable()) {
      redisService.set(candidateCacheKey(candidateId), candidate, { ttlSeconds: CANDIDATE_CACHE_TTL }).catch(() => {});
    }
  }

  // Ensure embedding exists
  let candidateEmb = normalizeEmbedding(candidate.embedding);
  if (useVector && (!candidateEmb || !candidateEmb.length)) {
    try {
      lap('candidate embedding missing — rebuilding…');
      const rebuilt = await embedCandidateAndSave(candidateId);
      candidateEmb  = normalizeEmbedding(rebuilt);
      lap('candidate embedding rebuilt');
    } catch (e) {
      console.warn('[candidateJobMatchingService] rebuild embedding failed', e.message);
    }
  } else {
    lap(`candidate embedding ready (dim=${candidateEmb?.length ?? 0})`);
  }
  candidate.embedding = candidateEmb; // inject normalised version so computeFullMatchScore uses it

  // 3. Load existing links (intent + per-job linkedInfo) — Redis-cached for 30 sec
  let linkedRows;
  const cachedLinks = await redisService.get(linkedJobsCacheKey(candidateId));
  if (cachedLinks) {
    linkedRows = cachedLinks;
    lap(`linked jobs loaded from Redis cache ⚡ (${linkedRows.length} links)`);
  } else {
    linkedRows = await JobCandidate.findAll({
      where: { candidateId },
      attributes: ['jobId', 'id', 'status', 'source'],
      include: [{ model: Job, as: 'job', attributes: ['id', 'field', 'role'], required: false }],
    });
    // Store plain objects so Sequelize model instances don't break serialisation
    const plainLinks = linkedRows.map((r) => (r.get ? r.get({ plain: true }) : r));
    if (isRedisAvailable()) {
      redisService.set(linkedJobsCacheKey(candidateId), plainLinks, { ttlSeconds: LINKED_JOBS_CACHE_TTL }).catch(() => {});
    }
    linkedRows = plainLinks;
    lap(`linked jobs loaded from DB (${linkedRows.length} links)`);
  }
  const linkedMap = new Map(
    linkedRows.map((r) => [String(r.jobId), buildLinkedInfoFromJobCandidate(r)]),
  );
  const linkedJobsForIntent = linkedRows
    .map((r) => r.job || { id: r.jobId, field: null, role: null })
    .filter((j) => j && j.id);
  const intentScoreOptions = await buildIntentScoreOptions(linkedJobsForIntent);
  lap(`intent score options built (${linkedJobsForIntent.length} intent jobs)`);

  // 4. Load jobs with filters
  const jobWhere = {};
  if (statuses.length)                              jobWhere.status = { [Op.in]: statuses };
  if (Array.isArray(opts.clientIds) && opts.clientIds.length) jobWhere.client = { [Op.in]: opts.clientIds };
  if (Array.isArray(opts.cities)    && opts.cities.length)    jobWhere.city   = { [Op.in]: opts.cities };
  if (Array.isArray(opts.jobTypes)  && opts.jobTypes.length) {
    jobWhere[Op.or] = opts.jobTypes.map((jt) => ({ jobType: { [Op.contains]: [jt] } }));
  }

  const allJobs = await Job.findAll({ where: jobWhere, attributes: { exclude: ['skills'] } });
  lap(`jobs query returned (${allJobs.length} jobs)`);

  // 5. Pre-resolve screening defaults + engine configs BEFORE parallel scoring.
  //    resolveScreeningDefaultsForJob makes 2 DB queries per unique client — deduplicate
  //    by grouping jobs with the same client label so we only query once per client.

  // 5a. Job skills — Redis-cached per job, only hydrate cache-misses in one batch
  if (isRedisAvailable()) {
    const cachedSkillsList = await Promise.all(
      allJobs.map((j) => redisService.get(jobSkillsCacheKey(String(j.id || (j.get && j.get('id')))))),
    );
    const jobsNeedingHydration = [];
    for (let i = 0; i < allJobs.length; i++) {
      if (cachedSkillsList[i] != null) {
        assignJobSkills(allJobs[i], cachedSkillsList[i]);
      } else {
        jobsNeedingHydration.push(allJobs[i]);
      }
    }
    if (jobsNeedingHydration.length) {
      await jobService.hydrateJobsSkills(jobsNeedingHydration);
      for (const job of jobsNeedingHydration) {
        const id = String(job.id || (job.get && job.get('id')) || '');
        const skills = (job.get ? job.get('skills') : job.skills) || [];
        if (id) redisService.set(jobSkillsCacheKey(id), skills, { ttlSeconds: JOB_SKILLS_CACHE_TTL }).catch(() => {});
      }
    }
    lap(`jobs skills hydrated (${allJobs.length - jobsNeedingHydration.length} from Redis cache, ${jobsNeedingHydration.length} from DB)`);
  } else {
    await jobService.hydrateJobsSkills(allJobs);
    lap(`jobs skills hydrated`);
  }

  // 5b. Screening defaults — one resolution per unique client label
  const screeningByClient = new Map();
  const uniqueClientLabels = [...new Set(allJobs.map((j) => ((j.get ? j.get('client') : j.client) || '')))];
  await Promise.all(
    uniqueClientLabels.map(async (label) => {
      const defaults = await clientUsageSettingService.resolveScreeningDefaultsForJob({ client: label });
      screeningByClient.set(label, defaults);
    }),
  );

  // 5c. Engine config — one resolution per job but now without redundant DB work
  const preJobConfigs = new Map();
  await runWithConcurrency(allJobs, JOB_MATCH_SCORE_CONCURRENCY, async (jobRow) => {
    const jobPlain = jobService.toPlainJobForMatchScore(jobRow);
    const jid      = String(jobPlain.id);
    const clientLabel     = jobPlain.client || '';
    const screeningDefaults = screeningByClient.get(clientLabel) || {};
    const configTenant    = staffTenantId || (screeningDefaults.clientId ? String(screeningDefaults.clientId) : '');
    const config          = globalOverrideConfig
      || (await resolveEngineConfigForJob(jobPlain, { tenantClientId: configTenant || null }));
    preJobConfigs.set(jid, { config, screeningDefaults });
  });
  lap(`per-job configs pre-resolved (${uniqueClientLabels.length} unique clients, ${allJobs.length} jobs)`);

  // 6. Score jobs in parallel — configs are pre-resolved, no DB calls inside the loop
  const scoreOneJob = async (jobRow) => {
    const jobPlain = jobService.toPlainJobForMatchScore(jobRow);
    const jid = String(jobPlain.id);
    const timings = { embed: 0, config: 0, score: 0, hard: 0 };

    let jobEmb = [];
    if (useVector) {
      const tEmb = Date.now();
      try {
        jobEmb = await getJobEmbedding(jobPlain);
      } catch (e) {
        console.warn('[candidateJobMatchingService] job embed failed', jid, e.message);
      }
      timings.embed = Date.now() - tEmb;
    }

    const linkedInfo = linkedMap.get(jid) || null;

    // Pre-resolved — no DB calls here anymore
    const tCfg = Date.now();
    const { config, screeningDefaults } = preJobConfigs.get(jid) || {};
    timings.config = Date.now() - tCfg;

    const tScore = Date.now();
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
    timings.score = Date.now() - tScore;

    if (scoreResult.matchScore < minScore) return { row: null, timings };

    const tHard = Date.now();
    let requirementsMet = true;
    try {
      const hard = screeningInclusionService.checkHardRequirements(candidate, jobPlain, screeningDefaults);
      requirementsMet = hard.ok;
    } catch (e) {
      console.warn('[candidateJobMatchingService] hard requirements check failed', jid, e.message);
    }
    timings.hard = Date.now() - tHard;

    return {
      timings,
      row: {
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
      },
    };
  };

  const scoreResults = await runWithConcurrency(
    allJobs,
    JOB_MATCH_SCORE_CONCURRENCY,
    scoreOneJob,
  );

  let tEmbedTotal = 0;
  let tConfigTotal = 0;
  let tScoreTotal = 0;
  let tHardTotal = 0;
  const scored = [];
  for (const result of scoreResults) {
    if (!result) continue;
    tEmbedTotal += result.timings.embed;
    tConfigTotal += result.timings.config;
    tScoreTotal += result.timings.score;
    tHardTotal += result.timings.hard;
    if (result.row) scored.push(result.row);
  }

  lap(`scoring done in parallel (${allJobs.length} jobs → ${scored.length} above minScore=${minScore}, concurrency=${JOB_MATCH_SCORE_CONCURRENCY})`);
  console.log(`[job-matches ⏱]       ↳ embed total: ${tEmbedTotal}ms | config/resolve total: ${tConfigTotal}ms | score total: ${tScoreTotal}ms | hard-req total: ${tHardTotal}ms`);
  const avgPerJob = allJobs.length ? ((tEmbedTotal + tConfigTotal + tScoreTotal + tHardTotal) / allJobs.length).toFixed(1) : 0;
  console.log(`[job-matches ⏱]       ↳ avg per-job: ${avgPerJob}ms`);

  // Sort: linked first (within same score tier), then by score desc
  scored.sort((a, b) => {
    if (a.matchType === 'application' && b.matchType !== 'application') return -1;
    if (b.matchType === 'application' && a.matchType !== 'application') return  1;
    return b.matchScore - a.matchScore;
  });

  const total = Date.now() - t0;
  console.log(`[job-matches ✅] DONE in ${total}ms — returning ${Math.min(scored.length, limit)} results\n`);

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
