const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * A career site that reads /api/public/v1.
 * scope=aggregator sees every organization that opted into the Hiro board.
 * scope=tenant sees one Client (staffing agency or a future career site).
 */
const PublicSite = sequelize.define(
  'PublicSite',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    domain: { type: DataTypes.STRING, allowNull: false },
    scope: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'tenant',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
    },
    environment: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'production',
    },
    webhookUrl: { type: DataTypes.TEXT, allowNull: true, field: 'webhook_url' },
    webhookSecret: { type: DataTypes.TEXT, allowNull: true, field: 'webhook_secret' },
    recruitmentSourceName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'recruitment_source_name',
    },
  },
  {
    tableName: 'public_sites',
    underscored: true,
  },
);

module.exports = PublicSite;
