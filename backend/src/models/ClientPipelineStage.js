const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClientPipelineStage = sequelize.define(
  'ClientPipelineStage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pipelineId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'client_pipelines', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: 'bg-gray-100 text-gray-700',
    },
    sortIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    slaLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'client_pipeline_stages',
    underscored: true,
    timestamps: true,
  },
);

module.exports = ClientPipelineStage;
