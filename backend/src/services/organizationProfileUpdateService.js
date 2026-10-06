const { Op } = require('sequelize');
const OrganizationProfileUpdate = require('../models/OrganizationProfileUpdate');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const organizationService = require('./organizationService');
const clientService = require('./clientService');
const clientGamificationService = require('./clientGamificationService');

const strArr = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(/[,;|\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

function normalizeAdditionalLocationsSnapshot(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const description = String(item.description || '').trim();
      const location = String(item.location || '').trim();
      const address = String(item.address || '').trim();
      if (!description && !location && !address) return null;
      return { description, location, address };
    })
    .filter(Boolean);
}

function snapshotOrgProfile(org) {
  if (!org) return {};
  const plain = org.toJSON ? org.toJSON() : org;
  return {
    mainField: String(plain.mainField || '').trim(),
    mainField2: Array.isArray(plain.mainField2) ? plain.mainField2.map(String).filter(Boolean) : [],
    subField: Array.isArray(plain.subField) ? plain.subField.map(String).filter(Boolean) : [],
    secondaryField: String(plain.secondaryField || '').trim(),
    employeeCount: String(plain.employeeCount || '').trim(),
    structure: String(plain.structure || plain.type || '').trim(),
    location: String(plain.location || '').trim(),
    website: String(plain.website || '').trim(),
    subsidiaries: Array.isArray(plain.subsidiaries) ? plain.subsidiaries.map(String).filter(Boolean) : [],
    additionalLocations: normalizeAdditionalLocationsSnapshot(plain.additionalLocations),
  };
}

function normalizeProposed(payload) {
  const p = payload || {};
  return {
    mainField: String(p.mainField || '').trim(),
    mainField2: strArr(p.mainField2),
    subField: strArr(p.subField),
    secondaryField: String(p.secondaryField || '').trim(),
    employeeCount: String(p.employeeCount || '').trim(),
    structure: String(p.structure || '').trim(),
    location: String(p.location || '').trim(),
    website: String(p.website || '').trim(),
    subsidiaries: strArr(p.subsidiaries),
    additionalLocations: normalizeAdditionalLocationsSnapshot(p.additionalLocations),
  };
}

function actorLabel(actor) {
  if (!actor) return null;
  const name = actor.name && String(actor.name).trim();
  if (name) return name;
  const email = actor.email && String(actor.email).trim();
  if (email) return email;
  return actor.id ? String(actor.id) : null;
}

async function getPrimaryOrganizationIdForClient(clientId) {
  const link = await ClientOrganizationLink.findOne({
    where: { clientId: String(clientId), organizationId: { [Op.ne]: null } },
    order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
  });
  if (!link?.organizationId) return null;
  return String(link.organizationId);
}

async function resolveOrganizationIdForProfileUpdate(clientId, organizationIdHint) {
  const hint = organizationIdHint != null ? String(organizationIdHint).trim() : '';
  if (hint) {
    const link = await ClientOrganizationLink.findOne({
      where: { clientId: String(clientId), organizationId: hint },
    });
    if (!link?.organizationId) {
      const err = new Error('הארגון אינו מקושר ללקוח זה.');
      err.status = 400;
      throw err;
    }
    return String(link.organizationId);
  }
  return getPrimaryOrganizationIdForClient(clientId);
}

function toDto(row, extras = {}) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    clientId: plain.clientId,
    organizationId: plain.organizationId,
    status: plain.status,
    previousFields: plain.previousFields || {},
    proposedFields: plain.proposedFields || {},
    submittedByUserId: plain.submittedByUserId,
    submittedByName: plain.submittedByName,
    reviewedByUserId: plain.reviewedByUserId,
    reviewedByName: plain.reviewedByName,
    reviewedAt: plain.reviewedAt,
    reviewNote: plain.reviewNote,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...extras,
  };
}

const submitForClient = async (clientId, proposedPayload, actor, { organizationId: organizationIdHint } = {}) => {
  clientService.assertCanAccessClientOrganizations(actor, clientId);
  const organizationId = await resolveOrganizationIdForProfileUpdate(clientId, organizationIdHint);
  if (!organizationId) {
    const err = new Error('ללקוח אין ארגון מקושר לעדכון פרופיל.');
    err.status = 400;
    throw err;
  }
  const org = await organizationService.getById(organizationId);
  const previousFields = snapshotOrgProfile(org);
  const proposedFields = normalizeProposed(proposedPayload);

  await OrganizationProfileUpdate.update(
    { status: 'superseded' },
    { where: { clientId: String(clientId), organizationId, status: 'pending' } },
  );

  const row = await OrganizationProfileUpdate.create({
    clientId: String(clientId),
    organizationId,
    status: 'pending',
    previousFields,
    proposedFields,
    submittedByUserId: actor?.id || null,
    submittedByName: actorLabel(actor),
  });
  const clientGamificationPoints = await clientGamificationService.getProfileUpdatePoints(clientId);
  return toDto(row, { clientGamificationPoints });
};

