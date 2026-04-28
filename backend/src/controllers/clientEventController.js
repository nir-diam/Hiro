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
  return { ...event, type: normalizeTypes(event.type) };
};

const list = async (req, res) => {
  const client = await clientService.getById(req.params.id);
  const rows = Array.isArray(client.events) ? client.events : [];
  res.json(rows.map(normalizeEventRow));
};

const create = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const payload = req.body || {};
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
    const merged = { ...payload };
    if (Object.prototype.hasOwnProperty.call(payload, 'type')) {
      merged.type = normalizeTypes(payload.type);
    }
    const next = prev.map((e) => (String(e.id) === eventId ? { ...e, ...merged, id: e.id } : e));
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

module.exports = { list, create, update, remove };

