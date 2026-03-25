const clientService = require('../services/clientService');

const get = async (req, res) => {
  const client = await clientService.getById(req.params.id);
  res.json(client.finance && typeof client.finance === 'object' ? client.finance : {});
};

const update = async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const client = await clientService.getById(req.params.id);
    const merged = { ...(client.finance && typeof client.finance === 'object' ? client.finance : {}), ...payload };
    const updated = await clientService.update(req.params.id, { finance: merged });
    res.json(updated.finance);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

module.exports = { get, update };

