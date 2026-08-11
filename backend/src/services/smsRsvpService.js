/**
 * SMS RSVP business logic — InforU two-way interview confirmation.
 * Does NOT yet wire into candidate cards / coordinator notifications (future integration).
 */

const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const inforuService = require('./inforuService');
const SmsRsvpRequest = require('../models/SmsRsvpRequest');
const SmsRsvpInboundLog = require('../models/SmsRsvpInboundLog');
const SmsRsvpDeliveryLog = require('../models/SmsRsvpDeliveryLog');

const DEFAULT_EXPIRY_HOURS = Number(process.env.INFORU_RSVP_EXPIRY_HOURS || 72);
const DEFAULT_REMINDER_HOURS = Number(process.env.INFORU_RSVP_REMINDER_HOURS || 24);

const UNSUBSCRIBE_PATTERNS = [
  /^stop$/i,
  /^הסר$/i,
  /^הסירו$/i,
  /^הסרה$/i,
  /^הסר\s/i,
  /^remove$/i,
  /^unsubscribe$/i,
];

const RSVP_RESPONSE_LABELS = {
  confirmed: 'מאשר הגעה',
  confirmed_with_reservations: 'מאשר הגעה עם הסתייגויות',
  declined: 'לא אגיע',
  other: 'אחר / לדבר עם הרכז',
  manual_review: 'דורש טיפול ידני',
};

const DEFAULT_RSVP_MESSAGE =
  'הי [#FirstName#], מוזמן/ת לראיון. השב 1 לאישור הגעה, 2 לאישור עם הסתייגויות, 3 לביטול, 4 לדבר עם הרכז';

const normalizeText = (text) =>
  String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:]+$/g, '');

const isUnsubscribeMessage = (text) => {
  const t = normalizeText(text).toLowerCase();
  return UNSUBSCRIBE_PATTERNS.some((re) => re.test(t));
};

/**
 * Parse inbound SMS body / keyword into RSVP response code.
 * @returns {{ kind: 'rsvp' | 'unsubscribe' | 'empty'; response?: string }}
 */
const parseInboundRsvp = ({ message, keyword }) => {
  const raw = normalizeText(message || keyword || '');
  if (!raw) return { kind: 'empty' };

  if (isUnsubscribeMessage(raw)) return { kind: 'unsubscribe' };

  const digit = raw.match(/^([1-4])/)?.[1] || String(keyword || '').trim().match(/^([1-4])/)?.[1];
  if (digit === '1') return { kind: 'rsvp', response: 'confirmed' };
  if (digit === '2') return { kind: 'rsvp', response: 'confirmed_with_reservations' };
  if (digit === '3') return { kind: 'rsvp', response: 'declined' };
  if (digit === '4') return { kind: 'rsvp', response: 'other' };

  const lower = raw.toLowerCase();
  if (/מאשר|אגיע|מגיע|כן/.test(lower) && !/לא\s*(מאשר|אגיע|מגיע)|עם\s*הסתייג/.test(lower)) {
    return { kind: 'rsvp', response: 'confirmed' };
  }
  if (/הסתייג|סייג|אולי|תנאי/.test(lower)) {
    return { kind: 'rsvp', response: 'confirmed_with_reservations' };
  }
  if (/לא\s*(אגיע|מגיע|מעוניין)|ביטול|מבטל/.test(lower)) {
    return { kind: 'rsvp', response: 'declined' };
  }

  return { kind: 'rsvp', response: 'manual_review' };
};

const buildDefaultMessage = (firstName) =>
  DEFAULT_RSVP_MESSAGE.replace('[#FirstName#]', String(firstName || '').trim() || 'שלום');

const expireStaleRequests = async () => {
  const now = new Date();
  const [count] = await SmsRsvpRequest.update(
    { status: 'expired' },
    {
      where: {
        status: 'pending',
        expiresAt: { [Op.lt]: now },
      },
    },
  );
  return count;
};

/**
 * Latest open (pending + not expired) RSVP for phone digits.
 */
const findOpenRequestByPhone = async (phone) => {
  await expireStaleRequests();
  const digits = inforuService.phoneDigitsKey(phone);
  if (!digits) return null;

  return SmsRsvpRequest.findOne({
    where: {
      phoneDigits: digits,
      status: 'pending',
      expiresAt: { [Op.gt]: new Date() },
    },
    order: [['createdAt', 'DESC']],
  });
};

