const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Candidate = require('./Candidate');
const Job = require('./Job');
const Client = require('./Client');
const User = require('./User');

const RSVP_STATUSES = ['pending', 'answered', 'expired', 'no_response', 'delivery_failed'];
const RSVP_RESPONSES = [
  'confirmed',
  'confirmed_with_reservations',
  'declined',
  'other',
  'manual_review',
];

const SmsRsvpRequest = sequelize.define(
  'SmsRsvpRequest',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'candidate_id',
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'job_id',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
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
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
    },
    rsvpResponse: {
      type: DataTypes.STRING(48),
      allowNull: true,
      field: 'rsvp_response',
    },
    outboundMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'outbound_message',
    },
    outboundSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'outbound_sent_at',
    },
    inforuCustomerMessageId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'inforu_customer_message_id',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    answeredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'answered_at',
    },
    inboundMessageRaw: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'inbound_message_raw',
    },
    inboundKeyword: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'inbound_keyword',
    },
    reminderSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reminder_sent_at',
    },
    deliveryStatus: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'delivery_status',
    },
    deliveryStatusAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'delivery_status_at',
    },
    createdByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by_user_id',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: 'sms_rsvp_requests',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

SmsRsvpRequest.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });
SmsRsvpRequest.belongsTo(Job, { foreignKey: 'jobId', as: 'job' });
SmsRsvpRequest.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
SmsRsvpRequest.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });

module.exports = SmsRsvpRequest;
module.exports.RSVP_STATUSES = RSVP_STATUSES;
module.exports.RSVP_RESPONSES = RSVP_RESPONSES;
