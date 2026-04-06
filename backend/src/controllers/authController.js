const authService = require('../services/authService');
const User = require('../models/User');
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
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json(await serializeAuthUserWithUsage(user));
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to load user' });
  }
};

module.exports = {
  login,
  verifyLoginCode,
  resendLoginCode,
  loginWithGoogle,
  signup,
  me,
};

