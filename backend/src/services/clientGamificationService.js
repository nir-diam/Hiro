const Client = require('../models/Client');
const OrganizationProfileUpdate = require('../models/OrganizationProfileUpdate');
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

async function countApprovedProfileUpdates(clientId) {
  if (!clientId) return 0;
  return OrganizationProfileUpdate.count({
    where: { clientId: String(clientId), status: 'approved' },
  });
}

async function writeProfileUpdatePoints(client, points) {
  const next = Math.max(0, Math.floor(Number(points) || 0));
  const meta = client.metadata && typeof client.metadata === 'object'
    ? { ...client.metadata }
    : {};
  const gam = meta[GAMIFICATION_META_KEY] && typeof meta[GAMIFICATION_META_KEY] === 'object'
    ? { ...meta[GAMIFICATION_META_KEY] }
    : {};
  gam.profileUpdatePoints = next;
  meta[GAMIFICATION_META_KEY] = gam;
  await client.update({ metadata: meta });
  invalidateClientApiCache(String(client.id));
  return next;
}

/** Keep metadata in sync with approved profile updates (+1 point each). Fixes legacy rows approved before points were persisted. */
async function reconcileProfileUpdatePoints(clientId) {
  const id = String(clientId || '').trim();
  if (!id) return 0;

  const approvedCount = await countApprovedProfileUpdates(id);
  const client = await Client.findByPk(id, { attributes: ['id', 'metadata'] });
  if (!client) return 0;

  const stored = readProfileUpdatePoints(client.metadata);
  const effective = Math.max(stored, approvedCount);
  if (effective > stored) {
    return writeProfileUpdatePoints(client, effective);
  }
  return stored;
}

async function getProfileUpdatePoints(clientId) {
  return reconcileProfileUpdatePoints(clientId);
}

async function addProfileUpdatePoints(clientId, amount) {
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (!delta) return reconcileProfileUpdatePoints(clientId);

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
  return reconcileProfileUpdatePoints(clientId);
}

module.exports = {
  readProfileUpdatePoints,
  countApprovedProfileUpdates,
  reconcileProfileUpdatePoints,
  getProfileUpdatePoints,
  addProfileUpdatePoints,
};
