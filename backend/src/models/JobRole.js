const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const JobCluster = require('./JobCluster');
const Tag = require('./Tag');
const JobRoleTag = require('./JobRoleTag');

const JobRole = sequelize.define(
  'JobRole',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    synonyms: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    clusterId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: JobCluster, key: 'id' },
    },
    embedding: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: 'job_roles',
  },
);

JobCluster.hasMany(JobRole, { foreignKey: 'clusterId', as: 'roles', onDelete: 'CASCADE' });
JobRole.belongsTo(JobCluster, { foreignKey: 'clusterId', as: 'cluster' });
JobRole.belongsToMany(Tag, {
  through: JobRoleTag,
  foreignKey: 'job_role_id',
  otherKey: 'tag_id',
  as: 'tags',
});
Tag.belongsToMany(JobRole, {
  through: JobRoleTag,
  foreignKey: 'tag_id',
  otherKey: 'job_role_id',
  as: 'jobRoles',
});

module.exports = JobRole;

