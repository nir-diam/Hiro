const clientService = require('../services/clientService');

const get = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id, { include: ['finance'] });
    res.json(client.finance && typeof client.finance === 'object' ? client.finance : {});
  } catch (err) {
    const timedOut = err?.parent?.code === '57014' || /statement timeout/i.test(String(err?.message || ''));
    res.status(err.status || (timedOut ? 504 : 500)).json({
      message: err.message || 'Failed to load finance',
    });
  }
};

const update = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const client = await clientService.getById(req.params.id, { include: ['finance'] });
    const merged = { ...(client.finance && typeof client.finance === 'object' ? client.finance : {}), ...payload };
    const updated = await clientService.update(req.params.id, { finance: merged });
    res.json(updated.finance);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

module.exports = { get, update };

