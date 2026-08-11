const CandidatePipeline = require('../models/CandidatePipeline');
const CandidatePipelineStage = require('../models/CandidatePipelineStage');
const { isUuid, normalizeOutcomes } = require('./clientPipelineService');

/** Default candidate lifecycle pipelines (seeded when tenant has none). */
const DEFAULT_CANDIDATE_PIPELINES = [
  {
    name: 'קליטת מועמד חדש (Onboarding)',
    description: 'תהליך אוטומטי מרגע הגשת קורות חיים ועד חיבור לאזור האישי.',
    stages: [
      { name: '01 - התקבלו קורות חיים', color: 'bg-blue-100 text-blue-700', slaLimit: 1 },
      { name: '02 - ממתין להתחברות (נשלח מייל)', color: 'bg-yellow-100 text-yellow-700', slaLimit: 3 },
      { name: '03 - נשלחה תזכורת התחברות', color: 'bg-orange-100 text-orange-700', slaLimit: 4 },
      { name: '04 - מועמד פעיל באזור האישי', color: 'bg-green-100 text-green-700', slaLimit: 0 },
      { name: '99 - הוקפא / לא מחפש כרגע', color: 'bg-gray-100 text-gray-700', slaLimit: 0 },
    ],
  },
  {
    name: 'מעורבות והצעות עבודה (Engagement)',
    description: 'מעקב מעורבות מועמדים והצעות עבודה.',
    stages: [
      { name: '01 - מועמד זמין', color: 'bg-blue-100 text-blue-700', slaLimit: 7 },
      { name: '02 - בבחינה', color: 'bg-yellow-100 text-yellow-700', slaLimit: 5 },
      { name: '03 - הוצעה ללקוח', color: 'bg-purple-100 text-purple-700', slaLimit: 3 },
      { name: '04 - בראיונות', color: 'bg-orange-100 text-orange-700', slaLimit: 7 },
      { name: '99 - לא פעיל', color: 'bg-gray-100 text-gray-700', slaLimit: 0 },
    ],
  },
];

function stageToDto(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    name: plain.name,
    color: plain.color,
    order: plain.sortIndex + 1,
    slaLimit: plain.slaLimit,
    outcomes: normalizeOutcomes(plain.outcomes),
  };
}

function pipelineToDto(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  const stages = Array.isArray(plain.stages)
    ? [...plain.stages]
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map(stageToDto)
    : [];
  return {
    id: plain.id,
    clientId: plain.clientId,
    name: plain.name,
    description: plain.description || '',
    sortIndex: plain.sortIndex,
    stages,
  };
}

async function seedDefaults(clientId, transaction) {
  const created = [];
  for (let i = 0; i < DEFAULT_CANDIDATE_PIPELINES.length; i += 1) {
    const def = DEFAULT_CANDIDATE_PIPELINES[i];
    const pipeline = await CandidatePipeline.create(
      {
        clientId,
        name: def.name,
        description: def.description,
        sortIndex: i,
      },
      { transaction },
    );
    for (let j = 0; j < def.stages.length; j += 1) {
      const st = def.stages[j];
      await CandidatePipelineStage.create(
        {
          pipelineId: pipeline.id,
          name: st.name,
          color: st.color,
          sortIndex: j,
          slaLimit: st.slaLimit,
        },
        { transaction },
      );
    }
    created.push(pipeline.id);
  }
  return created;
}

async function listOrSeedByClientId(clientId) {
  const { sequelize } = require('../config/db');
  return sequelize.transaction(async (transaction) => {
    const count = await CandidatePipeline.count({ where: { clientId }, transaction });
    if (count === 0) {
      await seedDefaults(clientId, transaction);
    }
    const rows = await CandidatePipeline.findAll({
      where: { clientId },
      include: [{ model: CandidatePipelineStage, as: 'stages' }],
      order: [
        ['sortIndex', 'ASC'],
        ['createdAt', 'ASC'],
        [{ model: CandidatePipelineStage, as: 'stages' }, 'sortIndex', 'ASC'],
      ],
      transaction,
    });
    return rows.map(pipelineToDto);
  });
}

