# Redis (AWS ElastiCache)

## Enable / disable

| Variable | Default | Meaning |
|----------|---------|---------|
| `REDIS_ENABLED` | `true` | `false` = no connection; all cache ops no-op |
| `REDIS_READ_THROUGH` | `true` | `false` = reads always from Postgres; writes still update Redis when connected |
| `REDIS_HOST` | ElastiCache endpoint in code | Cluster hostname |
| `REDIS_PORT` | `6379` | |
| `REDIS_TLS` | `true` | Set `false` only for local Redis without TLS |
| `REDIS_PASSWORD` / `REDIS_AUTH_TOKEN` | empty | Required if ElastiCache AUTH is enabled |
| `REDIS_USERNAME` | empty | ACL user if used |
| `REDIS_CACHE_WARMUP` | `false` | `true` = batch-load candidates from DB into Redis after startup |
| `REDIS_CACHE_WARMUP_DELAY_MS` | `120000` | Delay before warmup (avoids fighting Postgres on restart) |

## Production `.env` example

```env
REDIS_ENABLED=true
REDIS_HOST=master.redishiro.xxxxx.eun1.cache.amazonaws.com
REDIS_PORT=6379
REDIS_TLS=true
REDIS_AUTH_TOKEN=your-elasticache-auth-token
REDIS_READ_THROUGH=true
REDIS_CACHE_WARMUP=false
```

EC2 security group must allow **outbound TCP 6379** to the ElastiCache security group (and ElastiCache must allow inbound from EC2).

## Health

- `GET /health/redis` — ping + flags
- `GET /health/db` — Postgres pool

## Caching model (not full DB mirror)

Hiro uses **read-through / write-through** for hot entities, not a automatic copy of every table:

- **Candidates** — `candidate:{id}` (read + write on update)
- **Jobs** — `job:{id}`
- **Clients list / API row** — `clients:list:*`, `client:api:{id}`
- **Matching, taxonomy, embeddings** — see `redisService` usages

Pattern for new entities: use `readThroughCacheService.getOrLoad` / invalidate on writes.

Manual warmup:

```bash
cd backend
node src/services/candidateCacheWarmup.js
```

## Can we put the entire Postgres DB in Redis?

Not as a single feature. Hiro has **many tables** (candidates, jobs, tags, emails, audit logs, …). Copying all rows into Redis would mean:

- **Memory**: ElastiCache would need to hold gigabytes (embeddings alone are huge).
- **Consistency**: every create/update/delete on ~100 models must update or invalidate the right keys, or the UI shows stale/wrong data.
- **Operations**: migrations, bulk scripts, and raw SQL would bypass Redis unless everything goes through one layer.

What we use instead is **cache-aside / write-through on hot paths** (see table in the repo README section above). New screens should add keys incrementally via `readThroughCacheService.js`.

If you need a **full replica** for analytics, use Postgres read replicas or export to a warehouse—not Redis.

## How to see data in Redis

### 1. Health (from server or laptop via SSH tunnel)

```bash
curl -sS http://127.0.0.1:4000/health/redis
```

### 2. Inspect script (recommended)

From `backend/` on a machine that can reach ElastiCache (usually the EC2 API server):

```bash
node scripts/redis-inspect.js ping
node scripts/redis-inspect.js stats
node scripts/redis-inspect.js keys "candidate:*" --limit 20
node scripts/redis-inspect.js get "candidate:PASTE-UUID-HERE"
node scripts/redis-inspect.js ttl "clients:list:active"
```

Values are JSON for most Hiro keys (candidates, clients, jobs).

### 3. `redis-cli` on Ubuntu (TLS)

Install: `sudo apt install redis-tools`

```bash
redis-cli -h "$REDIS_HOST" -p 6379 --tls \
  ${REDIS_AUTH_TOKEN:+-a "$REDIS_AUTH_TOKEN"} \
  PING

redis-cli -h "$REDIS_HOST" -p 6379 --tls \
  ${REDIS_AUTH_TOKEN:+-a "$REDIS_AUTH_TOKEN"} \
  --scan --pattern 'candidate:*' | head
```

Avoid `KEYS *` in production on large databases; prefer `SCAN` (as in the script).

### 4. GUI

- [Redis Insight](https://redis.io/insight/) — connect with TLS + auth to the ElastiCache endpoint (often via SSH tunnel from your laptop to EC2, then to Redis).

### Common key prefixes

| Pattern | Content |
|---------|---------|
| `candidate:{uuid}` | Candidate row snapshot (tags may be embedded) |
| `job:{uuid}` | Job snapshot |
| `clients:list:active` / `clients:list:all` | Client list arrays |
| `client:api:{uuid}` | Single client API JSON |
| `taxonomy:index` | Job taxonomy index |
| `embed:q:{hash}` | Cached query embedding vector |
| `job:{uuid}:matches` | Sorted set of match scores |
| `candidate:{uuid}:opportunities` | Sorted set of job opportunities |

Empty Redis after enable is normal until traffic or warmup populates keys.
