const crypto = require('crypto');
const { Op } = require('sequelize');
const authService = require('../services/authService');
const { loadExportLogoForUser } = require('../services/clientExportLogoService');
const candidatePortalAccessService = require('../services/candidatePortalAccessService');
const {
  publicAppOrigin,
  sendStaffPasswordResetEmail,
} = require('../services/staffUserProvisioningService');
const User = require('../models/User');
const Client = require('../models/Client');
const { sequelize } = require('../config/db');
const { serializeAuthUser } = require('../services/permissionService');
const clientUsageSettingService = require('../services/clientUsageSettingService');
const userPreferencesService = require('../services/userPreferencesService');

const serializeAuthUserWithUsage = async (user) => {
  const base = serializeAuthUser(user);
  const effectiveClientId = await authService.resolveEffectiveClientIdForUser(user);
  const clientId = base.clientId || effectiveClientId || null;
  const autoDisconnect = await clientUsageSettingService.getAutoDisconnectForClient(clientId);
  let uiPreferences = userPreferencesService.DEFAULT_PREFERENCES;
  try {
    uiPreferences = await userPreferencesService.getForUser(user.id);
  } catch (err) {
    console.warn('[auth] uiPreferences load failed', err?.message || err);
  }
  return { ...base, clientId, autoDisconnect, uiPreferences };
};

const loginOtpService = require('../services/loginOtpService');

const otpSentMessage = (channel) =>
  channel === 'sms'
    ? 'נשלח אליכם קוד ב-SMS. הזינו אותו כדי להשלים את ההתחברות.'
    : 'נשלח אליכם קוד באימייל. הזינו אותו כדי להשלים את ההתחברות.';

const login = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const outcome = await authService.login({ email, password, role });
    if (outcome.twoFactorRequired) {
      return res.json({
        twoFactorRequired: true,
        email: outcome.email,
        twoFactorChannel: outcome.twoFactorChannel || 'email',
        message: otpSentMessage(outcome.twoFactorChannel),
      });
    }
    return res.json({
      token: outcome.token,
      user: await serializeAuthUserWithUsage(outcome.user),
    });
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ message: err.message || 'Login failed' });
  }
};

const verifyLoginCode = async (req, res) => {
  const { email, code, role } = req.body;

  if (!email || !code) {
    return res.status(400).json({ message: 'Email and code are required' });
  }

  try {
    const { token, user } = await authService.verifyLoginCode({ email, code, role });
    return res.json({
      token,
      user: await serializeAuthUserWithUsage(user),
    });
  } catch (err) {
    const status = err?.status || 401;
    const payload = { message: err.message || 'Verification failed' };
    if (err.code === 'CODE_LOCKED') payload.code = 'CODE_LOCKED';
    return res.status(status).json(payload);
  }
};

const resendLoginCode = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const outcome = await authService.resendLoginCode({ email, password, role });
    return res.json({
      ok: true,
      twoFactorChannel: outcome.twoFactorChannel || 'email',
      message:
        outcome.twoFactorChannel === 'sms'
          ? 'קוד חדש נשלח ב-SMS.'
          : 'קוד חדש נשלח לאימייל.',
    });
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to resend code' });
  }
};

const loginWithGoogle = async (req, res) => {
  const { credential, role } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google credential is required' });
  }

  try {
    const { token, user } = await authService.loginWithGoogle({ credential, role });
    return res.json({
      token,
      user: await serializeAuthUserWithUsage(user),
    });
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ message: err.message || 'Google login failed' });
  }
};

const signup = async (req, res) => {
  const { email, password, name, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { token, user } = await authService.signup({ email, password, name, role });
    return res.status(201).json({
      token,
      user: await serializeAuthUserWithUsage(user),
    });
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Signup failed' });
  }
};

const me = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ message: 'Invalid token' });
    const user = await User.findByPk(userId, {
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'displayName', 'modules'], required: false },
      ],
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(await serializeAuthUserWithUsage(user));
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to load user' });
  }
};

/** Logo bytes for CV export — same auth as /me, no attachDbUser required. */
const clientExportLogo = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ message: 'Invalid token' });
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const payload = await loadExportLogoForUser(user);
    if (!payload) {
      return res.status(404).json({ message: 'No logo configured' });
    }
    res.set('Cache-Control', 'private, no-store');
    return res.json(payload);
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ message: err.message || 'Failed to load logo' });
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORGOT_PASSWORD_ROLES = ['manager', 'recruiter', 'admin', 'super_admin'];

const forgotPasswordResponse = {
  ok: true,
  message: 'אם קיים חשבון עם כתובת זו, נשלח אליכם קישור לאיפוס סיסמה.',
};

