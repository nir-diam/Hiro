const { Op } = require('sequelize');
const PicklistCategory = require('../models/PicklistCategory');
const PicklistCategoryValue = require('../models/PicklistCategoryValue');

const listCategories = async () => {
  return PicklistCategory.findAll({
    order: [
      ['order', 'ASC'],
      ['name', 'ASC'],
    ],
  });
};

const createCategory = async (payload) => {
  return PicklistCategory.create(payload);
};

const updateCategory = async (id, updates) => {
  const category = await PicklistCategory.findByPk(id);
  if (!category) return null;
  return category.update(updates);
};

const deleteCategory = async (id) => {
  const category = await PicklistCategory.findByPk(id);
  if (!category) return null;
  await category.destroy();
  return true;
};

const listSubcategories = async (categoryId) => {
  return PicklistCategory.findAll({
    where: { parentId: categoryId },
    order: [
      ['order', 'ASC'],
      ['name', 'ASC'],
    ],
  });
};

const listCategoryValues = async (categoryId, parentValueId = null) => {
  const where = { categoryId };
  if (parentValueId && parentValueId !== 'all') where.parentValueId = parentValueId;
  return PicklistCategoryValue.findAll({
    where,
    order: [
      ['order', 'ASC'],
      ['label', 'ASC'],
    ],
  });
};

const createCategoryValue = async (categoryId, payload) => {
  return PicklistCategoryValue.create({ categoryId, ...payload });
};

const BUSINESS_FIELD_CATEGORY_ID = '16c81e14-316d-403d-951a-263d02f57f4b';

/**
 * Returns the list of allowed mainField values (subcategory names under the business field category).
 * Used to constrain LLM enrichment so mainField is only from the picklist.
 */
const getMainFieldOptionNames = async () => {
  const subcategories = await listSubcategories(BUSINESS_FIELD_CATEGORY_ID);
  return (subcategories || []).map((c) => (c.name || '').trim()).filter(Boolean);
};

const ensureMainFieldCategory = async (label) => {
  if (!label || !label.trim()) return null;
  const normalized = label.trim().toLowerCase();
  const existing = await PicklistCategory.findOne({
    where: {
      parentId: BUSINESS_FIELD_CATEGORY_ID,
      [Op.or]: [
        { name: { [Op.iLike]: label.trim() } },
        { key: { [Op.iLike]: normalized } },
      ],
    },
  });
  if (existing) return existing;
  const keyBase = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${Date.now()}`;
  return PicklistCategory.create({
    name: label.trim(),
    key: `${keyBase}-${Date.now()}`,
    description: 'Auto-created business field',
    module: 'general',
    parentId: BUSINESS_FIELD_CATEGORY_ID,
    order: 0,
    isSystem: false,
  });
};

const ensureCategoryValueByLabel = async (categoryId, label) => {
  if (!categoryId || !label || !label.trim()) return null;
  const normalized = label.trim();
  const existing = await PicklistCategoryValue.findOne({
    where: {
      categoryId,
      [Op.or]: [
        { label: { [Op.iLike]: normalized } },
        { value: { [Op.iLike]: normalized } },
      ],
    },
  });
  if (existing) return existing;
  return PicklistCategoryValue.create({
    categoryId,
    label: normalized,
    value: normalized,
    order: 0,
    isActive: true,
    isSystem: false,
  });
};

const updateCategoryValue = async (valueId, updates) => {
  const value = await PicklistCategoryValue.findByPk(valueId);
  if (!value) return null;
  return value.update(updates);
};

const deleteCategoryValue = async (valueId, categoryId = null) => {
  const where = { id: valueId };
  if (categoryId) where.categoryId = categoryId;
  const value = await PicklistCategoryValue.findOne({ where });
  if (!value) return null;
  await value.destroy();
  return true;
};

const listDomains = async ({ categoryId, subcategoryId, parentValueId }) => {
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
  return PicklistCategoryValue.findAll({
    where,
    order: [
      ['order', 'ASC'],
      ['label', 'ASC'],
    ],
  });
};

const createDomainValue = async ({ categoryId, subcategoryId, payload }) => {
  return PicklistCategoryValue.create({
    categoryId: subcategoryId,
    parentCategoryId: categoryId,
    ...payload,
  });
};

const updateDomainValue = async (valueId, updates) => {
  return updateCategoryValue(valueId, updates);
};

const deleteDomainValue = async (valueId) => {
  return deleteCategoryValue(valueId);
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  listCategoryValues,
  createCategoryValue,
  updateCategoryValue,
  deleteCategoryValue,
  listDomains,
  createDomainValue,
  updateDomainValue,
  deleteDomainValue,
  ensureMainFieldCategory,
  ensureCategoryValueByLabel,
  getMainFieldOptionNames,
  BUSINESS_FIELD_CATEGORY_ID,
};

