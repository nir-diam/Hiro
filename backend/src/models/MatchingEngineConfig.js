const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Rows are keyed by `configKey`:
//   'global'        → the one global weight/penalty config
//   'preset_<id>'   → a named preset snapshot (type = 'preset')
const MatchingEngineConfig = sequelize.define(
  'MatchingEngineConfig',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    configKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      defaultValue: 'global',
      field: 'config_key',
    },
    // 'global' | 'preset'
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'global',
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Array of client UUIDs this preset applies to (empty = all clients)
    clientIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'client_ids',
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'matching_engine_configs',
    underscored: true,
  },
);

module.exports = MatchingEngineConfig;
