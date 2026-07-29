const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Organization = require('./Organization');

const OrganizationLocation = sequelize.define(
  'OrganizationLocation',
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
    /** Free-text site label, e.g. סניף / מרלוג */
    description: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    /** City name (same semantics as organizations.location) */
    location: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: '',
    },
    /** Street / physical address */
    address: {
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
    tableName: 'organization_locations',
    underscored: true,
  },
);

Organization.hasMany(OrganizationLocation, {
  foreignKey: 'organizationId',
  as: 'additionalLocations',
  onDelete: 'CASCADE',
});
OrganizationLocation.belongsTo(Organization, {
  foreignKey: 'organizationId',
  as: 'organization',
});

module.exports = OrganizationLocation;
