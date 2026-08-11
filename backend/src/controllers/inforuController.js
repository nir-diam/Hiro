const inforuService = require('../services/inforuService');
const smsRsvpService = require('../services/smsRsvpService');

const webhookSecret = () => (process.env.INFORU_WEBHOOK_SECRET || '').trim();

const verifyWebhookSecret = (req) => {
  const expected = webhookSecret();
  if (!expected) return true;
  const got = String(req.headers['x-inforu-webhook-secret'] || req.query?.secret || '').trim();
  return got === expected;
};

const webhookForbidden = (res) =>
  res.status(403).json({ message: 'Invalid webhook secret' });

/** GET /api/inforu/status — config probe (no secrets). */
const status = (_req, res) => {
  res.json({
    inforuConfigured: inforuService.isConfigured(),
    sender: inforuService.getConfig().sender ? 'set' : 'missing',
    webhookBaseUrl: inforuService.getConfig().webhookBaseUrl || null,
    dlrUrl: inforuService.deliveryNotificationUrl() || null,
    rsvpExpiryHours: smsRsvpService.DEFAULT_EXPIRY_HOURS,
    rsvpReminderHours: smsRsvpService.DEFAULT_REMINDER_HOURS,
  });
};

/**
 * POST /api/inforu/webhooks/mo
 * InforU Push Option — inbound SMS (SMS_MO).
 * Register this URL with InforU support for two-way SMS.
 */
const inboundMoWebhook = async (req, res) => {
  if (!verifyWebhookSecret(req)) return webhookForbidden(res);
  try {
    const results = await smsRsvpService.processInboundMo(req.body || {});
    res.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('[inforu] MO webhook error', err);
    res.status(500).json({ message: err.message || 'MO processing failed' });
  }
};

/**
 * POST /api/inforu/webhooks/dlr
 * Delivery notification (DLR) from InforU SendSms Settings.DeliveryNotificationUrl.
 */
const deliveryWebhook = async (req, res) => {
  if (!verifyWebhookSecret(req)) return webhookForbidden(res);
  try {
    const result = await smsRsvpService.processDeliveryNotification(req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[inforu] DLR webhook error', err);
    res.status(500).json({ message: err.message || 'DLR processing failed' });
  }
};

/**
 * POST /api/inforu/rsvp/send
 * Send RSVP invitation SMS (internal / future UI — auth required via route).
 */
const sendRsvp = async (req, res) => {
  try {
    const {
      candidateId,
      jobId,
      phone,
      firstName,
      message,
      clientId,
      expiryHours,
      metadata,
    } = req.body || {};

    const result = await smsRsvpService.sendRsvpInvitation({
      candidateId,
      jobId,
      phone,
      firstName,
      message,
      clientId: clientId || req.dbUser?.clientId || null,
      createdByUserId: req.dbUser?.id || null,
      expiryHours,
      metadata,
    });

    res.status(201).json({
      ok: true,
      request: result.request,
      inforu: result.sendResult?.data,
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Failed to send RSVP SMS' });
  }
};

/** GET /api/inforu/rsvp/requests/:id */
const getRsvpRequest = async (req, res) => {
  try {
    const row = await smsRsvpService.getRequestById(req.params.id);
    if (!row) return res.status(404).json({ message: 'RSVP request not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to load RSVP request' });
  }
};

/** GET /api/inforu/rsvp/candidates/:candidateId */
const listCandidateRsvp = async (req, res) => {
  try {
    const rows = await smsRsvpService.listRequestsForCandidate(req.params.candidateId, {
      limit: Number(req.query.limit) || 20,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list RSVP requests' });
  }
};

/** POST /api/inforu/rsvp/parse-preview — debug parse without persisting */
const parsePreview = (req, res) => {
  const { message, keyword } = req.body || {};
  const parsed = smsRsvpService.parseInboundRsvp({ message, keyword });
  res.json({
    parsed,
    label:
      parsed.kind === 'rsvp' && parsed.response
        ? smsRsvpService.RSVP_RESPONSE_LABELS[parsed.response]
        : null,
  });
};

module.exports = {
  status,
  inboundMoWebhook,
  deliveryWebhook,
  sendRsvp,
  getRsvpRequest,
  listCandidateRsvp,
  parsePreview,
};
