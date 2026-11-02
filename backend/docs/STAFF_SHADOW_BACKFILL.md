# Staff shadow copies — one-time prod backfill

Every live primary candidate should have a staff shadow (`staffProfileCopy=true`, `canonicalCandidateId=<primary>`). New creates and ingest paths call `ensureStaffShadowCopy` automatically; existing rows need a one-time backfill.

## Dry run

From `backend/`:

```bash
node scripts/backfill-staff-shadow-copies.js --dry-run --limit=50
```

## Production run

Run in batches (default `--limit=500`) until `created` stays near 0:

```bash
node scripts/backfill-staff-shadow-copies.js --limit=500
```

Repeat until the script reports mostly `existed` and few/no `created`. Safe to re-run (idempotent).

## Notes

- Uses `candidateService.ensureStaffShadowCopy` — same path as open-profile ensure.
- Skips rows that already have a shadow.
- Prefer off-peak; each create clones CV fields and bumps caches.
- Env: load `backend/src/.env` (or `backend/.env`) with DB credentials before running.
