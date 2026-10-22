const path = require('path');
const dotenv = require('dotenv');
// Load env before any other imports that rely on it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') }); // e.g. backend/src/.env
dotenv.config(); // fallback to default .env resolution

const express = require('express');
const corsMiddleware = require('./middleware/corsMiddleware');
const { connectDb } = require('./config/db');
const { connectRedis } = require('./config/redis');
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

app.use('/api/scripts', require('./routes/scriptRoutes'));

const jobPublicationController = require('./controllers/jobPublicationController');
// Optional clean share URLs when proxied to the API (same handlers as /api/public/jobs/share/...).
app.get('/jobs/:clientHint/public/board', jobPublicationController.getBoardSharePreview);
app.get('/jobs/:clientHint/public/:slug', jobPublicationController.getSharePreview);

app.use('/api/agent/auth', require('./routes/agentAuthRoutes'));
app.use('/api/agent', require('./routes/agentRoutes'));
app.use('/api/public/v1', require('./routes/publicJobsApiRoutes'));

app.use('/api', require('./middleware/rejectAgentTokenMiddleware'));

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
app.use('/api/cities', cityRoutes);
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

const start = async () => {
  try {
    await connectDb();
    await connectRedis().catch((err) => {
      console.warn('[server] Redis connection failed (non-fatal):', err.message);
    });
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
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

start();
