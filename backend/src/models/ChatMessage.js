const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ChatMessage = sequelize.define(
  'ChatMessage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    chatId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'chats', key: 'id' },
    },
    role: {
      type: DataTypes.ENUM('user', 'model'),
      allowNull: false,
    },
    text: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: 'chat_messages',
  },
);

module.exports = ChatMessage;

