/**
 * candidateJobMatchingService
 * Computes AI + parametric job matches for a given candidate.
 * Mirrors jobSonarService but in the opposite direction: candidate → jobs.
 */
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const clientUsageSettingService = require('./clientUsageSettingService');
const screeningInclusionService = require('./screeningInclusionService');
const { embedCandidateAndSave, normalizeEmbedding, cosineSimilarity } = require('./vectorSearchService');
const { embedText } = require('./embeddingService');
const { buildJobSonarQuery } = require('./jobSonarService');

// ─── helpers ────────────────────────────────────────────────────────────────

function cosineToMatchPercent(score) {
  if (!Number.isFinite(score)) return 0;
  let pct;
  if (score >= 0 && score <= 1) pct = Math.round(score * 100);
  else pct = Math.round(((score + 1) / 2) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** In-process job-embedding cache (keyed by jobId, invalidated on restart). */
const _jobEmbCache = new Map(); // jobId → { hash, emb }

function jobHash(jobPlain) {
  const src = [jobPlain.title, jobPlain.description, JSON.stringify(jobPlain.skills), JSON.stringify(jobPlain.requirements)]
    .join('|')
    .slice(0, 4000);
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  return h;
}

async function getJobEmbedding(jobPlain) {
  const id = String(jobPlain.id);
  const h = jobHash(jobPlain);
  const cached = _jobEmbCache.get(id);
  if (cached && cached.hash === h) return cached.emb;
  const text = buildJobSonarQuery(jobPlain);
  if (!text.trim()) return [];
  const emb = await embedText(text.slice(0, 8000));
  if (emb && emb.length) _jobEmbCache.set(id, { hash: h, emb });
  return emb || [];
}

/**
 * Maps hard-requirement failure codes → { key, result: 'match'|'gap'|'unknown' }.
 */
function reasonsToParamMatches(reasons, job) {
  const failed = new Set(reasons);
  const result = (code) => (failed.has(code) ? 'gap' : 'match');

  const lic = job.licenseType ? String(job.licenseType).trim() : '';
  const hasLicense = lic && lic !== 'לא חשוב';
  const hasAge = Number.isFinite(Number(job.ageMin)) || Number.isFinite(Number(job.ageMax));
  const hasGender = job.gender && String(job.gender).trim() !== 'לא משנה';
  const hasMobility = job.mobility === true;
  const jType = Array.isArray(job.jobType) ? job.jobType.join(',') : String(job.jobType || '');
  const hasScope = jType.includes('מלאה') || jType.includes('חלקית');

  return {
    mandatory_skill: failed.has('mandatory_skill') ? 'gap' : (
      Array.isArray(job.skills) && job.skills.some((s) => s?.mode === 'mandatory') ? 'match' : 'unknown'
    ),
    license: hasLicense ? result('license') : 'unknown',
    age: hasAge ? (
      failed.has('age_unknown') ? 'unknown' :
      (failed.has('age_min') || failed.has('age_max')) ? 'gap' : 'match'
    ) : 'unknown',
    gender: hasGender ? (failed.has('gender') ? 'gap' : 'match') : 'unknown',
    mobility: hasMobility ? (failed.has('mobility') ? 'gap' : 'match') : 'unknown',
    scope: hasScope ? (failed.has('mandatory_skill') ? 'gap' : 'match') : 'unknown',
    mandatory_language: failed.has('mandatory_language') ? 'gap' : (
      Array.isArray(job.languages) && job.languages.some((l) => l?.mandatory === true) ? 'match' : 'unknown'
    ),
    salary: 'unknown', // salary mismatch not part of hard-fail by default
  };
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * @param {string} candidateId
 * @param {object} opts
 * @param {number} [opts.limit=50]
 * @param {number} [opts.minScore=0]
 * @param {string[]} [opts.statuses=['פתוחה','מוקפאת']]
 * @param {string[]} [opts.clientIds]
 * @param {string[]} [opts.cities]
 * @param {string[]} [opts.jobTypes]
 * @param {boolean} [opts.useVector=true]
 */
async function computeMatchesForCandidate(candidateId, opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 50, 1), 100);
  const minScore = Math.min(Math.max(parseInt(opts.minScore, 10) || 0, 0), 100);
  const useVector = opts.useVector !== false;
  const statuses = Array.isArray(opts.statuses) && opts.statuses.length
    ? opts.statuses
    : ['פתוחה', 'מוקפאת'];

  // 1. Load candidate
  const candidateRow = await Candidate.findByPk(candidateId);
  if (!candidateRow) {
    const e = new Error('Candidate not found');
    e.status = 404;
    throw e;
  }
  const candidate = candidateRow.get({ plain: true });

  // Ensure embedding
  let candidateEmb = normalizeEmbedding(candidate.embedding);
  if (useVector && (!candidateEmb || !candidateEmb.length)) {
    try {
      const rebuilt = await embedCandidateAndSave(candidateId);
      candidateEmb = normalizeEmbedding(rebuilt);
    } catch (e) {
      console.warn('[candidateJobMatchingService] rebuild embedding failed', e.message);
    }
  }

  // 2. Load existing links (determines matchType + jobCandidateId)
  const linkedRows = await JobCandidate.findAll({ where: { candidateId }, attributes: ['jobId', 'id', 'status'] });
  const linkedMap = new Map(linkedRows.map((r) => [String(r.jobId), { jcId: String(r.id), jcStatus: r.status }]));

  // 3. Load jobs filtered by status
  const jobWhere = {};
  const { Op } = require('sequelize');
  if (statuses.length) jobWhere.status = { [Op.in]: statuses };
  if (Array.isArray(opts.clientIds) && opts.clientIds.length) jobWhere.client = { [Op.in]: opts.clientIds };
  if (Array.isArray(opts.cities) && opts.cities.length) jobWhere.city = { [Op.in]: opts.cities };
  if (Array.isArray(opts.jobTypes) && opts.jobTypes.length) {
    // jobType is an array column – overlap check
    jobWhere[Op.or] = opts.jobTypes.map((jt) => ({
      jobType: { [Op.contains]: [jt] },
    }));
  }

  const allJobs = await Job.findAll({ where: jobWhere });

  // 4. Score each job
  const scored = [];
  for (const jobRow of allJobs) {
    const jobPlain = jobRow.get({ plain: true });
    const jid = String(jobPlain.id);

    let matchScore = 0;
    if (useVector && candidateEmb && candidateEmb.length) {
      try {
        const jobEmb = await getJobEmbedding(jobPlain);
        if (jobEmb && jobEmb.length && jobEmb.length === candidateEmb.length) {
          const sim = cosineSimilarity(candidateEmb, jobEmb);
          matchScore = cosineToMatchPercent(sim);
        }
      } catch (e) {
        console.warn('[candidateJobMatchingService] job embed failed', jid, e.message);
      }
    }

    if (matchScore < minScore) continue;

    // Hard requirements
    let requirementsMet = true;
    let parameterMatches = {};
    try {
      const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(jobRow);
      const hard = screeningInclusionService.checkHardRequirements(candidate, jobPlain, settings);
      requirementsMet = hard.ok;
      parameterMatches = reasonsToParamMatches(hard.reasons, jobPlain);
    } catch (e) {
      console.warn('[candidateJobMatchingService] hard requirements check failed', jid, e.message);
    }

    const linkedInfo = linkedMap.get(jid);
    scored.push({
      id: jid,
      title: jobPlain.title || '',
      client: jobPlain.client || '',
      status: jobPlain.status || '',
      city: jobPlain.city || '',
      region: jobPlain.region || '',
      jobType: Array.isArray(jobPlain.jobType) ? jobPlain.jobType : [],
      salaryMin: jobPlain.salaryMin || null,
      salaryMax: jobPlain.salaryMax || null,
      description: jobPlain.description || '',
      requirements: Array.isArray(jobPlain.requirements) ? jobPlain.requirements : [],
      skills: Array.isArray(jobPlain.skills) ? jobPlain.skills : [],
      languages: Array.isArray(jobPlain.languages) ? jobPlain.languages : [],
      role: jobPlain.role || '',
      field: jobPlain.field || '',
      matchScore,
      matchType: linkedInfo ? 'application' : 'ai',
      requirementsMet,
      parameterMatches,
      jobCandidateId: linkedInfo ? linkedInfo.jcId : null,
      lastAnalyzed: new Date().toLocaleDateString('he-IL'),
    });
  }

  // Sort: linked jobs first (within same score tier), then by score desc
  scored.sort((a, b) => {
    if (a.matchType === 'application' && b.matchType !== 'application') return -1;
    if (b.matchType === 'application' && a.matchType !== 'application') return 1;
    return b.matchScore - a.matchScore;
  });

  return { rows: scored.slice(0, limit) };
}

module.exports = { computeMatchesForCandidate };
