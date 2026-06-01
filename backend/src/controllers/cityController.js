const cityService = require('../services/cityService');

const list = async (req, res) => {
  try {
    const search = req.query.search || req.query.q;
    const cities = search
      ? await cityService.getBySearch(search)
      : await cityService.getAll();
    res.json(cities);
  } catch (err) {
    console.error('[cityController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list cities' });
  }
};

const listWithinRadius = async (req, res) => {
  try {
    const city = req.query.city || req.query.center || '';
    const radiusParam = req.query.radius || req.query.r;
    const radiusKm = Number(radiusParam);

    if (!city || !radiusParam || Number.isNaN(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({ message: 'city and valid radius (km) are required' });
    }

    const cities = await cityService.getWithinRadius(city, radiusKm);
    res.json(cities);
  } catch (err) {
    console.error('[cityController.listWithinRadius]', err);
    res.status(500).json({ message: err.message || 'Failed to list cities by radius' });
  }
};

const resolveExact = async (req, res) => {
  try {
    const idRaw = req.query.id;
    if (idRaw != null && String(idRaw).trim() !== '') {
      const resolved = await cityService.resolveCityById(idRaw);
      if (!resolved) {
        return res.status(404).json({ message: 'City not found' });
      }
      return res.json({ city: resolved });
    }
    const city = req.query.city || req.query.name || '';
    const resolved = await cityService.resolveCityExact(city);
    if (!resolved) {
      return res.status(404).json({ message: 'City not found' });
    }
    return res.json({ city: resolved });
  } catch (err) {
    console.error('[cityController.resolveExact]', err);
    return res.status(500).json({ message: err.message || 'Failed to resolve city' });
  }
};

module.exports = {
  list,
  listWithinRadius,
  resolveExact,
};
