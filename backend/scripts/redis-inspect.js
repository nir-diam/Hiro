#!/usr/bin/env node
/**
 * Inspect Hiro keys in Redis (read-only).
 *
 * Usage (from backend/):
 *   node scripts/redis-inspect.js ping
 *   node scripts/redis-inspect.js keys "candidate:*" --limit 20
 *   node scripts/redis-inspect.js get "candidate:UUID"
 *   node scripts/redis-inspect.js ttl "clients:list:active"
 *   node scripts/redis-inspect.js stats
 *
 * Loads env from backend/.env and backend/src/.env (same as server).
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../src/.env') });
dotenv.config();

const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'master.redishiro.b0uufd.eun1.cache.amazonaws.com';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_TLS = process.env.REDIS_TLS !== 'false';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || process.env.REDIS_AUTH_TOKEN || '';
const REDIS_USERNAME = process.env.REDIS_USERNAME || '';

function createClient() {
  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    ...(REDIS_PASSWORD ? { password: REDIS_PASSWORD } : {}),
    ...(REDIS_USERNAME ? { username: REDIS_USERNAME } : {}),
    tls: REDIS_TLS ? {} : undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  });
}

async function scanKeys(client, pattern, limit) {
  const out = [];
  let cursor = '0';
  do {
    // eslint-disable-next-line no-await-in-loop
    const [next, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    for (const k of batch) {
      out.push(k);
      if (out.length >= limit) return out;
    }
  } while (cursor !== '0');
  return out;
}

function previewValue(raw) {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    const text = JSON.stringify(parsed, null, 2);
    if (text.length > 4000) {
      return `${text.slice(0, 4000)}\n… (truncated, ${text.length} chars total)`;
    }
    return parsed;
  } catch {
    if (raw.length > 2000) return `${raw.slice(0, 2000)}…`;
    return raw;
  }
}

async function main() {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  const limitFlag = rest.find((x) => x.startsWith('--limit'));
  const limit = limitFlag ? parseInt(limitFlag.split('=')[1] || rest[rest.indexOf('--limit') + 1], 10) : 50;

  if (process.env.REDIS_ENABLED === 'false') {
    console.error('REDIS_ENABLED=false — enable Redis in .env first.');
    process.exit(1);
  }

  const client = createClient();
  await client.connect();

  try {
    if (cmd === 'ping') {
      console.log(await client.ping());
      return;
    }

    if (cmd === 'stats') {
      const info = await client.info('memory');
      const dbSize = await client.dbsize();
      console.log('dbsize', dbSize);
      console.log(info.split('\n').filter((l) => /used_memory_human|maxmemory_human/.test(l)).join('\n'));
      const samples = [
        'candidate:*',
        'job:*',
        'client:*',
        'clients:*',
        'taxonomy:*',
        'embed:*',
        'job:*:matches',
      ];
      for (const p of samples) {
        // eslint-disable-next-line no-await-in-loop
        const keys = await scanKeys(client, p, 5000);
        console.log(`${p} → ${keys.length} keys (scan cap 5000)`);
      }
      return;
    }

    if (cmd === 'keys') {
      const pattern = arg || '*';
      const keys = await scanKeys(client, pattern, Number.isFinite(limit) ? limit : 50);
      console.log(`pattern ${pattern} (limit ${limit}):`);
      keys.forEach((k) => console.log(k));
      console.log(`total shown: ${keys.length}`);
      return;
    }

    if (cmd === 'get') {
      if (!arg) {
        console.error('Usage: get <key>');
        process.exit(1);
      }
      const type = await client.type(arg);
      console.log('type', type);
      if (type === 'string') {
        console.log(previewValue(await client.get(arg)));
      } else if (type === 'hash') {
        console.log(await client.hgetall(arg));
      } else if (type === 'zset') {
        const withScores = await client.zrevrange(arg, 0, 19, 'WITHSCORES');
        console.log('top 20 (desc):', withScores);
      } else if (type === 'none') {
        console.log('(key does not exist)');
      } else {
        console.log('Unsupported type for pretty-print; use redis-cli.');
      }
      return;
    }

    if (cmd === 'ttl') {
      if (!arg) {
        console.error('Usage: ttl <key>');
        process.exit(1);
      }
      const t = await client.ttl(arg);
      console.log(t === -1 ? 'no expiry' : t === -2 ? 'missing' : `${t}s remaining`);
      return;
    }

    console.log(`Unknown command: ${cmd || '(none)'}`);
    console.log('Commands: ping | stats | keys [pattern] | get <key> | ttl <key>');
    process.exit(1);
  } finally {
    client.disconnect();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
