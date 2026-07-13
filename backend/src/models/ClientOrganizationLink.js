const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');
const Organization = require('./Organization');
const OrganizationTmp = require('./OrganizationTmp');

const ClientOrganizationLink = sequelize.define(
  'ClientOrganizationLink',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'client_id',
      references: { model: Client, key: 'id' },
      onDelete: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      references: { model: Organization, key: 'id' },
      onDelete: 'CASCADE',
    },
    organizationTmpId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_tmp_id',
      references: { model: OrganizationTmp, key: 'id' },
      onDelete: 'CASCADE',
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary',
    },
  },
  {
    tableName: 'client_organization_links',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

ClientOrganizationLink.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
ClientOrganizationLink.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
ClientOrganizationLink.belongsTo(OrganizationTmp, { foreignKey: 'organizationTmpId', as: 'organizationTmp' });
Client.hasMany(ClientOrganizationLink, { foreignKey: 'clientId', as: 'organizationLinks' });

module.exports = ClientOrganizationLink;
