const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const Job = require('../models/Job');
const Organization = require('../models/Organization');
const Client = require('../models/Client');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');

const collectOrgLabels = (plainOrg) => {
  const labels = new Set(
    [
      plainOrg?.name,
      plainOrg?.nameEn,
      plainOrg?.legalName,
      ...(Array.isArray(plainOrg?.aliases) ? plainOrg.aliases : []),
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean),
  );
  return [...labels];
};

const collectClientLabels = (plainClient) => {
  const labels = new Set(
    [plainClient?.name, plainClient?.displayName, plainClient?.domain]
      .map((v) => String(v || '').trim())
      .filter(Boolean),
  );
  const meta = plainClient?.metadata && typeof plainClient.metadata === 'object' ? plainClient.metadata : {};
  if (meta.legalName) labels.add(String(meta.legalName).trim());
  if (meta.nameEn) labels.add(String(meta.nameEn).trim());
  if (Array.isArray(meta.aliases)) {
    meta.aliases.forEach((a) => {
      const t = String(a || '').trim();
      if (t) labels.add(t);
    });
  }
  return [...labels];
};

const buildJobScopeWhere = ({ organizationId, clientId, labelList }) => {
  const or = [];
  if (organizationId) or.push({ organizationId });
  for (const label of labelList) {
    or.push({ client: { [Op.iLike]: label } });
  }
  if (!or.length) return { id: null };
  const where = { [Op.or]: or };
  if (clientId) where.clientId = clientId;
  return where;
};

async function loadJobInsights(jobWhere) {
  const [statsRow, idRows] = await Promise.all([
    Job.findAll({
      where: jobWhere,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [
          sequelize.literal(
            `SUM(CASE WHEN lower("status"::text) IN ('פתוחה','open') THEN 1 ELSE 0 END)`,
          ),
          'openJobs',
        ],
        [
          sequelize.literal(
            `SUM(CASE WHEN lower("status"::text) IN ('מוקפאת','frozen','paused') THEN 1 ELSE 0 END)`,
          ),
          'frozenJobs',
        ],
        [
          sequelize.literal(
            `SUM(CASE WHEN lower("status"::text) IN ('סגורה','closed') THEN 1 ELSE 0 END)`,
          ),
          'closedJobs',
        ],
      ],
      raw: true,
    }),
    Job.findAll({
      where: jobWhere,
      attributes: ['id'],
      raw: true,
    }),
  ]);

  const stats = statsRow?.[0] || {};
  return {
    openJobs: Number(stats.openJobs) || 0,
    frozenJobs: Number(stats.frozenJobs) || 0,
    closedJobs: Number(stats.closedJobs) || 0,
    jobIds: idRows.map((row) => String(row.id)).filter(Boolean),
  };
}

async function countReferralsByJobIds(jobIds) {
  if (!jobIds.length) {
    return { week: 0, month: 0, year: 0, hiredCount: 0 };
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [referralRows, hiredRows] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE nm."createdAt" >= :weekStart)::int AS week,
         COUNT(*) FILTER (WHERE nm."createdAt" >= :monthStart)::int AS month,
         COUNT(*)::int AS year
       FROM notification_messages nm
       WHERE nm."createdAt" >= :yearStart
         AND nm.metadata->'taskPayload'->>'jobId' IN (:jobIds)`,
      {
        replacements: { weekStart, monthStart, yearStart, jobIds },
        type: sequelize.QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS hired
       FROM notification_messages nm
       WHERE nm.metadata->'taskPayload'->>'jobId' IN (:jobIds)
         AND (
           nm.status ILIKE '%hired%'
           OR nm.metadata->>'referralWorkflowStatus' ILIKE '%hired%'
           OR nm.metadata->>'referralWorkflowStatus' ILIKE '%התקבל%'
         )`,
      {
        replacements: { jobIds },
        type: sequelize.QueryTypes.SELECT,
      },
    ),
  ]);

  const referral = referralRows?.[0] || {};
  const hired = hiredRows?.[0] || {};
  return {
    week: Number(referral.week) || 0,
    month: Number(referral.month) || 0,
    year: Number(referral.year) || 0,
    hiredCount: Number(hired.hired) || 0,
  };
}

