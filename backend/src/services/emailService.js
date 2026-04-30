const EmailUpload = require('../models/EmailUpload');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

const create = async (payload) => {
  const record = await EmailUpload.create(payload);
  return record;
};

const humandClientName = 'מימד אנושי';

/** Legacy Hiro / SES SMTP (fallback if Resend is not configured) */
const pickHiro = () => ({
  host: process.env.HIRO_SMTP_HOST,
  port: Number(process.env.HIRO_SMTP_PORT || 587),
  user: process.env.HIRO_SMTP_USER_NAME,
  pass: process.env.HIRO_SMTP_PASSWORD,
  defaultFrom: process.env.HIRO_SMTP_FROM_EMAIL,
});

/** [Resend](https://resend.com/) API for Hiro / platform email — prefer over Amazon SES SMTP when set */
const pickHiroResend = () => ({
  apiKey: (process.env.HIRO_RESEND_API_KEY ).trim(),
  defaultFrom: (
    process.env.HIRO_RESEND_FROM_EMAIL
    
  ).trim(),
});

/** Resend API for Humand («מימד אנושי») client lane — HUMAND_RESEND_* in .env */
const pickHumand = () => ({
  apiKey: (process.env.HUMAND_RESEND_API_KEY || '').trim(),
  defaultFrom: (process.env.HUMAND_RESEND_FROM_EMAIL || '').trim(),
});

const pickLegacy = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  user: process.env.SMTP_USER_NAME,
  pass: process.env.SMTP_PASSWORD,
  defaultFrom:
    process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || process.env.SMTP_USER_NAME,
});

const isSmtpComplete = (cfg) =>
  Boolean(
    cfg
      && cfg.host
      && cfg.user
      && cfg.pass != null
      && String(cfg.pass).length > 0
      && String(cfg.host).trim()
      && String(cfg.user).trim(),
  );

const isValidEmail = (s) => Boolean(s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s).trim()));

/**
 * Humand env uses e.g. no-reply@humand.co.il; outbound mail should use the logged-in sender's
 * local-part with the same domain (Resend verified domain).
 */
const buildHumandFrom = (defaultFrom, senderEmail) => {
  const base = String(defaultFrom || '').trim();
  const se = String(senderEmail || '').trim();
  if (!isValidEmail(base) || !isValidEmail(se)) return null;
  const at = base.indexOf('@');
  if (at < 1) return null;
  const domain = base.slice(at + 1);
  const local = se.split('@')[0];
  if (!domain || !local) return null;
  const next = `${local}@${domain}`;
  return isValidEmail(next) ? next : null;
};

const resolveHumandSenderFrom = ({ clientName, fromEmail, senderEmail }) => {
  if (fromEmail) return fromEmail;
  const clientLabel = clientName ? String(clientName).trim() : '';
  if (clientLabel !== humandClientName || !isResendHumandConfigured() || !senderEmail) return null;
  const humand = pickHumand();
  return buildHumandFrom(humand.defaultFrom, senderEmail);
};

/** Hiro / platform email lane (Resend or HIRO_SMTP_*) */
const isHiroSenderRole = (role) => {
  const r = role ? String(role).toLowerCase() : '';
  return r === 'admin' || r === 'super_admin';
};

const isResendHiroConfigured = () => {
  const c = pickHiroResend();
  return Boolean(c.apiKey && isValidEmail(c.defaultFrom));
};

const isResendHumandConfigured = () => {
  const c = pickHumand();
  return Boolean(c.apiKey && isValidEmail(c.defaultFrom));
};

/** When SMTP_HOST / SMTP_USER_NAME are unset, use Hiro SES (same as typical .env layout). */
const pickLegacyThenHiroFallback = () => {
  const leg = pickLegacy();
  if (isSmtpComplete(leg)) return leg;
  const hiro = pickHiro();
  if (isSmtpComplete(hiro)) return hiro;
  return leg;
};

const stripHtml = (s) =>
  String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @param {{ userRole?: string | null; clientName?: string | null }} ctx
 */
const resolveSmtpConfig = (ctx = {}) => {
  const role = ctx.userRole ? String(ctx.userRole).toLowerCase() : '';
  if (isHiroSenderRole(role)) {
    const hiro = pickHiro();
    if (isSmtpComplete(hiro)) return hiro;
    return pickLegacyThenHiroFallback();
  }

  const clientLabel = ctx.clientName ? String(ctx.clientName).trim() : '';
  if (clientLabel === humandClientName) {
    // Humand sends via Resend (HUMAND_RESEND_*); no dedicated SMTP row here.
    return pickLegacyThenHiroFallback();
  }

  return pickLegacyThenHiroFallback();
};

