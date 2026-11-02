const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const CandidatePipeline = require('../models/CandidatePipeline');
const CandidatePipelineStage = require('../models/CandidatePipelineStage');

if (!CandidatePipeline.associations.stages) {
  CandidatePipeline.hasMany(CandidatePipelineStage, {
    foreignKey: 'pipelineId',
    as: 'stages',
    onDelete: 'CASCADE',
  });
}

const NEW_LINK_STATUS = 'חדש';

function trimName(v) {
  return v != null ? String(v).trim() : '';
}

function sortedStages(pipeline) {
  return [...(pipeline?.stages || [])].sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
}

/** Map a job-link status onto a pipeline stage. "חדש" falls through to stage 01 when allowed. */
function resolveKanbanStageForStatus(status, stages, { allowNewAsFirst = false } = {}) {
  const name = trimName(status);
  const list = Array.isArray(stages) ? stages : [];
  if (!list.length) return null;
  if (name) {
    const exact = list.find((s) => trimName(s.name) === name);
    if (exact) return exact;
  }
  if (allowNewAsFirst && (!name || name === NEW_LINK_STATUS)) return list[0] || null;
  return null;
}

function toBoardRow(candidatePlain, stage, pipelineId, jobMeta = null) {
  const row = candidatePlain && typeof candidatePlain === 'object' ? { ...candidatePlain } : {};
  row.candidatePipelineId = pipelineId;
  row.pipelineStageId = stage?.id != null ? String(stage.id) : null;
  if (jobMeta?.jobCandidateId) {
    row.kanbanJobCandidateId = String(jobMeta.jobCandidateId);
    row.kanbanJobId = jobMeta.jobId != null ? String(jobMeta.jobId) : null;
    row.kanbanJobTitle = trimName(jobMeta.jobTitle) || null;
    row.kanbanJobCompany = trimName(jobMeta.jobCompany) || null;
  }
  return row;
}

async function loadPipeline(pipelineId) {
  const pid = trimName(pipelineId);
  if (!pid) {
    const err = new Error('pipelineId is required');
    err.status = 400;
    throw err;
  }
  const pipeline = await CandidatePipeline.findByPk(pid, {
    include: [{ model: CandidatePipelineStage, as: 'stages' }],
  });
  if (!pipeline) {
    const err = new Error('Pipeline not found');
    err.status = 404;
    throw err;
  }
  return pipeline;
}

/**
 * Board cards for a candidate pipeline: one card per job process whose status
 * matches a stage name, plus lifecycle-only people who have no such job card.
 */
