const { sequelize } = require('../config/db');

const INTERACTIVE_RESERVE = Math.max(
  2,
  Number.parseInt(process.env.DB_POOL_INTERACTIVE_RESERVE || '6', 10) || 6,
);

const YIELD_SLEEP_MS = Math.max(
  10,
  Number.parseInt(process.env.DB_POOL_YIELD_SLEEP_MS || '35', 10) || 35,
);

const YIELD_MAX_MS = Math.max(
  0,
  Number.parseInt(process.env.DB_POOL_YIELD_MAX_MS || '20000', 10) || 20000,
);

/**
 * Before heavy email-ingest DB work, pause until the pool has headroom for UI/API traffic.
 */
const isIngestWorkerProcess = () => process.env.EMAIL_INGEST_WORKER === '1';

const yieldDbPoolForInteractive = async () => {
  const pool = sequelize.connectionManager?.pool;
  if (!pool) return;

  const deadline = Date.now() + YIELD_MAX_MS;
  while (Date.now() < deadline) {
    const using = pool.using ?? 0;
    const waiting = pool.waiting ?? 0;

    if (isIngestWorkerProcess()) {
      // Worker pool is tiny (2): keep at most one connection busy so claim + work do not pile up.
      if (using <= 1 && waiting === 0) return;
      await new Promise((r) => setTimeout(r, YIELD_SLEEP_MS));
      continue;
    }

    const max = pool.max ?? 15;
    const budget = Math.max(1, max - INTERACTIVE_RESERVE);
    if (using <= budget && waiting === 0) return;
    if (waiting > 0 && using >= budget) {
      await new Promise((r) => setTimeout(r, YIELD_SLEEP_MS));
      continue;
    }
    if (using <= budget) return;
    await new Promise((r) => setTimeout(r, YIELD_SLEEP_MS));
  }
};

const runWithIngestDbYield = async (fn) => {
  await yieldDbPoolForInteractive();
  return fn();
};

module.exports = {
  INTERACTIVE_RESERVE,
  yieldDbPoolForInteractive,
  runWithIngestDbYield,
};
