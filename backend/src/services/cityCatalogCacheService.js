const { createVersionedNamespaceCache } = require('./versionedNamespaceCache');

const cityCatalogCache = createVersionedNamespaceCache('cities', {
  ttlSeconds: Number.parseInt(process.env.CITIES_CACHE_TTL || '3600', 10) || 3600,
  envFlagName: 'CITIES_CACHE',
});

/** Cities table is effectively static; bump only if you add admin city CRUD later. */
const bumpCityCatalogCache = () => {
  cityCatalogCache.bumpVersion().catch(() => {});
};

module.exports = {
  cityCatalogCache,
  bumpCityCatalogCache,
};
