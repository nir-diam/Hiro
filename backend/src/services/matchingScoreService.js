/**
 * matchingScoreService
 * ─────────────────────────────────────────────────────────────────────────────
 * Core multi-dimensional scoring engine.
 * Reads weights from the admin config (matchingEngineService) and computes:
 *   1. VectorScore  – cosine similarity between candidate ↔ job embeddings
 *   2. TagScore     – weighted tag match across 9 categories
 *   3. GeoScore     – distance-based penalty using geoRegions config
 *   4. ExperienceScore – years-of-experience vs. job requirements
 *   5. IntentScore  – how strongly the candidate is linked/interested in this job
 *
 * Final formula (mirrors the admin panel simulation):
 *   TotalW = vW + tW + gW + eW + iW
 *   S_core = Σ(scoreᵢ × weightᵢ) / TotalW
 *   FinalScore = max(0, S_core − Penalty_salary − Penalty_age − Penalty_general)
 */

const { cosineSimilarity, normalizeEmbedding } = require('./vectorSearchService');
const {
  computeGeneralPenalties,
  computeParameterMatches,
  buildSalaryPenaltyReasons,
  buildAgePenaltyReasons,
  enrichBreakdownForApi,
  parseCandidateAge,
  jobRequiresAge,
} = require('./matchingPenaltyService');
const { embedText } = require('./embeddingService');
const City = require('../models/City');
const { getLocationSearchTerms } = require('../utils/locationSearchTerms');
const {
  loadTaxonomyIndex,
  resolveJobTaxonomy,
} = require('./jobTaxonomyResolver');

// ─── Inline job-query builder (mirrors jobSonarService.buildJobSonarQuery)
// Kept local to avoid circular imports between matchingScoreService ↔ jobSonarService.
function _buildJobText(j) {
  if (!j || typeof j !== 'object') return '';
  const parts = [];
  const push = (label, v) => {
    const s = v != null ? String(v).trim() : '';
    if (s) parts.push(`${label}: ${s}`);
  };
  push('Title', j.title);
  push('Role', j.role);
  push('Field', j.field);
  push('Description', j.description || j.internalDescription);
  push('Public description', j.publicDescription || j.PublicDescription);
  const skills = Array.isArray(j.skills) ? j.skills : [];
  const skillBits = skills
    .map((s) => (s && typeof s === 'object' ? String(s.name || s.key || '').trim() : ''))
    .filter(Boolean);
  if (skillBits.length) push('Skills', skillBits.join(', '));
  const reqs = Array.isArray(j.requirements) ? j.requirements : [];
  if (reqs.length) push('Requirements', reqs.map((r) => String(r || '').trim()).filter(Boolean).join('\n'));
  const langs = Array.isArray(j.languages) ? j.languages : [];
  const langBits = langs
    .map((l) => (l && typeof l === 'object' ? String(l.language || l.name || '').trim() : ''))
    .filter(Boolean);
  if (langBits.length) push('Languages', langBits.join(', '));
  return parts.join('\n');
}

// ─── Shared job-embedding cache ───────────────────────────────────────────────
const _jobEmbCache = new Map(); // jobId → { hash, emb }

