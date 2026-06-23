const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const OrganizationAiDecision = sequelize.define(
  'OrganizationAiDecision',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    originalTerm: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'original_term',
    },
    candidateId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'candidate_id',
    },
    organizationTmpId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_tmp_id',
    },
    /** 'create_company' | 'merge_company' | 'map_generic' | 'manual_review' */
    aiDecision: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'ai_decision',
    },
    aiSuggestedTarget: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_suggested_target',
    },
    aiSuggestedTargetId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'ai_suggested_target_id',
    },
    aiReasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_reasoning',
    },
    /** 0–100, higher = more uncertain */
    hesitationLevel: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'hesitation_level',
    },
    dilemmaReasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'dilemma_reasoning',
    },
    /** Array of {name: string, similarity: number} */
    similarEntities: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'similar_entities',
    },
    /** 'pending_review' | 'approved' | 'changed' | 'manual' */
    reviewStatus: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pending_review',
      field: 'review_status',
    },
    reviewerAction: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: 'reviewer_action',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    /** 'resume' | 'email' | 'manual' */
    context: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: 'resume',
    },
  },
  {
    tableName: 'organization_ai_decisions',
    underscored: true,
    timestamps: true,
  },
);

const Candidate = require('./Candidate');
const Organization = require('./Organization');
const OrganizationTmp = require('./OrganizationTmp');

OrganizationAiDecision.belongsTo(Candidate, { foreignKey: 'candidate_id', as: 'candidate' });
OrganizationAiDecision.belongsTo(Organization, { foreignKey: 'ai_suggested_target_id', as: 'suggestedOrg' });
OrganizationAiDecision.belongsTo(OrganizationTmp, { foreignKey: 'organization_tmp_id', as: 'organizationTmp' });

module.exports = OrganizationAiDecision;
