const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PublicSiteWebhookDelivery = sequelize.define(
  'PublicSiteWebhookDelivery',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    siteId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'site_id',
    },
    event: { type: DataTypes.STRING(64), allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastError: { type: DataTypes.TEXT, allowNull: true, field: 'last_error' },
  },
  {
    tableName: 'public_site_webhook_deliveries',
    underscored: true,
  },
);

module.exports = PublicSiteWebhookDelivery;
