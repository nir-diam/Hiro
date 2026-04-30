/**
 * Validates candidate mandatory fields against company usage settings (client_usage_settings).
 * Status: "חסר נתונים" when invalid; moving to "פעיל" is explicit (approve endpoint).
 */
const Candidate = require('../models/Candidate');
const CandidateTag = require('../models/CandidateTag');
const clientUsageSettingService = require('./clientUsageSettingService');
const User = require('../models/User');

const STATUS_INCOMPLETE = 'חסר נתונים';
const STATUS_ACTIVE = 'פעיל';

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

/**
 * @param {object} candidateRow — plain candidate fields (+ optional tag count)
 * @param {object} usage — from clientUsageSettingService.toDto / getByClientId
 * @param {number} activeTagCount — active candidate_tags rows
 */
function evaluateCandidateDataCompleteness(candidateRow, usage, activeTagCount) {
  const missing = [];
  const u = usage || clientUsageSettingService.DEFAULTS;

  if (!trim(candidateRow.firstName)) missing.push('firstName');
  if (!trim(candidateRow.lastName)) missing.push('lastName');
  if (!trim(candidateRow.email)) missing.push('email');
  if (!trim(candidateRow.phone)) missing.push('phone');
  /** "מתעניין במשרה" — stored as `field` (תחום משרה) */
  if (!trim(candidateRow.field)) missing.push('field');

  const city = trim(candidateRow.address) || trim(candidateRow.location);
  if (u.candidateNoLocationToFix && !city) missing.push('city');

  if (u.candidateNoTagToFix && (!activeTagCount || activeTagCount < 1)) missing.push('tags');

  return { ok: missing.length === 0, missing };
}

const MISSING_LABELS_HE = {
  firstName: 'שם פרטי',
  lastName: 'שם משפחה',
  email: 'דוא״ל',
  phone: 'טלפון',
  field: 'תחום / התעניינות במשרה',
  city: 'עיר או כתובת (חובת מיקום לפי הגדרות החברה)',
  tags: 'לפחות תגית משויכת אחת (חובת תגיות לפי הגדרות החברה)',
};

/** Human-readable Hebrew text stored on `candidates.statusExplanation` for the recruiter info tooltip. */
function buildIncompleteStatusExplanation(missing) {
  const parts = (missing || []).map((k) => MISSING_LABELS_HE[k] || k);
  const list = parts.filter(Boolean).join(' · ');
  if (!list) {
    return 'הסטטוס נקבע כלקוי נתונים לפי בדיקת המערכת.';
  }
  return `הסטטוס «חסר נתונים» נקבע כי חסרים או לא הושלמו עדיין: ${list}.`;
}

const READY_TO_APPROVE_EXPLANATION =
  'כל השדות החובה לפי הגדרות החברה מולאו. ניתן ללחוץ על «אישור תיקונים» בכרטיס המועמד כדי להעביר לסטטוס «פעיל».';

async function countActiveTagsForCandidate(candidateId) {
  return CandidateTag.count({
    where: { candidate_id: candidateId, is_active: true },
  });
}

async function resolveUsageSettingsForRequest(req) {
  let resolvedClientId = req?.dbUser?.clientId || null;
  if (!resolvedClientId && req?.user?.sub) {
    const user = await User.findByPk(req.user.sub, { attributes: ['clientId'] });
    resolvedClientId = user?.clientId || null;
  }
  if (!resolvedClientId) {
    return { ...clientUsageSettingService.DEFAULTS };
  }
  return clientUsageSettingService.getByClientId(resolvedClientId);
}

/**
 * Enforce "חסר נתונים" when invalid. When valid and status was "חסר נתונים", keep it until explicit approve.
 */
async function refreshCandidateDataStatusAfterSave(candidateId, req) {
  const instance = await Candidate.findByPk(candidateId);
  if (!instance) return null;
  const usage = await resolveUsageSettingsForRequest(req);
  const tagCount = await countActiveTagsForCandidate(candidateId);
  const plain = instance.get({ plain: true });
  const { ok, missing } = evaluateCandidateDataCompleteness(plain, usage, tagCount);
  const prev = trim(plain.status) || 'חדש';

  if (!ok) {
    const explanation = buildIncompleteStatusExplanation(missing);
    if (prev !== STATUS_INCOMPLETE) {
      await instance.update({ status: STATUS_INCOMPLETE, statusExplanation: explanation });
    } else {
      await instance.update({ statusExplanation: explanation });
    }
  } else if (prev === STATUS_INCOMPLETE) {
    await instance.update({ statusExplanation: READY_TO_APPROVE_EXPLANATION });
  } else {
    await instance.update({ statusExplanation: null });
  }
  return instance.reload();
}

/**
 * Used when no HTTP request (e.g. email ingest): usage by client UUID or defaults.
 */
async function refreshCandidateDataStatusForClient(candidateId, clientId) {
  const instance = await Candidate.findByPk(candidateId);
  if (!instance) return null;
  const usage = clientId
    ? await clientUsageSettingService.getByClientId(clientId)
    : { ...clientUsageSettingService.DEFAULTS };
  const tagCount = await countActiveTagsForCandidate(candidateId);
  const plain = instance.get({ plain: true });
  const { ok, missing } = evaluateCandidateDataCompleteness(plain, usage, tagCount);
  const prev = trim(plain.status) || 'חדש';
  if (!ok) {
    const explanation = buildIncompleteStatusExplanation(missing);
    if (prev !== STATUS_INCOMPLETE) {
      await instance.update({ status: STATUS_INCOMPLETE, statusExplanation: explanation });
    } else {
      await instance.update({ statusExplanation: explanation });
    }
  } else if (prev === STATUS_INCOMPLETE) {
    await instance.update({ statusExplanation: READY_TO_APPROVE_EXPLANATION });
  } else {
    await instance.update({ statusExplanation: null });
  }
  return instance.reload();
}

module.exports = {
  STATUS_INCOMPLETE,
  STATUS_ACTIVE,
  evaluateCandidateDataCompleteness,
  buildIncompleteStatusExplanation,
  countActiveTagsForCandidate,
  resolveUsageSettingsForRequest,
  refreshCandidateDataStatusAfterSave,
  refreshCandidateDataStatusForClient,
};
