# API authentication and S3 (CV) access

## Staff API (`/api/*`)

After deploy, almost every route under `/api` requires a valid **staff JWT** (`Authorization: Bearer …`).

**Public without JWT (allowlist):**

| Path | Notes |
|------|--------|
| `/api/auth/*` | Login, signup, activation, candidate portal magic link |
| `/api/public/v1/*` | Public Jobs API — `X-Hiro-Site-Key` (see `PUBLIC_JOBS_API.md`) |
| `/api/public/jobs/*` | Job board / landing / apply |
| `POST /api/email-uploads/email-upload` | `X-Email-Upload-Secret` or staff JWT |
| `POST /api/inforu/webhooks/*` | `INFORU_WEBHOOK_SECRET` (handler) |

**Separate auth (mounted before global middleware):**

- `/api/agent/*` — agent JWT
- `/health`, `/health/db`, `/health/redis` — ops (lock down at nginx in production if needed)

**Candidate portal:** users obtain a JWT via `/api/auth/candidate-portal/magic` and then call protected routes (e.g. `GET /api/candidates/:id`) with that token.

### Verify (production)

```bash
# Must be 401
curl -sS -o /dev/null -w "%{http_code}\n" https://api.hiro.co.il/api/candidates
curl -sS -o /dev/null -w "%{http_code}\n" https://api.hiro.co.il/api/prompts
curl -sS -o /dev/null -w "%{http_code}\n" https://api.hiro.co.il/api/admin/matching-engine/config

# With token — 200
curl -sS -H "Authorization: Bearer $TOKEN" https://api.hiro.co.il/api/candidates
```

## Environment

```env
JWT_SECRET=…                    # rotate if it may have leaked
EMAIL_UPLOAD_WEBHOOK_SECRET=…   # set on Lambda/S3 notify + server .env
S3_PRESIGN_GET_TTL_SEC=900      # optional; resume download links in API JSON
```

## S3 bucket (CV files)

1. In AWS S3: bucket **Block all public access** ON; remove any public bucket policy / ACL `public-read`.
2. App stores stable `https://{bucket}.s3.{region}.amazonaws.com/{key}` in DB; **direct browser GET returns 403**.
3. API responses replace `resumeUrl` / document `url` with **presigned GET** (default 15 minutes).
4. Server-side ingest uses IAM `GetObject`, not anonymous HTTP.

Old bookmarked S3 URLs should return **403 Access Denied**.

## Prompts / secrets

`/api/prompts` requires **admin** permission. If API keys or secrets ever appeared in prompt JSON, **rotate them in the provider console** after locking the API.
