const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SavedSearchBlacklist = sequelize.define(
  'SavedSearchBlacklist',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    savedSearchId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'saved_search_id',
    },
    candidateEmail: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'candidate_email',
    },
    candidatePhone: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'candidate_phone',
    },
    excludedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'excluded_by',
    },
    excludedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'excluded_at',
    },
  },
  {
    tableName: 'saved_search_blacklist',
    underscored: true,
    timestamps: false,
  },
);

module.exports = SavedSearchBlacklist;
