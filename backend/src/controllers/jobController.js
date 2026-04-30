const jobService = require('../services/jobService');
const jobCandidateService = require('../services/jobCandidateService');
const clientUsageSettingService = require('../services/clientUsageSettingService');
const Job = require('../models/Job');
const Tag = require('../models/Tag');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');
const auditLogger = require('../utils/auditLogger');

const isMissingValue = (v) => v === undefined || v === null || v === '';

const valuesDiffer = (a, b) => {
  if (isMissingValue(a) && isMissingValue(b)) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    } catch {
      return a !== b;
    }
  }
  return String(a ?? '') !== String(b ?? '');
};

const buildQuestionsLabel = (job) => {
  const tel = Array.isArray(job?.telephoneQuestions) ? job.telephoneQuestions : [];
  const dig = Array.isArray(job?.digitalQuestions) ? job.digitalQuestions : [];
  const all = [...tel, ...dig];
  if (!all.length) return null;
  const labels = all
    .map((q) => (typeof q === 'string' ? q : q?.text || q?.question || q?.title))
    .filter(Boolean)
    .slice(0, 6);
  return labels.length ? labels.join(' • ') : `${all.length} שאלות`;
};

/** Hebrew labels for job fields — used when logging “שמור” / PUT job updates to audit_logs. */
const JOB_UPDATE_AUDIT_LABELS = {
  title: 'כותרת',
  publicJobTitle: 'כותרת לפרסום',
  client: 'לקוח',
  field: 'תחום',
  role: 'תפקיד',
  priority: 'עדיפות',
  clientType: 'סוג לקוח',
  city: 'עיר',
  region: 'אזור',
  gender: 'מגדר',
  mobility: 'ניידות',
  licenseType: 'רישיון נהיגה',
  postingCode: 'קוד משרה',
  validityDays: 'ימי תוקף',
  recruitingCoordinator: 'רכז גיוס',
  accountManager: 'אחראי חשבון',
  salaryMin: 'שכר מינ׳',
  salaryMax: 'שכר מקס׳',
  ageMin: 'גיל מינ׳',
  ageMax: 'גיל מקס׳',
  openPositions: 'מספר משרות פתוחות',
  status: 'סטטוס',
  recruiter: 'מגייס',
  location: 'מיקום',
  jobType: 'סוג משרה',
  description: 'תיאור',
  PublicDescription: 'תיאור לפרסום',
  requirements: 'דרישות',
  rating: 'דירוג',
  healthProfile: 'פרופיל בריאות',
  internalNotes: 'הערות פנימיות',
  uniqueEmail: 'מייל ייחודי',
  contacts: 'אנשי קשר',
  recruitmentSources: 'מקורות גיוס',
  telephoneQuestions: 'שאלות טלפוניות',
  digitalQuestions: 'שאלות דיגיטליות',
  languages: 'שפות',
  skills: 'כישורים / תגיות',
  aiRawDescription: 'טקסט גולמי (ייבוא AI)',
};

const SKIP_JOB_UPDATE_COMPARE_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'events',
  /** Form always resends counters / openDate — would noise every save */
  'associatedCandidates',
  'waitingForScreening',
  'activeProcess',
  'openDate',
]);

const serializeAuditValue = (val, maxLen = 480) => {
  if (val === undefined) return undefined;
  if (val === null) return null;
  if (typeof val === 'string') return val.length > maxLen ? `${val.slice(0, maxLen)}…` : val;
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  try {
    const s = JSON.stringify(val);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  } catch {
    return '[ערך]';
  }
};

