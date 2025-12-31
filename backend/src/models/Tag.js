const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Tag = sequelize.define(
  'Tag',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    tagKey: { type: DataTypes.STRING, allowNull: false, unique: true },
    displayNameHe: DataTypes.STRING,
    displayNameEn: DataTypes.STRING,
    type: {
      type: DataTypes.ENUM('role', 'skill', 'industry', 'tool', 'certification', 'language', 'seniority', 'domain'),
      defaultValue: 'role',
    },
    category: DataTypes.STRING,
    descriptionHe: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('active', 'draft', 'deprecated', 'archived'),
      defaultValue: 'active',
    },
    qualityState: {
      type: DataTypes.ENUM('verified', 'needs_review', 'experimental'),
      defaultValue: 'verified',
    },
    source: {
      type: DataTypes.ENUM('system', 'admin', 'user', 'ai'),
      defaultValue: 'admin',
    },
    matchable: { type: DataTypes.BOOLEAN, defaultValue: true },
    synonyms: { type: DataTypes.JSONB, defaultValue: [] },
    domains: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    usageCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastUsed: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: 'tags',
  },
);

module.exports = Tag;

