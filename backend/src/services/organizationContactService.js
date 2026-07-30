const Organization = require('../models/Organization');
const OrganizationContact = require('../models/OrganizationContact');

const str = (v) => (v == null ? '' : String(v).trim());

function normalizeContactPayload(body = {}) {
  return {
    firstName: str(body.firstName),
    lastName: str(body.lastName),
    role: str(body.role),
    officePhone: str(body.officePhone),
    mobile: str(body.mobile),
    website: str(body.website),
    linkedin: str(body.linkedin),
  };
}

function toPublic(row) {
  const plain = row?.get ? row.get({ plain: true }) : row;
  if (!plain) return null;
  return {
    id: plain.id,
    organizationId: plain.organizationId,
    firstName: plain.firstName || '',
    lastName: plain.lastName || '',
    role: plain.role || '',
    officePhone: plain.officePhone || '',
    mobile: plain.mobile || '',
    website: plain.website || '',
    linkedin: plain.linkedin || '',
    sortIndex: plain.sortIndex ?? 0,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

async function assertOrganizationExists(organizationId) {
  const org = await Organization.findByPk(organizationId, { attributes: ['id'] });
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  return org;
}

async function listByOrganization(organizationId) {
  await assertOrganizationExists(organizationId);
  const rows = await OrganizationContact.findAll({
    where: { organizationId },
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map(toPublic);
}

async function create(organizationId, body = {}) {
  await assertOrganizationExists(organizationId);
  const data = normalizeContactPayload(body);
  if (!data.firstName && !data.lastName) {
    const err = new Error('First name or last name is required');
    err.status = 400;
    throw err;
  }
  const maxSort = await OrganizationContact.max('sortIndex', {
    where: { organizationId },
  });
  const row = await OrganizationContact.create({
    organizationId,
    ...data,
    sortIndex: Number.isFinite(maxSort) ? maxSort + 1 : 0,
  });
  return toPublic(row);
}

async function update(organizationId, contactId, body = {}) {
  const row = await OrganizationContact.findOne({
    where: { id: contactId, organizationId },
  });
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const data = normalizeContactPayload(body);
  if (!data.firstName && !data.lastName) {
    const err = new Error('First name or last name is required');
    err.status = 400;
    throw err;
  }
  await row.update(data);
  await row.reload();
  return toPublic(row);
}

async function remove(organizationId, contactId) {
  const row = await OrganizationContact.findOne({
    where: { id: contactId, organizationId },
  });
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return { ok: true };
}

module.exports = {
  listByOrganization,
  create,
  update,
  remove,
  toPublic,
};
