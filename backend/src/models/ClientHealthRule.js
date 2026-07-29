const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClientHealthRule = sequelize.define(
  'ClientHealthRule',
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
    /** When set, rules apply to this linked org; when null, client-level (admin) rules. */
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    /** Client CRM pipeline these rules belong to (Sales / Retention / …). */
    pipelineId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'client_pipelines', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
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
    tableName: 'client_health_rules',
    underscored: true,
    timestamps: true,
  },
);

module.exports = ClientHealthRule;
