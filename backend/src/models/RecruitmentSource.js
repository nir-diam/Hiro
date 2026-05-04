const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RecruitmentSource = sequelize.define(
  'RecruitmentSource',
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
    sortIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    name: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    addresses: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    exclusivityMonths: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'recruitment_sources',
    underscored: true,
    timestamps: true,
    // Unique (client_id, name) is defined in SQL migrations only — Sequelize sync() would
    // emit quoted "clientId" and break against existing snake_case columns.
  },
);

module.exports = RecruitmentSource;