function _jobHash(jp) {
  const src = [jp.title, jp.description, JSON.stringify(jp.skills), JSON.stringify(jp.requirements)]
    .join('|').slice(0, 4000);
  let h = 0;
  for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Get (or lazily compute) the embedding vector for a plain job object.
 * Results are cached in-process by jobId + content hash.
 *
 * @param {object} jobPlain
 * @returns {Promise<number[]>}
 */
async function getJobEmbedding(jobPlain) {
  const id = String(jobPlain.id || '');
  const h  = _jobHash(jobPlain);
  const cached = _jobEmbCache.get(id);
  if (cached && cached.hash === h) return cached.emb;
  const text = _buildJobText(jobPlain);
  if (!text.trim()) return [];
  const emb = await embedText(text.slice(0, 8000));
  if (emb && emb.length) _jobEmbCache.set(id, { hash: h, emb });
  return emb || [];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function clamp(v) {
  return Math.min(100, Math.max(0, v));
}

/** Map job/candidate tag type strings → admin `tagWeights` ids */
const TAG_CATEGORY_ALIASES = {
  degree: 'education',
  education: 'education',
  soft: 'soft_skill',
  domain: 'industry',
};

function normalizeTagCategory(raw) {
  const n = norm(raw);
  if (!n) return 'skill';
  return TAG_CATEGORY_ALIASES[n] || n;
}

// ─── 1. Vector Score ──────────────────────────────────────────────────────────

/**
 * @param {number[]} candidateEmb – already normalised embedding
 * @param {number[]} jobEmb       – already normalised embedding
 * @returns {number} 0-100
 */
function computeVectorScore(candidateEmb, jobEmb) {
  if (!candidateEmb?.length || !jobEmb?.length || candidateEmb.length !== jobEmb.length) return 0;
  const sim = cosineSimilarity(candidateEmb, jobEmb);
  if (!Number.isFinite(sim)) return 0;
  // cosineSimilarity already returns [-1, 1]; map to 0-100
  const pct = sim >= 0 && sim <= 1
    ? Math.round(sim * 100)
    : Math.round(((sim + 1) / 2) * 100);
  return clamp(pct);
}

// ─── 2. Tag Score ─────────────────────────────────────────────────────────────

/** Map candidate_tag row → admin sourceWeights id (recruiter | candidate | ai). */
function resolveTagProvenance(td) {
  if (!td || typeof td !== 'object') return 'ai';
  if (td.createdBy || td.created_by) return 'recruiter';
  const ctx = norm(td.context || '');
  if (/candidate|מועמד|self|user/i.test(ctx)) return 'candidate';
  const tagSrc = norm(td.tagSource || td.source || td.tag?.source || '');
  if (tagSrc === 'ai') return 'ai';
  if (tagSrc === 'user') return 'candidate';
  if (tagSrc === 'admin' || tagSrc === 'manual' || tagSrc === 'system' || tagSrc === 'job') {
    return 'recruiter';
  }
  if (td.quote) return 'ai';
  return 'ai';
}

/**
 * Build a multi-map of { category → Set<normKey> } from a candidate's tags/skills.
 * Also tracks best tag provenance per category:key for sourceWeights.
 */
function buildCandidateTagMap(candidate) {
  /** @type {Record<string, Set<string>>} */
  const byType = {};
  /** @type {Map<string, string>} category:key → recruiter|candidate|ai */
  const keySources = new Map();

  const add = (rawType, rawKey, sourceId = 'ai') => {
    const t = normalizeTagCategory(rawType);
    const k = norm(rawKey);
    if (!k) return;
    if (!byType[t]) byType[t] = new Set();
    byType[t].add(k);
    const mapKey = `${t}:${k}`;
    const rank = { recruiter: 3, candidate: 2, ai: 1 };
    const prev = keySources.get(mapKey);
    if (!prev || (rank[sourceId] || 0) > (rank[prev] || 0)) {
      keySources.set(mapKey, sourceId);
    }
  };

  const flat = new Set();
  const addFlat = (rawType, rawKey, sourceId = 'ai') => {
    add(rawType, rawKey, sourceId);
    const k = norm(rawKey);
    if (k) flat.add(k);
  };

  const tagDetails = Array.isArray(candidate.tagDetails) ? candidate.tagDetails : [];
  for (const td of tagDetails) {
    if (!td || typeof td !== 'object') continue;
    const sourceId = resolveTagProvenance(td);
    const category = normalizeTagCategory(td.rawType || td.category || td.type || 'skill');
    const key = norm(td.tagKey || td.displayNameHe || td.displayNameEn || td.name || '');
    if (key) addFlat(category, key, sourceId);
  }

  // candidate.skills.technical
  const tech = Array.isArray(candidate.skills?.technical) ? candidate.skills.technical : [];
  for (const item of tech) {
    if (typeof item === 'string') addFlat('skill', item);
    else if (item && typeof item === 'object') {
      addFlat(item.type || item.tag_type || item.category || 'skill', item.key || item.name || item.tag_key || '');
    }
  }

  // candidate.skills.soft
  const soft = Array.isArray(candidate.skills?.soft) ? candidate.skills.soft : [];
  for (const item of soft) {
    if (typeof item === 'string') addFlat('soft_skill', item);
    else if (item && typeof item === 'object') {
      addFlat(item.type || 'soft_skill', item.key || item.name || '');
    }
  }

  // candidate.tags – plain strings (tag_keys)
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  for (const t of tags) {
    if (typeof t === 'string') addFlat('skill', t);
  }

  // candidate.matchAnalysis.tags (array of tag objects)
  const maTags = candidate.matchAnalysis?.tags;
  if (Array.isArray(maTags)) {
    for (const t of maTags) {
      if (t && typeof t === 'object') {
        addFlat(t.type || t.tag_type || 'skill', t.key || t.tag_key || t.name || '');
      }
    }
  }

  // candidate.internalTags
  const iTags = Array.isArray(candidate.internalTags) ? candidate.internalTags : [];
  for (const t of iTags) {
    if (typeof t === 'string') addFlat('skill', t);
  }

  return { byType, flat, keySources };
}

function sourceWeightFactor(sourceWeights, sourceId) {
  const arr = toWeightArray(sourceWeights);
  if (!arr.length) return 1;
  const maxW = Math.max(1, ...arr.map((s) => Number(s.value) || 0));
  const w = arr.find((s) => s.id === sourceId)?.value;
  const val = w != null ? Number(w) : 50;
  return val / maxW;
}

/**
 * @param {object} candidate
 * @param {object} job
 * @param {Array<{id:string,value:number}>} tagWeights   – from admin config
 * @param {object|Array} sourceWeights – recruiter/candidate/ai weights
 * @returns {{ score: number, breakdown: Record<string, number> }}
 */
function computeTagScore(candidate, job, tagWeights, sourceWeights = []) {
  const jobSkills = Array.isArray(job.skills) ? job.skills : [];
  if (!jobSkills.length) return { score: 0, breakdown: {} };

  const { byType, flat: allCandidateKeys, keySources } = buildCandidateTagMap(candidate);

  // Group job requirements by category
  /** @type {Record<string, object[]>} */
  const byCategory = {};
  for (const skill of jobSkills) {
    if (!skill || typeof skill !== 'object') continue;
    if (norm(skill.mode) === 'negative') continue;
    const category = normalizeTagCategory(
      skill.tagType || skill.type || skill.tag_type || skill.category || 'skill',
    );
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(skill);
  }

  let totalWeighted = 0;
  let totalWeight   = 0;
  const breakdown   = {};

  for (const [category, skills] of Object.entries(byCategory)) {
    const tw  = tagWeights.find(w => w.id === category);
    const wgt = tw ? tw.value : 20; // low default for unknown categories

    const categorySet = byType[category] || new Set();
    let matched = 0;

    for (const skill of skills) {
      const key = norm(skill.key || skill.name || '');
      if (!key) { matched += 0.5; continue; }

      let credit = 0;
      if (categorySet.has(key)) {
        credit = 1;
      } else if (allCandidateKeys.has(key)) {
        credit = 0.7;
      }
      if (credit > 0) {
        const src = keySources.get(`${category}:${key}`) || 'ai';
        matched += credit * sourceWeightFactor(sourceWeights, src);
      }
    }

    const ratio         = skills.length > 0 ? matched / skills.length : 1;
    const categoryScore = clamp(Math.round(ratio * 100));

    totalWeighted += categoryScore * wgt;
    totalWeight   += wgt;
    breakdown[category] = categoryScore;
  }

  const score = totalWeight > 0 ? clamp(Math.round(totalWeighted / totalWeight)) : 0;
  return { score, breakdown };
}

// ─── 3. Geo Score ─────────────────────────────────────────────────────────────

// City lookup cache — loaded once per process, refreshable.
// Each entry: { cityName, city, region, x, y } where x/y are ITM meters when available.
let _cityCache = null;
let _cityCacheLoading = null;

function _normalizeCityRow(row) {
  const px = row.pointX != null ? Number(row.pointX) : (row.pointx != null ? Number(row.pointx) : null);
  const py = row.pointY != null ? Number(row.pointY) : (row.pointy != null ? Number(row.pointy) : null);
  return {
    cityName: row.cityName || row.city || '',
    city:     row.city     || row.cityName || '',
    // UI / legacy data often stores the district only in column4 (e.g. "צפון").
    region:   norm(row.region || row.column4 || ''),
    x: Number.isFinite(px) ? px : null,
    y: Number.isFinite(py) ? py : null,
  };
}

async function _loadCityCache() {
  if (_cityCache) return _cityCache;
  if (_cityCacheLoading) return _cityCacheLoading;

  _cityCacheLoading = (async () => {
    try {
      const rows = await City.findAll({ raw: true });
      const byName = new Map(); // normalized city name → entry
      const all = [];
      for (const r of rows) {
        const entry = _normalizeCityRow(r);
        const k1 = norm(entry.cityName);
        const k2 = norm(entry.city);
        if (k1) byName.set(k1, entry);
        if (k2 && !byName.has(k2)) byName.set(k2, entry);
        all.push(entry);
      }
      _cityCache = { byName, all };
      return _cityCache;
    } catch (e) {
      console.warn('[matchingScoreService] city cache load failed:', e?.message || e);
      _cityCache = { byName: new Map(), all: [] };
      return _cityCache;
    } finally {
      _cityCacheLoading = null;
    }
  })();
  return _cityCacheLoading;
}

/** Force a refresh on next access (used after CRUD on the cities table). */
function invalidateCityCache() {
  _cityCache = null;
  _cityCacheLoading = null;
}

/**
 * Resolve a free-text location/address to a city entry from the cities table.
 * Strategy:
 *  1. Exact normalized match on full string and derived terms (handles "אזור חיפה" → "חיפה",
 *     "תל אביב - יפו" → ["תל אביב", "יפו"]).
 *  2. Substring match (containment in either direction); prefer the longest matching name.
 */
async function _resolveCityRecord(raw) {
  const s = norm(raw || '');
  if (!s) return null;
  const cache = await _loadCityCache();
  const { byName } = cache;
  if (!byName.size) return null;

  // Direct hit on the full string
  if (byName.has(s)) return byName.get(s);

  // Derived terms (strip prefixes / split compound names)
  const terms = getLocationSearchTerms(s).map(norm).filter(Boolean);
  for (const t of terms) {
    if (byName.has(t)) return byName.get(t);
  }

  // Substring search — pick the longest matching city name
  let best = null;
  let bestLen = 0;
  for (const [name, entry] of byName.entries()) {
    if (!name || name.length < 2) continue;
    if ((s.includes(name) || name.includes(s)) && name.length > bestLen) {
      best = entry;
      bestLen = name.length;
    }
  }
  return best;
}

/**
 * Ordered free-text fragments to try against the cities table (city field, then
 * full address/location, comma segments — city is often last in IL addresses).
 * @param {...string|null|undefined} raws
 * @returns {string[]}
 */
function _locationHintStrings(...raws) {
  const out = [];
  const seen = new Set();
  const push = (s) => {
    const t = String(s ?? '').trim();
    if (!t) return;
    const k = norm(t);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  for (const r of raws) {
    if (r == null || !String(r).trim()) continue;
    const str = String(r).trim();
    const parts = str.split(/[,،;]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) push(parts[parts.length - 1]);
    push(str);
    for (const p of parts) push(p);
  }
  return out;
}

/**
 * @param {string[]} hints
 * @returns {Promise<object|null>}
 */
async function _resolveCityRecordFromHints(hints) {
  for (const h of hints) {
    const rec = await _resolveCityRecord(h);
    if (rec) return rec;
  }
  return null;
}

// ─── Open-Meteo geocoding fallback (when cities table has no coords for a side) ─
const _geocodeCache = new Map(); // norm(query) → { lat, lon } | '__miss__'

function _haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return Number.isFinite(km) ? km : null;
}

async function _openMeteoGeocode(query) {
  if (process.env.HIRO_DISABLE_GEOCODING === '1') return null;
  const q = String(query ?? '').trim();
  if (q.length < 2) return null;
  // Bump prefix when geocode strategy changes so in-process __miss__ cache does not block fixes.
  const key = `v4:${norm(q)}`;
  if (_geocodeCache.has(key)) {
    const v = _geocodeCache.get(key);
    return v === '__miss__' ? null : v;
  }

  const enc = (s) => encodeURIComponent(String(s).trim());
  /** Open-Meteo expects `countryCode` (ISO-3166 alpha-2). `country=IL` is not a valid param and yields empty results for some Hebrew queries (e.g. נהריה). */
  const queryVariants = [
    `name=${enc(q)}&count=3&language=he&format=json&countryCode=IL`,
    `name=${enc(q)}&count=3&language=he&format=json`,
    `name=${enc(`${q}, ישראל`)}&count=3&language=he&format=json&countryCode=IL`,
    `name=${enc(`${q}, Israel`)}&count=3&language=en&format=json&countryCode=IL`,
  ];
  // GeoNames sometimes matches Hebrew city names poorly; common fixes (extend as needed).
  if (norm(q) === norm('נהריה')) {
    queryVariants.push(`name=${enc('Nahariya')}&count=3&language=en&format=json&countryCode=IL`);
  }

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(5000)
        : undefined;

    for (const qs of queryVariants) {
      const url = `https://geocoding-api.open-meteo.com/v1/search?${qs}`;
      const res = await fetch(url, { signal });
      if (!res.ok) continue;
      const j = await res.json();
      const r = j?.results?.[0];
      if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
        const out = { lat: r.latitude, lon: r.longitude };
        _geocodeCache.set(key, out);
        return out;
      }
    }
    _geocodeCache.set(key, '__miss__');
    return null;
  } catch {
    _geocodeCache.set(key, '__miss__');
    return null;
  }
}

