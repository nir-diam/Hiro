const jobService = require('../services/jobService');
const jobCandidateService = require('../services/jobCandidateService');
const clientUsageSettingService = require('../services/clientUsageSettingService');
const Job = require('../models/Job');
const Tag = require('../models/Tag');

const analyzeDescription = async (req, res) => {
  try {
    const { text } = req.body || {};
    // eslint-disable-next-line no-console
    console.log('[jobController.analyzeDescription] incoming request', {
      method: req.method,
      url: req.originalUrl || req.url,
      host: req.headers.host,
      textLength: text ? String(text).length : 0,
    });

    const result = await jobService.analyzeRawDescription(text);

    

    // eslint-disable-next-line no-console
    console.log('[jobController.analyzeDescription] success, returning result keys', Object.keys(result || {}));

    res.json({ data: result });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[jobController.analyzeDescription] error', {
      message: err?.message,
      status: err?.status,
      stack: err?.stack,
    });
    res.status(err.status || 500).json({ message: err.message || 'AI analysis failed' });
  }
};

const list = async (_req, res) => {
  const jobs = await jobService.list();
  res.json(jobs);
};

/**
 * Jobs for messaging UI: when user has a client, only jobs whose Job.client string matches
 * that Client's name/displayName; otherwise all jobs (admin / no-tenant).
 */
const listForCompose = async (req, res) => {
  try {
    const user = req.dbUser;
    const allJobs = await jobService.list();
    if (!user?.clientId || !user.client) {
      return res.json(allJobs);
    }
    const c = user.client;
    const labels = new Set(
      [c.name, c.displayName]
        .filter(Boolean)
        .map((s) => String(s).trim().toLowerCase())
        .filter(Boolean),
    );
    if (!labels.size) {
      return res.json(allJobs);
    }
    const filtered = allJobs.filter((j) => {
      const jc = String(j.client || '').trim().toLowerCase();
      return labels.has(jc);
    });
    return res.json(filtered);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list jobs' });
  }
};

const get = async (req, res) => {
  try {
    const job = await jobService.getById(req.params.id);
    res.json(job);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    let postingCode;
    let exists = true;
    const maxAttempts = 50;
    let attempts = 0;
    while (exists && attempts < maxAttempts) {
      postingCode = String(Math.floor(1 + Math.random() * 999999));
      const existing = await Job.findOne({ where: { postingCode } });
      exists = !!existing;
      attempts++;
    }
    if (exists) {
      return res.status(500).json({ message: 'Could not generate unique posting code' });
    }
    const uniqueEmail = `humand+${postingCode}@app.hiro.co.il`;
    const payload = { ...req.body, postingCode, uniqueEmail };

    // Normalize languages into skills (language-tag skills) before skills normalization
    if (Array.isArray(payload.languages) && payload.languages.length > 0) {
      const existingSkills = Array.isArray(payload.skills) ? payload.skills : [];
      const existingKeys = new Set(
        existingSkills
          .map((s) => (s && typeof s.key === 'string' ? s.key.trim() : null))
          .filter(Boolean),
      );

      const languageSkills = await Promise.all(
        payload.languages.map(async (lang) => {
          const rawName = (lang.language || lang.name || '').toString().trim();
          if (!rawName) return null;

          const tag = await Tag.findOne({
            where: {
              type: 'language',
              [require('sequelize').Op.or]: [
                { displayNameHe: rawName },
                { displayNameEn: rawName },
                { tagKey: rawName },
              ],
            },
          });

          if (!tag) return null;

          const plain = tag.toJSON ? tag.toJSON() : tag.get({ plain: true });
          const key = (plain.tagKey || rawName).toString().trim();
          if (existingKeys.has(key)) return null;

          return {
            id: plain.id,
            name: rawName,
            key,
            mode: 'mandatory',
            source: 'manual',
            tagType: 'language',
          };
        }),
      );

      const toAdd = languageSkills.filter(Boolean);
      if (toAdd.length) {
        payload.skills = [...existingSkills, ...toAdd];
      }
    }

    // Normalize skills against Tag table: ensure each skill has status from Tag,
    // and create missing tags with pending status.
    if (Array.isArray(payload.skills) && payload.skills.length > 0) {
      const typeMap = {
        role: 'role',
        skill: 'skill',
        industry: 'industry',
        tool: 'tool',
        certification: 'certification',
        language: 'language',
        seniority: 'seniority',
        degree: 'degree',
        soft: 'soft_skill',
        soft_skill: 'soft_skill',
      };

      const normalizedSkills = await Promise.all(
        payload.skills.map(async (skill) => {
          if (!skill || !skill.name) return skill;

          const tagKey = String(skill.key ?? skill.name).trim();
          const tagName = String(skill.name).trim();

          const mappedType = typeMap[skill.tagType] || 'skill';

          // Search tag only by key (ignore type)
          let tag = await Tag.findOne({ where: { tagKey } });

          if (!tag) {
            tag = await Tag.create({
              tagKey,
              displayNameHe: tagName,
              type: mappedType,
              status: 'pending',
              source: 'job',
            });
          }

          return { ...skill, status: tag.status || 'pending' };
        }),
      );

      payload.skills = normalizedSkills;
    }

    const job = await jobService.create(payload);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const payload = { ...req.body };

    // Normalize languages into skills on update as well
    if (Array.isArray(payload.languages) && payload.languages.length > 0) {
      const existingSkills = Array.isArray(payload.skills) ? payload.skills : [];
      const existingKeys = new Set(
        existingSkills
          .map((s) => (s && typeof s.key === 'string' ? s.key.trim() : null))
          .filter(Boolean),
      );

      const languageSkills = await Promise.all(
        payload.languages.map(async (lang) => {
          const rawName = (lang.language || lang.name || '').toString().trim();
          if (!rawName) return null;

          const tag = await Tag.findOne({
            where: {
              type: 'language',
              [require('sequelize').Op.or]: [
                { displayNameHe: rawName },
                { displayNameEn: rawName },
                { tagKey: rawName },
              ],
            },
          });

          if (!tag) return null;

          const plain = tag.toJSON ? tag.toJSON() : tag.get({ plain: true });
          const key = (plain.tagKey || rawName).toString().trim();
          if (existingKeys.has(key)) return null;

          return {
            id: plain.id,
            name: rawName,
            key,
            mode: 'mandatory',
            source: 'manual',
            tagType: 'language',
          };
        }),
      );

      const toAdd = languageSkills.filter(Boolean);
      if (toAdd.length) {
        payload.skills = [...existingSkills, ...toAdd];
      }
    }

    const job = await jobService.update(req.params.id, payload);
    res.json(job);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await jobService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const getCandidates = async (req, res) => {
  try {
    const job = await jobService.getById(req.params.id);
    const candidates = await jobCandidateService.listForJob(req.params.id);
    const returnMonths = await clientUsageSettingService.resolveReturnMonthsForJobRequest(
      job,
      req,
    );
    res.json({ job, candidates, returnMonths });
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

module.exports = { list, listForCompose, get, create, update, remove, getCandidates, analyzeDescription };

