const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const DEFAULT_SUBJECT_PREFIX = '{{מקור_גיוס}}';
const MAX_SUBJECT_PREFIX_LENGTH = 500;
const MAX_RECIPIENTS = 50;
const MAX_RECIPIENT_NAME_LENGTH = 200;

/** @typedef {{ type: 'user', userId: string, email?: string, name?: string }} CvForwardUserRecipient */
/** @typedef {{ type: 'external', email: string, name?: string }} CvForwardExternalRecipient */
/** @typedef {CvForwardUserRecipient | CvForwardExternalRecipient} CvForwardRecipient */
/**
 * @typedef {{
 *   enabled: boolean,
 *   recipients: CvForwardRecipient[],
 *   subjectPrefixTemplate: string,
 * }} CvForwardSettings
 */

const DEFAULT_CV_FORWARD_SETTINGS = Object.freeze({
  enabled: false,
  recipients: [],
  subjectPrefixTemplate: DEFAULT_SUBJECT_PREFIX,
});

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

/**
 * @param {unknown} raw
 * @returns {CvForwardRecipient | null}
 */
function normalizeRecipient(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const type = String(raw.type || '').trim().toLowerCase();
  const name = String(raw.name || '').trim().slice(0, MAX_RECIPIENT_NAME_LENGTH);

  if (type === 'user') {
    const userId = String(raw.userId || raw.id || '').trim();
    if (!UUID_RE.test(userId)) return null;

    /** @type {CvForwardUserRecipient} */
    const out = { type: 'user', userId };
    const email = normalizeEmail(raw.email);
    if (email) out.email = email;
    if (name) out.name = name;
    return out;
  }

  if (type === 'external') {
    const email = normalizeEmail(raw.email);
    if (!email) return null;

    /** @type {CvForwardExternalRecipient} */
    const out = { type: 'external', email };
    if (name) out.name = name;
    return out;
  }

  return null;
}

/**
 * Normalize raw cvForwardSettings without enforcing enabled/recipient rules.
 * @param {unknown} raw
 * @returns {CvForwardSettings}
 */
function normalizeCvForwardSettings(raw) {
  if (raw == null || raw === false) {
    return {
      enabled: DEFAULT_CV_FORWARD_SETTINGS.enabled,
      recipients: [],
      subjectPrefixTemplate: DEFAULT_CV_FORWARD_SETTINGS.subjectPrefixTemplate,
    };
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('cvForwardSettings must be an object');
    err.status = 400;
    throw err;
  }

  const enabled = Boolean(raw.enabled);
  const subjectPrefixTemplate =
    raw.subjectPrefixTemplate !== undefined && raw.subjectPrefixTemplate !== null
      ? String(raw.subjectPrefixTemplate).trim().slice(0, MAX_SUBJECT_PREFIX_LENGTH)
      : DEFAULT_SUBJECT_PREFIX;

  if (!Array.isArray(raw.recipients)) {
    const err = new Error('cvForwardSettings.recipients must be an array');
    err.status = 400;
    throw err;
  }

  const seen = new Set();
  const recipients = [];

  for (const entry of raw.recipients) {
    const normalized = normalizeRecipient(entry);
    if (!normalized) continue;

    const dedupeKey =
      normalized.type === 'external'
        ? normalized.email
        : normalized.email
          ? `user:${normalized.userId}:${normalized.email}`
          : `user:${normalized.userId}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    recipients.push(normalized);

    if (recipients.length >= MAX_RECIPIENTS) break;
  }

  return {
    enabled,
    recipients,
    subjectPrefixTemplate,
  };
}

/**
 * Normalize and validate cvForwardSettings for persistence.
 * @param {unknown} raw
 * @returns {CvForwardSettings}
 */
function validateCvForwardSettings(raw) {
  const normalized = normalizeCvForwardSettings(raw);

  if (normalized.enabled && normalized.recipients.length === 0) {
    const err = new Error('At least one recipient is required when CV forwarding is enabled');
    err.status = 400;
    throw err;
  }

  return normalized;
}

/**
 * Apply cvForwardSettings validation when the field is present on a job payload.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
function prepareCvForwardSettingsForSave(payload = {}) {
  if (!Object.prototype.hasOwnProperty.call(payload, 'cvForwardSettings')) {
    return payload;
  }

  return {
    ...payload,
    cvForwardSettings: validateCvForwardSettings(payload.cvForwardSettings),
  };
}

/**
 * @param {unknown} settings
 * @returns {boolean}
 */
function isCvForwardEnabled(settings) {
  const normalized = normalizeCvForwardSettings(settings);
  return normalized.enabled && normalized.recipients.length > 0;
}

module.exports = {
  DEFAULT_CV_FORWARD_SETTINGS,
  DEFAULT_SUBJECT_PREFIX,
  MAX_RECIPIENTS,
  MAX_SUBJECT_PREFIX_LENGTH,
  normalizeCvForwardSettings,
  validateCvForwardSettings,
  prepareCvForwardSettingsForSave,
  isCvForwardEnabled,
  normalizeRecipient,
  normalizeEmail,
};
