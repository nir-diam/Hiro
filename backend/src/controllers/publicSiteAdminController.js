const publicSiteAdminService = require('../services/publicSiteAdminService');

const requirePlatformAdmin = (req, res, next) => {
  const role = req.dbUser?.role;
  if (role === 'super_admin' || role === 'admin') return next();
  return res.status(403).json({ message: 'Forbidden' });
};

const send = (res, err) => res.status(err.status || 500).json({ message: err.message || 'Request failed' });

const list = async (req, res) => {
  try {
    res.json({ sites: await publicSiteAdminService.listSites() });
  } catch (err) {
    send(res, err);
  }
};

const create = async (req, res) => {
  try {
    const result = await publicSiteAdminService.createSite(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    send(res, err);
  }
};

const update = async (req, res) => {
  try {
    res.json(await publicSiteAdminService.updateSite(req.params.id, req.body || {}));
  } catch (err) {
    send(res, err);
  }
};

const createKey = async (req, res) => {
  try {
    res.status(201).json(await publicSiteAdminService.createKey(req.params.id, req.body || {}));
  } catch (err) {
    send(res, err);
  }
};

const revokeKey = async (req, res) => {
  try {
    res.json(await publicSiteAdminService.revokeKey(req.params.id, req.params.keyId));
  } catch (err) {
    send(res, err);
  }
};

const rotateWebhookSecret = async (req, res) => {
  try {
    res.json(await publicSiteAdminService.rotateWebhookSecret(req.params.id));
  } catch (err) {
    send(res, err);
  }
};

const deliveries = async (req, res) => {
  try {
    res.json({ deliveries: await publicSiteAdminService.listDeliveries(req.params.id) });
  } catch (err) {
    send(res, err);
  }
};

const options = async (req, res) => {
  try {
    const role = req.dbUser?.role;
    const platform = role === 'super_admin' || role === 'admin';
    const clientId = platform ? (req.query.clientId || req.dbUser?.clientId) : req.dbUser?.clientId;
    res.json({ sites: await publicSiteAdminService.publishOptions(clientId) });
  } catch (err) {
    send(res, err);
  }
};

module.exports = {
  requirePlatformAdmin,
  list,
  create,
  update,
  createKey,
  revokeKey,
  rotateWebhookSecret,
  deliveries,
  options,
};
