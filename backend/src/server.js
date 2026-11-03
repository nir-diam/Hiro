const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

/** Where REDIS_ENABLED came from — exposed (no secrets) on /health/redis. */
const envSources = {
  processEnvRedisEnabled: process.env.REDIS_ENABLED ?? null,
  files: [],
};
const inspectEnvFile = (label, filePath) => {
  if (!fs.existsSync(filePath)) {
    envSources.files.push({ file: label, exists: false });
    return;
  }
  try {
    const parsed = dotenv.parse(fs.readFileSync(filePath));
    const host = parsed.REDIS_HOST || null;
    envSources.files.push({
      file: label,
      exists: true,
      redisEnabled: parsed.REDIS_ENABLED ?? null,
      redisHostIsPlaceholder: host ? /x{3,}/i.test(host) : null,
      redisAuthTokenIsPlaceholder: parsed.REDIS_AUTH_TOKEN
        ? /your-|change_me/i.test(parsed.REDIS_AUTH_TOKEN)
        : null,
    });
  } catch (e) {
    envSources.files.push({ file: label, exists: true, error: e.message });
  }
};
inspectEnvFile('backend/.env', path.resolve(__dirname, '../.env'));
inspectEnvFile('backend/src/.env', path.resolve(__dirname, '.env'));
inspectEnvFile('cwd/.env', path.resolve(process.cwd(), '.env'));

// Load env before any other imports that rely on it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true }); // src/.env wins over backend/.env
dotenv.config(); // fallback to default .env resolution
envSources.effectiveRedisEnabled = process.env.REDIS_ENABLED ?? null;
envSources.cwd = process.cwd();
envSources.startedAt = new Date().toISOString();

const express = require('express');
const corsMiddleware = require('./middleware/corsMiddleware');
const appCacheMiddleware = require('./middleware/appCacheMiddleware');
const { connectDb, sequelize } = require('./config/db');
const {
  connectRedis,
  isRedisAvailable,
  REDIS_ENABLED,
  REDIS_READ_THROUGH,
  REDIS_CACHE_WARMUP,
  REDIS_CACHE_WARMUP_DELAY_MS,
} = require('./config/redis');
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const companiesRoutes = require('./routes/companiesRoutes');
const jobRoutes = require('./routes/jobRoutes');
const tagRoutes = require('./routes/tagRoutes');
const chatRoutes = require('./routes/chatRoutes');
const jobFieldRoutes = require('./routes/jobFieldRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const promptRoutes = require('./routes/promptRoutes');
const candidateApplicationRoutes = require('./routes/candidateApplicationRoutes');
const picklistRoutes = require('./routes/picklistRoutes');
const helpCenterRoutes = require('./routes/helpCenterRoutes');
const candidateTagRoutes = require('./routes/candidateTagRoutes');
const businessLogicRoutes = require('./routes/businessLogicRoutes');
const emailRoutes = require('./routes/emailRoutes');
const cityRoutes = require('./routes/cityRoutes');
const userRoutes = require('./routes/userRoutes');
const eventTypeRoutes = require('./routes/eventTypeRoutes');
const systemEventRoutes = require('./routes/systemEventRoutes');
const auditLogRoutes = require('./routes/auditLogRoutes');
const appLogRoutes = require('./routes/appLogRoutes');
const messagingRoutes = require('./routes/messagingRoutes');
const referenceInfoRoutes = require('./routes/referenceInfoRoutes');
const { clientRouter: messageTemplateClientRoutes, adminRouter: messageTemplateAdminRoutes } = require('./routes/messageTemplateRoutes');
const matchingEngineRoutes = require('./routes/matchingEngineRoutes');
const recruitmentSourceRoutes = require('./routes/recruitmentSourceRoutes');
const savedSearchRoutes = require('./routes/savedSearchRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { publicRouter, publishingRouter, jobPublicationRouter } = require('./routes/jobPublicationRoutes');

const app = express();
const port = process.env.PORT || 4000;
// Base64 resume in JSON expands ~4/3; 50mb avoids 413 for typical PDFs. Override with BODY_PARSER_LIMIT. Nginx/proxy may need client_max_body_size too.
const bodyParserLimit = process.env.BODY_PARSER_LIMIT || '50mb';

app.use(express.json({ limit: bodyParserLimit }));
app.use(express.urlencoded({ limit: bodyParserLimit, extended: true }));
app.use(corsMiddleware());
app.options('*', corsMiddleware());   // 👈 מאפשר OPTIONS לכל הנתיבים
app.use(appCacheMiddleware);
app.use('/api', require('./middleware/httpGetResponseCacheMiddleware').invalidateHttpGetCacheOnWrite);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hiro-backend' });
});

