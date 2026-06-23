const { Op } = require('sequelize');
const OrganizationAiDecision = require('../models/OrganizationAiDecision');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const Candidate = require('../models/Candidate');

/**
 * GET /api/organizations/ai-decisions
 * List decisions with optional filtering.
 */
const list = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      decision,
      date,
      sortOrder = 'desc',
      reviewStatus,
    } = req.query;

    const where = {};

    if (decision && decision !== 'all') {
      where.aiDecision = decision;
    }

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { [Op.between]: [start, end] };
    }

    if (reviewStatus && reviewStatus !== 'all') {
      where.reviewStatus = reviewStatus;
    }

    const offset = (Number(page) - 1) * Number(limit);
    const order = [['created_at', sortOrder === 'asc' ? 'ASC' : 'DESC']];

    const { count, rows } = await OrganizationAiDecision.findAndCountAll({
      where,
      order,
      limit: Number(limit),
      offset,
      include: [
        {
          model: Candidate,
          as: 'candidate',
          attributes: ['id', 'firstName', 'lastName', 'fullName'],
          required: false,
        },
        {
          model: Organization,
          as: 'suggestedOrg',
          attributes: ['id', 'name', 'nameEn'],
          required: false,
        },
        {
          model: OrganizationTmp,
          as: 'organizationTmp',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
    });

    const data = rows.map((row) => {
      const r = row.toJSON();
      const cand = r.candidate;
      return {
        id: r.id,
        originalTerm: r.originalTerm,
        candidateId: r.candidateId,
        candidateName: cand
          ? cand.fullName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || null
          : null,
        actionDate: r.createdAt,
        context: r.context || 'resume',
        aiDecision: r.aiDecision,
        aiSuggestedTarget: r.aiSuggestedTarget,
        aiSuggestedTargetId: r.aiSuggestedTargetId,
        aiReasoning: r.aiReasoning,
        hesitationLevel: r.hesitationLevel,
        dilemmaReasoning: r.dilemmaReasoning,
        similarEntities: r.similarEntities || [],
        reviewStatus: r.reviewStatus,
        reviewerAction: r.reviewerAction,
        resolvedAt: r.resolvedAt,
        organizationTmpId: r.organizationTmpId,
      };
    });

    return res.json({
      data,
      total: count,
      page: Number(page),
      totalPages: Math.ceil(count / Number(limit)),
    });
  } catch (err) {
    console.error('[orgAiDecision] list error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/organizations/ai-decisions/:id/resolve
 * Update the review status / reviewer action for one decision.
 */
const resolve = async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewerAction, reviewStatus, aiDecision, aiSuggestedTarget, aiSuggestedTargetId } = req.body;

    const decision = await OrganizationAiDecision.findByPk(id);
    if (!decision) return res.status(404).json({ message: 'Decision not found' });

    const updates = {};
    if (reviewerAction !== undefined) updates.reviewerAction = reviewerAction;
    if (reviewStatus !== undefined) updates.reviewStatus = reviewStatus;
    if (aiDecision !== undefined) updates.aiDecision = aiDecision;
    if (aiSuggestedTarget !== undefined) updates.aiSuggestedTarget = aiSuggestedTarget;
    if (aiSuggestedTargetId !== undefined) updates.aiSuggestedTargetId = aiSuggestedTargetId;

    if (reviewStatus && reviewStatus !== 'pending_review') {
      updates.resolvedAt = new Date();
    }

    // When escalating to manual review, ensure an OrganizationTmp staging record exists
    if (reviewStatus === 'manual' && !decision.organizationTmpId) {
      const tmpOrg = await OrganizationTmp.create({
        name: decision.originalTerm,
        candidateId: decision.candidateId || null,
        isCompany: true,
      });
      updates.organizationTmpId = tmpOrg.id;
    }

    // When confirming a merge/generic: add alias to target org + mark source org as merged
    let aliasResult = null;
    const targetId = (aiSuggestedTargetId !== undefined ? aiSuggestedTargetId : null)
      ?? decision.aiSuggestedTargetId;
    const mergeDecision = aiDecision !== undefined ? aiDecision : decision.aiDecision;

    if ((mergeDecision === 'merge_company' || mergeDecision === 'map_generic') && targetId) {
      const targetOrg = await Organization.findByPk(targetId);
      if (!targetOrg) {
        console.warn(`[orgAiDecision] merge: org not found with id "${targetId}" — alias NOT added`);
        aliasResult = { ok: false, reason: 'org_not_found', targetId };
      } else {
        const term = decision.originalTerm?.trim();
        const existing = Array.isArray(targetOrg.aliases) ? targetOrg.aliases : [];
        if (!term) {
          aliasResult = { ok: false, reason: 'empty_term' };
        } else if (existing.some((a) => a.toLowerCase() === term.toLowerCase())) {
          aliasResult = { ok: false, reason: 'already_exists', term, existing };
        } else {
          const newAliases = [...existing, term];
          await targetOrg.update({ aliases: newAliases });
          console.log(`[orgAiDecision] alias "${term}" added to org "${targetOrg.name}" (${targetId})`);
          aliasResult = { ok: true, term, orgName: targetOrg.name, newAliases };
        }

        // Remove this term from any OTHER org's aliases where it may have been previously stored
          const { Op } = require('sequelize');
        const termLower = (term || '').toLowerCase();
        if (termLower) {
          const orgsWithAlias = await Organization.findAll({
            where: {
              id: { [Op.ne]: targetId },
              aliases: { [Op.ne]: null },
            },
            attributes: ['id', 'name', 'aliases'],
            raw: true,
          });
          for (const row of orgsWithAlias) {
            const aliases = Array.isArray(row.aliases) ? row.aliases : [];
            if (aliases.some((a) => a.toLowerCase() === termLower)) {
              const cleaned = aliases.filter((a) => a.toLowerCase() !== termLower);
              await Organization.update({ aliases: cleaned }, { where: { id: row.id } });
              console.log(`[orgAiDecision] removed alias "${term}" from org "${row.name}" (${row.id})`);
            }
          }
        }

        // Mark the source organization as merged so it hides from the companies list
        const sourceOrg = await Organization.findOne({
          where: { name: { [Op.iLike]: term || '' } },
        });
        if (sourceOrg && sourceOrg.id !== targetId) {
          await sourceOrg.update({ activityStatus: 'merged' });
          console.log(`[orgAiDecision] marked source org "${sourceOrg.name}" (${sourceOrg.id}) as merged → ${targetId}`);
          if (aliasResult) aliasResult.sourceMerged = { id: sourceOrg.id, name: sourceOrg.name };
        }
      }
    }

    await decision.update(updates);
    return res.json({
      success: true,
      id: decision.id,
      reviewStatus: decision.reviewStatus,
      organizationTmpId: decision.organizationTmpId,
      aliasResult,
    });
  } catch (err) {
    console.error('[orgAiDecision] resolve error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/organizations/ai-decisions/bulk-resolve
 * Bulk update multiple decisions.
 */
const bulkResolve = async (req, res) => {
  try {
    const { ids, reviewerAction, reviewStatus } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids array required' });
    }

    const updates = {};
    if (reviewerAction !== undefined) updates.reviewerAction = reviewerAction;
    if (reviewStatus !== undefined) {
      updates.reviewStatus = reviewStatus;
      if (reviewStatus !== 'pending_review') updates.resolvedAt = new Date();
    }

    await OrganizationAiDecision.update(updates, { where: { id: ids } });
    return res.json({ success: true, resolvedIds: ids });
  } catch (err) {
    console.error('[orgAiDecision] bulkResolve error:', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/organizations/ai-decisions/stats
 * Aggregate statistics for the agent operations dashboard.
 */
const stats = async (req, res) => {
  try {
    const sequelize = OrganizationAiDecision.sequelize;

    const [total, byDecisionRows, byStatusRows, hesitationRows, todayRows, recentRows] =
      await Promise.all([
        OrganizationAiDecision.count(),
        OrganizationAiDecision.findAll({
          attributes: [
            'aiDecision',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          ],
          group: ['aiDecision'],
          raw: true,
        }),
        OrganizationAiDecision.findAll({
          attributes: [
            'reviewStatus',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          ],
          group: ['reviewStatus'],
          raw: true,
        }),
        sequelize.query(
          `SELECT
            COALESCE(SUM(CASE WHEN hesitation_level < 30 THEN 1 ELSE 0 END), 0)                          AS vodai,
            COALESCE(SUM(CASE WHEN hesitation_level >= 30 AND hesitation_level < 60 THEN 1 ELSE 0 END), 0) AS binoni,
            COALESCE(SUM(CASE WHEN hesitation_level >= 60 OR hesitation_level IS NULL THEN 1 ELSE 0 END), 0) AS namuch
           FROM organization_ai_decisions`,
          { type: sequelize.QueryTypes.SELECT },
        ),
        sequelize.query(
          `SELECT COUNT(*)::int AS count FROM organization_ai_decisions WHERE created_at::date = CURRENT_DATE`,
          { type: sequelize.QueryTypes.SELECT },
        ),
        OrganizationAiDecision.findAll({
          attributes: ['id', 'originalTerm', 'aiDecision', 'hesitationLevel', 'reviewStatus', 'createdAt'],
          order: [['createdAt', 'DESC']],
          limit: 10,
          raw: true,
        }),
      ]);

    const byDecision = Object.fromEntries(
      byDecisionRows.map((r) => [r.aiDecision, parseInt(r.count, 10)]),
    );
    const byStatus = Object.fromEntries(
      byStatusRows.map((r) => [r.reviewStatus, parseInt(r.count, 10)]),
    );

    return res.json({
      total,
      todayCount: todayRows[0]?.count ?? 0,
      byDecision: {
        create_company: byDecision.create_company || 0,
        merge_company: byDecision.merge_company || 0,
        map_generic: byDecision.map_generic || 0,
      },
      byStatus: {
        pending_review: byStatus.pending_review || 0,
        approved: byStatus.approved || 0,
        manual: byStatus.manual || 0,
        changed: byStatus.changed || 0,
      },
      byHesitation: {
        vodai: parseInt(hesitationRows[0]?.vodai || '0', 10),
        binoni: parseInt(hesitationRows[0]?.binoni || '0', 10),
        namuch: parseInt(hesitationRows[0]?.namuch || '0', 10),
      },
      recentActivity: recentRows.map((r) => ({
        id: r.id,
        originalTerm: r.originalTerm,
        aiDecision: r.aiDecision,
        hesitationLevel: r.hesitationLevel,
        reviewStatus: r.reviewStatus,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('[orgAiDecision] stats error:', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { list, resolve, bulkResolve, stats };
