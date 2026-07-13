const candidateTagService = require('../services/candidateTagService');
const tagService = require('../services/tagService');
const Tag = require('../models/Tag');

const listForCandidate = async (req, res) => {
  try {
    const candidateId = req.query.candidateId || req.params.candidateId;
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 500;
    const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    let isActive = 'all';
    if (req.query.isActive === 'true') isActive = true;
    if (req.query.isActive === 'false') isActive = false;

    const result = await candidateTagService.listCandidateTagsPaginatedForAdmin({
      candidateId: candidateId ? String(candidateId).trim() : undefined,
      limit,
      offset,
      search,
      isActive,
    });

    res.json({
      data: result.rows,
      total: result.count,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    });
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
    const jobActions = Array.isArray(req.body.jobActions) ? req.body.jobActions : [];
    const deletionContext = req.body.deletionContext || null;
    if (!actions.length && !jobActions.length) {
      return res.status(400).json({ message: 'No actions provided' });
    }
    if (actions.length) {
      await candidateTagService.bulkUpdateCandidateTags(actions);
    }
    if (jobActions.length) {
      await candidateTagService.bulkUpdateJobTags(jobActions);
    }

    if (deletionContext?.tagId && deletionContext?.mode) {
      const tag = await Tag.findByPk(deletionContext.tagId);
      let targetTagName = deletionContext.targetTagName || null;
      if (!targetTagName && deletionContext.targetTagId) {
        const target = await Tag.findByPk(deletionContext.targetTagId, {
          attributes: ['displayNameHe', 'displayNameEn', 'tagKey'],
        });
        if (target) {
          const plain = target.get({ plain: true });
          targetTagName = plain.displayNameHe || plain.displayNameEn || plain.tagKey;
        }
      }
      const actorCtx = req.dbUser
        ? (() => {
            const p = req.dbUser.get ? req.dbUser.get({ plain: true }) : req.dbUser;
            return { id: p.id, name: p.name || p.email, email: p.email };
          })()
        : {
            id: req.user?.sub || req.user?.id || 'system',
            name: req.user?.name || req.user?.email || null,
            email: req.user?.email || null,
          };
      await tagService.recordTagDeletionResolution({
        tagId: deletionContext.tagId,
        actor: actorCtx.id,
        mode: deletionContext.mode,
        targetTagId: deletionContext.targetTagId,
        targetTagName,
        candidateCount: deletionContext.candidateCount,
        jobCount: deletionContext.jobCount,
        beforeTag: tag ? tag.get({ plain: true }) : undefined,
        actorName: actorCtx.name,
        actorEmail: actorCtx.email,
      });
    }

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

// GET /api/candidate-tags/by-name?name=xxxx
// Uses candidateTagService.findTagByNameOrAlias to resolve the tag and returns CandidateTag rows for it.
const listByTagName = async (req, res) => {
  try {
    const { name } = req.query || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'name query parameter is required' });
    }

    const cleanedName = String(name).trim();

    const tag = await candidateTagService.findTagByNameOrAlias(cleanedName);
    if (!tag) {
      return res.json([]);
    }

    const records = await candidateTagService.listCandidateTagsByTagName(cleanedName);
    res.json(records);
  } catch (err) {
    console.error('[candidateTagController.listByTagName]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidate tags by name' });
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
  listByTagName,
};

