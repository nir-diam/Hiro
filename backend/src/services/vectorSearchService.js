const candidateService = require('./candidateService');
const { embedText, embedTextCached } = require('./embeddingService');
const { normalizeResumeSearchText } = require('../utils/normalizeResumeSearchText');

// In-memory candidate list cache — avoids re-fetching 600+ rows on every sonar scan
const CAND_LIST_CACHE_TTL_MS = 60_000; // 60 s
let _candListCache = null;
let _candListCacheAt = 0;

async function getCandidateListCached() {
  const now = Date.now();
  if (_candListCache && now - _candListCacheAt < CAND_LIST_CACHE_TTL_MS) {
    return _candListCache;
  }
  // Use slim query (no tags JOIN) — 10x faster than list()
  const list = await candidateService.listSlimForVectorSearch();
  _candListCache = list;
  _candListCacheAt = now;
  return list;
}

const buildSearchDocument = (candidate, extraText = '') => {
  if (!candidate) return '';
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const soft = candidate.skills?.soft || [];
  const tech = candidate.skills?.technical || [];
  const exp = Array.isArray(candidate.workExperience) ? candidate.workExperience : [];
  const languages = Array.isArray(candidate.languages) ? candidate.languages : [];
  const industries = [
    candidate.industry || '',
    candidate.field || '',
    ...(Array.isArray(candidate.internalTags) ? candidate.internalTags : []),
  ].filter(Boolean);

  const expText = exp
    .map((e) => {
      const title = e?.title || '';
      const company = e?.company || '';
      return [title, company].filter(Boolean).join(' at ');
    })
    .filter(Boolean)
    .join(', ');

  const langText = languages.map((l) => l?.name || l).filter(Boolean).join(', ');
  const preferredWork = Array.isArray(candidate.preferredWorkModels)
    ? candidate.preferredWorkModels.filter(Boolean).join(', ')
    : '';
  const techText = tech.map((t) => t?.name || t).filter(Boolean).join(', ');
  const skillsText = [
    ...tags,
    ...tech.map((t) => (t?.name ? t.name : t)),
    ...soft,
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `Job Title: ${candidate.title || ''}.`,
    `Summary: ${candidate.professionalSummary || ''}.`,
    `Skills: ${skillsText}.`,
    `Experience: ${expText}.`,
    `Industries: ${industries.join(', ')}.`,
    `Seniority: ${candidate.matchAnalysis?.seniority || ''}.`,
    `Languages: ${langText}.`,
    preferredWork ? `Preferred work model: ${preferredWork}.` : '',
    extraText || '',
  ].join('\n');
};

const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const EMBED_COOLDOWN_SEC = 5 * 60;
const embedCooldownUntil = new Map();
/** Prevent duplicate concurrent Gemini embed calls for the same candidate (per process). */
const embedInFlight = new Map();

function hasEmbeddableCandidateContent(candidate, extraText = '') {
  if (String(extraText || '').replace(/\s/g, '').length > 40) return true;
  if (!candidate) return false;
  if (String(candidate.searchText || '').trim().length > 40) return true;
  if (String(candidate.professionalSummary || '').trim().length > 10) return true;
  if (String(candidate.title || '').trim().length > 2) return true;
  if (Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0) return true;
  const skills = candidate.skills;
  if (Array.isArray(skills?.technical) && skills.technical.length > 0) return true;
  if (Array.isArray(skills?.soft) && skills.soft.length > 0) return true;
  if (Array.isArray(candidate.tags) && candidate.tags.length > 0) return true;
  return false;
}