app.get('/health/db', async (_req, res) => {
  const { sequelize } = require('./config/db');
  const started = Date.now();
  try {
    await sequelize.query('SELECT 1 AS ok');
    const pool = sequelize.connectionManager.pool;
    res.json({
      status: 'ok',
      ms: Date.now() - started,
      pool: pool
        ? {
          size: pool.size,
          available: pool.available,
          using: pool.using,
          waiting: pool.waiting,
        }
        : undefined,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      ms: Date.now() - started,
      message: err.message || String(err),
    });
  }
});

app.get('/health/redis', async (_req, res) => {
  const started = Date.now();
  const { getLastRedisError, REDIS_HOST, REDIS_TLS } = require('./config/redis');
  if (!REDIS_ENABLED) {
    return res.json({ status: 'disabled', enabled: false, ms: Date.now() - started, envSources });
  }
  try {
    if (!isRedisAvailable()) {
      return res.status(503).json({
        status: 'unavailable',
        enabled: true,
        readThrough: REDIS_READ_THROUGH,
        host: REDIS_HOST,
        tls: REDIS_TLS,
        authTokenSet: Boolean(process.env.REDIS_PASSWORD || process.env.REDIS_AUTH_TOKEN),
        lastError: getLastRedisError(),
        ms: Date.now() - started,
        message: 'Redis not connected',
        envSources,
      });
    }
    const { getRedisClient } = require('./config/redis');
    const client = getRedisClient();
    const pong = await client.ping();
    res.json({
      status: isRedisAvailable() ? 'ok' : 'degraded',
      enabled: true,
      readThrough: REDIS_READ_THROUGH,
      pong,
      ms: Date.now() - started,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      enabled: true,
      readThrough: REDIS_READ_THROUGH,
      ms: Date.now() - started,
      message: err.message || String(err),
    });
  }
});

const jobPublicationController = require('./controllers/jobPublicationController');
// Optional clean share URLs when proxied to the API (same handlers as /api/public/jobs/share/...).
app.get('/jobs/:clientHint/public/board', jobPublicationController.getBoardSharePreview);
app.get('/jobs/:clientHint/public/:slug', jobPublicationController.getSharePreview);

app.use('/api/agent/auth', require('./routes/agentAuthRoutes'));
const { httpGetResponseCacheMiddleware } = require('./middleware/httpGetResponseCacheMiddleware');
app.use('/api/agent', httpGetResponseCacheMiddleware);
app.use('/api/agent', require('./routes/agentRoutes'));
app.use('/api/public/v1', require('./routes/publicJobsApiRoutes'));
/** Reference catalog — no staff JWT (also listed in apiGlobalAuthMiddleware allowlist). */
app.use('/api/cities', cityRoutes);
/**
 * Image proxy for proposal branding assets. Mounted ahead of apiGlobalAuthMiddleware because
 * `<img src>` cannot send an Authorization header; the handler restricts targets to an
 * allowlist of image hosts. See services/mediaProxyService.js.
 */
app.use('/api/media', require('./routes/mediaRoutes'));

