const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const LoginEmailCode = require('../models/LoginEmailCode');
const emailService = require('./emailService');
const inforuService = require('./inforuService');
const smsService = require('./smsService');

const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 15 * 60 * 1000;

const DOUBLE_AUTH_INACTIVE = 'לא פעיל';
const DOUBLE_AUTH_EMAIL = 'פעיל מייל';
const DOUBLE_AUTH_SMS = 'פעיל SMS';
const LEGACY_DOUBLE_AUTH_ACTIVE = 'פעיל';

const normalizeDoubleAuthSetting = (value) => {
  const s = String(value || '').trim();
  if (s === LEGACY_DOUBLE_AUTH_ACTIVE || s === DOUBLE_AUTH_EMAIL) return DOUBLE_AUTH_EMAIL;
  if (s === DOUBLE_AUTH_SMS) return DOUBLE_AUTH_SMS;
  if (s === DOUBLE_AUTH_INACTIVE) return DOUBLE_AUTH_INACTIVE;
  return DOUBLE_AUTH_INACTIVE;
};

/** @returns {'email'|'sms'|null} */
const getDoubleAuthMode = (user) => {
  if (!user?.clientId) return null;
  const settings = user.client?.usageSettings;
  if (!settings) return null;
  const mode = normalizeDoubleAuthSetting(settings.doubleAuth);
  if (mode === DOUBLE_AUTH_EMAIL) return 'email';
  if (mode === DOUBLE_AUTH_SMS) return 'sms';
  return null;
};

const isDoubleAuthEnabledForUser = (user) => Boolean(getDoubleAuthMode(user));

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const generateSixDigitCode = () => String(Math.floor(100000 + Math.random() * 900000));

const mapSmsSendError = (err) => {
  const statusId = err?.inforuStatusId ?? err?.responseBody?.StatusId;
  if (statusId === -2) {
    const e = new Error(
      'שליחת SMS נכשלה: InforU דחה את האימות. ודאו שהטוקן פעיל, שיש הרשאת SMS על הטוקן, וש-INFORU_SMS_USER_NAME נכון. אם יש הגבלת IP — הוסיפו 85.130.128.107 (מקומי) או 51.20.170.119 (שרת).',
    );
    e.status = 502;
    return e;
  }
  if (statusId === -231) {
    const e = new Error('שליחת SMS נכשלה: סוג טוקן שגוי — הגדירו INFORU_CAPI_AUTH=bearer.');
    e.status = 502;
    return e;
  }
  if (statusId === -18 || statusId === -33) {
    const e = new Error(
      'מספר הטלפון בפרופיל הרכז אינו תקין ל-SMS (נדרש נייד ישראלי בפורמט 05XXXXXXXX, לא שלוחה). עדכנו את הטלפון בפרופיל.',
    );
    e.status = 400;
    return e;
  }
  if (err?.status && err?.message) return err;
  const e = new Error('שליחת SMS לאימות נכשלה. נסו שוב מאוחר יותר.');
  e.status = err?.status || 502;
  return e;
};

const abandonPendingChallengesForUser = async (userId) => {
  await LoginEmailCode.destroy({
    where: { userId, consumedAt: { [Op.is]: null } },
  });
};

