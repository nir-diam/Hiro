const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobPublication = sequelize.define(
  'JobPublication',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    jobId: { type: DataTypes.UUID, allowNull: false },
    publicJobTitle: DataTypes.STRING,
    publicJobDescription: DataTypes.TEXT,
    publicJobRequirements: DataTypes.TEXT,
    landingPageFields: { type: DataTypes.JSONB, defaultValue: [] },
    screeningQuestions: { type: DataTypes.JSONB, defaultValue: [] },
    trackingLinks: { type: DataTypes.JSONB, defaultValue: [] },
    publishToGeneralBoard: { type: DataTypes.BOOLEAN, defaultValue: true },
    publicationCode: DataTypes.STRING,
    heroImageUrl: DataTypes.STRING,
    videoUrl: DataTypes.STRING,
    contactEmail: DataTypes.STRING,
    contactPhone1: DataTypes.STRING,
    contactPhone2: DataTypes.STRING,
    landingLayout: { type: DataTypes.STRING, defaultValue: 'detailed' },
    landingLayouts: { type: DataTypes.JSONB, defaultValue: {} },
    visitCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    submissionCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: 'job_publications',
  },
);

module.exports = JobPublication;

