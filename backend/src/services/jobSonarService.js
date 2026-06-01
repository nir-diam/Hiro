const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateService = require('./candidateService');
const jobService = require('./jobService');
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
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 5), 50);
  const minPct = Math.min(Math.max(parseInt(body.matchThresholdMin, 10) || 70, 50), 95);
  const useVector = body.useVector !== false;
  const filterKeys = Array.isArray(body.hardFilters) ? body.hardFilters.map((x) => String(x).trim()) : [];

  const job = await Job.findByPk(jobId, { attributes: { exclude: ['skills'] } });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  await jobService.hydrateJobSkills(job);

  const jobPlain = jobService.toPlainJobForMatchScore(job);
  const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(job);

  const linkedRows = await JobCandidate.findAll({
    where: { jobId },
    attributes: ['candidateId'],
  });
  const linkedSet = new Set(linkedRows.map((r) => String(r.candidateId)));

  let rejectedSet = new Set();
  try {
    const rej = await JobCandidateScreening.findAll({
      where: { jobId, screeningStatus: 'rejected' },
      attributes: ['candidateId'],
    });
    rejectedSet = new Set(rej.map((r) => String(r.candidateId)));
  } catch (e) {
    console.warn('[jobSonarService] JobCandidateScreening load skipped', e.message || e);
  }

  let engineConfig = null;
  let jobEmb = [];
  try {
    [engineConfig, jobEmb] = await Promise.all([
      resolveEngineConfigForJob(jobPlain),
      getJobEmbedding(jobPlain),
    ]);
  } catch (e) {
    console.warn('[jobSonarService] engine config/embedding load skipped:', e.message || e);
  }

  async function scoreCandidatePlain(candidatePlain, fallbackPct, intentOpts = {}) {
    if (!engineConfig) {
      return {
        matchPct: fallbackPct,
        breakdown: null,
        parameterMatches: null,
      };
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
      return {
        matchPct: fallbackPct,
        breakdown: null,
        parameterMatches: null,
      };
    }
  }

  let ranked = [];

  if (useVector) {
    const queryText = buildJobSonarQuery(jobPlain);
    const fetchLimit = Math.min(Math.max(limit * 8, 80), 400);
    const raw = await searchCandidates({
      query: queryText,
      filters: {},
      limit: fetchLimit,
      maxLimitCap: 400,
    });

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

    const heavyRows = await candidateService.findManyWithTagsForMatchScore(prelim.map((p) => p.id));
    const heavyById = new Map(
      heavyRows.map((r) => [String(r.id), candidateService.toPlainCandidateForMatchScore(r)]),
    );
    const intentByCandidate = await buildIntentOptionsByCandidateIds(prelim.map((p) => p.id));

    for (const { id, vectorPct, sim, candidateRest } of prelim) {
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

      ranked.push({
        candidate: candidateForSonarResponse(candidatePlain),
        matchPercentage: matchPct,
        engineMatchPct: matchPct,
        vectorSimilarity: sim,
        scoreBreakdown: breakdown,
        parameterMatches,
      });
    }
  } else {
    const all = await candidateService.list();
    const eligible = [];
    for (const c of all) {
      const id = c.id != null ? String(c.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      if (!passesHardFilters(c, jobPlain, filterKeys, settings)) continue;
      eligible.push(id);
    }

    const heavyRows = await candidateService.findManyWithTagsForMatchScore(eligible);
    const intentByCandidate = await buildIntentOptionsByCandidateIds(eligible);
    for (const row of heavyRows) {
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
      ranked.push({
        candidate: candidateForSonarResponse(candidatePlain),
        matchPercentage: matchPct,
        engineMatchPct: matchPct,
        vectorSimilarity: null,
        scoreBreakdown: breakdown,
        parameterMatches,
      });
    }
  }

  ranked.sort((a, b) => b.matchPercentage - a.matchPercentage);
  const rows = ranked.slice(0, limit);

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
