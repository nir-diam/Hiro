const { Op } = require('sequelize');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const Candidate = require('../models/Candidate');
const candidateService = require('./candidateService');
const jobService = require('./jobService');
const { persistSonarResults } = require('./matchingCacheService');
const { searchCandidates, warmCandidateVectorCache } = require('./vectorSearchService');
const screeningInclusionService = require('./screeningInclusionService');
const { normalizeAffinityLevel, passesAffinityLevel } = require('./affinityLevelFilter');
const clientUsageSettingService = require('./clientUsageSettingService');
const {
  computeMatchPackage,
  getJobEmbedding,
  buildIntentOptionsByCandidateIds,
  resolveJobGeoScope,
} = require('./matchingScoreService');
const {
  computeParameterMatches,
  jobHasMandatorySkills,
  jobHasNegativeSkills,
} = require('./matchingPenaltyService');
const { loadTagAliasIndex } = require('./tagAliasIndexService');
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
  mandatory_skill: 'mandatory_skill',
  negative_skill: 'negative_skill',
};

/** Skill hard-filters need tagDetails — vector pre-filter rows are slim and lack them. */
const TAG_DEPENDENT_HARD_FILTERS = new Set(['mandatory_skill', 'negative_skill']);

function splitHardFilters(filterKeys) {
  const all = Array.isArray(filterKeys) ? filterKeys : [];
  const tagDependent = all.filter((k) => TAG_DEPENDENT_HARD_FILTERS.has(k));
  const slimSafe = all.filter((k) => !TAG_DEPENDENT_HARD_FILTERS.has(k));
  return { slimSafe, tagDependent, all };
}

/**
 * Pre-filters aligned with matchingPenaltyService traffic lights (sync dimensions only).
 */
function passesHardFilters(candPlain, jobPlain, filterKeys, settings, aliasIndex = null) {
  if (!filterKeys.length) return true;
  const keys = new Set(filterKeys);

  if (keys.has('affinity')) {
    if (!screeningInclusionService.hasAffinity({ source: null }, candPlain, jobPlain)) return false;
  }

  const pm = computeParameterMatches(candPlain, jobPlain, aliasIndex);

  // Skill hard-filters require an explicit match — unknown/missing/mismatch all reject.
  if (keys.has('mandatory_skill') && jobHasMandatorySkills(jobPlain)) {
    if (pm.mandatory_skill !== 'match') return false;
  }
  if (keys.has('negative_skill') && jobHasNegativeSkills(jobPlain)) {
    if (pm.negative_skill !== 'match') return false;
  }

  for (const [filterKey, paramKey] of Object.entries(FILTER_TO_PARAM)) {
    const st = pm[paramKey];
    if (keys.has(filterKey) && (st === 'missing' || st === 'mismatch' || st === 'gap')) return false;
  }

  return true;
}

const SONAR_TAG_DETAIL_KEYS = [
  'id',
  'tagKey',
  'displayNameHe',
  'displayNameEn',
  'rawType',
  'context',
  'isCurrent',
  'isInSummary',
  'calculatedWeight',
  'confidenceScore',
  'finalScore',
];

/** Card payload: drop CV blobs and tag essays. The tag panel loads the full profile on open. */
function candidateForSonarResponse(candidatePlain) {
  if (!candidatePlain || typeof candidatePlain !== 'object') return candidatePlain;
  const {
    embedding: _emb,
    workExperience: _work,
    experience: _exp,
    companyExperiences: _companies,
    skills: _skills,
    tagDetails,
    ...rest
  } = candidatePlain;
  if (Array.isArray(tagDetails)) {
    rest.tagDetails = tagDetails.map((td) => {
      if (!td || typeof td !== 'object') return td;
      const slim = {};
      for (const key of SONAR_TAG_DETAIL_KEYS) {
        if (td[key] != null) slim[key] = td[key];
      }
      return slim;
    });
  }
  return rest;
}

/**
 * Distance hard-filter: keep a candidate only inside the matching-template
 * grace km for the job region (`geoMaxKm`, "מרחק לציון מלא").
 */
