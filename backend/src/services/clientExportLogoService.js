const authService = require('./authService');
const clientService = require('./clientService');
const { resolveClientLogoUrl, detectImageType } = require('../utils/clientLogo');

async function fetchLogoBytes(logoUrl) {
  const imageRes = await fetch(logoUrl);
  if (!imageRes.ok) {
    const err = new Error('Logo download failed');
    err.status = 502;
    throw err;
  }
  const buf = Buffer.from(await imageRes.arrayBuffer());
  if (!buf.length) {
    const err = new Error('Logo empty');
    err.status = 502;
    throw err;
  }
  const contentType = imageRes.headers.get('content-type') || 'image/png';
  return {
    data: buf.toString('base64'),
    type: detectImageType(logoUrl, contentType),
    contentType,
    logoUrl,
  };
}

async function loadExportLogoForClientId(clientId) {
  const cid = String(clientId || '').trim();
  if (!cid) return null;
  const client = await clientService.getByIdWithLinks(cid);
  const plain = client?.get ? client.get({ plain: true }) : client;
  const logoUrl = resolveClientLogoUrl(plain);
  if (!logoUrl) return null;
  return fetchLogoBytes(logoUrl);
}

async function resolveClientIdForUser(user) {
  if (!user) return null;
  const plain = user?.get ? user.get({ plain: true }) : user;
  const direct = plain?.clientId != null ? String(plain.clientId).trim() : '';
  if (direct) return direct;
  return authService.resolveEffectiveClientIdForUser(user);
}

async function loadExportLogoForUser(user) {
  const clientId = await resolveClientIdForUser(user);
  if (!clientId) return null;
  return loadExportLogoForClientId(clientId);
}

module.exports = {
  loadExportLogoForClientId,
  loadExportLogoForUser,
  resolveClientIdForUser,
};
