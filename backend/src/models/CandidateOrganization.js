const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CandidateOrganization = sequelize.define(
  'CandidateOrganization',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    relationType: {
      // e.g. 'employer', 'client', etc. (optional metadata)
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: 'candidate_organizations',
    timestamps: false,
  },
);

module.exports = CandidateOrganization;

