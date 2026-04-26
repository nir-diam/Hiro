const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EventType = sequelize.define(
  'EventType',
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
    name: {
      type: DataTypes.STRING(500),
      allowNull: false,
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
    forFlight: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'event_types',
    timestamps: true,
  },
);

module.exports = EventType;
