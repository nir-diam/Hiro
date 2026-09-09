const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const MessageTemplate = sequelize.define(
  'MessageTemplate',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    scope: {
      type: DataTypes.ENUM('admin', 'client'),
      allowNull: false,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'clients', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    /** Stable key for code / sends, e.g. cv_arrival_approval */
    templateKey: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    subject: { type: DataTypes.STRING(500), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    channels: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['email'],
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    updatedByUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    updatedByName: { type: DataTypes.STRING, allowNull: true },
    attachmentUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true,
      field: 'attachment_url',
    },
    attachmentFileName: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: 'attachment_file_name',
    },
    attachmentContentType: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: 'attachment_content_type',
    },
    attachmentFileSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'attachment_file_size',
    },
    forCandidate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'for_candidate',
    },
    forClientContact: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'for_client_contact',
    },
    forTeamMember: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'for_team_member',
    },
  },
  {
    tableName: 'message_templates',
    underscored: true,
    // Do not declare indexes here: Sequelize emits ("scope","clientId") for composite indexes
    // even with underscored:true, which breaks DBs created with snake_case (client_id).
    // Indexes live in migrations/create_message_templates.sql (idx / ux_*).
  },
);

module.exports = MessageTemplate;
