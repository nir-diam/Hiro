# Public Jobs API (`/api/public/v1`)

Server-to-server API for hiro.co.il / humand.co.il. The browser must not call Hiro directly — only the site backend (Vercel) with `X-Hiro-Site-Key`.

## Authentication

Header: `X-Hiro-Site-Key: <secret>`

Keys are stored in `public_site_keys` (admin UI TBD). For local dev, set env:

```json
PUBLIC_SITE_KEYS=[{"key":"dev-humand-key","clientId":"<uuid>","mode":"tenant","name":"Humand dev"}]
PUBLIC_SITE_AGGREGATOR_KEY=dev-hiro-aggregator-key
```

| Mode | Scope |
| --- | --- |
| `tenant` | Jobs for the key's `clientId` only (e.g. humand.co.il) |
| `aggregator` | All jobs published to the board across tenants (hiro.co.il) |

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Key validity + mode |
| GET | `/jobs` | List (`q`, `page`, `limit`, `facets`) |
| GET | `/jobs/:slugOrId` | Job detail |
| GET | `/jobs/:id/similar` | Similar jobs (embeddings TBD) |
| POST | `/jobs/:id/applications` | Apply via existing landing pipeline |
| POST | `/jobs/:id/view` | Visit counter |
| GET | `/taxonomy` | Filter catalogs |
| GET | `/companies/:slug` | Company page + jobs |
| GET | `/sitemap/jobs` | `{ slug, updatedAt }[]` |

Legacy landing API remains at `/api/public/jobs/*` (no site key).

## Visibility (interim)

Until the "פרסום באתר" tab ships, jobs are included when `job_publications.publish_to_general_board = true` and job status is `פתוחה`. This will be replaced by per-site publish flags.

## Roadmap (spec)

Field mapping §3, confidential employer §4, recruitment source "אתר Hiro", webhooks, facets, 410 closed jobs, rate limits — see product spec.
