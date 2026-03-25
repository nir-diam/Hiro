const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('./Client');

const ClientTask = sequelize.define(
  'ClientTask',
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
    type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'sales' },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
    priority: { type: DataTypes.STRING, allowNull: false, defaultValue: 'medium' },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true, defaultValue: '' },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    assignee: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    processStage: { type: DataTypes.STRING, allowNull: true, defaultValue: '' },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  { tableName: 'client_tasks' },
);

ClientTask.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(ClientTask, { foreignKey: 'clientId', as: 'tasks' });

module.exports = ClientTask;

