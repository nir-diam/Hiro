/**
 * One-time backfill: compute and store embeddings for all jobs that don't have one yet.
 * Run with: node backend/scripts/backfill-job-embeddings.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { sequelize } = require('../src/config/db');
const Job = require('../src/models/Job');
const jobService = require('../src/services/jobService');
const { getJobEmbedding } = require('../src/services/matchingScoreService');

async function main() {
  const jobs = await Job.findAll({ where: { embedding: null }, attributes: { exclude: ['skills'] } });
  console.log(`[backfill] Found ${jobs.length} jobs without embeddings`);

  let done = 0;
  for (const job of jobs) {
    try {
      await jobService.hydrateJobSkills(job);
      const plain = jobService.toPlainJobForMatchScore(job);
      const emb = await getJobEmbedding(plain);
      if (emb && emb.length > 0) {
        await Job.update({ embedding: emb }, { where: { id: job.id } });
        done++;
        console.log(`[backfill] ${done}/${jobs.length} done — job ${job.id} (${emb.length}d)`);
      }
    } catch (e) {
      console.warn(`[backfill] SKIP job ${job.id}:`, e.message);
    }
  }

  console.log(`[backfill] Complete. ${done}/${jobs.length} embeddings stored.`);
  await sequelize.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
