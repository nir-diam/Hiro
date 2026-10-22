/**
 * candidateJobMatchingService
 * Computes AI + parametric job matches for a given candidate.
 * Uses the full multi-dimensional scoring engine (matchingScoreService)
 * driven by the admin-configured weights (matchingEngineService).
 */
const { Op }       = require('sequelize');
const Job          = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');

const candidateService = require('./candidateService');
const jobService = require('./jobService');
const clientUsageSettingService  = require('./clientUsageSettingService');
const screeningInclusionService  = require('./screeningInclusionService');
const { embedCandidateAndSave, normalizeEmbedding, cosineSimilarity } = require('./vectorSearchService');
const { resolveEngineConfigForJob } = require('./matchingEngineService');
const {
  computeMatchPackage,
  getJobEmbedding,
  buildLinkedInfoFromJobCandidate,
  buildIntentScoreOptions,
  invalidateCityCache,
} = require('./matchingScoreService');
const {
  candidateHasTagFilters,
  candidateTagFiltersMatch,
} = require('./matchingPenaltyService');
const { loadTagAliasIndex } = require('./tagAliasIndexService');
const { passesHardFilters, passesDistanceHardFilter } = require('./jobSonarService');
const { normalizeAffinityLevel, passesAffinityLevel } = require('./affinityLevelFilter');
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
const RANK_CACHE_TTL_MS = 90_000;
const rankCache = new Map();
const inflightMatches = new Map();

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

