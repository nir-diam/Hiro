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
    tagKey: { type: DataTypes.STRING, allowNull: false },
    displayNameHe: DataTypes.STRING,
    displayNameEn: DataTypes.STRING,
    type: {
      type: DataTypes.ENUM(
        'role',
        'skill',
        'industry',
        'tool',
        'certification',
        'language',
        'seniority',
        'degree',
        'soft_skill'
      ),
      defaultValue: 'role',
    },
    category: DataTypes.STRING,
    descriptionHe: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('active', 'draft', 'deprecated', 'archived', 'pending'),
      defaultValue: 'active',
    },
    qualityState: {
      type: DataTypes.ENUM('verified', 'needs_review', 'experimental', 'initial_detection'),
      defaultValue: 'initial_detection',
    },
    source: {
      type: DataTypes.ENUM('system', 'admin', 'user', 'ai', 'manual','job'),
      defaultValue: 'manual',
    },
    internalNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'internal_note',
    },
    matchable: { type: DataTypes.BOOLEAN, defaultValue: true },
    synonyms: { type: DataTypes.JSONB, defaultValue: [] },
    aliases: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    domains: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    usageCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    embedding: { type: DataTypes.JSONB, allowNull: true },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at',
    },
    createdBy: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'created_by',
    },
    updatedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'updated_by',
    },
  },
  {
    tableName: 'tags',
    timestamps: true,
    underscored: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = Tag;

