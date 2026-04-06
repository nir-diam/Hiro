const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Email-delivered OTP for client-scoped double auth (ClientUsageSetting.doubleAuth === 'פעיל').
 */
const LoginEmailCode = sequelize.define(
  'LoginEmailCode',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    codeHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    failCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'clients', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
  },
  {
    tableName: 'login_email_codes',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['email'] }, { fields: ['user_id'] }, { fields: ['expires_at'] }],
  },
);

module.exports = LoginEmailCode;