const getPendingForClient = async (clientId, actor, { organizationId: organizationIdHint } = {}) => {
  clientService.assertCanAccessClientOrganizations(actor, clientId);
  const organizationId = await resolveOrganizationIdForProfileUpdate(clientId, organizationIdHint);
  if (!organizationId) return null;
  const row = await OrganizationProfileUpdate.findOne({
    where: {
      clientId: String(clientId),
      organizationId,
      status: 'pending',
    },
    order: [['createdAt', 'DESC']],
  });
  if (!row) return null;
  const clientGamificationPoints = await clientGamificationService.getProfileUpdatePoints(clientId);
  return toDto(row, { clientGamificationPoints });
};

const listForClient = async (clientId, actor, { page = 1, limit = 50 } = {}) => {
  clientService.assertCanAccessClientOrganizations(actor, clientId);
  const take = Math.min(100, Math.max(1, Number(limit) || 50));
  const pageNum = Math.max(1, Number(page) || 1);
  const offset = (pageNum - 1) * take;

  const { rows, count } = await OrganizationProfileUpdate.findAndCountAll({
    where: {
      clientId: String(clientId),
      status: { [Op.in]: ['pending', 'approved', 'rejected'] },
    },
    order: [['createdAt', 'DESC']],
    offset,
    limit: take,
  });

  const clientGamificationPoints = await clientGamificationService.getProfileUpdatePoints(clientId);
  return {
    data: rows.map((row) => toDto(row)),
    total: count,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(count / take)),
    clientGamificationPoints,
  };
};

const list = async ({ status = 'pending', page = 1, limit = 50, search = '' } = {}) => {
  const where = {};
  if (status && status !== 'all') where.status = status;
  const q = String(search || '').trim();
  const offset = (Math.max(1, Number(page) || 1) - 1) * Math.min(200, Math.max(1, Number(limit) || 50));
  const take = Math.min(200, Math.max(1, Number(limit) || 50));

  const { rows, count } = await OrganizationProfileUpdate.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    offset,
    limit: take,
  });

  const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))];
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter(Boolean))];
  const clients = clientIds.length
    ? await Client.findAll({ where: { id: clientIds }, attributes: ['id', 'name', 'displayName', 'metadata'] })
    : [];
  const orgs = orgIds.length
    ? await Organization.findAll({ where: { id: orgIds }, attributes: ['id', 'name'] })
    : [];
  const clientMap = new Map(clients.map((c) => [String(c.id), c]));
  const orgMap = new Map(orgs.map((o) => [String(o.id), o]));

  let data = rows.map((row) => {
    const client = clientMap.get(String(row.clientId));
    const org = orgMap.get(String(row.organizationId));
    return toDto(row, {
      clientName: client?.displayName || client?.name || null,
      organizationName: org?.name || null,
      clientGamificationPoints: clientGamificationService.readProfileUpdatePoints(client?.metadata),
    });
  });

  if (q) {
    const lower = q.toLowerCase();
    data = data.filter(
      (row) =>
        String(row.clientName || '').toLowerCase().includes(lower)
        || String(row.organizationName || '').toLowerCase().includes(lower)
        || String(row.submittedByName || '').toLowerCase().includes(lower),
    );
  }

  return {
    data,
    total: q ? data.length : count,
    page: Math.max(1, Number(page) || 1),
    totalPages: Math.max(1, Math.ceil((q ? data.length : count) / take)),
  };
};

const countPending = async () =>
  OrganizationProfileUpdate.count({ where: { status: 'pending' } });

const approve = async (id, actor) => {
  const row = await OrganizationProfileUpdate.findByPk(id);
  if (!row) {
    const err = new Error('בקשת עדכון לא נמצאה');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error('בקשה זו כבר טופלה');
    err.status = 409;
    throw err;
  }
  const patch = normalizeProposed(row.proposedFields);
  await organizationService.update(
    row.organizationId,
    {
      mainField: patch.mainField || null,
      mainField2: patch.mainField2,
      subField: patch.subField,
      secondaryField: patch.secondaryField || null,
      employeeCount: patch.employeeCount || null,
      structure: patch.structure || null,
      location: patch.location || null,
      website: patch.website || null,
      subsidiaries: patch.subsidiaries,
      additionalLocations: patch.additionalLocations,
    },
    { actingUser: actor },
  );
  await row.update({
    status: 'approved',
    reviewedByUserId: actor?.id || null,
    reviewedByName: actorLabel(actor),
    reviewedAt: new Date(),
  });
  const clientGamificationPoints = await clientGamificationService.addProfileUpdatePoints(row.clientId, 1);
  return toDto(row, { clientGamificationPoints });
};

const reject = async (id, actor, reviewNote) => {
  const row = await OrganizationProfileUpdate.findByPk(id);
  if (!row) {
    const err = new Error('בקשת עדכון לא נמצאה');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'pending') {
    const err = new Error('בקשה זו כבר טופלה');
    err.status = 409;
    throw err;
  }
  await row.update({
    status: 'rejected',
    reviewedByUserId: actor?.id || null,
    reviewedByName: actorLabel(actor),
    reviewedAt: new Date(),
    reviewNote: reviewNote != null ? String(reviewNote).trim() : null,
  });
  return toDto(row);
};

module.exports = {
  snapshotOrgProfile,
  normalizeProposed,
  submitForClient,
  getPendingForClient,
  listForClient,
  list,
  countPending,
  approve,
  reject,
};
