const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'master.redishiro.b0uufd.eun1.cache.amazonaws.com';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
// TLS is required for AWS ElastiCache. Disable only for local/tunnel dev (REDIS_TLS=false).
const REDIS_TLS = process.env.REDIS_TLS !== 'false';

let redisClient = null;

const createRedisClient = () => {
  const client = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    tls: REDIS_TLS ? {} : undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  client.on('error', (err) => {
    console.error('[Redis] connection error:', err.message);
  });

  client.on('connect', () => {
    console.log(`[Redis] connected to ${REDIS_HOST}:${REDIS_PORT}`);
  });

  client.on('reconnecting', () => {
    console.warn('[Redis] reconnecting...');
  });

  return client;
};

const connectRedis = async () => {
  redisClient = createRedisClient();
  await redisClient.connect();
  console.log('[Redis] ready');
  return redisClient;
};

const getRedisClient = () => {
  if (!redisClient) {
    const err = new Error('[Redis] client not initialised — call connectRedis() first');
    err.status = 500;
    throw err;
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };
