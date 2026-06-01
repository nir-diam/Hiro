const { Op } = require('sequelize');
const City = require('../models/City');
const { getLocationSearchTerms } = require('../utils/locationSearchTerms');
const {
  normCityCompare,
  hebrewCityCompareKey,
  hebrewCitySpellingVariants,
} = require('../utils/hebrewCityVariants');

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

/** Search using Hebrew spelling variants (נהריה → also נהרייה). */
const getBySearchWithVariants = async (search) => {
  const variants = hebrewCitySpellingVariants(search);
  const seenIds = new Set();
  const rows = [];
  for (const v of variants) {
    const found = await getBySearch(v);
    for (const row of found) {
      const id = row.id;
      if (id != null && seenIds.has(id)) continue;
      if (id != null) seenIds.add(id);
      rows.push(row);
    }
  }
  return rows;
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

/**
 * Exact match only (case-insensitive) — for candidate/job city fields (no fuzzy).
 * @param {string} locationStr
 * @returns {Promise<string|null>} Canonical city name or null
 */
const canonicalCityName = (row) => {
  if (!row) return null;
  const name = (row.cityName || row.city || '').toString().trim();
  return name || null;
};

const normCityCompareLocal = normCityCompare;

/** Score how well a catalog city name matches the user/AI input (higher = better). */
const scoreCityNameMatch = (inputRaw, catalogName) => {
  const input = normCityCompareLocal(inputRaw);
  const catalog = normCityCompareLocal(catalogName);
  if (!input || !catalog) return 0;
  if (input === catalog) return 1000;

  const inputKey = hebrewCityCompareKey(inputRaw);
  const catalogKey = hebrewCityCompareKey(catalogName);
  if (inputKey && catalogKey && inputKey === catalogKey) return 980;

  const inputCore = input.split(/\s*-\s*/)[0].trim();
  const catalogCore = catalog.split(/\s*-\s*/)[0].trim();
  if (inputCore && catalogCore && inputCore === catalogCore) return 950;
  if (catalog.startsWith(input) || input.startsWith(catalog)) return 850;
  if (catalogCore.startsWith(inputCore) || inputCore.startsWith(catalogCore)) return 800;
  if (catalog.includes(input) || input.includes(catalog)) return 600;
  if (catalogCore.includes(inputCore) || inputCore.includes(catalogCore)) return 550;
  if (inputKey && catalogKey && (catalogKey.includes(inputKey) || inputKey.includes(catalogKey))) {
    return 570;
  }
  return 0;
};

/** Minimum score to accept a fuzzy catalog match (below → null). */
const CITY_MATCH_MIN_SCORE = 550;

/**
 * Exact match only (case-insensitive) — for candidate/job city fields.
 * @param {string} locationStr
 * @returns {Promise<string|null>} Canonical city name or null
 */
const findCityRowExact = async (term) => {
  const t = String(term || '').trim();
  if (!t) return null;
  return City.findOne({
    where: {
      [Op.or]: [
        { cityName: { [Op.iLike]: t } },
        { city: { [Op.iLike]: t } },
      ],
    },
  });
};

const resolveCityExact = async (locationStr) => {
  if (!locationStr || typeof locationStr !== 'string') return null;
  const trimmed = locationStr.trim();
  if (!trimmed) return null;

  const variants = [
    trimmed,
    trimmed.replace(/\s*-\s*/g, ' - '),
    trimmed.replace(/\s*-\s*/g, '-'),
    trimmed.replace(/\s+/g, ' '),
  ];
  const seen = new Set();
  for (const v of variants) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    for (const spell of hebrewCitySpellingVariants(v)) {
      const exact = await findCityRowExact(spell);
      const name = canonicalCityName(exact);
      if (name) return name;
    }
  }

  const rows = await getBySearchWithVariants(trimmed);
  if (rows.length === 1) {
    return canonicalCityName(rows[0]);
  }
  for (const row of rows) {
    const name = canonicalCityName(row);
    if (name && name.toLowerCase() === trimmed.toLowerCase()) return name;
  }
  return null;
};

/**
 * Pick the best matching city row for free-text input (exact → fuzzy → scored best → null).
 * Never throws.
 * @param {string} locationStr
 * @returns {Promise<string|null>}
 */
const resolveCityForCandidate = async (locationStr) => {
  if (!locationStr || typeof locationStr !== 'string') return null;
  const trimmed = locationStr.trim();
  if (!trimmed) return null;

  const exact = await resolveCityExact(trimmed);
  if (exact) return exact;

  const fromJobResolver = await resolveCityForJob(trimmed);
  if (fromJobResolver) return fromJobResolver;

  const searchTerms = getLocationSearchTerms(trimmed);
  let bestName = null;
  let bestScore = 0;

  for (const term of searchTerms) {
    const rows = await getBySearchWithVariants(term);
    for (const row of rows) {
      const name = canonicalCityName(row);
      if (!name) continue;
      const score = Math.max(
        scoreCityNameMatch(trimmed, name),
        scoreCityNameMatch(term, name),
      );
      if (score > bestScore) {
        bestScore = score;
        bestName = name;
      }
    }
  }

  if (bestScore >= CITY_MATCH_MIN_SCORE) return bestName;
  return null;
};

const resolveCityById = async (id) => {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  return canonicalCityName(await City.findByPk(n));
};

/**
 * Return list of cities inside a radius (in km) from a chosen city.
 * Uses projected X/Y coordinates (pointx/pointy or pointX/pointY) and simple Euclidean distance.
 * @param {string} cityName - Center city name (matches city_name or city)
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Promise<object[]>} Plain objects with distanceKm field
 */
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
  getBySearchWithVariants,
  getWithinRadius,
  resolveCityForJob,
  resolveCityForCandidate,
  resolveCityExact,
  resolveCityById,
  scoreCityNameMatch,
  getLocationSearchTerms,
};