async function _coordsFromFirstGeocodeHint(hints, fallback) {
  const seen = new Set();
  const list = [];
  const push = (s) => {
    const t = String(s ?? '').trim();
    if (!t) return;
    const k = norm(t);
    if (seen.has(k)) return;
    seen.add(k);
    list.push(t);
  };
  if (hints && hints.length) for (const h of hints) push(h);
  if (fallback) push(fallback);
  for (const h of list) {
    const c = await _openMeteoGeocode(h);
    if (c) return c;
  }
  return null;
}

/**
 * Crow-flight km between two free-text places using Open-Meteo (cached).
 * Used only when the local cities table cannot produce coordinates for both ends.
 */
async function _distanceKmViaGeocoding(candHints, jobHints, candFallback, jobFallback) {
  const [a, b] = await Promise.all([
    _coordsFromFirstGeocodeHint(candHints, candFallback),
    _coordsFromFirstGeocodeHint(jobHints, jobFallback),
  ]);
  if (!a || !b) return null;
  return _haversineKm(a.lat, a.lon, b.lat, b.lon);
}

/**
 * Last-resort crow-flight km: try geocoding short candidate strings against job city / location
 * (sequential, many pairs). Fills `geoDistance` when the cities table + hint-based geocode path fails.
 */
async function _distanceKmGeocodeCityFallback(candidateAddrRaw, candidateCityRaw, candidateLocRaw, job) {
  const jobLines = [];
  const addJob = (s) => {
    const t = String(s ?? '')
      .trim()
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length < 2) return;
    const k = norm(t);
    if (!jobLines.some((x) => norm(x) === k)) jobLines.push(t);
  };
  addJob(job.city);
  addJob(job.location);
  const locPlain = String(job.location || '').replace(/<[^>]+>/g, ' ');
  for (const p of locPlain.split(/[,،;]/)) addJob(p.trim());

  const candLines = [];
  const addCand = (s) => {
    const t = String(s ?? '').trim();
    if (t.length < 2) return;
    const k = norm(t);
    if (!candLines.some((x) => norm(x) === k)) candLines.push(t);
  };
  addCand(candidateCityRaw);
  addCand(candidateAddrRaw);
  addCand(String(candidateLocRaw ?? '').trim());
  for (const p of String(candidateAddrRaw || '').split(/[,،;]/)) addCand(p.trim());

  if (!candLines.length || !jobLines.length) return null;

  for (const cStr of candLines) {
    const a = await _openMeteoGeocode(cStr);
    if (!a) continue;
    for (const jStr of jobLines) {
      const b = await _openMeteoGeocode(jStr);
      if (!b) continue;
      const km = _haversineKm(a.lat, a.lon, b.lat, b.lon);
      if (Number.isFinite(km) && km >= 0) return km;
    }
  }
  return null;
}

