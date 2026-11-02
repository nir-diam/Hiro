/**
 * Addresses that belong to job boards, recruiting portals, or our own CV ingest inbox.
 *
 * They are never a candidate's personal contact and must never be used as an identity key:
 * when a CV has no contact email, the parser/vendor fallback can land on the envelope sender
 * (`alljobs@alljob.co.il`) or on the inbox the mail was forwarded to
 * (`humand+123@app.hiro.co.il`). Using that as `candidates.email` makes the duplicate-identity
 * merge fold unrelated applicants into whichever candidate first stored the same address.
 *
 * Keep this list in sync with `personName.PORTAL_PERSON_NAME_RE` (names) and
 * `cvParseQuality.PORTAL_HOST_RE` (legacy re-export below).
 */

/** Job-board / sourcing-portal host fragments (matched as substrings of the host). */
const SYSTEM_HOST_TOKENS = [
  'alljob', // alljob.co.il + alljobs.co.il + alljobs.com
  'jobmaster',
  'job-master',
  'drushim',
  'gotfriends',
  'ethosia',
  'linkedin',
  'indeed',
  'glassdoor',
  'careerjet',
  'nisha',
  'sql.co.il',
];

/**
 * Product-owned subdomains (application inboxes). The bare apex is intentionally allowed so a
 * real employee applying with their work address is not silently stripped.
 */
const PRODUCT_SUBDOMAIN_SUFFIXES = ['hiro.co.il', 'humand.co.il'];

/** Generic mailbox local parts that never identify a person. */
const SYSTEM_LOCAL_PART_RE =
  /^(?:noreply|no[-_]?reply|donotreply|do[-_]?not[-_]?reply|mailer[-_]?daemon|postmaster|bounce[s]?|mailer|humand|hiro)$/i;

/** Split into local/host, lowercased. Returns null when it is not an address at all. */
const splitEmail = (raw) => {
  const e = String(raw || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0 || at === e.length - 1) return null;
  const local = e.slice(0, at).trim();
  const host = e.slice(at + 1).trim();
  if (!local || !host || !host.includes('.')) return null;
  return { local, host, full: `${local}@${host}` };
};

const isSystemEmailHost = (rawHost) => {
  const host = String(rawHost || '').trim().toLowerCase();
  if (!host) return false;
  if (SYSTEM_HOST_TOKENS.some((token) => host.includes(token))) return true;
  return PRODUCT_SUBDOMAIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  ) && host !== 'hiro.co.il'
    && host !== 'humand.co.il'
    && host !== 'www.hiro.co.il'
    && host !== 'www.humand.co.il';
};

/**
 * True for portal / product-inbox / noreply addresses.
 * @param {string|null|undefined} raw
 */
const isSystemEmail = (raw) => {
  const parts = splitEmail(raw);
  if (!parts) return false;
  if (isSystemEmailHost(parts.host)) return true;
  return SYSTEM_LOCAL_PART_RE.test(parts.local);
};

/**
 * Normalized address, or null when it is a system address (or not an address).
 * Use this anywhere an email is about to become `candidates.email` or an identity key.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
const toCandidateEmail = (raw) => {
  const parts = splitEmail(raw);
  if (!parts) return null;
  if (isSystemEmail(parts.full)) return null;
  return parts.full;
};

module.exports = {
  SYSTEM_HOST_TOKENS,
  PRODUCT_SUBDOMAIN_SUFFIXES,
  isSystemEmail,
  isSystemEmailHost,
  splitEmail,
  toCandidateEmail,
};
