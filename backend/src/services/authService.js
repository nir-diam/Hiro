const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const login = async ({ email, password }) => {
  const user = await User.findOne({ email }).lean();
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

  const token = jwt.sign(
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET || 'change_me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' },
  );

  return token;
};

module.exports = { login };

