const { Op } = require('sequelize');
const Organization = require('../models/Organization');
const OrganizationChangeHistory = require('../models/OrganizationChangeHistory');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Client = require('../models/Client');
const User = require('../models/User');

const UUID_RE = /^[0-9a-f-]{36}$/i;

const mapHebrewAction = (action) => {
  const s = String(action || '').trim();
  if (s === 'יצירה') return 'create';
  if (s === 'מחיקה') return 'delete';
  if (s === 'create' || s === 'update' || s === 'delete') return s;
  return 'update';
};

const resolveHistoryActorDisplay = (plain, userMap) => {
  const actor = plain.actor;
  const changes = plain.changes || {};
  const user = userMap.get(String(actor));

  if (user?.name) return user.name;
  if (user?.email) return user.email;
  if (changes.actorName) return changes.actorName;
  if (changes.actorEmail) return changes.actorEmail;

  if (actor && typeof actor === 'string' && !UUID_RE.test(actor) && actor !== 'system') {
    return actor;
  }

  if (actor && actor !== 'system') return null;
  return null;
};

const collectInlineHistory = (org) => {
  const rows = Array.isArray(org?.history) ? org.history : [];
  return rows
    .map((row, index) => {
      const details = String(row?.details || row?.summary || row?.title || '').trim();
      const timestamp = row?.timestamp || row?.date || row?.createdAt || null;
      const actor = row?.user || row?.creator || row?.actor || null;
      if (!details && !timestamp) return null;
      return {
        id: row?.id || `inline-${index}`,
        organizationId: org.id,
        action: mapHebrewAction(row?.action),
        actor: actor || 'system',
        actorDisplayName: actor || null,
        userName: actor || null,
        summary: details || null,
        changes: details ? { meta: { summary: details } } : undefined,
        createdAt: timestamp,
        created_at: timestamp,
        source: 'inline',
      };
    })
    .filter(Boolean);
};

const flattenEventActivity = (event, organizationId) => {
  if (!event || String(event.organizationId || '') !== String(organizationId)) return [];

  const entries = [];
  const eventTitle = String(event.title || event.process || 'אירוע').trim();
  const eventDate = event.date || event.createdAt || event.dueDate || null;
  const creator = event.creator || event.coordinator || null;

  if (eventTitle) {
    entries.push({
      id: `event-create-${event.id}`,
      organizationId,
      action: 'create',
      actor: creator || 'system',
      actorDisplayName: creator || null,
      userName: creator || null,
      summary: `אירוע נוצר: ${eventTitle}`,
      changes: { meta: { summary: `אירוע נוצר: ${eventTitle}` } },
      createdAt: eventDate,
      created_at: eventDate,
      source: 'event',
    });
  }

  const activityRows = [];
  const pushRow = (row) => {
    if (!row || typeof row !== 'object') return;
    const title = String(row.title || row.summary || '').trim();
    if (!title) return;
    activityRows.push({
      title,
      date: row.date || row.timestamp || null,
      creator: row.creator || row.user || creator || null,
    });
  };

  (Array.isArray(event.updates) ? event.updates : []).forEach(pushRow);
  (Array.isArray(event.history) ? event.history : []).forEach(pushRow);

  const seen = new Set();
  activityRows.forEach((row, index) => {
    const key = `${row.title}|${row.date}|${row.creator}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      id: `event-${event.id}-${index}`,
      organizationId,
      action: 'update',
      actor: row.creator || 'system',
      actorDisplayName: row.creator || null,
      userName: row.creator || null,
      summary: row.title,
      changes: { meta: { summary: row.title } },
      createdAt: row.date,
      created_at: row.date,
      source: 'event',
    });
  });

  return entries;
};

const collectClientEventHistory = async (organizationId) => {
  const links = await ClientOrganizationLink.findAll({
    where: { organizationId },
    attributes: ['clientId'],
  });
  const clientIds = [...new Set(links.map((link) => link.clientId).filter(Boolean))];
  if (!clientIds.length) return [];

  const clients = await Client.findAll({
    where: { id: { [Op.in]: clientIds } },
    attributes: ['id', 'events'],
  });

  const entries = [];
  for (const client of clients) {
    const events = Array.isArray(client.events) ? client.events : [];
    for (const event of events) {
      entries.push(...flattenEventActivity(event, organizationId));
    }
  }
  return entries;
};

const mapChangeHistoryRows = (rows, userMap) => rows.map((entry) => {
  const plain = entry.toJSON ? entry.toJSON() : entry.get({ plain: true });
  const actor = plain.actor;
  const user = userMap.get(String(actor));
  const actorDisplayName = resolveHistoryActorDisplay(plain, userMap);
  const createdAt =
    plain.createdAt ||
    plain.created_at ||
    plain.updatedAt ||
    plain.updated_at ||
    null;
  return {
    ...plain,
    createdAt,
    created_at: createdAt,
    actorDisplayName,
    userName: user?.name || plain.changes?.actorName || null,
    userEmail: user?.email || plain.changes?.actorEmail || null,
    source: 'profile',
  };
});

const entryTimestamp = (entry) => {
  const raw = entry?.createdAt || entry?.created_at || null;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

const dedupeEntries = (entries) => {
  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const summary = String(entry.summary || entry.changes?.meta?.summary || '').trim();
    const key = entry.id || `${entry.source}|${summary}|${entry.createdAt || entry.created_at}|${entry.actor}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
};

const listOrganizationHistory = async (organizationId) => {
  const org = await Organization.findByPk(organizationId, { attributes: ['id', 'history'] });
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const changeRows = await OrganizationChangeHistory.findAll({
    where: { organizationId },
    order: [['created_at', 'DESC']],
  });

  const actorIds = [
    ...new Set(
      changeRows
        .map((row) => row.actor)
        .filter((actor) => actor && actor !== 'system' && UUID_RE.test(String(actor))),
    ),
  ];

  const users = actorIds.length
    ? await User.findAll({
        where: { id: { [Op.in]: actorIds } },
        attributes: ['id', 'name', 'email'],
      })
    : [];
  const userMap = new Map(users.map((user) => [String(user.id), user.get({ plain: true })]));

  const merged = dedupeEntries([
    ...mapChangeHistoryRows(changeRows, userMap),
    ...collectInlineHistory(org.get({ plain: true })),
    ...(await collectClientEventHistory(organizationId)),
  ]);

  merged.sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return merged;
};

module.exports = {
  listOrganizationHistory,
};
