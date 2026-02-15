const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');
const { embedText } = require('./embeddingService');

const sanitizeEmbedding = (emb) => {
  if (emb === null || emb === undefined) return undefined;
  if (Array.isArray(emb)) return emb;
  if (typeof emb === 'string') {
    const cleaned = emb.trim().replace(/^\(|\)$/g, '');
    const parsedNumbers = cleaned
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((n) => Number.isFinite(n));
    return parsedNumbers.length ? parsedNumbers : undefined;
  }
  if (emb?.data) {
    const arr = Array.from(emb.data).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    return arr.length ? arr : undefined;
  }
  return undefined;
};

const buildText = (segments) =>
  segments
    .map((segment) => (segment || '').trim())
    .filter(Boolean)
    .join(' ');

const gatherCategoryText = (category) => {
  const segments = [category.name];
  (category.clusters || []).forEach((cluster) => {
    segments.push(cluster.name);
    (cluster.roles || []).forEach((role) => {
      segments.push(role.value);
      if (Array.isArray(role.synonyms)) segments.push(...role.synonyms);
    });
  });
  return buildText(segments);
};

const gatherClusterText = (cluster) => {
  const segments = [cluster.name, cluster.category?.name];
  (cluster.roles || []).forEach((role) => {
    segments.push(role.value);
    if (Array.isArray(role.synonyms)) segments.push(...role.synonyms);
  });
  return buildText(segments);
};

const gatherRoleText = (role) => {
  const segments = [role.value];
  if (Array.isArray(role.synonyms)) segments.push(...role.synonyms);
  return buildText(segments);
};

const updateEmbedding = async ({ model, id, textBuilder }) => {
  if (!id) return;
  const entity = await model.findByPk(id, {
    include:
      model === JobCategory
        ? [
            {
              model: JobCluster,
              as: 'clusters',
              include: [{ model: JobRole, as: 'roles' }],
            },
          ]
        : model === JobCluster
        ? [
            {
              model: JobRole,
              as: 'roles',
            },
            {
              model: JobCategory,
              as: 'category',
            },
          ]
        : [{ model: JobCluster, as: 'cluster' }],
  });
  if (!entity) return;
  const text = textBuilder(entity);
  if (!text) return;
  let embedding = [];
  try {
    embedding = await embedText(text);
  } catch (err) {
    console.error('[jobFieldEmbeddingService] embedText failed', err?.message || err);
    return;
  }
  const sanitized = sanitizeEmbedding(embedding);
  if (!sanitized || !sanitized.length) return;
  await entity.update({ embedding: sanitized }, { silent: true });
  return sanitized;
};

const updateCategoryEmbedding = async (categoryId) =>
  updateEmbedding({ model: JobCategory, id: categoryId, textBuilder: gatherCategoryText });

const updateClusterEmbedding = async (clusterId) =>
  updateEmbedding({ model: JobCluster, id: clusterId, textBuilder: gatherClusterText });

const updateRoleEmbedding = async (roleId) => {
  const role = await JobRole.findByPk(roleId, {
    include: [{ model: JobCluster, as: 'cluster' }],
  });
  if (!role) return;
  const text = gatherRoleText(role);
  if (!text) return;
  let embedding = [];
  try {
    embedding = await embedText(text);
  } catch (err) {
    console.error('[jobFieldEmbeddingService] embedText failed', err?.message || err);
    return;
  }
  const sanitized = sanitizeEmbedding(embedding);
  if (!sanitized || !sanitized.length) return;
  await role.update({ embedding: sanitized }, { silent: true });
  return sanitized;
};

const scheduleCategoryEmbedding = (category) => {
  if (!category || !category.id) return;
  setImmediate(() => {
    updateCategoryEmbedding(category.id).catch((err) => {
      console.error('[jobFieldEmbeddingService] scheduled category embedding failed', err?.message || err);
    });
  });
};

const scheduleClusterEmbedding = (cluster) => {
  if (!cluster || !cluster.id) return;
  setImmediate(() => {
    updateClusterEmbedding(cluster.id).catch((err) => {
      console.error('[jobFieldEmbeddingService] scheduled cluster embedding failed', err?.message || err);
    });
  });
};

const scheduleRoleEmbedding = (role) => {
  if (!role || !role.id) return;
  setImmediate(() => {
    updateRoleEmbedding(role.id).catch((err) => {
      console.error('[jobFieldEmbeddingService] scheduled role embedding failed', err?.message || err);
    });
  });
};

const rebuildAllEmbeddings = async () => {
  const categories = await JobCategory.findAll();
  for (const category of categories) {
    await updateCategoryEmbedding(category.id);
  }
  const clusters = await JobCluster.findAll();
  for (const cluster of clusters) {
    await updateClusterEmbedding(cluster.id);
  }
  const roles = await JobRole.findAll();
  for (const role of roles) {
    await updateRoleEmbedding(role.id);
  }
};

module.exports = {
  scheduleCategoryEmbedding,
  scheduleClusterEmbedding,
  scheduleRoleEmbedding,
  rebuildAllEmbeddings,
  updateRoleEmbedding,
};

