const { v4: uuidv4 } = require('uuid');
const clientService = require('../services/clientService');

const list = async (req, res) => {
  const client = await clientService.getById(req.params.id);
  res.json(Array.isArray(client.events) ? client.events : []);
};

const create = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.events) ? client.events : [];
    const payload = req.body || {};
    const event = {
      id: payload.id || uuidv4(),
      type: payload.type,
      title: payload.title,
      date: payload.date,
      coordinator: payload.coordinator,
      status: payload.status,
      linkedTo: payload.linkedTo ?? null,
      description: payload.description || '',
      history: Array.isArray(payload.history) ? payload.history : [],
    };
    const next = [event, ...prev];
    const updated = await clientService.update(req.params.id, { events: next });
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
    const next = prev.map((e) => (String(e.id) === eventId ? { ...e, ...payload, id: e.id } : e));
    await clientService.update(req.params.id, { events: next });
    const updatedEvent = next.find((e) => String(e.id) === eventId);
    if (!updatedEvent) return res.status(404).json({ message: 'Event not found' });
    res.json(updatedEvent);
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

