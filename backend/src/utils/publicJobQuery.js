const { normalizeSearchText } = require('./publicJobSlug');

const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const parsePublicJobQuery = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const facetsRaw = query.facets;
  const includeFacets = !(facetsRaw === '0' || facetsRaw === 'false' || facetsRaw === false);
  const salaryMin = query.salaryMin == null || query.salaryMin === '' ? null : Number(query.salaryMin);
  const postedWithin = query.postedWithin == null || query.postedWithin === '' ? null : Number(query.postedWithin);
  return {
    q: String(query.q || query.search || '').trim(),
    page,
    limit,
    includeFacets,
    cluster: parseList(query.cluster),
    category: parseList(query.category),
    industry: parseList(query.industry),
    city: parseList(query.city),
    region: parseList(query.region),
    employmentType: parseList(query.employmentType),
    workModel: parseList(query.workModel),
    seniority: parseList(query.seniority),
    suitableFor: parseList(query.suitableFor),
    companySlug: parseList(query.companySlug),
    noExperience: query.noExperience === '1' || query.noExperience === 'true' || query.noExperience === true,
    salaryMin: Number.isFinite(salaryMin) ? salaryMin : null,
    postedWithin: Number.isFinite(postedWithin) && postedWithin > 0 ? postedWithin : null,
    sort: ['newest', 'oldest', 'salary', 'relevance'].includes(String(query.sort || ''))
      ? String(query.sort)
      : 'newest',
  };
};

const buildSynonymGroups = (tags) => {
  const groups = [];
  for (const tag of tags || []) {
    const names = [
      tag.displayNameHe,
      tag.displayNameEn,
      tag.tagKey,
      ...(Array.isArray(tag.synonyms) ? tag.synonyms : []),
      ...(Array.isArray(tag.aliases) ? tag.aliases : []),
    ];
    const normalized = [...new Set(names.map((name) => normalizeSearchText(name)).filter((name) => name.length >= 2))];
    if (normalized.length) groups.push(normalized);
  }
  return groups;
};

const expandQuery = (q, groups) => {
  const nq = normalizeSearchText(q);
  if (!nq) return [];
  const extra = new Set([nq]);
  for (const group of groups || []) {
    const hit = group.some((term) => term === nq || nq.includes(term) || term.includes(nq));
    if (hit) group.forEach((term) => extra.add(term));
  }
  return [...extra];
};

const haystackIncludes = (haystack, terms) => terms.some((term) => term && haystack.includes(term));

const matchesQuery = (meta, terms) => {
  if (!terms.length) return true;
  return haystackIncludes(meta.searchText, terms);
};

const includesAny = (selected, values) => {
  if (!selected.length) return true;
  const set = new Set((Array.isArray(values) ? values : [values]).filter(Boolean).map(String));
  return selected.some((item) => set.has(item));
};

const FACET_GROUPS = [
  'cluster',
  'category',
  'industry',
  'city',
  'region',
  'employmentType',
  'workModel',
  'seniority',
  'suitableFor',
  'companySlug',
];

const passesFilters = (meta, parsed, { skip = null, terms = [] } = {}) => {
  if (!matchesQuery(meta, terms)) return false;
  if (skip !== 'cluster' && !includesAny(parsed.cluster, meta.clusterSlug)) return false;
  if (skip !== 'category' && !includesAny(parsed.category, meta.categorySlugs)) return false;
  if (skip !== 'industry' && !includesAny(parsed.industry, meta.industrySlug)) return false;
  if (skip !== 'city' && !includesAny(parsed.city, meta.citySlug)) return false;
  if (skip !== 'region' && !includesAny(parsed.region, meta.regionSlug)) return false;
  if (skip !== 'employmentType' && !includesAny(parsed.employmentType, meta.employmentValues)) return false;
  if (skip !== 'workModel' && !includesAny(parsed.workModel, meta.workModel)) return false;
  if (skip !== 'seniority' && !includesAny(parsed.seniority, meta.seniority)) return false;
  if (skip !== 'suitableFor' && !includesAny(parsed.suitableFor, meta.suitableFor)) return false;
  if (skip !== 'companySlug' && !includesAny(parsed.companySlug, meta.companySlug)) return false;
  if (parsed.noExperience && !meta.noExperience) return false;
  if (parsed.salaryMin != null) {
    const ceiling = meta.salaryMax ?? meta.salaryMinValue;
    if (!meta.salaryPublished || ceiling == null || ceiling < parsed.salaryMin) return false;
  }
  if (parsed.postedWithin != null && meta.publishedAtMs != null) {
    const cutoff = Date.now() - parsed.postedWithin * 24 * 60 * 60 * 1000;
    if (meta.publishedAtMs < cutoff) return false;
  }
  return true;
};

const bump = (map, key) => {
  if (!key) return;
  map[key] = (map[key] || 0) + 1;
};

const buildFacets = (rows, parsed, terms) => {
  const facets = {};
  for (const group of FACET_GROUPS) {
    const counts = {};
    for (const row of rows) {
      if (!passesFilters(row.meta, parsed, { skip: group, terms })) continue;
      const meta = row.meta;
      if (group === 'cluster') bump(counts, meta.clusterSlug);
      else if (group === 'category') (meta.categorySlugs || []).forEach((slug) => bump(counts, slug));
      else if (group === 'industry') bump(counts, meta.industrySlug);
      else if (group === 'city') bump(counts, meta.citySlug);
      else if (group === 'region') bump(counts, meta.regionSlug);
      else if (group === 'employmentType') (meta.employmentValues || []).forEach((value) => bump(counts, value));
      else if (group === 'workModel') bump(counts, meta.workModel);
      else if (group === 'seniority') bump(counts, meta.seniority);
      else if (group === 'suitableFor') (meta.suitableFor || []).forEach((value) => bump(counts, value));
      else if (group === 'companySlug') bump(counts, meta.companySlug);
    }
    facets[group] = counts;
  }
  return facets;
};

const sortRows = (rows, parsed, terms) => {
  const copy = [...rows];
  const byDate = (row) => row.meta.publishedAtMs || 0;
  if (parsed.sort === 'oldest') {
    copy.sort((a, b) => byDate(a) - byDate(b));
    return copy;
  }
  if (parsed.sort === 'salary') {
    copy.sort((a, b) => (b.meta.salaryMax || 0) - (a.meta.salaryMax || 0) || byDate(b) - byDate(a));
    return copy;
  }
  if (parsed.sort === 'relevance' && terms.length) {
    copy.sort((a, b) => {
      const score = (row) => terms.reduce((sum, term) => sum + (row.meta.searchText.includes(term) ? 1 : 0), 0);
      return score(b) - score(a) || byDate(b) - byDate(a);
    });
    return copy;
  }
  copy.sort((a, b) => byDate(b) - byDate(a));
  return copy;
};

const filterPublicJobs = (rows, query, synonymGroups) => {
  const parsed = parsePublicJobQuery(query);
  const terms = expandQuery(parsed.q, synonymGroups);
  const matched = rows.filter((row) => passesFilters(row.meta, parsed, { terms }));
  const sorted = sortRows(matched, parsed, terms);
  const total = sorted.length;
  const start = (parsed.page - 1) * parsed.limit;
  return {
    parsed,
    terms,
    total,
    items: sorted.slice(start, start + parsed.limit),
    facets: parsed.includeFacets ? buildFacets(rows, parsed, terms) : undefined,
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
    },
  };
};

module.exports = {
  parsePublicJobQuery,
  buildSynonymGroups,
  expandQuery,
  buildFacets,
  filterPublicJobs,
};
