const { Op } = require('sequelize');
const tagService = require('../services/tagService');
const Tag = require('../models/Tag');
const TagHistory = require('../models/TagHistory');
const SystemTag = require('../models/SystemTag');
const { SYSTEM_TAG_TYPE_CANDIDATE, SYSTEM_TAG_TYPE_JOB } = require('../models/SystemTag');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const { sequelize } = require('../config/db');
const candidateTagService = require('../services/candidateTagService');
const tagEmbeddingService = require('../services/tagEmbeddingService');
const tagCorrectionAgentService = require('../services/tagCorrectionAgentService');
const tagAiDecisionResolveService = require('../services/tagAiDecisionResolveService');
const User = require('../models/User');
const TagAiDecision = require('../models/TagAiDecision');

const TAG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidTagIdParam = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return false;
  return TAG_ID_RE.test(s);
};

const loadAiQueuedPendingTagIds = async () => {
  const rows = await TagAiDecision.findAll({
    where: { reviewStatus: 'pending_review' },
    attributes: ['pendingTagId'],
    raw: true,
  });
  return [...new Set(rows.map((row) => row.pendingTagId).filter(Boolean))];
};

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
  if (!payload.createdAt && payload.created_at) {
    payload.createdAt = payload.created_at;
  }
  if (!payload.updatedAt && payload.updated_at) {
    payload.updatedAt = payload.updated_at;
  }
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
    const onlyCreatedFrom =
      req.query.createdFrom &&
      !req.query.createdTo &&
      !req.query.updatedFrom &&
      !req.query.updatedTo &&
      !req.query.activityDate &&
      !req.query.activityFrom &&
      !req.query.activityTo;
    const options = {
      page,
      limit,
      searchTerm: req.query.search,
      synonymSearch: req.query.synonym,
      types: parseListParam(req.query.types),
      categories: parseListParam(req.query.categories),
      statuses: parsedStatuses,
      sources: parseListParam(req.query.sources || req.query.source),
      createdFrom: onlyCreatedFrom ? undefined : req.query.createdFrom,
      createdTo: req.query.createdTo,
      updatedFrom: req.query.updatedFrom,
      updatedTo: req.query.updatedTo,
      activityDate: req.query.activityDate || (onlyCreatedFrom ? req.query.createdFrom : undefined),
      activityFrom: req.query.activityFrom,
      activityTo: req.query.activityTo,
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

const UUID_RE = /^[0-9a-f-]{36}$/i;

const resolveTagActor = (req) => {
  if (req.dbUser) {
    const plain = req.dbUser.get ? req.dbUser.get({ plain: true }) : req.dbUser;
    return {
      actingUser: plain.id,
      actorName: plain.name || plain.email || null,
      actorEmail: plain.email || null,
    };
  }
  const userId = req.user?.sub || req.user?.id;
  if (userId) {
    return {
      actingUser: userId,
      actorName: req.user?.name || req.user?.email || null,
      actorEmail: req.user?.email || null,
    };
  }
  return { actingUser: 'system', actorName: null, actorEmail: null };
};

const resolveHistoryActorDisplay = (plain, userMap) => {
  const actor = plain.actor;
  const changes = plain.changes || {};
  const user = userMap.get(String(actor));

  if (user?.name) return user.name;
  if (user?.email) return user.email;
  if (changes.actorName) return changes.actorName;
  if (changes.actorEmail) return changes.actorEmail;

  const updatedBy = changes.after?.updatedBy || changes.before?.updatedBy;
  if (updatedBy && typeof updatedBy === 'string' && !UUID_RE.test(updatedBy) && updatedBy !== 'system') {
    return updatedBy;
  }

  if (actor && typeof actor === 'string' && !UUID_RE.test(actor) && actor !== 'system') {
    return actor;
  }

  if (actor && actor !== 'system') return null;
  return null;
};

const create = async (req, res) => {
  try {
    const actor = resolveTagActor(req);
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
      actingUser: actor.actingUser,
      source,
      createdBy: actor.actingUser,
      updatedBy: actor.actingUser,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
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
    const actor = resolveTagActor(req);
    const payload = { ...req.body };
    delete payload.embedding;
    const tag = await tagService.update(req.params.id, payload, {
      actingUser: actor.actingUser,
      updatedBy: actor.actingUser,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
    });
    fireAndForget(tagEmbeddingService.scheduleTagEmbedding(tag));
    const responsePayload = tag.toJSON ? tag.toJSON() : { ...tag };
    delete responsePayload.embedding;
    res.json(responsePayload);
  } catch (err) {
    const isFkError =
      err?.parent?.constraint === 'system_tags_tag_id_fkey' ||
      err?.parent?.constraint === 'candidate_tags_tag_id_fkey' ||
      err?.code === '23503' ||
      (err?.message || '').includes('system_tags_tag_id_fkey') ||
      (err?.message || '').includes('candidate_tags_tag_id_fkey');

    if (isFkError) {
      return res.status(409).json({
        message:
          'Cannot update this tag because duplicate pending tags are still linked to candidates or jobs. Try again after merging duplicates in the admin tags screen.',
        detail: err.message,
      });
    }

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
      err?.parent?.constraint === 'system_tags_tag_id_fkey' ||
      err?.parent?.constraint === 'candidate_tags_tag_id_fkey' ||
      err?.code === '23503' ||
      (err?.message || '').includes('system_tags_tag_id_fkey') ||
      (err?.message || '').includes('candidate_tags_tag_id_fkey');

    if (isFkError) {
      let candidates = [];
      let jobs = [];
      let helperError = null;
      try {
        [candidates, jobs] = await Promise.all([
          listTagCandidatesHelper(id),
          listTagJobsHelper(id),
        ]);
      } catch (fetchErr) {
        helperError = fetchErr?.message || 'failed to load';
        console.error('[tagController.remove] failed to load blocking tag usage', fetchErr);
      }
      return res.status(409).json({
        message: 'Tag is still in use',
        candidates,
        jobs,
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
    candidate_id: entry.entity_id,
    full_name: entry.candidate?.fullName || entry.candidate?.full_name,
    email: entry.candidate?.email,
    phone: entry.candidate?.phone,
  }));
};

const listTagJobsHelper = async (tagId) => {
  const entries = await SystemTag.findAll({
    where: { tag_id: tagId, type: SYSTEM_TAG_TYPE_JOB },
    attributes: ['id', 'entity_id'],
  });
  if (!entries.length) return [];

  const jobIds = [...new Set(entries.map((entry) => entry.entity_id).filter(Boolean))];
  const jobs = jobIds.length
    ? await Job.findAll({
        where: { id: { [Op.in]: jobIds } },
        attributes: ['id', 'title', 'status', 'client', 'postingCode'],
      })
    : [];
  const jobMap = new Map(jobs.map((job) => [String(job.id), job.get({ plain: true })]));

  return entries.map((entry) => {
    const plain = entry.get({ plain: true });
    const job = jobMap.get(String(plain.entity_id)) || {};
    return {
      job_tag_id: plain.id,
      job_id: plain.entity_id,
      title: job.title || '',
      status: job.status || '',
      client: job.client || '',
      postingCode: job.postingCode || '',
    };
  });
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
  if (!isValidTagIdParam(tagId)) {
    return res.status(400).json({ message: 'Invalid tag id' });
  }

  try {
    const [candidates, jobs] = await Promise.all([
      listTagCandidatesHelper(tagId),
      listTagJobsHelper(tagId),
    ]);
    res.json({ candidates, jobs });
  } catch (err) {
    console.error('[tagController.listTagCandidates]', err);
    res.status(500).json({ message: 'Failed to load candidate tags for this tag' });
  }
};

const listTagJobs = async (req, res) => {
  const tagId = req.params.id;
  if (!isValidTagIdParam(tagId)) {
    return res.status(400).json({ message: 'Invalid tag id' });
  }
  try {
    const jobs = await listTagJobsHelper(tagId);
    res.json({ jobs });
  } catch (err) {
    console.error('[tagController.listTagJobs]', err);
    res.status(500).json({ message: 'Failed to load jobs for this tag' });
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

    const actorIds = [
      ...new Set(
        entries
          .map((row) => row.actor)
          .filter((actor) => actor && actor !== 'system' && /^[0-9a-f-]{36}$/i.test(String(actor))),
      ),
    ];

    const users = actorIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: actorIds } },
          attributes: ['id', 'name', 'email'],
        })
      : [];
    const userMap = new Map(users.map((u) => [String(u.id), u.get({ plain: true })]));

    const payload = entries.map((entry) => {
      const plain = entry.toJSON ? entry.toJSON() : entry.get({ plain: true });
      const actor = plain.actor;
      const user = userMap.get(String(actor));
      const actorDisplayName = resolveHistoryActorDisplay(plain, userMap);
      const createdAt =
        plain.createdAt ||
        plain.created_at ||
        plain.updatedAt ||
        plain.updated_at ||
        null;
      return {
        ...plain,
        createdAt,
        created_at: createdAt,
        actorDisplayName,
        userName: user?.name || plain.changes?.actorName || null,
        userEmail: user?.email || plain.changes?.actorEmail || null,
      };
    });

    res.json(payload);
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
    const excludeAiQueued =
      req.query.excludeAiQueued === '0' || req.query.excludeAiQueued === 'false'
        ? false
        : true;

    const aiQueuedTagIds = excludeAiQueued ? await loadAiQueuedPendingTagIds() : [];

    const parts = [{ status: 'pending' }];
    if (aiQueuedTagIds.length) {
      parts.push({ id: { [Op.notIn]: aiQueuedTagIds } });
    }
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
      const candidateTags = await SystemTag.findAll({
        where: { tag_id: { [Op.in]: tagIds }, type: SYSTEM_TAG_TYPE_CANDIDATE },
        attributes: ['tag_id', 'entity_id'],
      });
      const candidateIds = [...new Set(candidateTags.map((ct) => ct.entity_id))];
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
        const c = candidateMap.get(ct.entity_id);
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

    const manualPendingWhere = aiQueuedTagIds.length
      ? { status: 'pending', id: { [Op.notIn]: aiQueuedTagIds } }
      : { status: 'pending' };

    const [totalPending, pendingUsageSum] = await Promise.all([
      Tag.count({ where: manualPendingWhere }),
      Tag.sum('usageCount', { where: manualPendingWhere }).then((v) => Number(v) || 0),
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

const resolvePendingTags = async ({ ids = [], action, targetTagId, aliasPriority = 3, bypassStatusCheck = false } = {}) => {
  if (!Array.isArray(ids) || !ids.length) {
    const err = new Error('No tag IDs provided');
    err.status = 400;
    throw err;
  }

  const entries = await Tag.findAll({
    where: bypassStatusCheck ? { id: ids } : { id: ids, status: 'pending' },
  });
  if (!entries.length) {
    if (bypassStatusCheck) return { success: true }; // nothing to update — silently ok
    const err = new Error('No matching pending tags found');
    err.status = 404;
    throw err;
  }

  let targetTag = null;
  if (action === 'link') {
    targetTag = await Tag.findByPk(targetTagId);
    if (!targetTag) {
      const err = new Error('Target tag not found');
      err.status = 404;
      throw err;
    }
  }

  const pendingTagIds = entries.map((entry) => entry.id);
  const hasPendingTags = pendingTagIds.length > 0;
  const candidateTagFilter = hasPendingTags
    ? { tag_id: { [Op.in]: pendingTagIds }, type: SYSTEM_TAG_TYPE_CANDIDATE }
    : null;

  if (action === 'link' && targetTag && hasPendingTags) {
    // Update each system_tag row: if candidate already has target tag, remove the pending row; else reassign to target tag (avoids unique constraint)
    const rows = await SystemTag.findAll({ where: candidateTagFilter });
    const candidateIds = [...new Set(rows.map((r) => r.entity_id))];
    for (const row of rows) {
      const alreadyHas = await SystemTag.findOne({
        where: {
          entity_id: row.entity_id,
          tag_id: targetTag.id,
          type: SYSTEM_TAG_TYPE_CANDIDATE,
        },
      });
      if (alreadyHas) {
        await row.destroy();
      } else {
        await row.update({ tag_id: targetTag.id, is_active: true });
      }
    }
    // Ensure target tag is linked and active for every candidate that had the pending tag
    for (const cid of candidateIds) {
      const existingLink = await SystemTag.findOne({
        where: {
          entity_id: cid,
          tag_id: targetTag.id,
          type: SYSTEM_TAG_TYPE_CANDIDATE,
        },
      });

      if (!existingLink) {
        // No row yet for this candidate+targetTag -> create it explicitly as active
        await SystemTag.create({
          type: SYSTEM_TAG_TYPE_CANDIDATE,
          entity_id: cid,
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
    await SystemTag.destroy({ where: candidateTagFilter });
  }

  for (const entry of entries) {
      const suggestedName = String(entry.displayNameHe || entry.tagKey || '').trim();

      if (action === 'create') {
        entry.status = 'active';
        entry.qualityState = entry.qualityState || 'initial_detection';
        entry.source = entry.source || 'ai';
        await entry.save({ fields: ['status', 'qualityState', 'source'] });
        await SystemTag.update(
          { is_active: true },
          { where: { tag_id: entry.id } },
        );
        continue;
      }

      if (action === 'link' && targetTag) {
        const targetPlain = targetTag.toJSON ? targetTag.toJSON() : targetTag.get({ plain: true });
        const targetType = targetPlain.type;
        const targetActive =
          (targetTag.status && String(targetTag.status).toLowerCase() === 'active') || false;

        const jobTagRows = await SystemTag.findAll({
          where: { tag_id: entry.id, type: SYSTEM_TAG_TYPE_JOB },
        });
        for (const row of jobTagRows) {
          const alreadyHas = await SystemTag.findOne({
            where: {
              entity_id: row.entity_id,
              tag_id: targetTag.id,
              type: SYSTEM_TAG_TYPE_JOB,
            },
          });
          if (alreadyHas) {
            await row.destroy();
            if (targetActive && !alreadyHas.is_active) {
              await alreadyHas.update({ is_active: true });
            }
          } else {
            await row.update({
              tag_id: targetTag.id,
              raw_type: targetType || row.raw_type,
              is_active: targetActive,
            });
          }
        }
      }

      if (action === 'ignore') {
        await SystemTag.destroy({
          where: { tag_id: entry.id, type: SYSTEM_TAG_TYPE_JOB },
        });
      }

      if (action === 'link' && targetTag) {
        // ── aliases (string array) ─────────────────────────────────────────
        const existingAliases = Array.isArray(targetTag.aliases) ? [...targetTag.aliases] : [];
        if (suggestedName && !existingAliases.includes(suggestedName)) {
          existingAliases.push(suggestedName);
          targetTag.aliases = existingAliases;
        }

        // ── synonyms (JSONB) — also record with priority metadata ──────────
        const existingSynonyms = Array.isArray(targetTag.synonyms) ? [...targetTag.synonyms] : [];
        const alreadyInSynonyms = existingSynonyms.some(
          (s) => (typeof s === 'string' ? s : s?.name)?.toLowerCase() === suggestedName?.toLowerCase()
        );
        if (suggestedName && !alreadyInSynonyms) {
          existingSynonyms.push({ name: suggestedName, priority: aliasPriority, type: 'alias', source: 'merge' });
          targetTag.synonyms = existingSynonyms;
        } else if (suggestedName && alreadyInSynonyms) {
          // Update priority if entry already exists
          targetTag.synonyms = existingSynonyms.map((s) => {
            if ((typeof s === 'string' ? s : s?.name)?.toLowerCase() === suggestedName?.toLowerCase()) {
              return typeof s === 'string' ? { name: s, priority: aliasPriority, type: 'alias', source: 'merge' } : { ...s, priority: aliasPriority };
            }
            return s;
          });
        }

        await targetTag.save({ fields: ['aliases', 'synonyms'] });
        console.log(`[resolvePendingTags] alias "${suggestedName}" (priority ${aliasPriority}) added to tag "${targetTag.displayNameHe || targetTag.tagKey}"`);
        await cleanupPendingTagCorrections(existingAliases);
      }

      if (action !== 'create') {
        await TagHistory.destroy({ where: { tag_id: entry.id } });
        await entry.destroy();
      }
    }

  const affectedIds = entries.map((entry) => entry.id).filter(Boolean);
  affectedIds.forEach((tagId) => tagEmbeddingService.scheduleTagEmbedding({ id: tagId }));

  return { success: true };
};

const resolvePending = async (req, res) => {
  try {
    const result = await resolvePendingTags(req.body || {});
    res.json(result);
  } catch (err) {
    console.error('[tagController] resolvePending error', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to resolve pending tags' });
  }
};

const getCorrectionAgentSettings = async (_req, res) => {
  try {
    const agentEnabled = await tagCorrectionAgentService.isPlatformAgentEnabled();
    res.json({ agentEnabled });
  } catch (err) {
    console.error('[tagController.getCorrectionAgentSettings]', err);
    res.status(500).json({ message: 'Failed to load agent settings' });
  }
};

const putCorrectionAgentSettings = async (req, res) => {
  try {
    const data = await tagCorrectionAgentService.setPlatformAgentEnabled(
      Boolean(req.body?.agentEnabled),
    );
    res.json(data);
  } catch (err) {
    console.error('[tagController.putCorrectionAgentSettings]', err);
    res.status(500).json({ message: 'Failed to save agent settings' });
  }
};

const listAiDecisions = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const decision = req.query.decision || 'all';
    const date = req.query.date || '';
    const reviewStatus = req.query.reviewStatus || 'all';
    const reviewerAction = req.query.reviewerAction || '';
    const listOpts = { page, limit, decision, date, reviewStatus, reviewerAction };

    let payload = await tagCorrectionAgentService.listDecisions(listOpts);
    let backfill = null;

    const autoBackfill =
      req.query.autoBackfill === '1' ||
      req.query.autoBackfill === 'true';
    if (autoBackfill && payload.total === 0 && reviewStatus === 'pending_review') {
      const agentOn = await tagCorrectionAgentService.isPlatformAgentEnabled();
      if (agentOn) {
        const batch = Math.min(30, Math.max(5, Number(req.query.backfillLimit) || 20));
        backfill = await tagCorrectionAgentService.backfillPendingWithoutDecisions(batch);
        payload = await tagCorrectionAgentService.listDecisions(listOpts);
      }
    }

    res.json({ ...payload, backfill });
  } catch (err) {
    console.error('[tagController.listAiDecisions]', err);
    res.status(500).json({ message: 'Failed to load AI tag decisions' });
  }
};

const resolveAiDecisions = async (req, res) => {
  try {
    const { decisionIds = [], action, targetTagId, aliasPriority } = req.body || {};
    const result = await tagAiDecisionResolveService.applyReviewerActions(
      { decisionIds, action, targetTagId, aliasPriority },
      resolvePendingTags,
    );
    res.json(result);
  } catch (err) {
    console.error('[tagController.resolveAiDecisions]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to resolve AI decisions' });
  }
};

const getAiDecisionOccurrences = async (req, res) => {
  const decisionId = String(req.params.decisionId || '').trim();
  if (!isValidTagIdParam(decisionId)) {
    return res.status(400).json({ message: 'Invalid decision id' });
  }

  try {
    const decision = await TagAiDecision.findByPk(decisionId, {
      include: [{ model: Tag, as: 'pendingTag', required: false }],
    });
    if (!decision) {
      return res.status(404).json({ message: 'Decision not found' });
    }

    const plain = decision.get ? decision.get({ plain: true }) : decision;
    const { tagId, source } = await tagCorrectionAgentService.resolveOccurrencesTagId(plain);
    if (!tagId) {
      return res.json({ tagId: null, source: 'none', candidates: [], jobs: [] });
    }

    const [candidates, jobs] = await Promise.all([
      listTagCandidatesHelper(tagId),
      listTagJobsHelper(tagId),
    ]);
    return res.json({ tagId, source, candidates, jobs });
  } catch (err) {
    console.error('[tagController.getAiDecisionOccurrences]', err);
    return res.status(500).json({ message: 'Failed to load occurrences for AI decision' });
  }
};

const backfillAiDecisions = async (req, res) => {
  try {
    const limit = Number(req.body?.limit) || Number(req.query?.limit) || 40;
    const result = await tagCorrectionAgentService.backfillPendingWithoutDecisions(limit);
    res.json(result);
  } catch (err) {
    console.error('[tagController.backfillAiDecisions]', err);
    res.status(500).json({ message: 'Failed to backfill AI decisions' });
  }
};

const backfillAutoMerge = async (req, res) => {
  try {
    const threshold = Number(req.body?.threshold) || Number(req.query?.threshold) || 30;
    const limit = Number(req.body?.limit) || Number(req.query?.limit) || 200;
    const result = await tagCorrectionAgentService.backfillAutoMergeDecisions(threshold, limit);
    res.json(result);
  } catch (err) {
    console.error('[tagController.backfillAutoMerge]', err);
    res.status(500).json({ message: 'Failed to backfill auto merge decisions' });
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
  listTagJobs,
  getHistory,
  rebuildEmbeddings,
  rebuildEmbedding,
  resolvePendingTags,
  getCorrectionAgentSettings,
  putCorrectionAgentSettings,
  listAiDecisions,
  resolveAiDecisions,
  getAiDecisionOccurrences,
  backfillAiDecisions,
  backfillAutoMerge,
};

