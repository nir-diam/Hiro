const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');
const Tag = require('../models/Tag');
const { sendChat } = require('./geminiService');
const promptService = require('./promptService');
const jobFieldEmbeddingService = require('./jobFieldEmbeddingService');

const ROLE_TAG_INCLUDE = {
  model: Tag,
  as: 'tags',
  through: { attributes: [] },
};

const list = async () => {
  const categories = await JobCategory.findAll({
    order: [['name', 'ASC']],
    include: [{
      model: JobCluster,
      as: 'clusters',
      order: [['name', 'ASC']],
      include: [{
        model: JobRole,
        as: 'roles',
        order: [['value', 'ASC']],
        include: [ROLE_TAG_INCLUDE],
      }],
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

const createCategory = async (name) => {
  const row = await JobCategory.create({ name });
  jobFieldEmbeddingService.scheduleCategoryEmbedding(row);
  return row;
};
const updateCategory = async (id, name) => {
  const row = await JobCategory.findByPk(id);
  if (!row) throw Object.assign(new Error('Category not found'), { status: 404 });
  row.name = name;
  await row.save();
  jobFieldEmbeddingService.scheduleCategoryEmbedding(row);
  return row;
};
const deleteCategory = async (id) => {
  const deleted = await JobCategory.destroy({ where: { id } });
  if (!deleted) throw Object.assign(new Error('Category not found'), { status: 404 });
};

const createCluster = async ({ categoryId, name }) => {
  const row = await JobCluster.create({ categoryId, name });
  jobFieldEmbeddingService.scheduleClusterEmbedding(row);
  return row;
};
const updateCluster = async (id, name) => {
  const row = await JobCluster.findByPk(id);
  if (!row) throw Object.assign(new Error('Cluster not found'), { status: 404 });
  row.name = name;
  await row.save();
  jobFieldEmbeddingService.scheduleClusterEmbedding(row);
  return row;
};
const deleteCluster = async (id) => {
  const deleted = await JobCluster.destroy({ where: { id } });
  if (!deleted) throw Object.assign(new Error('Cluster not found'), { status: 404 });
};

const createRole = async ({ clusterId, value, synonyms = [], tagIds = [] }) => {
  const row = await JobRole.create({ clusterId, value, synonyms });
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
  await row.setTags(normalizedTagIds);
  jobFieldEmbeddingService.scheduleRoleEmbedding(row);
  return JobRole.findByPk(row.id, { include: [ROLE_TAG_INCLUDE] });
};

const updateRole = async (id, { value, synonyms = [], tagIds = [] }) => {
  const row = await JobRole.findByPk(id);
  if (!row) throw Object.assign(new Error('Role not found'), { status: 404 });
  row.value = value;
  row.synonyms = synonyms;
  await row.save();
  jobFieldEmbeddingService.scheduleRoleEmbedding(row);
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds.filter(Boolean) : [];
  await row.setTags(normalizedTagIds);
  return JobRole.findByPk(row.id, { include: [ROLE_TAG_INCLUDE] });
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

  // Fallback: treat lines as simple list entries
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-\d.\)\s]+/, '').trim())
    .filter(Boolean);
  if (lines.length) return lines;

  throw Object.assign(new Error('Failed to parse AI JSON response'), { status: 400 });
};

const buildPromptText = (template, replacements = {}) => {
  let text = template || '';
  Object.entries(replacements).forEach(([key, value]) => {
    const pattern = new RegExp(`{{${key}}}`, 'g');
    text = text.replace(pattern, value ?? '');
  });
  return text;
};

const parseSynonymArray = (text) => {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
    }
  } catch {
    // continue to fallback lines
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•\d.\)]\s*/, ''))
    .filter(Boolean);
};