const createChallenge = async ({ user, plainCode, deliveryChannel = 'email' }) => {
  await abandonPendingChallengesForUser(user.id);
  const norm = normalizeEmail(user.email);

  const codeHash = await bcrypt.hash(plainCode, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  return LoginEmailCode.create({
    userId: user.id,
    email: norm,
    codeHash,
    failCount: 0,
    expiresAt,
    clientId: user.clientId || null,
    deliveryChannel,
  });
};

const sendOtpEmail = async (user, plainCode) => {
  const clientName = user.client?.displayName || user.client?.name || null;
  const subject = 'קוד אימות להתחברות למערכת Hiro';
  const text = [
    'שלום,',
    '',
    `קוד האימות שלך הוא: ${plainCode}`,
    'הקוד תקף ל־15 דקות.',
    '',
    'אם לא ניסית להתחבר, התעלם מהודעה זו.',
  ].join('\n');

  const html = `<div dir="rtl" style="font-family:sans-serif;line-height:1.6;">
    <p>שלום,</p>
    <p><strong>קוד האימות שלך:</strong> ${plainCode}</p>
    <p style="color:#666;font-size:14px;">הקוד תקף ל־15 דקות.</p>
    <p style="color:#666;font-size:14px;">אם לא ניסית להתחבר, התעלם מהודעה זו.</p>
  </div>`;

  await emailService.sendEmail({
    toEmail: normalizeEmail(user.email),
    subject,
    text,
    html,
    userRole: user.role,
    clientName,
  });
};

const sendOtpSms = async (user, plainCode) => {
  const rawPhone = String(user.phone || '').trim();
  const phone =
    inforuService.normalizeIsraeliMobileMsisdn(rawPhone) ||
    smsService.normalizeIsraeliMobileMsisdn(rawPhone) ||
    '';
  if (!phone) {
    const err = new Error(
      rawPhone
        ? `מספר הטלפון "${rawPhone}" אינו נייד ישראלי תקין (05XXXXXXXX). עדכנו את הטלפון בפרופיל הרכז — לא שלוחה.`
        : 'למשתמש אין מספר טלפון נייד לשליחת קוד SMS. עדכנו את הטלפון בפרופיל הרכז.',
    );
    err.status = 400;
    throw err;
  }

  const message = `קוד האימות שלך להתחברות ל-Hiro: ${plainCode}. תקף ל-15 דקות.`;

  const trySoap = async () => {
    if (!smsService.isConfigured()) return false;
    await smsService.sendSms({ to: phone, message });
    return true;
  };

  if (inforuService.isConfigured()) {
    try {
      await inforuService.sendSms({
        message,
        recipients: [{ phone, customerMessageId: `login_otp_${user.id}` }],
      });
      return;
    } catch (e) {
      const { authMode } = inforuService.getConfig();
      if (e?.isAuthFailure && (await trySoap())) return;
      throw mapSmsSendError(e);
    }
  }

  try {
    if (await trySoap()) return;
  } catch (e) {
    throw mapSmsSendError(e);
  }

  const err = new Error('SMS provider not configured (InforU env vars)');
  err.status = 503;
  throw err;
};

const getLatestPendingChallengeForUser = async (userId) =>
  LoginEmailCode.findOne({
    where: { userId, consumedAt: { [Op.is]: null } },
    order: [['createdAt', 'DESC']],
  });

/** @returns {Promise<{ ok: true, channel: 'email'|'sms' }>} */
const startOtpForUser = async (user) => {
  const channel = getDoubleAuthMode(user);
  if (!channel) {
    const err = new Error('Two-factor authentication is not enabled for this account');
    err.status = 400;
    throw err;
  }

  try {
    const plainCode = generateSixDigitCode();
    await createChallenge({ user, plainCode, deliveryChannel: channel });
    if (String(process.env.LOGIN_OTP_DEV_LOG || '').trim().toLowerCase() === 'true') {
      console.info(`[loginOtp][dev] user=${user.id} channel=${channel} code=${plainCode}`);
    }
    if (channel === 'sms') {
      await sendOtpSms(user, plainCode);
    } else {
      await sendOtpEmail(user, plainCode);
    }
    return { ok: true, channel };
  } catch (err) {
    console.error('[loginOtp] send failed', err?.message || err);
    if (err.status) throw err;
    const e = new Error(
      channel === 'sms'
        ? 'Failed to send verification SMS. Try again later.'
        : 'Failed to send verification email. Try again later.',
    );
    e.status = 500;
    throw e;
  }
};

/** @returns {Promise<{ ok: true }>} */
const startEmailOtpForUser = async (user) => {
  await startOtpForUser(user);
  return { ok: true };
};

exports.startOtpForUser = startOtpForUser;
exports.startEmailOtpForUser = startEmailOtpForUser;
exports.isDoubleAuthEnabledForUser = isDoubleAuthEnabledForUser;
exports.getDoubleAuthMode = getDoubleAuthMode;
exports.normalizeDoubleAuthSetting = normalizeDoubleAuthSetting;
exports.normalizeEmail = normalizeEmail;
exports.getLatestPendingChallengeForUser = getLatestPendingChallengeForUser;
exports.MAX_ATTEMPTS = MAX_ATTEMPTS;
exports.DOUBLE_AUTH_INACTIVE = DOUBLE_AUTH_INACTIVE;
exports.DOUBLE_AUTH_EMAIL = DOUBLE_AUTH_EMAIL;
exports.DOUBLE_AUTH_SMS = DOUBLE_AUTH_SMS;

/**
 * Verify OTP. On success marks consumed and returns { ok: true }.
 * On failure returns { ok: false, status, message, locked?: boolean }
 */
exports.verifyOtp = async (userId, plainCode) => {
  const row = await getLatestPendingChallengeForUser(userId);
  if (!row) {
    return { ok: false, status: 401, message: 'Invalid or expired code' };
  }
  if (row.lockedAt) {
    return {
      ok: false,
      status: 403,
      message: 'CODE_LOCKED',
      locked: true,
    };
  }
  if (new Date(row.expiresAt) < new Date()) {
    return { ok: false, status: 401, message: 'Invalid or expired code' };
  }

  const match = await bcryptCompareSafe(plainCode, row.codeHash);
  if (!match) {
    const nextFail = (row.failCount || 0) + 1;
    const updates = { failCount: nextFail };
    if (nextFail >= MAX_ATTEMPTS) {
      updates.lockedAt = new Date();
    }
    await row.update(updates);
    await row.reload();
    if (row.lockedAt) {
      return {
        ok: false,
        status: 403,
        message: 'CODE_LOCKED',
        locked: true,
      };
    }
    return { ok: false, status: 401, message: 'Invalid code' };
  }

  await row.update({ consumedAt: new Date() });
  return { ok: true };
};

async function bcryptCompareSafe(plain, hash) {
  try {
    return await bcrypt.compare(String(plain || '').trim(), hash);
  } catch {
    return false;
  }
}
