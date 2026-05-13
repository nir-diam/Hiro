const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('../models/Client');
const ClientUsageSetting = require('../models/ClientUsageSetting');
const MatchingEngineConfig = require('../models/MatchingEngineConfig');
const User = require('../models/User');

const DEFAULTS = {
  doubleAuth: 'לא פעיל',
  googleLogin: 'פעיל',
  initialScreeningLevel: 'טלפוני',
  returnMonths: 3,
  defaultJobValidityDays: 90,
  defaultJobReScreeningCooldownMonths: 3,
  defaultRequireOriginalCv: false,
  questionnaireSource: 'חברה',
  autoDisconnect: false,
  logoOnCv: true,
  candidateNoLocationToFix: true,
  candidateNoTagToFix: true,
  showCvPreview: true,
  jobAlerts: false,
  autoThanksEmail: true,
  oneCandidatePerEmail: false,
  billingStatusParent: false,
  billingStatusAccepted: false,
  matchingEnginePresetId: null,
};

const toDto = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : row || {};
  return {
    doubleAuth: plain.doubleAuth ?? DEFAULTS.doubleAuth,
    googleLogin: plain.googleLogin ?? DEFAULTS.googleLogin,
    initialScreeningLevel: plain.initialScreeningLevel ?? DEFAULTS.initialScreeningLevel,
    returnMonths:
      Number.isFinite(Number(plain.returnMonths)) ? Number(plain.returnMonths) : DEFAULTS.returnMonths,
    defaultJobValidityDays: Number.isFinite(Number(plain.defaultJobValidityDays))
      ? Number(plain.defaultJobValidityDays)
      : DEFAULTS.defaultJobValidityDays,
    defaultJobReScreeningCooldownMonths: Number.isFinite(Number(plain.defaultJobReScreeningCooldownMonths))
      ? Number(plain.defaultJobReScreeningCooldownMonths)
      : DEFAULTS.defaultJobReScreeningCooldownMonths,
    defaultRequireOriginalCv: Boolean(plain.defaultRequireOriginalCv),
    questionnaireSource: plain.questionnaireSource ?? DEFAULTS.questionnaireSource,
    autoDisconnect: Boolean(plain.autoDisconnect),
    logoOnCv: plain.logoOnCv !== false,
    candidateNoLocationToFix: plain.candidateNoLocationToFix !== false,
    candidateNoTagToFix: plain.candidateNoTagToFix !== false,
    showCvPreview: plain.showCvPreview !== false,
    jobAlerts: Boolean(plain.jobAlerts),
    autoThanksEmail: Boolean(plain.autoThanksEmail),
    oneCandidatePerEmail: Boolean(plain.oneCandidatePerEmail),
    billingStatusParent: Boolean(plain.billingStatusParent),
    billingStatusAccepted: Boolean(plain.billingStatusAccepted),
    matchingEnginePresetId:
      plain.matchingEnginePresetId != null && Number.isFinite(Number(plain.matchingEnginePresetId))
        ? Number(plain.matchingEnginePresetId)
        : null,
  };
};

const ensureClientExists = async (clientId) => {
  const c = await Client.findByPk(clientId, { attributes: ['id'] });
  if (!c) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
};

/**
 * @param {string} clientId
 * @param {unknown} raw — undefined = omit change; null = clear
 * @returns {Promise<number|null|undefined>} resolved id, null, or undefined to keep DB value
 */
const resolveMatchingEnginePresetIdForUpsert = async (clientId, raw) => {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid matchingEnginePresetId');
    err.status = 400;
    throw err;
  }
  const preset = await MatchingEngineConfig.findOne({
    where: { id, type: 'preset' },
  });
  if (!preset) {
    const err = new Error('Matching engine preset not found');
    err.status = 400;
    throw err;
  }
  const ids = Array.isArray(preset.clientIds) ? preset.clientIds.map(String) : [];
  if (!ids.includes(String(clientId))) {
    const err = new Error('Preset is not available for this client');
    err.status = 400;
    throw err;
  }
  return id;
};

