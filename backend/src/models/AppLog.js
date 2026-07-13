const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];

const AppLog = sequelize.define(
  'AppLog',
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
    source: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'system',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    context: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    userEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'user_email',
    },
    requestId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'request_id',
    },
    stackTrace: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'stack_trace',
    },
  },
  {
    tableName: 'app_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

AppLog.LEVELS = LOG_LEVELS;

module.exports = AppLog;
