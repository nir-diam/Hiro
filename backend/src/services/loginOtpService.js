const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const LoginEmailCode = require('../models/LoginEmailCode');
const emailService = require('./emailService');

const MAX_ATTEMPTS = 5;
const OTP_TTL_MS = 15 * 60 * 1000;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const generateSixDigitCode = () => String(Math.floor(100000 + Math.random() * 900000));

const isDoubleAuthEnabledForUser = (user) => {
  if (!user?.clientId) return false;
  const settings = user.client?.usageSettings;
  if (!settings) return false;
  return String(settings.doubleAuth || '').trim() === 'פעיל';
};

const abandonPendingChallengesForUser = async (userId) => {
  await LoginEmailCode.destroy({
    where: { userId, consumedAt: { [Op.is]: null } },
  });
};

const createChallenge = async ({ user, plainCode }) => {
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

const getLatestPendingChallengeForUser = async (userId) =>
  LoginEmailCode.findOne({
    where: { userId, consumedAt: { [Op.is]: null } },
    order: [['createdAt', 'DESC']],
  });

/** @returns {{ ok: true, plainCode: string } | { error: string, status: number }} */
exports.startEmailOtpForUser = async (user) => {
  try {
    const plainCode = generateSixDigitCode();
    await createChallenge({ user, plainCode });
    await sendOtpEmail(user, plainCode);
    return { ok: true };
  } catch (err) {
    console.error('[loginOtp] send failed', err?.message || err);
    const e = new Error('Failed to send verification email. Try again later.');
    e.status = 500;
    throw e;
  }
};

exports.isDoubleAuthEnabledForUser = isDoubleAuthEnabledForUser;
exports.normalizeEmail = normalizeEmail;
exports.getLatestPendingChallengeForUser = getLatestPendingChallengeForUser;
exports.MAX_ATTEMPTS = MAX_ATTEMPTS;

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
