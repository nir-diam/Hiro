const Client = require('../models/Client');
const { invalidateClientApiCache } = require('./clientService');

const GAMIFICATION_META_KEY = 'gamification';

function readProfileUpdatePoints(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const gam = meta[GAMIFICATION_META_KEY] && typeof meta[GAMIFICATION_META_KEY] === 'object'
    ? meta[GAMIFICATION_META_KEY]
    : {};
  const n = Number(gam.profileUpdatePoints);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function getProfileUpdatePoints(clientId) {
  const client = await Client.findByPk(clientId, { attributes: ['id', 'metadata'] });
  if (!client) return 0;
  return readProfileUpdatePoints(client.metadata);
}

async function addProfileUpdatePoints(clientId, amount) {
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (!delta) return getProfileUpdatePoints(clientId);

  const client = await Client.findByPk(clientId, { attributes: ['id', 'metadata'] });
  if (!client) return 0;

  const meta = client.metadata && typeof client.metadata === 'object'
    ? { ...client.metadata }
    : {};
  const gam = meta[GAMIFICATION_META_KEY] && typeof meta[GAMIFICATION_META_KEY] === 'object'
    ? { ...meta[GAMIFICATION_META_KEY] }
    : {};
  gam.profileUpdatePoints = readProfileUpdatePoints(meta) + delta;
  meta[GAMIFICATION_META_KEY] = gam;
  await client.update({ metadata: meta });
  invalidateClientApiCache(clientId);
  return gam.profileUpdatePoints;
}

module.exports = {
  readProfileUpdatePoints,
  getProfileUpdatePoints,
  addProfileUpdatePoints,
};