/** Euclidean distance in km between two cached city entries (x/y are ITM meters). */
function _distanceKm(a, b) {
  if (!a || !b) return null;
  if (a.x == null || a.y == null || b.x == null || b.y == null) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  // Auto-detect: ITM is meters (large magnitudes); otherwise assume already in km.
  const looksItm = Math.abs(a.x) > 1000 || Math.abs(a.y) > 1000;
  const meters = Math.sqrt(dx * dx + dy * dy);
  return looksItm ? meters / 1000 : meters;
}

const GEO_REGION_IDS = ['center', 'north', 'south', 'shfela', 'jerusalem'];

/** Hebrew labels / DB column4 values → admin geoRegions config id. */
const GEO_REGION_ALIASES = [
  ['north',     ['north', 'צפון', 'הצפון']],
  ['center',    ['center', 'מרכז', 'גוש דן', 'שרון', 'מרכז, שרון וגוש דן', 'מרכז שרון וגוש דן']],
  ['south',     ['south', 'דרום', 'הדרום']],
  ['shfela',    ['shfela', 'שפלה', 'השפלה']],
  ['jerusalem', ['jerusalem', 'ירושלים', 'ירושלם']],
];

/**
 * Map a free-text region (Hebrew or English) to a geoRegions config id.
 * Returns '' when unknown — callers must not silently substitute another region.
 */
function resolveGeoRegionId(raw) {
  const s = norm(raw);
  if (!s) return '';
  if (GEO_REGION_IDS.includes(s)) return s;

  for (const [id, aliases] of GEO_REGION_ALIASES) {
    for (const alias of aliases) {
      if (s === norm(alias)) return id;
    }
  }

  const byLen = GEO_REGION_ALIASES.flatMap(([id, aliases]) =>
    aliases.map((alias) => ({ id, alias: norm(alias) })),
  ).filter((x) => x.alias.length >= 3)
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const { id, alias } of byLen) {
    if (s.includes(alias) || alias.includes(s)) return id;
  }

  return '';
}

function _findRegionCfg(geoRegionsCfg, regionId) {
  const id = resolveGeoRegionId(regionId);
  const list = Array.isArray(geoRegionsCfg) ? geoRegionsCfg : [];
  const hit = id ? list.find((r) => norm(r.id) === id) : null;
  if (hit) return hit;
  return { grace: 15, penaltyPerKm: 2 };
}

/**
 * Distance-based scoring backed by the cities table.
 *
 * Resolution order:
 *   1. Look up both candidate and job in the cities table → real region + coordinates.
 *   2. Same canonical city → 100, distance 0.
 *   3. Both have x/y → real Euclidean distance (km), apply region grace/penaltyPerKm.
 *   4. Same region (no coords) → mild penalty (~85), distance ≈ regionCfg.grace.
 *   5. Different known regions (no coords) → estimate ~80 km and apply region penalty curve.
 *   6. Substring "region in address" fallback for legacy data.
 *   6b. Open-Meteo geocoding + haversine when the cities table cannot resolve coordinates.
 *   6c. Loose candidate place ↔ job city/location geocode grid when 6b fails.
 *   7. Nothing resolvable → missingGeoScore + missing:true.
 *
 * @returns {Promise<{ score: number, missing: boolean, distance: number|null }>}
 */
