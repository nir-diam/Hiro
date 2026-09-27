const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');
const ClientTask = require('../models/ClientTask');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const clientHealthRuleService = require('./clientHealthRuleService');

const DAY_MS = 86_400_000;
const PULSE_CACHE_MS = 45_000;

const OPEN_JOB_STATUSES = ['פתוחה'];

/** @type {Map<string, { at: number, data: Record<string, unknown> }>} */
const pulseCache = new Map();

function toTrafficLight(color) {
  const c = String(color || 'gray');
  if (c === 'red') return 'red';
  if (c === 'orange' || c === 'yellow' || c === 'purple') return 'yellow';
  if (c === 'green' || c === 'blue') return 'green';
  return 'yellow';
}

function conditionLabel(condition) {
  switch (condition) {
    case 'days_since_contact':
      return 'ימים ללא קשר';
    case 'open_opportunities':
      return 'משרות פתוחות';
    case 'active_placements':
      return 'השמות פעילות';
    case 'no_future_activity':
      return 'אין פעילות עתידית';
    default:
      return condition;
  }
}

function compare(operator, left, right) {
  switch (operator) {
    case 'gt':
      return left > right;
    case 'lt':
      return left < right;
    case 'eq':
      return left === right;
    case 'is_true':
      return Boolean(left) === true;
    case 'is_false':
      return Boolean(left) === false;
    default:
      return false;
  }
}

function evaluateRules(rules, metrics) {
  const enabled = (Array.isArray(rules) ? rules : [])
    .filter((r) => r && r.enabled !== false)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));

  for (const rule of enabled) {
    let left;
    switch (rule.condition) {
      case 'days_since_contact':
        left = metrics.daysSinceLastContact;
        break;
      case 'open_opportunities':
        left = metrics.openOpportunities;
        break;
      case 'active_placements':
        left = metrics.activePlacements;
        break;
      case 'no_future_activity':
        left = metrics.noFutureActivity;
        break;
      default:
        continue;
    }

    const op = rule.condition === 'no_future_activity' ? 'is_true' : rule.operator;
    const right = rule.condition === 'no_future_activity' ? true : Number(rule.value) || 0;
    if (!compare(op, left, right)) continue;

    const level = toTrafficLight(rule.color);
    let message = `${conditionLabel(rule.condition)}`;
    if (rule.condition === 'days_since_contact') {
      message = `${metrics.daysSinceLastContact} ימים ללא קשר`;
    } else if (rule.condition === 'open_opportunities') {
      message = `${metrics.openOpportunities} משרות פתוחות`;
    } else if (rule.condition === 'active_placements') {
      message = `${metrics.activePlacements} השמות פעילות`;
    } else if (rule.condition === 'no_future_activity') {
      message = 'אין פעילות עתידית מתוכננת';
    }

    return {
      level,
      color: rule.color,
      message,
      pulse: level === 'red',
      matchedRuleId: rule.id || null,
      metrics,
    };
  }

  return {
    level: 'green',
    color: 'green',
    message: 'תקין: אף חוק אזהרה לא התקיים',
    pulse: false,
    matchedRuleId: null,
    metrics,
  };
}

