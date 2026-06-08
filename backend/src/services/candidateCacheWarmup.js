/**
 * Warm up the Redis cache with all active candidates from the DB.
 *
 * Run once on server start, or on-demand:
 *   node -e "require('./src/services/candidateCacheWarmup').warmupCandidateCache()"
 *
 * Or import and call from server.js:
 *   const { warmupCandidateCache } = require('./services/candidateCacheWarmup');
 *   await warmupCandidateCache();
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const redis = require('./redisService');

const CANDIDATE_KEY = (id) => `candidate:${id}`;
const CANDIDATE_TTL = 60 * 60; // 1 hour — same as candidateService

const BATCH_SIZE = 100;

/**
 * Load all active (non-deleted) candidates from DB into Redis.
 * Uses batches so it doesn't hammer memory on large datasets.
 * @returns {Promise<{ loaded: number, errors: number }>}
 */
const warmupCandidateCache = async () => {
  const { connectDb } = require('../config/db');
  const { connectRedis } = require('../config/redis');

  await connectDb();
  await connectRedis().catch((e) => {
    console.warn('[warmup] Redis connect failed:', e.message);
  });

  const Candidate = require('../models/Candidate');
  const SystemTag = require('../models/SystemTag');
  const Tag = require('../models/Tag');
  const { SYSTEM_TAG_TYPE_CANDIDATE } = require('../models/SystemTag');

  let offset = 0;
  let loaded = 0;
  let errors = 0;

  console.log('[warmup] Starting candidate cache warmup...');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await Candidate.findAll({
      where: { isDeleted: false },
      attributes: [
        'id', 'fullName', 'firstName', 'lastName', 'status', 'phone', 'email',
        'address', 'location', 'title', 'professionalSummary', 'profilePicture',
        'resumeUrl', 'availability', 'industry', 'field', 'sector', 'companySize',
        'salaryMin', 'salaryMax', 'isArchived', 'createdAt', 'updatedAt',
      ],
      include: [
        {
          model: SystemTag,
          as: 'candidateTags',
          required: false,
          where: { type: SYSTEM_TAG_TYPE_CANDIDATE, is_active: true },
          include: [{ model: Tag, as: 'tag' }],
        },
      ],
      limit: BATCH_SIZE,
      offset,
      order: [['updatedAt', 'DESC']],
    });

    if (!rows.length) break;

    await Promise.all(
      rows.map(async (row) => {
        try {
          const plain = row.toJSON ? row.toJSON() : { ...row };
          await redis.set(CANDIDATE_KEY(plain.id), plain, { ttlSeconds: CANDIDATE_TTL });
          loaded++;
        } catch (e) {
          console.warn('[warmup] failed to cache candidate', row.id, e.message);
          errors++;
        }
      }),
    );

    console.log(`[warmup] cached ${loaded} candidates so far...`);
    offset += BATCH_SIZE;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[warmup] Done. Loaded: ${loaded}, Errors: ${errors}`);
  return { loaded, errors };
};

module.exports = { warmupCandidateCache };

// Allow direct execution: node src/services/candidateCacheWarmup.js
if (require.main === module) {
  warmupCandidateCache()
    .then(({ loaded, errors }) => {
      console.log(`Warmup complete: ${loaded} loaded, ${errors} errors`);
      process.exit(errors > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Warmup failed:', err);
      process.exit(1);
    });
}
