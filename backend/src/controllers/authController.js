const authService = require('../services/authService');

const login = async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const { token, user } = await authService.login({ email, password, role });
    return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
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
    return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
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
    return res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    const status = err?.status || 400;
    return res.status(status).json({ message: err.message || 'Signup failed' });
  }
};

module.exports = { login, loginWithGoogle, signup };