const closePendingForCandidate = async (candidateId, newStatus = 'expired') => {
  await SmsRsvpRequest.update(
    { status: newStatus },
    {
      where: {
        candidateId,
        status: 'pending',
      },
    },
  );
};

/**
 * Create + send RSVP invitation SMS.
 */
const sendRsvpInvitation = async ({
  candidateId,
  jobId,
  phone,
  firstName,
  message,
  clientId = null,
  createdByUserId = null,
  expiryHours = DEFAULT_EXPIRY_HOURS,
  metadata = {},
}) => {
  if (!candidateId || !jobId) {
    const err = new Error('candidateId and jobId are required');
    err.status = 400;
    throw err;
  }

  const normalizedPhone = inforuService.normalizeIsraeliMsisdn(phone);
  const phoneDigits = inforuService.phoneDigitsKey(phone);
  if (!normalizedPhone || !phoneDigits) {
    const err = new Error('Valid mobile phone is required');
    err.status = 400;
    throw err;
  }

  await closePendingForCandidate(candidateId, 'expired');

  const requestId = uuidv4();
  const outboundMessage = String(message || buildDefaultMessage(firstName)).trim();
  const expiresAt = new Date(Date.now() + Math.max(1, expiryHours) * 3600_000);

  const request = await SmsRsvpRequest.create({
    id: requestId,
    candidateId,
    jobId,
    clientId,
    phone: normalizedPhone,
    phoneDigits,
    status: 'pending',
    outboundMessage,
    expiresAt,
    createdByUserId,
    inforuCustomerMessageId: `rsvp_${requestId}`,
    metadata,
  });

  let sendResult;
  try {
    sendResult = await inforuService.sendSms({
      message: outboundMessage,
      recipients: [
        {
          phone: normalizedPhone,
          firstName: firstName || undefined,
          customerMessageId: request.inforuCustomerMessageId,
        },
      ],
    });
    await request.update({
      outboundSentAt: new Date(),
      metadata: {
        ...request.metadata,
        inforuSendResponse: sendResult.data,
      },
    });
  } catch (e) {
    await request.update({ status: 'delivery_failed', metadata: { ...request.metadata, sendError: e.message } });
    throw e;
  }

  return {
    request: request.toJSON ? request.toJSON() : request,
    sendResult,
  };
};

/**
 * Process inbound MO webhook payload (InforU Push Option — SMS_MO).
 * Payload shape per spec:
 * { CustomerId, ProjectId, Data: [{ Channel, Value, Keyword, Message, ShortCode }] }
 */
const processInboundMo = async (payload) => {
  const rows = Array.isArray(payload?.Data) ? payload.Data : [];
  const results = [];

  for (const row of rows) {
    if (String(row?.Channel || '').toUpperCase() !== 'SMS_MO') continue;

    const phone = row.Value || row.Phone || '';
    const message = row.Message ?? row.message ?? '';
    const keyword = row.Keyword ?? row.keyword ?? '';
    const shortCode = row.ShortCode ?? row.shortCode ?? null;
    const phoneDigits = inforuService.phoneDigitsKey(phone);

    const parsed = parseInboundRsvp({ message, keyword });

    const logEntry = await SmsRsvpInboundLog.create({
      phone: inforuService.normalizeIsraeliMsisdn(phone) || String(phone),
      phoneDigits: phoneDigits || String(phone).replace(/\D/g, ''),
      message: String(message || ''),
      keyword: keyword ? String(keyword) : null,
      shortCode: shortCode ? String(shortCode) : null,
      parseResult: parsed.kind === 'rsvp' ? parsed.response : parsed.kind,
      rawPayload: { ...(payload || {}), row },
    });

    if (parsed.kind === 'unsubscribe') {
      results.push({
        logId: logEntry.id,
        matched: false,
        kind: 'unsubscribe',
        phone: phoneDigits,
      });
      continue;
    }

    if (parsed.kind === 'empty') {
      results.push({
        logId: logEntry.id,
        matched: false,
        kind: 'empty',
        phone: phoneDigits,
      });
      continue;
    }

    const openRequest = await findOpenRequestByPhone(phone);
    if (!openRequest) {
      await logEntry.update({ parseResult: 'manual_review' });
      results.push({
        logId: logEntry.id,
        matched: false,
        kind: 'no_open_request',
        phone: phoneDigits,
        parseResult: parsed.response,
        rawMessage: String(message || keyword || ''),
      });
      continue;
    }

    const finalResponse = parsed.response === 'manual_review' ? 'manual_review' : parsed.response;

    await openRequest.update({
      status: 'answered',
      rsvpResponse: finalResponse,
      answeredAt: new Date(),
      inboundMessageRaw: String(message || keyword || ''),
      inboundKeyword: keyword ? String(keyword) : null,
    });

    await logEntry.update({
      matchedRequestId: openRequest.id,
      parseResult: finalResponse,
    });

    results.push({
      logId: logEntry.id,
      matched: true,
      requestId: openRequest.id,
      candidateId: openRequest.candidateId,
      jobId: openRequest.jobId,
      rsvpResponse: finalResponse,
      rsvpLabel: RSVP_RESPONSE_LABELS[finalResponse] || finalResponse,
      phone: phoneDigits,
      requiresManualReview: finalResponse === 'manual_review',
    });
  }

  return results;
};

