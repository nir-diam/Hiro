const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    name: DataTypes.STRING,
    role: {
      type: DataTypes.ENUM('admin', 'recruiter', 'coordinator', 'manager', 'guest', 'candidate'),
      defaultValue: 'recruiter',
    },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    phone: DataTypes.STRING,
    extension: DataTypes.STRING,
    dataScope: {
      type: DataTypes.JSONB,
      defaultValue: { candidates: 'own', jobs: 'own' },
    },
    permissions: {
      // Map of permission key -> boolean
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    tableName: 'users',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
    },
  },
);

module.exports = User;

