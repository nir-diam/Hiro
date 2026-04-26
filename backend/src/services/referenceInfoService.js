const ReferenceInfo = require('../models/ReferenceInfo');

const toPlain = (row) => (row ? row.get({ plain: true }) : null);

const list = async () => {
  const rows = await ReferenceInfo.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['key', 'ASC'],
    ],
  });
  return rows.map(toPlain);
};

const getById = async (id) => {
  const row = await ReferenceInfo.findByPk(id);
  if (!row) {
    const err = new Error('Reference info entry not found');
    err.status = 404;
    throw err;
  }
  return row;
};

const create = async (payload) => {
  const key = String(payload?.key || '').trim();
  if (!key) {
    const err = new Error('key is required');
    err.status = 400;
    throw err;
  }
  const existing = await ReferenceInfo.findOne({ where: { key } });
  if (existing) {
    const err = new Error('key already exists');
    err.status = 409;
    throw err;
  }
  const maxRow = await ReferenceInfo.findOne({
    attributes: ['sortOrder'],
    order: [['sortOrder', 'DESC']],
  });
  const nextOrder = (maxRow?.sortOrder ?? 0) + 1;
  const row = await ReferenceInfo.create({
    key,
    value: String(payload?.value ?? ''),
    description: String(payload?.description ?? ''),
    sortOrder:
      payload?.sortOrder !== undefined && payload?.sortOrder !== null
        ? parseInt(payload.sortOrder, 10) || 0
        : nextOrder,
  });
  return toPlain(row);
};

const update = async (id, payload) => {
  const row = await getById(id);
  const updates = {};
  if (payload?.key !== undefined) {
    const k = String(payload.key || '').trim();
    if (!k) {
      const err = new Error('key is required');
      err.status = 400;
      throw err;
    }
    if (k !== row.key) {
      const dup = await ReferenceInfo.findOne({ where: { key: k } });
      if (dup && dup.id !== row.id) {
        const err = new Error('key already exists');
        err.status = 409;
        throw err;
      }
    }
    updates.key = k;
  }
  if (payload?.value !== undefined) updates.value = String(payload.value ?? '');
  if (payload?.description !== undefined) updates.description = String(payload.description ?? '');
  if (payload?.sortOrder !== undefined && payload?.sortOrder !== null) {
    updates.sortOrder = parseInt(payload.sortOrder, 10) || 0;
  }
  await row.update(updates);
  await row.reload();
  return toPlain(row);
};

const remove = async (id) => {
  const row = await getById(id);
  await row.destroy();
  return true;
};

module.exports = { list, getById, create, update, remove };
