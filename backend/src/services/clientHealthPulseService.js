const { Op } = require('sequelize');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');
const ClientTask = require('../models/ClientTask');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Job = require('../models/Job');
const clientHealthRuleService = require('./clientHealthRuleService');

const DAY_MS = 86_400_000;

const OPEN_JOB_STATUSES = ['פתוחה'];

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

async function computeOrgMetrics(clientId, organizationId, linkCreatedAt) {
  const [contacts, tasks, openOpportunities, client] = await Promise.all([
    ClientContact.findAll({
      where: { clientId, organizationId },
      attributes: ['updatedAt', 'createdAt'],
    }),
    ClientTask.findAll({
      where: { clientId, organizationId },
      attributes: ['updatedAt', 'createdAt', 'dueDate', 'status', 'history'],
    }),
    Job.count({
      where: {
        organizationId,
        status: { [Op.in]: OPEN_JOB_STATUSES },
      },
    }),
    Client.findByPk(clientId, { attributes: ['id', 'events'] }),
  ]);

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

  const events = Array.isArray(client?.events) ? client.events : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let hasFuture = false;

  for (const ev of events) {
    if (String(ev?.organizationId || '') !== String(organizationId)) continue;
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

  // Never contacted → count days since the org was linked (or "now" if unknown).
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

/**
 * Evaluate pulse for all approved linked orgs of a client.
 * Returns { [organizationId]: { level, message, pulse, color, metrics } }
 */
async function evaluatePulseForClient(clientId, pipelineId = null) {
  const links = await ClientOrganizationLink.findAll({
    where: {
      clientId,
      organizationId: { [Op.ne]: null },
    },
  });

  const byOrganizationId = {};
  await Promise.all(
    links.map(async (link) => {
      const organizationId = String(link.organizationId);
      try {
        const linkCreatedAt = link.createdAt || link.get?.('created_at') || link.created_at;
        const [rules, metrics] = await Promise.all([
          clientHealthRuleService.listOrSeedByScope(clientId, organizationId, pipelineId),
          computeOrgMetrics(clientId, organizationId, linkCreatedAt),
        ]);
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
    }),
  );

  return byOrganizationId;
}

async function evaluatePulseForOrganization(clientId, organizationId, pipelineId = null) {
  const link = await ClientOrganizationLink.findOne({
    where: { clientId, organizationId },
  });
  if (!link) {
    const err = new Error('Organization is not linked to this client');
    err.status = 400;
    throw err;
  }
  const linkCreatedAt = link.createdAt || link.get?.('created_at') || link.created_at;
  const [rules, metrics] = await Promise.all([
    clientHealthRuleService.listOrSeedByScope(clientId, organizationId, pipelineId),
    computeOrgMetrics(clientId, organizationId, linkCreatedAt),
  ]);
  return evaluateRules(rules, metrics);
}

module.exports = {
  evaluatePulseForClient,
  evaluatePulseForOrganization,
  evaluateRules,
  toTrafficLight,
};
