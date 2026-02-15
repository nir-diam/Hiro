const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrganizationTmp = sequelize.define(
  'OrganizationTmp',
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
    mainField: DataTypes.STRING,
    subField: DataTypes.STRING,
    secondaryField: DataTypes.STRING,
    tags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    techTags: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    employeeCount: DataTypes.STRING,
    type: DataTypes.STRING,
    website: DataTypes.STRING,
    linkedinUrl: DataTypes.STRING,
    location: DataTypes.STRING,
    hqCountry: DataTypes.STRING,
    classification: DataTypes.STRING,
    relation: DataTypes.STRING,
    foundedYear: DataTypes.STRING,
    businessModel: DataTypes.STRING,
    productType: DataTypes.STRING,
    structure: DataTypes.STRING,
    parentCompany: DataTypes.STRING,
    subsidiaries: { type: DataTypes.ARRAY(DataTypes.STRING), defaultValue: [] },
    growthIndicator: DataTypes.STRING,
    dataConfidence: DataTypes.STRING,
    lastVerified: DataTypes.STRING,
    description: DataTypes.TEXT,
    candidateCount: DataTypes.INTEGER,
    isCompany: DataTypes.BOOLEAN,
    candidateId: DataTypes.UUID,
    comments: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    history: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  {
    tableName: 'organizations_tmp',
  },
);

const Candidate = require('./Candidate');
OrganizationTmp.belongsTo(Candidate, { foreignKey: 'candidateId', as: 'candidate' });

module.exports = OrganizationTmp;

