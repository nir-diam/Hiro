const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const SmsRsvpRequest = require('./SmsRsvpRequest');

const SmsRsvpDeliveryLog = sequelize.define(
  'SmsRsvpDeliveryLog',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'request_id',
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    phoneDigits: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'phone_digits',
    },
    deliveryStatus: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'delivery_status',
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: 'raw_payload',
    },
    receivedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'received_at',
    },
  },
  {
    tableName: 'sms_rsvp_delivery_log',
    underscored: true,
    timestamps: false,
  },
);

SmsRsvpDeliveryLog.belongsTo(SmsRsvpRequest, { foreignKey: 'requestId', as: 'request' });

module.exports = SmsRsvpDeliveryLog;