async function computeGeoScore(candidate, job, geoRegionsCfg, missingGeoScore) {
  const candidateAddrRaw = String(candidate.address || candidate.location || '').trim();
  const candidateCityRaw = String(candidate.city || '').trim();
  const candidateAddrN   = norm(candidateAddrRaw);
  const candidateCityN   = norm(candidateCityRaw);

  if (!candidateAddrN && !candidateCityN) {
    return { score: missingGeoScore, missing: true, distance: null };
  }

  // Job workplace anchor: explicit city/region first, then free-text location (many jobs only set `location`).
  const jobGeoText = String(job.city || job.region || job.location || '').trim();
  if (!jobGeoText) {
    return { score: 100, missing: false, distance: null };
  }

  const candHints = _locationHintStrings(
    candidateCityRaw,
    candidateAddrRaw,
    String(candidate.location || '').trim(),
  );
  const jobHints = _locationHintStrings(
    String(job.city || '').trim(),
    String(job.location || '').trim(),
    String(job.region || '').trim(),
  );

  // Resolve both sides via the cities table (try multiple fragments per side).
  const [candCity, jobCity] = await Promise.all([
    _resolveCityRecordFromHints(candHints),
    _resolveCityRecordFromHints(jobHints),
  ]);

  const jobRegionRaw  = norm((jobCity && jobCity.region)  || job.region || '');
  const candRegionRaw = norm((candCity && candCity.region) || '');
  const jobRegionId   = resolveGeoRegionId(jobRegionRaw);
  const candRegionId  = resolveGeoRegionId(candRegionRaw);
  const regionCfg     = _findRegionCfg(geoRegionsCfg, jobRegionRaw);

  // 2. Same canonical city
  if (candCity && jobCity) {
    const sameCity =
      norm(candCity.cityName) === norm(jobCity.cityName) ||
      norm(candCity.city)     === norm(jobCity.city);
    if (sameCity) {
      return { score: 100, missing: false, distance: 0 };
    }
  }

  // 3. Real distance from coordinates
  const km = _distanceKm(candCity, jobCity);
  if (Number.isFinite(km)) {
    const excess = Math.max(0, km - regionCfg.grace);
    const score  = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: Math.round(km) };
  }

  // 4. Same region but no coords on one side
  if (jobRegionId && candRegionId && jobRegionId === candRegionId) {
    return { score: 85, missing: false, distance: Math.round(regionCfg.grace) };
  }

  // 5. Different known regions (estimate ~80 km between regions)
  if (jobRegionId && candRegionId && jobRegionId !== candRegionId) {
    const estimatedKm = 80;
    const excess      = Math.max(0, estimatedKm - regionCfg.grace);
    const score       = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: estimatedKm };
  }

  // 6. Legacy string fallback — job's region keyword appears inside candidate address
  if (jobRegionRaw && candidateAddrN && candidateAddrN.includes(jobRegionRaw)) {
    const estimatedKm = regionCfg.grace / 2;
    const excess      = Math.max(0, estimatedKm - regionCfg.grace);
    const score       = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: Math.round(estimatedKm) };
  }

  // 6b. Geocoding fallback (Israel-biased) — still real km, not random UI placeholders
  const webKm = await _distanceKmViaGeocoding(
    candHints,
    jobHints,
    candidateAddrRaw || candidateCityRaw,
    jobGeoText,
  );
  if (Number.isFinite(webKm)) {
    const excess = Math.max(0, webKm - regionCfg.grace);
    const score  = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: Math.round(webKm) };
  }

  // 6c. Geocode short place strings (candidate ↔ job workplace) — catches hint-order / parallel edge cases
  const looseKm = await _distanceKmGeocodeCityFallback(
    candidateAddrRaw,
    candidateCityRaw,
    String(candidate.location || '').trim(),
    job,
  );
  if (Number.isFinite(looseKm)) {
    const excess = Math.max(0, looseKm - regionCfg.grace);
    const score  = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: Math.round(looseKm) };
  }

  // 7. Nothing resolvable
  return { score: missingGeoScore, missing: true, distance: null };
}

// ─── 4. Experience Score ──────────────────────────────────────────────────────

/** Extract total years of experience from workExperience[] */
function extractCandidateYears(candidate) {
  const workExp = Array.isArray(candidate.workExperience) ? candidate.workExperience : [];
  const now = new Date();
  let totalMonths = 0;

  for (const exp of workExp) {
    if (!exp || typeof exp !== 'object') continue;
    const sy = parseInt(String(exp.startYear  || exp.start_year  || ''), 10);
    const sm = parseInt(String(exp.startMonth || exp.start_month || '1'), 10);
    const ey = parseInt(String(exp.endYear    || exp.end_year    || ''), 10);
    const em = parseInt(String(exp.endMonth   || exp.end_month   || '12'), 10);
    const isCurrent = exp.current || exp.isCurrent || exp.is_current;

    if (!sy || isNaN(sy)) continue;
    const start = new Date(sy, (isNaN(sm) ? 1 : sm) - 1);
    const end   = isCurrent || !ey || isNaN(ey)
      ? now
      : new Date(ey, (isNaN(em) ? 12 : em) - 1);

    if (end > start) {
      totalMonths += (end.getFullYear() - start.getFullYear()) * 12 +
                     (end.getMonth()   - start.getMonth());
    }
  }

  return Math.max(0, totalMonths / 12);
}