const extractRoleLines = (lines) => {
  if (!lines.length) return [];
  const normalizedLines = lines.map(line => (typeof line === 'string' ? line : ''));
  const startIndex = normalizedLines.findIndex((line) => /הצעות|roles/i.test(line));
  const trimmed = startIndex >= 0 ? normalizedLines.slice(startIndex + 1) : normalizedLines;
  return trimmed
    .map(line => line.replace(/\*\*/g, '').trim())
    .filter((line) => {
      if (!line) return false;
      const lower = line.toLowerCase();
      if (lower.includes('שלום') || lower.includes('זהו') || lower.includes('מערכת')) return false;
      if (lower.includes('ללא מילים נרדפות')) return false;
      if (lower.includes('הצעות') && !line.match(/\(\s*\S+/)) return false;
      return true;
    });
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

  const systemPrompt = `You are Hiro, an expert Recruitment Taxonomy Assistant for job fields.
Your goal is to help the System Admin manage and expand the tags database.
You have access to a tool called \`createTag\`.
Use this tool whenever the user explicitly asks to add tags or agrees to your suggestions to add tags.
GUIDELINES:
1. **Infer Metadata**: When adding a tag, intelligently guess its \`type\` (e.g., 'skill', 'role', 'industry', 'tool') and a broad \`category\` (e.g., 'Development', 'Marketing').
2. **Proactive Assistance**: If the user asks for suggestions (e.g., "What skills are needed for a Product Manager?"), list the skills first, and then ask: "Should I add these to the system?".
3. **Language**: Always converse in Hebrew, but keep technical terms in English if appropriate.
4. **Context**: You are managing a database of tags for a recruitment system (ATS).
Example Trigger:
User: "תוסיף את Python ו-Java"
Action: Call \`createTag\` twice (once for Python, once for Java) with type='skill'.`;
  const userMessage = `Category: ${category.name}
Existing clusters: ${existingClusters.join(', ') || 'none'}
Existing roles: ${existingRoles.join(', ') || 'none'}
Return JSON array of new cluster names.`;

  const reply = await sendChat({
    apiKey: process.env.GEMINI_API_KEY
      || process.env.GEMINI_KEY
      || process.env.GIMINI_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.API_KEY,
    systemPrompt,
    message: userMessage,
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

  const systemPrompt = `You are Hiro, an expert Recruitment Taxonomy Assistant for job roles.
Your goal is to help the System Admin manage and expand the tags database.
You have access to a tool called \`createTag\`.
Use this tool whenever the user explicitly asks to add tags or agrees to your suggestions to add tags.
GUIDELINES:
1. **Infer Metadata**: When adding a tag, intelligently guess its \`type\` (e.g., 'skill', 'role', 'industry', 'tool') and a broad \`category\` (e.g., 'Development', 'Marketing').
2. **Proactive Assistance**: If the user asks for suggestions (e.g., "What skills are needed for a Product Manager?"), list the skills first, and then ask: "Should I add these to the system?".
3. **Language**: Always converse in Hebrew, but keep technical terms in English if appropriate.
4. **Context**: You are managing a database of tags for a recruitment system (ATS).
Example Trigger:
User: "תוסיף את Python ו-Java"
Action: Call \`createTag\` twice (once for Python, once for Java) with type='skill'.`;

  const userMessage = `Category: ${cluster.category?.name || ''}
Cluster: ${cluster.name}
Existing roles: ${existingRoles.join(', ') || 'none'}`;

  const reply = await sendChat({
    apiKey: process.env.GEMINI_API_KEY
      || process.env.GEMINI_KEY
      || process.env.GIMINI_KEY
      || process.env.GOOGLE_API_KEY
      || process.env.API_KEY,
    systemPrompt,
    message: userMessage,
  });

  const rawLines = parseJsonArray(reply);
  const roleLines = extractRoleLines(rawLines);
  const suggestions = roleLines
    .map((line) => {
      return { value: line, synonyms: [] };
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

const suggestRoleSynonyms = async ({ roleValue, existingSynonyms = [] }) => {
  const apiKey = process.env.GIMINI_KEY
    || process.env.GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.API_KEY;

  const systemPrompt = `Act as a Senior Recruitment Taxonomy Expert.
Your goal is to enrich a job role with relevant search synonyms, alternative job titles, and common abbreviations.

Target Role: "${roleValue}"
Current Existing Synonyms (MUST NOT be repeated): ${JSON.stringify(existingSynonyms)}

Directives:
1. Analyze the "Target Role" deeply (understand the seniority, domain, and specific nuances).
2. Generate 10-15 high-quality, distinct synonyms.
3. Languages: Include both Hebrew and English terms commonly used in the local market.
4. Validation:
- Exclude generic terms (e.g., just "Manager" is bad for "Product Manager").
- Exclude any term listed in "Current Existing Synonyms".
- Remove duplicates.
5. Format: Return ONLY a raw JSON array of strings. Do not use Markdown formatting (no \`\`\`json).
Example Output:
["Product Owner", "PM", "מנהל מוצר", "Head of Product"]`;

  const userMessage = 'Generate synonyms as instructed.';

  const reply = await sendChat({
    apiKey,
    systemPrompt,
    history: [{ role: 'user', text: userMessage }],
  });

  let parsed = [];
  try {
    parsed = JSON.parse(reply);
    if (!Array.isArray(parsed)) throw new Error('Response is not array');
  } catch (e) {
    const err = new Error('Failed to parse AI response');
    err.status = 400;
    throw err;
  }

  return parsed
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
};

const generateRoleSynonyms = async (roleId) => {
  const role = await JobRole.findByPk(roleId, {
    include: [{
      model: JobCluster,
      as: 'cluster',
      include: [{ model: JobCategory, as: 'category' }],
    }],
  });
  if (!role) throw Object.assign(new Error('Role not found'), { status: 404 });

  const cluster = role.cluster;
  const category = cluster?.category;
  const promptRecord = await promptService.getById('job_categories_synonyms_ai_completed');
  const systemPrompt = buildPromptText(promptRecord.template, {
    role_value: role.value || '',
    cluster_name: cluster?.name || '',
    category_name: category?.name || '',
    existing_synonyms: JSON.stringify(role.synonyms || []),
  });

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_KEY ||
    process.env.GIMINI_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY;
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }

  const reply = await sendChat({
    apiKey,
    systemPrompt,
    message: `Generate search-specific synonyms for "${role.value}".`,
  });

  const candidates = parseSynonymArray(reply);
  const existingSet = new Set((role.synonyms || []).map((value) => (value || '').trim().toLowerCase()));
  const newSynonyms = [];
  for (const candidate of candidates) {
    const trimmed = (candidate || '').trim();
    if (!trimmed) continue;
    if (existingSet.has(trimmed.toLowerCase())) continue;
    if (newSynonyms.some((item) => item.toLowerCase() === trimmed.toLowerCase())) continue;
    newSynonyms.push(trimmed);
    if (newSynonyms.length >= 10) break;
  }
  if (!newSynonyms.length) {
    return { id: role.id, value: role.value, synonyms: role.synonyms || [] };
  }
  role.synonyms = [...(role.synonyms || []), ...newSynonyms];
  await role.save();
  return { id: role.id, value: role.value, synonyms: role.synonyms || [] };
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
  generateRoleSynonyms,
};

