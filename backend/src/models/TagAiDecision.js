const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const TagAiDecision = sequelize.define(
  'TagAiDecision',
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    pendingTagId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'pending_tag_id',
    },
    originalTerm: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'original_term',
    },
    detectedType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'skill',
      field: 'detected_type',
    },
    contextSample: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'context_sample',
    },
    aiDecision: {
      type: DataTypes.STRING(16),
      allowNull: false,
      field: 'ai_decision',
    },
    aiSuggestedTarget: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_suggested_target',
    },
    aiReasoning: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'ai_reasoning',
    },
    candidateTagsSnapshot: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'candidate_tags_snapshot',
    },
    reviewStatus: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pending_review',
      field: 'review_status',
    },
    reviewerAction: {
      type: DataTypes.STRING(16),
      allowNull: true,
      field: 'reviewer_action',
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'resolved_at',
    },
    resolvedTargetTagId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resolved_target_tag_id',
    },
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
  },
  {
    tableName: 'tag_ai_decisions',
    underscored: true,
    timestamps: true,
  },
);

module.exports = TagAiDecision;

const Tag = require('./Tag');
TagAiDecision.belongsTo(Tag, { foreignKey: 'pending_tag_id', as: 'pendingTag' });
