const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobImage = sequelize.define(
  'JobImage',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'job_id',
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: 'job_images',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = JobImage;
