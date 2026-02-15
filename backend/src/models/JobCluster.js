const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const JobCategory = require('./JobCategory');

const JobCluster = sequelize.define(
  'JobCluster',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: JobCategory, key: 'id' },
    },
    embedding: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: 'job_clusters',
  },
);

JobCategory.hasMany(JobCluster, { foreignKey: 'categoryId', as: 'clusters', onDelete: 'CASCADE' });
JobCluster.belongsTo(JobCategory, { foreignKey: 'categoryId', as: 'category' });

module.exports = JobCluster;

