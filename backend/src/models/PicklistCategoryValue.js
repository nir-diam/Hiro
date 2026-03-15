const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const PicklistCategory = require('./PicklistCategory');

const PicklistCategoryValue = sequelize.define(
  'PicklistCategoryValue',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    value: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'display_name',
    },
    color: DataTypes.STRING,
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: PicklistCategory,
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    parentCategoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: PicklistCategory,
        key: 'id',
      },
    },
    parentValueId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'picklist_category_values',
        key: 'id',
      },
    },
  },
  {
    tableName: 'picklist_category_values',
    timestamps: true,
  },
);

PicklistCategoryValue.belongsTo(PicklistCategory, { foreignKey: 'categoryId', as: 'category' });
PicklistCategory.hasMany(PicklistCategoryValue, { foreignKey: 'categoryId', as: 'values' });

module.exports = PicklistCategoryValue;

