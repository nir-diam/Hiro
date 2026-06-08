const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TagCorrectionPlatformSettings = sequelize.define(
  'TagCorrectionPlatformSettings',
  {
    id: {
      type: DataTypes.SMALLINT,
      primaryKey: true,
      defaultValue: 1,
    },
    agentEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'agent_enabled',
    },
  },
  {
    tableName: 'tag_correction_platform_settings',
    underscored: true,
    timestamps: true,
  },
);

module.exports = TagCorrectionPlatformSettings;
