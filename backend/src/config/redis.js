const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'master.redishiro.b0uufd.eun1.cache.amazonaws.com';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_AUTH_TOKEN || '';
const REDIS_USERNAME = process.env.REDIS_USERNAME || '';
// TLS is required for AWS ElastiCache. Disable only for local/tunnel dev (REDIS_TLS=false).
const REDIS_TLS = process.env.REDIS_TLS !== 'false';
// Set REDIS_ENABLED=false to run the app without Redis (all cache ops become no-ops).
const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false';
// When false, skip Redis on reads and fall back to DB; writes still update Redis when connected.
const REDIS_READ_THROUGH = process.env.REDIS_READ_THROUGH !== 'false';
// Background load of DB rows into Redis after startup (see candidateCacheWarmup).
const REDIS_CACHE_WARMUP = process.env.REDIS_CACHE_WARMUP === 'true' || process.env.REDIS_CACHE_WARMUP === '1';
const REDIS_CACHE_WARMUP_DELAY_MS = Math.max(
  0,
  Number.parseInt(process.env.REDIS_CACHE_WARMUP_DELAY_MS || '120000', 10) || 0,
);

const isReadThroughEnabled = () => REDIS_ENABLED && REDIS_READ_THROUGH && _isAlive;

let redisClient = null;

// Circuit-breaker: skip all Redis calls immediately when known to be down.
let _isAlive = false;
let _lastDownLog = 0;

const isRedisAvailable = () => REDIS_ENABLED && _isAlive;

const createRedisClient = () => {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    ...(REDIS_USERNAME ? { username: REDIS_USERNAME } : {}),
    tls: REDIS_TLS ? {} : undefined,
    lazyConnect: true,
    // Fail commands immediately when not connected — no queuing.
    enableOfflineQueue: false,
    // 0 = do not retry individual commands; reconnection is handled by retryStrategy.
    maxRetriesPerRequest: 0,
    connectTimeout: 3000,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 500, 3000);
    },
  });

  client.on('error', (err) => {
    if (_isAlive) {
      console.error('[Redis] connection error:', err.message);
    }
    _isAlive = false;
  });

  client.on('connect', () => {
    _isAlive = true;
    console.log(`[Redis] connected to ${REDIS_HOST}:${REDIS_PORT}`);
  });

  client.on('ready', () => {
    _isAlive = true;
  });

  client.on('close', () => {
    _isAlive = false;
  });

  client.on('end', () => {
    _isAlive = false;
  });

  client.on('reconnecting', () => {
    const now = Date.now();
    if (now - _lastDownLog > 30_000) {
      console.warn('[Redis] reconnecting…');
      _lastDownLog = now;
    }
  });

  return client;
};

const connectRedis = async () => {
  if (!REDIS_ENABLED) {
    console.log('[Redis] disabled via REDIS_ENABLED=false — skipping connection');
    return null;
  }
  redisClient = createRedisClient();
  try {
    await redisClient.connect();
    console.log('[Redis] ready');
  } catch (err) {
    console.warn('[Redis] initial connect failed (non-fatal):', err.message);
  }
  return redisClient;
};

const getRedisClient = () => {
  if (!REDIS_ENABLED) return null;
  if (!redisClient) {
    const err = new Error('[Redis] client not initialised — call connectRedis() first');
    err.status = 500;
    throw err;
  }
  return redisClient;
};

module.exports = {
  connectRedis,
  getRedisClient,
  isRedisAvailable,
  isReadThroughEnabled,
  REDIS_ENABLED,
  REDIS_READ_THROUGH,
  REDIS_CACHE_WARMUP,
  REDIS_CACHE_WARMUP_DELAY_MS,
};