/** Self-service staff password reset — always returns the same message (no email enumeration). */
const forgotPassword = async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ message: 'נדרש אימייל תקין' });
  }

  try {
    const user = await User.findOne({
      where: {
        email: { [Op.iLike]: email },
        role: { [Op.in]: FORGOT_PASSWORD_ROLES },
      },
    });
    if (!user) {
      return res.json(forgotPasswordResponse);
    }

    const activationGuid = crypto.randomUUID();
    const tempPassword = crypto.randomBytes(32).toString('hex');

    let clientName = null;
    const clientId = await authService.resolveEffectiveClientIdForUser(user);
    if (clientId) {
      const c = await Client.findByPk(clientId, { attributes: ['displayName', 'name'] });
      if (c) clientName = c.displayName || c.name || null;
    }

    await user.update({
      password: tempPassword,
      activationGuid,
    });

    const activationUrl = `${publicAppOrigin()}/activation?guid=${activationGuid}`;
    await sendStaffPasswordResetEmail(user, activationUrl, {
      userRole: 'admin',
      clientName,
      senderEmail: null,
    });
  } catch (err) {
    console.warn('[auth] forgot-password email failed', err?.message || err);
  }

  return res.json(forgotPasswordResponse);
};

/** Sets password, clears activation token, and activates inactive staff accounts. */
const completeStaffActivation = async (user, password) => {
  await user.update({
    password,
    activationGuid: null,
    isActive: true,
  });
  // Keep legacy duplicate isActive column aligned (users table may have both is_active and "isActive").
  await sequelize.query(
    'UPDATE users SET is_active = true, "isActive" = true, "activationGuid" = NULL WHERE id = :id',
    { replacements: { id: user.id } },
  ).catch((err) => {
    console.warn('[auth] activation column sync failed', err?.message || err);
  });
  await user.reload();
};

const getActivationCheck = async (req, res) => {
  try {
    const { guid } = req.params;
    if (!guid || !UUID_RE.test(guid)) {
      return res.status(400).json({ valid: false, message: 'Invalid activation link' });
    }
    const user = await User.findOne({ where: { activationGuid: guid } });
    if (!user) {
      return res.status(404).json({ valid: false, message: 'This link is invalid or has already been used' });
    }
    const email = user.email || '';
    const masked = email.replace(/(^.).*(@.*$)/, '$1***$2');
    return res.json({ valid: true, email: masked });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Activation check failed' });
  }
};

const postActivationComplete = async (req, res) => {
  try {
    const { guid } = req.params;
    const { password } = req.body;
    if (!guid || !UUID_RE.test(guid)) {
      return res.status(400).json({ message: 'Invalid activation link' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const user = await User.findOne({ where: { activationGuid: guid } });
    if (!user) {
      return res.status(404).json({ message: 'This link is invalid or has already been used' });
    }
    await completeStaffActivation(user, password);
    return res.json({ ok: true, message: 'Password saved. You can log in.' });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Activation failed' });
  }
};

/** Exchange a one-time candidate portal magic link for a JWT session. */
const redeemCandidatePortalMagic = async (req, res) => {
  const token = req.query.token || req.body?.token;
  if (!token) {
    return res.status(400).json({ message: 'Missing magic link token' });
  }

  try {
    const outcome = await candidatePortalAccessService.redeemMagicToken(token);
    return res.json({
      token: outcome.token,
      user: await serializeAuthUserWithUsage(outcome.user),
      candidateId: outcome.candidateId,
    });
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ message: err.message || 'Invalid or expired magic link' });
  }
};

/** Validate candidate portal magic link before password setup (does not consume token). */
const getCandidatePortalMagicCheck = async (req, res) => {
  const token = req.query.token || req.body?.token;
  if (!token) {
    return res.status(400).json({ valid: false, message: 'Missing magic link token' });
  }

  try {
    const outcome = await candidatePortalAccessService.inspectMagicToken(token);
    return res.json(outcome);
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ valid: false, message: err.message || 'Invalid or expired magic link' });
  }
};

/** Set candidate portal password via magic link and start a session. */
const postCandidatePortalMagicSetup = async (req, res) => {
  const token = req.query.token || req.body?.token;
  const { password } = req.body || {};
  if (!token) {
    return res.status(400).json({ message: 'Missing magic link token' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const outcome = await candidatePortalAccessService.setupPortalPasswordFromMagicToken(token, password);
    return res.json({
      ok: true,
      token: outcome.token,
      user: await serializeAuthUserWithUsage(outcome.user),
      candidateId: outcome.candidateId,
    });
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Unable to set password' });
  }
};

module.exports = {
  login,
  verifyLoginCode,
  resendLoginCode,
  loginWithGoogle,
  signup,
  forgotPassword,
  me,
  clientExportLogo,
  getActivationCheck,
  postActivationComplete,
  redeemCandidatePortalMagic,
  getCandidatePortalMagicCheck,
  postCandidatePortalMagicSetup,
};

