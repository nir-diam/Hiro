const fs = require('fs');
const path = require('path');
const candidateService = require('./candidateService');
const { embedText, embedTextCached } = require('./embeddingService');

// In-memory candidate list cache — id + Float32 embedding only (never CV text).
const CAND_LIST_CACHE_TTL_MS = 30 * 60_000;
const VECTOR_SEARCH_MAX_CONCURRENT =
  Number.parseInt(process.env.VECTOR_SEARCH_MAX_CONCURRENT || '1', 10) || 1;
let _vectorSearchActive = 0;
const _vectorSearchWaiters = [];

async function acquireVectorSearchSlot() {
  if (_vectorSearchActive < VECTOR_SEARCH_MAX_CONCURRENT) {
    _vectorSearchActive += 1;
    return;
  }
  await new Promise((resolve) => {
    _vectorSearchWaiters.push(resolve);
  });
  _vectorSearchActive += 1;
}

function releaseVectorSearchSlot() {
  _vectorSearchActive = Math.max(0, _vectorSearchActive - 1);
  const next = _vectorSearchWaiters.shift();
  if (next) next();
}

let _coreCache = null;
let _coreCacheAt = 0;
let _kwCache = null;
let _kwCacheAt = 0;
let _coreLoading = null;
let _kwLoading = null;

function toFloat32(arr) {
  if (!arr || !arr.length) return null;
  if (arr instanceof Float32Array) return arr;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i += 1) out[i] = arr[i] || 0;
  return out;
}

function compactVectorRow(row) {
  const emb = toFloat32(normalizeEmbedding(row.embedding));
  let embNorm = 0;
  if (emb) {
    for (let i = 0; i < emb.length; i += 1) embNorm += emb[i] * emb[i];
    embNorm = Math.sqrt(embNorm);
  }
  return {
    id: row.id,
    status: row.status,
    address: row.address,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    searchText: row.searchText || undefined,
    embedding: emb,
    embNorm,
  };
}

function clearCandidateListCache() {
  _coreCache = null;
  _coreCacheAt = 0;
  _kwCache = null;
  _kwCacheAt = 0;
}

// Local snapshot of the Float32 vectors. The JSONB pull from the remote DB is ~20s;
// reading this file is a few hundred milliseconds and stays valid for the memory TTL.
const EMBED_CACHE_FILE = path.join(__dirname, '..', '..', '.cache', 'candidate-embeddings-v1.bin');
const EMBED_CACHE_MAGIC = Buffer.from('HVEC');

