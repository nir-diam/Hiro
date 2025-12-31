const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MessageLog = sequelize.define(
  'MessageLog',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    direction: { type: DataTypes.ENUM('inbound', 'outbound'), allowNull: false },
    channel: { type: DataTypes.ENUM('whatsapp', 'sms', 'email'), allowNull: false },
    recipient_name: { type: DataTypes.STRING, allowNull: false },
    recipient_phone: DataTypes.STRING,
    recipient_email: DataTypes.STRING,
    status: { type: DataTypes.ENUM('sent', 'failed'), defaultValue: 'sent' },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    agent_name: { type: DataTypes.STRING, allowNull: false },
    jobId: { type: DataTypes.UUID },
    candidateId: { type: DataTypes.UUID },
    content: DataTypes.TEXT,
    errorMessage: DataTypes.TEXT,
  },
  {
    tableName: 'message_logs',
  },
);

module.exports = MessageLog;

