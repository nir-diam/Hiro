const ClientPipeline = require('../models/ClientPipeline');
const ClientPipelineStage = require('../models/ClientPipelineStage');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val.trim());
}

/** Default sales + retention pipelines (seeded when a client has none). */
const DEFAULT_PIPELINES = [
  {
    name: 'מכירות (Sales)',
    description: 'תהליך מכירה סטנדרטי מליד ועד סגירה.',
    stages: [
      { name: 'ליד חדש', color: 'bg-blue-100 text-blue-700', slaLimit: 2 },
      { name: 'פגישה', color: 'bg-purple-100 text-purple-700', slaLimit: 5 },
      { name: 'הצעת מחיר', color: 'bg-yellow-100 text-yellow-700', slaLimit: 3 },
      { name: 'משא ומתן', color: 'bg-orange-100 text-orange-700', slaLimit: 7 },
      { name: 'סגירה (זכייה)', color: 'bg-green-100 text-green-700', slaLimit: 0 },
      { name: 'אבוד', color: 'bg-gray-100 text-gray-700', slaLimit: 0 },
    ],
  },
  {
    name: 'שימור לקוחות (Retention)',
    description: 'תהליך ליווי לקוח קיים ומניעת נטישה.',
    stages: [
      { name: 'קליטה (Onboarding)', color: 'bg-indigo-100 text-indigo-700', slaLimit: 14 },
      { name: 'לקוח פעיל', color: 'bg-green-100 text-green-700', slaLimit: 90 },
      { name: 'בסיכון (At Risk)', color: 'bg-red-100 text-red-700', slaLimit: 3 },
      { name: 'חידוש חוזה', color: 'bg-cyan-100 text-cyan-700', slaLimit: 30 },
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

async function listByClientId(clientId) {
  const rows = await ClientPipeline.findAll({
    where: { clientId },
    include: [{ model: ClientPipelineStage, as: 'stages' }],
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
      [{ model: ClientPipelineStage, as: 'stages' }, 'sortIndex', 'ASC'],
    ],
  });
  return rows.map(pipelineToDto);
}

async function seedDefaults(clientId, transaction) {
  const created = [];
  for (let i = 0; i < DEFAULT_PIPELINES.length; i += 1) {
    const def = DEFAULT_PIPELINES[i];
    const pipeline = await ClientPipeline.create(
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
      await ClientPipelineStage.create(
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

/**
 * List pipelines; if client has none, seed sales+retention defaults.
 */
async function listOrSeedByClientId(clientId) {
  const { sequelize } = require('../config/db');
  return sequelize.transaction(async (transaction) => {
    let count = await ClientPipeline.count({ where: { clientId }, transaction });
    if (count === 0) {
      await seedDefaults(clientId, transaction);
    }
    const rows = await ClientPipeline.findAll({
      where: { clientId },
      include: [{ model: ClientPipelineStage, as: 'stages' }],
      order: [
        ['sortIndex', 'ASC'],
        ['createdAt', 'ASC'],
        [{ model: ClientPipelineStage, as: 'stages' }, 'sortIndex', 'ASC'],
      ],
      transaction,
    });
    return rows.map(pipelineToDto);
  });
}

/**
 * Full sync of pipelines + nested stages for a client.
 * Incoming shape: [{ id?, name, description, stages: [{ id?, name, color, order|slaLimit }] }]
 */
async function syncClientPipelines(clientId, incoming = []) {
  const { sequelize } = require('../config/db');
  const list = Array.isArray(incoming) ? incoming : [];

  return sequelize.transaction(async (transaction) => {
    const existingPipelines = await ClientPipeline.findAll({
      where: { clientId },
      include: [{ model: ClientPipelineStage, as: 'stages' }],
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
        await ClientPipeline.update(
          { name, description, sortIndex: i },
          { where: { id: pid, clientId }, transaction },
        );
        pipelineId = String(pid);
      } else {
        const created = await ClientPipeline.create(
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

        const sid = st.id;
        if (isUuid(sid) && stageById.has(String(sid))) {
          await ClientPipelineStage.update(
            { name: stName, color, sortIndex, slaLimit },
            { where: { id: sid, pipelineId }, transaction },
          );
          keptStageIds.push(String(sid));
        } else {
          const created = await ClientPipelineStage.create(
            { pipelineId, name: stName, color, sortIndex, slaLimit },
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

    const rows = await ClientPipeline.findAll({
      where: { clientId },
      include: [{ model: ClientPipelineStage, as: 'stages' }],
      order: [
        ['sortIndex', 'ASC'],
        ['createdAt', 'ASC'],
        [{ model: ClientPipelineStage, as: 'stages' }, 'sortIndex', 'ASC'],
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
  const maxSort = await ClientPipeline.max('sortIndex', { where: { clientId } });
  const sortIndex = Number.isFinite(maxSort) ? maxSort + 1 : 0;
  const row = await ClientPipeline.create({
    clientId,
    name: n,
    description: String(description || '').trim(),
    sortIndex,
  });
  return pipelineToDto({ ...row.get({ plain: true }), stages: [] });
}

module.exports = {
  listByClientId,
  listOrSeedByClientId,
  syncClientPipelines,
  createPipeline,
  DEFAULT_PIPELINES,
  isUuid,
};
