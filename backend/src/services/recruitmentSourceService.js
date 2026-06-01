const RecruitmentSource = require('../models/RecruitmentSource');

const toDto = (row) => ({
  id: row.id,
  clientId: row.clientId,
  sortIndex: row.sortIndex,
  name: row.name,
  addresses: row.addresses ?? '',
  exclusivityMonths: row.exclusivityMonths ?? 0,
});

const listByClientId = async (clientId) => {
  const rows = await RecruitmentSource.findAll({
    where: { clientId },
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map(toDto);
};

const dedupeByName = (rows) => {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const dto = toDto(row);
    const key = String(dto.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(dto);
  }
  return out;
};

const listOptions = async ({ clientId = null } = {}) => {
  if (clientId) return listByClientId(clientId);

  const rows = await RecruitmentSource.findAll({
    attributes: ['id', 'clientId', 'name', 'addresses', 'exclusivityMonths', 'sortIndex'],
    order: [
      ['sortIndex', 'ASC'],
      ['name', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return dedupeByName(rows);
};

const nextSortIndex = async (clientId) => {
  const max = await RecruitmentSource.max('sortIndex', { where: { clientId } });
  const n = Number(max);
  return Number.isFinite(n) ? n + 1 : 0;
};

const normalizeName = (name) => String(name ?? '').trim();

const createForClient = async (clientId, body) => {
  const name = normalizeName(body.name);
  if (!name) {
    const err = new Error('Name is required');
    err.status = 400;
    throw err;
  }
  const addresses = String(body.addresses ?? '').trim();
  const exclusivityMonths = Math.max(0, Math.round(Number(body.exclusivityMonths) || 0));
  const sortIndex = body.sortIndex != null ? Math.round(Number(body.sortIndex)) : await nextSortIndex(clientId);

  try {
    const row = await RecruitmentSource.create({
      clientId,
      name,
      addresses,
      exclusivityMonths,
      sortIndex,
    });
    return toDto(row);
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') {
      const err = new Error('A source with this name already exists');
      err.status = 409;
      throw err;
    }
    throw e;
  }
};

const updateForClient = async (clientId, sourceId, body) => {
  const row = await RecruitmentSource.findOne({ where: { id: sourceId, clientId } });
  if (!row) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (body.name !== undefined) {
    const name = normalizeName(body.name);
    if (!name) {
      const err = new Error('Name is required');
      err.status = 400;
      throw err;
    }
    patch.name = name;
  }
  if (body.addresses !== undefined) {
    patch.addresses = String(body.addresses ?? '').trim();
  }
  if (body.exclusivityMonths !== undefined) {
    patch.exclusivityMonths = Math.max(0, Math.round(Number(body.exclusivityMonths) || 0));
  }
  if (body.sortIndex !== undefined) {
    patch.sortIndex = Math.round(Number(body.sortIndex));
  }
  try {
    await row.update(patch);
    await row.reload();
    return toDto(row);
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') {
      const err = new Error('A source with this name already exists');
      err.status = 409;
      throw err;
    }
    throw e;
  }
};

const removeForClient = async (clientId, sourceId) => {
  const n = await RecruitmentSource.destroy({ where: { id: sourceId, clientId } });
  if (!n) {
    const err = new Error('Source not found');
    err.status = 404;
    throw err;
  }
  return { ok: true };
};

module.exports = {
  listByClientId,
  listOptions,
  createForClient,
  updateForClient,
  removeForClient,
};
