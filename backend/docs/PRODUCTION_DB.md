# Production Postgres (RDS) and API server

## 1. Limit app DB connections (`DB_POOL_MAX`)

Each PM2 Node process keeps up to `DB_POOL_MAX` open Postgres connections. If that × number of workers exceeds RDS `max_connections`, you get `remaining connection slots are reserved` and the app looks down.

On the **API server** (e.g. Ubuntu), edit backend env:

```bash
nano /home/ubuntu/backend/.env
```

Add or update:

```env
DB_POOL_MAX=12
DB_POOL_ACQUIRE=30000
```

Guideline for **one** PM2 `server` process:

| RDS size (approx.) | Suggested `DB_POOL_MAX` |
|--------------------|-------------------------|
| db.t3.micro / small | 8–10 |
| db.t3.medium | 12–15 |
| db.r6g.large+ | 20–30 (check `max_connections`) |

Apply:

```bash
pm2 restart server
curl -sS http://127.0.0.1:4000/health/db
```

Check `pool.using` and `pool.waiting` in the JSON — `waiting` should stay 0 under normal load.

Optional: set the same vars in `backend/src/.env` for local dev only; **production must use `/home/ubuntu/backend/.env`** (or whatever path PM2 uses).

---

## 2. Watch RDS in AWS (saturation vs crash)

1. Sign in to **AWS Console** → region **eu-north-1** (or your RDS region).
2. **RDS** → **Databases** → select your instance.
3. **Monitoring** tab:
   - **CPUUtilization** — sustained high (e.g. >80%) → slow queries or too much load.
   - **DatabaseConnections** — flat at max → connection exhaustion.
   - **FreeableMemory** — very low → pressure / swapping risk.
4. **Logs & events** → look for **failover**, **restart**, **storage full**.
5. Optional: **CloudWatch** → create alarm on `DatabaseConnections` > threshold.

**Interpretation**

| Signal | Likely meaning |
|--------|----------------|
| CPU high + many connections | App overload (lists, email, tags) — fix queries + pool |
| Connections at max, CPU low | Too many clients holding connections (raise RDS or lower pool) |
| Instance **Rebooting** / unavailable | Real outage — `EHOSTUNREACH` on private IP until **Available** |
| `57014` in app logs only | Postgres **running** but **statement timeout** (20s) — slow/overloaded |

From EC2:

```bash
grep POSTGRES_URI /home/ubuntu/backend/.env   # note host
nc -zv YOUR-RDS-HOST 5432
curl -sS http://127.0.0.1:4000/health/db
```

---

## 3. Email upload dedupe (`bucket` + `fileKey`)

Duplicate S3/Lambda notifications used to create two `email_uploads` rows (e.g. 5575 and 5576) before the first finished, doubling ingest load.

The API now:

- On `POST` upload: if any row exists for the same `bucket` + `fileKey`, return **200** with that row (do not create another or re-run ingest).
- During ingest: if another row for the same key already has `candidateId`, link and skip.

No extra configuration required after deploy.

Optional tuning (small RDS: keep ingest at **1**):

```env
EMAIL_INGEST_MAX_CONCURRENT=1
EMAIL_INGEST_TIMEOUT_MS=480000
```

Upload notify returns **202** immediately and runs ingest in the background so duplicate webhooks do not pile up waiting for a pool connection. Duplicate `bucket` + `fileKey` calls are deduped in memory first (no DB). If the pool is saturated, upload responds **503** with `Retry-After: 30`.

Email ingest uses a **light DB path** (`forIngest` updates, city catalog in memory, pool yield) so recruiters can keep using the UI while CV mail is parsed:

```env
DB_POOL_INTERACTIVE_RESERVE=6
DB_POOL_MAX=12
EMAIL_INGEST_MAX_CONCURRENT=1
```

---

## 4. Email ingest worker (separate PM2 process)

When CV mail ingest runs in the **same** Node process as the API, Gemini + tag sync compete with the UI for the **same Sequelize pool**. Splitting ingest into a worker gives the API a dedicated pool budget.

