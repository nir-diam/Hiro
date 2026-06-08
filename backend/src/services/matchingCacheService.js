/**
 * matchingCacheService — Redis-backed matching scores
 *
 * Three Redis structures:
 *
 *  1. ZSET  candidate:{candidateId}:opportunities
 *           member = jobId, score = matchPct (0-100)
 *           "Best jobs for this candidate, ranked by match %"
 *
 *  2. ZSET  job:{jobId}:matches
 *           member = candidateId, score = matchPct (0-100)
 *           "Best candidates for this job — what Sonar shows"
 *
 *  3. HASH  job:{jobId}:weights
 *           fields = { semantic, geo, skills, salaryPenalty, ... }
 *           "Engine weight sliders saved per job"
 */

const redis = require('./redisService');

// TTLs
const MATCHES_TTL = 24 * 60 * 60;       // 24h — sonar results
const OPPORTUNITIES_TTL = 24 * 60 * 60; // 24h
const WEIGHTS_TTL = 0;                   // 0 = no expiry (persists until changed)

// Key builders
const jobMatchesKey       = (jobId)       => `job:${jobId}:matches`;
const candidateOppsKey    = (candidateId) => `candidate:${candidateId}:opportunities`;
const jobWeightsKey       = (jobId)       => `job:${jobId}:weights`;

// ─── Job → Candidates (Sonar results) ─────────────────────────────────────────

/**
 * Record one candidate match score for a job.
 * ZADD job:{jobId}:matches {score} {candidateId}
 */
const recordJobMatch = async (jobId, candidateId, matchPct) => {
  try {
    const key = jobMatchesKey(jobId);
    await redis.zadd(key, matchPct, String(candidateId));
    if (MATCHES_TTL) await redis.expire(key, MATCHES_TTL);
  } catch (e) {
    console.warn('[matchingCacheService] recordJobMatch failed (non-fatal):', e.message);
  }
};

/**
 * Bulk-write all Sonar results for a job in one pass.
 * @param {string} jobId
 * @param {Array<{ candidateId: string, matchPct: number }>} results
 */
const recordJobMatchBulk = async (jobId, results) => {
  if (!results?.length) return;
  try {
    const key = jobMatchesKey(jobId);
    const entries = results.map(({ candidateId, matchPct }) => ({
      score: matchPct,
      member: String(candidateId),
    }));
    await redis.zaddMany(key, entries);
    if (MATCHES_TTL) await redis.expire(key, MATCHES_TTL);
  } catch (e) {
    console.warn('[matchingCacheService] recordJobMatchBulk failed (non-fatal):', e.message);
  }
};

/**
 * Get top N candidates for a job, ordered by match % descending.
 * Equivalent to: ZREVRANGE job:{jobId}:matches 0 (limit-1) WITHSCORES
 * @param {string} jobId
 * @param {number} [limit=50]
 * @returns {Promise<Array<{ candidateId: string, matchPct: number }>>}
 */
const getJobMatches = async (jobId, limit = 50) => {
  try {
    const raw = await redis.zrevrange(jobMatchesKey(jobId), 0, limit - 1, true);
    return raw.map(({ member, score }) => ({ candidateId: member, matchPct: score }));
  } catch (e) {
    console.warn('[matchingCacheService] getJobMatches failed (non-fatal):', e.message);
    return [];
  }
};

/**
 * Remove a specific candidate from a job's match set (e.g. when manually linked).
 */
const removeJobMatch = async (jobId, candidateId) => {
  try {
    await redis.zrem(jobMatchesKey(jobId), String(candidateId));
  } catch (e) {
    console.warn('[matchingCacheService] removeJobMatch failed (non-fatal):', e.message);
  }
};

/**
 * Invalidate all cached matches for a job (e.g. when job description changes).
 */
const invalidateJobMatches = async (jobId) => {
  try {
    await redis.del(jobMatchesKey(jobId));
  } catch (e) {
    console.warn('[matchingCacheService] invalidateJobMatches failed (non-fatal):', e.message);
  }
};

/**
 * Invalidate ALL job:*:matches ZSETs across the entire keyspace.
 * Call this when the global engine config changes — every cached score
 * was computed with old weights and is now wrong.
 */
const invalidateAllJobMatches = async () => {
  try {
    const allKeys = await redis.keys('job:*:matches');
    if (allKeys.length) {
      await redis.del(...allKeys);
      console.log(`[matchingCacheService] invalidated ${allKeys.length} job:*:matches keys after engine config change`);
    }
  } catch (e) {
    console.warn('[matchingCacheService] invalidateAllJobMatches failed (non-fatal):', e.message);
  }
};

/**
 * Invalidate ALL candidate:*:opportunities ZSETs.
 * Call alongside invalidateAllJobMatches after a global config change.
 */
