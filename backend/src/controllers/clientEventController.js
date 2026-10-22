const { v4: uuidv4 } = require('uuid');
const clientService = require('../services/clientService');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

/** Coerce incoming `type` (string | string[] | null) into a clean string[]. */
const normalizeTypes = (raw) => {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter((v) => v.length > 0);
  }
  const s = raw == null ? '' : String(raw).trim();
  return s ? [s] : [];
};

const normalizeEventRow = (event) => {
  if (!event || typeof event !== 'object') return event;
  return {
    ...event,
    type: normalizeTypes(event.type),
    isActive: event.isActive !== false,
  };
};

const {
  appendClientEventActivity,
  EVENT_CLOSED_SUMMARY,
  EVENT_REOPENED_SUMMARY,
} = require('../utils/clientEventHistory');
const {
  parseJournalListQuery,
  filterJournalMappedRows,
} = require('../utils/clientEventJournalQuery');

const displayNameFromUser = (u) => {
  if (!u) return 'מערכת';
  const n = u.name && String(u.name).trim();
  if (n) return n;
  const e = u.email && String(u.email).trim();
  if (e) return e;
  return 'משתמש';
};

const mapUpdateRows = (rows, max = 20) => {
  const list = Array.isArray(rows) ? rows : [];
  // Updates/history are stored newest-first — keep the leading rows when capping.
  const slice = list.length > max ? list.slice(0, max) : list;
  return slice
    .filter((u) => u && (u.title || u.summary))
    .map((u, i) => {
      const comment = u.comment != null ? String(u.comment).trim() : '';
      return {
        id: u.id || `u-${i}`,
        title: u.title || u.summary || '',
        date: u.date || u.timestamp || '',
        creator: u.creator || u.user || '',
        ...(comment ? { comment } : {}),
      };
    });
};

/** Build journal updates — full merge for detail, capped/light for list endpoints. */
const buildEventUpdates = (event, { summary = false } = {}) => {
  const max = summary ? 8 : 24;
  const fromUpdates = mapUpdateRows(event.updates, max);
  if (summary) {
    if (fromUpdates.length) return fromUpdates;
    return mapUpdateRows(event.history, 5);
  }

  const fromHistory = mapUpdateRows(event.history, max);
  if (!fromUpdates.length) return fromHistory;
  if (!fromHistory.length) return fromUpdates;

  const seen = new Set(fromUpdates.map((u) => `${u.title}|${u.date}|${u.creator}`));
  const merged = [...fromUpdates];
  for (const h of fromHistory) {
    const key = `${h.title}|${h.date}|${h.creator}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(h);
    }
  }
  return merged.length > max ? merged.slice(0, max) : merged;
};

const mapClientEventToJournalRow = (event, clientId, clientName, options = {}) => {
  if (!event || typeof event !== 'object') return null;
  const linked = event.linkedTo && typeof event.linkedTo === 'object' ? event.linkedTo : null;
  const types = normalizeTypes(event.type);
  return normalizeEventRow({
    ...event,
    id: String(event.id || ''),
    clientId,
    clientName,
    contactId: event.contactId || linked?.id || null,
    contactName: linked?.name || event.contactName || null,
    linkedToType: linked?.type != null ? String(linked.type) : null,
    process: event.process || types[0] || '',
    processId: event.processId || null,
    stage: event.stage || types[1] || '',
    stageId: event.stageId || null,
    creator: event.creator || event.coordinator || '',
    dueDate: event.dueDate || (event.date ? String(event.date).slice(0, 10) : null),
    updates: buildEventUpdates(event, options),
  });
};

const normalizeEmployerLabel = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Events with a candidate and no stored organization show that candidate's employer, not the tenant client. */
const attachMissingCandidateEmployers = async (events) => {
  const pending = [];
  for (const event of events || []) {
    if (!event || String(event.organizationId || '').trim()) continue;
    const meta = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    const candidateId = String(meta.candidateId || '').trim();
    if (!candidateId) continue;
    pending.push({ event, candidateId });
  }
  if (!pending.length) return;

  const { sequelize } = require('../config/db');
  const { QueryTypes } = require('sequelize');
  const ids = [...new Set(pending.map((row) => row.candidateId))];
  const [orgRows, expRows] = await Promise.all([
    sequelize.query(
      `SELECT co."candidateId" AS "candidateId", o.id, o.name
       FROM candidate_organizations co
       JOIN organizations o ON o.id = co."organizationId"
       WHERE co."candidateId" = ANY($1::uuid[])`,
      { bind: [ids], type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT c.id,
              (
                SELECT elem->>'company'
                FROM jsonb_array_elements(COALESCE(c."companyExperiences", '[]'::jsonb)) elem
                WHERE LOWER(COALESCE(elem->>'isCurrent', '')) IN ('true', 't', '1')
                LIMIT 1
              ) AS "currentCompany"
       FROM candidates c
       WHERE c.id = ANY($1::uuid[])`,
      { bind: [ids], type: QueryTypes.SELECT },
    ),
  ]);

  const orgsByCandidate = new Map();
  for (const row of orgRows) {
    const candidateId = String(row.candidateId);
    if (!orgsByCandidate.has(candidateId)) orgsByCandidate.set(candidateId, []);
    const name = String(row.name || '').trim();
    if (!name) continue;
    orgsByCandidate.get(candidateId).push({ id: String(row.id), name });
  }
  const expByCandidate = new Map();
  for (const row of expRows) {
    expByCandidate.set(String(row.id), String(row.currentCompany || '').trim());
  }

  for (const { event, candidateId } of pending) {
    const orgs = orgsByCandidate.get(candidateId) || [];
    if (!orgs.length) continue;
    const currentCompany = expByCandidate.get(candidateId) || '';
    const chosen = (currentCompany && orgs.find((org) => normalizeEmployerLabel(org.name) === normalizeEmployerLabel(currentCompany)))
      || (orgs.length === 1 ? orgs[0] : null);
    if (!chosen) continue;
    event.organizationId = chosen.id;
    event.metadata = {
      ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
      organizationName: chosen.name,
    };
  }
};

