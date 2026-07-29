const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');
const Organization = require('./Organization');

const ClientContact = sequelize.define(
  'ClientContact',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Client, key: 'id' },
      onDelete: 'CASCADE',
    },
    /** When set, contact belongs to a specific linked organization (tenant org profile). */
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: Organization, key: 'id' },
      onDelete: 'SET NULL',
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    mobilePhone: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    email: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    role: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    linkedin: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    username: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    notes: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
    hasSystemAccess: { type: DataTypes.BOOLEAN, defaultValue: false },
    isInvited: { type: DataTypes.BOOLEAN, defaultValue: false },
    /** Active CRM process for this contact (pipeline id from client_pipelines). */
    pipelineId: { type: DataTypes.UUID, allowNull: true },
    /** Current stage within that pipeline. */
    processStage: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
  },
  { tableName: 'client_contacts' },
);

ClientContact.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(ClientContact, { foreignKey: 'clientId', as: 'contacts' });
ClientContact.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });
Organization.hasMany(ClientContact, { foreignKey: 'organizationId', as: 'contacts' });

module.exports = ClientContact;

