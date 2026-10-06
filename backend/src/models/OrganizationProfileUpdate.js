const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrganizationProfileUpdate = sequelize.define(
  'OrganizationProfileUpdate',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'clientId',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organizationId',
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pending',
    },
    previousFields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'previousFields',
    },
    proposedFields: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'proposedFields',
    },
    submittedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'submittedByUserId',
    },
    submittedByName: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'submittedByName',
    },
    reviewedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewedByUserId',
    },
    reviewedByName: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reviewedByName',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewedAt',
    },
    reviewNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'reviewNote',
    },
  },
  {
    tableName: 'organization_profile_updates',
    underscored: false,
  },
);

module.exports = OrganizationProfileUpdate;