const parsePositiveInt = (raw, fallback, max) => {
  const n = parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};

const eventLinkedContactIds = (event) => {
  const ids = [];
  const direct = String(event?.contactId || '').trim();
  if (direct) ids.push(direct);
  const linkedType = String(event?.linkedTo?.type || '').trim();
  const linkedId = String(event?.linkedTo?.id || '').trim();
  if (linkedId && (linkedType === 'איש קשר' || linkedType === 'מועמד')) ids.push(linkedId);
  const metaContacts = event?.metadata?.linkedContacts;
  if (Array.isArray(metaContacts)) {
    for (const row of metaContacts) {
      const id = String(row?.id || '').trim();
      if (id) ids.push(id);
    }
  }
  return ids;
};

const filterEventsByOrganizationScope = async (rows, { organizationId, organizationTmpId, clientId } = {}) => {
  const orgId = organizationId ? String(organizationId).trim() : '';
  const tmpId = organizationTmpId ? String(organizationTmpId).trim() : '';
  if (!orgId && !tmpId) return rows;

  let contactIds = new Set();
  if (orgId && clientId) {
    const ClientContact = require('../models/ClientContact');
    const contacts = await ClientContact.findAll({
      where: { clientId, organizationId: orgId },
      attributes: ['id'],
    });
    contactIds = new Set(contacts.map((c) => String(c.id)));
  }

  const byId = new Map(rows.map((e) => [String(e?.id || ''), e]));

  const eventMatchesOrg = (e, seen = new Set()) => {
    const eventOrgId = String(e?.organizationId || '').trim();
    const eventTmpId = String(e?.organizationTmpId || '').trim();
    if (tmpId) {
      if (eventTmpId) return eventTmpId === tmpId;
      if (eventOrgId) return false;
    } else if (orgId) {
      if (eventOrgId === orgId) return true;
      if (eventLinkedContactIds(e).some((id) => contactIds.has(id))) return true;
    }
    const parentId = String(e?.metadata?.parentEventId || '').trim();
    if (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (parent) return eventMatchesOrg(parent, seen);
    }
    return false;
  };

  return rows.filter((e) => eventMatchesOrg(e));
};

