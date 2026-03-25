const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');

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
  },
  { tableName: 'client_contacts' },
);

ClientContact.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(ClientContact, { foreignKey: 'clientId', as: 'contacts' });

module.exports = ClientContact;

