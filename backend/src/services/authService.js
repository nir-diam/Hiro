const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Client = require('../models/Client');
const ClientUsageSetting = require('../models/ClientUsageSetting');
const messageTemplateService = require('./messageTemplateService');
const loginOtpService = require('./loginOtpService');

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const issueToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'change_me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );

/** Only enforced when the client sends an explicit `role` (legacy). Omit role to use DB role. */
const ensureRoleMatches = (user, role) => {
  if (!role) return;
  if (user.role && user.role !== role) {
    const error = new Error('Invalid role for this account');
    error.status = 403;
    throw error;
  }
};

const loadUserWithClientUsage = async (userId) =>
  User.findByPk(userId, {
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        include: [{ model: ClientUsageSetting, as: 'usageSettings', required: false }],
      },
    ],
  });

const login = async ({ email, password, role }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  ensureRoleMatches(user, role);

  const fullUser = await loadUserWithClientUsage(user.id);
  if (!fullUser) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  if (loginOtpService.isDoubleAuthEnabledForUser(fullUser)) {
    await loginOtpService.startEmailOtpForUser(fullUser);
    return { twoFactorRequired: true, email: fullUser.email };
  }

  const token = issueToken(fullUser);
  return { token, user: fullUser };
};

const verifyLoginCode = async ({ email, code, role }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const error = new Error('Invalid or expired code');
    error.status = 401;
    throw error;
  }

  ensureRoleMatches(user, role);

  const result = await loginOtpService.verifyOtp(user.id, String(code || '').trim());
  if (!result.ok) {
    let message = result.message;
    if (result.locked || message === 'CODE_LOCKED') {
      message =
        'הקוד נחסם לאחר הרבה ניסיונות. לחצו על "שלח קוד מחדש" כדי לקבל קוד חדש.';
    } else if (message === 'Invalid code') {
      message = 'קוד שגוי';
    } else if (message === 'Invalid or expired code') {
      message = 'קוד לא תקף או שפג תוקף';
    }
    const error = new Error(message);
    error.status = result.status;
    if (result.locked || result.message === 'CODE_LOCKED') error.code = 'CODE_LOCKED';
    throw error;
  }

  const token = issueToken(user);
  return { token, user };
};

const resendLoginCode = async ({ email, password, role }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  ensureRoleMatches(user, role);

  const fullUser = await loadUserWithClientUsage(user.id);
  if (!fullUser) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  if (!loginOtpService.isDoubleAuthEnabledForUser(fullUser)) {
    const error = new Error('Two-factor authentication is not required for this account');
    error.status = 400;
    throw error;
  }

  await loginOtpService.startEmailOtpForUser(fullUser);
  return { ok: true, email: fullUser.email };
};

const signup = async ({ email, password, name, role }) => {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    const error = new Error('User already exists');
    error.status = 409;
    throw error;
  }

  const resolvedRole = role || 'candidate';
  const user = await User.create({
    email,
    password,
    name: name || email,
    role: resolvedRole,
    isActive: true,
  });

  const token = issueToken(user);

  if (String(resolvedRole).toLowerCase() === 'candidate' && user.email) {
    messageTemplateService.queueCandidateWelcomeEmail({
      email: user.email,
      name: user.name,
      fullName: user.name,
    });
  }

  return { token, user };
};

const loginWithGoogle = async ({ credential, role }) => {
  if (!googleClient) {
    const err = new Error('Google login not configured');
    err.status = 500;
    throw err;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    const error = new Error('Invalid Google credential');
    error.status = 401;
    throw error;
  }

  const email = payload?.email;
  if (!email) {
    const error = new Error('Google credential missing email');
    error.status = 400;
    throw error;
  }

  let user = await User.findOne({ where: { email } });
  if (!user) {
    // Auto-provision basic user; password empty because Google handles auth.
    user = await User.create({
      email,
      password: bcrypt.hashSync(Math.random().toString(36), 10),
      name: payload.name || email,
      role: role || 'recruiter',
      isActive: true,
    });
  } else {
    ensureRoleMatches(user, role);
  }

  const token = issueToken(user);
  return { token, user };
};

module.exports = { login, loginWithGoogle, signup, verifyLoginCode, resendLoginCode };

