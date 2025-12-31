const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.POSTGRES_URI
    || process.env.DATABASE_URL
    || 'postgres://postgres:qwe123ZZZ@herodb.cjauwauq6xes.eu-north-1.rds.amazonaws.com:5432/postgres',
  {
    logging: false,
  },
);

const connectDb = async () => {
  await sequelize.authenticate();

  // Register models before sync to ensure associations load if added later
  require('../models/User');
  require('../models/Candidate');
  require('../models/Job');
  require('../models/MessageLog');
  require('../models/Organization');
  require('../models/Client');
  require('../models/JobPublication');
  require('../models/Tag');
  require('../models/Chat');
  require('../models/ChatMessage');
  require('../models/JobCategory');
  require('../models/JobCluster');
  require('../models/JobRole');

  await sequelize.sync();
  console.log('PostgreSQL connected & models synced');
};

module.exports = { sequelize, connectDb };

