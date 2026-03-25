const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');

const ClientContactGroup = sequelize.define(
  'ClientContactGroup',
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
    name: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: 'client_contact_groups' },
);

ClientContactGroup.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(ClientContactGroup, { foreignKey: 'clientId', as: 'contactGroups' });

module.exports = ClientContactGroup;

