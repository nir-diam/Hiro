const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const Organization = require('../models/Organization');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Job = require('../models/Job');
const {
  companyNameLookupVariants,
  resolveOrgIdFromLabelMap,
  resolveOrgIdFromLabelMapExact,
} = require('../utils/companyNameMatch');

const normalizeOrgLabel = (value) => String(value || '').toLowerCase().trim();

const collectOrgLabels = (org, { includeAliases = true } = {}) => {
  if (!org) return [];
  const plain = org.get ? org.get({ plain: true }) : org;
  const labels = [plain.name, plain.nameEn, plain.legalName];
  if (includeAliases && Array.isArray(plain.aliases)) {
    labels.push(...plain.aliases);
  }
  return labels.map(normalizeOrgLabel).filter(Boolean);
};

const addOrgToMap = (map, org, opts = {}) => {
  if (!org?.id) return;
  const id = String(org.id);
  for (const label of collectOrgLabels(org, opts)) {
    if (!map.has(label)) map.set(label, id);
  }
};

/**
 * Build normalized label → organizationId map.
 * Prefer orgs linked to the given clientIds; also match by exact name/alias globally
 * for any remaining labels.
 */
const buildOrganizationLabelMap = async ({
  clientIds = [],
  extraLabels = [],
  linkedCanonicalOnly = false,
} = {}) => {
  const map = new Map();
  const ids = [...new Set((clientIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const aliasOpts = linkedCanonicalOnly ? { includeAliases: false } : {};

  if (ids.length) {
    const links = await ClientOrganizationLink.findAll({
      where: { clientId: { [Op.in]: ids } },
      include: [
        {
          model: Organization,
          as: 'organization',
          required: true,
          attributes: ['id', 'name', 'nameEn', 'legalName', 'aliases'],
        },
      ],
    });
    for (const link of links) {
      addOrgToMap(map, link.organization, aliasOpts);
    }
  }

  if (linkedCanonicalOnly) {
    return map;
  }

  const missingLabels = [...new Set(
    (extraLabels || [])
      .flatMap((label) => companyNameLookupVariants(label))
      .map(normalizeOrgLabel)
      .filter((label) => label && !map.has(label)),
  )];

  if (missingLabels.length) {
    const or = [];
    for (const label of missingLabels.slice(0, 200)) {
      or.push({ name: { [Op.iLike]: label } });
      or.push({ nameEn: { [Op.iLike]: label } });
      or.push({ legalName: { [Op.iLike]: label } });
      or.push({ name: { [Op.iLike]: `%${label}%` } });
      // Avoid Sequelize ARRAY @> varchar[] (Postgres: text[] @> character varying[] fails).
      // Match aliases case-insensitively via unnest.
      or.push(
        sequelize.literal(
          `EXISTS (SELECT 1 FROM unnest("aliases") AS a(val) WHERE lower(a.val) = lower(${sequelize.escape(label)}))`,
        ),
      );
    }
    const orgs = await Organization.findAll({
      where: { [Op.or]: or },
      attributes: ['id', 'name', 'nameEn', 'legalName', 'aliases'],
      limit: 500,
    });
    for (const org of orgs) {
      addOrgToMap(map, org);
    }
  }

  return map;
};

const resolvePrimaryOrganizationIdForClient = async (clientId) => {
  const cid = String(clientId || '').trim();
  if (!cid) return null;
  const link = await ClientOrganizationLink.findOne({
    where: { clientId: cid, organizationId: { [Op.ne]: null } },
    order: [
      ['isPrimary', 'DESC'],
      ['created_at', 'ASC'],
    ],
    attributes: ['organizationId'],
  });
  return link?.organizationId ? String(link.organizationId) : null;
};

/**
 * Resolve organizationId for a single job payload (create/update).
 */
const resolveOrganizationIdForJob = async ({
  organizationId = null,
  client = null,
  clientId = null,
} = {}) => {
  if (organizationId) return String(organizationId);
  const cid = clientId ? String(clientId).trim() : '';

  if (cid) {
    const map = await buildOrganizationLabelMap({
      clientIds: [cid],
      extraLabels: client ? [client] : [],
      linkedCanonicalOnly: true,
    });
    if (client) {
      const exact = resolveOrgIdFromLabelMapExact(client, map);
      if (exact) return exact;
    }
    return resolvePrimaryOrganizationIdForClient(cid);
  }

  const clientName = normalizeOrgLabel(client);
  if (!clientName) return null;

  const map = await buildOrganizationLabelMap({
    clientIds: [],
    extraLabels: [client],
  });
  return resolveOrgIdFromLabelMap(client, map);
};

/**
 * Job description AI analyze — suggest org only on exact name match (no fuzzy / no primary fallback).
 */
const resolveOrganizationIdForAnalyze = async ({ client = null, clientId = null } = {}) => {
  const label = String(client || '').trim();
  if (!label) return null;
  const cid = clientId ? String(clientId).trim() : '';

  const map = await buildOrganizationLabelMap({
    clientIds: cid ? [cid] : [],
    extraLabels: [label],
    linkedCanonicalOnly: Boolean(cid),
  });
  return resolveOrgIdFromLabelMapExact(label, map);
};

/**
 * Attach organizationId onto job rows when missing (by Job.client ↔ org name/aliases).
 * Optionally persist resolved ids back to the jobs table.
 */
const enrichJobsWithOrganizationIds = async (jobs, { persist = true } = {}) => {
  if (!Array.isArray(jobs) || !jobs.length) return jobs || [];

  const needing = [];
  const clientIds = [];
  const labels = [];

  for (const job of jobs) {
    const plain = typeof job.get === 'function' ? job.get({ plain: true }) : job;
    if (plain?.organizationId) continue;
    const label = normalizeOrgLabel(plain?.client);
    if (!label) continue;
    needing.push(job);
    labels.push(label);
    if (plain.clientId) clientIds.push(String(plain.clientId));
  }

  if (!needing.length) return jobs;

  const map = await buildOrganizationLabelMap({ clientIds, extraLabels: labels });
  const updates = [];

  for (const job of needing) {
    const isModel = typeof job.get === 'function';
    const plain = isModel ? job.get({ plain: true }) : job;
    const resolved = resolveOrgIdFromLabelMap(plain.client, map);
    if (!resolved) continue;

    if (isModel) {
      job.setDataValue('organizationId', resolved);
    } else {
      job.organizationId = resolved;
    }
    if (plain.id) {
      updates.push({ id: String(plain.id), organizationId: resolved });
    }
  }

  if (persist && updates.length) {
    // Fire-and-forget persistence so list latency stays low.
    Promise.resolve()
      .then(async () => {
        const byOrg = new Map();
        for (const u of updates) {
          if (!byOrg.has(u.organizationId)) byOrg.set(u.organizationId, []);
          byOrg.get(u.organizationId).push(u.id);
        }
        for (const [organizationId, ids] of byOrg.entries()) {
          await Job.update(
            { organizationId },
            {
              where: {
                id: { [Op.in]: ids },
                organizationId: null,
              },
            },
          );
        }
      })
      .catch((err) => {
        console.warn('[jobOrganizationResolve] persist failed:', err?.message || err);
      });
  }

  return jobs;
};

module.exports = {
  normalizeOrgLabel,
  resolveOrganizationIdForJob,
  resolveOrganizationIdForAnalyze,
  resolvePrimaryOrganizationIdForClient,
  enrichJobsWithOrganizationIds,
  buildOrganizationLabelMap,
};
