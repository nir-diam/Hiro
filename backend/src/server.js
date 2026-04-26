const path = require('path');
const dotenv = require('dotenv');
// Load env before any other imports that rely on it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') }); // e.g. backend/src/.env
dotenv.config(); // fallback to default .env resolution

const express = require('express');
const corsMiddleware = require('./middleware/corsMiddleware');
const { connectDb } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const clientRoutes = require('./routes/clientRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
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
const referenceInfoRoutes = require('./routes/referenceInfoRoutes');
const { clientRouter: messageTemplateClientRoutes, adminRouter: messageTemplateAdminRoutes } = require('./routes/messageTemplateRoutes');

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

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/jobs', jobRoutes);
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
app.use('/api/reference-info', referenceInfoRoutes);
app.use('/api/message-templates', messageTemplateClientRoutes);
app.use('/api/admin/message-templates', messageTemplateAdminRoutes);

const start = async () => {
  try {
    await connectDb();
    app.listen(port, () => {
      console.log(`API listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
};

start();
