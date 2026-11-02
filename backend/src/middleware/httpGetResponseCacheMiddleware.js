const crypto = require('crypto');
const redis = require('../services/redisService');
const processMemory = require('../services/processMemoryCache');
const { isReadThroughEnabled, isRedisAvailable } = require('../config/redis');
const { recordHit, recordMiss, recordBypass } = require('../utils/appCacheContext');

const SCOPE = 'http:get';
const AGENT_SCOPE = 'http:get:agent';
const AGENT_VERSION_KEY = 'http:get:agent:ver';
const GLOBAL_VERSION_KEY = 'http:get:ver';

/**
 * POST routes that only read or log. They must not bump the global version,
 * or every list screen (batch scores, searches) would wipe the cache.
 */
const NO_BUMP_PATTERNS = [
  /^\/api\/auth\//,
  /^\/api\/candidates\/search\//,
  /^\/api\/candidates\/semantic-search$/,
  /^\/api\/candidates\/match-scores\/batch$/,
  /^\/api\/candidates\/[^/]+\/job-matches$/,
  /^\/api\/candidates\/[^/]+\/generate-/,
  /^\/api\/admin\/candidate-tags\/counts$/,
  /^\/api\/admin\/matching-engine\/simulate$/,
  /^\/api\/admin\/logs/,
  /^\/api\/organizations\/query$/,
  /^\/api\/tags\/selector-suggestions$/,
  /^\/api\/jobs\/ai\/analyze$/,
  /^\/api\/jobs\/log-smart-import-open$/,
  /^\/api\/jobs\/[^/]+\/record-staff-view$/,
  /^\/api\/job-fields\/ai\//,
  /^\/api\/messaging\/log-whatsapp-open$/,
  /^\/api\/inforu\/rsvp\/parse-preview$/,
  /^\/api\/organizations\/logo\/upload-url$/,
];

const TTL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.HTTP_GET_RESPONSE_CACHE_TTL || '90', 10) || 90,
);

const agentTtlSeconds = () => Math.max(
  15,
  Number.parseInt(
    process.env.HTTP_GET_AGENT_CACHE_TTL || process.env.HTTP_GET_RESPONSE_CACHE_TTL || '90',
    10,
  ) || 90,
);

const cacheEnabled = () => {
  const flag = process.env.HTTP_GET_RESPONSE_CACHE;
  if (flag === 'false' || flag === '0') return false;
  return isReadThroughEnabled() || processMemory.isEnabled();
};

const agentCacheEnabled = () => {
  const flag = process.env.HTTP_GET_AGENT_CACHE;
  if (flag === 'false' || flag === '0') return false;
  return cacheEnabled();
};

const isAgentApiPath = (pathOnly) =>
  pathOnly === '/api/agent' || pathOnly.startsWith('/api/agent/');

/** Agent liveness should not be served from a shared TTL cache. */
const AGENT_SKIP_EXACT = new Set(['/api/agent/health']);

/** Paths that must never be served from a shared response cache. */
const SKIP_PATH_PREFIXES = [
  '/api/auth/activation',
  '/api/auth/candidate-portal',
  '/api/email-uploads',
  '/api/scripts',
  '/api/inforu',
  '/api/messaging',
  '/api/public/v1',
  '/health',
];

const SKIP_PATH_SUBSTRINGS = [
  'rebuild-embeddings',
  '/attachments/',
  '/export-logo',
  '/resume',
  '/profile-versions',
  '/backfill-',
];

const shouldSkipPath = (pathOnly) => {
  if (!pathOnly.startsWith('/api')) return true;
  for (const p of SKIP_PATH_PREFIXES) {
    if (pathOnly === p || pathOnly.startsWith(`${p}/`)) return true;
  }
  for (const s of SKIP_PATH_SUBSTRINGS) {
    if (pathOnly.includes(s)) return true;
  }
  return false;
};

const authFingerprint = (req) => {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (auth) return crypto.createHash('sha256').update(String(auth)).digest('hex').slice(0, 32);
  const cookie = req.headers.cookie || '';
  if (cookie) return crypto.createHash('sha256').update(String(cookie)).digest('hex').slice(0, 32);
  return 'anon';
};

const getAgentHttpGetCacheVersion = async () => {
  if (isRedisAvailable()) {
    try {
      const v = await redis.get(AGENT_VERSION_KEY);
      if (v != null) return String(v);
    } catch {
      /* fall through to process memory */
    }
  }
  return processMemory.getCounter(AGENT_VERSION_KEY);
};

const bumpAgentHttpGetCacheVersion = async () => {
  processMemory.increment(AGENT_VERSION_KEY);
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(AGENT_VERSION_KEY);
  } catch (e) {
    console.warn('[httpGetResponseCache] agent version bump failed (non-fatal):', e.message);
  }
};

