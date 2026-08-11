const proposalService = require('../services/proposalService');
const authService = require('../services/authService');

function actorFromReq(req) {
  const userId = req.user?.sub || req.user?.id || req.dbUser?.id || null;
  const name = req.dbUser?.name || req.user?.name || req.user?.email || null;
  return { userId, name };
}

async function resolveClientId(req) {
  const q = req.query?.clientId || req.body?.clientId;
  if (q && String(q).trim()) return String(q).trim();
  const me = req.dbUser || (req.user?.sub ? { id: req.user.sub } : null);
  if (me) {
    const effective = await authService.resolveEffectiveClientIdForUser(
      req.dbUser || (await require('../models/User').findByPk(req.user.sub)),
    );
    if (effective) return effective;
  }
  return null;
}

const listTemplates = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return res.status(400).json({ message: 'clientId required' });
    const data = await proposalService.listTemplates(clientId);
    res.json({ data });
  } catch (err) {
    console.error('[proposal][listTemplates]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const createTemplate = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return res.status(400).json({ message: 'clientId required' });
    const row = await proposalService.createTemplate(clientId, req.body || {}, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    console.error('[proposal][createTemplate]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const updateTemplate = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return res.status(400).json({ message: 'clientId required' });
    const row = await proposalService.updateTemplate(
      clientId,
      req.params.id,
      req.body || {},
      actorFromReq(req),
    );
    res.json(row);
  } catch (err) {
    console.error('[proposal][updateTemplate]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const removeTemplate = async (req, res) => {
  try {
    const clientId = await resolveClientId(req);
    if (!clientId) return res.status(400).json({ message: 'clientId required' });
    await proposalService.removeTemplate(clientId, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[proposal][removeTemplate]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const listProposals = async (req, res) => {
  try {
    const clientId = req.query.clientId ? String(req.query.clientId).trim() : null;
    const contactId = req.query.contactId ? String(req.query.contactId).trim() : null;
    const data = await proposalService.listProposals({ clientId, contactId });
    res.json({ data });
  } catch (err) {
    console.error('[proposal][list]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const getProposal = async (req, res) => {
  try {
    const row = await proposalService.getProposal(req.params.id);
    res.json(row);
  } catch (err) {
    console.error('[proposal][get]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const createProposal = async (req, res) => {
  try {
    const row = await proposalService.createProposal(req.body || {}, actorFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    console.error('[proposal][create]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const updateProposal = async (req, res) => {
  try {
    const row = await proposalService.updateProposal(req.params.id, req.body || {}, actorFromReq(req));
    res.json(row);
  } catch (err) {
    console.error('[proposal][update]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

const removeProposal = async (req, res) => {
  try {
    await proposalService.removeProposal(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[proposal][remove]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed' });
  }
};

module.exports = {
  listTemplates,
  createTemplate,
  updateTemplate,
  removeTemplate,
  listProposals,
  getProposal,
  createProposal,
  updateProposal,
  removeProposal,
};