const collectJobFieldChangesForAudit = (prevPlain, nextPlain) => {
  const changeLines = [];
  const changes = [];
  if (!prevPlain || !nextPlain) {
    return { changeLines, changes };
  }
  for (const key of Object.keys(JOB_UPDATE_AUDIT_LABELS)) {
    if (SKIP_JOB_UPDATE_COMPARE_KEYS.has(key)) continue;
    const a = prevPlain[key];
    const b = nextPlain[key];
    if (!valuesDiffer(a, b)) continue;
    const label = JOB_UPDATE_AUDIT_LABELS[key];
    changeLines.push(label);
    changes.push({
      field: label,
      oldValue: serializeAuditValue(a),
      newValue: serializeAuditValue(b),
    });
  }
  return { changeLines, changes };
};

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

    // Audit: 'ניתוח ועיבוד משרה' — AI analyzed a job description
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.JOB_AI_ANALYSIS,
      entityType: 'Job',
      entityId: result?.id || null,
      entityName: result?.title || null,
      params: { candidate: result?.client || result?.title || 'לקוח' },
    });

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
  try {
    const jobs = await jobService.list();
    res.json(jobs);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list jobs' });
  }
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

    // Audit: 'הגדרת תחום משרה' — job category assigned
    if (job?.field || job?.role) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.JOB_FIELD_ASSIGN,
        entityType: 'Job',
        entityId: job.id,
        entityName: job.title || job.role,
        params: { category: job.field || job.role },
      });
    }
    // Audit: 'יצירת שאלון סינון' — screening questions created
    const qLabel = buildQuestionsLabel(job);
    if (qLabel) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.JOB_QUESTIONS,
        entityType: 'Job',
        entityId: job.id,
        entityName: job.title,
        params: { questions: qLabel, querstions: qLabel },
      });
    }

    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const payload = { ...req.body };

    // Snapshot previous job state for change-detection-based audits.
    let previous = null;
    try {
      previous = await jobService.getById(req.params.id);
    } catch {
      previous = null;
    }

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

    const body = req.body || {};

    // Audit: 'הגדרת תחום משרה' — only when changed
    if (
      Object.prototype.hasOwnProperty.call(body, 'field') &&
      body.field &&
      valuesDiffer(previous?.field, body.field)
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.JOB_FIELD_ASSIGN,
        entityType: 'Job',
        entityId: job.id,
        entityName: job.title || job.role,
        params: { category: body.field },
      });
    }
    // Audit: 'יצירת שאלון סינון' — only when one of the question arrays changed
    const telChanged =
      Object.prototype.hasOwnProperty.call(body, 'telephoneQuestions') &&
      valuesDiffer(previous?.telephoneQuestions, body.telephoneQuestions);
    const digChanged =
      Object.prototype.hasOwnProperty.call(body, 'digitalQuestions') &&
      valuesDiffer(previous?.digitalQuestions, body.digitalQuestions);
    if (telChanged || digChanged) {
      const qLabel = buildQuestionsLabel(job);
      if (qLabel) {
        systemEventEmitter.emit(req, {
          ...SYSTEM_EVENTS.JOB_QUESTIONS,
          entityType: 'Job',
          entityId: job.id,
          entityName: job.title,
          params: { questions: qLabel, querstions: qLabel },
        });
      }
    }
    // Audit: 'עדכון רכזים' — only when the touched recruiter field actually changed
    const recruiterField =
      ['recruiter', 'recruitingCoordinator', 'accountManager'].find(
        (f) =>
          Object.prototype.hasOwnProperty.call(body, f) &&
          valuesDiffer(previous?.[f], body[f]),
      );
    if (recruiterField && body[recruiterField]) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.SCREEN_RECRUITER,
        entityType: 'Job',
        entityId: job.id,
        entityName: job.title,
        params: { name: body[recruiterField] },
      });
    }

    try {
      const prevPlain =
        previous && typeof previous.get === 'function' ? previous.get({ plain: true }) : previous;
      const nextPlain = job.get({ plain: true });
      const { changeLines, changes } = collectJobFieldChangesForAudit(prevPlain, nextPlain);
      let description;
      if (!prevPlain) {
        description = `שמירת משרה · עודכנה במערכת (ללא צילום גרסה קודמת להשוואה)`;
      } else if (changeLines.length > 0) {
        description = `שמירת משרה · השתנו השדות: ${changeLines.join(', ')}`;
      } else {
        description = 'שמירת משרה · לא זוהו הבדלים בשדות הנספרים (או ערכים זהים לאחר נרמול)';
      }
      await auditLogger.logAwait(req, {
        level: 'info',
        action: 'update',
        description: description.slice(0, 4000),
        entityType: 'Job',
        entityId: String(job.id),
        entityName: String(job.title || job.role || ''),
        changes: changes.length ? changes : undefined,
        metadata: {
          jobFormSave: true,
          changedFieldLabels: changeLines,
          changedCount: changeLines.length,
        },
      });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error('[jobController.update] job save audit failed', auditErr);
    }

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

