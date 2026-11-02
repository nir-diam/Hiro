/**
 * Server-side image proxy for proposal templates.
 *
 * Problem it solves
 * -----------------
 * Proposal templates (and pasted content) reference images hosted on third-party systems
 * such as `clients.frontask.co.il`. Those hosts send **no** `Access-Control-Allow-Origin`
 * header. In the browser that means:
 *
 *   • `html2canvas({ useCORS: true })` fails the CORS image load and **silently omits the
 *     image** — which is why the stamped signature and the logo vanish from the proposal
 *     PDF preview and from the PDF attachment.
 *   • Many email clients also block hotlinked third-party images.
 *
 * Fetching the bytes server-side and re-serving them from our own origin removes CORS
 * entirely.
 *
 * Why the URL is signed
 * ---------------------
 * `<img src>` requests cannot carry an `Authorization` header, so this endpoint cannot be
 * JWT-protected — an authenticated route would simply 401 and the image would break again.
 * Instead each proxy URL carries an HMAC signature over the target URL, minted by the
 * authenticated client. That keeps the endpoint open (so `<img>` works) while preventing it
 * from being used as an arbitrary open proxy.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — far above any logo/signature asset
const FETCH_TIMEOUT_MS = 12000;

/** Hosts we are willing to proxy. Deliberately narrow. */
const ALLOWED_HOST_SUFFIXES = [
  'frontask.co.il',
  'hiro.co.il',
  'humand.co.il',
  'amazonaws.com',
];

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/svg+xml',
]);

const isAllowedHost = (hostname) => {
  const h = String(hostname || '').toLowerCase();
  if (!h) return false;
  return ALLOWED_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
};

/** Reject IP literals / localhost so the proxy can never reach internal services. */
const isPrivateOrIpHost = (hostname) => {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true; // IPv4 literal
  if (h.startsWith('[') || h.includes(':')) return true; // IPv6 literal
  return false;
};

/** Parse + validate the target URL. Returns null when it must not be fetched. */
const parseTargetUrl = (raw) => {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateOrIpHost(parsed.hostname)) return null;
  if (!isAllowedHost(parsed.hostname)) return null;
  return parsed;
};

const sniffImageType = (buffer, headerType) => {
  const declared = String(headerType || '').split(';')[0].trim().toLowerCase();
  if (ALLOWED_IMAGE_TYPES.has(declared)) return declared;
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
};

/**
 * Rewrite every remote `<img src="http…">` to go through the proxy.
 * Leaves data: URIs and relative paths untouched.
 */
const rewriteRemoteImagesToProxy = (html, apiBase) => {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (!base) return html;
  return String(html ?? '').replace(
    /(<img\b[^>]*?\bsrc=)(["'])(https?:\/\/[^"']+)\2/gi,
    (full, pre, quote, url) => {
      // Only rewrite targets we are willing to fetch; leave anything else untouched.
      if (!parseTargetUrl(url)) return full;
      return `${pre}${quote}${base}/api/media/proxy-image?url=${encodeURIComponent(url)}${quote}`;
    },
  );
};

/** Fetch a remote image as bytes. */
const fetchRemoteImage = async (rawUrl) => {
  const url = parseTargetUrl(rawUrl);
  if (!url) return { ok: false, status: 400, message: 'Blocked or invalid image URL' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'HiroProposalImageProxy/1.0',
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) return { ok: false, status: 502, message: `Upstream responded ${res.status}` };

    const declaredLength = Number(res.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) return { ok: false, status: 413, message: 'Image too large' };

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return { ok: false, status: 502, message: 'Empty image' };
    if (buffer.length > MAX_BYTES) return { ok: false, status: 413, message: 'Image too large' };

    const contentType = sniffImageType(buffer, res.headers.get('content-type'));
    if (!contentType) return { ok: false, status: 415, message: 'Not an image' };

    return { ok: true, buffer, contentType };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      status: aborted ? 504 : 502,
      message: aborted ? 'Image fetch timed out' : `Image fetch failed: ${err?.message || err}`,
    };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  MAX_BYTES,
  isAllowedHost,
  isPrivateOrIpHost,
  parseTargetUrl,
  sniffImageType,
  rewriteRemoteImagesToProxy,
  fetchRemoteImage,
};
