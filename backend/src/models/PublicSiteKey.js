const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Server-to-server keys for external job boards (hiro.co.il / humand.co.il).
 * Plaintext key is shown only at creation; only keyHash + keyPrefix are stored.
 */
const PublicSiteKey = sequelize.define(
  'PublicSiteKey',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    keyHash: { type: DataTypes.STRING(64), allowNull: false, field: 'key_hash' },
    keyPrefix: { type: DataTypes.STRING(16), allowNull: false, field: 'key_prefix' },
    /** tenant = single Client; aggregator = all orgs opted into Hiro board */
    mode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'tenant',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
      references: { model: 'clients', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    /** e.g. ["hiro","humand"] — which frontends may use this key (informational). */
    siteLabels: { type: DataTypes.JSONB, defaultValue: [], field: 'site_labels' },
    revokedAt: { type: DataTypes.DATE, allowNull: true, field: 'revoked_at' },
  },
  {
    tableName: 'public_site_keys',
    // Use DB column names (see LoginEmailCode); attribute names break addIndex on field-mapped attrs.
    indexes: [{ fields: ['key_prefix'] }, { fields: ['client_id'] }],
  },
);

module.exports = PublicSiteKey;
