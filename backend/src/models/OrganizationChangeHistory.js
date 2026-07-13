const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrganizationChangeHistory = sequelize.define(
  'OrganizationChangeHistory',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: {
        model: 'organizations',
        key: 'id',
      },
    },
    action: {
      type: DataTypes.ENUM('create', 'update', 'delete'),
      allowNull: false,
      defaultValue: 'update',
    },
    actor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'system',
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: 'organization_change_histories',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = OrganizationChangeHistory;