/**
 * Process delivery notification (DLR) webhook.
 * InforU payload varies — store raw + attempt match by phone / CustomerMessageID when present.
 */
const processDeliveryNotification = async (payload) => {
  const body = payload && typeof payload === 'object' ? payload : {};
  const phone =
    body.Phone ||
    body.phone ||
    body.RecipientPhone ||
    body.Value ||
    (Array.isArray(body.Data) ? body.Data[0]?.Phone || body.Data[0]?.Value : null);
  const status =
    body.Status ||
    body.status ||
    body.DeliveryStatus ||
    (Array.isArray(body.Data) ? body.Data[0]?.Status : null) ||
    'unknown';
  const customerMessageId =
    body.CustomerMessageID ||
    body.customerMessageId ||
    (Array.isArray(body.Data) ? body.Data[0]?.CustomerMessageID : null);

  const phoneDigits = phone ? inforuService.phoneDigitsKey(phone) : null;

  let request = null;
  if (customerMessageId) {
    request = await SmsRsvpRequest.findOne({
      where: { inforuCustomerMessageId: String(customerMessageId) },
      order: [['createdAt', 'DESC']],
    });
  }
  if (!request && phoneDigits) {
    request = await SmsRsvpRequest.findOne({
      where: { phoneDigits, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });
  }

  const log = await SmsRsvpDeliveryLog.create({
    requestId: request?.id || null,
    phone: phone ? inforuService.normalizeIsraeliMsisdn(phone) || String(phone) : null,
    phoneDigits,
    deliveryStatus: String(status),
    rawPayload: body,
  });

  if (request) {
    const failed = /fail|error|reject|undeliver|expir/i.test(String(status));
    await request.update({
      deliveryStatus: String(status),
      deliveryStatusAt: new Date(),
      ...(failed && request.status === 'pending' ? { status: 'delivery_failed' } : {}),
    });
  }

  return {
    logId: log.id,
    requestId: request?.id || null,
    deliveryStatus: String(status),
    matched: Boolean(request),
  };
};

/**
 * Mark requests with no reply after reminder window as no_response (call from cron later).
 */
const closeNoResponseRequests = async ({ afterHours = DEFAULT_REMINDER_HOURS } = {}) => {
  const cutoff = new Date(Date.now() - Math.max(1, afterHours) * 3600_000);
  const [count] = await SmsRsvpRequest.update(
    { status: 'no_response' },
    {
      where: {
        status: 'pending',
        outboundSentAt: { [Op.lt]: cutoff },
        reminderSentAt: { [Op.not]: null },
      },
    },
  );
  return count;
};

const getRequestById = async (id) => {
  if (!id) return null;
  return SmsRsvpRequest.findByPk(id);
};

const listRequestsForCandidate = async (candidateId, { limit = 20 } = {}) =>
  SmsRsvpRequest.findAll({
    where: { candidateId },
    order: [['createdAt', 'DESC']],
    limit: Math.min(100, Math.max(1, limit)),
  });

module.exports = {
  parseInboundRsvp,
  isUnsubscribeMessage,
  sendRsvpInvitation,
  processInboundMo,
  processDeliveryNotification,
  findOpenRequestByPhone,
  expireStaleRequests,
  closeNoResponseRequests,
  closePendingForCandidate,
  getRequestById,
  listRequestsForCandidate,
  RSVP_RESPONSE_LABELS,
  DEFAULT_RSVP_MESSAGE,
  DEFAULT_EXPIRY_HOURS,
  DEFAULT_REMINDER_HOURS,
};
