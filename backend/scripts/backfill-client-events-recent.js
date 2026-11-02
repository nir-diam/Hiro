#!/usr/bin/env node
/**
 * Build clients.events_recent from the head of clients.events (slim JSONB).
 * Usage: node scripts/backfill-client-events-recent.js [clientId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../src/.env') });

const { QueryTypes } = require('sequelize');
const { sequelize, connectDb } = require('../src/config/db');
const { backfillClientEventsRecentFromDb } = require('../src/utils/clientEventsRecentCache');

const main = async () => {
  await connectDb();
  const arg = process.argv[2];
  if (arg) {
    const r = await backfillClientEventsRecentFromDb(sequelize, arg);
    console.log('[backfill-client-events-recent] done', r);
    await sequelize.close();
    return;
  }
  const ids = await sequelize.query(
    `SELECT id FROM clients
     WHERE jsonb_array_length(COALESCE(events, '[]'::jsonb)) > 0
       AND jsonb_array_length(COALESCE(events_recent, '[]'::jsonb)) = 0
     ORDER BY "updatedAt" DESC NULLS LAST
     LIMIT 50`,
    { type: QueryTypes.SELECT },
  );
  for (const row of ids) {
    try {
      const r = await backfillClientEventsRecentFromDb(sequelize, row.id);
      console.log('[backfill-client-events-recent] ok', r);
    } catch (e) {
      console.error('[backfill-client-events-recent] failed', row.id, e.message);
    }
  }
  await sequelize.close();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
