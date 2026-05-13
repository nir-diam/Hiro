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
 *   FinalScore = Σ(scoreᵢ × weightᵢ) / TotalW  − salaryPenalty − agePenalty
 */

const { cosineSimilarity, normalizeEmbedding } = require('./vectorSearchService');
const { embedText } = require('./embeddingService');
const City = require('../models/City');
const { getLocationSearchTerms } = require('../utils/locationSearchTerms');

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

/**
 * Build a multi-map of { category → Set<normKey> } from a candidate's tags/skills.
 * Looks in: candidate.skills.technical, candidate.skills.soft, candidate.tags (strings),
 * and candidate.matchAnalysis.tags if it exists.
 */
function buildCandidateTagMap(candidate) {
  /** @type {Record<string, Set<string>>} */
  const byType = {};

  const add = (rawType, rawKey) => {
    const t = norm(rawType) || 'skill';
    const k = norm(rawKey);
    if (!k) return;
    if (!byType[t]) byType[t] = new Set();
    byType[t].add(k);
  };

  // Also maintain a flat "all keys" set for cross-category partial credit
  const flat = new Set();
  const addFlat = (rawType, rawKey) => {
    add(rawType, rawKey);
    const k = norm(rawKey);
    if (k) flat.add(k);
  };

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

  return { byType, flat };
}

/**
 * @param {object} candidate
 * @param {object} job
 * @param {Array<{id:string,value:number}>} tagWeights   – from admin config
 * @returns {{ score: number, breakdown: Record<string, number> }}
 */
function computeTagScore(candidate, job, tagWeights) {
  const jobSkills = Array.isArray(job.skills) ? job.skills : [];
  if (!jobSkills.length) return { score: 100, breakdown: {} };

  const { byType, flat: allCandidateKeys } = buildCandidateTagMap(candidate);

  // Group job requirements by category
  /** @type {Record<string, object[]>} */
  const byCategory = {};
  for (const skill of jobSkills) {
    if (!skill || typeof skill !== 'object') continue;
    if (norm(skill.mode) === 'negative') continue;
    const category = norm(skill.type || skill.tag_type || skill.category || 'skill');
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
      if (!key) { matched += 0.5; continue; } // no key to match → neutral credit

      if (categorySet.has(key)) {
        matched += 1; // exact category match
      } else if (allCandidateKeys.has(key)) {
        matched += 0.7; // found in candidate but different category
      }
    }

    const ratio         = skills.length > 0 ? matched / skills.length : 1;
    const categoryScore = clamp(Math.round(ratio * 100));

    totalWeighted += categoryScore * wgt;
    totalWeight   += wgt;
    breakdown[category] = categoryScore;
  }

  const score = totalWeight > 0 ? clamp(Math.round(totalWeighted / totalWeight)) : 100;
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
    region:   norm(row.region || ''),
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

