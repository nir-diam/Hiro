const picklistService = require('../services/picklistService');

const listCategories = async (_req, res) => {
  const categories = await picklistService.listCategories();
  res.json(categories);
};

const createCategory = async (req, res) => {
  try {
    const payload = {
      name: req.body.name,
      key: req.body.key,
      description: req.body.description || '',
      module: req.body.module || 'general',
      isSystem: Boolean(req.body.isSystem),
      order: req.body.order || 0,
      parentId: req.body.parentId || null,
    };
    const category = await picklistService.createCategory(payload);
    res.status(201).json(category);
  } catch (err) {
    console.error('[picklistController.createCategory]', err);
    res.status(400).json({ message: err.message || 'Unable to create category' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      description: req.body.description || '',
      module: req.body.module,
      isSystem: typeof req.body.isSystem === 'boolean' ? req.body.isSystem : undefined,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const updated = await picklistService.updateCategory(req.params.id, updates);
    if (!updated) return res.status(404).json({ message: 'Category not found' });
    res.json(updated);
  } catch (err) {
    console.error('[picklistController.updateCategory]', err);
    res.status(400).json({ message: err.message || 'Unable to update category' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const success = await picklistService.deleteCategory(req.params.id);
    if (!success) return res.status(404).json({ message: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[picklistController.deleteCategory]', err);
    res.status(400).json({ message: err.message || 'Unable to delete category' });
  }
};

const listSubcategories = async (req, res) => {
  const subcategories = await picklistService.listSubcategories(req.params.categoryId);
  res.json(subcategories);
};

const createSubcategory = async (req, res) => {
  try {
    const payload = {
      name: req.body.name,
      key: req.body.key,
      description: req.body.description || '',
      module: req.body.module || 'general',
      isSystem: Boolean(req.body.isSystem),
      order: req.body.order || 0,
      parentId: req.params.categoryId,
    };
    const subcategory = await picklistService.createCategory(payload);
    res.status(201).json(subcategory);
  } catch (err) {
    console.error('[picklistController.createSubcategory]', err);
    res.status(400).json({ message: err.message || 'Unable to create subcategory' });
  }
};

const updateSubcategory = async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      description: req.body.description || '',
      module: req.body.module,
      isSystem: typeof req.body.isSystem === 'boolean' ? req.body.isSystem : undefined,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const updated = await picklistService.updateCategory(req.params.id, updates);
    if (!updated) return res.status(404).json({ message: 'Subcategory not found' });
    res.json(updated);
  } catch (err) {
    console.error('[picklistController.updateSubcategory]', err);
    res.status(400).json({ message: err.message || 'Unable to update subcategory' });
  }
};

const deleteSubcategory = async (req, res) => {
  try {
    const success = await picklistService.deleteCategory(req.params.id);
    if (!success) return res.status(404).json({ message: 'Subcategory not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[picklistController.deleteSubcategory]', err);
    res.status(400).json({ message: err.message || 'Unable to delete subcategory' });
  }
};

const listValuesByCategoryKey = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) return res.status(400).json({ message: 'key is required' });
    const values = await picklistService.listCategoryValuesByKey(key);
    res.json(values);
  } catch (err) {
    console.error('[picklistController.listValuesByCategoryKey]', err);
    res.status(500).json({ message: err.message || 'Failed to load picklist values' });
  }
};

const listCategoryValues = async (req, res) => {
  const values = await picklistService.listCategoryValues(req.params.categoryId);
  res.json(values);
};

const createCategoryValue = async (req, res) => {
  try {
    const payload = {
      label: req.body.label,
      value: req.body.value,
      displayName: req.body.displayName || null,
      color: req.body.color || '',
      isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : true,
      order: req.body.order || 0,
      isSystem: Boolean(req.body.isSystem),
    };
    const value = await picklistService.createCategoryValue(req.params.categoryId, payload);
    res.status(201).json(value);
  } catch (err) {
    console.error('[picklistController.createCategoryValue]', err);
    res.status(400).json({ message: err.message || 'Unable to create value' });
  }
};

const updateCategoryValue = async (req, res) => {
  try {
    const updates = {
      label: req.body.label,
      value: req.body.value,
      displayName: req.body.displayName !== undefined ? req.body.displayName : undefined,
      color: req.body.color,
      isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : undefined,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
      isSystem: typeof req.body.isSystem === 'boolean' ? req.body.isSystem : undefined,
      parentValueId: req.body.parentValueId || null,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const updated = await picklistService.updateCategoryValue(req.params.valueId, updates);
    if (!updated) return res.status(404).json({ message: 'Value not found' });
    res.json(updated);
  } catch (err) {
    console.error('[picklistController.updateCategoryValue]', err);
    res.status(400).json({ message: err.message || 'Unable to update value' });
  }
};

const deleteCategoryValue = async (req, res) => {
  try {
    const success = await picklistService.deleteCategoryValue(req.params.valueId, req.params.categoryId);
    if (!success) return res.status(404).json({ message: 'Value not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[picklistController.deleteCategoryValue]', err);
    res.status(400).json({ message: err.message || 'Unable to delete value' });
  }
};

const listDomains = async (req, res) => {
  const { categoryId, subcategoryId } = req.params;
  const parentValueId = req.query.parentValueId || null;
  const values = await picklistService.listDomains({ categoryId, subcategoryId, parentValueId });
  res.json(values);
};

const createDomainValue = async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.params;
    const payload = {
      label: req.body.label,
      value: req.body.value,
      displayName: req.body.displayName || null,
      color: req.body.color || '',
      isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : true,
      order: req.body.order || 0,
      isSystem: Boolean(req.body.isSystem),
      parentValueId: req.body.parentValueId || null,
    };
    const value = await picklistService.createDomainValue({ categoryId, subcategoryId, payload });
    res.status(201).json(value);
  } catch (err) {
    console.error('[picklistController.createDomainValue]', err);
    res.status(400).json({ message: err.message || 'Unable to create domain value' });
  }
};

const updateDomainValue = async (req, res) => {
  try {
    const updates = {
      label: req.body.label,
      value: req.body.value,
      displayName: req.body.displayName !== undefined ? req.body.displayName : undefined,
      color: req.body.color,
      isActive: typeof req.body.isActive === 'boolean' ? req.body.isActive : undefined,
      order: typeof req.body.order === 'number' ? req.body.order : undefined,
      isSystem: typeof req.body.isSystem === 'boolean' ? req.body.isSystem : undefined,
      parentValueId: req.body.parentValueId || null,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);
    const updated = await picklistService.updateDomainValue(req.params.valueId, updates);
    if (!updated) return res.status(404).json({ message: 'Domain value not found' });
    res.json(updated);
  } catch (err) {
    console.error('[picklistController.updateDomainValue]', err);
    res.status(400).json({ message: err.message || 'Unable to update domain value' });
  }
};

const deleteDomainValue = async (req, res) => {
  try {
    const success = await picklistService.deleteDomainValue(req.params.valueId);
    if (!success) return res.status(404).json({ message: 'Domain value not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[picklistController.deleteDomainValue]', err);
    res.status(400).json({ message: err.message || 'Unable to delete domain value' });
  }
};

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  listValuesByCategoryKey,
  listCategoryValues,
  createCategoryValue,
  updateCategoryValue,
  deleteCategoryValue,
  listDomains,
  createDomainValue,
  updateDomainValue,
  deleteDomainValue,
};

