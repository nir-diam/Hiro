const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SavedSearch = sequelize.define(
  'SavedSearch',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_public',
    },
    searchParams: {
      type: DataTypes.JSONB,
      defaultValue: {},
      field: 'search_params',
    },
    additionalFilters: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'additional_filters',
    },
    languageFilters: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'language_filters',
    },
    isAlert: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_alert',
    },
    frequency: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    notificationMethods: {
      type: DataTypes.JSONB,
      defaultValue: [],
      field: 'notification_methods',
    },
  },
  {
    tableName: 'saved_searches',
    underscored: true,
  },
);

module.exports = SavedSearch;
