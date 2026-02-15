const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobCategory = sequelize.define(
  'JobCategory',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    embedding: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: 'job_categories',
  },
);

module.exports = JobCategory;

