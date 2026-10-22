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
