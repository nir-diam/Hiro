const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/** Per-scope on/off for job health evaluation. */
const JobHealthSetting = sequelize.define(
  'JobHealthSetting',
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'job_health_settings',
    underscored: true,
    timestamps: true,
  },
);

module.exports = JobHealthSetting;
