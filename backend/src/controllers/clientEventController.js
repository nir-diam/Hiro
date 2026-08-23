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

const displayNameFromUser = (u) => {
  if (!u) return 'מערכת';
  const n = u.name && String(u.name).trim();
  if (n) return n;
  const e = u.email && String(u.email).trim();
  if (e) return e;
  return 'משתמש';
};

const list = async (req, res) => {
  const client = await clientService.getById(req.params.id);
  const organizationId = req.query?.organizationId
    ? String(req.query.organizationId).trim()
    : null;
  let rows = Array.isArray(client.events) ? client.events : [];
  if (organizationId) {
    rows = rows.filter((e) => String(e?.organizationId || '') === organizationId);
  }
  res.json(rows.map(normalizeEventRow));
};

/** Cross-client events journal (admin sees all; tenant sees own client only). */
const listAll = async (req, res) => {
  try {
    const Client = require('../models/Client');
    const u = req.dbUser;
    const where = {};
    if (u && u.role !== 'admin' && u.role !== 'super_admin') {
      if (!u.clientId) return res.json([]);
      where.id = u.clientId;
    }
    const clients = await Client.findAll({
      where,
      attributes: ['id', 'name', 'displayName', 'events'],
      order: [['name', 'ASC']],
    });
    const out = [];
    for (const c of clients) {
      const plain = c.toJSON ? c.toJSON() : c;
      const clientId = String(plain.id);
      const clientName = String(plain.displayName || plain.name || '').trim() || 'לקוח';
      const rows = Array.isArray(plain.events) ? plain.events : [];
      for (const e of rows) {
        if (!e || typeof e !== 'object') continue;
        const linked = e.linkedTo && typeof e.linkedTo === 'object' ? e.linkedTo : null;
        const types = normalizeTypes(e.type);
        out.push(
          normalizeEventRow({
            ...e,
            id: String(e.id || ''),
            clientId,
            clientName,
            contactId: e.contactId || linked?.id || null,
            contactName: linked?.name || e.contactName || null,
            process: e.process || types[0] || '',
            processId: e.processId || null,
            stage: e.stage || types[1] || '',
            stageId: e.stageId || null,
            creator: e.creator || e.coordinator || '',
            dueDate: e.dueDate || (e.date ? String(e.date).slice(0, 10) : null),
            updates: (() => {
              const fromUpdates = Array.isArray(e.updates) ? e.updates.filter((u) => u && (u.title || u.summary)) : [];
              const fromHistory = Array.isArray(e.history)
                ? e.history
                    .map((h, i) => ({
                      id: h.id || `h-${i}`,
                      title: h.summary || h.title || '',
                      date: h.timestamp || h.date || '',
                      creator: h.user || h.creator || '',
                    }))
                    .filter((u) => u.title)
                : [];
              if (fromUpdates.length) {
                const mapped = fromUpdates.map((u, i) => ({
                  id: u.id || `u-${i}`,
                  title: u.title || u.summary || '',
                  date: u.date || u.timestamp || '',
                  creator: u.creator || u.user || '',
                }));
                if (!fromHistory.length) return mapped;
                const seen = new Set(mapped.map((u) => `${u.title}|${u.date}|${u.creator}`));
                for (const h of fromHistory) {
                  const key = `${h.title}|${h.date}|${h.creator}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    mapped.push(h);
                  }
                }
                return mapped;
              }
              return fromHistory;
            })(),
          }),
        );
      }
    }
    out.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return res.json(out);
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list events' });
  }
};

const create = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const payload = req.body || {};
    const organizationId = payload.organizationId != null
      ? (String(payload.organizationId).trim() || null)
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
    const client = await clientService.getById(req.params.id);
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
    const client = await clientService.getById(req.params.id);
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

