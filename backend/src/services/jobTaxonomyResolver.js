const { Op } = require('sequelize');
const Job = require('../models/Job');
const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');

const OPEN_JOB_STATUSES = ['פתוחה', 'מוקפאת'];

let taxonomyCache = null;

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function partialMatch(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * @returns {Promise<{ categories: object[], roleByNormValue: Map, categoryByNormName: Map }>}
 */
async function loadTaxonomyIndex() {
  if (taxonomyCache) return taxonomyCache;

  const categories = await JobCategory.findAll({
    order: [['name', 'ASC']],
    include: [{
      model: JobCluster,
      as: 'clusters',
      include: [{ model: JobRole, as: 'roles' }],
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
  return taxonomyCache;
}

function invalidateTaxonomyCache() {
  taxonomyCache = null;
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
    if (norm(row.value) === r || partialMatch(row.value, roleStr)) return row;
    for (const syn of row.synonyms) {
      if (norm(syn) === r || partialMatch(syn, roleStr)) return row;
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
  const roleRow = findRoleInIndex(index, job?.role, category);

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
  buildLinkedJobsForIntent,
  findOpenJobsForFieldSelection,
};
