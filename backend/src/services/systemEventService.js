const SystemEvent = require('../models/SystemEvent');
const systemEventEmitter = require('../utils/systemEventEmitter');

const normalizeColor = (val, fallback) => {
  const s = String(val || '').trim();
  if (!s) return fallback;
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) {
    return s.length === 4 || s.length === 7 || s.length === 5 ? s : s.slice(0, 7);
  }
  return fallback;
};

const list = async () => {
  const rows = await SystemEvent.findAll({
    order: [
      ['sortOrder', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map((r) => r.get({ plain: true }));
};

const getById = async (id) => {
  const row = await SystemEvent.findByPk(id);
  if (!row) {
    const err = new Error('System event not found');
    err.status = 404;
    throw err;
  }
  return row;
};

const create = async (payload) => {
  const triggerName = String(payload.triggerName || '').trim();
  const eventName = String(payload.eventName || '').trim();
  if (!triggerName) {
    const err = new Error('triggerName is required');
    err.status = 400;
    throw err;
  }
  if (!eventName) {
    const err = new Error('eventName is required');
    err.status = 400;
    throw err;
  }
  const maxRow = await SystemEvent.findOne({
    attributes: ['sortOrder'],
    order: [['sortOrder', 'DESC']],
  });
  const nextOrder = (maxRow?.sortOrder ?? 0) + 1;
  const row = await SystemEvent.create({
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    triggerName,
    eventName,
    contentTemplate: String(payload.contentTemplate ?? ''),
    forCandidate: Boolean(payload.forCandidate),
    forJob: Boolean(payload.forJob),
    forClient: Boolean(payload.forClient),
    textColor: normalizeColor(payload.textColor, '#000000'),
    bgColor: normalizeColor(payload.bgColor, '#ffffff'),
    sortOrder: nextOrder,
  });
  systemEventEmitter.invalidateCache(triggerName, eventName);
  return row.get({ plain: true });
};

const update = async (id, payload) => {
  const row = await getById(id);
  const updates = {};
  if (payload.isActive !== undefined) updates.isActive = Boolean(payload.isActive);
  if (payload.triggerName !== undefined) {
    const v = String(payload.triggerName || '').trim();
    if (!v) {
      const err = new Error('triggerName is required');
      err.status = 400;
      throw err;
    }
    updates.triggerName = v;
  }
  if (payload.eventName !== undefined) {
    const v = String(payload.eventName || '').trim();
    if (!v) {
      const err = new Error('eventName is required');
      err.status = 400;
      throw err;
    }
    updates.eventName = v;
  }
  if (payload.contentTemplate !== undefined) {
    updates.contentTemplate = String(payload.contentTemplate ?? '');
  }
  if (payload.forCandidate !== undefined) updates.forCandidate = Boolean(payload.forCandidate);
  if (payload.forJob !== undefined) updates.forJob = Boolean(payload.forJob);
  if (payload.forClient !== undefined) updates.forClient = Boolean(payload.forClient);
  if (payload.textColor !== undefined) updates.textColor = normalizeColor(payload.textColor, '#000000');
  if (payload.bgColor !== undefined) updates.bgColor = normalizeColor(payload.bgColor, '#ffffff');
  if (payload.sortOrder !== undefined && payload.sortOrder !== null) {
    updates.sortOrder = parseInt(payload.sortOrder, 10) || 0;
  }
  await row.update(updates);
  await row.reload();
  systemEventEmitter.invalidateCache();
  return row.get({ plain: true });
};

const remove = async (id) => {
  const row = await SystemEvent.findByPk(id);
  if (!row) {
    const err = new Error('System event not found');
    err.status = 404;
    throw err;
  }
  const triggerName = row.triggerName;
  const eventName = row.eventName;
  await row.destroy();
  systemEventEmitter.invalidateCache(triggerName, eventName);
  return true;
};

module.exports = { list, getById, create, update, remove };
