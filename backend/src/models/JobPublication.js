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
  },
  {
    tableName: 'job_publications',
  },
);

module.exports = JobPublication;

