const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Job = require('./Job');

const CandidateApplication = sequelize.define(
  'CandidateApplication',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'נשלח',
    },
    applicationDate: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW,
    },
    link: {
      type: DataTypes.STRING,
    },
    cvFile: {
      type: DataTypes.STRING,
    },
    notes: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: 'candidate_applications',
  },
);

CandidateApplication.belongsTo(Job, {
  foreignKey: 'jobId',
  as: 'job',
});

module.exports = CandidateApplication;

