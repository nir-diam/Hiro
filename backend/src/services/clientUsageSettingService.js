const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const Client = require('../models/Client');
const ClientUsageSetting = require('../models/ClientUsageSetting');
const User = require('../models/User');

const DEFAULTS = {
  doubleAuth: 'לא פעיל',
  googleLogin: 'פעיל',
  initialScreeningLevel: 'טלפוני',
  returnMonths: 3,
  questionnaireSource: 'חברה',
  autoDisconnect: false,
  logoOnCv: true,
  candidateNoLocationToFix: true,
  candidateNoTagToFix: true,
  showCvPreview: true,
  jobAlerts: false,
  autoThanksEmail: false,
  oneCandidatePerEmail: false,
  billingStatusParent: false,
  billingStatusAccepted: false,
};

const toDto = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : row || {};
  return {
    doubleAuth: plain.doubleAuth ?? DEFAULTS.doubleAuth,
    googleLogin: plain.googleLogin ?? DEFAULTS.googleLogin,
    initialScreeningLevel: plain.initialScreeningLevel ?? DEFAULTS.initialScreeningLevel,
    returnMonths:
      Number.isFinite(Number(plain.returnMonths)) ? Number(plain.returnMonths) : DEFAULTS.returnMonths,
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

const upsert = async (clientId, body) => {
  await ensureClientExists(clientId);
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
  };

  let row = await ClientUsageSetting.findByPk(clientId);
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
  getReturnMonthsForClientLabel,
  resolveReturnMonthsForJobRequest,
  upsert,
  toDto,
};
