const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const JobCandidate = require('./JobCandidate');

const JobCandidateStatusEvent = sequelize.define(
  'JobCandidateStatusEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    jobCandidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'job_candidates', key: 'id' },
      onDelete: 'CASCADE',
    },
    fromStatus: DataTypes.STRING(500),
    toStatus: { type: DataTypes.STRING(500), allowNull: false },
    fromGroup: DataTypes.STRING(64),
    toGroup: DataTypes.STRING(64),
    changedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    changedByUserId: DataTypes.UUID,
    source: DataTypes.STRING(64),
  },
  {
    tableName: 'job_candidate_status_events',
    timestamps: false,
  },
);

JobCandidateStatusEvent.belongsTo(JobCandidate, { foreignKey: 'jobCandidateId', as: 'jobCandidate' });
JobCandidate.hasMany(JobCandidateStatusEvent, { foreignKey: 'jobCandidateId', as: 'statusEvents' });

module.exports = JobCandidateStatusEvent;
