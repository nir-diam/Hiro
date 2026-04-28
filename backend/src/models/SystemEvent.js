const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SystemEvent = sequelize.define(
  'SystemEvent',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    triggerName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    eventName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    contentTemplate: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    forCandidate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    forJob: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    forClient: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    textColor: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '#000000',
    },
    bgColor: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: '#ffffff',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'system_events',
    timestamps: true,
  },
);

module.exports = SystemEvent;