const list = async (req, res) => {
  try {
    const contactId = req.query?.contactId ? String(req.query.contactId).trim() : '';
    const client = await clientService.getByIdForJournal(req.params.id, {
      contactId: contactId || undefined,
    });
    const organizationId = req.query?.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const organizationTmpId = req.query?.organizationTmpId
      ? String(req.query.organizationTmpId).trim()
      : null;
    const summary = req.query?.summary === '1' || req.query?.summary === 'true';
    const journalQuery = parseJournalListQuery(req.query, req.dbUser);
    const limit = parsePositiveInt(req.query?.limit, 20, 5000);
    let rows = Array.isArray(client.events) ? client.events : [];
    if (!contactId) {
      rows = await filterEventsByOrganizationScope(rows, {
        organizationId,
        organizationTmpId,
        clientId: String(client.id),
      });
    }
    const clientId = String(client.id);
    const clientName = String(client.displayName || client.name || '').trim() || 'לקוח';
    const mapped = rows
      .map((e) => mapClientEventToJournalRow(e, clientId, clientName, { summary }))
      .filter(Boolean);
    try {
      await attachMissingCandidateEmployers(mapped);
    } catch (attachErr) {
      console.warn(
        '[clientEventController] candidate employer attach failed',
        String(attachErr && attachErr.message ? attachErr.message : attachErr).slice(0, 160),
      );
    }
    const filtered = filterJournalMappedRows(mapped, journalQuery);
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    res.json(limit > 0 ? filtered.slice(0, limit) : filtered);
  } catch (err) {
    const timedOut = err?.parent?.code === '57014' || /statement timeout/i.test(String(err?.message || ''));
    const status = err.status || (timedOut ? 504 : 500);
    res.status(status).json({ message: err.message || 'Failed to list events' });
  }
};

/** Cross-client events journal (admin sees all; tenant sees own client only). */
const listAll = async (req, res) => {
  try {
    const Client = require('../models/Client');
    const u = req.dbUser;
    const clientIdFilter = req.query?.clientId ? String(req.query.clientId).trim() : null;
    const organizationId = req.query?.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const organizationTmpId = req.query?.organizationTmpId
      ? String(req.query.organizationTmpId).trim()
      : null;
    const summary = req.query?.summary !== '0' && req.query?.summary !== 'false';
    const journalQuery = parseJournalListQuery(req.query, req.dbUser);
    const limit = parsePositiveInt(req.query?.limit, 20, 2000);

    const where = {};
    if (clientIdFilter) {
      where.id = clientIdFilter;
    } else if (u && u.role !== 'admin' && u.role !== 'super_admin') {
      if (!u.clientId) return res.json([]);
      where.id = u.clientId;
    }

    const clients = await Client.findAll({
      where,
      attributes: ['id', 'name', 'displayName', 'events'],
      order: [['name', 'ASC']],
    });

    const perClientCap = Math.max(80, Math.ceil(limit / Math.max(clients.length, 1)) + 20);

    const out = [];
    for (const c of clients) {
      const plain = c.toJSON ? c.toJSON() : c;
      const clientId = String(plain.id);
      const clientName = String(plain.displayName || plain.name || '').trim() || 'לקוח';
      let rows = Array.isArray(plain.events) ? plain.events : [];
      rows = await filterEventsByOrganizationScope(rows, {
        organizationId,
        organizationTmpId,
        clientId,
      });
      if (rows.length > perClientCap) {
        rows = [...rows]
          .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime())
          .slice(0, perClientCap);
      }
      for (const e of rows) {
        const mapped = mapClientEventToJournalRow(e, clientId, clientName, { summary });
        if (mapped) out.push(mapped);
      }
    }

    try {
      await attachMissingCandidateEmployers(out);
    } catch (attachErr) {
      console.warn(
        '[clientEventController] candidate employer attach failed',
        String(attachErr && attachErr.message ? attachErr.message : attachErr).slice(0, 160),
      );
    }

    const filtered = filterJournalMappedRows(out, journalQuery);
    filtered.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return res.json(filtered.slice(0, limit));
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list events' });
  }
};

