const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CandidateTag = sequelize.define(
  'CandidateTag',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    candidate_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    tag_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    raw_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    context: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_current: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_in_summary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    confidence_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    calculated_weight: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    final_score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    raw_type_reason: DataTypes.STRING,
    tag_reason: DataTypes.STRING,
    /**
     * Exact verbatim substring of the source CV/email text that justified this tag.
     * Populated by the LLM via the `quote` (or legacy `evidence`) field. TEXT, not STRING,
     * to accommodate long phrases up to a few hundred chars.
     */
    quote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'candidate_tags',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  },
);

module.exports = CandidateTag;

