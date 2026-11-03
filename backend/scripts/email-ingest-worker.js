/**
 * Drains email_uploads rows with no candidateId (CV mail ingest).
 * One CV at a time, small DB pool, pauses when the API pool is busy.
 *
 * API:  EMAIL_INGEST_DISPATCH=worker  DB_POOL_MAX=8
 * Worker: EMAIL_INGEST_WORKER_DB_POOL_MAX=2
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../src/.env'), override: true });
dotenv.config();

process.env.EMAIL_INGEST_WORKER = '1';
process.env.EMAIL_INGEST_MAX_CONCURRENT = '1';
if (!process.env.LIST_SCORE_CONCURRENCY) {
  process.env.LIST_SCORE_CONCURRENCY = '1';
}
process.env.DB_POOL_MAX = String(
  Number.parseInt(process.env.EMAIL_INGEST_WORKER_DB_POOL_MAX || '2', 10) || 2,
);

const { QueryTypes } = require('sequelize');
const { sequelize, connectDb } = require('../src/config/db');
const EmailUpload = require('../src/models/EmailUpload');
const {
  processEmailUpload,
  markEmailUploadIngestFailed,
  isEmailUploadIngestTerminal,
} = require('../src/controllers/emailController');
const { logIngestFailed } = require('../src/services/emailIngestLogService');

const POLL_MS = Math.max(
  1000,
  Number.parseInt(process.env.EMAIL_INGEST_WORKER_POLL_MS || '5000', 10) || 5000,
);

const COOLDOWN_MS = Math.max(
  0,
  Number.parseInt(process.env.EMAIL_INGEST_WORKER_COOLDOWN_MS || '3000', 10) || 3000,
);

const API_HEALTH_URL = String(
  process.env.EMAIL_INGEST_API_HEALTH_URL || 'http://127.0.0.1:4000/health/db',
).trim();

const DEFER_WHEN_SERVER_BUSY = process.env.EMAIL_INGEST_DEFER_WHEN_SERVER_BUSY !== '0';

const DEFER_SERVER_USING_ABOVE = Math.max(
  1,
  Number.parseInt(process.env.EMAIL_INGEST_DEFER_SERVER_USING_ABOVE || '5', 10) || 5,
);

const dispatch = String(process.env.EMAIL_INGEST_DISPATCH || 'inline').trim().toLowerCase();
if (dispatch !== 'worker') {
  console.warn(
    `[ingest-worker] EMAIL_INGEST_DISPATCH=${dispatch} — worker expects "worker". Continuing anyway.`,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let shuttingDown = false;
let activeJob = null;
let pausedLogged = false;

async function serverPoolHasHeadroom() {
  if (!DEFER_WHEN_SERVER_BUSY) return true;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(API_HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return true;
    const body = await res.json();
    const waiting = Number(body?.pool?.waiting ?? 0);
    const using = Number(body?.pool?.using ?? 0);
    if (waiting > 0) {
      console.log('[ingest-worker] defer — API pool waiting', { waiting, using });
      return false;
    }
    if (using >= DEFER_SERVER_USING_ABOVE) {
      console.log('[ingest-worker] defer — API pool using high', {
        using,
        above: DEFER_SERVER_USING_ABOVE,
      });
      return false;
    }
    return true;
  } catch (err) {
    // Do not block the whole queue when /health/db is down or the port differs — ingest uses its own pool.
    console.warn('[ingest-worker] API health unreachable — continuing anyway', err?.message || err);
    return true;
  }
}

async function claimNextPendingUpload() {
  return sequelize.transaction(async (t) => {
    const rows = await sequelize.query(
      `SELECT id FROM email_uploads
       WHERE "candidateId" IS NULL
         AND (user_notes IS NULL OR user_notes NOT LIKE 'INGEST_FAILED:%')
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      { type: QueryTypes.SELECT, transaction: t },
    );
    const id = rows[0]?.id;
    if (id == null) return null;
    return EmailUpload.findByPk(id, { transaction: t });
  });
}

async function runOneCycle() {
  if (shuttingDown || activeJob) return false;
  let record;
  try {
    record = await claimNextPendingUpload();
  } catch (err) {
    console.error('[ingest-worker] claim failed', err?.message || err);
    return false;
  }
  if (!record) return false;

  activeJob = String(record.id);
  console.log('[ingest-worker] processing', {
    recordId: record.id,
    fileKey: record.fileKey,
    bucket: record.bucket,
  });
  try {
    await processEmailUpload(record, null);
    await record.reload();
    if (!record.candidateId && !isEmailUploadIngestTerminal(record)) {
      await markEmailUploadIngestFailed(record, 'ingest finished without candidate link');
    }
    console.log('[ingest-worker] finished', { recordId: record.id });
  } catch (err) {
    console.error('[ingest-worker] processEmailUpload failed', {
      recordId: record.id,
      message: err?.message || err,
    });
    await logIngestFailed(record, err?.message || String(err || 'unknown error'), {
      errorName: err?.name || null,
      stackTrace: err?.stack ? String(err.stack).slice(0, 4000) : null,
      phase: 'worker',
    });
    try {
      await record.reload();
      if (!record.candidateId && !isEmailUploadIngestTerminal(record)) {
        await markEmailUploadIngestFailed(record, err?.message || String(err));
      }
    } catch (markErr) {
      console.error('[ingest-worker] could not mark failed row', record.id, markErr?.message || markErr);
    }
  } finally {
    activeJob = null;
  }
  return true;
}

async function drainLoop() {
  while (!shuttingDown) {
    if (process.env.EMAIL_INGEST_PAUSED === '1') {
      if (!pausedLogged) {
        pausedLogged = true;
        console.warn('[ingest-worker] paused (EMAIL_INGEST_PAUSED=1)');
      }
      await sleep(POLL_MS);
      continue;
    }
    pausedLogged = false;
    if (!(await serverPoolHasHeadroom())) {
      await sleep(POLL_MS);
      continue;
    }
    const didWork = await runOneCycle();
    if (!didWork) {
      await sleep(POLL_MS);
      continue;
    }
    if (COOLDOWN_MS > 0) await sleep(COOLDOWN_MS);
  }
}

async function start() {
  await sequelize.authenticate().catch((err) => {
    console.error('[ingest-worker] DB authenticate failed', err?.message || err);
    process.exit(1);
  });
  void connectDb({ skipAuthenticate: true }).catch((err) => {
    console.warn('[ingest-worker] startup DDL skipped/failed (non-fatal):', err?.message || err);
  });
  const poolMax = sequelize.connectionManager?.pool?.max ?? '?';
  const paused = process.env.EMAIL_INGEST_PAUSED === '1';
  console.log('[ingest-worker] started', {
    pollMs: POLL_MS,
    cooldownMs: COOLDOWN_MS,
    poolMax,
    dispatch,
    paused,
    deferWhenServerBusy: DEFER_WHEN_SERVER_BUSY,
    deferUsingAbove: DEFER_SERVER_USING_ABOVE,
    apiHealth: API_HEALTH_URL,
    pid: process.pid,
  });
  if (paused) {
    console.warn(
      '[ingest-worker] EMAIL_INGEST_PAUSED=1 — not claiming rows until set to 0 and pm2 restart ingest',
    );
  }

  void drainLoop().catch((err) => {
    console.error('[ingest-worker] drain loop died', err);
    process.exit(1);
  });

  const stop = (signal) => {
    console.log(`[ingest-worker] ${signal} — draining`);
    shuttingDown = true;
    const waitMs = 500;
    const deadline = Date.now() + Math.max(waitMs, Number(process.env.EMAIL_INGEST_TIMEOUT_MS || 480000));
    const check = () => {
      if (!activeJob || Date.now() >= deadline) {
        process.exit(activeJob ? 1 : 0);
        return;
      }
      setTimeout(check, waitMs);
    };
    check();
  };

  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

process.on('unhandledRejection', (err) => {
  console.error('[ingest-worker][unhandledRejection]', err);
});

start().catch((err) => {
  console.error('[ingest-worker] failed to start', err);
  process.exit(1);
});
