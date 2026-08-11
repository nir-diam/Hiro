const { Op } = require('sequelize');
const Proposal = require('../models/Proposal');
const ProposalTemplate = require('../models/ProposalTemplate');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');

const STATUSES = new Set(['draft', 'sent', 'accepted', 'rejected', 'converted']);

const str = (v) => (v == null ? '' : String(v).trim());
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function toTemplatePublic(row) {
  const p = row?.get ? row.get({ plain: true }) : row;
  if (!p) return null;
  return {
    id: p.id,
    clientId: p.clientId,
    name: p.name || '',
    content: p.content || '',
    updatedByUserId: p.updatedByUserId || null,
    updatedByName: p.updatedByName || '',
    lastUpdated: p.updatedAt
      ? new Date(p.updatedAt).toLocaleDateString('he-IL')
      : '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toProposalPublic(row) {
  const p = row?.get ? row.get({ plain: true }) : row;
  if (!p) return null;
  const amount = num(p.amount, 0);
  const currency = p.currency || 'ILS';
  const contact = p.contact || null;
  const client = p.client || null;
  return {
    id: p.id,
    clientId: p.clientId,
    contactId: p.contactId || null,
    templateId: p.templateId || null,
    number: p.number,
    date: p.date,
    validUntil: p.validUntil || null,
    currency,
    amount,
    vatRate: num(p.vatRate, 17),
    includeVat: p.includeVat !== false,
    closeProbability: p.closeProbability != null ? num(p.closeProbability, null) : null,
    status: p.status || 'draft',
    notes: p.notes || '',
    contentHtml: p.contentHtml || '',
    clientName: client?.displayName || client?.name || '',
    contactName: contact?.name || '',
    totalAmount: formatMoney(amount, currency),
    createdByUserId: p.createdByUserId || null,
    createdByName: p.createdByName || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: currency || 'ILS',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency || '₪'}`;
  }
}

async function assertClient(clientId) {
  const c = await Client.findByPk(clientId, { attributes: ['id', 'name', 'displayName'] });
  if (!c) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  return c;
}

async function nextProposalNumber(clientId) {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  const latest = await Proposal.findOne({
    where: {
      clientId,
      number: { [Op.like]: `${prefix}%` },
    },
    order: [['createdAt', 'DESC']],
    attributes: ['number'],
  });
  let seq = 1;
  if (latest?.number) {
    const m = String(latest.number).match(/(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// ── Templates ──────────────────────────────────────────────────────────────

async function listTemplates(clientId) {
  await assertClient(clientId);
  const rows = await ProposalTemplate.findAll({
    where: { clientId },
    order: [['updatedAt', 'DESC']],
  });
  return rows.map(toTemplatePublic);
}

async function createTemplate(clientId, body = {}, actor = {}) {
  await assertClient(clientId);
  const name = str(body.name);
  if (!name) {
    const err = new Error('Template name is required');
    err.status = 400;
    throw err;
  }
  const row = await ProposalTemplate.create({
    clientId,
    name,
    content: str(body.content),
    updatedByUserId: actor.userId || null,
    updatedByName: actor.name || null,
  });
  return toTemplatePublic(row);
}

async function updateTemplate(clientId, templateId, body = {}, actor = {}) {
  const row = await ProposalTemplate.findOne({ where: { id: templateId, clientId } });
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  const name = body.name !== undefined ? str(body.name) : row.name;
  if (!name) {
    const err = new Error('Template name is required');
    err.status = 400;
    throw err;
  }
  await row.update({
    name,
    content: body.content !== undefined ? str(body.content) : row.content,
    updatedByUserId: actor.userId || row.updatedByUserId,
    updatedByName: actor.name || row.updatedByName,
  });
  await row.reload();
  return toTemplatePublic(row);
}

async function removeTemplate(clientId, templateId) {
  const row = await ProposalTemplate.findOne({ where: { id: templateId, clientId } });
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return { ok: true };
}

// ── Proposals ──────────────────────────────────────────────────────────────

async function listProposals({ clientId, contactId } = {}) {
  const where = {};
  if (clientId) {
    await assertClient(clientId);
    where.clientId = clientId;
  }
  if (contactId) where.contactId = contactId;

  const rows = await Proposal.findAll({
    where,
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name', 'displayName'], required: false },
      { model: ClientContact, as: 'contact', attributes: ['id', 'name'], required: false },
    ],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit: 500,
  });
  return rows.map(toProposalPublic);
}

async function getProposal(id) {
  const row = await Proposal.findByPk(id, {
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name', 'displayName'], required: false },
      { model: ClientContact, as: 'contact', attributes: ['id', 'name'], required: false },
    ],
  });
  if (!row) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  return toProposalPublic(row);
}

async function createProposal(body = {}, actor = {}) {
  const clientId = str(body.clientId);
  if (!clientId) {
    const err = new Error('clientId is required');
    err.status = 400;
    throw err;
  }
  await assertClient(clientId);

  const contactId = str(body.contactId) || null;
  if (contactId) {
    const contact = await ClientContact.findOne({ where: { id: contactId, clientId } });
    if (!contact) {
      const err = new Error('Contact not found for this client');
      err.status = 400;
      throw err;
    }
  }

  const status = STATUSES.has(str(body.status)) ? str(body.status) : 'draft';
  const number = str(body.number) || (await nextProposalNumber(clientId));

  const row = await Proposal.create({
    clientId,
    contactId,
    templateId: str(body.templateId) || null,
    number,
    date: str(body.date) || new Date().toISOString().slice(0, 10),
    validUntil: str(body.validUntil) || null,
    currency: str(body.currency) || 'ILS',
    amount: num(body.amount, 0),
    vatRate: num(body.vatRate, 17),
    includeVat: body.includeVat !== false && body.includeVat !== 'false',
    closeProbability:
      body.closeProbability === '' || body.closeProbability == null
        ? null
        : num(body.closeProbability, null),
    status,
    notes: str(body.notes),
    contentHtml: str(body.contentHtml),
    createdByUserId: actor.userId || null,
    createdByName: actor.name || null,
  });
  return getProposal(row.id);
}

async function updateProposal(id, body = {}, actor = {}) {
  const row = await Proposal.findByPk(id);
  if (!row) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (body.number !== undefined) patch.number = str(body.number) || row.number;
  if (body.date !== undefined) patch.date = str(body.date) || row.date;
  if (body.validUntil !== undefined) patch.validUntil = str(body.validUntil) || null;
  if (body.currency !== undefined) patch.currency = str(body.currency) || 'ILS';
  if (body.amount !== undefined) patch.amount = num(body.amount, 0);
  if (body.vatRate !== undefined) patch.vatRate = num(body.vatRate, 17);
  if (body.includeVat !== undefined) {
    patch.includeVat = body.includeVat !== false && body.includeVat !== 'false';
  }
  if (body.closeProbability !== undefined) {
    patch.closeProbability =
      body.closeProbability === '' || body.closeProbability == null
        ? null
        : num(body.closeProbability, null);
  }
  if (body.status !== undefined && STATUSES.has(str(body.status))) {
    patch.status = str(body.status);
  }
  if (body.notes !== undefined) patch.notes = str(body.notes);
  if (body.contentHtml !== undefined) patch.contentHtml = str(body.contentHtml);
  if (body.templateId !== undefined) patch.templateId = str(body.templateId) || null;
  if (body.contactId !== undefined) {
    const contactId = str(body.contactId) || null;
    if (contactId) {
      const contact = await ClientContact.findOne({
        where: { id: contactId, clientId: row.clientId },
      });
      if (!contact) {
        const err = new Error('Contact not found for this client');
        err.status = 400;
        throw err;
      }
    }
    patch.contactId = contactId;
  }

  await row.update(patch);
  return getProposal(row.id);
}

async function removeProposal(id) {
  const row = await Proposal.findByPk(id);
  if (!row) {
    const err = new Error('Proposal not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return { ok: true };
}

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
  toProposalPublic,
  toTemplatePublic,
};