async function countReferralsByClientLabels(labelList) {
  if (!labelList.length) {
    return { week: 0, month: 0, year: 0, hiredCount: 0 };
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const nameMatchSql = labelList
    .map((label) => `nm.metadata->'taskPayload'->>'clientName' ILIKE ${sequelize.escape(label)}`)
    .join(' OR ');

  const [referralRows, hiredRows] = await Promise.all([
    sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE nm."createdAt" >= :weekStart)::int AS week,
         COUNT(*) FILTER (WHERE nm."createdAt" >= :monthStart)::int AS month,
         COUNT(*)::int AS year
       FROM notification_messages nm
       WHERE nm."createdAt" >= :yearStart
         AND (${nameMatchSql})`,
      {
        replacements: { weekStart, monthStart, yearStart },
        type: sequelize.QueryTypes.SELECT,
      },
    ),
    sequelize.query(
      `SELECT COUNT(*)::int AS hired
       FROM notification_messages nm
       WHERE (${nameMatchSql})
         AND (
           nm.status ILIKE '%hired%'
           OR nm.metadata->>'referralWorkflowStatus' ILIKE '%hired%'
           OR nm.metadata->>'referralWorkflowStatus' ILIKE '%התקבל%'
         )`,
      { type: sequelize.QueryTypes.SELECT },
    ),
  ]);

  const referral = referralRows?.[0] || {};
  const hired = hiredRows?.[0] || {};
  return {
    week: Number(referral.week) || 0,
    month: Number(referral.month) || 0,
    year: Number(referral.year) || 0,
    hiredCount: Number(hired.hired) || 0,
  };
}

async function loadReferralInsights({ jobIds, labelList }) {
  if (jobIds.length) {
    return countReferralsByJobIds(jobIds);
  }
  return countReferralsByClientLabels(labelList);
}

async function stampOrganizationOnJobs(organizationId, jobIds) {
  if (!organizationId || !jobIds.length) return;
  Job.update(
    { organizationId },
    { where: { id: { [Op.in]: jobIds }, organizationId: null } },
  ).catch(() => {});
}

const getClientInsights = async (clientId) => {
  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'name', 'displayName', 'domain', 'metadata'],
  });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }

  const plainClient = client.get ? client.get({ plain: true }) : client;
  const labelList = collectClientLabels(plainClient);
  const jobWhere = { clientId };

  const jobInsights = await loadJobInsights(jobWhere);
  const referrals = await loadReferralInsights({
    jobIds: jobInsights.jobIds,
    labelList,
  });

  return {
    openJobs: jobInsights.openJobs,
    frozenJobs: jobInsights.frozenJobs,
    closedJobs: jobInsights.closedJobs,
    referrals: { week: referrals.week, month: referrals.month, year: referrals.year },
    hiredCount: referrals.hiredCount,
  };
};

const getOrganizationInsights = async (organizationId, clientId = null) => {
  const org = await Organization.findByPk(organizationId, {
    attributes: ['id', 'name', 'nameEn', 'legalName', 'aliases', 'createdAt'],
  });
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const plainOrg = org.get ? org.get({ plain: true }) : org;
  const labelList = collectOrgLabels(plainOrg);
  const scopedClientId = clientId ? String(clientId).trim() : null;
  const jobWhere = buildJobScopeWhere({
    organizationId: plainOrg.id,
    clientId: scopedClientId,
    labelList,
  });

  const linkPromise =
    scopedClientId && plainOrg.id
      ? ClientOrganizationLink.findOne({
        where: { clientId: scopedClientId, organizationId: plainOrg.id },
        order: [['created_at', 'ASC']],
      })
      : Promise.resolve(null);

  const [jobInsights, link] = await Promise.all([
    loadJobInsights(jobWhere),
    linkPromise,
  ]);

  const referralStats = await loadReferralInsights({
    jobIds: jobInsights.jobIds,
    labelList,
  });

  void stampOrganizationOnJobs(plainOrg.id, jobInsights.jobIds);

  let relationshipStartedAt = plainOrg.createdAt || null;
  if (link?.createdAt) relationshipStartedAt = link.createdAt;

  return {
    openJobs: jobInsights.openJobs,
    frozenJobs: jobInsights.frozenJobs,
    closedJobs: jobInsights.closedJobs,
    referrals: {
      week: referralStats.week,
      month: referralStats.month,
      year: referralStats.year,
    },
    hiredCount: referralStats.hiredCount,
    relationshipStartedAt,
  };
};

module.exports = {
  getClientInsights,
  getOrganizationInsights,
};
