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
    nameEn: DataTypes.STRING,
    legalName: DataTypes.STRING,
    aliases: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    activityStatus: { type: DataTypes.STRING, allowNull: true },
    mainField: DataTypes.STRING,
    subField: DataTypes.STRING,
    secondaryField: DataTypes.STRING,
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    techTags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    employeeCount: DataTypes.STRING,
    type: DataTypes.STRING,
    website: DataTypes.STRING,
    logo: DataTypes.STRING,
    linkedinUrl: DataTypes.STRING,
    email: DataTypes.STRING,
    address: DataTypes.STRING,
    phone: DataTypes.STRING,
    location: DataTypes.STRING,
    latitude: DataTypes.DECIMAL(10, 7),
    longitude: DataTypes.DECIMAL(10, 7),
    hqCountry: DataTypes.STRING,
    classification: DataTypes.STRING,
    relation: DataTypes.STRING,
    foundedYear: DataTypes.STRING,
    growthTrend: DataTypes.STRING,
    businessModel: DataTypes.STRING,
    productType: DataTypes.STRING,
    structure: DataTypes.STRING,
    parentCompany: DataTypes.STRING,
    subsidiaries: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    growthIndicator: DataTypes.STRING,
    dataConfidence: DataTypes.STRING,
    lastVerified: DataTypes.STRING,
    description: DataTypes.TEXT,
    comments: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    candidateCount: DataTypes.INTEGER,
  },
  {
    tableName: 'organizations',
  },
);

module.exports = Organization;

