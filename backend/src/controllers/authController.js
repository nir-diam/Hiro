const authService = require('../services/authService');

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const token = await authService.login({ email, password });
    return res.json({ token });
  } catch (err) {
    const status = err?.status || 401;
    return res.status(status).json({ message: err.message || 'Login failed' });
  }
};

module.exports = { login };

