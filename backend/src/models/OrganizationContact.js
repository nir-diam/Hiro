const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Organization = require('./Organization');

/**
 * Contacts attached to a global organization (Admin companies DB).
 * Distinct from client_contacts (tenant CRM).
 */
const OrganizationContact = sequelize.define(
  'OrganizationContact',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'organization_id',
      references: { model: Organization, key: 'id' },
      onDelete: 'CASCADE',
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
      field: 'first_name',
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
      field: 'last_name',
    },
    /** Job title / role */
    role: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    officePhone: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
      field: 'office_phone',
    },
    mobile: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    linkedin: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    sortIndex: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_index',
    },
  },
  {
    tableName: 'organization_contacts',
    underscored: true,
  },
);

Organization.hasMany(OrganizationContact, {
  foreignKey: 'organizationId',
  as: 'organizationContacts',
  onDelete: 'CASCADE',
});
OrganizationContact.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

module.exports = OrganizationContact;
