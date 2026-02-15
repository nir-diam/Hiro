const authService = require('../services/authService');
const User = require('../models/User');

const login = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { token, user } = await authService.login({ email, password, role });
    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
    });
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ message: err.message || 'Login failed' });
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
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
      user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone },
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
    return res.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone });
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to load user' });
  }
};

module.exports = { login, loginWithGoogle, signup, me };

