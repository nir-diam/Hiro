/**
 * InforU Mobile — outbound SMS (SOAP SendSms).
 * Docs: https://apidoc.inforu.co.il/ · WSDL sample: https://uapi.inforu.co.il/v2/SendMessage.asmx?op=SendSms
 *
 * Environment (see module.exports comment block at bottom for copy-paste .env template).
 */

const axios = require('axios');

const DEFAULT_ASMX_URL = 'https://uapi.inforu.co.il/v2/SendMessage.asmx';
const SOAP_ACTION = 'http://inforu.co.il/api/v2/asmx/SendMessage/SendSms';

const xmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getConfig = () => ({
  url: (process.env.INFORU_SMS_API_URL || DEFAULT_ASMX_URL).trim(),
  userName: (process.env.INFORU_SMS_USER_NAME || process.env.INFORU_SMS_USERNAME || '').trim(),
  apiToken: (process.env.INFORU_SMS_API_TOKEN || '').trim(),
  senderName: (process.env.INFORU_SMS_SENDER_NAME || '').trim(),
  senderNumber: (process.env.INFORU_SMS_SENDER_NUMBER || '').trim(),
});

/** Israeli-style mobile: digits only, leading 0 for local 05x… */
const normalizeIsraeliMsisdn = (phone) => {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`;
  return d;
};

/** Israeli mobile only — 05XXXXXXXX. Returns '' for extensions/landlines. */
const normalizeIsraeliMobileMsisdn = (phone) => {
  const normalized = normalizeIsraeliMsisdn(phone);
  return /^05[0-9]{8}$/.test(normalized) ? normalized : '';
};

const buildRecipientsString = (to) => {
  if (Array.isArray(to)) {
    return to.map(normalizeIsraeliMobileMsisdn).filter(Boolean).join(';');
  }
  const raw = String(to || '').trim();
  if (!raw) return '';
  return raw
    .split(/[;,]+/)
    .map((x) => normalizeIsraeliMobileMsisdn(x.trim()))
    .filter(Boolean)
    .join(';');
};

const buildSoapEnvelope = ({ userName, apiToken, message, recipients, senderName, senderNumber }) => `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SendSms xmlns="http://inforu.co.il/api/v2/asmx/SendMessage/">
      <userName>${xmlEscape(userName)}</userName>
      <apiToken>${xmlEscape(apiToken)}</apiToken>
      <message>${xmlEscape(message)}</message>
      <recipients>${xmlEscape(recipients)}</recipients>
      <senderName>${xmlEscape(senderName)}</senderName>
      <senderNumber>${xmlEscape(senderNumber)}</senderNumber>
    </SendSms>
  </soap:Body>
</soap:Envelope>`;

const decodeXmlEntities = (s) =>
  String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');

const parseSendSmsResult = (xml) => {
  const raw = String(xml);
  const wrapped = raw.match(/<SendSmsResult[^>]*>([\s\S]*?)<\/SendSmsResult>/i);
  const inner = wrapped ? decodeXmlEntities(wrapped[1].trim()) : raw;
  const statusMatch = inner.match(/<Status>([^<]+)<\/Status>/i);
  const descMatch = inner.match(/<Description>([^<]+)<\/Description>/i);
  if (statusMatch) {
    return {
      status: statusMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : '',
      raw: inner.slice(0, 500),
    };
  }
  const code = inner.trim();
  return { status: code, description: '', raw: code.slice(0, 500) };
};

const parseSoapFaultString = (xml) => {
  const m = String(xml).match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  return m ? m[1].trim() : null;
};

const isConfigured = () => {
  const c = getConfig();
  if (!c.userName || !c.apiToken) return false;
  if (!c.senderName && !c.senderNumber) return false;
  return true;
};

/**
 * Send SMS via InforU SendSms.
 * @param {{ to: string | string[]; message: string; senderName?: string; senderNumber?: string }} opts
 * @returns {Promise<{ ok: boolean; resultCode: string | null; raw?: string }>}
 */
const sendSms = async (opts) => {
  const cfg = getConfig();
  if (!isConfigured()) {
    const err = new Error('SMS provider not configured (InforU env vars)');
    err.status = 503;
    throw err;
  }

  const message = String(opts?.message ?? '').trim();
  if (!message) {
    const err = new Error('SMS message is required');
    err.status = 400;
    throw err;
  }

  const recipients = buildRecipientsString(opts?.to);
  if (!recipients) {
    const err = new Error('SMS recipient(s) required');
    err.status = 400;
    throw err;
  }

  const senderName = String(opts?.senderName ?? cfg.senderName).trim();
  const senderNumber = String(opts?.senderNumber ?? cfg.senderNumber).trim();

  const body = buildSoapEnvelope({
    userName: cfg.userName,
    apiToken: cfg.apiToken,
    message,
    recipients,
    senderName,
    senderNumber,
  });

  let res;
  try {
    res = await axios.post(cfg.url, body, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: SOAP_ACTION,
      },
      timeout: 25_000,
      validateStatus: () => true,
    });
  } catch (e) {
    const err = new Error(e?.message || 'SMS request failed');
    err.status = 502;
    err.cause = e;
    throw err;
  }

  const xml = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  const fault = parseSoapFaultString(xml);
  if (fault) {
    const err = new Error(`InforU SOAP fault: ${fault}`);
    err.status = 502;
    throw err;
  }

  const parsed = parseSendSmsResult(xml);
  const { status, description } = parsed;

  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`InforU HTTP ${res.status}: ${description || status || xml.slice(0, 200)}`);
    err.status = 502;
    err.resultCode = status;
    throw err;
  }

  const ok = status === '1' || status === 'true' || /^ok$/i.test(status || '');
  if (!ok) {
    const hint =
      status === '-2'
        ? ' Verify INFORU_SMS_USER_NAME and INFORU_SMS_API_TOKEN in InforU → Account Details → API Token (not login password).'
        : '';
    const err = new Error(`InforU SMS failed (Status ${status}): ${description || 'unknown error'}.${hint}`);
    err.status = status === '-2' ? 401 : 502;
    err.resultCode = status;
    err.inforuDescription = description;
    throw err;
  }

  return { ok: true, resultCode: status, raw: description || status };
};

module.exports = {
  isConfigured,
  sendSms,
  normalizeIsraeliMsisdn,
  normalizeIsraeliMobileMsisdn,
  /**
   * .env (backend)
   *
   * # InforU Mobile — SMS (SOAP SendSms; see https://uapi.inforu.co.il/v2/SendMessage.asmx?op=SendSms)
   * INFORU_SMS_USER_NAME=          # userName from InforU
   * INFORU_SMS_API_TOKEN=          # apiToken
   * INFORU_SMS_SENDER_NAME=        # alphanumeric sender / brand (per account allowance)
   * INFORU_SMS_SENDER_NUMBER=      # numeric sender if required by account (often empty string allowed — set per InforU instructions)
   * # Optional: override endpoint (default https://uapi.inforu.co.il/v2/SendMessage.asmx)
   * # INFORU_SMS_API_URL=https://uapi.inforu.co.il/v2/SendMessage.asmx
   *
   * Alias: INFORU_SMS_USERNAME is accepted instead of INFORU_SMS_USER_NAME.
   */
};
