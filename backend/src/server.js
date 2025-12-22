const express = require('express');
const dotenv = require('dotenv');
const corsMiddleware = require('./middleware/corsMiddleware');
const { connectDb } = require('./config/db');
const authRoutes = require('./routes/authRoutes');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());
app.use(corsMiddleware());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hiro-backend' });
});

app.use('/api/auth', authRoutes);

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

