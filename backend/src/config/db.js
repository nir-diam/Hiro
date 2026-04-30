const { Sequelize } = require('sequelize');

// Set POSTGRES_URI or DATABASE_URL in backend/.env. Do not rely on repo defaults for production.
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
  require('../models/JobCandidate');
  require('../models/JobCandidateScreening');
  require('../models/MessageLog');
  require('../models/Organization');
  require('../models/Client');
  require('../models/ClientContact');
  require('../models/ClientContactGroup');
  require('../models/ClientTask');
  require('../models/JobPublication');
  require('../models/Tag');
  require('../models/TagHistory');
  require('../models/Chat');
  require('../models/ChatMessage');
  require('../models/JobCategory');
  require('../models/JobCluster');
  require('../models/JobRole');
  require('../models/Prompt');
  require('../models/PromptHistory');
  require('../models/CandidateApplication');
  require('../models/OrganizationTmp');
  require('../models/OrganizationHistory');
  require('../models/BusinessLogicRule');
  require('../models/EmailUpload');
  require('../models/NotificationMessage');
  require('../models/City');
  require('../models/CandidateOrganization');
  require('../models/MessageTemplate');
  require('../models/ClientUsageSetting');
  require('../models/LoginEmailCode');
  require('../models/EventType');
  require('../models/RecruitmentStatus');

  const User = require('../models/User');
  const Client = require('../models/Client');
  const MessageTemplate = require('../models/MessageTemplate');
  const ClientUsageSetting = require('../models/ClientUsageSetting');
  const RecruitmentStatus = require('../models/RecruitmentStatus');
  User.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(User, { foreignKey: 'clientId', as: 'members' });
  MessageTemplate.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(MessageTemplate, { foreignKey: 'clientId', as: 'messageTemplates' });
  Client.hasOne(ClientUsageSetting, { foreignKey: 'clientId', as: 'usageSettings' });
  ClientUsageSetting.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
  Client.hasMany(RecruitmentStatus, { foreignKey: 'clientId', as: 'recruitmentStatuses' });
  RecruitmentStatus.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

  await sequelize.sync();
  console.log('PostgreSQL connected & models synced');
};

module.exports = { sequelize, connectDb };

