const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClientPipeline = sequelize.define(
  'ClientPipeline',
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    sortIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    defaultContactId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    defaultAssigneeUserIds: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'client_pipelines',
    underscored: true,
    timestamps: true,
  },
);

module.exports = ClientPipeline;