/** Extract required years from job text (requirements + description). */
function extractRequiredYears(job) {
  const text = [
    ...(Array.isArray(job.requirements) ? job.requirements : []),
    job.description || '',
  ].join(' ');

  const match = text.match(/(\d+)\s*(?:years?|שנ(?:ות|ה)\s*ניסיון)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * @returns {{ score: number, candidateYears: number, requiredYears: number }}
 */
function computeExperienceScore(candidate, job) {
  const candidateYears = extractCandidateYears(candidate);
  const requiredYears  = extractRequiredYears(job);

  if (!requiredYears) {
    // No explicit requirement — check industry/field alignment as a soft signal
    const candField = norm(candidate.field || candidate.industry || '');
    const jobField  = norm(job.field || '');
    const softMatch = candField && jobField &&
      (candField.includes(jobField) || jobField.includes(candField));
    return { score: softMatch ? 85 : 65, candidateYears: Math.round(candidateYears), requiredYears: 0 };
  }

  if (candidateYears >= requiredYears) {
    const overshoot = candidateYears - requiredYears;
    // Slightly overqualified is still great; heavily overqualified gets a small penalty
    const score = overshoot > 5 ? clamp(100 - Math.round((overshoot - 5) * 4)) : 100;
    return { score, candidateYears: Math.round(candidateYears), requiredYears };
  }

  // Under-qualified: lose 20 points per missing year, floor 0
  const deficit = requiredYears - candidateYears;
  const score   = clamp(Math.round(100 - deficit * 20));
  return { score, candidateYears: Math.round(candidateYears), requiredYears };
}

// ─── 5. Intent Score ─────────────────────────────────────────────────────────

/** Sources treated as explicit application / staff link (keep in sync with screening paths). */
const JC_EXPLICIT_APPLICATION_SOURCES = new Set([
  'email',
  'bulk_job_filter',
  'manual_screening',
  'public_apply',
  'referral',
]);

function isExplicitJobCandidateSource(source) {
  const src = source != null ? String(source).trim() : '';
  return Boolean(src && JC_EXPLICIT_APPLICATION_SOURCES.has(src));
}

/**
 * Canonical linked-info object for computeFullMatchScore (intent scoring).
 * Extra fields (e.g. jcId) are ignored by the engine but used by API callers.
 *
 * @param {object|null} jcPlain  plain JobCandidate ({ id?, source, status, … })
 */
function buildLinkedInfoFromJobCandidate(jcPlain) {
  if (!jcPlain || typeof jcPlain !== 'object') return null;
  const src = jcPlain.source != null ? String(jcPlain.source).trim() : '';
  const base = {
    explicit: Boolean(src && JC_EXPLICIT_APPLICATION_SOURCES.has(src)),
    source: jcPlain.source || null,
    jcStatus: jcPlain.status != null ? jcPlain.status : null,
  };
  if (jcPlain.id != null && jcPlain.id !== '') {
    return { ...base, jcId: String(jcPlain.id) };
  }
  return base;
}

const INTENT_TIER_PRIORITY = {
  exact: 4,
  role: 3,
  cluster: 2,
  category: 2, // legacy alias → cluster
  different: 1,
};

/** UI + engine use `cluster`; older configs may still store `category`. */
function intentWeightValue(intentWeights, tierId) {
  const row = (id) => intentWeights.find((iw) => iw.id === id);
  if (tierId === 'cluster' || tierId === 'category') {
    const cluster = row('cluster');
    if (cluster != null && cluster.value != null) return Number(cluster.value);
    const legacy = row('category');
    if (legacy != null && legacy.value != null) return Number(legacy.value);
    return 0;
  }
  const hit = row(tierId);
  return hit != null && hit.value != null ? Number(hit.value) : 0;
}

function pickBestIntentTier(tiers, intentWeights) {
  const w = (id) => intentWeightValue(intentWeights, id);
  let best = { score: w('different'), intentType: 'different', priority: 0 };
  for (const tier of tiers) {
    const priority = INTENT_TIER_PRIORITY[tier.intentType] ?? 0;
    const score = tier.score ?? w(tier.intentType);
    if (priority > best.priority || (priority === best.priority && score > best.score)) {
      best = { score, intentType: tier.intentType, priority };
    }
  }
  return { score: best.score, intentType: best.intentType };
}

function compareTaxonomyToTarget(linkedTax, targetTax, intentWeights) {
  const w = (id) => intentWeightValue(intentWeights, id);
  if (!targetTax || !linkedTax) {
    return { score: w('different'), intentType: 'different' };
  }
  if (
    targetTax.roleId &&
    linkedTax.roleId &&
    targetTax.roleId === linkedTax.roleId
  ) {
    return { score: w('exact'), intentType: 'exact' };
  }
  if (
    targetTax.clusterId &&
    linkedTax.clusterId &&
    targetTax.clusterId === linkedTax.clusterId
  ) {
    return { score: w('role'), intentType: 'role' };
  }
  if (
    targetTax.categoryId &&
    linkedTax.categoryId &&
    targetTax.categoryId === linkedTax.categoryId
  ) {
    return { score: w('cluster'), intentType: 'cluster' };
  }
  return { score: w('different'), intentType: 'different' };
}

function fallbackIntentFromProfile(candidate, job, intentWeights) {
  const w = (id) => intentWeightValue(intentWeights, id);
  const candField = norm(candidate.field || '');
  const candTitle = norm(candidate.title || '');
  const jobField = norm(job.field || '');
  const jobRole = norm(job.role || '');

  const fieldMatch = candField && jobField &&
    (candField === jobField || candField.includes(jobField) || jobField.includes(candField));
  const roleMatch = candTitle && jobRole &&
    (candTitle === jobRole || candTitle.includes(jobRole) || jobRole.includes(candTitle));

  if (fieldMatch && roleMatch) return { score: w('role'), intentType: 'role' };
  if (fieldMatch || roleMatch) return { score: w('cluster'), intentType: 'cluster' };
  return { score: w('different'), intentType: 'different' };
}

/**
 * Intent from candidate linked jobs vs target job taxonomy (JobCategory / JobCluster / JobRole).
 *
 * @param {object}  candidate
 * @param {object}  job
 * @param {object|null} linkedInfo  – JobCandidate link to *this* job, if any
 * @param {Array<{id:string,value:number}>} intentWeights
 * @param {object} [options]
 * @param {Array<{ jobId: string, taxonomy?: object }>} [options.linkedJobs]
 * @param {object} [options.targetTaxonomy]
 * @param {object} [options.taxonomyIndex]
 * @returns {{ score: number, intentType: string }}
 */
function computeIntentScore(candidate, job, linkedInfo, intentWeights, options = {}) {
  const w = (id) => intentWeightValue(intentWeights, id);
  const targetId = job?.id != null ? String(job.id) : '';
  const index = options.taxonomyIndex || null;
  const targetTax = options.targetTaxonomy
    || (index ? resolveJobTaxonomy(job, index) : null);

  const linkedJobs = Array.isArray(options.linkedJobs) ? options.linkedJobs : [];
  const tiers = [];

  if (linkedInfo && targetId) {
    tiers.push({ intentType: 'exact', score: w('exact') });
  }

  for (const lj of linkedJobs) {
    const lid = lj?.jobId != null ? String(lj.jobId) : '';
    if (lid && lid === targetId) {
      tiers.push({ intentType: 'exact', score: w('exact') });
      continue;
    }
    const lt = lj.taxonomy
      || (index ? resolveJobTaxonomy({ id: lid, field: lj.field, role: lj.role }, index) : null);
    if (lt) tiers.push(compareTaxonomyToTarget(lt, targetTax, intentWeights));
  }

  if (tiers.length) {
    return pickBestIntentTier(tiers, intentWeights);
  }

  return fallbackIntentFromProfile(candidate, job, intentWeights);
}

// ─── Final composite score ────────────────────────────────────────────────────

/**
 * Compute the full multi-dimensional match score.
 *
 * @param {object}       candidate   – plain candidate object from DB
 * @param {object}       job         – plain job object from DB (may include _jobEmb)
 * @param {number[]}     jobEmb      – pre-computed/cached job embedding (optional)
 * @param {object}       config      – admin config (mainWeights, tagWeights, …)
 * @param {object|null}  linkedInfo  – { explicit, source, jcStatus } or null
 * @returns {{ finalScore: number, breakdown: object }}
 */
/**
 * Normalise a weights field that may come from the DB either as:
 *   • a plain object  { role: 100, tool: 60, … }  → convert to [{ id:'role', value:100 }, …]
 *   • already an array [{ id:'role', value:100 }, …] → pass through
 */
function toWeightArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([id, value]) => ({ id, value: Number(value) }));
  }
  return [];
}

