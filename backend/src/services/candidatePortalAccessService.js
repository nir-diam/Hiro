const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Candidate = require('../models/Candidate');
const User = require('../models/User');

const PORTAL_TOKEN_TTL_MS = Number(process.env.CANDIDATE_PORTAL_MAGIC_TTL_MS) || 7 * 24 * 60 * 60 * 1000;

const publicAppOrigin = () =>
  String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://app.hiro.co.il').replace(/\/$/, '');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const maskEmail = (email) => {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return '';
  return e.replace(/(^.).*(@.*$)/, '$1***$2');
};

const findCandidateByPortalToken = async (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token) {
    const err = new Error('Missing magic link token');
    err.status = 400;
    throw err;
  }

  const candidate = await Candidate.findOne({ where: { portalAccessToken: token } });
  if (!candidate) {
    const err = new Error('Invalid or expired magic link');
    err.status = 401;
    throw err;
  }

  if (
    candidate.portalAccessTokenExpiresAt
    && new Date(candidate.portalAccessTokenExpiresAt) < new Date()
  ) {
    await candidate.update({ portalAccessToken: null, portalAccessTokenExpiresAt: null });
    const err = new Error('Magic link expired');
    err.status = 401;
    throw err;
  }

  return candidate;
};

/**
 * Ensure the candidate has a portal user (role=candidate) linked via candidates.user_id.
 * @returns {Promise<import('../models/User')|null>}
 */
const ensurePortalUserForCandidate = async (candidate) => {
  const plain = candidate?.get ? candidate.get({ plain: true }) : candidate;
  if (!plain?.id) return null;

  const email = normalizeEmail(plain.email);
  if (!email || !email.includes('@')) return null;

  let user = plain.userId ? await User.findByPk(plain.userId) : null;
  if (!user) {
    user = await User.findOne({ where: { email } });
  }

  if (user && String(user.role || '').toLowerCase() !== 'candidate') {
    console.warn('[candidatePortalAccess] email belongs to non-candidate user — skip portal link', {
      candidateId: plain.id,
      email,
      role: user.role,
    });
    return null;
  }

  if (!user) {
    const displayName = String(plain.fullName || plain.name || '').trim();
    user = await User.create({
      email,
      password: bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10),
      name: displayName || email,
      role: 'candidate',
      isActive: true,
    });
  }

  if (!plain.userId || String(plain.userId) !== String(user.id)) {
    await Candidate.update({ userId: user.id }, { where: { id: plain.id } });
  }

  return user;
};

/**
 * Create (or refresh) a one-time magic link for the candidate portal profile.
 * @returns {Promise<string>} absolute URL or empty string when unavailable
 */
const createMagicLinkForCandidate = async (candidate) => {
  const plain = candidate?.get ? candidate.get({ plain: true }) : candidate;
  if (!plain?.id) return '';

  const user = await ensurePortalUserForCandidate(plain);
  if (!user) return '';

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS);
  await Candidate.update(
    { portalAccessToken: token, portalAccessTokenExpiresAt: expiresAt },
    { where: { id: plain.id } },
  );

  return `${publicAppOrigin()}/candidate-portal/set-password?magic=${encodeURIComponent(token)}`;
};

/**
 * Validate a portal magic link without consuming it (for the set-password page).
 */
const inspectMagicToken = async (rawToken) => {
  const candidate = await findCandidateByPortalToken(rawToken);
  const user = await ensurePortalUserForCandidate(candidate);
  if (!user) {
    const err = new Error('Unable to open candidate portal for this profile');
    err.status = 403;
    throw err;
  }

  return {
    valid: true,
    email: maskEmail(user.email),
    candidateId: candidate.id,
  };
};

/**
 * Set the candidate portal password via magic link, then issue a JWT session.
 */
const setupPortalPasswordFromMagicToken = async (rawToken, password) => {
  const pwd = String(password || '');
  if (pwd.length < 6) {
    const err = new Error('Password must be at least 6 characters');
    err.status = 400;
    throw err;
  }

  const candidate = await findCandidateByPortalToken(rawToken);
  const user = await ensurePortalUserForCandidate(candidate);
  if (!user) {
    const err = new Error('Unable to open candidate portal for this profile');
    err.status = 403;
    throw err;
  }

  await user.update({
    password: pwd,
    isActive: true,
    activationGuid: null,
  });

  await candidate.update({ portalAccessToken: null, portalAccessTokenExpiresAt: null });

  const { issueToken, loadUserWithClientUsage } = require('./authService');
  const fullUser = await loadUserWithClientUsage(user.id);

  return {
    token: issueToken(fullUser || user),
    user: fullUser || user,
    candidateId: candidate.id,
  };
};

/**
 * Exchange a one-time portal token for a JWT session (legacy — prefer password setup flow).
 */
const redeemMagicToken = async (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token) {
    const err = new Error('Missing magic link token');
    err.status = 400;
    throw err;
  }

  const candidate = await findCandidateByPortalToken(token);
  const user = await ensurePortalUserForCandidate(candidate);
  if (!user) {
    const err = new Error('Unable to open candidate portal for this profile');
    err.status = 403;
    throw err;
  }

  await candidate.update({ portalAccessToken: null, portalAccessTokenExpiresAt: null });

  const { issueToken, loadUserWithClientUsage } = require('./authService');
  const fullUser = await loadUserWithClientUsage(user.id);

  return {
    token: issueToken(fullUser || user),
    user: fullUser || user,
    candidateId: candidate.id,
  };
};

module.exports = {
  publicAppOrigin,
  ensurePortalUserForCandidate,
  createMagicLinkForCandidate,
  inspectMagicToken,
  setupPortalPasswordFromMagicToken,
  redeemMagicToken,
};