### Env

**`~/backend/src/.env` on the API process (`server`):**

```env
EMAIL_INGEST_DISPATCH=worker
DB_POOL_MAX=8
DB_POOL_ACQUIRE=30000
DB_POOL_INTERACTIVE_RESERVE=6
EMAIL_INGEST_MAX_CONCURRENT=1
LIST_SCORE_CONCURRENCY=4
```

**Ingest worker** (same file is fine — the worker script overrides pool size at startup):

```env
EMAIL_INGEST_WORKER_DB_POOL_MAX=2
EMAIL_INGEST_WORKER_POLL_MS=5000
EMAIL_INGEST_WORKER_COOLDOWN_MS=3000
EMAIL_INGEST_DEFER_WHEN_SERVER_BUSY=1
EMAIL_INGEST_DEFER_SERVER_USING_ABOVE=5
EMAIL_INGEST_API_HEALTH_URL=http://127.0.0.1:4000/health/db
```

Behaviour: **one CV at a time**, max **2** DB connections on `ingest`, **8** on `server` (~10 total). While the UI is busy (`/health/db` → `pool.waiting > 0` or `using ≥ 5`), the worker **waits** instead of claiming the next row.

**Pause drain during business hours** (optional):

```env
EMAIL_INGEST_PAUSED=1
```

Then `pm2 restart ingest`. Remove or set to `0` overnight to catch up.

**Large backlog** (hundreds of rows): expect **one row every few minutes** — e.g. 486 ≈ many hours. Failed/no-CV rows get `INGEST_FAILED:` and are skipped so they do not block the queue.

Both processes need the same `POSTGRES_URI`, AWS, and Gemini keys.

**Budget:** `server` pool + `ingest` pool + any local dev + admin tools must stay **below** RDS `max_connections`. Example: `12 + 3 = 15` on the instance. If both show `ConnectionAcquireTimeoutError` / `Operation timeout` at once, Postgres is not down — **every connection is busy** (long CV ingest, candidate list, journal JSONB, etc.). PM2 may still show **online** with high memory.

During a large ingest backlog, prefer **`DB_POOL_MAX=8`** on `server` and **`3`** on `ingest` (11 total), pause local apps pointed at prod RDS, and check `curl -sS http://127.0.0.1:4000/health/db` (`pool.waiting` > 0 = starvation).

### PM2 (EC2)

```bash
cd ~/backend
pm2 delete ingest 2>/dev/null || true
pm2 start src/server.js --name server
pm2 start scripts/email-ingest-worker.js --name ingest --update-env
pm2 save
pm2 list
```

Optional: pass worker-only env without editing the shared file:

```bash
pm2 start scripts/email-ingest-worker.js --name ingest \
  --update-env \
  --env DB_POOL_MAX=3
```

### Behaviour

| `EMAIL_INGEST_DISPATCH` | API upload handler |
|-------------------------|-------------------|
| `inline` (default) | **202** + `processEmailUpload` in API process (legacy) |
| `worker` | **202** + `ingestStatus: 'queued'` — no ingest on API |

Worker polls `email_uploads` where `"candidateId" IS NULL`, oldest first, `FOR UPDATE SKIP LOCKED`, then calls the same `processEmailUpload` logic.

Rows with `user_notes` starting with `INGEST_FAILED:` are **skipped** (no CV, bad S3 key, etc.). If an old row without a resume blocks the queue (worker logs the same `recordId` every poll), mark it once in SQL:

```sql
UPDATE email_uploads
SET user_notes = 'INGEST_FAILED: no resume attachment (manual)'
WHERE id = 34 AND "candidateId" IS NULL;
```

Replace `34` with the stuck id from `pm2 logs ingest`.

### Verify

```bash
curl -sS http://127.0.0.1:4000/health/db
pm2 logs ingest --nostream 2>&1 | tail -20
pm2 logs server --nostream 2>&1 | grep 'queued for ingest worker'
```

During mail ingest, API `pool.waiting` should stay **0** much more often than with `inline`.
