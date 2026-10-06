const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const ClientContact = require('../models/ClientContact');
const ClientContactGroup = require('../models/ClientContactGroup');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const Job = require('../models/Job');
const { deactivateStaffUserForDeletedContact } = require('./staffUserProvisioningService');

const CLIENT_INCLUDE = {
  model: Client,
  as: 'client',
  required: false,
  attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
};

const ORGANIZATION_INCLUDE = {
  model: Organization,
  as: 'organization',
  required: false,
  attributes: ['id', 'name', 'nameEn', 'logo', 'website'],
};

const str = (v) => (v == null ? '' : String(v).trim());

const newEntryId = () => {
  try {
    return randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
};

const normalizeEmailEntries = (raw, fallback = '') => {
  if (Array.isArray(raw) && raw.length) {
    const entries = raw
      .map((e) => ({
        id: str(e?.id) || newEntryId(),
        value: str(e?.value),
        isPrimary: Boolean(e?.isPrimary),
      }))
      .filter((e) => e.value);
    if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
    return entries;
  }
  const email = str(fallback);
  return email ? [{ id: newEntryId(), value: email, isPrimary: true }] : [];
};

const normalizePhoneEntries = (raw, { phone = '', mobilePhone = '' } = {}) => {
  if (Array.isArray(raw) && raw.length) {
    const entries = raw
      .map((e) => ({
        id: str(e?.id) || newEntryId(),
        value: str(e?.value),
        kind: e?.kind === 'mobile' ? 'mobile' : 'office',
        isPrimary: Boolean(e?.isPrimary),
      }))
      .filter((e) => e.value);
    for (const kind of ['office', 'mobile']) {
      const ofKind = entries.filter((e) => e.kind === kind);
      if (ofKind.length && !ofKind.some((e) => e.isPrimary)) ofKind[0].isPrimary = true;
    }
    return entries;
  }
  const entries = [];
  const office = str(phone);
  const mobile = str(mobilePhone);
  if (office) entries.push({ id: newEntryId(), value: office, kind: 'office', isPrimary: true });
  if (mobile) entries.push({ id: newEntryId(), value: mobile, kind: 'mobile', isPrimary: true });
  return entries;
};

const normalizeLinkEntries = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return [];
  const entries = raw
    .map((e) => ({
      id: str(e?.id) || newEntryId(),
      label: str(e?.label),
      url: str(e?.url || e?.value),
      isPrimary: Boolean(e?.isPrimary),
    }))
    .filter((e) => e.url);
  if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
  return entries;
};

const normalizeAddressEntries = (raw) => {
  if (!Array.isArray(raw) || !raw.length) return [];
  const entries = raw
    .map((e) => ({
      id: str(e?.id) || newEntryId(),
      value: str(e?.value),
      isPrimary: Boolean(e?.isPrimary),
    }))
    .filter((e) => e.value);
  if (entries.length && !entries.some((e) => e.isPrimary)) entries[0].isPrimary = true;
  return entries;
};

const primaryFromEntries = (entries, kind) => {
  const list = kind ? entries.filter((e) => e.kind === kind) : entries;
  const primary = list.find((e) => e.isPrimary) || list[0];
  return primary?.value || '';
};

const normalizeContactPayload = (payload = {}) => {
  const data = { ...payload };
  const firstName = str(data.firstName);
  const lastName = str(data.lastName);
  let name = str(data.name);
  if (firstName || lastName) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim();
  }
  if (!name && (firstName || lastName)) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim();
  }

  const prevMeta = data.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : {};
  const emails = normalizeEmailEntries(
    data.emails || prevMeta.emails,
    data.email,
  );
  const phones = normalizePhoneEntries(
    data.phones || prevMeta.phones,
    { phone: data.phone, mobilePhone: data.mobilePhone },
  );
  const links = normalizeLinkEntries(data.links || prevMeta.links);
  const addresses = normalizeAddressEntries(data.addresses || prevMeta.addresses);

  data.firstName = firstName;
  data.lastName = lastName;
  data.name = name;
  data.email = primaryFromEntries(emails) || str(data.email);
  data.phone = primaryFromEntries(phones, 'office') || str(data.phone);
  data.mobilePhone = primaryFromEntries(phones, 'mobile') || str(data.mobilePhone);
  data.metadata = { ...prevMeta, emails, phones, links, addresses };
  delete data.emails;
  delete data.phones;
  delete data.links;
  delete data.addresses;

  if (data.distributionEmail !== undefined) data.distributionEmail = Boolean(data.distributionEmail);
  if (data.distributionSms !== undefined) data.distributionSms = Boolean(data.distributionSms);
  if (data.distributionWhatsapp !== undefined) {
    data.distributionWhatsapp = Boolean(data.distributionWhatsapp);
  }

  return data;
};