function normalizePortalRequirements(jobPlain) {
  const raw = jobPlain?.requirements;
  if (Array.isArray(raw)) {
    const lines = raw.map((line) => String(line || '').trim()).filter(Boolean);
    if (lines.length) return lines;
  } else if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  const pubReq = String(jobPlain?.publicJobRequirements || '').trim();
  if (pubReq) {
    return pubReq.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return [];
}

function portalJobDescription(jobPlain) {
  return String(jobPlain?.PublicDescription || jobPlain?.description || '').trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute full multi-dimensional match scores for all relevant jobs for a candidate.
 *
 * @param {string} candidateId
 * @param {object} opts
 * @param {number}   [opts.limit=50]
 * @param {number}   [opts.offset=0] – continue after a previous page (ranked order)
 * @param {number}   [opts.minScore=0]
 * @param {string[]} [opts.statuses=['פתוחה','מוקפאת']] – open + frozen by default; excludes מאוישת/טיוטה
 * @param {string[]} [opts.clientIds]
 * @param {string[]} [opts.cities]
 * @param {string[]} [opts.jobTypes]
 * @param {boolean}  [opts.useVector=true]
 * @param {string[]} [opts.hardFilters] – sonar-style gates (scope, hours, distance, age, …)
 * @param {string}   [opts.affinityLevel] – none | exact | same_cluster | same_category
 * @param {object}   [opts.configOverride]  – when set, used as engine config for every job instead of resolveEngineConfigForJob()
 * @param {string}   [opts.tenantClientId]  – logged-in staff client UUID (Company Settings preset)
 */
async function computeMatchesForCandidate(candidateId, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const flightKey = JSON.stringify({
    candidateId: String(candidateId || ''),
    limit,
    offset,
    minScore: opts.minScore ?? 0,
    useVector: opts.useVector !== false,
    hardFilters: opts.hardFilters || [],
    affinityLevel: opts.affinityLevel || 'none',
    statuses: opts.statuses || DEFAULT_MATCH_JOB_STATUSES,
    clientIds: opts.clientIds || [],
    cities: opts.cities || [],
    jobTypes: opts.jobTypes || [],
    tenantClientId: opts.tenantClientId || '',
  });
  const existing = inflightMatches.get(flightKey);
  if (existing) {
    console.log(`[job-matches] joining in-flight request candidateId=${candidateId} offset=${offset}`);
    return existing;
  }
  const run = computeMatchesForCandidateUncached(candidateId, { ...opts, limit, offset })
    .finally(() => {
      inflightMatches.delete(flightKey);
    });
  inflightMatches.set(flightKey, run);
  return run;
}

async function computeMatchesForCandidateUncached(candidateId, opts = {}) {
  invalidateCityCache();
  const t0 = Date.now();
  const lap = (label, extra = '') => {
    const now = Date.now();
    const elapsed = now - t0;
    console.log(`[job-matches ⏱] ${elapsed.toString().padStart(5)}ms | ${label}${extra ? ' — ' + extra : ''}`);
    return now;
  };

  console.log(`\n[job-matches ▶] START candidateId=${candidateId}`);

  const limit    = Math.min(Math.max(parseInt(opts.limit,    10) || 50, 1), 100);
  const offset   = Math.max(parseInt(opts.offset, 10) || 0, 0);
  const minScore = Math.min(Math.max(parseInt(opts.minScore, 10) || 0,  0), 100);
  const useVector = opts.useVector !== false;
  const hardFilters = Array.isArray(opts.hardFilters)
    ? [...new Set(opts.hardFilters.map((x) => String(x).trim()).filter((x) => x && x !== 'affinity'))]
    : [];
  const affinityLevel = normalizeAffinityLevel(opts.affinityLevel);
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

  const hasCandidateTagFilters = candidateHasTagFilters(candidate);
  const needsAliasIndex = hasCandidateTagFilters || hardFilters.includes('mandatory_skill') || hardFilters.includes('negative_skill');
  const candidateTagFilterAliasIndex = needsAliasIndex ? await loadTagAliasIndex() : null;
  if (hasCandidateTagFilters) {
    lap('candidate tag filters active (green/red tag modes)');
  }

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

  // 4. Rank jobs by stored embedding, then load only this page for full scoring.
  const jobWhere = {};
  if (statuses.length) jobWhere.status = { [Op.in]: statuses };
  if (Array.isArray(opts.clientIds) && opts.clientIds.length) jobWhere.client = { [Op.in]: opts.clientIds };
  if (Array.isArray(opts.cities) && opts.cities.length) jobWhere.city = { [Op.in]: opts.cities };
  if (Array.isArray(opts.jobTypes) && opts.jobTypes.length) {
    jobWhere[Op.or] = opts.jobTypes.map((jt) => ({ jobType: { [Op.contains]: [jt] } }));
  }

  let ignoredJobIds = new Set();
  try {
    const rejRows = await JobCandidateScreening.findAll({
      where: { candidateId, screeningStatus: 'rejected' },
      attributes: ['jobId'],
    });
    ignoredJobIds = new Set(rejRows.map((r) => String(r.jobId)));
  } catch {
    ignoredJobIds = new Set();
  }

  const rankKey = JSON.stringify({
    candidateId: String(candidateId),
    statuses,
    clientIds: opts.clientIds || [],
    cities: opts.cities || [],
    jobTypes: opts.jobTypes || [],
    useVector,
    updatedAt: candidate.updatedAt || candidate.updated_at || '',
    embLen: Array.isArray(candidateEmb) ? candidateEmb.length : 0,
  });
  let rankedIds = [];
  const rankHit = rankCache.get(rankKey);
  if (rankHit && Date.now() - rankHit.at < RANK_CACHE_TTL_MS) {
    rankedIds = rankHit.ids.filter((id) => !ignoredJobIds.has(id));
    lap(`job rank from memory (${rankedIds.length} jobs)`);
  } else {
    const lightJobs = await Job.findAll({
      where: jobWhere,
      attributes: ['id', 'embedding', 'updatedAt'],
    });
    lap(`job rank query (${lightJobs.length} jobs, id+embedding only)`);
    const linkedFirst = [];
    const rest = [];
    for (const row of lightJobs) {
      const id = String(row.id || (row.get && row.get('id')) || '');
      if (!id || ignoredJobIds.has(id)) continue;
      if (linkedMap.has(id)) {
        linkedFirst.push(id);
        continue;
      }
      const emb = useVector ? normalizeEmbedding(row.embedding ?? (row.get && row.get('embedding'))) : [];
      const sim = useVector && candidateEmb?.length && emb.length === candidateEmb.length
        ? cosineSimilarity(candidateEmb, emb)
        : 0;
      const updatedAt = row.updatedAt || (row.get && row.get('updatedAt'));
      const updatedMs = updatedAt ? new Date(updatedAt).getTime() : 0;
      rest.push({ id, sim: Number.isFinite(sim) ? sim : -1, updatedMs: Number.isFinite(updatedMs) ? updatedMs : 0 });
    }
    rest.sort((a, b) => (b.sim - a.sim) || (b.updatedMs - a.updatedMs));
    rankedIds = [...linkedFirst, ...rest.map((row) => row.id)];
    rankCache.set(rankKey, { at: Date.now(), ids: rankedIds });
    if (rankCache.size > 40) {
      const oldest = [...rankCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) rankCache.delete(oldest[0]);
    }
    lap(`job rank built (${rankedIds.length} jobs, ${linkedFirst.length} already linked)`);
  }

  const pageIds = rankedIds.slice(offset, offset + limit);
  lap(`scoring page offset=${offset} window=${pageIds.length} of ${rankedIds.length}`);

  const pageRows = pageIds.length
    ? await Job.findAll({
      where: { id: { [Op.in]: pageIds } },
      attributes: {
        exclude: [
          'skills',
          'events',
          'aiRawDescription',
          'digitalQuestions',
          'telephoneQuestions',
          'cvForwardSettings',
          'listNotesHistory',
        ],
      },
    })
    : [];
  const pageById = new Map(pageRows.map((row) => [String(row.id || (row.get && row.get('id')) || ''), row]));
  const allJobs = pageIds.map((id) => pageById.get(id)).filter(Boolean);

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

    if (hardFilters.length) {
      if (!passesHardFilters(candidate, jobPlain, hardFilters, screeningDefaults, candidateTagFilterAliasIndex)) {
        return { row: null, timings };
      }
      if (!passesDistanceHardFilter(scoreResult.scoreBreakdown, hardFilters)) {
        return { row: null, timings };
      }
    }

    if (!passesAffinityLevel(scoreResult.scoreBreakdown?.intentType, affinityLevel)) {
      return { row: null, timings };
    }

    if (hasCandidateTagFilters) {
      const tagFilter = candidateTagFiltersMatch(jobPlain, candidate, candidateTagFilterAliasIndex);
      if (!tagFilter.ok) return { row: null, timings };
    }

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
        description:      portalJobDescription(jobPlain),
        requirements:     normalizePortalRequirements(jobPlain),
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
        jobUpdatedAt:     jobPlain.updatedAt || jobPlain.openDate || null,
        jobOpenDate:      jobPlain.openDate || null,
        jobUpdatedAtMs:   (() => {
          const raw = jobPlain.updatedAt || jobPlain.openDate || null;
          if (!raw) return 0;
          const ms = new Date(raw).getTime();
          return Number.isFinite(ms) ? ms : 0;
        })(),
        lastAnalyzed:     jobPlain.updatedAt || jobPlain.openDate || null,
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

  const scoredById = new Map(scored.map((row) => [row.id, row]));
  const pageRowsOut = [];
  let consumed = 0;
  for (const id of pageIds) {
    consumed += 1;
    const row = scoredById.get(id);
    if (row) pageRowsOut.push(row);
    if (pageRowsOut.length >= limit) break;
  }
  pageRowsOut.sort((a, b) => {
    if (a.matchType === 'application' && b.matchType !== 'application') return -1;
    if (b.matchType === 'application' && a.matchType !== 'application') return 1;
    return b.matchScore - a.matchScore;
  });

  const nextOffset = offset + (pageIds.length ? consumed : 0);
  const hasMore = nextOffset < rankedIds.length;
  const total = Date.now() - t0;
  console.log(`[job-matches ✅] DONE in ${total}ms — returning ${pageRowsOut.length} of page, nextOffset=${nextOffset}/${rankedIds.length}\n`);

  return {
    rows: pageRowsOut,
    total: rankedIds.length,
    offset,
    nextOffset,
    hasMore,
  };
}

const stripLinkedJobEmbeddings = (rows) => {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const next = { ...row };
    delete next.embedding;
    if (next.job && typeof next.job === 'object') {
      const { embedding: _embedding, ...job } = next.job;
      next.job = job;
    }
    return next;
  });
};

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
    return stripLinkedJobEmbeddings(linkedRows);
  }

  let candidateRow;
  try {
    candidateRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
  } catch (e) {
    console.warn('[enrichLinkedJobsRowsWithScores] load candidate failed', e.message);
    return stripLinkedJobEmbeddings(linkedRows);
  }
  if (!candidateRow) return stripLinkedJobEmbeddings(linkedRows);

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
  return stripLinkedJobEmbeddings(out);
}

