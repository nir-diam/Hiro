const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const SmsRsvpRequest = require('./SmsRsvpRequest');

const SmsRsvpInboundLog = sequelize.define(
  'SmsRsvpInboundLog',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'received_at',
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    phoneDigits: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'phone_digits',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    keyword: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    shortCode: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'short_code',
    },
    parseResult: {
      type: DataTypes.STRING(48),
      allowNull: true,
      field: 'parse_result',
    },
    matchedRequestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'matched_request_id',
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'raw_payload',
    },
  },
  {
    tableName: 'sms_rsvp_inbound_log',
    underscored: true,
    timestamps: false,
  },
);

SmsRsvpInboundLog.belongsTo(SmsRsvpRequest, { foreignKey: 'matchedRequestId', as: 'matchedRequest' });

module.exports = SmsRsvpInboundLog;
