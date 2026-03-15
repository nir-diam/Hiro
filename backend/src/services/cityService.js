const { Op } = require('sequelize');
const City = require('../models/City');

const getAll = async () => {
  return City.findAll({
    order: [['cityName', 'ASC'], ['city', 'ASC']],
  });
};

/**
 * Search cities by city_name or city (case-insensitive LIKE).
 * @param {string} search - Search term (e.g. "תל").
 * @returns {Promise<City[]>}
 */
const getBySearch = async (search) => {
  if (!search || typeof search !== 'string') return getAll();
  const term = `%${search.trim()}%`;
  return City.findAll({
    where: {
      [Op.or]: [
        { cityName: { [Op.iLike]: term } },
        { city: { [Op.iLike]: term } },
      ],
    },
    order: [['cityName', 'ASC'], ['city', 'ASC']],
  });
};

/**
 * Return list of cities inside a radius (in km) from a chosen city.
 * Uses projected X/Y coordinates (pointx/pointy or pointX/pointY) and simple Euclidean distance.
 * @param {string} cityName - Center city name (matches city_name or city)
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Promise<object[]>} Plain objects with distanceKm field
 */
/** Strip region prefixes and split by separators to get candidate city names (e.g. "אזור חיפה" → ["חיפה"], "תל אביב - יפו" → ["תל אביב", "יפו"]). */
const getLocationSearchTerms = (locationStr) => {
  if (!locationStr || typeof locationStr !== 'string') return [];
  let s = locationStr.trim();
  if (!s) return [];

  const terms = new Set([s]);

  // Strip common prefixes: אזור, מחוז, גוש, נפת, etc.
  const prefixRegex = /^(אזור|מחוז|גוש|נפת|נפה)\s+/i;
  const afterPrefix = s.replace(prefixRegex, '').trim();
  if (afterPrefix && afterPrefix !== s) {
    terms.add(afterPrefix);
    s = afterPrefix;
  }

  // Split by " - ", " – ", "-", "," and add each non-empty part
  const parts = s.split(/\s*[-–,—]\s*|,/).map((p) => p.trim()).filter(Boolean);
  parts.forEach((p) => terms.add(p));

  return Array.from(terms);
};

/**
 * Resolve a location string (e.g. from LLM) to a city from the City table.
 * 1. Exact match (case-insensitive) on full string and on derived terms (e.g. "חיפה" from "אזור חיפה").
 * 2. If not found, fuzzy search (ILIKE %term%) for full string and each derived term.
 * @param {string} locationStr - Raw location/city string (e.g. "תל אביב", "אזור חיפה").
 * @returns {Promise<string|null>} Canonical city name to store on Job (cityName or city), or null if not found.
 */
const resolveCityForJob = async (locationStr) => {
  if (!locationStr || typeof locationStr !== 'string') return null;
  const trimmed = locationStr.trim();
  if (!trimmed) return null;

  const searchTerms = getLocationSearchTerms(trimmed);

  const findOneByExact = async (term) =>
    City.findOne({
      where: {
        [Op.or]: [
          { cityName: { [Op.iLike]: term } },
          { city: { [Op.iLike]: term } },
        ],
      },
    });

  const findOneByFuzzy = async (term) =>
    City.findOne({
      where: {
        [Op.or]: [
          { cityName: { [Op.iLike]: `%${term}%` } },
          { city: { [Op.iLike]: `%${term}%` } },
        ],
      },
      order: [
        ['cityName', 'ASC'],
        ['city', 'ASC'],
      ],
    });

  // 1. Exact match for each term (full string first, then derived: "חיפה", "תל אביב", etc.)
  for (const term of searchTerms) {
    const exact = await findOneByExact(term);
    if (exact) {
      const name = (exact.cityName || exact.city || '').toString().trim();
      return name || null;
    }
  }

  // 2. Fuzzy match for each term (%term%)
  for (const term of searchTerms) {
    const fuzzy = await findOneByFuzzy(term);
    if (fuzzy) {
      const name = (fuzzy.cityName || fuzzy.city || '').toString().trim();
      return name || null;
    }
  }

  return null;
};

const getWithinRadius = async (cityName, radiusKm) => {
  if (!cityName || !radiusKm || Number.isNaN(radiusKm)) return [];

  const where = {
    [Op.or]: [
      { cityName: { [Op.iLike]: cityName.trim() } },
      { city: { [Op.iLike]: cityName.trim() } },
    ],
  };

  const center = await City.findOne({ where });
  if (!center) return [];

  const centerX = center.pointx ?? center.pointX;
  const centerY = center.pointy ?? center.pointY;
  if (centerX == null || centerY == null) return [];

  const allCities = await City.findAll();
  const maxDistMeters = radiusKm * 1000;

  const withDistance = allCities
    .map((c) => {
      const x = c.pointx ?? c.pointX;
      const y = c.pointy ?? c.pointY;
      if (x == null || y == null) return null;
      const dx = x - centerX;
      const dy = y - centerY;
      const distMeters = Math.sqrt(dx * dx + dy * dy);
      const distKm = distMeters / 1000;
      return { city: c, distanceKm: distKm };
    })
    .filter(Boolean)
    .filter(({ distanceKm }) => distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map(({ city, distanceKm }) => ({
      ...city.toJSON(),
      distanceKm,
    }));

  return withDistance;
};

module.exports = {
  getAll,
  getBySearch,
  getWithinRadius,
  resolveCityForJob,
};
