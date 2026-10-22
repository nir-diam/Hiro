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
    /** Stable public slug. Locked after the first publish; a Hebrew rename does not change it. */
    publicSlug: { type: DataTypes.STRING(120), allowNull: true },
    slugAliases: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    slugLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    embedding: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: 'job_categories',
  },
);

module.exports = JobCategory;

