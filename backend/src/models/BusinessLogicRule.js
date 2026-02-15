const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const BusinessLogicRule = sequelize.define(
  'BusinessLogicRule',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ruleId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    context: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Candidate',
    },
    trigger: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'On Change',
    },
    conditions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    actions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    devStatus: {
      type: DataTypes.ENUM('pending', 'in_progress', 'testing', 'deployed'),
      defaultValue: 'pending',
    },
  },
  {
    tableName: 'business_logic_rules',
  },
);

module.exports = BusinessLogicRule;