/**
 * Contacts for re-sending a screening CV: active client_contacts for the Client
 * matched by Job.client (name/displayName), plus Job.contacts JSONB (deduped by email).
 */
const getReferralClientContacts = async (req, res) => {
  try {
    const job = await Job.findByPk(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    const label = String(job.client || '').trim().toLowerCase();
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    let clientRow = null;
    if (label) {
      const clientCandidates = await Client.findAll({
        where: { isActive: true },
        attributes: ['id', 'name', 'displayName'],
      });
      clientRow =
        clientCandidates.find((c) => String(c.name || '').trim().toLowerCase() === label) ||
        clientCandidates.find((c) => String(c.displayName || '').trim().toLowerCase() === label);
    }

    const out = [];
    if (clientRow) {
      const rows = await ClientContact.findAll({
        where: { clientId: clientRow.id, isActive: true },
        attributes: ['id', 'name', 'email', 'role'],
        order: [['createdAt', 'ASC']],
      });
      for (const r of rows) {
        const c = r.get({ plain: true });
        const email = String(c.email || '').trim();
        if (!emailRe.test(email)) continue;
        out.push({
          id: String(c.id),
          name: String(c.name || '').trim(),
          email,
          role: String(c.role || '').trim(),
          source: 'client',
        });
      }
    }

    const plainJob = job.get({ plain: true });
    const jobJsonContacts = Array.isArray(plainJob.contacts) ? plainJob.contacts : [];
    const seen = new Set(out.map((c) => c.email.toLowerCase()));
    jobJsonContacts.forEach((c, i) => {
      const email = String(c?.email || '').trim();
      if (!emailRe.test(email)) return;
      const key = email.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: `job:${req.params.id}:${i}`,
        name: String(c?.name || '').trim(),
        email,
        role: String(c?.role || '').trim(),
        source: 'job',
      });
    });

    res.set('Cache-Control', 'private, no-store');
    return res.json({
      clientId: clientRow ? String(clientRow.id) : null,
      clientResolvedName: clientRow ? String(clientRow.displayName || clientRow.name || '') : '',
      jobClientLabel: String(job.client || ''),
      contacts: out,
    });
  } catch (err) {
    console.error('[jobController.getReferralClientContacts]', err);
    return res.status(500).json({ message: err.message || 'Failed to load contacts' });
  }
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Staff opened the “ייבוא חכם” / AI paste modal on NewJobView. */
const logSmartImportModalOpen = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const rawId = body.jobId != null && String(body.jobId).trim() ? String(body.jobId).trim() : null;
    const jobTitle = body.jobTitle != null && String(body.jobTitle).trim() ? String(body.jobTitle).trim() : '';
    const context = body.context != null && String(body.context).trim() ? String(body.context).trim() : '';
    const entityId = rawId && UUID_RE.test(rawId) ? rawId : null;

    const descriptionParts = [
      'נפתח חלון ייבוא חכם למשרה (AI)',
      jobTitle ? `כותרת: ${jobTitle}` : null,
    ].filter(Boolean);
    const description = descriptionParts.join(' · ') || 'נפתח חלון ייבוא חכם למשרה (AI)';

    await auditLogger.logAwait(req, {
      level: 'info',
      action: 'system',
      description: description.slice(0, 4000),
      entityType: entityId ? 'Job' : null,
      entityId,
      entityName: jobTitle || null,
      metadata: {
        newJobSmartImportModalOpen: true,
        context: context || undefined,
        rawJobId: rawId || undefined,
      },
    });

    return res.status(204).end();
  } catch (err) {
    console.error('[jobController.logSmartImportModalOpen]', err);
    return res.status(500).json({ message: err.message || 'Failed to log' });
  }
};

module.exports = {
  list,
  listForCompose,
  get,
  create,
  update,
  remove,
  getCandidates,
  analyzeDescription,
  getReferralClientContacts,
  logSmartImportModalOpen,
};