const assertContactName = (payload = {}) => {
  const normalized = normalizeContactPayload(payload);
  if (!str(normalized.name)) {
    const err = new Error('Name is required');
    err.status = 400;
    throw err;
  }
  return normalized;
};

const buildClientContactWhere = (clientId, { organizationId = null, organizationTmpId = null } = {}) => {
  const where = { clientId };
  if (organizationId) {
    where.organizationId = String(organizationId);
    return where;
  }
  if (organizationTmpId) {
    where[Op.and] = [
      sequelize.literal(
        `COALESCE(metadata->>'organizationTmpId', '') = ${sequelize.escape(String(organizationTmpId))}`,
      ),
    ];
  }
  return where;
};

const listByClientId = async (clientId, opts = {}) =>
  ClientContact.findAll({
    where: buildClientContactWhere(clientId, opts),
    order: [['createdAt', 'ASC']],
  });

const listAllWithClient = async ({ clientId = null } = {}) => {
  const rows = await ClientContact.findAll({
    where: clientId ? { clientId: String(clientId) } : undefined,
    include: [CLIENT_INCLUDE, ORGANIZATION_INCLUDE],
    order: [['updatedAt', 'DESC']],
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      ...j,
      organizationName: j.organization?.name || j.organization?.nameEn || null,
      organizationLogo: j.organization?.logo || null,
    };
  });
};

const listByClientIdWithClient = async (clientId, opts = {}) => {
  const rows = await ClientContact.findAll({
    where: buildClientContactWhere(clientId, opts),
    include: [CLIENT_INCLUDE, ORGANIZATION_INCLUDE],
    order: [['createdAt', 'ASC']],
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      ...j,
      organizationName: j.organization?.name || j.organization?.nameEn || null,
      organizationLogo: j.organization?.logo || null,
    };
  });
};

const createForClient = async (clientId, payload = {}) => {
  const data = assertContactName(payload);
  data.clientId = clientId;
  if (data.organizationId != null && String(data.organizationId).trim() === '') {
    data.organizationId = null;
  }
  const tmpId = data.organizationTmpId != null ? String(data.organizationTmpId).trim() : '';
  if (tmpId) {
    data.metadata = {
      ...(data.metadata && typeof data.metadata === 'object' ? data.metadata : {}),
      organizationTmpId: tmpId,
    };
    data.organizationId = null;
  }
  delete data.organizationTmpId;
  return ClientContact.create(data);
};

const update = async (id, payload = {}) => {
  const row = await ClientContact.findByPk(id);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const rowPlain = row.toJSON ? row.toJSON() : row.get({ plain: true });
  let data = { ...payload };
  if (
    Object.prototype.hasOwnProperty.call(data, 'name')
    || Object.prototype.hasOwnProperty.call(data, 'firstName')
    || Object.prototype.hasOwnProperty.call(data, 'lastName')
    || Object.prototype.hasOwnProperty.call(data, 'emails')
    || Object.prototype.hasOwnProperty.call(data, 'phones')
    || Object.prototype.hasOwnProperty.call(data, 'links')
    || Object.prototype.hasOwnProperty.call(data, 'addresses')
    || Object.prototype.hasOwnProperty.call(data, 'email')
    || Object.prototype.hasOwnProperty.call(data, 'phone')
    || Object.prototype.hasOwnProperty.call(data, 'mobilePhone')
  ) {
    data = assertContactName({ ...rowPlain, ...data });
  } else {
    // Partial PATCH (isActive, groupId, flags) must not wipe name/email/metadata.
    data = normalizeContactPayload({ ...rowPlain, ...data });
  }
  if (Object.prototype.hasOwnProperty.call(data, 'organizationId')
      && data.organizationId != null
      && String(data.organizationId).trim() === '') {
    data.organizationId = null;
  }
  await row.update(data);
  return row;
};