function passesDistanceHardFilter(breakdown, filterKeys) {
  if (!filterKeys.includes('distance')) return true;
  if (!breakdown) return false;
  if (breakdown.geoMissing) return false;

  const geoKm = breakdown.geoDistance;
  const maxKm = breakdown.geoMaxKm;
  const hasKm = typeof geoKm === 'number' && Number.isFinite(geoKm);
  const hasMax = typeof maxKm === 'number' && Number.isFinite(maxKm);

  // No workplace anchor on the job — distance does not apply.
  if (!hasKm && !hasMax) return true;
  if (!hasKm || !hasMax) return false;
  return geoKm <= maxKm;
}

/** Candidates whose settlement is inside the template grace km. */
async function findCandidateIdsWithinJobRange(scope, linkedSet, rejectedSet) {
  const names = Array.isArray(scope?.settlementNames) ? scope.settlementNames : [];
  if (!names.length) return [];
  const rows = await Candidate.findAll({
    attributes: ['id'],
    where: {
      isDeleted: false,
      isArchived: false,
      [Op.or]: [
        { address: { [Op.in]: names } },
        { location: { [Op.in]: names } },
      ],
    },
    limit: 250,
    raw: true,
  });
  const ids = [];
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : '';
    if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Sonar: vector-ranked candidates not yet linked to the job (and not screening-rejected for this job).
 * Scores via full matching engine: S_final = max(0, S_core − penalties).
 */
async function runSonarScan(jobId, body = {}, options = {}) {
  const t0 = Date.now();
  const lap = (label) => console.log(`[sonar ⏱] ${(Date.now()-t0).toString().padStart(5)}ms | ${label}`);

  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 5), 50);
  const parsedMin = Number.parseInt(body.matchThresholdMin, 10);
  const minPct = Number.isFinite(parsedMin)
    ? Math.min(Math.max(parsedMin, 0), 100)
    : 70;
  const useVector = body.useVector !== false;
  const filterKeys = Array.isArray(body.hardFilters)
    ? body.hardFilters.map((x) => String(x).trim()).filter((x) => x && x !== 'affinity')
    : [];
  const affinityLevel = normalizeAffinityLevel(body.affinityLevel);
  const { slimSafe: slimHardFilters, all: allHardFilters } = splitHardFilters(filterKeys);
  const SCORE_CONCURRENCY = 12;

  console.log(`\n[sonar ▶] START jobId=${jobId} limit=${limit} minPct=${minPct} affinity=${affinityLevel} vector=${useVector}`);
  // Start the embedding snapshot while the job row loads. A warm cache returns immediately.
  if (useVector) warmCandidateVectorCache();

  const job = await Job.findByPk(jobId); // include all fields (embedding needed for getJobEmbedding)
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  await jobService.hydrateJobSkills(job);
  const jobPlain = jobService.toPlainJobForMatchScore(job);
  lap('job loaded + skills hydrated');

  const tenantClientId = options.tenantClientId ? String(options.tenantClientId).trim() : '';
  const engineConfigPromise = resolveEngineConfigForJob(jobPlain, {
    tenantClientId: tenantClientId || null,
  });
  const [settings, linkedRows, rejRows, engineConfig, jobEmbResult, aliasIndex, geoScope] = await Promise.all([
    clientUsageSettingService.resolveScreeningDefaultsForJob(job),
    JobCandidate.findAll({ where: { jobId }, attributes: ['candidateId'] }),
    JobCandidateScreening.findAll({ where: { jobId, screeningStatus: 'rejected' }, attributes: ['candidateId'] })
      .catch(() => []),
    engineConfigPromise,
    getJobEmbedding(jobPlain),
    loadTagAliasIndex(),
    engineConfigPromise.then((cfg) => (
      cfg
        ? resolveJobGeoScope(jobPlain, cfg).catch((e) => {
            console.warn('[jobSonarService] resolveJobGeoScope failed', e.message || e);
            return null;
          })
        : null
    )),
  ]);

  const linkedSet  = new Set(linkedRows.map((r) => String(r.candidateId)));
  const rejectedSet = new Set(rejRows.map((r) => String(r.candidateId)));
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
        {
          ...intentOpts,
          skipRemoteGeocode: true,
          ...(Number.isFinite(Number(intentOpts.vectorScore))
            ? { vectorScore: Number(intentOpts.vectorScore) }
            : {}),
        },
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
    // Engine scoring is the slow part. Vector-rank first, then score only the page.
    // Hard filters drop people, so keep a small extra pool. Distance uses the settlement set.
    const scoreCap = filterKeys.length
      ? Math.min(Math.max(limit * 2, 24), 28)
      : Math.min(limit + (affinityLevel === 'none' ? 0 : 4), 24);
    const distanceRestricted = filterKeys.includes('distance')
      && Array.isArray(geoScope?.settlementNames)
      && geoScope.settlementNames.length > 0;

    let raw = [];
    if (distanceRestricted) {
      const nearbyIds = await findCandidateIdsWithinJobRange(geoScope, linkedSet, rejectedSet);
      lap(`nearby candidates inside ${geoScope.maxValidKm}km: ${nearbyIds.length}`);
      if (nearbyIds.length) {
        raw = await searchCandidates({
          query: queryText,
          precomputedEmbedding: jobEmb.length > 0 ? jobEmb : undefined,
          filters: {},
          limit: scoreCap,
          maxLimitCap: scoreCap,
          candidateIds: nearbyIds,
          minSimilarity: 0,
          maxInlineEmbedRebuild: 0,
          requireKeywordMatch: false,
          hydrateResults: false,
        });
        const seen = new Set(raw.map((row) => String(row.id)));
        for (const id of nearbyIds) {
          if (raw.length >= scoreCap) break;
          if (seen.has(id)) continue;
          seen.add(id);
          raw.push({ id, similarity: 0 });
        }
      }
    } else {
      // Pull a wider vector list so people already on the job don't eat the page,
      // then score only scoreCap of those who are still eligible.
      const fetchLimit = Math.min(Math.max(scoreCap * 2, 30), 40);
      raw = await searchCandidates({
        query: queryText,
        precomputedEmbedding: jobEmb.length > 0 ? jobEmb : undefined,
        filters: {},
        limit: fetchLimit,
        maxLimitCap: fetchLimit,
        maxInlineEmbedRebuild: 0,
        requireKeywordMatch: false,
        hydrateResults: false,
      });
    }
    lap(`vector search returned ${raw.length} candidates`);

    const prelim = [];
    for (const row of raw) {
      const id = row.id != null ? String(row.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      const sim = typeof row.similarity === 'number' ? row.similarity : -1;
      const vectorPct = cosineToMatchPercent(sim);
      if (!distanceRestricted) {
        const vectorFloor = Math.min(55, Math.max(22, minPct - 28));
        if (vectorPct < vectorFloor) continue;
      }
      const { similarity: _sim, ...candidateRest } = row;
      if (!passesHardFilters(candidateRest, jobPlain, slimHardFilters, settings, aliasIndex)) continue;
      prelim.push({ id, vectorPct, sim, candidateRest });
    }
    if (prelim.length > scoreCap) {
      prelim.sort((a, b) => b.vectorPct - a.vectorPct);
      prelim.length = scoreCap;
    }
    lap(`pre-filtered to ${prelim.length} candidates`);

    const scoreIds = prelim.map((p) => p.id);
    const [heavyRows, intentByCandidate] = await Promise.all([
      candidateService.findManyWithTagsForMatchScore(scoreIds, {
        includeEmbedding: distanceRestricted,
        omitExperienceJson: engineConfig?.isExperienceEnabled !== true,
      }),
      buildIntentOptionsByCandidateIds(scoreIds),
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
          if (!passesHardFilters(candidatePlain, jobPlain, allHardFilters, settings, aliasIndex)) continue;
          const intentOpts = {
            ...(intentByCandidate.get(id) || {}),
            ...(!distanceRestricted && Number.isFinite(sim) ? { vectorScore: vectorPct } : {}),
          };
          const { matchPct, breakdown, parameterMatches } = await scoreCandidatePlain(
            candidatePlain,
            vectorPct,
            intentOpts,
          );
          if (!passesDistanceHardFilter(breakdown, filterKeys)) continue;
          if (!passesAffinityLevel(breakdown?.intentType, affinityLevel)) continue;
          if (matchPct < minPct) continue;
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
    const slimRows = await Candidate.findAll({
      attributes: [
        'id',
        'gender',
        'mobility',
        'jobScope',
        'jobScopes',
        'salaryMax',
        'age',
        'birthYear',
        'birthMonth',
        'birthDay',
        'drivingLicense',
        'drivingLicenses',
        'preferredWorkingHours',
        'employmentType',
        'employmentTypes',
      ],
      where: { isDeleted: false, isArchived: false },
      raw: true,
    });
    const cap = Math.min(Math.max(limit * 2, 40), 48);
    const eligible = [];
    for (const c of slimRows) {
      const id = c.id != null ? String(c.id) : '';
      if (!id || linkedSet.has(id) || rejectedSet.has(id)) continue;
      if (!passesHardFilters(c, jobPlain, slimHardFilters, settings, aliasIndex)) continue;
      eligible.push(id);
      if (eligible.length >= cap) break;
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
          if (!passesHardFilters(candidatePlain, jobPlain, allHardFilters, settings, aliasIndex)) continue;
          const { matchPct, breakdown, parameterMatches } = await scoreCandidatePlain(
            candidatePlain,
            fallback,
            intentOpts,
          );
          if (!passesDistanceHardFilter(breakdown, filterKeys)) continue;
          if (!passesAffinityLevel(breakdown?.intentType, affinityLevel)) continue;
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
          geoMaxKm: geoScope?.maxValidKm ?? null,
          geoRegion: geoScope?.regionLabel || null,
        }
      : null,
    rows,
  };
}

/**
 * Candidates dismissed via Sonar "ignore" for this job (rejectionReason = sonar_ignore).
 */
async function listSonarIgnores(jobId) {
  if (!jobId) {
    const err = new Error('jobId is required');
    err.status = 400;
    throw err;
  }

  const rows = await JobCandidateScreening.findAll({
    where: {
      jobId,
      screeningStatus: 'rejected',
      rejectionReason: 'sonar_ignore',
    },
    attributes: ['id', 'candidateId', 'updatedAt', 'createdAt'],
    include: [
      {
        model: Candidate,
        as: 'candidate',
        attributes: ['id', 'fullName', 'firstName', 'email', 'phone'],
        required: true,
      },
    ],
    order: [['updatedAt', 'DESC']],
  }).catch(() => []);

  return {
    count: rows.length,
    items: rows.map((row) => {
      const c = row.candidate;
      const plain = typeof c?.toJSON === 'function' ? c.toJSON() : c;
      return {
        candidateId: String(row.candidateId),
        fullName: plain?.fullName || plain?.firstName || '',
        email: plain?.email || null,
        phone: plain?.phone || null,
        ignoredAt: row.updatedAt || row.createdAt || null,
      };
    }),
  };
}

/**
 * Clear a Sonar ignore so the candidate can appear in future scans.
 * Only clears rows that were created via sonar_ignore (not screening rejections).
 */
async function clearSonarIgnore(jobId, candidateId) {
  if (!jobId || !candidateId) {
    const err = new Error('jobId and candidateId are required');
    err.status = 400;
    throw err;
  }

  const row = await JobCandidateScreening.findOne({
    where: {
      jobId,
      candidateId,
      screeningStatus: 'rejected',
      rejectionReason: 'sonar_ignore',
    },
  });

  if (!row) {
    const err = new Error('Sonar ignore not found');
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

module.exports = {
  runSonarScan,
  buildJobSonarQuery,
  passesHardFilters,
  passesAffinityLevel,
  passesDistanceHardFilter,
  listSonarIgnores,
  clearSonarIgnore,
};