async function syncClientCandidatePipelines(clientId, incoming = []) {
  const { sequelize } = require('../config/db');
  const list = Array.isArray(incoming) ? incoming : [];

  return sequelize.transaction(async (transaction) => {
    const existingPipelines = await CandidatePipeline.findAll({
      where: { clientId },
      include: [{ model: CandidatePipelineStage, as: 'stages' }],
      transaction,
    });
    const pipelineById = new Map(existingPipelines.map((p) => [String(p.id), p]));
    const keptPipelineIds = [];

    for (let i = 0; i < list.length; i += 1) {
      const raw = list[i] || {};
      const name = String(raw.name || '').trim();
      if (!name) continue;
      const description = String(raw.description || '').trim();
      const stagesIn = Array.isArray(raw.stages) ? raw.stages : [];

      let pipelineId;
      const pid = raw.id;
      if (isUuid(pid) && pipelineById.has(String(pid))) {
        await CandidatePipeline.update(
          { name, description, sortIndex: i },
          { where: { id: pid, clientId }, transaction },
        );
        pipelineId = String(pid);
      } else {
        const created = await CandidatePipeline.create(
          { clientId, name, description, sortIndex: i },
          { transaction },
        );
        pipelineId = String(created.id);
      }
      keptPipelineIds.push(pipelineId);

      const existingStages = pipelineById.get(pipelineId)?.stages || [];
      const stageById = new Map(existingStages.map((s) => [String(s.id), s]));
      const keptStageIds = [];

      for (let j = 0; j < stagesIn.length; j += 1) {
        const st = stagesIn[j] || {};
        const stName = String(st.name || '').trim();
        if (!stName) continue;
        const color = String(st.color || 'bg-gray-100 text-gray-700').trim().slice(0, 120)
          || 'bg-gray-100 text-gray-700';
        const slaLimit = Math.max(0, parseInt(st.slaLimit, 10) || 0);
        const orderRaw = st.order != null ? Number(st.order) : j + 1;
        const sortIndex = Number.isFinite(orderRaw) && orderRaw > 0 ? orderRaw - 1 : j;
        const outcomes = normalizeOutcomes(st.outcomes);

        const sid = st.id;
        if (isUuid(sid) && stageById.has(String(sid))) {
          await CandidatePipelineStage.update(
            { name: stName, color, sortIndex, slaLimit, outcomes },
            { where: { id: sid, pipelineId }, transaction },
          );
          keptStageIds.push(String(sid));
        } else {
          const created = await CandidatePipelineStage.create(
            { pipelineId, name: stName, color, sortIndex, slaLimit, outcomes },
            { transaction },
          );
          keptStageIds.push(String(created.id));
        }
      }

      for (const s of existingStages) {
        if (!keptStageIds.includes(String(s.id))) {
          await s.destroy({ transaction });
        }
      }
    }

    for (const p of existingPipelines) {
      if (!keptPipelineIds.includes(String(p.id))) {
        await p.destroy({ transaction });
      }
    }

    const rows = await CandidatePipeline.findAll({
      where: { clientId },
      include: [{ model: CandidatePipelineStage, as: 'stages' }],
      order: [
        ['sortIndex', 'ASC'],
        ['createdAt', 'ASC'],
        [{ model: CandidatePipelineStage, as: 'stages' }, 'sortIndex', 'ASC'],
      ],
      transaction,
    });
    return rows.map(pipelineToDto);
  });
}

async function createPipeline(clientId, { name, description } = {}) {
  const n = String(name || '').trim();
  if (!n) {
    const err = new Error('Pipeline name is required');
    err.status = 400;
    throw err;
  }
  const maxSort = await CandidatePipeline.max('sortIndex', { where: { clientId } });
  const sortIndex = Number.isFinite(maxSort) ? maxSort + 1 : 0;
  const row = await CandidatePipeline.create({
    clientId,
    name: n,
    description: String(description || '').trim(),
    sortIndex,
  });
  return pipelineToDto({ ...row.get({ plain: true }), stages: [] });
}

module.exports = {
  listOrSeedByClientId,
  syncClientCandidatePipelines,
  createPipeline,
  DEFAULT_CANDIDATE_PIPELINES,
};
