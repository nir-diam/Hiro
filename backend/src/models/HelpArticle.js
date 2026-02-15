const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const HelpArticle = sequelize.define(
  'HelpArticle',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('folder', 'article'),
      allowNull: false,
      defaultValue: 'article',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    videoUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: 'help_articles',
  },
);

module.exports = HelpArticle;

