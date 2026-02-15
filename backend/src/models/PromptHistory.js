const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PromptHistory = sequelize.define(
  'PromptHistory',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    promptId: { type: DataTypes.STRING, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    template: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    model: { type: DataTypes.STRING, allowNull: false, defaultValue: 'gemini-3-flash-preview' },
    temperature: { type: DataTypes.FLOAT, defaultValue: 0.5 },
    variables: { type: DataTypes.JSONB, defaultValue: [] },
    category: {
      type: DataTypes.ENUM('candidates', 'jobs', 'companies', 'communications', 'analysis', 'chatbots', 'other'),
      defaultValue: 'other',
    },
    action: {
      type: DataTypes.ENUM('create', 'update'),
      allowNull: false,
    },
    comments: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  },
  {
    tableName: 'prompts_history',
  },
);

module.exports = PromptHistory;

