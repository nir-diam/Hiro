const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const Organization = require('../models/Organization');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Job = require('../models/Job');

const normalizeOrgLabel = (value) => String(value || '').toLowerCase().trim();

const collectOrgLabels = (org) => {
  if (!org) return [];
  const plain = org.get ? org.get({ plain: true }) : org;
  return [
    plain.name,
    plain.nameEn,
    plain.legalName,
    ...(Array.isArray(plain.aliases) ? plain.aliases : []),
  ]
    .map(normalizeOrgLabel)
    .filter(Boolean);
};

const addOrgToMap = (map, org) => {
  if (!org?.id) return;
  const id = String(org.id);
  for (const label of collectOrgLabels(org)) {
    if (!map.has(label)) map.set(label, id);
  }
};

/**
 * Build normalized label → organizationId map.
 * Prefer orgs linked to the given clientIds; also match by exact name/alias globally
 * for any remaining labels.
 */
const buildOrganizationLabelMap = async ({ clientIds = [], extraLabels = [] } = {}) => {
  const map = new Map();
  const ids = [...new Set((clientIds || []).map((id) => String(id || '').trim()).filter(Boolean))];

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
      addOrgToMap(map, link.organization);
    }
  }

  const missingLabels = [...new Set(
    (extraLabels || [])
      .map(normalizeOrgLabel)
      .filter((label) => label && !map.has(label)),
  )];

  if (missingLabels.length) {
    const or = [];
    for (const label of missingLabels.slice(0, 200)) {
      or.push({ name: { [Op.iLike]: label } });
      or.push({ nameEn: { [Op.iLike]: label } });
      or.push({ legalName: { [Op.iLike]: label } });
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

/**
 * Resolve organizationId for a single job payload (create/update).
 */
const resolveOrganizationIdForJob = async ({
  organizationId = null,
  client = null,
  clientId = null,
} = {}) => {
  if (organizationId) return String(organizationId);
  const clientName = normalizeOrgLabel(client);
  if (!clientName) return null;

  const map = await buildOrganizationLabelMap({
    clientIds: clientId ? [clientId] : [],
    extraLabels: [clientName],
  });
  return map.get(clientName) || null;
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
    const resolved = map.get(normalizeOrgLabel(plain.client));
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
  enrichJobsWithOrganizationIds,
  buildOrganizationLabelMap,
};
