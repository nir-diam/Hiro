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

const list = async (_req, res) => {
  const tags = await tagService.list();
  res.json(tags);
};

const get = async (req, res) => {
  try {
    const tag = await tagService.getById(req.params.id);
    res.json(tag);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
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
    const tag = await tagService.create(req.body, {
      actingUser: userId,
      source,
      createdBy: userId,
      updatedBy: userId,
    });
    tagEmbeddingService.scheduleTagEmbedding(tag);
    res.status(201).json(tag);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || 'system';
    const tag = await tagService.update(req.params.id, req.body, {
      actingUser: userId,
      updatedBy: userId,
    });
    tagEmbeddingService.scheduleTagEmbedding(tag);
    res.json(tag);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Missing tag id' });
  }

  try {
    await tagService.remove(id);
    res.status(204).end();
  } catch (err) {
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
    await CandidateTag.update({ tag_id: targetTag.id }, { where: candidateTagFilter });
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

