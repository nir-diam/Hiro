const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');
const { sendChat } = require('./geminiService');

const list = async () => {
  const categories = await JobCategory.findAll({
    order: [['name', 'ASC']],
    include: [{
      model: JobCluster,
      as: 'clusters',
      order: [['name', 'ASC']],
      include: [{ model: JobRole, as: 'roles', order: [['value', 'ASC']] }],
    }],
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    fieldTypes: (c.clusters || []).map((cl) => ({
      id: cl.id,
      name: cl.name,
      roles: (cl.roles || []).map((r) => ({
        id: r.id,
        value: r.value,
        synonyms: r.synonyms || [],
      })),
    })),
  }));
};

const createCategory = async (name) => JobCategory.create({ name });
const updateCategory = async (id, name) => {
  const row = await JobCategory.findByPk(id);
  if (!row) throw Object.assign(new Error('Category not found'), { status: 404 });
  row.name = name;
  await row.save();
  return row;
};
const deleteCategory = async (id) => {
  const deleted = await JobCategory.destroy({ where: { id } });
  if (!deleted) throw Object.assign(new Error('Category not found'), { status: 404 });
};

const createCluster = async ({ categoryId, name }) => JobCluster.create({ categoryId, name });
const updateCluster = async (id, name) => {
  const row = await JobCluster.findByPk(id);
  if (!row) throw Object.assign(new Error('Cluster not found'), { status: 404 });
  row.name = name;
  await row.save();
  return row;
};
const deleteCluster = async (id) => {
  const deleted = await JobCluster.destroy({ where: { id } });
  if (!deleted) throw Object.assign(new Error('Cluster not found'), { status: 404 });
};

const createRole = async ({ clusterId, value, synonyms = [] }) => JobRole.create({ clusterId, value, synonyms });
const updateRole = async (id, { value, synonyms = [] }) => {
  const row = await JobRole.findByPk(id);
  if (!row) throw Object.assign(new Error('Role not found'), { status: 404 });
  row.value = value;
  row.synonyms = synonyms;
  await row.save();
  return row;
};
const deleteRole = async (id) => {
  const deleted = await JobRole.destroy({ where: { id } });
  if (!deleted) throw Object.assign(new Error('Role not found'), { status: 404 });
};

// --- AI SUGGESTIONS ---
const parseJsonArray = (text) => {
  if (!text) return [];
  // Try direct JSON
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    /* ignore */
  }
  // Try to extract first JSON array
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      /* ignore */
    }
  }
  throw Object.assign(new Error('Failed to parse AI JSON response'), { status: 400 });
};

const suggestClusters = async (categoryId, { previewOnly = true } = {}) => {
  const category = await JobCategory.findByPk(categoryId, {
    include: [{
      model: JobCluster,
      as: 'clusters',
      include: [{ model: JobRole, as: 'roles' }],
    }],
  });
  if (!category) throw Object.assign(new Error('Category not found'), { status: 404 });

  const existingClusters = (category.clusters || []).map((c) => c.name);
  const existingRoles = (category.clusters || []).flatMap((c) =>
    (c.roles || []).map((r) => `${c.name}::${r.value}`),
  );

  const systemPrompt = `You are a taxonomy expert for job fields. Suggest up to 5 new clusters (sub-domains) that are missing for this category. 
Return ONLY a JSON array of strings (cluster names), nothing else. Do not include existing clusters. Use Hebrew where relevant.`;
  const userMessage = `Category: ${category.name}
Existing clusters: ${existingClusters.join(', ') || 'none'}
Existing roles: ${existingRoles.join(', ') || 'none'}
Return JSON array of new cluster names.`;

  const reply = await sendChat({
    apiKey: process.env.GIMINI_KEY
      || process.env.GEMINI_KEY
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.API_KEY,
    systemPrompt,
    history: [{ role: 'user', text: userMessage }],
  });

  const suggestions = parseJsonArray(reply)
    .map((s) => (typeof s === 'string' ? s.trim() : s?.name || s))
    .filter(Boolean);

  const existingSet = new Set(existingClusters.map((n) => n.toLowerCase()));
  const uniqueNew = Array.from(new Set(suggestions))
    .filter((n) => !existingSet.has(n.toLowerCase()))
    .slice(0, 5);

  if (previewOnly) {
    return uniqueNew.map((name) => ({ name }));
  }

  const created = [];
  for (const name of uniqueNew) {
    const row = await JobCluster.create({ categoryId, name });
    created.push({ id: row.id, name: row.name, roles: [] });
  }
  return created;
};

const suggestRoles = async (clusterId, { previewOnly = true } = {}) => {
  const cluster = await JobCluster.findByPk(clusterId, {
    include: [
      { model: JobCategory, as: 'category' },
      { model: JobRole, as: 'roles' },
    ],
  });
  if (!cluster) throw Object.assign(new Error('Cluster not found'), { status: 404 });

  const existingRoles = (cluster.roles || []).map((r) => r.value);

  const systemPrompt = `You are a taxonomy expert for job roles. Suggest up to 5 missing roles for this cluster. 
Return ONLY a JSON array of role objects: [{"value":"<role title>","synonyms":["...","..."]}]. 
Do not include existing roles. Use Hebrew titles where relevant. Keep synonyms short.`;

  const userMessage = `Category: ${cluster.category?.name || ''}
Cluster: ${cluster.name}
Existing roles: ${existingRoles.join(', ') || 'none'}`;

  const reply = await sendChat({
    apiKey: process.env.GIMINI_KEY
      || process.env.GEMINI_KEY
      || process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.API_KEY,
    systemPrompt,
    history: [{ role: 'user', text: userMessage }],
  });

  const suggestions = parseJsonArray(reply)
    .map((s) => {
      if (typeof s === 'string') return { value: s.trim(), synonyms: [] };
      return { value: s?.value || s?.title || '', synonyms: Array.isArray(s?.synonyms) ? s.synonyms : [] };
    })
    .filter((s) => s.value);

  const existingSet = new Set(existingRoles.map((n) => n.toLowerCase()));
  const uniqueNew = [];
  for (const s of suggestions) {
    if (!existingSet.has(s.value.toLowerCase())) {
      uniqueNew.push(s);
      if (uniqueNew.length >= 5) break;
    }
  }

  if (previewOnly) {
    return uniqueNew;
  }

  const created = [];
  for (const r of uniqueNew) {
    const row = await JobRole.create({
      clusterId,
      value: r.value,
      synonyms: r.synonyms || [],
    });
    created.push({ id: row.id, value: row.value, synonyms: row.synonyms || [] });
  }
  return created;
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
};