/**
 * Normalise geoRegions from DB object { center: { grace, penaltyPerKm }, … }
 * to array [{ id:'center', grace, penaltyPerKm }, …].
 */
function toGeoArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([id, cfg]) => ({
      id,
      grace:        Number(cfg?.grace        ?? 15),
      penaltyPerKm: Number(cfg?.penaltyPerKm ?? 2),
    }));
  }
  return [];
}

async function computeFullMatchScore(candidate, job, jobEmb, config, linkedInfo = null, options = {}) {
  const {
    mainWeights        = {},
    missingGeoScore    = 50,
    missingSalaryScore = 0,
    salaryDiffThreshold = 10,
    salaryPenalty      = 5,
    ageGapPenalty      = 2,
    isExperienceEnabled = true,
  } = config;

  // Normalise array fields — DB stores them as plain objects; functions need arrays
  const tagWeights      = toWeightArray(config.tagWeights);
  const sourceWeights = config.sourceWeights;
  const intentWeights   = toWeightArray(config.intentWeights);
  const geoRegions      = toGeoArray(config.geoRegions);

  // Main weights (raw numbers from DB – already 0-100 scale)
  const vW = mainWeights.vector     ?? 20;
  const tW = mainWeights.tags       ?? 35;
  const gW = mainWeights.geo        ?? 20;
  const eW = isExperienceEnabled ? (mainWeights.experience ?? 15) : 0;
  const iW = mainWeights.intent     ?? 10;
  const totalW = vW + tW + gW + eW + iW;

  // ── 1. Vector ───────────────────────────────────────────────────────────────
  const candidateEmb = normalizeEmbedding(candidate.embedding);
  const vectorScore  = computeVectorScore(candidateEmb, jobEmb || []);

  // ── 2. Tags ─────────────────────────────────────────────────────────────────
  const tagResult  = computeTagScore(candidate, job, tagWeights, sourceWeights);
  const tagsScore  = tagResult.score;

  // ── 3. Geo ──────────────────────────────────────────────────────────────────
  const geoResult  = await computeGeoScore(candidate, job, geoRegions, missingGeoScore);
  const geoScore   = geoResult.score;

  // ── 4. Experience ────────────────────────────────────────────────────────────
  const expResult  = isExperienceEnabled
    ? computeExperienceScore(candidate, job)
    : { score: 0, candidateYears: 0, requiredYears: 0 };
  const expScore   = expResult.score;

  // ── 5. Intent ────────────────────────────────────────────────────────────────
  let intentOptions = options;
  if (!intentOptions.taxonomyIndex && (intentOptions.linkedJobs?.length || linkedInfo)) {
    try {
      const taxonomyIndex = await loadTaxonomyIndex();
      intentOptions = {
        ...intentOptions,
        taxonomyIndex,
        targetTaxonomy: intentOptions.targetTaxonomy || resolveJobTaxonomy(job, taxonomyIndex),
      };
    } catch (e) {
      console.warn('[matchingScoreService] taxonomy load failed', e.message);
    }
  }
  const intentResult = computeIntentScore(
    candidate,
    job,
    linkedInfo,
    intentWeights,
    intentOptions,
  );
  const intentScore = intentResult.score;

  // ── Core weighted score ──────────────────────────────────────────────────────
  const coreScore = totalW > 0
    ? (vectorScore * vW + tagsScore * tW + geoScore * gW + expScore * eW + intentScore * iW) / totalW
    : 0;

  // ── Salary penalty ───────────────────────────────────────────────────────────
  let salaryPenaltyPoints = 0;
  const candSalaryMin = Number(candidate.salaryMin) || 0;
  const jobSalaryMax  = Number(job.salaryMax)       || 0;

  if (!candSalaryMin) {
    salaryPenaltyPoints = missingSalaryScore;
  } else if (jobSalaryMax > 0 && candSalaryMin > jobSalaryMax) {
    const diffPct = ((candSalaryMin - jobSalaryMax) / jobSalaryMax) * 100;
    if (diffPct >= salaryDiffThreshold && salaryDiffThreshold > 0) {
      salaryPenaltyPoints = Math.floor(diffPct / salaryDiffThreshold) * salaryPenalty;
    }
  }

  // ── Age-gap penalty (Penalty_age) ───────────────────────────────────────────
  let ageGapPenaltyPoints = 0;
  const age = parseCandidateAge(candidate);
  const missingAgeScore = Number(config.missingAgeScore ?? ageGapPenalty * 3) || 0;
  if (jobRequiresAge(job)) {
    if (age == null) {
      if (missingAgeScore > 0) ageGapPenaltyPoints = missingAgeScore;
    } else {
      const amin = Number(job.ageMin);
      const amax = Number(job.ageMax);
      if (Number.isFinite(amin) && age < amin) {
        ageGapPenaltyPoints = (amin - age) * ageGapPenalty;
      } else if (Number.isFinite(amax) && age > amax) {
        ageGapPenaltyPoints = (age - amax) * ageGapPenalty;
      }
    }
  }

  // ── General penalties (gender, mobility, scope, license, hours, availability) ─
  // availability: compares jobs.availability vs candidates.availability (matchingPenaltyService)
  const generalResult = computeGeneralPenalties(candidate, job, config);
  const generalPenaltyPoints = generalResult.total;

  const penaltyReasons = [
    ...generalResult.reasons.map((r) => ({ label: r.label, amount: r.amount, key: r.key, type: r.type })),
    ...buildSalaryPenaltyReasons(salaryPenaltyPoints, missingSalaryScore, candSalaryMin),
    ...buildAgePenaltyReasons(ageGapPenaltyPoints, {
      missing: jobRequiresAge(job) && parseCandidateAge(candidate) == null,
    }),
  ];

  const finalScore = Math.max(
    0,
    Math.round(coreScore) - salaryPenaltyPoints - ageGapPenaltyPoints - generalPenaltyPoints,
  );

  const roundedCore = Math.round(coreScore);
  const roundedVector = Math.round(vectorScore);
  const roundedTags = Math.round(tagsScore);
  const roundedGeo = Math.round(geoScore);
  const roundedExp = Math.round(expScore);
  const roundedIntent = Math.round(intentScore);

  const breakdown = enrichBreakdownForApi({
    vector:            roundedVector,
    tags:              roundedTags,
    tagsScore:         roundedTags,
    geo:               roundedGeo,
    experience:        roundedExp,
    intent:            roundedIntent,
    isExperienceEnabled,
    coreScore:         roundedCore,
    salaryPenalty:     salaryPenaltyPoints,
    ageGapPenalty:     ageGapPenaltyPoints,
    generalPenalties:  generalPenaltyPoints,
    weights:           { vW, tW, gW, eW, iW, totalW },
    weightedContributions: {
      vector:     { score: roundedVector, weight: vW, points: (roundedVector * vW) / totalW },
      tags:       { score: roundedTags,   weight: tW, points: (roundedTags * tW) / totalW },
      geo:        { score: roundedGeo,    weight: gW, points: (roundedGeo * gW) / totalW },
      experience: { score: roundedExp,    weight: eW, points: (roundedExp * eW) / totalW },
      intent:     { score: roundedIntent, weight: iW, points: (roundedIntent * iW) / totalW },
    },
    tagBreakdown:      tagResult.breakdown,
    geoMissing:        geoResult.missing,
    geoDistance:       geoResult.distance,
    intentType:        intentResult.intentType,
    candidateYears:    expResult.candidateYears,
    requiredYears:     expResult.requiredYears,
    penaltyReasons,
  });

  return { finalScore, breakdown };
}

