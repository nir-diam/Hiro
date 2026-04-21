const { v4: uuidv4 } = require('uuid');
const candidateService = require('../services/candidateService');

const list = async (req, res) => {
  const candidate = await candidateService.getById(req.params.id);
  res.json(Array.isArray(candidate.events) ? candidate.events : []);
};

const create = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.events) ? candidate.events : [];
    const payload = req.body || {};
    const event = {
      id: payload.id || uuidv4(),
      type: payload.type,
      date: payload.date,
      coordinator: payload.coordinator,
      status: payload.status || 'עתידי',
      linkedTo: Array.isArray(payload.linkedTo) ? payload.linkedTo : [],
      description: payload.description || '',
      notes: payload.notes || '',
      history: Array.isArray(payload.history) ? payload.history : [],
    };
    const next = [event, ...prev];
    await candidateService.update(req.params.id, { events: next });
    res.status(201).json(event);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.events) ? candidate.events : [];
    const eventId = String(req.params.eventId);
    const payload = req.body || {};
    const next = prev.map((e) => (String(e.id) === eventId ? { ...e, ...payload, id: e.id } : e));
    await candidateService.update(req.params.id, { events: next });
    const updatedEvent = next.find((e) => String(e.id) === eventId);
    if (!updatedEvent) return res.status(404).json({ message: 'Event not found' });
    res.json(updatedEvent);
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
