const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CvForwardDelivery = sequelize.define(
  'CvForwardDelivery',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'jobId',
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'candidateId',
    },
    recipientEmail: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'recipientEmail',
    },
    recipientType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'external',
      field: 'recipientType',
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'attemptCount',
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'lastError',
    },
    idempotencyKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
      field: 'idempotencyKey',
    },
    subject: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    intakeChannel: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'intakeChannel',
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sentAt',
    },
  },
  {
    tableName: 'cv_forward_deliveries',
    indexes: [
      { fields: ['jobId', 'candidateId'] },
      { fields: ['status'] },
      { unique: true, fields: ['idempotencyKey'] },
    ],
  },
);

module.exports = CvForwardDelivery;