const getByClientId = async (clientId) => {
  await ensureClientExists(clientId);
  const row = await ClientUsageSetting.findByPk(clientId);
  if (!row) {
    return { clientId, ...DEFAULTS };
  }
  return { clientId, ...toDto(row) };
};

/** Resolve `returnMonths` for Usage settings by matching Job.client to Client.name or displayName (trim + case-insensitive). */
const getReturnMonthsForClientLabel = async (label) => {
  const trimmed = String(label || '').trim();
  if (!trimmed) return DEFAULTS.returnMonths;
  const labelN = trimmed.toLowerCase();

  const client = await Client.findOne({
    where: {
      [Op.or]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('name'))),
          labelN,
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('displayName'))),
          labelN,
        ),
        { name: trimmed },
        { displayName: trimmed },
      ],
    },
    attributes: ['id'],
  });
  if (!client) return DEFAULTS.returnMonths;
  const row = await ClientUsageSetting.findByPk(client.id);
  if (!row) return DEFAULTS.returnMonths;
  return toDto(row).returnMonths;
};

/** Resolve Client UUID from Job.client label (name / displayName), or null */
const getClientIdForJobClientLabel = async (label) => {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const labelN = trimmed.toLowerCase();

  const client = await Client.findOne({
    where: {
      [Op.or]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('name'))),
          labelN,
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.fn('TRIM', sequelize.col('displayName'))),
          labelN,
        ),
        { name: trimmed },
        { displayName: trimmed },
      ],
    },
    attributes: ['id'],
  });
  return client ? String(client.id) : null;
};

/**
 * Effective screening-related job settings: job overrides win, then client usage defaults, then hard-coded fallbacks.
 */
const resolveScreeningDefaultsForJob = async (jobRow, clientIdOptional = null) => {
  let clientId = clientIdOptional;
  if (!clientId && jobRow?.client) {
    clientId = await getClientIdForJobClientLabel(jobRow.client);
  }

  let usageDto = { ...DEFAULTS };
  if (clientId) {
    const row = await ClientUsageSetting.findByPk(clientId);
    if (row) usageDto = { ...usageDto, ...toDto(row) };
  }

  const jobPlain = jobRow?.get ? jobRow.get({ plain: true }) : jobRow || {};

  const validityDays = Number.isFinite(Number(jobPlain.validityDays))
    ? Math.max(0, Math.min(20000, Number(jobPlain.validityDays)))
    : Math.max(0, Math.min(20000, Number(usageDto.defaultJobValidityDays)));

  const reScreeningCooldownMonths = Number.isFinite(Number(jobPlain.reScreeningCooldownMonths))
    ? Math.max(0, Math.min(9999, Number(jobPlain.reScreeningCooldownMonths)))
    : Math.max(0, Math.min(9999, Number(usageDto.defaultJobReScreeningCooldownMonths)));

  const requireOriginalCv =
    typeof jobPlain.requireOriginalCv === 'boolean'
      ? jobPlain.requireOriginalCv
      : Boolean(usageDto.defaultRequireOriginalCv);

  return {
    clientId,
    validityDays,
    reScreeningCooldownMonths,
    requireOriginalCv,
  };
};

/**
 * Prefer the logged-in staff user's client usage (reliable). Fall back to matching Job.client label.
 */
const resolveReturnMonthsForJobRequest = async (job, req) => {
  const userId = req?.user?.sub;
  if (userId) {
    const user = await User.findByPk(userId, { attributes: ['clientId'] });
    if (user?.clientId) {
      const row = await ClientUsageSetting.findByPk(user.clientId);
      if (row) return toDto(row).returnMonths;
    }
  }
  return getReturnMonthsForClientLabel(job?.client);
};

/** Client Usage "auto disconnect": idle logout on the frontend when true. */
const getAutoDisconnectForClient = async (clientId) => {
  if (!clientId) return false;
  const row = await ClientUsageSetting.findByPk(clientId);
  if (!row) return false;
  return Boolean(row.autoDisconnect);
};

