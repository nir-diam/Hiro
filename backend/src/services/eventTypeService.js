const EventType = require('../models/EventType');

const list = async () => {
  const rows = await EventType.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map((r) => r.get({ plain: true }));
};

const getById = async (id) => {
  const row = await EventType.findByPk(id);
  if (!row) {
    const err = new Error('Event type not found');
    err.status = 404;
    throw err;
  }
  return row;
};

const create = async (payload) => {
  const name = String(payload.name || '').trim();
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const maxRow = await EventType.findOne({
    attributes: ['sortOrder'],
    order: [['sortOrder', 'DESC']],
  });
  const nextOrder = (maxRow?.sortOrder ?? 0) + 1;
  const row = await EventType.create({
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    name,
    textColor: normalizeColor(payload.textColor, '#000000'),
    bgColor: normalizeColor(payload.bgColor, '#ffffff'),
    forCandidate: Boolean(payload.forCandidate),
    forJob: Boolean(payload.forJob),
    forClient: Boolean(payload.forClient),
    forFlight: Boolean(payload.forFlight),
    sortOrder: nextOrder,
  });
  return row.get({ plain: true });
};

const update = async (id, payload) => {
  const row = await getById(id);
  const updates = {};
  if (payload.isActive !== undefined) updates.isActive = Boolean(payload.isActive);
  if (payload.name !== undefined) {
    const n = String(payload.name || '').trim();
    if (!n) {
      const err = new Error('name is required');
      err.status = 400;
      throw err;
    }
    updates.name = n;
  }
  if (payload.textColor !== undefined) updates.textColor = normalizeColor(payload.textColor, '#000000');
  if (payload.bgColor !== undefined) updates.bgColor = normalizeColor(payload.bgColor, '#ffffff');
  if (payload.forCandidate !== undefined) updates.forCandidate = Boolean(payload.forCandidate);
  if (payload.forJob !== undefined) updates.forJob = Boolean(payload.forJob);
  if (payload.forClient !== undefined) updates.forClient = Boolean(payload.forClient);
  if (payload.forFlight !== undefined) updates.forFlight = Boolean(payload.forFlight);
  if (payload.sortOrder !== undefined && payload.sortOrder !== null) {
    updates.sortOrder = parseInt(payload.sortOrder, 10) || 0;
  }
  await row.update(updates);
  return row.reload().then((r) => r.get({ plain: true }));
};

const remove = async (id) => {
  const row = await EventType.findByPk(id);
  if (!row) {
    const err = new Error('Event type not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return true;
};

function normalizeColor(val, fallback) {
  const s = String(val || '').trim();
  if (!s) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s.length === 4 || s.length === 7 || s.length === 5 ? s : s.slice(0, 7);
  return fallback;
}

module.exports = { list, create, update, remove };
