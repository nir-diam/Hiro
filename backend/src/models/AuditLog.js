const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LOG_LEVELS = ['info', 'warning', 'error', 'critical'];
const LOG_ACTIONS = ['create', 'update', 'delete', 'login', 'export', 'system'];

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    level: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'info',
      validate: { isIn: [LOG_LEVELS] },
    },
    action: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'system',
      validate: { isIn: [LOG_ACTIONS] },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    userId: { type: DataTypes.UUID, allowNull: true },
    userName: { type: DataTypes.STRING(255), allowNull: true },
    userEmail: { type: DataTypes.STRING(255), allowNull: true },
    userRole: { type: DataTypes.STRING(64), allowNull: true },
    userIp: { type: DataTypes.STRING(64), allowNull: true },
    userAvatar: { type: DataTypes.STRING(8), allowNull: true },
    entityType: { type: DataTypes.STRING(64), allowNull: true },
    entityId: { type: DataTypes.STRING(128), allowNull: true },
    entityName: { type: DataTypes.STRING(255), allowNull: true },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    tableName: 'audit_logs',
    timestamps: true,
  },
);

AuditLog.LEVELS = LOG_LEVELS;
AuditLog.ACTIONS = LOG_ACTIONS;

module.exports = AuditLog;