/**
 * Client Usage "מייל התחברות" (autoThanksEmail): when true, the system queues
 * a welcome email every time a new candidate is created (manual, AI upload, email ingest).
 *
 * Returns:
 *   • `true`  → flag enabled, queue the welcome email
 *   • `false` → flag disabled, suppress the welcome email
 *   • `null`  → could not resolve (no clientId, lookup error, etc.) — caller should default to sending
 */
const getAutoThanksEmailForClient = async (clientId) => {
  if (!clientId) return null;
  try {
    const row = await ClientUsageSetting.findByPk(clientId);
    if (!row) return DEFAULTS.autoThanksEmail;
    return Boolean(row.autoThanksEmail);
  } catch (err) {
    console.warn('[clientUsageSettings] autoThanksEmail lookup failed', err?.message || err);
    return null;
  }
};

const upsert = async (clientId, body) => {
  await ensureClientExists(clientId);
  let row = await ClientUsageSetting.findByPk(clientId);
  const prevPlain = row ? row.get({ plain: true }) : {};

  let matchingEnginePresetId;
  if (body.matchingEnginePresetId !== undefined) {
    matchingEnginePresetId = await resolveMatchingEnginePresetIdForUpsert(clientId, body.matchingEnginePresetId);
  } else {
    matchingEnginePresetId =
      prevPlain.matchingEnginePresetId != null && Number.isFinite(Number(prevPlain.matchingEnginePresetId))
        ? Number(prevPlain.matchingEnginePresetId)
        : null;
  }

  const payload = {
    clientId,
    doubleAuth: typeof body.doubleAuth === 'string' ? body.doubleAuth : DEFAULTS.doubleAuth,
    googleLogin: typeof body.googleLogin === 'string' ? body.googleLogin : DEFAULTS.googleLogin,
    initialScreeningLevel:
      typeof body.initialScreeningLevel === 'string'
        ? body.initialScreeningLevel
        : DEFAULTS.initialScreeningLevel,
    returnMonths: Number.isFinite(Number(body.returnMonths))
      ? Math.max(0, Math.min(120, Number(body.returnMonths)))
      : DEFAULTS.returnMonths,
    defaultJobValidityDays: Number.isFinite(Number(body.defaultJobValidityDays))
      ? Math.max(0, Math.min(20000, Number(body.defaultJobValidityDays)))
      : DEFAULTS.defaultJobValidityDays,
    defaultJobReScreeningCooldownMonths: Number.isFinite(Number(body.defaultJobReScreeningCooldownMonths))
      ? Math.max(0, Math.min(9999, Number(body.defaultJobReScreeningCooldownMonths)))
      : DEFAULTS.defaultJobReScreeningCooldownMonths,
    defaultRequireOriginalCv: Boolean(body.defaultRequireOriginalCv),
    questionnaireSource:
      typeof body.questionnaireSource === 'string'
        ? body.questionnaireSource
        : DEFAULTS.questionnaireSource,
    autoDisconnect: Boolean(body.autoDisconnect),
    logoOnCv: Boolean(body.logoOnCv),
    candidateNoLocationToFix: Boolean(body.candidateNoLocationToFix),
    candidateNoTagToFix: Boolean(body.candidateNoTagToFix),
    showCvPreview: Boolean(body.showCvPreview),
    jobAlerts: Boolean(body.jobAlerts),
    autoThanksEmail: Boolean(body.autoThanksEmail),
    oneCandidatePerEmail: Boolean(body.oneCandidatePerEmail),
    billingStatusParent: Boolean(body.billingStatusParent),
    billingStatusAccepted: Boolean(body.billingStatusAccepted),
    matchingEnginePresetId,
  };

  if (row) {
    await row.update(payload);
    await row.reload();
  } else {
    row = await ClientUsageSetting.create(payload);
  }
  return { clientId, ...toDto(row) };
};

module.exports = {
  DEFAULTS,
  getByClientId,
  getAutoDisconnectForClient,
  getAutoThanksEmailForClient,
  getReturnMonthsForClientLabel,
  getClientIdForJobClientLabel,
  resolveScreeningDefaultsForJob,
  resolveReturnMonthsForJobRequest,
  upsert,
  toDto,
};
