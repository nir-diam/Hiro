const authMiddleware = require('./authMiddleware');
const { getBearerToken } = require('./authMiddleware');

const webhookSecret = () => String(process.env.EMAIL_UPLOAD_WEBHOOK_SECRET || '').trim();

/**
 * POST /api/email-uploads/email-upload — Lambda/S3 notify must send X-Email-Upload-Secret,
 * or a valid staff Bearer JWT for manual retries.
 */
const emailUploadSecretMiddleware = (req, res, next) => {
  const token = getBearerToken(req);
  if (token) return authMiddleware(req, res, next);

  const expected = webhookSecret();
  if (!expected) {
    console.error('[email-upload] EMAIL_UPLOAD_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ message: 'Email upload webhook is not configured' });
  }

  const got = String(
    req.headers['x-email-upload-secret']
    || req.headers['x-hiro-email-upload-secret']
    || '',
  ).trim();

  if (got && got === expected) return next();
  return res.status(401).json({ message: 'Unauthorized' });
};

module.exports = emailUploadSecretMiddleware;