const remove = async (id) => {
  const row = await ClientContact.findByPk(id);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  await deactivateStaffUserForDeletedContact({
    email: row.email,
    clientId: row.clientId,
  }).catch((err) => {
    console.error('[clientContactService.remove] deactivate user failed', err?.message || err);
  });
  await row.destroy();
};

// Groups
const listGroupsByClientId = async (clientId) =>
  ClientContactGroup.findAll({ where: { clientId }, order: [['createdAt', 'ASC']] });

const createGroupForClient = async (clientId, payload) => {
  return ClientContactGroup.create({ clientId, name: payload?.name });
};

const deleteGroup = async (groupId) => {
  const row = await ClientContactGroup.findByPk(groupId);
  if (!row) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
};

const migrateContactsFromTmpToOrg = async (organizationTmpId, organizationId) => {
  const tmpId = String(organizationTmpId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!tmpId || !orgId) return 0;

  const rows = await ClientContact.findAll({
    where: {
      [Op.and]: [
        sequelize.literal(
          `COALESCE(metadata->>'organizationTmpId', '') = ${sequelize.escape(tmpId)}`,
        ),
      ],
    },
  });

  let migrated = 0;
  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
    delete meta.organizationTmpId;
    await row.update({ organizationId: orgId, metadata: meta });
    migrated += 1;
  }
  return migrated;
};

const getByIdForClient = async (clientId, contactId) => {
  const cid = String(clientId || '').trim();
  const contactPk = String(contactId || '').trim();
  if (!cid || !contactPk) return null;

  const row = await ClientContact.findOne({
    where: { id: contactPk, clientId: cid },
    include: [CLIENT_INCLUDE, ORGANIZATION_INCLUDE],
  });
  if (!row) return null;

  const j = row.toJSON ? row.toJSON() : row;
  return {
    ...j,
    organizationName: j.organization?.name || j.organization?.nameEn || null,
    organizationLogo: j.organization?.logo || null,
  };
};

/** Jobs whose `contacts` JSONB lists this client contact (kind contact + id). */
const listJobsForContact = async (clientId, contactId) => {
  const cid = String(clientId || '').trim();
  const contactPk = String(contactId || '').trim();
  if (!cid || !contactPk) return null;

  const contact = await ClientContact.findOne({
    where: { id: contactPk, clientId: cid },
    attributes: ['id'],
    raw: true,
  });
  if (!contact) return null;

  const escapedContactId = sequelize.escape(contactPk);
  const rows = await Job.findAll({
    where: {
      clientId: cid,
      [Op.and]: [
        sequelize.literal(`
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE("Job"."contacts", '[]'::jsonb)) AS elem
            WHERE elem->>'id' = ${escapedContactId}
              AND (
                elem->>'kind' = 'contact'
                OR elem->>'kind' IS NULL
                OR elem->>'kind' = ''
              )
          )
        `),
      ],
    },
    attributes: [
      'id',
      'title',
      'status',
      'openDate',
      'client',
      'clientId',
      'organizationId',
      'postingCode',
      'field',
      'role',
      'updatedAt',
      'associatedCandidates',
      'publicJobTitle',
      'createdAt',
    ],
    order: [
      ['openDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: 200,
  });

  return rows.map((row) => (row.get ? row.get({ plain: true }) : row));
};

module.exports = {
  listByClientId,
  listByClientIdWithClient,
  listAllWithClient,
  createForClient,
  update,
  remove,
  listGroupsByClientId,
  createGroupForClient,
  deleteGroup,
  migrateContactsFromTmpToOrg,
  getByIdForClient,
  listJobsForContact,
};