const invalidateAllCandidateOpportunities = async () => {
  try {
    const allKeys = await redis.keys('candidate:*:opportunities');
    if (allKeys.length) {
      await redis.del(...allKeys);
      console.log(`[matchingCacheService] invalidated ${allKeys.length} candidate:*:opportunities keys`);
    }
  } catch (e) {
    console.warn('[matchingCacheService] invalidateAllCandidateOpportunities failed (non-fatal):', e.message);
  }
};

/**
 * Full cache wipe triggered by a global engine config change.
 * All match scores are stale — clear both ZSETs.
 */
const invalidateAllMatchCaches = async () => {
  await Promise.all([invalidateAllJobMatches(), invalidateAllCandidateOpportunities()]);
};

/**
 * Candidate updated their profile → remove them from EVERY job:*:matches ZSET.
 * Their old score in each job's ranked list is now wrong.
 * Also wipes their own opportunities list (already stale from profile change).
 *
 * @param {string} candidateId
 */
const invalidateCandidateInAllJobMatches = async (candidateId) => {
  try {
    const jobMatchKeys = await redis.keys('job:*:matches');
    if (jobMatchKeys.length) {
      await Promise.all(jobMatchKeys.map((key) => redis.zrem(key, String(candidateId))));
      console.log(`[matchingCacheService] removed candidate ${candidateId} from ${jobMatchKeys.length} job match sets`);
    }
  } catch (e) {
    console.warn('[matchingCacheService] invalidateCandidateInAllJobMatches failed (non-fatal):', e.message);
  }
};

/**
 * Job updated its data → remove it from EVERY candidate:*:opportunities ZSET.
 * The job's old score in each candidate's ranked list is now wrong.
 * Also wipes the job's own matches list.
 *
 * @param {string} jobId
 */
const invalidateJobInAllCandidateOpportunities = async (jobId) => {
  try {
    const oppKeys = await redis.keys('candidate:*:opportunities');
    if (oppKeys.length) {
      await Promise.all(oppKeys.map((key) => redis.zrem(key, String(jobId))));
      console.log(`[matchingCacheService] removed job ${jobId} from ${oppKeys.length} candidate opportunity sets`);
    }
  } catch (e) {
    console.warn('[matchingCacheService] invalidateJobInAllCandidateOpportunities failed (non-fatal):', e.message);
  }
};

/**
 * Count how many candidates are cached for a job.
 */
const countJobMatches = async (jobId) => {
  try {
    return await redis.zcard(jobMatchesKey(jobId));
  } catch (e) {
    return 0;
  }
};

// ─── Candidate → Jobs (opportunities) ─────────────────────────────────────────

/**
 * Record one job opportunity score for a candidate.
 * ZADD candidate:{candidateId}:opportunities {score} {jobId}
 */
const recordCandidateOpportunity = async (candidateId, jobId, matchPct) => {
  try {
    const key = candidateOppsKey(candidateId);
    await redis.zadd(key, matchPct, String(jobId));
    if (OPPORTUNITIES_TTL) await redis.expire(key, OPPORTUNITIES_TTL);
  } catch (e) {
    console.warn('[matchingCacheService] recordCandidateOpportunity failed (non-fatal):', e.message);
  }
};

/**
 * Bulk-write job opportunities for many candidates at once (called after a sonar scan).
 * @param {Array<{ candidateId: string, jobId: string, matchPct: number }>} results
 */
const recordCandidateOpportunitiesBulk = async (results) => {
  if (!results?.length) return;
  // Group by candidateId for efficient ZADD
  const byCandidate = new Map();
  for (const { candidateId, jobId, matchPct } of results) {
    const cid = String(candidateId);
    if (!byCandidate.has(cid)) byCandidate.set(cid, []);
    byCandidate.get(cid).push({ score: matchPct, member: String(jobId) });
  }
  try {
    await Promise.all(
      [...byCandidate.entries()].map(async ([candidateId, entries]) => {
        const key = candidateOppsKey(candidateId);
        await redis.zaddMany(key, entries);
        if (OPPORTUNITIES_TTL) await redis.expire(key, OPPORTUNITIES_TTL);
      }),
    );
  } catch (e) {
    console.warn('[matchingCacheService] recordCandidateOpportunitiesBulk failed (non-fatal):', e.message);
  }
};

/**
 * Get top N jobs for a candidate, ordered by match % descending.
 * @param {string} candidateId
 * @param {number} [limit=20]
 * @returns {Promise<Array<{ jobId: string, matchPct: number }>>}
 */
const getCandidateOpportunities = async (candidateId, limit = 20) => {
  try {
    const raw = await redis.zrevrange(candidateOppsKey(candidateId), 0, limit - 1, true);
    return raw.map(({ member, score }) => ({ jobId: member, matchPct: score }));
  } catch (e) {
    console.warn('[matchingCacheService] getCandidateOpportunities failed (non-fatal):', e.message);
    return [];
  }
};

/**
 * Remove a specific job from a candidate's opportunities (e.g. candidate is linked to job).
 */
