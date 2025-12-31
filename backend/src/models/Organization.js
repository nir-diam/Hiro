const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Organization = sequelize.define(
  'Organization',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    mainField: DataTypes.STRING,
    subField: DataTypes.STRING,
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    employeeCount: DataTypes.STRING,
    type: DataTypes.STRING,
    website: DataTypes.STRING,
    location: DataTypes.STRING,
    classification: DataTypes.STRING,
    relation: DataTypes.STRING,
    description: DataTypes.TEXT,
    candidateCount: DataTypes.INTEGER,
  },
  {
    tableName: 'organizations',
  },
);

module.exports = Organization;

