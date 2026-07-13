const cors = require('cors');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Allow Vite / LAN dev URLs (e.g. http://10.0.0.3:3000) when not in the explicit allowlist. */
const isLocalDevOrigin = (origin) => {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (LOCAL_HOSTS.has(hostname)) return true;
    if (process.env.NODE_ENV === 'production') return false;
    // Private LAN — typical when opening Vite via "Network" URL
    if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
};

/**
 * Builds a CORS middleware with optional origin allowlist.
 * Allows all origins if ALLOWED_ORIGINS is not set.
 */
const corsMiddleware = () => {
  const allowlist = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : null;

  const options = {
    origin: allowlist
      ? (origin, callback) => {
        if (!origin || allowlist.includes(origin) || isLocalDevOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      }
      : true,
    credentials: true,
  };

  return cors(options);
};

module.exports = corsMiddleware;
