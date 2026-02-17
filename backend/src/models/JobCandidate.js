const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Job = require('./Job');
const Candidate = require('./Candidate');

const JobCandidate = sequelize.define(
  'JobCandidate',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: true,
      
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'חדש',
    },
    source: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'job_candidates',
  },
);

Job.belongsToMany(Candidate, {
  through: JobCandidate,
  foreignKey: 'jobId',
  otherKey: 'candidateId',
  as: 'candidates',
});

Candidate.belongsToMany(Job, {
  through: JobCandidate,
  foreignKey: 'candidateId',
  otherKey: 'jobId',
  as: 'jobs',
});

JobCandidate.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
JobCandidate.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });

module.exports = JobCandidate;

