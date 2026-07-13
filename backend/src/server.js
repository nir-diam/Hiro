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

const jobPublicationController = require('./controllers/jobPublicationController');
// Optional clean share URLs when proxied to the API (same handlers as /api/public/jobs/share/...).
app.get('/jobs/:clientHint/public/board', jobPublicationController.getBoardSharePreview);
app.get('/jobs/:clientHint/public/:slug', jobPublicationController.getSharePreview);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
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
app.use('/api/messaging', messagingRoutes);
app.use('/api/reference-info', referenceInfoRoutes);
app.use('/api/recruitment-sources', recruitmentSourceRoutes);
app.use('/api/message-templates', messageTemplateClientRoutes);
app.use('/api/admin/message-templates', messageTemplateAdminRoutes);
app.use('/api/admin/matching-engine', matchingEngineRoutes);
app.use('/api/saved-searches', savedSearchRoutes);

const start = async () => {
  try {
    await connectDb();
    await connectRedis().catch((err) => {
      console.warn('[server] Redis connection failed (non-fatal):', err.message);
    });
    try {
      const promptService = require('./services/promptService');
      await promptService.ensureById('tag_correction_agent');
      await promptService.ensureById('job_taxonomy_mapping');
    } catch (promptErr) {
      console.warn('[server] tag_correction_agent prompt seed failed', promptErr?.message || promptErr);
    }
    app.listen(port, () => {
      console.log(`API listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

start();
