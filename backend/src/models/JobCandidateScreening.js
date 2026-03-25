const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Job = require('./Job');
const Candidate = require('./Candidate');

const JobCandidateScreening = sequelize.define(
  'JobCandidateScreening',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'candidates', key: 'id' },
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'jobs', key: 'id' },
    },
    screeningAnswers: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of { question: string, answer: string }',
    },
    telephoneImpression: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    internalOpinion: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'AI-generated internal opinion (HTML) for this candidate+job',
    },
    screeningStatus: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'open',
      comment: 'open | rejected',
    },
    rejectionReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rejectionNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'job_candidate_screening',
    indexes: [
      { unique: true, fields: ['candidateId', 'jobId'] },
    ],
  },
);

JobCandidateScreening.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });
JobCandidateScreening.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });

module.exports = JobCandidateScreening;
