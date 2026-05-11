const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateService = require('./candidateService');
const { searchCandidates } = require('./vectorSearchService');
const screeningInclusionService = require('./screeningInclusionService');
const clientUsageSettingService = require('./clientUsageSettingService');

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
      const matchPct = cosineToMatchPercent(sim);
      if (matchPct < minPct) continue;
      const { similarity: _sim, ...candidateRest } = row;
      if (!passesHardFilters(candidateRest)) continue;
      ranked.push({
        candidate: candidateRest,
        matchPercentage: matchPct,
        vectorSimilarity: sim,
      });
    }
  } else {
    const all = await candidateService.list();
    for (const c of all) {
      const id = c.id != null ? String(c.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      const ms = typeof c.matchScore === 'number' ? c.matchScore : 0;
      if (ms < minPct) continue;
      if (!passesHardFilters(c)) continue;
      ranked.push({
        candidate: { ...c },
        matchPercentage: ms,
        vectorSimilarity: null,
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