async function listKanbanBoard({ pipelineId, search = '', limit = 400, stageIds = null } = {}) {
  const pipeline = await loadPipeline(pipelineId);
  const pid = String(pipeline.id);
  const clientId = trimName(pipeline.clientId);
  const allStages = sortedStages(pipeline);
  const filterIds = Array.isArray(stageIds)
    ? new Set(stageIds.map((id) => String(id || '').trim()).filter(Boolean))
    : null;
  const stages = filterIds?.size
    ? allStages.filter((s) => filterIds.has(String(s.id)))
    : allStages;
  const stageNames = stages.map((s) => trimName(s.name)).filter(Boolean);
  const pipelineFirstStage = allStages[0] || null;
  const firstStage = stages[0] || pipelineFirstStage;
  const term = trimName(search);
  const safeLimit = Math.min(Math.max(1, Number(limit) || 400), 800);

  const stageByName = new Map(stages.map((s) => [trimName(s.name), s]));
  const out = [];
  const jobCardCandidateIds = new Set();

  if (stageNames.length) {
    const replacements = {
      stageNames,
      clientId: clientId || null,
      limit: safeLimit,
    };
    let searchSql = '';
    if (term) {
      replacements.q = `%${term}%`;
      searchSql = `
        AND (
          c."fullName" ILIKE :q
          OR COALESCE(c.title, '') ILIKE :q
          OR COALESCE(j.title, '') ILIKE :q
          OR COALESCE(j.client, '') ILIKE :q
        )`;
    }
    const newAsFirstSql = clientId
      ? `OR (jc.status = :newStatus AND j.client_id IS NOT NULL AND j.client_id::text = :clientId)`
      : '';
    if (clientId) replacements.newStatus = NEW_LINK_STATUS;

    const rows = await sequelize.query(
      `
      SELECT
        c.id,
        c."fullName",
        c.title,
        c."internalTags",
        c."approveByCandidate",
        c."consentToJobOffers",
        c."candidatePipelineId",
        c."pipelineStageId",
        c."candidatePipelineProcesses",
        c."updatedAt",
        jc.id AS "kanbanJobCandidateId",
        jc.status AS "kanbanJobStatus",
        j.id AS "kanbanJobId",
        j.title AS "kanbanJobTitle",
        j.client AS "kanbanJobCompany",
        j.client_id AS "kanbanJobClientId"
      FROM job_candidates jc
      INNER JOIN candidates c ON c.id = jc."candidateId"
      LEFT JOIN jobs j ON j.id = jc."jobId"
      WHERE c."isDeleted" = false
        AND c."canonicalCandidateId" IS NULL
        AND COALESCE(c."ingestPending", false) = false
        AND (
          jc.status IN (:stageNames)
          ${newAsFirstSql}
        )
        ${searchSql}
      ORDER BY jc."updatedAt" DESC NULLS LAST
      LIMIT :limit
      `,
      { replacements, type: QueryTypes.SELECT },
    );

    for (const row of rows) {
      const status = trimName(row.kanbanJobStatus);
      const allowNewAsFirst =
        status === NEW_LINK_STATUS &&
        Boolean(clientId) &&
        row.kanbanJobClientId != null &&
        String(row.kanbanJobClientId) === clientId &&
        Boolean(pipelineFirstStage) &&
        stages.some((s) => String(s.id) === String(pipelineFirstStage.id));
      const stage = resolveKanbanStageForStatus(status, stages, { allowNewAsFirst });
      if (!stage) continue;
      jobCardCandidateIds.add(String(row.id));
      out.push(
        toBoardRow(
          {
            id: row.id,
            fullName: row.fullName,
            title: row.title,
            internalTags: row.internalTags,
            approveByCandidate: row.approveByCandidate,
            consentToJobOffers: row.consentToJobOffers,
            candidatePipelineProcesses: row.candidatePipelineProcesses,
            updatedAt: row.updatedAt,
          },
          stage,
          pid,
          {
            jobCandidateId: row.kanbanJobCandidateId,
            jobId: row.kanbanJobId,
            jobTitle: row.kanbanJobTitle,
            jobCompany: row.kanbanJobCompany,
          },
        ),
      );
    }
  }

  const remaining = Math.max(0, safeLimit - out.length);
  if (remaining > 0 && firstStage) {
    const whereSql = `
      c."isDeleted" = false
      AND c."canonicalCandidateId" IS NULL
      AND COALESCE(c."ingestPending", false) = false
      AND (
        c."candidatePipelineId"::text = :pid
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c."candidatePipelineProcesses", '[]'::jsonb)) AS proc
          WHERE proc->>'pipelineId' = :pid
            AND COALESCE(proc->>'isActive', 'true') <> 'false'
        )
      )
    `;
    const replacements = { pid, limit: remaining };
    let searchSql = '';
    if (term) {
      replacements.q = `%${term}%`;
      searchSql = `AND (c."fullName" ILIKE :q OR COALESCE(c.title, '') ILIKE :q)`;
    }
    const lifeRows = await sequelize.query(
      `
      SELECT
        c.id,
        c."fullName",
        c.title,
        c."internalTags",
        c."approveByCandidate",
        c."consentToJobOffers",
        c."candidatePipelineId",
        c."pipelineStageId",
        c."candidatePipelineProcesses",
        c."updatedAt"
      FROM candidates c
      WHERE ${whereSql}
        ${searchSql}
      ORDER BY c."updatedAt" DESC NULLS LAST
      LIMIT :limit
      `,
      { replacements, type: QueryTypes.SELECT },
    );

    const stageById = new Map(allStages.map((s) => [String(s.id), s]));
    for (const row of lifeRows) {
      if (jobCardCandidateIds.has(String(row.id))) continue;
      let stage = row.pipelineStageId ? stageById.get(String(row.pipelineStageId)) : null;
      if (!stage && Array.isArray(row.candidatePipelineProcesses)) {
        const proc = row.candidatePipelineProcesses.find(
          (p) => p && p.isActive !== false && String(p.pipelineId || '') === pid,
        );
        if (proc?.stageId) stage = stageById.get(String(proc.stageId));
      }
      if (!stage) stage = firstStage;
      if (filterIds?.size && !filterIds.has(String(stage.id))) continue;
      out.push(toBoardRow(row, stage, pid, null));
    }
  }

  return out;
}

module.exports = {
  NEW_LINK_STATUS,
  resolveKanbanStageForStatus,
  listKanbanBoard,
};
