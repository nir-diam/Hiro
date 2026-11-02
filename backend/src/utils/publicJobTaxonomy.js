const { slugifySegment, normalizeSearchText } = require('./publicJobSlug');
const { wgs84FromCityRow } = require('./publicJobGeo');
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

const cityPoint = (row) => wgs84FromCityRow(row);

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

const GENERIC_CLUSTER_LABELS = new Set(['כללי', 'כללית', 'אחר', 'אחרים', 'ללא', 'general', 'other']);

const isGenericClusterLabel = (value) => GENERIC_CLUSTER_LABELS.has(normalizeSearchText(value));

const indexJobCatalog = (categories) => {
  const byCategoryName = new Map();
  const byClusterName = new Map();
  const remember = (map, label, node) => {
    const key = normalizeSearchText(label);
    if (key && !map.has(key)) map.set(key, node);
  };
  for (const category of categories || []) {
    const parent = {
      slug: category.publicSlug || slugifySegment(category.name),
      label: category.name,
      aliases: Array.isArray(category.slugAliases) ? category.slugAliases : [],
    };
    remember(byClusterName, category.name, parent);
    for (const alias of parent.aliases) remember(byClusterName, alias, parent);
    for (const cluster of category.clusters || []) {
      const node = {
        slug: cluster.publicSlug || slugifySegment(cluster.name),
        label: cluster.name,
        aliases: Array.isArray(cluster.slugAliases) ? cluster.slugAliases : [],
        parent,
      };
      remember(byCategoryName, cluster.name, node);
      for (const alias of node.aliases) remember(byCategoryName, alias, node);
    }
  }
  return { byCategoryName, byClusterName };
};

const lookupCatalog = (map, raw) => {
  const key = normalizeSearchText(raw);
  if (!key) return null;
  return map.get(key) || null;
};

/**
 * Cluster and category slugs must exist in the taxonomy. Free-text "כללי" is not slugified
 * into a value the filters cannot label.
 */
const resolveJobTaxonomy = (catalog, job) => {
  const empty = { categoryNode: null, clusterNode: null };
  if (!catalog) return empty;
  const path = (Array.isArray(job?.jobFields) ? job.jobFields[0] : null) || {};
  let categoryNode = lookupCatalog(catalog.byCategoryName, path.fieldType)
    || lookupCatalog(catalog.byCategoryName, job?.field);
  let clusterNode = categoryNode?.parent || null;
  if (!clusterNode && path.category && !isGenericClusterLabel(path.category)) {
    clusterNode = lookupCatalog(catalog.byClusterName, path.category);
  }
  if (!clusterNode && job?.field && !categoryNode) {
    clusterNode = lookupCatalog(catalog.byClusterName, job.field);
  }
  if (!clusterNode && isGenericClusterLabel(path.category)) {
    const seen = new Map();
    for (const node of catalog.byClusterName.values()) {
      if (normalizeSearchText(node.label).includes('כללי')) seen.set(node.slug, node);
    }
    if (seen.size === 1) clusterNode = [...seen.values()][0];
  }
  return { categoryNode, clusterNode };
};

module.exports = {
  buildTaxonomy,
  indexJobCatalog,
  resolveJobTaxonomy,
  isGenericClusterLabel,
};
