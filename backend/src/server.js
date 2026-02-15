const path = require('path');
const dotenv = require('dotenv');
// Load env before any other imports that rely on it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
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

const app = express();
const port = process.env.PORT || 4000;
const bodyParserLimit = process.env.BODY_PARSER_LIMIT || '5mb';

app.use(express.json({ limit: bodyParserLimit }));
app.use(express.urlencoded({ limit: bodyParserLimit, extended: true }));
app.use(corsMiddleware());
app.options('*', corsMiddleware());   // 👈 מאפשר OPTIONS לכל הנתיבים

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hiro-backend' });
});

app.use('/api/auth', authRoutes);
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
