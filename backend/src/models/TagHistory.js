const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TagHistory = sequelize.define(
  'TagHistory',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    tagId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'tag_id',
      references: {
        model: 'tags',
        key: 'id',
      },
    },
    action: {
      type: DataTypes.ENUM('create', 'update', 'delete'),
      allowNull: false,
      defaultValue: 'update',
    },
    actor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'system',
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: 'tag_histories',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
);

module.exports = TagHistory;