/**
 * Full match payload for API consumers (score + breakdown + parameter traffic lights).
 */
async function computeMatchPackage(candidate, job, jobEmb, config, linkedInfo = null, options = {}) {
  const { finalScore, breakdown } = await computeFullMatchScore(
    candidate,
    job,
    jobEmb,
    config,
    linkedInfo,
    options,
  );
  const parameterMatches = computeParameterMatches(candidate, job);
  return {
    matchScore: finalScore,
    scoreBreakdown: breakdown,
    parameterMatches,
  };
}

/**
 * Build intent context from plain job rows (linked jobs list).
 * @param {Array<{ id?: string, field?: string, role?: string }>} jobRows
 */
async function buildIntentScoreOptions(jobRows) {
  const { buildLinkedJobsForIntent } = require('./jobTaxonomyResolver');
  const linkedJobs = await buildLinkedJobsForIntent(jobRows);
  const taxonomyIndex = await loadTaxonomyIndex();
  return { linkedJobs, taxonomyIndex };
}

/**
 * Per-candidate intent context from all JobCandidate links (for scoring one target job).
 * @param {string[]} candidateIds
 */
async function buildIntentOptionsByCandidateIds(candidateIds) {
  const ids = [...new Set((candidateIds || []).map((id) => String(id)).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;

  const JobCandidate = require('../models/JobCandidate');
  const Job = require('../models/Job');
  const { Op } = require('sequelize');

  const links = await JobCandidate.findAll({
    where: { candidateId: { [Op.in]: ids }, jobId: { [Op.ne]: null } },
    include: [{ model: Job, as: 'job', attributes: ['id', 'field', 'role'], required: false }],
  });

  const interestLinks = await JobCandidate.findAll({
    where: {
      candidateId: { [Op.in]: ids },
      jobId: null,
      source: 'field_interest',
    },
    attributes: ['id', 'candidateId', 'workflowMeta', 'source'],
  });

  const { taxonomyFromWorkflowMeta } = require('./jobTaxonomyResolver');

  /** @type {Map<string, Array<{ id: string, field?: string, role?: string, _taxonomyFromMeta?: object }>>} */
  const jobsByCandidate = new Map();
  for (const link of links) {
    const cid = String(link.candidateId);
    if (!jobsByCandidate.has(cid)) jobsByCandidate.set(cid, []);
    const plain = link.get ? link.get({ plain: true }) : link;
    const job = plain.job || { id: plain.jobId, field: null, role: null };
    if (job?.id) jobsByCandidate.get(cid).push(job);
  }

  for (const link of interestLinks) {
    const plain = link.get ? link.get({ plain: true }) : link;
    const wm =
      plain.workflowMeta && typeof plain.workflowMeta === 'object' && !Array.isArray(plain.workflowMeta)
        ? plain.workflowMeta
        : {};
    const tax = taxonomyFromWorkflowMeta(wm);
    if (!tax) continue;
    const cid = String(plain.candidateId);
    if (!jobsByCandidate.has(cid)) jobsByCandidate.set(cid, []);
    jobsByCandidate.get(cid).push({
      id: `interest-${plain.id}`,
      field: wm.category != null ? String(wm.category) : undefined,
      role: wm.role != null ? String(wm.role) : undefined,
      _taxonomyFromMeta: tax,
    });
  }

  const taxonomyIndex = await loadTaxonomyIndex();
  for (const cid of ids) {
    const jobs = jobsByCandidate.get(cid) || [];
    const linkedJobs = jobs.map((j) => ({
      jobId: String(j.id),
      field: j.field,
      role: j.role,
      taxonomy: j._taxonomyFromMeta || resolveJobTaxonomy(j, taxonomyIndex),
    }));
    out.set(cid, { linkedJobs, taxonomyIndex });
  }
  return out;
}

module.exports = {
  computeFullMatchScore,
  computeMatchPackage,
  computeVectorScore,
  computeTagScore,
  normalizeTagCategory,
  computeGeoScore,
  resolveGeoRegionId,
  computeExperienceScore,
  computeIntentScore,
  buildCandidateTagMap,
  getJobEmbedding,
  invalidateCityCache,
  enrichBreakdownForApi,
  JC_EXPLICIT_APPLICATION_SOURCES,
  isExplicitJobCandidateSource,
  buildLinkedInfoFromJobCandidate,
  buildIntentScoreOptions,
  buildIntentOptionsByCandidateIds,
};
