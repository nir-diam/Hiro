const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmailUpload = sequelize.define(
  'EmailUpload',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    jobId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fileKey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bucket: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    to: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    from: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'candidates',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
  },
  {
    tableName: 'email_uploads',
  },
);

module.exports = EmailUpload;

