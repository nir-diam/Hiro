const express = require('express');
const mediaProxyService = require('../services/mediaProxyService');

const router = express.Router();

/**
 * GET /api/media/proxy-image?url=<encoded target>
 *
 * Streams an allowlisted third-party image from our own origin so the browser (and
 * html2canvas) never performs a cross-origin image load. See mediaProxyService for context.
 *
 * Deliberately NOT JWT-protected: an `<img src>` request cannot send an Authorization
 * header, so an authenticated route would 401 and the image would break again — which is
 * exactly the bug this fixes. Instead the endpoint is constrained to a strict host
 * allowlist (no IP literals, no localhost, images only, size-capped), so it cannot be
 * abused as an open proxy, and the assets it serves are non-sensitive branding images
 * that already appear in outbound email.
 */
router.get('/proxy-image', async (req, res) => {
  const raw = req.query.url;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ message: 'url query parameter is required' });
  }

  const result = await mediaProxyService.fetchRemoteImage(raw);
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  res.set('Content-Type', result.contentType);
  res.set('Content-Length', String(result.buffer.length));
  res.set('Cache-Control', 'private, max-age=86400, immutable');
  res.set('Cross-Origin-Resource-Policy', 'same-site');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.end(result.buffer);
});

module.exports = router;