const getGlobalHttpGetCacheVersion = async () => {
  if (isRedisAvailable()) {
    try {
      const v = await redis.get(GLOBAL_VERSION_KEY);
      if (v != null) return String(v);
    } catch {
      /* fall through to process memory */
    }
  }
  return processMemory.getCounter(GLOBAL_VERSION_KEY);
};

const bumpGlobalHttpGetCacheVersion = async () => {
  processMemory.increment(GLOBAL_VERSION_KEY);
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(GLOBAL_VERSION_KEY);
  } catch (e) {
    console.warn('[httpGetResponseCache] global version bump failed (non-fatal):', e.message);
  }
};

const cacheKeyForRequest = async (req) => {
  const pathOnly = req.originalUrl.split('?')[0];
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  const fp = `${authFingerprint(req)}:${req.method}:${pathOnly}${qs}`;
  const hash = crypto.createHash('sha256').update(fp).digest('hex').slice(0, 40);
  if (isAgentApiPath(pathOnly)) {
    const ver = await getAgentHttpGetCacheVersion();
    return `http:get:agent:v${ver}:${hash}`;
  }
  const ver = await getGlobalHttpGetCacheVersion();
  return `http:get:v${ver}:${hash}`;
};

/**
 * Any successful write under /api makes every cached GET stale (one version bump,
 * old keys expire by TTL). Background writers (email ingest, cron) are bounded by TTL.
 */
const invalidateHttpGetCacheOnWrite = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const pathOnly = req.originalUrl.split('?')[0];
  if (NO_BUMP_PATTERNS.some((re) => re.test(pathOnly))) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      bumpGlobalHttpGetCacheVersion().catch(() => {});
    }
  });
  return next();
};

/**
 * After successful agent PATCH/POST/DELETE, bump version so cached GETs miss.
 * Mount on agent routes (not /api/agent/auth).
 */
const invalidateAgentHttpGetCacheOnSuccess = (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      bumpAgentHttpGetCacheVersion().catch(() => {});
    }
  });
  return next();
};

/**
 * Caches successful JSON GET responses (per user/token + URL).
 * Complements entity-level read-through caches; TTL-bound (default 90s).
 */
const httpGetResponseCacheMiddleware = async (req, res, next) => {
  if (req.method !== 'GET') return next();
  const pathOnly = req.originalUrl.split('?')[0];
  const agentPath = isAgentApiPath(pathOnly);
  const enabled = agentPath ? agentCacheEnabled() : cacheEnabled();
  const scope = agentPath ? AGENT_SCOPE : SCOPE;
  const ttl = agentPath ? agentTtlSeconds() : TTL_SECONDS;

  if (!enabled) {
    recordBypass(scope);
    return next();
  }
  if (shouldSkipPath(pathOnly)) {
    recordBypass(scope);
    return next();
  }
  if (agentPath && AGENT_SKIP_EXACT.has(pathOnly)) {
    recordBypass(scope);
    return next();
  }

  const key = await cacheKeyForRequest(req);
  const memHit = processMemory.get(key);
  if (memHit && typeof memHit === 'object' && memHit.body !== undefined) {
    recordHit(scope);
    res.status(memHit.status || 200);
    return res.json(memHit.body);
  }
  if (isRedisAvailable()) {
    try {
      const hit = await redis.get(key);
      if (hit && typeof hit === 'object' && hit.body !== undefined) {
        processMemory.set(key, hit, ttl);
        recordHit(scope);
        res.status(hit.status || 200);
        return res.json(hit.body);
      }
    } catch (e) {
      console.warn('[httpGetResponseCache] get failed (non-fatal):', e.message);
    }
  }

  recordMiss(scope);
  const origJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode || 200;
    if (status >= 200 && status < 300 && body !== undefined) {
      const packed = { status, body };
      processMemory.set(key, packed, ttl);
      if (isRedisAvailable()) {
        redis.set(key, packed, { ttlSeconds: ttl }).catch(() => {});
      }
    }
    return origJson(body);
  };
  return next();
};

module.exports = {
  httpGetResponseCacheMiddleware,
  invalidateHttpGetCacheOnWrite,
  bumpGlobalHttpGetCacheVersion,
  NO_BUMP_PATTERNS,
  invalidateAgentHttpGetCacheOnSuccess,
  bumpAgentHttpGetCacheVersion,
  cacheEnabled,
  agentCacheEnabled,
  isAgentApiPath,
  shouldSkipPath,
  SKIP_PATH_PREFIXES,
  SKIP_PATH_SUBSTRINGS,
};
