const jobService = require('../services/jobService');
const jobCandidateService = require('../services/jobCandidateService');
const Job = require('../models/Job');
const Tag = require('../models/Tag');

const analyzeDescription = async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await jobService.analyzeRawDescription(text);

    // If AI returned languages, try to map them to existing language tags
    if (Array.isArray(result.languages) && result.languages.length > 0) {
      const normalized = await Promise.all(
        result.languages.map(async (lang) => {
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
          return {
            id: plain.id,
            name: rawName,
            key: plain.tagKey || rawName,
            mode: 'mandatory',
            source: 'manual',
            tagType: 'language',
          };
        }),
      );

      const languageSkills = normalized.filter(Boolean);
      if (languageSkills.length) {
        const existingSkills = Array.isArray(result.skills) ? result.skills : [];
        result.skills = [...existingSkills, ...languageSkills];
      }
    }

    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'AI analysis failed' });
  }
};

const list = async (_req, res) => {
  const jobs = await jobService.list();
  res.json(jobs);
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
    const job = await jobService.update(req.params.id, req.body);
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
    res.json({ job, candidates });
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

module.exports = { list, get, create, update, remove, getCandidates, analyzeDescription };

