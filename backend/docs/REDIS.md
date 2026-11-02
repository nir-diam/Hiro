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
| `CANDIDATE_LIST_CACHE` | enabled when read-through on | `false` = never cache `GET /api/candidates` list pages |
| `CANDIDATE_LIST_CACHE_TTL` | `90` | Seconds for `candidates:list:v*:*` keys |
| `MATCH_LIST_SCORE_CACHE_TTL` | `120` | Per pair `list-score:{jobId}:{candidateId}` |
| `MATCH_BATCH_SCORE_CACHE_TTL` | same as list | Full `POST /api/candidates/match-scores/batch` response |
| `MATCH_BATCH_SCORE_CACHE` | enabled | `false` = batch endpoint always recomputes (still uses per-pair `list-score`) |
| `PICKLIST_CACHE` / `PICKLIST_CACHE_TTL` | on / ~300s | All `GET /api/picklists/*` list endpoints |
| `JOBS_LIST_CACHE` / `JOBS_LIST_CACHE_TTL` | on / ~120s | `GET /api/jobs/for-list`, `for-picker`, `for-compose` |
| `EVENT_TYPES_CACHE` | on | `GET /api/event-types` |
| `RECRUITMENT_SOURCES_CACHE` | on | `GET /api/recruitment-sources/options` |
| `HTTP_GET_RESPONSE_CACHE` | on (with read-through) | `false` = disable whole-response cache for most `GET /api/*` |
| `HTTP_GET_RESPONSE_CACHE_TTL` | `90` | Per-user/token + URL JSON cache (`http:get:*` keys) |
| `HTTP_GET_AGENT_CACHE` | on (with HTTP GET cache) | `false` = agent `GET /api/agent/*` always hits Postgres |
| `HTTP_GET_AGENT_CACHE_TTL` | same as `HTTP_GET_RESPONSE_CACHE_TTL` | Agent JSON cache TTL (`http:get:agent:v*:*` keys); e.g. `30` for fresher reads |
| `TAG_LIST_CACHE` / `TAG_LIST_CACHE_TTL` | on / `120` | Tag grid list (`tags:v*:*`) |
| `CITIES_CACHE` / `CITIES_CACHE_TTL` | on / `3600` | City catalog (`cities:v*:*`) |
| `BI_REPORT_CACHE` / `BI_REPORT_CACHE_TTL` | on / `300` | `GET /api/reports/bi-dashboard` aggregates |
| `RECRUITMENT_SOURCES_REPORT_CACHE` / `RECRUITMENT_SOURCES_REPORT_CACHE_TTL` | on / `300` | `GET /api/reports/recruitment-sources` |
| `CACHE_SINGLEFLIGHT` | on | `false` = disable per-key coalescing on Redis MISS (each request runs its own loader) |

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
- **Candidates grid list** — `candidates:list:v{ver}:{hash}` (read-through for paginated list; version key `candidates:list:ver` bumps on candidate/tag writes)
- **Match scores (grid %)** — `list-score:{jobId}:{candidateId}`; batch API `match-scores:batch:v{ver}:{hash}` (see `matchScoreCacheService.js`)
- **Engine config** — global admin config `matching-engine:global-config`; per job `engine-config:{jobId}:{tenantId}` (`matchingEngineService`)
- **Picklists / event types / recruitment sources / job list pickers** — versioned keys via `picklistCacheService`, `eventTypeCacheService`, `recruitmentSourceCacheService`, `jobListCacheService`
- **Jobs** — `job:{id}`
- **Clients list / API row** — `clients:list:*`, `client:api:{id}`
- **Matching, taxonomy, embeddings** — see `redisService` usages

Pattern for new entities: use `readThroughCacheService.getOrLoad` / invalidate on writes.

**Stampede control:** On Redis MISS, `getOrLoad` coalesces concurrent loads for the **same key** in one Node process (singleflight). One request runs the loader; others await the same promise, then share the cached value. Set `CACHE_SINGLEFLIGHT=false` only when debugging. HTTP GET response cache is separate (still one JSON blob per key after the first response completes).

**Broad GET coverage:** `httpGetResponseCacheMiddleware` caches successful JSON for most authenticated `GET /api/*` routes (TTL ~90s, key = hash of `Authorization` + full URL). Skips email attachments, scripts, side-effect GETs (`rebuild-embeddings`), etc.

**Agent API:** `GET /api/agent/*` (except `/api/agent/health`) is cached on a dedicated mount before `agentRoutes`. Keys are `http:get:agent:v{ver}:{hash}` (agent Bearer token + URL). Version key `http:get:agent:ver` increments after successful agent `PATCH`/`POST`/`DELETE` (including `…/execute`), so mutating clients do not see stale lists for the TTL window. Response header detail uses scope `http:get:agent=HIT|MISS` (same family as `http:get=…` on the main API). `/api/agent/auth` is not cached.

## Cache observability (HTTP)

When `APP_CACHE_HEADERS` is not `false` (default **on**), API responses that touch Redis read-through include:

| Header | Values |
|--------|--------|
| `X-App-Cache` | `HIT` — payload served from Redis; `MISS` — loaded from Postgres (then usually written to Redis); `BYPASS` — read-through off or this route skipped cache |
| `X-App-Cache-Detail` | Per-scope breakdown, e.g. `candidates:list=HIT` |

Server log (no PII): `[appCache] GET /api/candidates 200 HIT (candidates:list=HIT)`.

**`POST /api/candidates/match-scores/batch`**

Uses Redis in layers (when read-through is on):

1. **Whole response** — `match-scores:batch:v{ver}:{hash}` (~120s TTL); `X-App-Cache-Detail` may show `match-scores:batch=HIT`.
2. **Per candidate↔job score** — `list-score:{jobId}:{candidateId}` when the batch cache misses but individual pairs were scored recently.
3. **Supporting reads** — `job:{id}`, `engine:config:…`, job embedding cache in `matchingScoreService`, optional `candidate:{id}` instead of reloading rows from Postgres.

Auth and `JobCandidate` link rows still hit Postgres even on a batch `HIT`.

**How to verify the candidates grid**

1. DevTools → Network → `GET /api/candidates?page=1&limit=100…` → **Response Headers**.
2. First load after deploy or cache bump: expect `MISS` (Postgres list query runs).
3. Repeat the **same** URL within TTL (~90s): expect `HIT` (no list SQL; full page JSON from Redis).

**Postgres may still run on `HIT` for some routes** (enrichment not stored in the cache key):

| Route / scope | Redis `HIT` still may query Postgres for |
|---------------|------------------------------------------|
| `GET /api/candidates` (list) | Auth, permissions, saved-search blacklist rows |
| `GET /api/candidates/:id` (`candidate`) | Org links, pipeline stage |
| `GET /api/jobs/:id` (`job`) | Candidate counts on the job row |

Disable headers: `APP_CACHE_HEADERS=false`.

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
