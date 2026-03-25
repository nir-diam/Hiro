const { Op } = require('sequelize');
const tagService = require('../services/tagService');
const Tag = require('../models/Tag');
const TagHistory = require('../models/TagHistory');
const CandidateTag = require('../models/CandidateTag');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
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
  const entries = await candidateTagService.listCandidateTagsByTag(tagId, { activeOnly: false });
  return entries.map((entry) => ({
    candidate_tag_id: entry.id,
    candidate_id: entry.candidate_id,
    full_name: entry.candidate?.fullName || entry.candidate?.full_name,
    email: entry.candidate?.email,
    phone: entry.candidate?.phone,
  }));
};

const listTagJobsHelper = async (tagId) => {
  // Find jobs whose JSONB skills array contains an element with name matching the tag key/display name
  const tag = await Tag.findByPk(tagId);
  if (!tag) return [];

  const plain = tag.toJSON ? tag.toJSON() : tag.get({ plain: true });
  const rawName = plain.displayNameHe || plain.displayNameEn || plain.tagKey;
  const tagName = (rawName || '').toString().trim();
  if (!tagName) return [];

  const [rows] = await sequelize.query(
    `SELECT id, title, status, client, "postingCode"
     FROM jobs
     WHERE skills IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements(skills) elem
         WHERE elem ->> 'name' = :tagName
       )`,
    { replacements: { tagName } },
  );
  return rows;
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
    const candidates = await listTagCandidatesHelper(tagId);

    // If tag is not linked to any candidates, check if it is used on jobs (Job.skills JSONB)
    if (!candidates.length) {
      const jobs = await listTagJobsHelper(tagId);
      return res.json({ candidates: [], jobs });
    }

    res.json({ candidates, jobs: [] });
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

const listPending = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const rawMinUsage = Number(req.query.minUsage);
    const minUsage = Number.isFinite(rawMinUsage) ? Math.max(1, rawMinUsage) : 1;

    const parts = [{ status: 'pending' }];
    if (type && type !== 'all') {
      parts.push({ type });
    }
    if (minUsage > 1) {
      parts.push({ usageCount: { [Op.gte]: minUsage } });
    }
    if (search) {
      const like = `%${search}%`;
      parts.push({
        [Op.or]: [
          { tagKey: { [Op.iLike]: like } },
          { displayNameHe: { [Op.iLike]: like } },
          { displayNameEn: { [Op.iLike]: like } },
          { descriptionHe: { [Op.iLike]: like } },
          { category: { [Op.iLike]: like } },
        ],
      });
    }
    const where = parts.length === 1 ? parts[0] : { [Op.and]: parts };

    const { rows: entries, count: total } = await Tag.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const tagIds = entries.map((t) => t.id);
    let tagToCandidates = new Map();
    if (tagIds.length) {
      const candidateTags = await CandidateTag.findAll({
        where: { tag_id: { [Op.in]: tagIds } },
        attributes: ['tag_id', 'candidate_id'],
      });
      const candidateIds = [...new Set(candidateTags.map((ct) => ct.candidate_id))];
      const candidates =
        candidateIds.length === 0
          ? []
          : await Candidate.findAll({
              where: { id: { [Op.in]: candidateIds } },
              attributes: ['id', 'fullName', 'email'],
            });
      const candidateMap = new Map(candidates.map((c) => [c.id, c.get({ plain: true })]));
      for (const tid of tagIds) {
        tagToCandidates.set(tid, []);
      }
      for (const ct of candidateTags) {
        const c = candidateMap.get(ct.candidate_id);
        if (!c) continue;
        const list = tagToCandidates.get(ct.tag_id);
        if (list && !list.some((x) => x.id === c.id)) list.push(c);
      }
    }

    const payload = entries.map((tag) => {
      const plain = tag.toJSON ? tag.toJSON() : tag.get({ plain: true });
      delete plain.embedding;
      plain.candidates = tagToCandidates.get(tag.id) || [];
      return plain;
    });

    const [totalPending, pendingUsageSum] = await Promise.all([
      Tag.count({ where: { status: 'pending' } }),
      Tag.sum('usageCount', { where: { status: 'pending' } }).then((v) => Number(v) || 0),
    ]);

    res.json({
      data: payload,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats: {
        totalPending,
        pendingUsageSum,
      },
    });
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
    // Ensure target tag is linked and active for every candidate that had the pending tag
    for (const cid of candidateIds) {
      const existingLink = await CandidateTag.findOne({
        where: { candidate_id: cid, tag_id: targetTag.id },
      });

      if (!existingLink) {
        // No row yet for this candidate+targetTag -> create it explicitly as active
        await CandidateTag.create({
          candidate_id: cid,
          tag_id: targetTag.id,
          is_active: true,
        });
      } else if (existingLink.is_active === false) {
        // Row exists but is inactive -> reactivate it
        await existingLink.update({ is_active: true });
      }
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
        // Also update any jobs' skills entries that still reference this pending tag
        const pendingPlain = entry.toJSON ? entry.toJSON() : entry.get({ plain: true });
        const pendingRawName = pendingPlain.displayNameHe || pendingPlain.displayNameEn || pendingPlain.tagKey;
        const pendingName = (pendingRawName || '').toString().trim();
        const pendingKey = (pendingPlain.tagKey || '').toString().trim();

        const targetPlain = targetTag.toJSON ? targetTag.toJSON() : targetTag.get({ plain: true });
        const targetRawName =
          targetPlain.displayNameHe || targetPlain.displayNameEn || targetPlain.tagKey;
        const targetName = (targetRawName || '').toString().trim();
        const targetKey = (targetPlain.tagKey || '').toString().trim();
        const targetType = targetPlain.type; // matches Job.skills.tagType domain (role, skill, industry, ...)

        if (pendingName || pendingKey) {
          const jobs = await listTagJobsHelper(entry.id);
          for (const jobRow of jobs) {
            const jobInstance = await Job.findByPk(jobRow.id);
            if (!jobInstance) continue;

            const currentSkills = Array.isArray(jobInstance.skills) ? jobInstance.skills : [];
            let changed = false;
            const updatedSkills = currentSkills.map((skill) => {
              if (
                !skill ||
                (typeof skill.name !== 'string' && typeof skill.key !== 'string')
              ) {
                return skill;
              }

              const skillName = (skill.name || '').toString().trim();
              const skillKey = (skill.key || '').toString().trim();

              const matchesByName =
                pendingName && skillName && skillName === pendingName;
              const matchesByKey =
                pendingKey && skillKey && skillKey === pendingKey;

              if (!matchesByName && !matchesByKey) return skill;

              changed = true;
              return {
                ...skill,
                key: targetKey || skill.key,
                name: targetName || skill.name,
                tagType: targetType || skill.tagType,
              };
            });

            if (changed) {
              await jobInstance.update({ skills: updatedSkills });
            }
          }
        }
      }

      if (action === 'ignore') {
        // Also remove this tag from any jobs' skills arrays where its name appears
        const plain = entry.toJSON ? entry.toJSON() : entry.get({ plain: true });
        const rawName = plain.displayNameHe || plain.displayNameEn || plain.tagKey;
        const tagName = (rawName || '').toString().trim();
        if (tagName) {
          const jobs = await listTagJobsHelper(entry.id);
          for (const jobRow of jobs) {
            const jobInstance = await Job.findByPk(jobRow.id);
            if (!jobInstance) continue;
            const currentSkills = Array.isArray(jobInstance.skills) ? jobInstance.skills : [];
            const filtered = currentSkills.filter(
              (skill) => !skill || typeof skill.name !== 'string' || skill.name.trim() !== tagName,
            );
            if (filtered.length !== currentSkills.length) {
              await jobInstance.update({ skills: filtered });
            }
          }
        }
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

