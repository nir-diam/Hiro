const { v4: uuidv4 } = require('uuid');
const candidateService = require('../services/candidateService');

const displayNameFromUser = (u) => {
  if (!u) return '';
  const n = u.name && String(u.name).trim();
  if (n) return n;
  const e = u.email && String(u.email).trim();
  if (e) return e;
  return 'משתמש';
};

const mapHistoryUserLabel = (history, displayName) => {
  if (!Array.isArray(history) || !history.length) {
    return [
      { user: displayName, timestamp: new Date().toISOString(), summary: 'יצר את האירוע' },
    ];
  }
  return history.map((h) => {
    if (!h || typeof h !== 'object') return h;
    const u = h.user;
    if (u === 'אני' || u == null || String(u).trim() === '') {
      return { ...h, user: displayName };
    }
    return h;
  });
};

/**
 * Coerce an incoming `type` value (string, string[], null, undefined) into a
 * clean string[]. Used for both reads (legacy events stored before the
 * multi-select migration) and writes.
 */
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
  const out = { ...event, type: normalizeTypes(event.type) };
  if (event.coordinatorUserId != null) {
    out.coordinatorUserId = String(event.coordinatorUserId);
  }
  return out;
};

const list = async (req, res) => {
  const rows = await candidateService.listMergedEventsForCandidate(req.params.id);
  res.json(rows.map(normalizeEventRow));
};

const create = async (req, res) => {
  try {
    const u = req.dbUser;
    if (!u) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const displayName = displayNameFromUser(u);
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.events) ? candidate.events : [];
    const payload = req.body || {};
    const profileLabel =
      String(candidate.title || '').trim() ||
      String(candidate.fullName || '').trim() ||
      'מועמד';
    const event = {
      id: payload.id || uuidv4(),
      type: normalizeTypes(payload.type),
      date: payload.date,
      coordinator: displayName,
      coordinatorUserId: u.id,
      status: payload.status || 'עתידי',
      linkedTo: Array.isArray(payload.linkedTo) ? payload.linkedTo : [],
      description: payload.description || '',
      notes: payload.notes || '',
      history: mapHistoryUserLabel(payload.history, displayName),
      sourceProfileId: String(req.params.id),
      sourceProfileName: profileLabel,
    };
    const next = [event, ...prev];
    await candidateService.update(req.params.id, { events: next });
    res.status(201).json(normalizeEventRow(event));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const u = req.dbUser;
    if (!u) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const displayName = displayNameFromUser(u);
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.events) ? candidate.events : [];
    const eventId = String(req.params.eventId);
    const payload = req.body || {};
    const merged = { ...payload };
    if (Object.prototype.hasOwnProperty.call(payload, 'type')) {
      merged.type = normalizeTypes(payload.type);
    }
    merged.coordinator = displayName;
    merged.coordinatorUserId = u.id;
    if (Array.isArray(merged.history)) {
      merged.history = merged.history.map((h) => {
        if (!h || typeof h !== 'object') return h;
        const lab = h.user;
        if (lab === 'אני' || lab == null || String(lab).trim() === '') {
          return { ...h, user: displayName };
        }
        return h;
      });
    }
    const next = prev.map((e) => (String(e.id) === eventId ? { ...e, ...merged, id: e.id } : e));
    await candidateService.update(req.params.id, { events: next });
    const updatedEvent = next.find((e) => String(e.id) === eventId);
    if (!updatedEvent) return res.status(404).json({ message: 'Event not found' });
    res.json(normalizeEventRow(updatedEvent));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.events) ? candidate.events : [];
    const eventId = String(req.params.eventId);
    const next = prev.filter((e) => String(e.id) !== eventId);
    await candidateService.update(req.params.id, { events: next });
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, create, update, remove };
