const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const NotificationMessage = sequelize.define(
  'NotificationMessage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    toEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    html: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    messageType: {
      type: DataTypes.ENUM('message', 'task'),
      allowNull: false,
      defaultValue: 'message',
    },
    status: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: 'unread',
    },
    isTask: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    assignee: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dueDate: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dueTime: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    submissionPopup: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    submissionEmail: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sla: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    allocatedDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    senderUserId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'notification_messages',
  },
);

const User = require('./User');
NotificationMessage.belongsTo(User, { foreignKey: 'senderUserId', as: 'sender' });

module.exports = NotificationMessage;
