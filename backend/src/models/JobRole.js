const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const JobCluster = require('./JobCluster');

const JobRole = sequelize.define(
  'JobRole',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    synonyms: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    clusterId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: JobCluster, key: 'id' },
    },
  },
  {
    tableName: 'job_roles',
  },
);

JobCluster.hasMany(JobRole, { foreignKey: 'clusterId', as: 'roles', onDelete: 'CASCADE' });
JobRole.belongsTo(JobCluster, { foreignKey: 'clusterId', as: 'cluster' });

module.exports = JobRole;

