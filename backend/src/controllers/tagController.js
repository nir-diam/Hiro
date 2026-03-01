const { Op } = require('sequelize');
const tagService = require('../services/tagService');
const Tag = require('../models/Tag');
const TagHistory = require('../models/TagHistory');
const CandidateTag = require('../models/CandidateTag');
const { sequelize } = require('../config/db');
const candidateTagService = require('../services/candidateTagService');
const tagEmbeddingService = require('../services/tagEmbeddingService');

const enrich = async (req, res) => {
  try {
    const suggestions = await tagService.enrichSuggestions(req.body.tags || []);
    res.json({ suggestions });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Enrich failed' });
  }
};

const sanitizeTagPayload = (tag) => {
  const payload = tag.toJSON ? tag.toJSON() : { ...tag };
  delete payload.embedding;
  return payload;
};

const parseListParam = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const list = async (req, res) => {
  try {
    const page = Number(req.query.page) || undefined;
    const limit = Number(req.query.limit) || undefined;
    const parsedStatuses = parseListParam(req.query.statuses);
    const options = {
      page,
      limit,
      searchTerm: req.query.search,
      synonymSearch: req.query.synonym,
      types: parseListParam(req.query.types),
      categories: parseListParam(req.query.categories),
      statuses: parsedStatuses,
      sourceFilter: req.query.source,
      createdFrom: req.query.createdFrom,
      createdTo: req.query.createdTo,
      updatedFrom: req.query.updatedFrom,
      updatedTo: req.query.updatedTo,
      sort: req.query.sort,
      direction: req.query.direction,
    };
    const { rows, total, page: currentPage, limit: currentLimit } = await tagService.list(options);
    const sanitized = rows.map(sanitizeTagPayload);
    res.json({ data: sanitized, total, page: currentPage, limit: currentLimit });
  } catch (err) {
    console.error('[tagController.list]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load tags' });
  }
};

