const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RecruitmentStatus = sequelize.define(
  'RecruitmentStatus',
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
    statusGroup: {
      type: DataTypes.STRING(120),
      allowNull: false,
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
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'recruitment_statuses',
    underscored: true,
    timestamps: true,
  },
);

module.exports = RecruitmentStatus;
