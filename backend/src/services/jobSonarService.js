const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateService = require('./candidateService');
const jobService = require('./jobService');
const { persistSonarResults } = require('./matchingCacheService');
const { searchCandidates } = require('./vectorSearchService');
const screeningInclusionService = require('./screeningInclusionService');
const clientUsageSettingService = require('./clientUsageSettingService');
const {
  computeMatchPackage,
  getJobEmbedding,
  buildIntentOptionsByCandidateIds,
} = require('./matchingScoreService');
const { computeParameterMatches } = require('./matchingPenaltyService');
const { resolveEngineConfigForJob } = require('./matchingEngineService');

function cosineToMatchPercent(score) {
  if (!Number.isFinite(score)) return 0;
  let pct;
  if (score >= 0 && score <= 1) pct = Math.round(score * 100);
  else pct = Math.round(((score + 1) / 2) * 100);
  return Math.max(0, Math.min(100, pct));
}

function buildJobSonarQuery(job) {
  const j = job && typeof job === 'object' ? job : {};
  const parts = [];
  const push = (label, v) => {
    const s = v != null ? String(v).trim() : '';
    if (s) parts.push(`${label}: ${s}`);
  };
  push('Title', j.title);
  push('Role', j.role);
  push('Field', j.field);
  push('Description', j.description || j.internalDescription);
  push('Public description', j.publicDescription || j.PublicDescription);
  const skills = Array.isArray(j.skills) ? j.skills : [];
  const skillBits = skills
    .map((s) => (s && typeof s === 'object' ? String(s.name || s.key || '').trim() : ''))
    .filter(Boolean);
  if (skillBits.length) push('Skills', skillBits.join(', '));
  const reqs = Array.isArray(j.requirements) ? j.requirements : [];
  if (reqs.length) push('Requirements', reqs.map((r) => String(r || '').trim()).filter(Boolean).join('\n'));
  const langs = Array.isArray(j.languages) ? j.languages : [];
  const langBits = langs
    .map((l) => (l && typeof l === 'object' ? String(l.language || l.name || '').trim() : ''))
    .filter(Boolean);
  if (langBits.length) push('Languages', langBits.join(', '));
  return parts.join('\n');
}

const FILTER_TO_PARAM = {
  gender: 'gender',
  mobility: 'mobility',
  license: 'license',
  scope: 'scope',
  hours: 'work_hours',
  salary: 'salary',
  age: 'age',
};

/**
 * Pre-filters aligned with matchingPenaltyService traffic lights (sync dimensions only).
 */
function passesHardFilters(candPlain, jobPlain, filterKeys, settings) {
  if (!filterKeys.length) return true;
  const keys = new Set(filterKeys);

  if (keys.has('affinity')) {
    if (!screeningInclusionService.hasAffinity({ source: null }, candPlain, jobPlain)) return false;
  }

  const pm = computeParameterMatches(candPlain, jobPlain);
  for (const [filterKey, paramKey] of Object.entries(FILTER_TO_PARAM)) {
    const st = pm[paramKey];
    if (keys.has(filterKey) && (st === 'missing' || st === 'mismatch' || st === 'gap')) return false;
  }

  return true;
}

/** API response: never expose large embedding vectors. */
function candidateForSonarResponse(candidatePlain) {
  if (!candidatePlain || typeof candidatePlain !== 'object') return candidatePlain;
  const { embedding: _emb, ...rest } = candidatePlain;
  return rest;
}

/** Distance hard-filter needs engine geo breakdown (async path). */
function passesDistanceHardFilter(breakdown, filterKeys) {
  if (!filterKeys.includes('distance')) return true;
  if (!breakdown) return true;
  const geoScore = breakdown.geoScore ?? breakdown.geo;
  const geoKm = breakdown.geoDistance;
  if (typeof geoScore === 'number' && geoScore < 55) return false;
  if (typeof geoKm === 'number' && Number.isFinite(geoKm) && geoKm > 60) return false;
  return true;
}

/**
 * Sonar: vector-ranked candidates not yet linked to the job (and not screening-rejected for this job).
 * Scores via full matching engine: S_final = max(0, S_core − penalties).
 */
