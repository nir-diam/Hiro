const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Client = sequelize.define(
  'Client',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    contactPerson: DataTypes.STRING,
    phone: DataTypes.STRING,
    email: DataTypes.STRING,
    openJobs: DataTypes.INTEGER,
    jobsUsed: { type: DataTypes.INTEGER, defaultValue: 0 },
    jobsTotal: { type: DataTypes.INTEGER, defaultValue: 0 },
    coordinatorsUsed: { type: DataTypes.INTEGER, defaultValue: 0 },
    coordinatorsTotal: { type: DataTypes.INTEGER, defaultValue: 0 },
    cvQuotaTotal: { type: DataTypes.INTEGER, defaultValue: 0 },
    tagsQuotaTotal: { type: DataTypes.INTEGER, defaultValue: 0 },
    contactsQuotaTotal: { type: DataTypes.INTEGER, defaultValue: 0 },
    smsBackup: { type: DataTypes.INTEGER, defaultValue: 0 },
    smsMonthly: { type: DataTypes.INTEGER, defaultValue: 0 },
    questionnaireBackup: { type: DataTypes.INTEGER, defaultValue: 0 },
    questionnaireMonthly: { type: DataTypes.INTEGER, defaultValue: 0 },
    emailBackup: { type: DataTypes.INTEGER, defaultValue: 0 },
    emailMonthly: { type: DataTypes.INTEGER, defaultValue: 0 },
    hiroAiMonthly: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: {
      type: DataTypes.ENUM('פעיל', 'לא פעיל', 'בהקפאה'),
      defaultValue: 'פעיל',
    },
    accountManager: DataTypes.STRING,
    city: DataTypes.STRING,
    region: DataTypes.STRING,
    industry: DataTypes.STRING,
    field: DataTypes.STRING,
    contactIsActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    creationDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    recruitingCoordinator: DataTypes.STRING,
  },
  {
    tableName: 'clients',
  },
);

module.exports = Client;

