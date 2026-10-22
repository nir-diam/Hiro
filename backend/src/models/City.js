const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const City = sequelize.define(
  'City',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    cityName: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'city_name',
    },
    pointX: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'point_x',
    },
    pointY: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: 'point_y',
    },
    city: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    pointx: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    pointy: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    column4: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    publicSlug: {
      type: DataTypes.STRING(120),
      allowNull: true,
      field: 'public_slug',
    },
    slugAliases: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'slug_aliases',
    },
  },
  {
    tableName: 'cities',
    timestamps: false,
  },
);

module.exports = City;
