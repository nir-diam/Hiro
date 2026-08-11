const auditLogger = require('../utils/auditLogger');
const smsService = require('../services/smsService');
const inforuService = require('../services/inforuService');

const normalizePhoneList = (raw) => {
  const parts = [];
  const push = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(push);
      return;
    }
    String(value)
      .split(/[;,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((p) => parts.push(p));
  };
  push(raw);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const normalized =
      inforuService.normalizeIsraeliMsisdn(p) || smsService.normalizeIsraeliMsisdn(p) || String(p).replace(/\D/g, '');
    const digits = String(normalized || '').replace(/\D/g, '');
    if (digits.length < 9) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(normalized || p);
  }
  return out;
};

const mapSmsSendError = (err) => {
  const statusId = err?.inforuStatusId ?? err?.responseBody?.StatusId;
  if (statusId === -2) {
    const e = new Error(
      'שליחת SMS נכשלה: InforU דחה את האימות. ודאו שהטוקן פעיל, שיש הרשאת SMS על הטוקן, וש-INFORU_SMS_USER_NAME נכון.',
    );
    e.status = 502;
    return e;
  }
  if (statusId === -231) {
    const e = new Error('שליחת SMS נכשלה: סוג טוקן שגוי — הגדירו INFORU_CAPI_AUTH=bearer.');
    e.status = 502;
    return e;
  }
  if (err?.status && err?.message) return err;
  const e = new Error(err?.message || 'שליחת SMS נכשלה');
  e.status = err?.status || 502;
  return e;
};

const dispatchOutboundSms = async ({ to, message }) => {
  const trySoap = async () => {
    if (!smsService.isConfigured()) return false;
    await smsService.sendSms({ to, message });
    return true;
  };

  if (inforuService.isConfigured()) {
    try {
      const recipients = (Array.isArray(to) ? to : [to]).map((phone, index) => ({
        phone,
        customerMessageId: `compose_${Date.now()}_${index}`,
      }));
      await inforuService.sendSms({ message, recipients });
      return { provider: 'inforu' };
    } catch (e) {
      const { authMode } = inforuService.getConfig();
      if (e?.isAuthFailure && (await trySoap())) return { provider: 'inforu-soap-fallback' };
      throw mapSmsSendError(e);
    }
  }

  if (await trySoap()) return { provider: 'inforu-soap' };

  const err = new Error('SMS provider not configured (InforU env vars)');
  err.status = 503;
  throw err;
};

/**
 * Log opening WhatsApp Web/App compose from staff UI.
 * Writes directly to audit_logs (does not depend on system_events catalog).
 */
const logWhatsappOpen = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const candidateId =
      body.candidateId != null && String(body.candidateId).trim() ? String(body.candidateId).trim() : null;
    const candidateName = body.candidateName != null ? String(body.candidateName).trim() : '';
    const phone = body.phone != null ? String(body.phone) : '';
    const phoneDigits = phone.replace(/\D/g, '');
    const previewRaw = body.messagePreview != null ? String(body.messagePreview) : '';
    const messagePreview = previewRaw.length > 400 ? `${previewRaw.slice(0, 400)}…` : previewRaw;
    const previewLine = messagePreview.replace(/\s+/g, ' ').trim();

    const templateId =
      body.templateId != null && String(body.templateId).trim() ? String(body.templateId).trim() : null;
    const jobId = body.jobId != null && String(body.jobId).trim() ? String(body.jobId).trim() : null;

    const descriptionParts = [
      'נפתח קישור וואטסאפ מממשק הצוות',
      candidateName ? `מועמד: ${candidateName}` : null,
      phone.trim() ? `טלפון: ${phone.trim()}` : null,
      previewLine ? `תצוגת הודעה: ${previewLine}` : null,
    ].filter(Boolean);
    const description = descriptionParts.join(' · ') || 'נפתח קישור וואטסאפ מממשק הצוות';

    await auditLogger.logAwait(req, {
      level: 'info',
      action: 'system',
      description,
      entityType: candidateId ? 'Candidate' : null,
      entityId: candidateId,
      entityName: candidateName || null,
      metadata: {
        whatsappComposeOpen: true,
        phoneDigits: phoneDigits || null,
        templateId,
        jobId,
      },
    });

    return res.status(204).end();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[messagingController.logWhatsappOpen]', err);
    return res.status(500).json({ message: err.message || 'Failed to log' });
  }
};

/**
 * POST /api/messaging/send-sms — staff compose SMS via InforU (SendMessageModal).
 */
const sendSms = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const message = body.message != null ? String(body.message).trim() : '';
    if (!message) {
      return res.status(400).json({ message: 'תוכן ההודעה חובה' });
    }

    const phones = normalizePhoneList(body.toPhone ?? body.to ?? body.phone ?? body.phones);
    if (!phones.length) {
      return res.status(400).json({ message: 'אין מספר טלפון תקין ל־SMS' });
    }

    const candidateId =
      body.candidateId != null && String(body.candidateId).trim() ? String(body.candidateId).trim() : null;
    const candidateName = body.candidateName != null ? String(body.candidateName).trim() : '';
    const templateId =
      body.templateId != null && String(body.templateId).trim() ? String(body.templateId).trim() : null;
    const jobId = body.jobId != null && String(body.jobId).trim() ? String(body.jobId).trim() : null;

    const previewRaw = message;
    const messagePreview = previewRaw.length > 400 ? `${previewRaw.slice(0, 400)}…` : previewRaw;
    const previewLine = messagePreview.replace(/\s+/g, ' ').trim();

    const results = [];
    for (const phone of phones) {
      const sendMeta = await dispatchOutboundSms({ to: phone, message });
      results.push({
        to: phone,
        ok: true,
        provider: sendMeta.provider,
      });
    }

    const fromName =
      req?.user?.fullName || req?.user?.name || req?.user?.email || 'מערכת';
    const descriptionParts = [
      'נשלח SMS מממשק הצוות',
      candidateName ? `מועמד: ${candidateName}` : null,
      phones.length === 1 ? `טלפון: ${phones[0]}` : `טלפונים: ${phones.join(', ')}`,
      previewLine ? `תצוגת הודעה: ${previewLine}` : null,
    ].filter(Boolean);
    const description = descriptionParts.join(' · ') || 'נשלח SMS מממשק הצוות';

    await auditLogger.logAwait(req, {
      level: 'info',
      action: 'system',
      description,
      entityType: candidateId ? 'Candidate' : null,
      entityId: candidateId,
      entityName: candidateName || null,
      metadata: {
        sendMessageModalSms: true,
        from: fromName,
        phones,
        templateId,
        jobId,
        provider: results[0]?.provider || null,
      },
    });

    return res.json({
      ok: true,
      results,
      sentCount: results.length,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[messagingController.sendSms]', err);
    const status = Number(err?.status) || 502;
    return res.status(status).json({ message: err.message || 'Failed to send SMS' });
  }
};

module.exports = { logWhatsappOpen, sendSms };