const get = async (req, res) => {
  try {
    const tag = await tagService.getById(req.params.id);
    const payload = tag.toJSON ? tag.toJSON() : { ...tag };
    delete payload.embedding;
    res.json(payload);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const fireAndForget = (promise) => {
  if (!promise || typeof promise.catch !== 'function') return;
  promise.catch((err) => console.error('[tagController] background task failed', err?.message || err));
};

const create = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || 'system';
    const source =
      typeof req.body?.source === 'string'
        ? req.body.source
        : req.body?.qualityState === 'initial_detection'
          ? 'ai'
          : 'manual';
    const payload = { ...req.body };
    const normalizedName =
      (payload.displayNameHe || payload.displayNameEn || payload.tagKey || '')
        .toString()
        .trim();
  if (normalizedName) {
    const duplicate = await Tag.findOne({
      where: {
        [Op.or]: [
          sequelize.where(sequelize.fn('LOWER', sequelize.col('display_name_he')), normalizedName.toLowerCase()),
          sequelize.where(sequelize.fn('LOWER', sequelize.col('tag_key')), normalizedName.toLowerCase()),
        ],
      },
    });
    if (duplicate) {
      const existing = duplicate.toJSON ? duplicate.toJSON() : { ...duplicate };
      console.info('[tagController.create] duplicate tag detected', normalizedName, existing.id);
      return res.status(409).json({
        message: 'This tag already exists',
        duplicate: {
          id: existing.id,
          tagKey: existing.tagKey,
          displayNameHe: existing.displayNameHe,
          displayNameEn: existing.displayNameEn,
        },
      });
    }
  }
    if (!payload.status) {
      payload.status = 'draft';
    }
    delete payload.embedding;
    const tag = await tagService.create(payload, {
      actingUser: userId,
      source,
      createdBy: userId,
      updatedBy: userId,
    });
    fireAndForget(tagEmbeddingService.scheduleTagEmbedding(tag));
    const responsePayload = tag.toJSON ? tag.toJSON() : { ...tag };
    delete responsePayload.embedding;
    res.status(201).json(responsePayload);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || 'system';
    const payload = { ...req.body };
    delete payload.embedding;
    const tag = await tagService.update(req.params.id, payload, {
      actingUser: userId,
      updatedBy: userId,
    });
    fireAndForget(tagEmbeddingService.scheduleTagEmbedding(tag));
    const responsePayload = tag.toJSON ? tag.toJSON() : { ...tag };
    delete responsePayload.embedding;
    res.json(responsePayload);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Missing tag id' });
  }

  const transaction = await sequelize.transaction();
  try {
    await TagHistory.destroy({ where: { tag_id: id }, transaction });
    await tagService.remove(id, { transaction });
    await transaction.commit();
    res.status(204).end();
  } catch (err) {
    await transaction.rollback();

    const isFkError =
      err?.parent?.constraint === 'candidate_tags_tag_id_fkey' ||
      err?.code === '23503' ||
      (err?.message || '').includes('candidate_tags_tag_id_fkey');

    if (isFkError) {
      let candidates = [];
      let helperError = null;
      try {
        candidates = await listTagCandidatesHelper(id);
      } catch (fetchErr) {
        helperError = fetchErr?.message || 'failed to load';
        console.error('[tagController.remove] failed to load blocking candidates', fetchErr);
      }
      return res.status(409).json({
        message: 'Tag is still used by candidates',
        candidates,
        helperError,
      });
    }

    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const listTagCandidatesHelper = async (tagId) => {
  const entries = await candidateTagService.listAllCandidateTags();
  return entries
    .filter((entry) => entry.tag_id === tagId)
    .map((entry) => ({
      candidate_tag_id: entry.id,
      candidate_id: entry.candidate_id,
      full_name: entry.candidate?.fullName || entry.candidate?.full_name,
      email: entry.candidate?.email,
      phone: entry.candidate?.phone,
    }));
};

const cleanupPendingTagCorrections = async (terms = []) => {
  const normalizedTerms = Array.from(
    new Set(
      (Array.isArray(terms) ? terms : [])
        .map((term) => (term || '').toString().trim())
        .filter(Boolean),
    ),
  );
  if (!normalizedTerms.length) return;
  await Tag.destroy({
    where: {
      status: 'pending',
      [Op.or]: [
        { displayNameHe: { [Op.in]: normalizedTerms } },
        { displayNameEn: { [Op.in]: normalizedTerms } },
        { tagKey: { [Op.in]: normalizedTerms } },
      ],
    },
  });
};

const listTagCandidates = async (req, res) => {
  const tagId = req.params.id;
  if (!tagId) {
    return res.status(400).json({ message: 'Missing tag id' });
  }

  try {
    const rows = await listTagCandidatesHelper(tagId);
    res.json(rows);
  } catch (err) {
    console.error('[tagController.listTagCandidates]', err);
    res.status(500).json({ message: 'Failed to load candidate tags for this tag' });
  }
};

const getHistory = async (req, res) => {
  const tagId = req.params.id;
  if (!tagId) {
    return res.status(400).json({ message: 'Missing tag id' });
  }

  try {
    const entries = await TagHistory.findAll({
      where: { tag_id: tagId },
      order: [['created_at', 'DESC']],
    });
    res.json(entries);
  } catch (err) {
    console.error('[tagController.getHistory]', err);
    res.status(500).json({ message: 'Failed to load tag history' });
  }
};

const listPending = async (_req, res) => {
  try {
    const entries = await Tag.findAll({
      where: { status: 'pending' },
      order: [['createdAt', 'DESC']],
    });
    res.json(entries);
  } catch (err) {
    console.error('[tagController] listPending error', err);
    res.status(500).json({ message: 'Failed to load pending tags' });
  }
};

const resolvePending = async (req, res) => {
  const { ids = [], action, targetTagId } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ message: 'No tag IDs provided' });
  }

  const entries = await Tag.findAll({
    where: {
      id: ids,
      status: 'pending',
    },
  });
  if (!entries.length) {
    return res.status(404).json({ message: 'No matching pending tags found' });
  }

  let targetTag = null;
  if (action === 'link') {
    targetTag = await Tag.findByPk(targetTagId);
    if (!targetTag) {
      return res.status(404).json({ message: 'Target tag not found' });
    }
  }

  const pendingTagIds = entries.map((entry) => entry.id);
  const hasPendingTags = pendingTagIds.length > 0;
  const candidateTagFilter = hasPendingTags ? { tag_id: { [Op.in]: pendingTagIds } } : null;

  if (action === 'link' && targetTag && hasPendingTags) {
    // Update each candidate_tag row: if candidate already has target tag, remove the pending row; else reassign to target tag (avoids unique constraint)
    const rows = await CandidateTag.findAll({ where: candidateTagFilter });
    const candidateIds = [...new Set(rows.map((r) => r.candidate_id))];
    for (const row of rows) {
      const alreadyHas = await CandidateTag.findOne({
        where: { candidate_id: row.candidate_id, tag_id: targetTag.id },
      });
      if (alreadyHas) {
        await row.destroy();
      } else {
        await row.update({ tag_id: targetTag.id });
      }
    }
    // Ensure target tag is linked for every candidate that had the pending tag (when we add to aliases below, the candidate must have the targetTag in CandidateTag)
    for (const cid of candidateIds) {
      await CandidateTag.findOrCreate({
        where: { candidate_id: cid, tag_id: targetTag.id },
        defaults: { candidate_id: cid, tag_id: targetTag.id },
        isActive: true,
      });
    }
  }

  if (action === 'ignore' && hasPendingTags) {
    await CandidateTag.destroy({ where: candidateTagFilter });
  }

  try {
    for (const entry of entries) {
      const suggestedName = String(entry.displayNameHe || entry.tagKey || '').trim();

      if (action === 'create') {
        entry.status = 'active';
        entry.qualityState = entry.qualityState || 'initial_detection';
        entry.source = entry.source || 'ai';
        await entry.save({ fields: ['status', 'qualityState', 'source'] });
        continue;
      }

      if (action === 'link' && targetTag) {
        const existingAliases = Array.isArray(targetTag.aliases) ? [...targetTag.aliases] : [];
        if (suggestedName && !existingAliases.includes(suggestedName)) {
          existingAliases.push(suggestedName);
          targetTag.aliases = existingAliases;
          await targetTag.save({ fields: ['aliases'] });
        }
        await cleanupPendingTagCorrections(existingAliases);
      }

      if (action !== 'create') {
        await TagHistory.destroy({ where: { tag_id: entry.id } });
        await entry.destroy();
      }
    }

    const affectedIds = entries.map((entry) => entry.id).filter(Boolean);
    affectedIds.forEach((tagId) => tagEmbeddingService.scheduleTagEmbedding({ id: tagId }));

    res.json({ success: true });
  } catch (err) {
    console.error('[tagController] resolvePending error', err);
    res.status(500).json({ message: 'Failed to resolve pending tags' });
  }
};

const rebuildEmbeddings = async (_req, res) => {
  try {
    await tagEmbeddingService.rebuildAllEmbeddings();
    res.json({ success: true });
  } catch (err) {
    console.error('[tagController.rebuildEmbeddings]', err);
    res.status(500).json({ message: 'Failed to rebuild tag embeddings' });
  }
};

const rebuildEmbedding = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Missing tag id' });
  }
  try {
    await tagEmbeddingService.rebuildTagEmbedding(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[tagController.rebuildEmbedding]', err);
    res.status(500).json({ message: 'Failed to rebuild tag embedding' });
  }
};

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  enrich,
  listPending,
  resolvePending,
  listTagCandidates,
  getHistory,
  rebuildEmbeddings,
  rebuildEmbedding,
};

