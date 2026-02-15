const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PicklistCategory = sequelize.define(
  'PicklistCategory',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '',
    },
    module: {
      type: DataTypes.ENUM('candidates', 'jobs', 'clients', 'general'),
      allowNull: false,
      defaultValue: 'general',
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'picklist_categories',
        key: 'id',
      },
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'picklist_categories',
    timestamps: true,
  },
);

module.exports = PicklistCategory;

