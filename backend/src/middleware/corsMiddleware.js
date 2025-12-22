const cors = require('cors');

/**
 * Builds a CORS middleware with optional origin allowlist.
 * Allows all origins if ALLOWED_ORIGINS is not set.
 */
const corsMiddleware = () => {
  const allowlist = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : null;

  const options = {
    origin: allowlist
      ? (origin, callback) => {
        if (!origin || allowlist.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      }
      : true,
    credentials: true,
  };

  return cors(options);
};

module.exports = corsMiddleware;

