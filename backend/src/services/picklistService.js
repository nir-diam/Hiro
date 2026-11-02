const { Op } = require('sequelize');
const PicklistCategory = require('../models/PicklistCategory');
const PicklistCategoryValue = require('../models/PicklistCategoryValue');
const { getCached, bumpPicklistCacheVersion } = require('./picklistCacheService');

/**
 * Sort by numeric `order`, then natural alphanumeric on `label` (1,2,3…10… a,b,c).
 */
const sortPicklistValues = (rows) => {
  const arr = Array.isArray(rows) ? [...rows] : [];
  return arr.sort((a, b) => {
    const oa = Number(a.order);
    const ob = Number(b.order);
    const orderA = Number.isFinite(oa) ? oa : 0;
    const orderB = Number.isFinite(ob) ? ob : 0;
    if (orderA !== orderB) return orderA - orderB;
    const la = String(a.label ?? '').trim();
    const lb = String(b.label ?? '').trim();
    return la.localeCompare(lb, 'he', { numeric: true, sensitivity: 'base' });
  });
};

const listCategoriesFromDb = async () =>
  PicklistCategory.findAll({
    order: [
      ['order', 'ASC'],
      ['name', 'ASC'],
    ],
  });

const listCategories = async () =>
  getCached({ kind: 'categories' }, listCategoriesFromDb, 'picklists:categories');

const createCategory = async (payload) => {
  const row = await PicklistCategory.create(payload);
  await bumpPicklistCacheVersion();
  return row;
};

const updateCategory = async (id, updates) => {
  const category = await PicklistCategory.findByPk(id);
  if (!category) return null;
  const row = await category.update(updates);
  await bumpPicklistCacheVersion();
  return row;
};

const deleteCategory = async (id) => {
  const category = await PicklistCategory.findByPk(id);
  if (!category) return null;
  await category.destroy();
  await bumpPicklistCacheVersion();
  return true;
};

const listSubcategoriesFromDb = async (categoryId) =>
  PicklistCategory.findAll({
    where: { parentId: categoryId },
    order: [
      ['order', 'ASC'],
      ['name', 'ASC'],
    ],
  });

const listSubcategories = async (categoryId) =>
  getCached({ kind: 'subcategories', categoryId: String(categoryId) }, () =>
    listSubcategoriesFromDb(categoryId),
  'picklists:subcategories');

const listCategoryValuesFromDb = async (categoryId, parentValueId = null) => {
  const where = { categoryId };
  if (parentValueId && parentValueId !== 'all') where.parentValueId = parentValueId;
  const rows = await PicklistCategoryValue.findAll({ where });
  return sortPicklistValues(rows);
};

const listCategoryValues = async (categoryId, parentValueId = null) =>
  getCached(
    { kind: 'values', categoryId: String(categoryId), parentValueId: parentValueId || '' },
    () => listCategoryValuesFromDb(categoryId, parentValueId),
    'picklists:values',
  );

/** Active values for a category identified by `PicklistCategory.key` (e.g. `driving_license`). */
const listCategoryValuesByKeyFromDb = async (key) => {
  const k = String(key || '').trim();
  if (!k) return [];
  const category = await PicklistCategory.findOne({ where: { key: k } });
  if (!category) return [];
  const rows = await PicklistCategoryValue.findAll({
    where: { categoryId: category.id, isActive: true },
  });
  return sortPicklistValues(rows);
};

const listCategoryValuesByKey = async (key) =>
  getCached({ kind: 'valuesByKey', key: String(key || '').trim() }, () =>
    listCategoryValuesByKeyFromDb(key),
  'picklists:values-by-key');

const formatPicklistRowsForLlmPrompt = (rows, notFoundMessage) => {
  if (!rows.length) return notFoundMessage;
  const list = rows.map((r) => ({
    value: String(r.value ?? '').trim(),
    label: String((r.displayName || r.label || r.value) ?? '').trim(),
  })).filter((x) => x.value || x.label);
  return JSON.stringify(list, null, 2);
};

/** Active values as JSON text for LLM prompts (e.g. cv_parsing `${Mobility}` / `${DrivingLicenses}`). */
const formatCategoryValuesForLlmPrompt = async (categoryKey) => {
  const k = String(categoryKey || '').trim();
  if (!k) return '(empty category key)';
  try {
    const rows = await listCategoryValuesByKey(k);
    return formatPicklistRowsForLlmPrompt(rows, `(No active picklist values for category key "${k}".)`);
  } catch (e) {
    console.warn('[picklist] formatCategoryValuesForLlmPrompt', k, e.message);
    return `(Could not load picklist "${k}".)`;
  }
};

