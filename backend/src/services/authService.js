const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const issueToken = (user) =>
  jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'change_me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );

const ensureRoleMatches = (user, role) => {
  if (role && user.role && user.role !== role) {
    const error = new Error('Invalid role for this account');
    error.status = 403;
    throw error;
  }
};

const login = async ({ email, password, role }) => {
  const user = await User.findOne({ where: { email } });
  if (!user) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  ensureRoleMatches(user, role);

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    const error = new Error('Invalid credentials');
    error.status = 401;
    throw error;
  }

  const token = issueToken(user);

  return { token, user };
};

const signup = async ({ email, password, name, role }) => {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    const error = new Error('User already exists');
    error.status = 409;
    throw error;
  }

  const user = await User.create({
    email,
    password,
    name: name || email,
    role: role || 'candidate',
    isActive: true,
  });

  const token = issueToken(user);
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

module.exports = { login, loginWithGoogle, signup };

