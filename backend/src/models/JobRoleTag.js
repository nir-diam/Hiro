const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const JobRoleTag = sequelize.define(
  'JobRoleTag',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    job_role_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'job_roles', key: 'id' },
    },
    tag_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'tags', key: 'id' },
    },
  },
  {
    tableName: 'job_role_tags',
    timestamps: false,
  },
);

module.exports = JobRoleTag;