async function runSonarScan(jobId, body = {}) {
  const t0 = Date.now();
  const lap = (label) => console.log(`[sonar ⏱] ${(Date.now()-t0).toString().padStart(5)}ms | ${label}`);

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 5), 50);
  const minPct = Math.min(Math.max(parseInt(body.matchThresholdMin, 10) || 70, 50), 95);
  const useVector = body.useVector !== false;
  const filterKeys = Array.isArray(body.hardFilters) ? body.hardFilters.map((x) => String(x).trim()) : [];
  const SCORE_CONCURRENCY = 12;

  console.log(`\n[sonar ▶] START jobId=${jobId} limit=${limit} minPct=${minPct}`);

  const job = await Job.findByPk(jobId); // include all fields (embedding needed for getJobEmbedding)
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  await jobService.hydrateJobSkills(job);
  const jobPlain = jobService.toPlainJobForMatchScore(job);
  lap('job loaded + skills hydrated');

  const [settings, linkedRows, rejRows, engineConfigResult, jobEmbResult] = await Promise.all([
    clientUsageSettingService.resolveScreeningDefaultsForJob(job),
    JobCandidate.findAll({ where: { jobId }, attributes: ['candidateId'] }),
    JobCandidateScreening.findAll({ where: { jobId, screeningStatus: 'rejected' }, attributes: ['candidateId'] })
      .catch(() => []),
    resolveEngineConfigForJob(jobPlain),
    getJobEmbedding(jobPlain),
  ]);

  const linkedSet  = new Set(linkedRows.map((r) => String(r.candidateId)));
  const rejectedSet = new Set(rejRows.map((r) => String(r.candidateId)));
  const engineConfig = engineConfigResult;
  const jobEmb = jobEmbResult || [];
  lap(`settings + links + config + embedding loaded (linked=${linkedSet.size}, rejected=${rejectedSet.size})`);

  async function scoreCandidatePlain(candidatePlain, fallbackPct, intentOpts = {}) {
    if (!engineConfig) {
      return { matchPct: fallbackPct, breakdown: null, parameterMatches: null };
    }
    try {
      const result = await computeMatchPackage(
        candidatePlain,
        jobPlain,
        jobEmb,
        engineConfig,
        null,
        intentOpts,
      );
      return {
        matchPct: Math.round(result.matchScore),
        breakdown: result.scoreBreakdown,
        parameterMatches: result.parameterMatches,
      };
    } catch (e) {
      console.warn('[jobSonarService] computeMatchPackage failed', candidatePlain?.id, e.message || e);
      return { matchPct: fallbackPct, breakdown: null, parameterMatches: null };
    }
  }

  let ranked = [];

  if (useVector) {
    const queryText = buildJobSonarQuery(jobPlain);
    const fetchLimit = Math.min(Math.max(limit * 8, 80), 400);
    // Pass the already-cached jobEmb — eliminates the duplicate Gemini embedding call
    const raw = await searchCandidates({
      query: queryText,
      precomputedEmbedding: jobEmb.length > 0 ? jobEmb : undefined,
      filters: {},
      limit: fetchLimit,
      maxLimitCap: 400,
    });
    lap(`vector search returned ${raw.length} candidates`);

    const prelim = [];
    for (const row of raw) {
      const id = row.id != null ? String(row.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      const sim = typeof row.similarity === 'number' ? row.similarity : -1;
      const vectorPct = cosineToMatchPercent(sim);
      const vectorFloor = Math.min(55, Math.max(22, minPct - 28));
      if (vectorPct < vectorFloor) continue;
      const { similarity: _sim, ...candidateRest } = row;
      if (!passesHardFilters(candidateRest, jobPlain, filterKeys, settings)) continue;
      prelim.push({ id, vectorPct, sim, candidateRest });
    }
    lap(`pre-filtered to ${prelim.length} candidates`);

    const [heavyRows, intentByCandidate] = await Promise.all([
      candidateService.findManyWithTagsForMatchScore(prelim.map((p) => p.id)),
      buildIntentOptionsByCandidateIds(prelim.map((p) => p.id)),
    ]);
    const heavyById = new Map(
      heavyRows.map((r) => [String(r.id), candidateService.toPlainCandidateForMatchScore(r)]),
    );
    lap(`heavy candidate data loaded (${heavyRows.length})`);

    // Score in parallel with bounded concurrency
    const rankedRaw = [];
    await Promise.all(
      Array.from({ length: SCORE_CONCURRENCY }, async () => {
        while (prelim.length > 0) {
          const item = prelim.shift();
          if (!item) break;
          const { id, vectorPct, sim, candidateRest } = item;
          const candidatePlain = heavyById.get(id) || candidateRest;
          const intentOpts = intentByCandidate.get(id) || {};
          const { matchPct, breakdown, parameterMatches } = await scoreCandidatePlain(
            candidatePlain,
            vectorPct,
            intentOpts,
          );
          if (!passesDistanceHardFilter(breakdown, filterKeys)) continue;
          const passesComposite = matchPct >= minPct;
          const passesVector = vectorPct >= minPct;
          if (!passesComposite && !passesVector) continue;
          rankedRaw.push({
            candidate: candidateForSonarResponse(candidatePlain),
            matchPercentage: matchPct,
            engineMatchPct: matchPct,
            vectorSimilarity: sim,
            scoreBreakdown: breakdown,
            parameterMatches,
          });
        }
      }),
    );
    ranked = rankedRaw;
    lap(`scoring done (${ranked.length} above threshold)`);
  } else {
    const all = await candidateService.list();
    const eligible = [];
    for (const c of all) {
      const id = c.id != null ? String(c.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      if (!passesHardFilters(c, jobPlain, filterKeys, settings)) continue;
      eligible.push(id);
    }
    lap(`non-vector: ${eligible.length} eligible candidates`);

    const [heavyRows, intentByCandidate] = await Promise.all([
      candidateService.findManyWithTagsForMatchScore(eligible),
      buildIntentOptionsByCandidateIds(eligible),
    ]);
    lap(`heavy data loaded (${heavyRows.length})`);

    const eligibleQueue = [...heavyRows];
    const rankedRaw = [];
    await Promise.all(
      Array.from({ length: SCORE_CONCURRENCY }, async () => {
        while (eligibleQueue.length > 0) {
          const row = eligibleQueue.shift();
          if (!row) break;
          const candidatePlain = candidateService.toPlainCandidateForMatchScore(row);
          const id = String(candidatePlain.id);
          const fallback = typeof candidatePlain.matchScore === 'number' ? candidatePlain.matchScore : 0;
          const intentOpts = intentByCandidate.get(id) || {};
          const { matchPct, breakdown, parameterMatches } = await scoreCandidatePlain(
            candidatePlain,
            fallback,
            intentOpts,
          );
          if (!passesDistanceHardFilter(breakdown, filterKeys)) continue;
          if (matchPct < minPct) continue;
          rankedRaw.push({
            candidate: candidateForSonarResponse(candidatePlain),
            matchPercentage: matchPct,
            engineMatchPct: matchPct,
            vectorSimilarity: null,
            scoreBreakdown: breakdown,
            parameterMatches,
          });
        }
      }),
    );
    ranked = rankedRaw;
    lap(`scoring done (${ranked.length} above threshold)`);
  }

  ranked.sort((a, b) => b.matchPercentage - a.matchPercentage);
  const rows = ranked.slice(0, limit);

  // Persist scores to Redis (non-blocking — does not delay the API response)
  persistSonarResults(jobId, ranked).catch((e) => {
    console.warn('[jobSonarService] Redis persist failed (non-fatal):', e.message);
  });

  console.log(`[sonar ✅] DONE in ${Date.now()-t0}ms — returning ${rows.length} results\n`);

  return {
    job: {
      id: jobPlain.id,
      title: jobPlain.title,
      client: jobPlain.client,
    },
    engineConfig: engineConfig
      ? {
          mainWeights: engineConfig.mainWeights,
          isExperienceEnabled: engineConfig.isExperienceEnabled !== false,
        }
      : null,
    rows,
  };
}

module.exports = {
  runSonarScan,
  buildJobSonarQuery,
  passesHardFilters,
  passesDistanceHardFilter,
};