/**
 * Jobs dismissed from candidate→job matching (rejectionReason = job_match_ignore).
 */
async function listJobMatchIgnores(candidateId) {
  if (!candidateId) {
    const err = new Error('candidateId is required');
    err.status = 400;
    throw err;
  }

  const rows = await JobCandidateScreening.findAll({
    where: {
      candidateId,
      screeningStatus: 'rejected',
      rejectionReason: 'job_match_ignore',
    },
    attributes: ['id', 'jobId', 'updatedAt', 'createdAt'],
    include: [
      {
        model: Job,
        as: 'job',
        attributes: ['id', 'title', 'client', 'city', 'status'],
        required: true,
      },
    ],
    order: [['updatedAt', 'DESC']],
  }).catch(() => []);

  return {
    count: rows.length,
    items: rows.map((row) => {
      const j = row.job;
      const plain = typeof j?.toJSON === 'function' ? j.toJSON() : j;
      return {
        jobId: String(row.jobId),
        title: plain?.title || '',
        client: plain?.client || '',
        city: plain?.city || null,
        status: plain?.status || null,
        ignoredAt: row.updatedAt || row.createdAt || null,
      };
    }),
  };
}

/**
 * Clear a job-match ignore so the job can appear again for this candidate.
 */
async function clearJobMatchIgnore(candidateId, jobId) {
  if (!candidateId || !jobId) {
    const err = new Error('candidateId and jobId are required');
    err.status = 400;
    throw err;
  }

  const row = await JobCandidateScreening.findOne({
    where: {
      candidateId,
      jobId,
      screeningStatus: 'rejected',
      rejectionReason: 'job_match_ignore',
    },
  });

  if (!row) {
    const err = new Error('Job match ignore not found');
    err.status = 404;
    throw err;
  }

  await row.update(
    {
      screeningStatus: 'open',
      rejectionReason: null,
      rejectionNotes: null,
    },
    { fields: ['screeningStatus', 'rejectionReason', 'rejectionNotes'] },
  );

  return { ok: true, candidateId: String(candidateId), jobId: String(jobId) };
}

async function invalidateCandidateMatchCache(candidateId) {
  const id = String(candidateId || '').trim();
  if (!id) return;
  try {
    await redisService.del(candidateCacheKey(id));
  } catch {
    // ignore cache errors
  }
}

module.exports = {
  computeMatchesForCandidate,
  enrichLinkedJobsRowsWithScores,
  listJobMatchIgnores,
  clearJobMatchIgnore,
  invalidateCandidateMatchCache,
};
