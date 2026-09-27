const clientService = require('./clientService');
const clientContactService = require('./clientContactService');
const agentEntityAuditService = require('./agentEntityAuditService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (id, label = 'id') => {
  const s = String(id || '').trim();
  if (!UUID_RE.test(s)) {
    const err = new Error(`Invalid ${label}`);
    err.status = 400;
    throw err;
  }
  return s;
};

const assertClientExists = async (clientId) => {
  try {
    await clientService.getById(clientId);
  } catch (err) {
    if (err.status === 404) throw err;
    const e = new Error(err.message || 'Client not found');
    e.status = err.status || 404;
    throw e;
  }
};

/** Public read shape for agent contact list/create responses. */
const toAgentContactDto = (row) => {
  const j = row?.toJSON ? row.toJSON() : row || {};
  return {
    id: j.id,
    name: j.name || '',
    email: j.email || '',
    role: j.role || '',
    mobilePhone: j.mobilePhone || '',
    phone: j.phone || '',
    linkedin: j.linkedin || '',
    organizationId: j.organizationId || null,
    createdAt: j.createdAt || null,
  };
};

const linkOrganization = async (clientId, body = {}, req) => {
  const safeClientId = assertUuid(clientId, 'clientId');
  const organizationId = assertUuid(body.organizationId, 'organizationId');
  await assertClientExists(safeClientId);

  const client = await clientService.linkOrganizationForClient(safeClientId, { organizationId });

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'create',
    entityType: 'ClientOrganizationLink',
    entityId: organizationId,
    entityName: client?.name || safeClientId,
    description: `Agent linked organization ${organizationId} to client ${safeClientId}`,
    metadata: { clientId: safeClientId, organizationId },
  });

  return client;
};

const listContacts = async (clientId, query = {}) => {
  const safeClientId = assertUuid(clientId, 'clientId');
  await assertClientExists(safeClientId);

  const organizationId = query.organizationId
    ? assertUuid(query.organizationId, 'organizationId')
    : null;

  const rows = await clientContactService.listByClientIdWithClient(safeClientId, { organizationId });
  return rows.map(toAgentContactDto);
};

const createContact = async (clientId, body = {}, req) => {
  const safeClientId = assertUuid(clientId, 'clientId');
  await assertClientExists(safeClientId);

  const organizationId = assertUuid(body.organizationId, 'organizationId');
  const firstName = String(body.firstName || '').trim();
  if (!firstName) {
    const err = new Error('firstName is required');
    err.status = 400;
    throw err;
  }

  const payload = {
    organizationId,
    firstName,
    lastName: body.lastName != null ? String(body.lastName).trim() : '',
    role: body.role != null ? String(body.role).trim() : '',
    email: body.email != null ? String(body.email).trim() : '',
    mobilePhone: body.mobilePhone != null ? String(body.mobilePhone).trim() : '',
    phone: body.phone != null ? String(body.phone).trim() : '',
    linkedin: body.linkedin != null ? String(body.linkedin).trim() : '',
  };

  if (body.distributionEmail !== undefined) payload.distributionEmail = Boolean(body.distributionEmail);
  if (body.distributionSms !== undefined) payload.distributionSms = Boolean(body.distributionSms);
  if (body.distributionWhatsapp !== undefined) {
    payload.distributionWhatsapp = Boolean(body.distributionWhatsapp);
  }

  const row = await clientContactService.createForClient(safeClientId, payload);
  const dto = toAgentContactDto(row);

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'create',
    entityType: 'ClientContact',
    entityId: dto.id,
    entityName: dto.name,
    description: `Agent created client contact ${dto.id}`,
    after: dto,
    metadata: { clientId: safeClientId, organizationId },
  });

  return dto;
};

const updateContact = async (clientId, contactId, body = {}, req) => {
  const safeClientId = assertUuid(clientId, 'clientId');
  const safeContactId = assertUuid(contactId, 'contactId');
  await assertClientExists(safeClientId);

  const existing = await clientContactService.getByIdForClient(safeClientId, safeContactId);
  if (!existing) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }

  const before = toAgentContactDto(existing);
  const payload = {};

  if (body.organizationId !== undefined) {
    payload.organizationId = assertUuid(body.organizationId, 'organizationId');
  }
  if (body.firstName !== undefined) payload.firstName = String(body.firstName).trim();
  if (body.lastName !== undefined) payload.lastName = String(body.lastName).trim();
  if (body.role !== undefined) payload.role = String(body.role).trim();
  if (body.email !== undefined) payload.email = String(body.email).trim();
  if (body.mobilePhone !== undefined) payload.mobilePhone = String(body.mobilePhone).trim();
  if (body.phone !== undefined) payload.phone = String(body.phone).trim();
  if (body.linkedin !== undefined) payload.linkedin = String(body.linkedin).trim();
  if (body.distributionEmail !== undefined) payload.distributionEmail = Boolean(body.distributionEmail);
  if (body.distributionSms !== undefined) payload.distributionSms = Boolean(body.distributionSms);
  if (body.distributionWhatsapp !== undefined) {
    payload.distributionWhatsapp = Boolean(body.distributionWhatsapp);
  }

  if (Object.keys(payload).length === 0) {
    const err = new Error('At least one field is required');
    err.status = 400;
    throw err;
  }

  const row = await clientContactService.update(safeContactId, payload);
  const dto = toAgentContactDto(row);

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'ClientContact',
    entityId: dto.id,
    entityName: dto.name,
    description: `Agent updated client contact ${dto.id}`,
    before,
    after: dto,
    metadata: { clientId: safeClientId },
  });

  return dto;
};

const deleteContact = async (clientId, contactId, req) => {
  const safeClientId = assertUuid(clientId, 'clientId');
  const safeContactId = assertUuid(contactId, 'contactId');
  await assertClientExists(safeClientId);

  const existing = await clientContactService.getByIdForClient(safeClientId, safeContactId);
  if (!existing) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }

  const before = toAgentContactDto(existing);
  await clientContactService.remove(safeContactId);

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'delete',
    entityType: 'ClientContact',
    entityId: safeContactId,
    entityName: before.name,
    description: `Agent deleted client contact ${safeContactId}`,
    before,
    metadata: { clientId: safeClientId },
  });
};

module.exports = {
  linkOrganization,
  listContacts,
  createContact,
  updateContact,
  deleteContact,
  toAgentContactDto,
};
