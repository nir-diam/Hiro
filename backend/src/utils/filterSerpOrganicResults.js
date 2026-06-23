/** Host patterns for app stores, video, and other non-official-site results. */
const IRRELEVANT_HOST_PATTERNS = [
  /(^|\.)play\.google\.com$/i,
  /(^|\.)apps\.apple\.com$/i,
  /(^|\.)itunes\.apple\.com$/i,
  /(^|\.)appstore\.com$/i,
  /(^|\.)youtube\.com$/i,
  /^youtu\.be$/i,
  /(^|\.)store\.google\.com$/i,
];

const IRRELEVANT_URL_SUBSTRINGS = [
  'play.google.com',
  'apps.apple.com',
  'itunes.apple.com',
  'youtube.com',
  'youtu.be',
  'store.google.com',
];

const IRRELEVANT_TITLE_PATTERNS = [
  /google\s*play/i,
  /\bapp\s*store\b/i,
  /אפליקציות?\s*ב[-\s]?google\s*play/i,
  /\byoutube\b/i,
];

const extractHostname = (url) => {
  if (!url || typeof url !== 'string') return '';
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const urlLooksIrrelevant = (url) => {
  const lower = String(url).toLowerCase();
  if (IRRELEVANT_URL_SUBSTRINGS.some((part) => lower.includes(part))) return true;
  const host = extractHostname(url);
  return host ? IRRELEVANT_HOST_PATTERNS.some((re) => re.test(host)) : false;
};

const isIrrelevantSerpOrganicResult = (result) => {
  if (!result || typeof result !== 'object') return true;

  const urls = [
    result.link,
    result.redirect_link,
    result.displayed_link,
    result.read_more_link,
  ].filter(Boolean);

  if (urls.some(urlLooksIrrelevant)) return true;

  const source = String(result.source || '');
  if (/google\s*play|app\s*store|youtube/i.test(source)) return true;

  const title = String(result.title || '');
  if (IRRELEVANT_TITLE_PATTERNS.some((re) => re.test(title))) return true;

  return false;
};

/** Drop app-store, YouTube, and similar organic search hits. */
const filterSerpOrganicResults = (results) => {
  if (!Array.isArray(results)) return [];
  return results.filter((row) => !isIrrelevantSerpOrganicResult(row));
};

module.exports = {
  filterSerpOrganicResults,
  isIrrelevantSerpOrganicResult,
};
