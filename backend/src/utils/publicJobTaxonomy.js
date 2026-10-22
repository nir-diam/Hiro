const { slugifySegment } = require('./publicJobSlug');
const {
  EMPLOYMENT_TYPES,
  WORK_MODELS,
  SENIORITIES,
  SUITABLE_FOR,
  regionLabel,
  resolveRegionSlug,
} = require('./publicJobCatalog');

const countBy = (rows, read) => {
  const map = new Map();
  for (const row of rows) {
    const keys = read(row);
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
};

const cityPoint = (row) => {
  const lat = row.pointY ?? row.pointy ?? null;
  const lng = row.pointX ?? row.pointx ?? null;
  return {
    lat: lat == null ? null : Number(lat),
    lng: lng == null ? null : Number(lng),
  };
};

/**
 * @param {object} input
 * @param {Array<{ meta: object }>} input.rows listed jobs for this site key
 * @param {Array} input.categories JobCategory rows with clusters
 * @param {Array} input.cities
 * @param {Array} input.industries { slug, label }
 * @param {Map<string, string[]>} input.synonymsByCategorySlug
 */
const buildTaxonomy = ({ rows, categories, cities, industries, synonymsByCategorySlug }) => {
  const categoryCounts = countBy(rows, (row) => row.meta.categorySlugs?.[0]);
  const clusterCounts = countBy(rows, (row) => row.meta.clusterSlug);
  const industryCounts = countBy(rows, (row) => row.meta.industrySlug);
  const cityCounts = countBy(rows, (row) => row.meta.citySlug);
  const regionCounts = countBy(rows, (row) => row.meta.regionSlug);
  const employmentCounts = countBy(rows, (row) => row.meta.employmentValues);
  const workCounts = countBy(rows, (row) => row.meta.workModel);
  const seniorityCounts = countBy(rows, (row) => row.meta.seniority);
  const suitableCounts = countBy(rows, (row) => row.meta.suitableFor);
  const urgentCount = rows.filter((row) => row.dto?.urgent).length;

  const clusters = (categories || []).map((category) => {
    const clusterSlug = category.publicSlug || slugifySegment(category.name);
    const children = (category.clusters || category.fieldTypes || []).map((cluster) => {
      const slug = cluster.publicSlug || slugifySegment(cluster.name);
      return {
        slug,
        label: cluster.name,
        count: categoryCounts.get(slug) || 0,
        synonyms: synonymsByCategorySlug?.get(slug) || [],
        aliases: Array.isArray(cluster.slugAliases) ? cluster.slugAliases : [],
      };
    });
    const childCount = children.reduce((sum, child) => sum + child.count, 0);
    return {
      slug: clusterSlug,
      label: category.name,
      count: clusterCounts.get(clusterSlug) || childCount,
      aliases: Array.isArray(category.slugAliases) ? category.slugAliases : [],
      categories: children,
    };
  });

  const regionBuckets = new Map();
  for (const city of cities || []) {
    const label = city.cityName || city.city;
    if (!label) continue;
    const slug = city.publicSlug || slugifySegment(label);
    const regionSlug = resolveRegionSlug(city.region || city.column4) || 'other';
    if (!regionBuckets.has(regionSlug)) {
      regionBuckets.set(regionSlug, {
        slug: regionSlug,
        label: regionLabel(regionSlug),
        count: regionCounts.get(regionSlug) || 0,
        cities: [],
      });
    }
    const point = cityPoint(city);
    regionBuckets.get(regionSlug).cities.push({
      slug,
      label,
      count: cityCounts.get(slug) || 0,
      lat: Number.isFinite(point.lat) ? point.lat : null,
      lng: Number.isFinite(point.lng) ? point.lng : null,
      aliases: Array.isArray(city.slugAliases) ? city.slugAliases : [],
    });
  }

  const enumFacet = (list, counts) =>
    list.map((row) => ({ value: row.value, label: row.label, count: counts.get(row.value) || 0 }));

  return {
    clusters,
    industries: (industries || []).map((row) => ({
      slug: row.slug,
      label: row.label,
      count: industryCounts.get(row.slug) || 0,
    })),
    regions: [...regionBuckets.values()],
    employmentTypes: enumFacet(EMPLOYMENT_TYPES, employmentCounts),
    workModels: enumFacet(WORK_MODELS, workCounts),
    seniorities: enumFacet(SENIORITIES, seniorityCounts),
    suitableFor: enumFacet(SUITABLE_FOR, suitableCounts),
    marketingTags: [{ value: 'urgent', label: 'דחוף', count: urgentCount }],
  };
};

module.exports = { buildTaxonomy };
