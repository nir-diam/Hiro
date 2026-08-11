/**
 * InforU Mobile — REST CAPI v2 (SendSms).
 * Docs: https://apidoc.inforu.co.il/
 *
 * POST https://capi.inforu.co.il/api/v2/SMS/SendSms
 * Auth (InforU FAQ — Base Credentials):
 * https://cloud.inforu.co.il/account/?page=faq.category&code=API&question=API_APIDocumentation-176
 *
 * Authorization: Basic <base64(username:token)>
 * Use "העתק Base Credentials" from the token popup, or INFORU_SMS_USER_NAME + INFORU_SMS_API_TOKEN.
 *
 * Optional INFORU_CAPI_AUTH=bearer only for "JWT Bearer (advanced)" tokens (non-standard).
 *
 * Separate from legacy SOAP smsService.js — use this module for RSVP + new integrations.
 */

const axios = require('axios');

const DEFAULT_CAPI_URL = 'https://capi.inforu.co.il/api/v2/SMS/SendSms';

const envFlag = (name) => ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());

const resolveAuthMode = (token, baseCredential) => {
  if (baseCredential) return 'basic';
  const explicit = String(process.env.INFORU_CAPI_AUTH || '').trim().toLowerCase();
  if (explicit === 'bearer' || explicit === 'basic') return explicit;
  if (String(token || '').startsWith('eyJ')) return 'bearer';
  return 'basic';
};

const getConfig = () => {
  const authEnv = String(process.env.INFORU_CAPI_AUTH || '').trim().toLowerCase();
  const baseCredential = (process.env.INFORU_BASE_CREDENTIAL || '').trim();
  const capiEnabled =
    envFlag('INFORU_CAPI_ENABLED') ||
    Boolean(baseCredential) ||
    authEnv === 'bearer' ||
    Boolean((process.env.INFORU_CAPI_TOKEN || '').trim());
  const token =
    (process.env.INFORU_CAPI_TOKEN || '').trim() ||
    (capiEnabled ? (process.env.INFORU_SMS_API_TOKEN || '').trim() : '');
  const authMode = resolveAuthMode(token, baseCredential);

  return {
    capiUrl: (process.env.INFORU_CAPI_URL || DEFAULT_CAPI_URL).trim(),
    username: (process.env.INFORU_CAPI_USERNAME || process.env.INFORU_SMS_USER_NAME || process.env.INFORU_SMS_USERNAME || '').trim(),
    token,
    authMode,
    baseCredential,
    sender: (
      process.env.INFORU_SMS_SENDER ||
      process.env.INFORU_SMS_SENDER_NAME ||
      process.env.INFORU_SMS_SENDER_NUMBER ||
      ''
    ).trim(),
    customerId: (process.env.INFORU_CUSTOMER_ID || '').trim(),
    webhookBaseUrl: (process.env.INFORU_WEBHOOK_BASE_URL || process.env.PUBLIC_API_BASE_URL || '').replace(/\/$/, ''),
    capiEnabled: capiEnabled || authMode === 'bearer' || Boolean(baseCredential),
  };
};

/** Normalize to local Israeli mobile digits (05xxxxxxxx) for matching + API. */
const normalizeIsraeliMsisdn = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`;
  return d;
};

/** Valid Israeli mobile: 05 + 8 digits (10 total). Rejects extensions like "111". */
const ISRAELI_MOBILE_MSISDN_RE = /^05[0-9]{8}$/;

const isValidIsraeliMobileMsisdn = (phone) =>
  ISRAELI_MOBILE_MSISDN_RE.test(normalizeIsraeliMsisdn(phone));

/** Returns normalized 05XXXXXXXX or empty when not a mobile line. */
const normalizeIsraeliMobileMsisdn = (phone) => {
  const normalized = normalizeIsraeliMsisdn(phone);
  return ISRAELI_MOBILE_MSISDN_RE.test(normalized) ? normalized : '';
};

/** Digits-only key for DB lookups (strip leading 0 / country code variants). */
const phoneDigitsKey = (phone) => {
  const local = normalizeIsraeliMsisdn(phone);
  if (!local) return '';
  return local.replace(/^0+/, '') || local;
};

const isConfigured = () => {
  const c = getConfig();
  if (!c.capiEnabled || !c.sender) return false;
  if (c.baseCredential) return true;
  if (!c.token) return false;
  if (c.authMode === 'bearer') return true;
  return Boolean(c.username);
};

const normalizeBaseCredential = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^Basic\s+/i, '').trim();
};

const buildAuthorizationHeader = () => {
  const { username, token, authMode, baseCredential } = getConfig();
  const cred = normalizeBaseCredential(baseCredential);
  if (cred) return `Basic ${cred}`;
  if (authMode === 'bearer') return `Bearer ${token}`;
  const encoded = Buffer.from(`${username}:${token}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
};

/** @returns {boolean} */
const isAuthFailure = (httpStatus, data) => {
  const statusId = data?.StatusId;
  return httpStatus === 401 || statusId === -1 || statusId === -2 || statusId === -231;
};

