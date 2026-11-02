const clientContactService = require('../services/clientContactService');
const clientService = require('../services/clientService');

const assertCanListClientContacts = (actor, clientId) => {
  if (!actor) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (clientService.isPlatformAdmin(actor)) return;
  if (!actor.clientId || String(actor.clientId) !== String(clientId)) {
    const err = new Error('You may only view contacts for your own client');
    err.status = 403;
    throw err;
  }
};

const parseIdList = (raw) => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
};

const list = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    assertCanListClientContacts(req.dbUser, clientId);
    const organizationId = req.query?.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const organizationTmpId = req.query?.organizationTmpId
      ? String(req.query.organizationTmpId).trim()
      : null;
    const ids = parseIdList(req.query?.ids);
    const lookup = req.query?.lookup === '1' || req.query?.lookup === 'true';
    const q = req.query?.q ? String(req.query.q).trim() : '';
    const rows = await clientContactService.listByClientIdWithClient(clientId, {
      organizationId,
      organizationTmpId,
      ids,
      lookup: lookup || ids.length > 0 || Boolean(q),
      q,
      limit: parseListLimit(req.query?.limit),
    });
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list contacts' });
  }
};

const parseListLimit = (raw, fallback = 50) =>
  Math.min(100, Math.max(1, Number.parseInt(String(raw ?? ''), 10) || fallback));

const parseListOffset = (raw) =>
  Math.max(0, Number.parseInt(String(raw ?? ''), 10) || 0);

const listAll = async (req, res) => {
  try {
    const actor = req.dbUser;
    if (!actor) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const paginate = req.query?.paginate === '1' || req.query?.paginate === 'true';
    const q = req.query?.q ? String(req.query.q).trim() : '';
    const ids = parseIdList(req.query?.ids);
    const lookup = req.query?.lookup === '1' || req.query?.lookup === 'true';
    const listOpts = {
      paginate,
      limit: parseListLimit(req.query?.limit),
      offset: parseListOffset(req.query?.offset),
      q,
      ids,
      lookup: lookup || ids.length > 0,
    };
    // Platform admins see every contact; tenant staff see only their client.
    if (clientService.isPlatformAdmin(actor)) {
      const rows = await clientContactService.listAllWithClient(listOpts);
      return res.json(rows);
    }
    const tenantClientId = actor.clientId ? String(actor.clientId).trim() : '';
    if (!tenantClientId) {
      return res.status(403).json({ message: 'Only platform admins or tenant users can list contacts' });
    }
    const rows = await clientContactService.listAllWithClient({
      ...listOpts,
      clientId: tenantClientId,
    });
    return res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list contacts' });
  }
};

const create = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    assertCanListClientContacts(req.dbUser, clientId);
    const body = { ...(req.body || {}) };
    // Non-admins may only create contacts for their own client (already asserted).
    // organizationId is optional and scopes the contact to a linked org.
    if (body.organizationId != null) {
      body.organizationId = String(body.organizationId).trim() || null;
    }
    if (body.organizationTmpId != null) {
      body.organizationTmpId = String(body.organizationTmpId).trim() || null;
    }
    const row = await clientContactService.createForClient(clientId, body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const row = await clientContactService.update(req.params.contactId, req.body);
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await clientContactService.remove(req.params.contactId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

// Groups
const listGroups = async (req, res) => {
  const rows = await clientContactService.listGroupsByClientId(req.params.id);
  res.json(rows);
};

const createGroup = async (req, res) => {
  try {
    const row = await clientContactService.createGroupForClient(req.params.id, req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const deleteGroup = async (req, res) => {
  try {
    await clientContactService.deleteGroup(req.params.groupId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const get = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    const contactId = String(req.params.contactId || '').trim();
    assertCanListClientContacts(req.dbUser, clientId);
    const row = await clientContactService.getByIdForClient(clientId, contactId);
    if (!row) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load contact' });
  }
};

/** GET /api/clients/:id/contacts/:contactId/jobs — jobs that assign this contact in job.contacts */
const listJobs = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    const contactId = String(req.params.contactId || '').trim();
    assertCanListClientContacts(req.dbUser, clientId);
    const rows = await clientContactService.listJobsForContact(clientId, contactId);
    if (rows === null) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list jobs for contact' });
  }
};

module.exports = { list, listAll, get, create, update, remove, listGroups, createGroup, deleteGroup, listJobs };