async function isEmbedOnCooldown(candidateId) {
  const key = String(candidateId);
  const until = embedCooldownUntil.get(key);
  if (until && until > Date.now()) return true;
  try {
    const { isRedisAvailable } = require('../config/redis');
    if (isRedisAvailable()) {
      const redisService = require('./redisService');
      if (await redisService.exists(`embed:cooldown:${key}`)) return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

async function markEmbedCooldown(candidateId, ttlSeconds = EMBED_COOLDOWN_SEC) {
  const key = String(candidateId);
  embedCooldownUntil.set(key, Date.now() + ttlSeconds * 1000);
  try {
    const { isRedisAvailable } = require('../config/redis');
    if (isRedisAvailable()) {
      const redisService = require('./redisService');
      await redisService.set(`embed:cooldown:${key}`, '1', { ttlSeconds });
    }
  } catch (_) { /* ignore */ }
}

async function clearEmbedCooldown(candidateId) {
  const key = String(candidateId);
  embedCooldownUntil.delete(key);
  try {
    const { isRedisAvailable } = require('../config/redis');
    if (isRedisAvailable()) {
      const redisService = require('./redisService');
      await redisService.del(`embed:cooldown:${key}`);
    }
  } catch (_) { /* ignore */ }
}

async function acquireEmbedLock(candidateId, ttlSeconds = 120) {
  const lockKey = `embed:lock:${candidateId}`;
  try {
    const { isRedisAvailable, getRedisClient } = require('../config/redis');
    if (isRedisAvailable()) {
      const result = await getRedisClient().set(lockKey, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
  } catch (_) { /* ignore */ }
  return !embedInFlight.has(String(candidateId));
}

async function releaseEmbedLock(candidateId) {
  const lockKey = `embed:lock:${candidateId}`;
  try {
    const { isRedisAvailable, getRedisClient } = require('../config/redis');
    if (isRedisAvailable()) {
      await getRedisClient().del(lockKey);
    }
  } catch (_) { /* ignore */ }
}

const embedCandidateAndSave = async (candidateId, extraText = '') => {
  const key = String(candidateId || '');
  if (!key) return [];

  if (await isEmbedOnCooldown(key)) return [];

  const pending = embedInFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    let hasLock = false;
    try {
      if (!(await acquireEmbedLock(key))) return [];

      hasLock = true;
      const row = await candidateService.findByPkWithTagsForMatchScore(candidateId);
      if (!row) {
        await markEmbedCooldown(key);
        console.warn('[embed] candidate not found', candidateId);
        return [];
      }
      const candidate = candidateService.toPlainCandidateForMatchScore(row);
      if (!hasEmbeddableCandidateContent(candidate, extraText)) {
        await markEmbedCooldown(key);
        console.log('[embed] skip — profile not ready for embedding', candidateId);
        return [];
      }

      const doc = buildSearchDocument(candidate, extraText);
      console.log('[embed] candidate', candidateId, 'docSnippet:', doc.slice(0, 400));
      const embedding = await embedText(doc);
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        await markEmbedCooldown(key, 120);
        console.warn('[embed] skip update due to empty embedding', candidateId);
        return [];
      }
      const updatePayload = { embedding };
      if (extraText && extraText.trim()) {
        updatePayload.searchText = normalizeResumeSearchText(extraText).slice(0, 50000);
        updatePayload.searchTextSavedAt = new Date();
      }
      await candidateService.update(candidateId, updatePayload);
      await clearEmbedCooldown(key);
      _candListCache = null;
      return embedding;
    } finally {
      if (hasLock) await releaseEmbedLock(key);
    }
  })();

  embedInFlight.set(key, task);
  try {
    return await task;
  } finally {
    if (embedInFlight.get(key) === task) embedInFlight.delete(key);
  }
};

const collectTerms = (candidate) => {
  const base = buildSearchDocument(candidate);
  const extra = candidate.searchText || '';
  return `${base}\n${extra}`.toLowerCase();
};

const hasKeywordMatch = (queryWords, termsText) => {
  if (!queryWords.length) return true;
  if (!termsText) return false;
  return queryWords.some((w) => termsText.includes(w));
};

const normalizeEmbedding = (emb) => {
  if (!emb) return [];
  if (Array.isArray(emb)) return emb;
  // pgvector via Sequelize can come back as string "(...)" or "[...]" or object with "data"
  if (typeof emb === 'string') {
    const trimmed = emb.trim();
    const clean = trimmed.startsWith('(') || trimmed.startsWith('[')
      ? trimmed.slice(1, -1)
      : trimmed;
    return clean
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
  }
  if (emb?.data) {
    return Array.from(emb.data).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  }
  return [];
};

/**
 * Search candidates by semantic similarity.
 * @param {object} opts
 * @param {string}  [opts.query]         - text to embed (ignored when precomputedEmbedding is supplied)
 * @param {number[]} [opts.precomputedEmbedding] - pass an already-computed embedding to skip Gemini call
 * @param {object}  [opts.filters]
 * @param {number}  [opts.limit]
 * @param {number}  [opts.maxLimitCap]
 * @param {number}  [opts.maxInlineEmbedRebuild=0] - max on-the-fly Gemini embeds during search (keep 0 for Sonar)
 * @param {boolean} [opts.requireKeywordMatch=true] - when false, rank by vector similarity only
 */
const searchCandidates = async ({
  query,
  precomputedEmbedding,
  filters = {},
  limit = 20,
  maxLimitCap = 20,
  maxInlineEmbedRebuild = 0,
  requireKeywordMatch = true,
}) => {
  let qEmbedding;
  if (precomputedEmbedding && Array.isArray(precomputedEmbedding) && precomputedEmbedding.length > 0) {
    qEmbedding = precomputedEmbedding;
    console.log('[vectorSearch] using pre-computed embedding length', qEmbedding.length);
  } else {
    console.log('[vectorSearch] start', { query: (query || '').slice(0, 80), filters, limit });
    qEmbedding = await embedTextCached(query || '');
    console.log('[vectorSearch] query embedding length', qEmbedding.length);
  }
  if (!qEmbedding.length) return [];

  // Use cached candidate list to avoid repeated DB round-trips
  const all = await getCandidateListCached();
  const filtered = all.filter((c) => {
    if (filters.status && c.status !== filters.status) return false;
    if (filters.city && !(c.address || '').toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.salaryMax && c.salaryMax && Number(c.salaryMax) > Number(filters.salaryMax)) return false;
    return true;
  });

  const rebuildBudget = Math.max(0, Number(maxInlineEmbedRebuild) || 0);
  let rebuildCount = 0;
  let skippedMissingEmbedding = 0;

  console.log('[vectorSearch] filtered count', filtered.length, 'rebuild budget', rebuildBudget);

  // Cap max returned for sanity (Sonar may request a higher cap than default grid search)
  const cap = Number.isFinite(maxLimitCap) && maxLimitCap > 0 ? maxLimitCap : 20;
  const maxLimit = Math.min(limit || 20, cap);
  const queryWords = (query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const scored = [];
  const loopT0 = Date.now();
  for (let i = 0; i < filtered.length; i += 1) {
    const candidate = filtered[i];
    if (i > 0 && i % 250 === 0) {
      console.log(
        '[vectorSearch] progress',
        `${i}/${filtered.length}`,
        'scored',
        scored.length,
        'skippedMissingEmbedding',
        skippedMissingEmbedding,
        'inlineRebuilds',
        rebuildCount,
        `${Date.now() - loopT0}ms`,
      );
    }
    let emb = normalizeEmbedding(candidate.embedding);
    if (!emb.length || emb.length !== qEmbedding.length) {
      if (rebuildCount < rebuildBudget) {
        rebuildCount += 1;
        try {
          const rebuilt = await embedCandidateAndSave(candidate.id);
          emb = normalizeEmbedding(rebuilt);
        } catch (err) {
          console.error('[vectorSearch] rebuild candidate embedding failed', candidate.id, err.message || err);
          continue;
        }
      } else {
        skippedMissingEmbedding += 1;
        continue;
      }
    }

    if (!emb.length || emb.length !== qEmbedding.length) continue;

    const terms = collectTerms(candidate);
    if (requireKeywordMatch && !hasKeywordMatch(queryWords, terms)) continue;

    const score = cosineSimilarity(qEmbedding, emb);
    if (score < 0.30) continue;

    scored.push({
      candidate,
      score,
      embLen: emb.length,
      terms,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  console.log(
    '[vectorSearch] scored count',
    scored.length,
    'top1 score',
    scored[0]?.score,
    'skippedMissingEmbedding',
    skippedMissingEmbedding,
    'inlineRebuilds',
    rebuildCount,
    'loopMs',
    Date.now() - loopT0,
  );

  return scored.slice(0, maxLimit).map((s) => ({
    ...s.candidate.toJSON ? s.candidate.toJSON() : s.candidate,
    similarity: s.score,
  }));
};

module.exports = {
  buildSearchDocument,
  embedCandidateAndSave,
  hasEmbeddableCandidateContent,
  searchCandidates,
  cosineSimilarity,
  normalizeEmbedding,
};


