const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateService = require('./candidateService');
const { searchCandidates } = require('./vectorSearchService');
const screeningInclusionService = require('./screeningInclusionService');
const clientUsageSettingService = require('./clientUsageSettingService');
const { computeFullMatchScore, getJobEmbedding } = require('./matchingScoreService');
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

/**
 * Sonar: vector-ranked candidates not yet linked to the job (and not screening-rejected for this job).
 */
async function runSonarScan(jobId, body = {}) {
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 5), 50);
  const minPct = Math.min(Math.max(parseInt(body.matchThresholdMin, 10) || 70, 50), 95);
  const useVector = body.useVector !== false;
  const filterKeys = Array.isArray(body.hardFilters) ? body.hardFilters.map((x) => String(x).trim()) : [];

  const job = await Job.findByPk(jobId);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }

  const jobPlain = job.get({ plain: true });
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

  const passesHardFilters = (candPlain) => {
    if (!filterKeys.length) return true;
    const keys = new Set(filterKeys);

    if (keys.has('license') || keys.has('age') || keys.has('scope')) {
      const hard = screeningInclusionService.checkHardRequirements(candPlain, jobPlain, settings);
      if (keys.has('license') && hard.reasons.includes('license')) return false;
      if (keys.has('age') && hard.reasons.some((r) => r === 'age_unknown' || r === 'age_min' || r === 'age_max')) {
        return false;
      }
      if (keys.has('scope') && hard.reasons.includes('mandatory_skill')) return false;
    }

    if (keys.has('salary')) {
      const jMax = Number(jobPlain.salaryMax);
      const cMin = candPlain.salaryMin != null ? Number(candPlain.salaryMin) : NaN;
      if (Number.isFinite(jMax) && Number.isFinite(cMin) && cMin > jMax * 1.15) return false;
    }

    if (keys.has('affinity')) {
      if (!screeningInclusionService.hasAffinity({ source: null }, candPlain, jobPlain)) return false;
    }

    if (keys.has('gender') && jobPlain.gender && String(jobPlain.gender).trim() !== 'לא משנה') {
      const g = candPlain.gender ? String(candPlain.gender).trim() : '';
      const jg = String(jobPlain.gender).trim();
      if (g && jg && g !== jg) return false;
    }

    if (keys.has('mobility') && jobPlain.mobility === true && !candPlain.mobility) return false;

    if (keys.has('hours')) {
      const jt = Array.isArray(jobPlain.jobType) ? jobPlain.jobType.join(',') : String(jobPlain.jobType || '');
      const pref = Array.isArray(candPlain.preferredWorkModels)
        ? candPlain.preferredWorkModels.join(',')
        : '';
      if (jt.includes('מלאה') && pref && !/מלאה|full/i.test(pref)) return false;
    }

    return true;
  };

  // Load admin engine config + job embedding once (both are cached in-process)
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

  /**
   * Re-score a candidate plain object with the full matching engine.
   * Falls back to the provided `fallbackPct` if scoring fails.
   */
  async function fullScore(candidatePlain, fallbackPct) {
    if (!engineConfig) return { matchPct: fallbackPct, breakdown: null };
    try {
      const result = await computeFullMatchScore(candidatePlain, jobPlain, jobEmb, engineConfig, null);
      return { matchPct: Math.round(result.finalScore), breakdown: result.breakdown };
    } catch (e) {
      return { matchPct: fallbackPct, breakdown: null };
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

    for (const row of raw) {
      const id = row.id != null ? String(row.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      const sim = typeof row.similarity === 'number' ? row.similarity : -1;
      const vectorPct = cosineToMatchPercent(sim);
      // Cheap gate: drop only very weak embeddings; composite score can still qualify someone below this.
      const vectorFloor = Math.min(55, Math.max(22, minPct - 28));
      if (vectorPct < vectorFloor) continue;
      const { similarity: _sim, ...candidateRest } = row;
      if (!passesHardFilters(candidateRest)) continue;
      const { matchPct, breakdown } = await fullScore(candidateRest, vectorPct);
      const passesComposite = matchPct >= minPct;
      const passesVector = vectorPct >= minPct;
      // Inclusion: keep candidates that pass either the weighted engine OR raw vector floor —
      // embeddings often beat tags/geo, so requiring composite ≥ threshold alone is too strict.
      // BUT the headline score we display MUST be the weighted engine score so the UI never
      // silently falls back to cosine similarity (which would hide low tag/geo/experience fit).
      if (!passesComposite && !passesVector) continue;
      ranked.push({
        candidate: candidateRest,
        matchPercentage: matchPct,
        engineMatchPct: matchPct,
        vectorSimilarity: sim,
        scoreBreakdown: breakdown,
      });
    }
  } else {
    const all = await candidateService.list();
    for (const c of all) {
      const id = c.id != null ? String(c.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      if (!passesHardFilters(c)) continue;
      const { matchPct, breakdown } = await fullScore(c, typeof c.matchScore === 'number' ? c.matchScore : 0);
      if (matchPct < minPct) continue;
      ranked.push({
        candidate: { ...c },
        matchPercentage: matchPct,
        vectorSimilarity: null,
        scoreBreakdown: breakdown,
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
    rows,
  };
}

module.exports = {
  runSonarScan,
  buildJobSonarQuery,
};
