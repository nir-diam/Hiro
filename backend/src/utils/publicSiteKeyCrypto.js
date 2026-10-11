const crypto = require('crypto');

const KEY_PREFIX_LEN = 8;

const hashSiteKey = (rawKey) =>
  crypto.createHash('sha256').update(String(rawKey || ''), 'utf8').digest('hex');

const keyPrefix = (rawKey) => String(rawKey || '').trim().slice(0, KEY_PREFIX_LEN);

const timingSafeEqualHex = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
};

/** Generate a new site key (plaintext returned once to the admin UI). */
const generateSiteKeyPlaintext = () => crypto.randomBytes(32).toString('base64url');

module.exports = {
  KEY_PREFIX_LEN,
  hashSiteKey,
  keyPrefix,
  timingSafeEqualHex,
  generateSiteKeyPlaintext,
};