app.use('/api', require('./middleware/rejectAgentTokenMiddleware'));
app.use('/api', require('./middleware/apiGlobalAuthMiddleware'));
app.use('/api', require('./middleware/httpGetResponseCacheMiddleware').httpGetResponseCacheMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/public-sites', require('./routes/publicSiteAdminRoutes'));
app.use('/api/organizations', organizationRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/jobs', jobPublicationRouter);
app.use('/api/public/jobs', publicRouter);
app.use('/api/publishing', publishingRouter);
app.use('/api/tags', tagRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/job-fields', jobFieldRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/prompts', promptRoutes);  
app.use('/api/applications', candidateApplicationRoutes);
app.use('/api/picklists', picklistRoutes);
app.use('/api/help-center', helpCenterRoutes);
app.use('/api/admin/candidate-tags', candidateTagRoutes);
app.use('/api/admin/business-logic', businessLogicRoutes);
app.use('/api/email-uploads', emailRoutes);
app.use('/api/event-types', eventTypeRoutes);
app.use('/api/system-events', systemEventRoutes);
app.use('/api/audit-logs', auditLogRoutes);
app.use('/api/admin/logs', appLogRoutes);
app.use('/api/inforu', require('./routes/inforuRoutes'));
app.use('/api/messaging', messagingRoutes);
app.use('/api/reference-info', referenceInfoRoutes);
app.use('/api/recruitment-sources', recruitmentSourceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/message-templates', messageTemplateClientRoutes);
app.use('/api/admin/message-templates', messageTemplateAdminRoutes);
app.use('/api/proposals', require('./routes/proposalRoutes'));
app.use('/api/admin/matching-engine', matchingEngineRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/pipeline-outcomes', require('./routes/pipelineOutcomeRoutes'));
app.use('/api/scripts', require('./routes/scriptRoutes'));

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('[server] PostgreSQL authenticate OK');

    app.listen(port, () => {
      const heapMb = Math.round(process.memoryUsage().heapTotal / 1024 / 1024);
      console.log(
        `[server] listening port=${port} pid=${process.pid} node=${process.version} heapTotalMb=${heapMb} heap-guard=vector-slim+notif-sql`,
      );
      try {
        require('./services/vectorSearchService').warmCandidateVectorCache();
        require('./services/jobTaxonomyResolver').loadTaxonomyIndex().catch((err) => {
          console.warn('[server] taxonomy warmup failed', String(err && err.message ? err.message : err).slice(0, 160));
        });
      } catch (err) {
        console.warn('[server] vector cache warmup skipped', err.message || err);
      }
    });

    // Idempotent DDL in connectDb must not block login/API when ingest/backfill holds candidates locks.
    void connectDb({ skipAuthenticate: true })
      .then(() => {
        console.log('[server] DB startup migrations finished');
      })
      .catch((err) => {
        console.error(
          '[server] DB startup migrations failed (API already listening):',
          err?.message || err,
        );
      });

    setTimeout(() => {
      require('./services/cityService').getAll().catch((err) => {
        console.warn('[server] city catalog preload failed (non-fatal):', err?.message || err);
      });
    }, 1500);

    connectRedis().catch((err) => {
      console.warn('[server] Redis connection failed (non-fatal):', err.message);
    });

    if (REDIS_CACHE_WARMUP && REDIS_ENABLED) {
      const runWarmup = () => {
        const { warmupCandidateCache } = require('./services/candidateCacheWarmup');
        warmupCandidateCache().catch((err) => {
          console.warn('[server] Redis cache warmup failed (non-fatal):', err.message || err);
        });
      };
      if (REDIS_CACHE_WARMUP_DELAY_MS > 0) {
        console.log(`[server] Redis cache warmup scheduled in ${REDIS_CACHE_WARMUP_DELAY_MS}ms`);
        setTimeout(runWarmup, REDIS_CACHE_WARMUP_DELAY_MS);
      } else {
        runWarmup();
      }
    }
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

start();
