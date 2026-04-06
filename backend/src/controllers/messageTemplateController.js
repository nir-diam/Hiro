const messageTemplateService = require('../services/messageTemplateService');

/** Messaging UI: tenant templates when user has clientId; otherwise Hiro admin catalog. */
const listForCompose = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (user.clientId) {
      const rows = await messageTemplateService.listByClient(user.clientId);
      return res.json({ scope: 'client', templates: rows });
    }
    const rows = await messageTemplateService.listAdmin();
    return res.json({ scope: 'admin', templates: rows });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const listClient = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user.clientId) {
      return res.status(403).json({ message: 'Company context required for client templates' });
    }
    const rows = await messageTemplateService.listByClient(user.clientId);
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const listAdmin = async (req, res) => {
  try {
    const rows = await messageTemplateService.listAdmin();
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const createClient = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user.clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const row = await messageTemplateService.createClient(user.clientId, req.body, user);
    return res.status(201).json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const createAdmin = async (req, res) => {
  try {
    const user = req.dbUser;
    const row = await messageTemplateService.createAdmin(req.body, user);
    return res.status(201).json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const updateClient = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user.clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const row = await messageTemplateService.update(req.params.id, 'client', user.clientId, req.body, user);
    return res.json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const updateAdmin = async (req, res) => {
  try {
    const user = req.dbUser;
    const row = await messageTemplateService.update(req.params.id, 'admin', null, req.body, user);
    return res.json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const removeClient = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user.clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    await messageTemplateService.remove(req.params.id, 'client', user.clientId);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const removeAdmin = async (req, res) => {
  try {
    await messageTemplateService.remove(req.params.id, 'admin', null);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const listCatalog = async (req, res) => {
  try {
    const rows = await messageTemplateService.listAllCatalog();
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const createCatalog = async (req, res) => {
  try {
    const row = await messageTemplateService.createCatalog(req.body, req.dbUser);
    const full = await messageTemplateService.findByPkWithClient(row.id);
    return res.status(201).json(messageTemplateService.toCatalogRow(full));
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const updateCatalog = async (req, res) => {
  try {
    await messageTemplateService.updateByIdAny(req.params.id, req.body, req.dbUser);
    const full = await messageTemplateService.findByPkWithClient(req.params.id);
    return res.json(messageTemplateService.toCatalogRow(full));
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const removeCatalog = async (req, res) => {
  try {
    await messageTemplateService.removeByIdAny(req.params.id);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = {
  listForCompose,
  listClient,
  listAdmin,
  listCatalog,
  createClient,
  createAdmin,
  createCatalog,
  updateClient,
  updateAdmin,
  updateCatalog,
  removeClient,
  removeAdmin,
  removeCatalog,
};
