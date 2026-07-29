const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobHealthRule = sequelize.define(
  'JobHealthRule',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'clients', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    profileId: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'standard',
    },
    color: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'gray',
    },
    condition: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    operator: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'gt',
    },
    value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    maxValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    stage: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sortIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'job_health_rules',
    underscored: true,
    timestamps: true,
  },
);

module.exports = JobHealthRule;
