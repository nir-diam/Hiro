const candidateTagService = require('../services/candidateTagService');

const listForCandidate = async (req, res) => {
  try {
    const candidateId = req.query.candidateId || req.params.candidateId;
    const tags = candidateId
      ? await candidateTagService.listCandidateTags(candidateId)
      : await candidateTagService.listAllCandidateTags();
    res.json(tags);
  } catch (err) {
    console.error('[candidateTagController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list candidate tags' });
  }
};

const create = async (req, res) => {
  try {
    const payload = req.body || {};
    const created = await candidateTagService.createCandidateTag(payload);
    res.status(201).json(created);
  } catch (err) {
    console.error('[candidateTagController.create]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create tag' });
  }
};

const update = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'id required' });
    const payload = req.body || {};
    const updated = await candidateTagService.updateCandidateTag(id, payload);
    if (!updated) return res.status(404).json({ message: 'Tag not found' });
    res.json(updated);
  } catch (err) {
    console.error('[candidateTagController.update]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to update tag' });
  }
};

const remove = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'id required' });
    const deleted = await candidateTagService.deleteCandidateTag(id);
    if (!deleted) return res.status(404).json({ message: 'Tag not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[candidateTagController.delete]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to delete tag' });
  }
};

const bulkUpdate = async (req, res) => {
  try {
    const actions = Array.isArray(req.body.actions) ? req.body.actions : [];
    if (!actions.length) {
      return res.status(400).json({ message: 'No actions provided' });
    }
    await candidateTagService.bulkUpdateCandidateTags(actions);
    res.json({ success: true });
  } catch (err) {
    console.error('[candidateTagController.bulkUpdate]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to bulk update tags' });
  }
};

const bulkCreate = async (req, res) => {
  try {
    const payload = req.body || {};
    const candidateId = payload.candidate_id || payload.candidateId;
    const entries = Array.isArray(payload.tags) ? payload.tags : [];
    if (!candidateId || !entries.length) {
      return res.status(400).json({ message: 'candidate_id and tags are required' });
    }
    const created = [];
    for (const entry of entries) {
      const tagEntry = {
        candidate_id: candidateId,
        tagKey: entry.tagKey || entry.key || entry.name,
        displayNameHe: entry.displayNameHe || entry.name,
        displayNameEn: entry.displayNameEn || entry.name,
        raw_type: entry.raw_type || entry.type || entry.category,
        context: entry.context,
        confidence_score: entry.confidence_score,
        calculated_weight: entry.calculated_weight,
        final_score: entry.final_score,
      };
      const record = await candidateTagService.createCandidateTag(tagEntry);
      if (record) created.push(record);
    }
    res.status(201).json(created);
  } catch (err) {
    console.error('[candidateTagController.bulkCreate]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create tags' });
  }
};

const listByTag = async (req, res) => {
  try {
    const { tagId } = req.params;
    if (!tagId) return res.status(400).json({ message: 'tagId required' });
    const records = await candidateTagService.listCandidateTagsByTag(tagId);
    res.json(records);
  } catch (err) {
    console.error('[candidateTagController.listByTag]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidate tags' });
  }
};

const countByTags = async (req, res) => {
  try {
    const { tagIds } = req.body || {};
    if (!Array.isArray(tagIds) || !tagIds.length) {
      return res.status(400).json({ message: 'tagIds required' });
    }
    const counts = await candidateTagService.countTagUsage(tagIds);
    res.json(counts);
  } catch (err) {
    console.error('[candidateTagController.countByTags]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to count tags' });
  }
};

module.exports = {
  listForCandidate,
  create,
  update,
  remove,
  bulkUpdate,
  bulkCreate,
  listByTag,
  countByTags,
};