function uuidToBytes(id) {
  const hex = String(id || '').replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(buf) {
  const hex = buf.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readFloat32(buf, offset, dim) {
  const emb = new Float32Array(dim);
  Buffer.from(emb.buffer, emb.byteOffset, dim * 4).set(buf.subarray(offset, offset + dim * 4));
  return emb;
}

function parseEmbedCacheFile(buf) {
  if (!buf || buf.length < 28 || !buf.subarray(0, 4).equals(EMBED_CACHE_MAGIC)) return null;
  if (buf.readUInt32LE(4) !== 1) return null;
  const count = buf.readUInt32LE(8);
  const maxUpdated = Number(buf.readBigUInt64LE(12));
  const stampCount = buf.readUInt32LE(20);
  const rows = [];
  let o = 28;
  for (let i = 0; i < count; i += 1) {
    if (o + 16 + 4 + 4 + 4 + 1 + 2 + 2 > buf.length) return null;
    const id = bytesToUuid(buf.subarray(o, o + 16));
    o += 16;
    const embNorm = buf.readFloatLE(o); o += 4;
    const salaryMinRaw = buf.readFloatLE(o); o += 4;
    const salaryMaxRaw = buf.readFloatLE(o); o += 4;
    const statusLen = buf.readUInt8(o); o += 1;
    if (o + statusLen + 2 > buf.length) return null;
    const status = buf.toString('utf8', o, o + statusLen);
    o += statusLen;
    const addressLen = buf.readUInt16LE(o); o += 2;
    if (o + addressLen + 2 > buf.length) return null;
    const address = buf.toString('utf8', o, o + addressLen);
    o += addressLen;
    const dim = buf.readUInt16LE(o); o += 2;
    if (!dim || o + dim * 4 > buf.length) return null;
    const embedding = readFloat32(buf, o, dim);
    o += dim * 4;
    rows.push({
      id,
      status,
      address,
      salaryMin: Number.isFinite(salaryMinRaw) ? salaryMinRaw : null,
      salaryMax: Number.isFinite(salaryMaxRaw) ? salaryMaxRaw : null,
      embedding,
      embNorm,
    });
  }
  return { rows, maxUpdated, stampCount };
}

function writeEmbedCacheFile(rows, stamp) {
  const chunks = [];
  const header = Buffer.alloc(28);
  EMBED_CACHE_MAGIC.copy(header, 0);
  header.writeUInt32LE(1, 4);
  header.writeBigUInt64LE(BigInt(stamp.maxUpdated || 0), 12);
  header.writeUInt32LE(stamp.n || 0, 20);
  let written = 0;
  for (const row of rows) {
    const emb = row.embedding;
    const idBuf = uuidToBytes(row.id);
    if (!idBuf || !emb || !emb.length) continue;
    const status = Buffer.from(String(row.status || ''), 'utf8').subarray(0, 255);
    const address = Buffer.from(String(row.address || ''), 'utf8').subarray(0, 4000);
    const rec = Buffer.alloc(16 + 4 + 4 + 4 + 1 + status.length + 2 + address.length + 2 + emb.length * 4);
    let o = 0;
    idBuf.copy(rec, o); o += 16;
    rec.writeFloatLE(row.embNorm || 0, o); o += 4;
    rec.writeFloatLE(row.salaryMin == null || !Number.isFinite(Number(row.salaryMin)) ? NaN : Number(row.salaryMin), o); o += 4;
    rec.writeFloatLE(row.salaryMax == null || !Number.isFinite(Number(row.salaryMax)) ? NaN : Number(row.salaryMax), o); o += 4;
    rec.writeUInt8(status.length, o); o += 1;
    status.copy(rec, o); o += status.length;
    rec.writeUInt16LE(address.length, o); o += 2;
    address.copy(rec, o); o += address.length;
    rec.writeUInt16LE(emb.length, o); o += 2;
    Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength).copy(rec, o);
    chunks.push(rec);
    written += 1;
  }
  header.writeUInt32LE(written, 8);
  fs.mkdirSync(path.dirname(EMBED_CACHE_FILE), { recursive: true });
  const tmp = `${EMBED_CACHE_FILE}.tmp`;
  fs.writeFileSync(tmp, Buffer.concat([header, ...chunks]));
  fs.renameSync(tmp, EMBED_CACHE_FILE);
  console.log(`[vectorSearch] embedding cache saved (${written} candidates)`);
}

async function tryLoadCoreCacheFromDisk({ allowStale = false } = {}) {
  let buf;
  try {
    buf = fs.readFileSync(EMBED_CACHE_FILE);
  } catch (err) {
    return null;
  }
  const parsed = parseEmbedCacheFile(buf);
  if (!parsed || !parsed.rows.length) return null;
  if (allowStale) return parsed.rows;
  let ageMs = CAND_LIST_CACHE_TTL_MS;
  try {
    ageMs = Date.now() - fs.statSync(EMBED_CACHE_FILE).mtimeMs;
  } catch (err) {
    ageMs = CAND_LIST_CACHE_TTL_MS;
  }
  if (ageMs >= CAND_LIST_CACHE_TTL_MS) {
    const stamp = await candidateService.getVectorEmbeddingStamp();
    if (stamp.n !== parsed.stampCount || stamp.maxUpdated !== parsed.maxUpdated) return null;
  }
  return parsed.rows;
}

async function loadCandidateList(includeSearchText) {
  await acquireVectorSearchSlot();
  let listPromise;
  try {
    listPromise = candidateService.listSlimForVectorSearch({ includeSearchText });
  } catch (err) {
    releaseVectorSearchSlot();
    throw err;
  }
  const stampPromise = includeSearchText
    ? null
    : candidateService.getVectorEmbeddingStamp().catch(() => null);
  let list;
  try {
    list = await listPromise;
  } finally {
    releaseVectorSearchSlot();
  }
  const compact = list.map(compactVectorRow);
  const now = Date.now();
  if (includeSearchText) {
    _kwCache = compact;
    _kwCacheAt = now;
  } else {
    _coreCache = compact;
    _coreCacheAt = now;
    const stamp = await stampPromise;
    if (stamp) {
      try {
        writeEmbedCacheFile(compact, stamp);
      } catch (err) {
        console.warn('[vectorSearch] embedding cache save failed', String(err && err.message ? err.message : err).slice(0, 200));
      }
    }
  }
  console.log(`[vectorSearch] embedding cache ready (${compact.length} candidates)`);
  return compact;
}

function refreshCandidateListInBackground(includeSearchText) {
  if (includeSearchText ? _kwLoading : _coreLoading) return;
  const pending = loadCandidateList(includeSearchText).finally(() => {
    if (includeSearchText) _kwLoading = null;
    else _coreLoading = null;
  });
  pending.catch((err) => {
    console.warn('[vectorSearch] cache refresh failed', String(err && err.message ? err.message : err).slice(0, 200));
  });
  if (includeSearchText) _kwLoading = pending;
  else _coreLoading = pending;
}

async function getCandidateListCached(includeSearchText = false) {
  const cache = includeSearchText ? _kwCache : _coreCache;
  const at = includeSearchText ? _kwCacheAt : _coreCacheAt;
  if (cache) {
    if (Date.now() - at >= CAND_LIST_CACHE_TTL_MS) {
      refreshCandidateListInBackground(includeSearchText);
    }
    return cache;
  }
  const inflight = includeSearchText ? _kwLoading : _coreLoading;
  if (inflight) return inflight;
  const pending = (async () => {
    if (!includeSearchText) {
      const fromDisk = await tryLoadCoreCacheFromDisk();
      if (fromDisk) {
        _coreCache = fromDisk;
        _coreCacheAt = Date.now();
        console.log(`[vectorSearch] embedding cache from disk (${fromDisk.length} candidates)`);
        return fromDisk;
      }
    }
    return loadCandidateList(includeSearchText);
  })().finally(() => {
    if (includeSearchText) _kwLoading = null;
    else _coreLoading = null;
  });
  if (includeSearchText) _kwLoading = pending;
  else _coreLoading = pending;
  return pending;
}

function warmCandidateVectorCache() {
  // Full embedding pull holds a pool connection for tens of seconds — never run that on listen().
  const delayMs = Math.max(
    0,
    Number.parseInt(process.env.VECTOR_WARMUP_DELAY_MS || '60000', 10) || 0,
  );
  const scheduleDbLoad = (fn) => {
    if (delayMs > 0) {
      console.log(`[vectorSearch] DB embedding load scheduled in ${delayMs}ms`);
      setTimeout(fn, delayMs);
    } else {
      fn();
    }
  };
  return (async () => {
    const fromDisk = await tryLoadCoreCacheFromDisk({ allowStale: true });
    if (fromDisk) {
      _coreCache = fromDisk;
      _coreCacheAt = Date.now();
      console.log(`[vectorSearch] embedding cache from disk (${fromDisk.length} candidates)`);
      // Do not pull all embeddings on startup — refresh runs when cache TTL expires during search.
      return fromDisk;
    }
    scheduleDbLoad(() => {
      getCandidateListCached(false).catch((err) => {
        console.warn('[vectorSearch] cache warmup failed', String(err && err.message ? err.message : err).slice(0, 200));
      });
    });
    return null;
  })().catch((err) => {
    console.warn('[vectorSearch] cache warmup failed', String(err && err.message ? err.message : err).slice(0, 200));
    return null;
  });
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

/** Cosine when the query norm is already known. Used by the search loop. */
function cosineFast(query, queryNorm, emb, embNorm) {
  if (!query || !emb || !queryNorm || query.length !== emb.length) return -1;
  let normB = embNorm;
  let dot = 0;
  if (normB) {
    for (let i = 0; i < query.length; i += 1) dot += query[i] * emb[i];
  } else {
    let nb = 0;
    for (let i = 0; i < query.length; i += 1) {
      const vb = emb[i];
      dot += query[i] * vb;
      nb += vb * vb;
    }
    if (!nb) return -1;
    normB = Math.sqrt(nb);
  }
  if (!normB) return -1;
  return dot / (queryNorm * normB);
}

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
      // searchText is owned by CV parse/enrich — never overwrite it during embedding.
      await candidateService.update(candidateId, { embedding });
      await clearEmbedCooldown(key);
      clearCandidateListCache();
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
  if (emb instanceof Float32Array) return emb;
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
 * @param {boolean} [opts.hydrateResults=true] - load full candidate rows for the top hits (API). Sonar should pass false.
 * @param {string[]} [opts.candidateIds] - when set, rank only these ids (does not scan the full embedding table).
 * @param {number} [opts.minSimilarity=0.30] - drop hits below this cosine.
 */
const searchCandidates = async ({
  query,
  precomputedEmbedding,
  filters = {},
  limit = 20,
  maxLimitCap = 20,
  maxInlineEmbedRebuild = 0,
  requireKeywordMatch = true,
  hydrateResults = true,
  candidateIds = null,
  minSimilarity = 0.30,
}) => {
  const idFilterEarly = Array.isArray(candidateIds)
    ? [...new Set(candidateIds.map((id) => String(id).trim()).filter(Boolean))]
    : null;
  const needsGlobalSlot = !idFilterEarly || idFilterEarly.length === 0;
  if (needsGlobalSlot) await acquireVectorSearchSlot();

  try {
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

  const idFilter = Array.isArray(candidateIds)
    ? [...new Set(candidateIds.map((id) => String(id).trim()).filter(Boolean))]
    : null;
  if (idFilter && !idFilter.length) return [];

  let all;
  if (idFilter && !requireKeywordMatch && _coreCache) {
    const idSet = new Set(idFilter);
    all = _coreCache.filter((c) => idSet.has(String(c.id)));
  } else if (idFilter) {
    all = (await candidateService.listEmbeddingsByIds(idFilter, {
      includeSearchText: Boolean(requireKeywordMatch),
    })).map(compactVectorRow);
  } else {
    all = await getCandidateListCached(Boolean(requireKeywordMatch));
  }
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

  const queryVec = qEmbedding instanceof Float32Array ? qEmbedding : toFloat32(qEmbedding);
  let queryNorm = 0;
  if (queryVec) {
    for (let i = 0; i < queryVec.length; i += 1) queryNorm += queryVec[i] * queryVec[i];
    queryNorm = Math.sqrt(queryNorm);
  }
  const similarityFloor = Number.isFinite(minSimilarity) ? minSimilarity : 0.30;
  if (!queryVec || !queryNorm) return [];

  const scored = [];
  const loopT0 = Date.now();
  for (let i = 0; i < filtered.length; i += 1) {
    const candidate = filtered[i];
    if (i > 0 && i % 250 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setImmediate(resolve));
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
    let emb = candidate.embedding instanceof Float32Array
      ? candidate.embedding
      : toFloat32(normalizeEmbedding(candidate.embedding));
    if (!emb || !emb.length || emb.length !== queryVec.length) {
      if (rebuildCount < rebuildBudget) {
        rebuildCount += 1;
        try {
          const rebuilt = await embedCandidateAndSave(candidate.id);
          emb = toFloat32(normalizeEmbedding(rebuilt));
        } catch (err) {
          console.error('[vectorSearch] rebuild candidate embedding failed', candidate.id, err.message || err);
          continue;
        }
      } else {
        skippedMissingEmbedding += 1;
        continue;
      }
    }

    if (!emb || !queryVec || emb.length !== queryVec.length) continue;

    if (requireKeywordMatch) {
      const terms = String(candidate.searchText || '').toLowerCase();
      if (!hasKeywordMatch(queryWords, terms)) continue;
    }

    const score = cosineFast(queryVec, queryNorm, emb, candidate.embNorm);
    if (!Number.isFinite(score) || score < similarityFloor) continue;

    scored.push({ id: candidate.id, score });
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

  const top = scored.slice(0, maxLimit);
  if (!top.length) return [];

  if (!hydrateResults) {
    return top.map((s) => ({ id: s.id, similarity: s.score }));
  }

  const heavyRows = await candidateService.findManyWithTagsForMatchScore(top.map((s) => s.id));
  const byId = new Map(
    heavyRows.map((r) => [String(r.id), candidateService.toPlainCandidateForMatchScore(r)]),
  );
  return top.map((s) => {
    const plain = byId.get(String(s.id)) || { id: s.id };
    const { embedding: _emb, ...rest } = plain;
    return { ...rest, similarity: s.score };
  });
  } finally {
    if (needsGlobalSlot) releaseVectorSearchSlot();
  }
};

module.exports = {
  buildSearchDocument,
  embedCandidateAndSave,
  hasEmbeddableCandidateContent,
  searchCandidates,
  cosineSimilarity,
  normalizeEmbedding,
  clearCandidateListCache,
  warmCandidateVectorCache,
};