/** Active values as JSON text for LLM prompts by category UUID. */
const formatCategoryValuesForLlmPromptByCategoryId = async (categoryId) => {
  const id = String(categoryId || '').trim();
  if (!id) return '(empty category id)';
  try {
    const rows = await PicklistCategoryValue.findAll({
      where: { categoryId: id, isActive: true },
    });
    return formatPicklistRowsForLlmPrompt(
      sortPicklistValues(rows),
      `(No active picklist values for category id "${id}".)`,
    );
  } catch (e) {
    console.warn('[picklist] formatCategoryValuesForLlmPromptByCategoryId', id, e.message);
    return `(Could not load picklist category "${id}".)`;
  }
};

const createCategoryValue = async (categoryId, payload) => {
  const row = await PicklistCategoryValue.create({ categoryId, ...payload });
  await bumpPicklistCacheVersion();
  return row;
};

const BUSINESS_FIELD_CATEGORY_ID = '16c81e14-316d-403d-951a-263d02f57f4b';
const AUTHORIZED_MARKET_DOMAINS_CATEGORY_ID = 'b066daec-01f0-4c37-aae9-04d7e99a5805';

/**
 * Returns the list of allowed mainField values (subcategory names under the business field category).
 * Used to constrain LLM enrichment so mainField is only from the picklist.
 */
const getMainFieldOptionNames = async () => {
  const subcategories = await listSubcategories(BUSINESS_FIELD_CATEGORY_ID);
  return (subcategories || []).map((c) => (c.name || '').trim()).filter(Boolean);
};

/**
 * Business-field taxonomy from the picklist: every mainField with its active subField labels.
 * @returns {Promise<Array<{ mainField: string, subFields: string[] }>>}
 */
const getIndustryTaxonomy = async () => {
  const subcategories = await listSubcategories(BUSINESS_FIELD_CATEGORY_ID);
  const out = [];
  for (const cat of subcategories || []) {
    const mainField = (cat.name || '').trim();
    if (!mainField) continue;
    const values = await listCategoryValues(cat.id);
    const subFields = [];
    for (const v of values || []) {
      if (v.isActive === false) continue;
      const label = (v.label || v.value || '').trim();
      if (label && !subFields.includes(label)) subFields.push(label);
    }
    out.push({ mainField, subFields });
  }
  return out;
};

const updateCategoryValue = async (valueId, updates) => {
  const value = await PicklistCategoryValue.findByPk(valueId);
  if (!value) return null;
  const row = await value.update(updates);
  await bumpPicklistCacheVersion();
  return row;
};

const deleteCategoryValue = async (valueId, categoryId = null) => {
  const where = { id: valueId };
  if (categoryId) where.categoryId = categoryId;
  const value = await PicklistCategoryValue.findOne({ where });
  if (!value) return null;
  await value.destroy();
  await bumpPicklistCacheVersion();
  return true;
};

const listDomainsFromDb = async ({ categoryId, subcategoryId, parentValueId }) => {
  const where = {
    categoryId: subcategoryId,
    [Op.or]: [
      { parentCategoryId: categoryId },
      { parentCategoryId: null },
    ],
  };
  if (parentValueId && parentValueId !== 'all') {
    where.parentValueId = parentValueId;
  }
  const rows = await PicklistCategoryValue.findAll({ where });
  return sortPicklistValues(rows);
};

const listDomains = async (params) =>
  getCached({ kind: 'domains', ...params }, () => listDomainsFromDb(params), 'picklists:domains');

const createDomainValue = async ({ categoryId, subcategoryId, payload }) => {
  const row = await PicklistCategoryValue.create({
    categoryId: subcategoryId,
    parentCategoryId: categoryId,
    ...payload,
  });
  await bumpPicklistCacheVersion();
  return row;
};

const updateDomainValue = async (valueId, updates) => updateCategoryValue(valueId, updates);

const deleteDomainValue = async (valueId) => deleteCategoryValue(valueId);

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  listCategoryValues,
  listCategoryValuesByKey,
  formatCategoryValuesForLlmPrompt,
  formatCategoryValuesForLlmPromptByCategoryId,
  createCategoryValue,
  updateCategoryValue,
  deleteCategoryValue,
  listDomains,
  createDomainValue,
  updateDomainValue,
  deleteDomainValue,
  getMainFieldOptionNames,
  getIndustryTaxonomy,
  BUSINESS_FIELD_CATEGORY_ID,
  AUTHORIZED_MARKET_DOMAINS_CATEGORY_ID,
};

