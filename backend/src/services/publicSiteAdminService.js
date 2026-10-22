const crypto = require('crypto');
const { Op } = require('sequelize');
const PublicSite = require('../models/PublicSite');
const PublicSiteKey = require('../models/PublicSiteKey');
const PublicSiteWebhookDelivery = require('../models/PublicSiteWebhookDelivery');
const Client = require('../models/Client');
const { PUBLIC_SITE_KEY_MODES } = require('../constants/publicJobsApi');
const { hashSiteKey, keyPrefix, generateSiteKeyPlaintext } = require('../utils/publicSiteKeyCrypto');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const publicSite = (site, keys = []) => {
  const plain = site.get ? site.get({ plain: true }) : site;
  return {
    id: plain.id,
    name: plain.name,
    domain: plain.domain,
    scope: plain.scope,
    clientId: plain.clientId,
    environment: plain.environment,
    webhookUrl: plain.webhookUrl || null,
    webhookConfigured: Boolean(plain.webhookSecret),
    recruitmentSourceName: plain.recruitmentSourceName || null,
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      revokedAt: key.revokedAt,
      lastUsedAt: key.lastUsedAt,
      requestCount: key.requestCount || 0,
      createdAt: key.createdAt,
    })),
  };
};

const listSites = async () => {
  const sites = await PublicSite.findAll({ order: [['createdAt', 'ASC']] });
  const keys = await PublicSiteKey.findAll({ order: [['createdAt', 'ASC']] });
  return sites.map((site) => publicSite(site, keys.filter((key) => String(key.siteId) === String(site.id))));
};

const createSite = async (body) => {
  const name = String(body.name || '').trim();
  const domain = String(body.domain || '').trim();
  const scope = body.scope === 'aggregator' ? 'aggregator' : 'tenant';
  const environment = body.environment === 'test' ? 'test' : 'production';
  const clientId = body.clientId || null;
  if (!name || !domain) throw httpError(422, 'name and domain are required');
  if (scope === 'tenant' && !clientId) throw httpError(422, 'A tenant site needs a client');
  if (scope === 'aggregator' && clientId) throw httpError(422, 'An aggregator site has no client');
  const webhookSecret = crypto.randomBytes(24).toString('hex');
  const site = await PublicSite.create({
    name,
    domain,
    scope,
    environment,
    clientId: scope === 'tenant' ? clientId : null,
    webhookUrl: body.webhookUrl || null,
    webhookSecret,
    recruitmentSourceName: body.recruitmentSourceName || (scope === 'aggregator' ? 'אתר Hiro' : null),
  });
  return { site: publicSite(site), webhookSecret };
};

const updateSite = async (id, body) => {
  const site = await PublicSite.findByPk(id);
  if (!site) throw httpError(404, 'Site not found');
  const patch = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.domain != null) patch.domain = String(body.domain).trim();
  if (body.environment != null) patch.environment = body.environment === 'test' ? 'test' : 'production';
  if (body.webhookUrl !== undefined) patch.webhookUrl = body.webhookUrl || null;
  if (body.recruitmentSourceName !== undefined) patch.recruitmentSourceName = body.recruitmentSourceName || null;
  await site.update(patch);
  return publicSite(site);
};

const createKey = async (siteId, body = {}) => {
  const site = await PublicSite.findByPk(siteId);
  if (!site) throw httpError(404, 'Site not found');
  const active = await PublicSiteKey.count({ where: { siteId, revokedAt: null } });
  if (active >= 2) throw httpError(409, 'Revoke a key before creating a third. Two active keys are allowed during rotation.');
  const raw = generateSiteKeyPlaintext();
  const key = await PublicSiteKey.create({
    name: String(body.name || site.name).trim() || site.name,
    keyHash: hashSiteKey(raw),
    keyPrefix: keyPrefix(raw),
    mode: site.scope === 'aggregator' ? PUBLIC_SITE_KEY_MODES.AGGREGATOR : PUBLIC_SITE_KEY_MODES.TENANT,
    clientId: site.clientId,
    siteId: site.id,
    siteLabels: [site.domain],
  });
  return {
    id: key.id,
    keyPrefix: key.keyPrefix,
    key: raw,
  };
};

const revokeKey = async (siteId, keyId) => {
  const key = await PublicSiteKey.findOne({ where: { id: keyId, siteId } });
  if (!key) throw httpError(404, 'Key not found');
  await key.update({ revokedAt: new Date() });
  return { id: key.id, revokedAt: key.revokedAt };
};

const rotateWebhookSecret = async (siteId) => {
  const site = await PublicSite.findByPk(siteId);
  if (!site) throw httpError(404, 'Site not found');
  const webhookSecret = crypto.randomBytes(24).toString('hex');
  await site.update({ webhookSecret });
  return { webhookSecret };
};

const listDeliveries = async (siteId) => {
  const rows = await PublicSiteWebhookDelivery.findAll({
    where: { siteId },
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  return rows.map((row) => {
    const plain = row.get({ plain: true });
    return {
      id: plain.id,
      event: plain.event,
      status: plain.status,
      attempts: plain.attempts,
      lastError: plain.lastError,
      createdAt: plain.createdAt,
    };
  });
};

const publishOptions = async (clientId) => {
  const client = clientId
    ? await Client.findByPk(clientId, { attributes: ['id', 'metadata'] })
    : null;
  const meta = client?.metadata && typeof client.metadata === 'object' ? client.metadata : {};
  const allowAggregator = meta.publishOnHiroBoard !== false;
  const sites = await PublicSite.findAll({
    where: {
      [Op.or]: [
        { clientId: clientId || null },
        ...(allowAggregator ? [{ scope: 'aggregator' }] : []),
      ],
    },
    order: [['name', 'ASC']],
  });
  return sites
    .filter((site) => site.scope === 'tenant' ? String(site.clientId) === String(clientId) : allowAggregator)
    .map((site) => ({
      id: site.id,
      name: site.name,
      domain: site.domain,
      scope: site.scope,
      environment: site.environment,
    }));
};

module.exports = {
  listSites,
  createSite,
  updateSite,
  createKey,
  revokeKey,
  rotateWebhookSecret,
  listDeliveries,
  publishOptions,
};
