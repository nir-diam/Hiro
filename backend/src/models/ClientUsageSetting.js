const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ClientUsageSetting = sequelize.define(
  'ClientUsageSetting',
  {
    clientId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      references: { model: 'clients', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    doubleAuth: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'לא פעיל',
    },
    googleLogin: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'פעיל',
    },
    initialScreeningLevel: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'טלפוני',
    },
    returnMonths: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    questionnaireSource: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: 'חברה',
    },
    autoDisconnect: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    logoOnCv: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    candidateNoLocationToFix: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    candidateNoTagToFix: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    showCvPreview: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    jobAlerts: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    autoThanksEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    oneCandidatePerEmail: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    billingStatusParent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    billingStatusAccepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: 'client_usage_settings',
    underscored: true,
    timestamps: true,
  },
);

module.exports = ClientUsageSetting;