const create = async (req, res) => {
  try {
    const client = await clientService.getByIdForJournal(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const payload = req.body || {};
    const organizationId = payload.organizationId != null
      ? (String(payload.organizationId).trim() || null)
      : null;
    const organizationTmpId = payload.organizationTmpId != null
      ? (String(payload.organizationTmpId).trim() || null)
      : null;
    const event = {
      id: payload.id || uuidv4(),
      type: normalizeTypes(payload.type),
      title: payload.title,
      date: payload.date,
      coordinator: payload.coordinator,
      status: payload.status,
      linkedTo: payload.linkedTo ?? null,
      description: payload.description || '',
      history: Array.isArray(payload.history) ? payload.history : [],
      updates: Array.isArray(payload.updates) ? payload.updates : [],
      organizationId,
      organizationTmpId,
                    // Persist process/stage ids for pipeline outcome resolution
      process: payload.process != null ? String(payload.process) : undefined,
      processId: payload.processId != null ? String(payload.processId) : undefined,
      stage: payload.stage != null ? String(payload.stage) : undefined,
      stageId: payload.stageId != null ? String(payload.stageId) : undefined,
      dueDate: payload.dueDate != null ? String(payload.dueDate).slice(0, 10) : undefined,
      creator: payload.creator != null ? String(payload.creator) : payload.coordinator,
      metadata:
        payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
          ? payload.metadata
          : undefined,
      isActive: payload.isActive !== false,
    };
    const next = [event, ...prev];
    await clientService.update(req.params.id, { events: next });

    const clientLabel = client?.name || client?.displayName || null;
    const lowerTypes = (event.type || []).map((t) => String(t || '').toLowerCase());
    const matchesAny = (needles) => lowerTypes.some((t) => needles.includes(t));

    // Audit: 'התקבל עדכון מהלקוח' — fired when this is a client-initiated update.
    if (
      matchesAny(['update', 'client_update', 'client']) ||
      /לקוח|update/i.test(String(event.title || ''))
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CLIENT_UPDATE,
        entityType: 'Client',
        entityId: req.params.id,
        entityName: clientLabel,
        params: {
          name: event.coordinator || clientLabel || '—',
          message: event.description || event.title || '—',
        },
      });
    }

    // Audit: 'הערה חשובה (גורף)' — system-wide important notice flag.
    if (
      matchesAny(['notice', 'system_note', 'important', 'broadcast']) ||
      /חשוב|הערת מערכת|גורף/.test(String(event.title || ''))
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CLIENT_NOTICE,
        entityType: 'Client',
        entityId: req.params.id,
        entityName: clientLabel,
        params: { comment: event.description || event.title || '—' },
      });
    }

    res.status(201).json(event);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const client = await clientService.getByIdForJournal(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const eventId = String(req.params.eventId);
    const payload = req.body || {};
    const prevEvent = prev.find((e) => String(e.id) === eventId);
    if (!prevEvent) return res.status(404).json({ message: 'Event not found' });

    const merged = { ...payload };
    if (Object.prototype.hasOwnProperty.call(payload, 'type')) {
      merged.type = normalizeTypes(payload.type);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'isActive')) {
      const wasActive = prevEvent.isActive !== false;
      const willActive = payload.isActive !== false;
      if (wasActive !== willActive) {
        const actor =
          (payload.creator != null && String(payload.creator).trim()) ||
          (payload.coordinator != null && String(payload.coordinator).trim()) ||
          displayNameFromUser(req.dbUser);
        const summary = willActive ? EVENT_REOPENED_SUMMARY : EVENT_CLOSED_SUMMARY;
        const clientSentUpdates = Object.prototype.hasOwnProperty.call(payload, 'updates');
        const alreadyLogged =
          clientSentUpdates &&
          (Array.isArray(payload.updates) ? payload.updates : []).some(
            (u) =>
              u &&
              (u.title === summary ||
                u.title === EVENT_REOPENED_SUMMARY ||
                u.title === EVENT_CLOSED_SUMMARY ||
                u.title === 'הופעל מחדש'),
          );
        if (!alreadyLogged) {
          const baseForHistory = { ...prevEvent, ...merged };
          if (clientSentUpdates) {
            baseForHistory.updates = Array.isArray(payload.updates) ? payload.updates : prevEvent.updates;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'history')) {
            baseForHistory.history = Array.isArray(payload.history)
              ? payload.history
              : prevEvent.history;
          }
          const withActivity = appendClientEventActivity(baseForHistory, { summary, actor });
          merged.updates = withActivity.updates;
          merged.history = withActivity.history;
        }
      }
    }

    const next = prev.map((e) =>
      String(e.id) === eventId ? { ...e, ...merged, id: e.id } : e,
    );
    await clientService.update(req.params.id, { events: next });
    const updatedEvent = next.find((e) => String(e.id) === eventId);
    if (!updatedEvent) return res.status(404).json({ message: 'Event not found' });
    res.json(normalizeEventRow(updatedEvent));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    const client = await clientService.getByIdForJournal(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const eventId = String(req.params.eventId);
    const next = prev.filter((e) => String(e.id) !== eventId);
    await clientService.update(req.params.id, { events: next });
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, listAll, create, update, remove };

