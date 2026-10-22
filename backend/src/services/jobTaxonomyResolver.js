const { Op } = require('sequelize');
const Job = require('../models/Job');
const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');
const redis = require('./redisService');

const OPEN_JOB_STATUSES = ['פתוחה', 'מוקפאת'];
const TAXONOMY_REDIS_KEY = 'taxonomy:index';
const TAXONOMY_TTL = 24 * 60 * 60; // 24 hours — taxonomy changes rarely

let taxonomyCache = null;

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Strip gender slash forms so `מנהל/ת` matches `מנהל`. */
function normRoleKey(s) {
  return norm(String(s ?? '').replace(/\/ת/g, '').replace(/\//g, ' '));
}

function partialMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function rolesMatch(a, b) {
  if (partialMatch(a, b)) return true;
  const x = normRoleKey(a);
  const y = normRoleKey(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

/**
 * Rebuild Maps from the serialisable plain data (Redis stores plain objects, not Maps).
 */
function rebuildTaxonomyIndex(plain) {
  const categoryByNormName = new Map(plain.categoryEntries || []);
  const roleByNormValue = new Map(plain.roleEntries || []);
  return {
    categories: plain.categories,
    allRoles: plain.allRoles,
    categoryByNormName,
    roleByNormValue,
  };
}

/**
 * @returns {Promise<{ categories: object[], roleByNormValue: Map, categoryByNormName: Map }>}
 */
async function loadTaxonomyIndex() {
  if (taxonomyCache) return taxonomyCache;

  // Try Redis before hitting the DB
  try {
    const cached = await redis.get(TAXONOMY_REDIS_KEY);
    if (cached) {
      taxonomyCache = rebuildTaxonomyIndex(cached);
      return taxonomyCache;
    }
  } catch (e) {
    console.warn('[jobTaxonomyResolver] redis get failed (non-fatal):', e.message);
  }

  const categories = await JobCategory.findAll({
    attributes: { exclude: ['embedding'] },
    order: [['name', 'ASC']],
    include: [{
      model: JobCluster,
      as: 'clusters',
      attributes: { exclude: ['embedding'] },
      include: [{
        model: JobRole,
        as: 'roles',
        attributes: { exclude: ['embedding'] },
      }],
    }],
  });

  const categoryByNormName = new Map();
  const roleByNormValue = new Map();
  const allRoles = [];

  for (const cat of categories) {
    const catPlain = cat.get ? cat.get({ plain: true }) : cat;
    const catName = String(catPlain.name || '').trim();
    if (catName) categoryByNormName.set(norm(catName), catPlain);

    for (const cl of catPlain.clusters || []) {
      for (const role of cl.roles || []) {
        const entry = {
          roleId: role.id,
          clusterId: cl.id,
          categoryId: catPlain.id,
          value: role.value,
          synonyms: role.synonyms || [],
        };
        allRoles.push(entry);
        roleByNormValue.set(norm(role.value), entry);
        for (const syn of entry.synonyms) {
          const sn = norm(syn);
          if (sn) roleByNormValue.set(sn, entry);
        }
      }
    }
  }

  taxonomyCache = { categories, categoryByNormName, roleByNormValue, allRoles };

  // Persist to Redis — Maps are serialised as entry arrays
  try {
    await redis.set(TAXONOMY_REDIS_KEY, {
      categories: categories.map((c) => (c.get ? c.get({ plain: true }) : c)),
      allRoles,
      categoryEntries: [...categoryByNormName.entries()],
      roleEntries: [...roleByNormValue.entries()],
    }, { ttlSeconds: TAXONOMY_TTL });
  } catch (e) {
    console.warn('[jobTaxonomyResolver] redis set failed (non-fatal):', e.message);
  }

  return taxonomyCache;
}

function invalidateTaxonomyCache() {
  taxonomyCache = null;
  redis.del(TAXONOMY_REDIS_KEY).catch((e) => {
    console.warn('[jobTaxonomyResolver] redis del failed (non-fatal):', e.message);
  });
}

function findCategoryInIndex(index, fieldStr) {
  const f = norm(fieldStr);
  if (!f) return null;

  if (index.categoryByNormName.has(f)) {
    return index.categoryByNormName.get(f);
  }

  for (const [key, cat] of index.categoryByNormName) {
    if (partialMatch(key, f)) return cat;
  }
  return null;
}

function findRoleInIndex(index, roleStr, category) {
  const r = norm(roleStr);
  if (!r) return null;

  const direct = index.roleByNormValue.get(r);
  if (direct) {
    if (!category || direct.categoryId === category.id) return direct;
  }

  const pool = category
    ? index.allRoles.filter((row) => row.categoryId === category.id)
    : index.allRoles;

  for (const row of pool) {
    if (norm(row.value) === r || rolesMatch(row.value, roleStr)) return row;
    for (const syn of row.synonyms) {
      if (norm(syn) === r || rolesMatch(syn, roleStr)) return row;
    }
  }
  return direct || null;
}

/**
 * Resolve job.field / job.role to taxonomy IDs (category → cluster via role).
 *
 * @param {object} job – { id?, field?, role? }
 * @param {object} [index] – preloaded index from loadTaxonomyIndex()
 * @returns {{ jobId: string|null, categoryId: string|null, clusterId: string|null, roleId: string|null }}
 */
function resolveJobTaxonomy(job, index = taxonomyCache) {
  const jobId = job?.id != null ? String(job.id) : null;
  if (!index) {
    return { jobId, categoryId: null, clusterId: null, roleId: null };
  }

  const category = findCategoryInIndex(index, job?.field);
  let roleRow = findRoleInIndex(index, job?.role, category);
  if (!roleRow && job?.role) {
    roleRow = findRoleInIndex(index, job.role, null);
  }

  if (roleRow) {
    return {
      jobId,
      categoryId: roleRow.categoryId,
      clusterId: roleRow.clusterId,
      roleId: roleRow.roleId,
    };
  }

  if (category) {
    return {
      jobId,
      categoryId: category.id,
      clusterId: null,
      roleId: null,
    };
  }

  return { jobId, categoryId: null, clusterId: null, roleId: null };
}

function jobFieldPathEntries(job) {
  const fields = Array.isArray(job?.jobFields) ? job.jobFields : [];
  const out = [];
  const seen = new Set();
  for (const f of fields) {
    if (!f || typeof f !== 'object') continue;
    const field = f.category || f.field || null;
    const role = f.role || f.value || null;
    const key = `${norm(field)}|${norm(role)}`;
    if (!field && !role) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, role });
  }
  const primaryKey = `${norm(job?.field)}|${norm(job?.role)}`;
  if ((job?.field || job?.role) && !seen.has(primaryKey)) {
    out.unshift({ field: job.field, role: job.role });
  }
  if (!out.length && (job?.field || job?.role)) {
    out.push({ field: job.field, role: job.role });
  }
  return out;
}

/**
 * All selected job taxonomy paths (jobFields[]), not only the mirrored first field/role.
 * @returns {Array<{ jobId: string|null, categoryId: string|null, clusterId: string|null, roleId: string|null }>}
 */
function resolveAllJobTaxonomies(job, index = taxonomyCache) {
  const jobId = job?.id != null ? String(job.id) : null;
  const paths = jobFieldPathEntries(job);
  if (!paths.length) {
    const one = resolveJobTaxonomy(job, index);
    return one.categoryId || one.clusterId || one.roleId ? [one] : [];
  }
  const out = [];
  const seen = new Set();
  for (const path of paths) {
    const tax = resolveJobTaxonomy({ id: jobId, field: path.field, role: path.role }, index);
    const key = `${tax.categoryId || ''}|${tax.clusterId || ''}|${tax.roleId || ''}`;
    if (!tax.categoryId && !tax.clusterId && !tax.roleId) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tax);
  }
  return out;
}

function isRoleRawType(rawType) {
  return String(rawType || '').trim().toLowerCase() === 'role';
}

/**
 * Map the candidate's role tags / title onto taxonomy IDs (same index as jobs).
 */
function taxonomiesFromCandidateProfile(candidate, index = taxonomyCache) {
  if (!index || !candidate) return [];
  const names = [];
  const details = Array.isArray(candidate.tagDetails) ? candidate.tagDetails : [];
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    if (!isRoleRawType(d.rawType || d.raw_type)) continue;
    names.push(d.displayNameHe, d.displayNameEn, d.tagKey, d.name);
  }
  if (candidate.title) names.push(candidate.title);
  if (candidate.role) names.push(candidate.role);

  const out = [];
  const seen = new Set();
  for (const name of names) {
    const row = findRoleInIndex(index, name, null);
    if (!row) continue;
    const key = `${row.categoryId}|${row.clusterId}|${row.roleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      jobId: null,
      categoryId: row.categoryId,
      clusterId: row.clusterId,
      roleId: row.roleId,
    });
  }
  return out;
}

/**
 * Taxonomy IDs stored on field_interest JobCandidate.workflowMeta (no real job row).
 */
function taxonomyFromWorkflowMeta(wm) {
  if (!wm || typeof wm !== 'object' || Array.isArray(wm)) return null;
  const categoryId = wm.categoryId ? String(wm.categoryId) : null;
  const clusterId = wm.clusterId ? String(wm.clusterId) : null;
  const roleId = wm.roleId ? String(wm.roleId) : null;
  if (!categoryId && !clusterId && !roleId) return null;
  return { jobId: null, categoryId, clusterId, roleId };
}

/**
 * @param {Array<{ id?: string, field?: string, role?: string }>} jobs
 * @returns {Promise<Array<{ jobId: string, field?: string, role?: string, taxonomy: object }>>}
 */
async function buildLinkedJobsForIntent(jobs) {
  const index = await loadTaxonomyIndex();
  const out = [];
  for (const j of jobs || []) {
    if (!j || j.id == null) continue;
    out.push({
      jobId: String(j.id),
      field: j.field,
      role: j.role,
      taxonomy: resolveJobTaxonomy(j, index),
    });
  }
  return out;
}

/**
 * Open jobs matching a taxonomy field selection (category / cluster / role).
 */
async function findOpenJobsForFieldSelection(selection, limit = 25) {
  const category = norm(selection?.category);
  const role = norm(selection?.role);
  const categoryId = selection?.categoryId ? String(selection.categoryId) : null;
  const clusterId = selection?.clusterId ? String(selection.clusterId) : null;
  const roleId = selection?.roleId ? String(selection.roleId) : null;

  const where = { status: { [Op.in]: OPEN_JOB_STATUSES } };
  const orClauses = [];
  if (category) orClauses.push({ field: { [Op.iLike]: category } });
  if (role) orClauses.push({ role: { [Op.iLike]: role } });
  if (orClauses.length) where[Op.or] = orClauses;

  const candidates = await Job.findAll({
    where,
    limit: Math.min(Math.max(limit * 4, 40), 120),
    order: [['updatedAt', 'DESC']],
    attributes: { exclude: ['skills'] },
  });

  const index = await loadTaxonomyIndex();
  const matched = [];
  for (const jobRow of candidates) {
    const plain = jobRow.get ? jobRow.get({ plain: true }) : jobRow;
    const tax = resolveJobTaxonomy(plain, index);
    let tier = 0;
    if (roleId && tax.roleId && tax.roleId === roleId) tier = 3;
    else if (clusterId && tax.clusterId && tax.clusterId === clusterId) tier = 2;
    else if (categoryId && tax.categoryId && tax.categoryId === categoryId) tier = 1;
    else if (category && role) {
      const jf = norm(plain.field).toLowerCase();
      const jr = norm(plain.role).toLowerCase();
      const cf = category.toLowerCase();
      const cr = role.toLowerCase();
      if ((jf === cf || jf.includes(cf) || cf.includes(jf)) && (jr === cr || jr.includes(cr) || cr.includes(jr))) {
        tier = 1;
      }
    }
    if (tier > 0) matched.push({ jobRow, tier });
  }

  matched.sort((a, b) => b.tier - a.tier);
  return matched.slice(0, limit).map((m) => m.jobRow);
}

module.exports = {
  loadTaxonomyIndex,
  invalidateTaxonomyCache,
  resolveJobTaxonomy,
  resolveAllJobTaxonomies,
  taxonomiesFromCandidateProfile,
  taxonomyFromWorkflowMeta,
  buildLinkedJobsForIntent,
  findOpenJobsForFieldSelection,
};