const removeCandidateOpportunity = async (candidateId, jobId) => {
  try {
    await redis.zrem(candidateOppsKey(candidateId), String(jobId));
  } catch (e) {
    console.warn('[matchingCacheService] removeCandidateOpportunity failed (non-fatal):', e.message);
  }
};

/**
 * Invalidate all cached opportunities for a candidate (e.g. candidate profile changes).
 */
const invalidateCandidateOpportunities = async (candidateId) => {
  try {
    await redis.del(candidateOppsKey(candidateId));
  } catch (e) {
    console.warn('[matchingCacheService] invalidateCandidateOpportunities failed (non-fatal):', e.message);
  }
};

// ─── Job Weights (sliders) ─────────────────────────────────────────────────────

/**
 * Save engine weight sliders for a job.
 * HSET job:{jobId}:weights semantic 40 geo 20 skills 30 salaryPenalty 10
 * @param {string} jobId
 * @param {Record<string, number>} weights  e.g. { semantic: 40, geo: 20, skills: 30, salaryPenalty: 10 }
 */
const setJobWeights = async (jobId, weights) => {
  if (!weights || typeof weights !== 'object') return;
  try {
    await redis.hmset(jobWeightsKey(jobId), weights);
    // Weights changed → scores for this job are stale, wipe them
    await redis.del(jobMatchesKey(jobId));
  } catch (e) {
    console.warn('[matchingCacheService] setJobWeights failed (non-fatal):', e.message);
  }
};

/**
 * Get engine weight sliders for a job.
 * Returns null when no weights have been saved yet (use engine defaults).
 * @param {string} jobId
 * @returns {Promise<Record<string, number>|null>}
 */
const getJobWeights = async (jobId) => {
  try {
    const raw = await redis.hgetall(jobWeightsKey(jobId));
    if (!raw) return null;
    // Cast all values to numbers
    return Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, parseFloat(v)]).filter(([, v]) => Number.isFinite(v)),
    );
  } catch (e) {
    console.warn('[matchingCacheService] getJobWeights failed (non-fatal):', e.message);
    return null;
  }
};

/**
 * Update a single weight field (e.g. from a slider drag).
 * @param {string} jobId
 * @param {string} field   e.g. "semantic"
 * @param {number} value
 */
const setJobWeight = async (jobId, field, value) => {
  try {
    await redis.hset(jobWeightsKey(jobId), field, value);
    // Single weight slider changed → that job's cached scores are stale
    await redis.del(jobMatchesKey(jobId));
  } catch (e) {
    console.warn('[matchingCacheService] setJobWeight failed (non-fatal):', e.message);
  }
};

/**
 * Delete the weights hash for a job (reset to engine defaults).
 */
const deleteJobWeights = async (jobId) => {
  try {
    await redis.del(jobWeightsKey(jobId));
  } catch (e) {
    console.warn('[matchingCacheService] deleteJobWeights failed (non-fatal):', e.message);
  }
};

// ─── Combined helper called after every Sonar scan ────────────────────────────

/**
 * Persist all scores from a completed Sonar scan into Redis.
 * - Writes job:{jobId}:matches   (candidate scores for the job)
 * - Writes candidate:{id}:opportunities  (job score for each candidate)
 *
 * @param {string} jobId
 * @param {Array<{ candidate: { id: string }, matchPercentage: number }>} rankedRows  — from runSonarScan
 */
const persistSonarResults = async (jobId, rankedRows) => {
  if (!Array.isArray(rankedRows) || !rankedRows.length) return;

  const jobMatchEntries = [];
  const opportunityEntries = [];

  for (const row of rankedRows) {
    const candidateId = row?.candidate?.id;
    const matchPct = row?.matchPercentage ?? row?.engineMatchPct;
    if (!candidateId || !Number.isFinite(matchPct)) continue;
    jobMatchEntries.push({ candidateId, matchPct });
    opportunityEntries.push({ candidateId, jobId, matchPct });
  }

  await Promise.all([
    recordJobMatchBulk(jobId, jobMatchEntries),
    recordCandidateOpportunitiesBulk(opportunityEntries),
  ]);
};

module.exports = {
  // Job → Candidates
  recordJobMatch,
  recordJobMatchBulk,
  getJobMatches,
  removeJobMatch,
  invalidateJobMatches,
  invalidateAllJobMatches,
  countJobMatches,
  // Candidate → Jobs
  recordCandidateOpportunity,
  recordCandidateOpportunitiesBulk,
  getCandidateOpportunities,
  removeCandidateOpportunity,
  invalidateCandidateOpportunities,
  invalidateAllCandidateOpportunities,
  // Global invalidation (engine config change)
  invalidateAllMatchCaches,
  // Cross-entity invalidation
  invalidateCandidateInAllJobMatches,
  invalidateJobInAllCandidateOpportunities,
  // Weights
  setJobWeights,
  getJobWeights,
  setJobWeight,
  deleteJobWeights,
  // Combined
  persistSonarResults,
};