/**
 * Resend replaces Amazon SES SMTP for Hiro when HIRO_RESEND_API_KEY or RESEND_API_KEY is set.
 * @returns {{ type: 'resend', apiKey: string, defaultFrom: string } | { type: 'smtp' } & ReturnType<pickLegacy> }
 */
const resolveSendPlan = (ctx = {}) => {
  const role = ctx.userRole ? String(ctx.userRole).toLowerCase() : '';
  const clientLabel = ctx.clientName ? String(ctx.clientName).trim() : '';
  const resend = pickHiroResend();
  const resendOk = isResendHiroConfigured();

  if (isHiroSenderRole(role)) {
    if (resendOk) return { type: 'resend', apiKey: resend.apiKey, defaultFrom: resend.defaultFrom };
    const hiro = pickHiro();
    if (isSmtpComplete(hiro)) return { type: 'smtp', ...hiro };
    return { type: 'smtp', ...pickLegacyThenHiroFallback() };
  }

  if (clientLabel === humandClientName) {
    const humand = pickHumand();
    if (isResendHumandConfigured()) {
      return { type: 'resend', apiKey: humand.apiKey, defaultFrom: humand.defaultFrom };
    }
  }

  const leg = pickLegacy();
  if (isSmtpComplete(leg)) return { type: 'smtp', ...leg };

  if (resendOk) return { type: 'resend', apiKey: resend.apiKey, defaultFrom: resend.defaultFrom };

  const hiro = pickHiro();
  if (isSmtpComplete(hiro)) return { type: 'smtp', ...hiro };
  return { type: 'smtp', ...pickLegacyThenHiroFallback() };
};

async function sendWithResend(plan, { toEmail, subject, text, html, fromEmail, attachments }) {
  const resolvedFrom = fromEmail || plan.defaultFrom;
  if (!isValidEmail(resolvedFrom)) {
    throw new Error('From address must be set to a valid email (verified domain in Resend)');
  }

  const body = {};
  if (html) body.html = html;
  const textStr = text != null ? String(text) : '';
  if (textStr.trim().length > 0) {
    body.text = textStr;
  } else if (html) {
    body.text = stripHtml(html) || ' ';
  } else {
    body.text = '';
  }
  if (!body.html && !body.text) body.text = '';

  if (Array.isArray(attachments) && attachments.length) {
    body.attachments = attachments.map((a) => {
      const raw = a?.content;
      const b64 = Buffer.isBuffer(raw) ? raw.toString('base64') : String(raw || '');
      return {
        filename: String(a?.filename || 'attachment'),
        content: b64,
      };
    });
  }

  const resend = new Resend(plan.apiKey);
  const { data, error } = await resend.emails.send({
    from: resolvedFrom,
    to: toEmail,
    subject,
    ...body,
  });

  if (error) {
    throw new Error(error.message || JSON.stringify(error) || 'Resend send failed');
  }
  const id = data?.id || null;
  return { messageId: id, id, provider: 'resend', raw: data };
}

const sendEmail = async ({
  toEmail,
  subject,
  text,
  html,
  fromEmail,
  userRole = null,
  clientName = null,
  senderEmail = null,
  attachments = null,
}) => {
  if (!toEmail) throw new Error('Missing toEmail');
  if (!subject) throw new Error('Missing subject');

  const plan = resolveSendPlan({ userRole, clientName });

  const humandFrom = resolveHumandSenderFrom({ clientName, fromEmail, senderEmail });

  const plainForSmtp =
    text != null && String(text).trim().length > 0
      ? String(text)
      : html
        ? stripHtml(html) || ' '
        : '';

  if (plan.type === 'resend') {
    return sendWithResend(plan, {
      toEmail,
      subject,
      text,
      html,
      fromEmail: humandFrom || fromEmail,
      attachments,
    });
  }

  const { host, port, user, pass, defaultFrom } = plan;
  const resolvedFrom = humandFrom || fromEmail || defaultFrom;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured for this sender context (missing host/user/password)');
  }
  if (!isValidEmail(resolvedFrom)) {
    throw new Error('From address must be set to a valid email (verified SES identity)');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
  });

  const mail = {
    from: resolvedFrom,
    to: toEmail,
    subject,
    text: plainForSmtp,
    html,
  };

  if (Array.isArray(attachments) && attachments.length) {
    mail.attachments = attachments.map((a) => {
      const c = a?.content;
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(String(c || ''), 'base64');
      return {
        filename: String(a?.filename || 'attachment'),
        content: buf,
        contentType: typeof a?.contentType === 'string' ? a.contentType : undefined,
      };
    });
  }

  return transporter.sendMail(mail);
};

module.exports = { create, sendEmail, resolveSmtpConfig, resolveSendPlan };
