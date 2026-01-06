const jobFieldService = require('../services/jobFieldService');

const list = async (_req, res) => {
  const data = await jobFieldService.list();
  res.json(data);
};

const createCategory = async (req, res) => {
  try {
    const row = await jobFieldService.createCategory(req.body.name);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const updateCategory = async (req, res) => {
  try {
    const row = await jobFieldService.updateCategory(req.params.id, req.body.name);
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const deleteCategory = async (req, res) => {
  try {
    await jobFieldService.deleteCategory(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const createCluster = async (req, res) => {
  try {
    const row = await jobFieldService.createCluster({ categoryId: req.body.categoryId, name: req.body.name });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const updateCluster = async (req, res) => {
  try {
    const row = await jobFieldService.updateCluster(req.params.id, req.body.name);
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const deleteCluster = async (req, res) => {
  try {
    await jobFieldService.deleteCluster(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const createRole = async (req, res) => {
  try {
    const row = await jobFieldService.createRole({
      clusterId: req.body.clusterId,
      value: req.body.value,
      synonyms: req.body.synonyms || [],
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const updateRole = async (req, res) => {
  try {
    const row = await jobFieldService.updateRole(req.params.id, {
      value: req.body.value,
      synonyms: req.body.synonyms || [],
    });
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const deleteRole = async (req, res) => {
  try {
    await jobFieldService.deleteRole(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const suggestClusters = async (req, res) => {
  try {
    const suggestions = await jobFieldService.suggestClusters(req.body.categoryId, { previewOnly: true });
    res.json({ suggestions });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const suggestRoles = async (req, res) => {
  try {
    const suggestions = await jobFieldService.suggestRoles(req.body.clusterId, { previewOnly: true });
    res.json({ suggestions });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const suggestRoleSynonyms = async (req, res) => {
  try {
    const { value, existingSynonyms } = req.body;
    const suggestions = await jobFieldService.suggestRoleSynonyms({
      roleValue: value,
      existingSynonyms: existingSynonyms || [],
    });
    res.json({ suggestions });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

module.exports = {
  list,
  createCategory,
  updateCategory,
  deleteCategory,
  createCluster,
  updateCluster,
  deleteCluster,
  createRole,
  updateRole,
  deleteRole,
  suggestClusters,
  suggestRoles,
  suggestRoleSynonyms,
};