function maxDate(...vals) {
  let best = null;
  for (const v of vals) {
    if (!v) continue;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

function groupRowsByOrganizationId(rows) {
  const map = new Map();
  for (const row of rows) {
    const plain = row?.toJSON ? row.toJSON() : row;
    const organizationId = String(plain?.organizationId || '').trim();
    if (!organizationId) continue;
    if (!map.has(organizationId)) map.set(organizationId, []);
    map.get(organizationId).push(plain);
  }
  return map;
}

function indexEventsByOrganizationId(events) {
  const map = new Map();
  for (const ev of events) {
    const organizationId = String(ev?.organizationId || '').trim();
    if (!organizationId) continue;
    if (!map.has(organizationId)) map.set(organizationId, []);
    map.get(organizationId).push(ev);
  }
  return map;
}

function computeMetricsFromPrepared({
  contacts,
  tasks,
  openOpportunities,
  orgEvents,
  organizationId,
  linkCreatedAt,
}) {
  let lastTouch = null;
  for (const c of contacts) {
    lastTouch = maxDate(lastTouch, c.updatedAt, c.createdAt);
  }
  for (const t of tasks) {
    lastTouch = maxDate(lastTouch, t.updatedAt, t.createdAt);
    const history = Array.isArray(t.history) ? t.history : [];
    for (const h of history) {
      lastTouch = maxDate(lastTouch, h?.date);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let hasFuture = false;

  for (const ev of orgEvents) {
    lastTouch = maxDate(lastTouch, ev.date, ev.start, ev.createdAt, ev.updatedAt);
    const ed = ev.date || ev.start;
    if (ed) {
      const d = new Date(ed);
      if (!Number.isNaN(d.getTime()) && d >= today) hasFuture = true;
    }
  }

  for (const t of tasks) {
    if (String(t.status) === 'done') continue;
    if (!t.dueDate) continue;
    const d = new Date(t.dueDate);
    if (!Number.isNaN(d.getTime()) && d >= today) hasFuture = true;
  }

  if (!lastTouch) {
    lastTouch = linkCreatedAt ? new Date(linkCreatedAt) : new Date(0);
  }

  const daysSinceLastContact = Math.max(
    0,
    Math.floor((Date.now() - lastTouch.getTime()) / DAY_MS),
  );

  return {
    daysSinceLastContact,
    openOpportunities: Number(openOpportunities) || 0,
    activePlacements: 0,
    noFutureActivity: !hasFuture,
    lastTouchAt: lastTouch.toISOString(),
  };
}

async function loadSharedPulseData(clientId, orgIds) {
  if (!orgIds.length) {
    return {
      events: [],
      contactsByOrg: new Map(),
      tasksByOrg: new Map(),
      jobCountByOrg: new Map(),
    };
  }

  const [clientRow, contacts, tasks, jobCountRows] = await Promise.all([
    Client.findByPk(clientId, { attributes: ['id', 'events'] }),
    ClientContact.findAll({
      where: { clientId, organizationId: { [Op.in]: orgIds } },
      attributes: ['organizationId', 'updatedAt', 'createdAt'],
    }),
    ClientTask.findAll({
      where: { clientId, organizationId: { [Op.in]: orgIds } },
      attributes: ['organizationId', 'updatedAt', 'createdAt', 'dueDate', 'status', 'history'],
    }),
    sequelize.query(
      `SELECT organization_id AS "organizationId", COUNT(*)::int AS count
       FROM jobs
       WHERE organization_id IN (:orgIds)
         AND status IN (:statuses)
       GROUP BY organization_id`,
      {
        replacements: { orgIds, statuses: OPEN_JOB_STATUSES },
        type: QueryTypes.SELECT,
      },
    ),
  ]);

  const jobCountByOrg = new Map(
    (jobCountRows || []).map((row) => [String(row.organizationId), Number(row.count) || 0]),
  );

  const events = Array.isArray(clientRow?.events) ? clientRow.events : [];
  return {
    events,
    eventsByOrg: indexEventsByOrganizationId(events),
    contactsByOrg: groupRowsByOrganizationId(contacts),
    tasksByOrg: groupRowsByOrganizationId(tasks),
    jobCountByOrg,
  };
}

function computeOrgMetricsFromShared(organizationId, linkCreatedAt, shared) {
  const orgId = String(organizationId);
  return computeMetricsFromPrepared({
    contacts: shared.contactsByOrg.get(orgId) || [],
    tasks: shared.tasksByOrg.get(orgId) || [],
    openOpportunities: shared.jobCountByOrg.get(orgId) || 0,
    orgEvents: shared.eventsByOrg.get(orgId) || [],
    organizationId: orgId,
    linkCreatedAt,
  });
}

async function computeOrgMetrics(clientId, organizationId, linkCreatedAt) {
  const orgId = String(organizationId);
  const loaded = await loadSharedPulseData(clientId, [orgId]);
  return computeMetricsFromPrepared({
    contacts: loaded.contactsByOrg.get(orgId) || [],
    tasks: loaded.tasksByOrg.get(orgId) || [],
    openOpportunities: loaded.jobCountByOrg.get(orgId) || 0,
    orgEvents: loaded.eventsByOrg.get(orgId) || [],
    organizationId: orgId,
    linkCreatedAt,
  });
}

/**
 * Evaluate pulse for all approved linked orgs of a client.
 * Returns { [organizationId]: { level, message, pulse, color, metrics } }
 */
async function evaluatePulseForClient(clientId, pipelineId = null) {
  const cacheKey = `${clientId}:${pipelineId || 'default'}`;
  const hit = pulseCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PULSE_CACHE_MS) {
    return hit.data;
  }

  const links = await ClientOrganizationLink.findAll({
    where: {
      clientId,
      organizationId: { [Op.ne]: null },
    },
    attributes: ['organizationId', 'created_at'],
  });

  const orgIds = [...new Set(links.map((link) => String(link.organizationId)).filter(Boolean))];
  const linkByOrg = new Map(links.map((link) => [String(link.organizationId), link]));

  const [shared, { rulesByOrg }] = await Promise.all([
    loadSharedPulseData(clientId, orgIds),
    clientHealthRuleService.listRulesForPulseBatch(clientId, orgIds, pipelineId),
  ]);

  const byOrganizationId = {};
  for (const organizationId of orgIds) {
    try {
      const link = linkByOrg.get(organizationId);
      const linkCreatedAt = link?.createdAt || link?.get?.('created_at') || link?.created_at;
      const rules = rulesByOrg.get(organizationId) || [];
      const metrics = computeOrgMetricsFromShared(organizationId, linkCreatedAt, shared);
      byOrganizationId[organizationId] = evaluateRules(rules, metrics);
    } catch (err) {
      byOrganizationId[organizationId] = {
        level: 'yellow',
        color: 'yellow',
        message: err.message || 'שגיאה בחישוב דופק',
        pulse: false,
        matchedRuleId: null,
        metrics: null,
      };
    }
  }

  pulseCache.set(cacheKey, { at: Date.now(), data: byOrganizationId });
  return byOrganizationId;
}

async function evaluatePulseForOrganization(clientId, organizationId, pipelineId = null) {
  const cacheKey = `${clientId}:${organizationId}:${pipelineId || 'default'}`;
  const hit = pulseCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PULSE_CACHE_MS) {
    return hit.data;
  }

  const link = await ClientOrganizationLink.findOne({
    where: { clientId, organizationId },
  });
  if (!link) {
    const err = new Error('Organization is not linked to this client');
    err.status = 400;
    throw err;
  }
  const linkCreatedAt = link.createdAt || link.get?.('created_at') || link.created_at;
  const { rulesByOrg } = await clientHealthRuleService.listRulesForPulseBatch(
    clientId,
    [String(organizationId)],
    pipelineId,
  );
  const rules = rulesByOrg.get(String(organizationId)) || [];
  const metrics = await computeOrgMetrics(clientId, organizationId, linkCreatedAt);
  const result = evaluateRules(rules, metrics);
  pulseCache.set(cacheKey, { at: Date.now(), data: result });
  return result;
}

module.exports = {
  evaluatePulseForClient,
  evaluatePulseForOrganization,
  evaluateRules,
  toTrafficLight,
};
