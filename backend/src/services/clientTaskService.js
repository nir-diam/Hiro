const ClientTask = require('../models/ClientTask');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');

const normalizeOrgFields = (data) => {
  const next = { ...data };
  if (
    Object.prototype.hasOwnProperty.call(next, 'organizationId')
    && next.organizationId != null
    && String(next.organizationId).trim() === ''
  ) {
    next.organizationId = null;
  }
  if (
    Object.prototype.hasOwnProperty.call(next, 'organizationTmpId')
    && next.organizationTmpId != null
    && String(next.organizationTmpId).trim() === ''
  ) {
    next.organizationTmpId = null;
  }
  return next;
};

const buildTaskWhere = (clientId, { organizationId = null, organizationTmpId = null } = {}) => {
  const where = { clientId };
  if (organizationTmpId) {
    where.organizationTmpId = String(organizationTmpId);
  } else if (organizationId) {
    where.organizationId = String(organizationId);
  }
  return where;
};

const listByClientId = async (clientId, opts = {}) =>
  ClientTask.findAll({
    where: buildTaskWhere(clientId, opts),
    include: [
      {
        model: Organization,
        as: 'organization',
        required: false,
        attributes: ['id', 'name', 'logo'],
      },
      {
        model: OrganizationTmp,
        as: 'organizationTmp',
        required: false,
        attributes: ['id', 'name'],
      },
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
  });

const listAllWithClient = async () =>
  ClientTask.findAll({
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
      },
      {
        model: Organization,
        as: 'organization',
        required: false,
        attributes: ['id', 'name', 'logo'],
      },
      {
        model: OrganizationTmp,
        as: 'organizationTmp',
        required: false,
        attributes: ['id', 'name'],
      },
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
  });

const createForClient = async (clientId, payload = {}) => {
  const data = normalizeOrgFields({ ...payload, clientId });
  return ClientTask.create(data);
};

const update = async (id, payload = {}) => {
  const row = await ClientTask.findByPk(id);
  if (!row) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await row.update(normalizeOrgFields(payload));
  return row;
};

const remove = async (id) => {
  const row = await ClientTask.findByPk(id);
  if (!row) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
};

const migrateTasksFromTmpToOrg = async (organizationTmpId, organizationId) => {
  const tmpId = String(organizationTmpId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!tmpId || !orgId) return 0;

  const [count] = await ClientTask.update(
    { organizationId: orgId, organizationTmpId: null },
    { where: { organizationTmpId: tmpId } },
  );
  return count;
};

module.exports = {
  listByClientId,
  listAllWithClient,
  createForClient,
  update,
  remove,
  migrateTasksFromTmpToOrg,
};