function _findRegionCfg(geoRegionsCfg, regionId) {
  const id = norm(regionId);
  const list = Array.isArray(geoRegionsCfg) ? geoRegionsCfg : [];
  return (
    list.find((r) => norm(r.id) === id) ||
    list.find((r) => norm(r.id) === 'center') ||
    { grace: 15, penaltyPerKm: 2 }
  );
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

  // Resolve both sides via the cities table (single shared cache hit).
  const [candCity, jobCity] = await Promise.all([
    _resolveCityRecord(candidateCityRaw || candidateAddrRaw),
    _resolveCityRecord(jobGeoText),
  ]);

  const jobRegion  = norm((jobCity && jobCity.region)  || job.region || '');
  const candRegion = norm((candCity && candCity.region) || '');
  const regionCfg  = _findRegionCfg(geoRegionsCfg, jobRegion);

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
  if (jobRegion && candRegion && jobRegion === candRegion) {
    return { score: 85, missing: false, distance: Math.round(regionCfg.grace) };
  }

  // 5. Different known regions (estimate ~80 km between regions)
  if (jobRegion && candRegion && jobRegion !== candRegion) {
    const estimatedKm = 80;
    const excess      = Math.max(0, estimatedKm - regionCfg.grace);
    const score       = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: estimatedKm };
  }

  // 6. Legacy string fallback — job's region keyword appears inside candidate address
  if (jobRegion && candidateAddrN && candidateAddrN.includes(jobRegion)) {
    const estimatedKm = regionCfg.grace / 2;
    const excess      = Math.max(0, estimatedKm - regionCfg.grace);
    const score       = clamp(Math.round(100 - excess * regionCfg.penaltyPerKm));
    return { score, missing: false, distance: Math.round(estimatedKm) };
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

/**
 * @param {object}  candidate
 * @param {object}  job
 * @param {object|null} linkedInfo  – { source, jcStatus } from JobCandidate record, or null
 * @param {Array<{id:string,value:number}>} intentWeights
 * @returns {{ score: number, intentType: string }}
 */
function computeIntentScore(candidate, job, linkedInfo, intentWeights) {
  const w = (id) => intentWeights.find(iw => iw.id === id)?.value ?? 0;

  // Explicit application to this exact job
  if (linkedInfo?.explicit) {
    return { score: w('exact'), intentType: 'exact' };
  }

  // Any link to this job (e.g. added by recruiter)
  if (linkedInfo) {
    return { score: w('role'), intentType: 'role' };
  }

  // Field + role overlap (semantic interest)
  const candField  = norm(candidate.field || '');
  const candTitle  = norm(candidate.title || '');
  const jobField   = norm(job.field  || '');
  const jobRole    = norm(job.role   || '');

  const fieldMatch = candField && jobField &&
    (candField === jobField || candField.includes(jobField) || jobField.includes(candField));
  const roleMatch  = candTitle && jobRole &&
    (candTitle === jobRole || candTitle.includes(jobRole) || jobRole.includes(candTitle));

  if (fieldMatch && roleMatch) return { score: w('cluster'),  intentType: 'cluster'  };
  if (fieldMatch || roleMatch) return { score: w('category'), intentType: 'category' };

  return { score: w('different'), intentType: 'different' };
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

async function computeFullMatchScore(candidate, job, jobEmb, config, linkedInfo = null) {
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
  const tagWeights    = toWeightArray(config.tagWeights);
  const intentWeights = toWeightArray(config.intentWeights);
  const geoRegions    = toGeoArray(config.geoRegions);

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
  const tagResult  = computeTagScore(candidate, job, tagWeights);
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
  const intentResult = computeIntentScore(candidate, job, linkedInfo, intentWeights);
  const intentScore  = intentResult.score;

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

  // ── Age-gap penalty ──────────────────────────────────────────────────────────
  let ageGapPenaltyPoints = 0;
  const age = parseInt(String(candidate.age || '').replace(/[^\d]/g, ''), 10) || null;
  if (age) {
    if (job.ageMin && age < job.ageMin) {
      ageGapPenaltyPoints = (job.ageMin - age) * ageGapPenalty;
    } else if (job.ageMax && age > job.ageMax) {
      ageGapPenaltyPoints = (age - job.ageMax) * ageGapPenalty;
    }
  }

  const finalScore = clamp(
    Math.round(coreScore) - salaryPenaltyPoints - ageGapPenaltyPoints
  );

  return {
    finalScore,
    breakdown: {
      vector:          Math.round(vectorScore),
      tags:            Math.round(tagsScore),
      geo:             Math.round(geoScore),
      experience:      Math.round(expScore),
      intent:          Math.round(intentScore),
      coreScore:       Math.round(coreScore),
      salaryPenalty:   salaryPenaltyPoints,
      ageGapPenalty:   ageGapPenaltyPoints,
      weights:         { vW, tW, gW, eW, iW, totalW },
      tagBreakdown:    tagResult.breakdown,
      geoMissing:      geoResult.missing,
      geoDistance:     geoResult.distance,
      intentType:      intentResult.intentType,
      candidateYears:  expResult.candidateYears,
      requiredYears:   expResult.requiredYears,
    },
  };
}

module.exports = {
  computeFullMatchScore,
  computeVectorScore,
  computeTagScore,
  computeGeoScore,
  computeExperienceScore,
  computeIntentScore,
  buildCandidateTagMap,
  getJobEmbedding,
  invalidateCityCache,
  JC_EXPLICIT_APPLICATION_SOURCES,
  isExplicitJobCandidateSource,
  buildLinkedInfoFromJobCandidate,
};