const formatCapiError = (httpStatus, data) => {
  const statusId = data?.StatusId;
  const desc = data?.StatusDescription || '';
  if (statusId === -231) {
    return [
      'InforU CAPI rejected auth (StatusId -231: Invalid token type).',
      'Per InforU docs use Authorization: Basic with Base Credentials (INFORU_BASE_CREDENTIAL or username+token).',
      'If the token type is "JWT Bearer (advanced)", try INFORU_CAPI_AUTH=bearer — otherwise create a standard API token.',
    ].join(' ');
  }
  if (statusId === -2 || desc.toLowerCase().includes('authentication') || desc.toLowerCase().includes('illegal ip')) {
    return [
      'InforU CAPI authentication failed (StatusId -2).',
      'Verify the token is active, SMS API is allowed on the token, and INFORU_SMS_USER_NAME matches the InforU account.',
      'If IP-restricted, whitelist the server egress IP on the token.',
    ].join(' ');
  }
  const detail = typeof data === 'object' ? JSON.stringify(data).slice(0, 500) : String(data || '').slice(0, 500);
  return `InforU CAPI HTTP ${httpStatus}: ${detail}`;
};

const deliveryNotificationUrl = () => {
  const { webhookBaseUrl } = getConfig();
  if (!webhookBaseUrl) return undefined;
  return `${webhookBaseUrl}/api/inforu/webhooks/dlr`;
};

/**
 * Send SMS via InforU REST CAPI.
 *
 * @param {{
 *   message: string;
 *   recipients: Array<{ phone: string; firstName?: string; customerMessageId?: string }>;
 *   sender?: string;
 *   deliveryNotificationUrl?: string;
 * }} opts
 */
const sendSms = async (opts) => {
  const cfg = getConfig();
  if (!isConfigured()) {
    const err = new Error(
      cfg.authMode === 'bearer'
        ? 'InforU CAPI not configured (INFORU_CAPI_ENABLED, INFORU_CAPI_AUTH=bearer, INFORU_SMS_API_TOKEN, INFORU_SMS_SENDER_NAME)'
        : 'InforU CAPI not configured (INFORU_CAPI_USERNAME, INFORU_CAPI_TOKEN, INFORU_SMS_SENDER)',
    );
    err.status = 503;
    throw err;
  }

  const message = String(opts?.message ?? '').trim();
  if (!message) {
    const err = new Error('SMS message is required');
    err.status = 400;
    throw err;
  }

  const recipients = Array.isArray(opts?.recipients) ? opts.recipients : [];
  if (!recipients.length) {
    const err = new Error('At least one SMS recipient is required');
    err.status = 400;
    throw err;
  }

  const mappedRecipients = recipients
    .map((r) => {
      const phone = normalizeIsraeliMobileMsisdn(r?.phone);
      if (!phone) return null;
      const row = { Phone: phone };
      if (r.firstName) row.FirstName = String(r.firstName).trim();
      if (r.customerMessageId) row.CustomerMessageID = String(r.customerMessageId).trim();
      return row;
    })
    .filter(Boolean);

  if (!mappedRecipients.length) {
    const err = new Error('No valid SMS recipient phone numbers');
    err.status = 400;
    throw err;
  }

  const settings = {
    Sender: String(opts?.sender ?? cfg.sender).trim(),
  };

  const dlrUrl = opts?.deliveryNotificationUrl || deliveryNotificationUrl();
  if (dlrUrl) settings.DeliveryNotificationUrl = dlrUrl;

  const body = {
    Data: {
      Message: message,
      Recipients: mappedRecipients,
      Settings: settings,
    },
  };

  let res;
  try {
    res = await axios.post(cfg.capiUrl, body, {
      headers: {
        Authorization: buildAuthorizationHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30_000,
      validateStatus: () => true,
    });
  } catch (e) {
    const err = new Error(e?.message || 'InforU CAPI request failed');
    err.status = 502;
    err.cause = e;
    throw err;
  }

  const data = res.data;
  const statusId = data?.StatusId;
  const failed = res.status < 200 || res.status >= 300 || (statusId != null && Number(statusId) !== 1);

  if (failed) {
    const err = new Error(formatCapiError(res.status, data));
    err.status = isAuthFailure(res.status, data) || statusId === -2 || statusId === -231 ? 401 : 502;
    err.responseBody = data;
    err.inforuStatusId = statusId;
    err.isAuthFailure = isAuthFailure(res.status, data) || statusId === -2 || statusId === -231;
    throw err;
  }

  return {
    ok: true,
    status: res.status,
    data,
    recipients: mappedRecipients,
  };
};

module.exports = {
  isConfigured,
  isAuthFailure,
  sendSms,
  normalizeIsraeliMsisdn,
  normalizeIsraeliMobileMsisdn,
  isValidIsraeliMobileMsisdn,
  phoneDigitsKey,
  getConfig,
  deliveryNotificationUrl,
  /**
   * .env (backend) — REST CAPI for RSVP / two-way SMS
   *
   * INFORU_CAPI_ENABLED=true
   * INFORU_BASE_CREDENTIAL=           # paste from InforU "העתק Base Credentials" (recommended)
   * INFORU_SMS_USER_NAME=             # API username from Account Details (NOT sender name)
   * INFORU_SMS_API_TOKEN=             # token UUID from portal
   * INFORU_CAPI_AUTH=basic            # default; omit or set explicitly
   * INFORU_SMS_SENDER_NAME=Hiro      # approved sender id
   * INFORU_WEBHOOK_BASE_URL=https://api.hiro.co.il
   *
   * JWT Bearer tokens do NOT work with legacy SOAP. Whitelist your server egress IP on the token.
   */
};
