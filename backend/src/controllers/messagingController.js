const auditLogger = require('../utils/auditLogger');

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

module.exports = { logWhatsappOpen };
