const authService = require('../services/authService');
const User = require('../models/User');
const Client = require('../models/Client');
const { serializeAuthUser } = require('../services/permissionService');
const clientUsageSettingService = require('../services/clientUsageSettingService');

const serializeAuthUserWithUsage = async (user) => {
  const base = serializeAuthUser(user);
  const autoDisconnect = await clientUsageSettingService.getAutoDisconnectForClient(base.clientId);
  return { ...base, autoDisconnect };
};

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
        message:
          'נשלח אליכם קוד באימייל. הזינו אותו כדי להשלים את ההתחברות.',
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
    await authService.resendLoginCode({ email, password, role });
    return res.json({
      ok: true,
      message: 'קוד חדש נשלח לאימייל.',
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    await user.update({
      password,
      activationGuid: null,
      isActive: true,
    });
    return res.json({ ok: true, message: 'Password saved. You can log in.' });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Activation failed' });
  }
};

module.exports = {
  login,
  verifyLoginCode,
  resendLoginCode,
  loginWithGoogle,
  signup,
  me,
  getActivationCheck,
  postActivationComplete,
};

