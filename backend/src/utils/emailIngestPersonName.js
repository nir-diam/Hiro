const {
  stripCvDocumentTitleFromPersonName,
  sanitizePersonNameFields,
  nameLooksLikeJobHeadline,
  isPlaceholderPersonName,
  isPortalLikePersonName,
} = require('./personName');

const PORTAL_FROM_EMAIL_RE =
  /@(?:alljob\.co\.il|jobmaster\.co\.il|drushim\.co\.il|gotfriends\.co\.il|ethosia\.com|linkedin\.com|indeed\.com)/i;

/** AllJobs: מועמדות חדשה מבראזני סביון למשרת … */
const ALLJOBS_SUBJECT_NAME_RE =
  /מועמד(?:ות|)\s+(?:חדשה\s+)?מ([^,\n]+?)\s+ל(?:משר(?:ה|ת)|עבור)/u;

/** JobMaster-style subject: "Name - 538515" */
const JOBMASTER_SUBJECT_NAME_RE = /^(.+?)\s+[-–—]\s*\d{4,12}\s*$/u;

function isPortalFromEmail(fromEmail) {
  return PORTAL_FROM_EMAIL_RE.test(String(fromEmail || '').trim());
}

function personNameLooksAcceptable(fullName, { minTokens = 2 } = {}) {
  const sanitized = sanitizePersonNameFields({ fullName });
  if (sanitized.cleared || !sanitized.fullName) return false;
  if (isPortalLikePersonName(sanitized.fullName)) return false;
  if (isPlaceholderPersonName(sanitized.fullName)) return false;
  if (nameLooksLikeJobHeadline(sanitized.fullName)) return false;
  const tokens = sanitized.fullName.split(/\s+/).filter(Boolean);
  if (tokens.length < minTokens) return false;
  return true;
}

function normalizeIngestPersonName(raw) {
  const sanitized = sanitizePersonNameFields({ fullName: raw });
  if (sanitized.cleared || !sanitized.fullName) return null;
  if (!personNameLooksAcceptable(sanitized.fullName)) return null;
  return {
    fullName: sanitized.fullName,
    firstName: sanitized.firstName || null,
    lastName: sanitized.lastName || null,
  };
}

function extractNameFromIngestSubject(subject, { recruitmentSourceName } = {}) {
  const text = String(subject || '').trim();
  if (!text) return null;

  let m = text.match(ALLJOBS_SUBJECT_NAME_RE);
  if (m && m[1]) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    const normalized = normalizeIngestPersonName(name);
    if (normalized) return normalized;
  }

  const src = String(recruitmentSourceName || '').toLowerCase();
  if (/jobmaster/i.test(src)) {
    m = text.match(JOBMASTER_SUBJECT_NAME_RE);
    if (m && m[1]) {
      const normalized = normalizeIngestPersonName(m[1].trim());
      if (normalized) return normalized;
    }
  }

  m = text.match(/מועמד(?:ות|)\s+(?:חדשה\s+)?מ([^,\n]+?)(?:\s+ל|\s+עבור|\s*$)/u);
  if (m && m[1]) {
    const normalized = normalizeIngestPersonName(m[1].replace(/\s+/g, ' ').trim());
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Initial stub name for email ingest — never use portal From display names as the person.
 */
function resolveIngestStubFullName({
  fromDisplayName,
  fromEmail,
  subject,
  recruitmentSourceName,
} = {}) {
  const fromName = stripCvDocumentTitleFromPersonName(fromDisplayName);
  const portalEnvelope =
    isPortalFromEmail(fromEmail) || isPortalLikePersonName(fromName);

  if (!portalEnvelope && fromName) {
    const fromHeader = normalizeIngestPersonName(fromName);
    if (fromHeader) return fromHeader.fullName;
  }

  const fromSubject = extractNameFromIngestSubject(subject, { recruitmentSourceName });
  if (fromSubject) return fromSubject.fullName;

  if (!portalEnvelope && fromName) {
    const fromHeader = normalizeIngestPersonName(fromName);
    if (fromHeader) return fromHeader.fullName;
  }

  return 'מועמד חדש';
}

/**
 * After CV parse / enrichment, replace portal-like or missing names using subject + CV hints.
 */
function resolvePostIngestPersonName({
  fullName,
  firstName,
  lastName,
  cvText,
  subject,
  fileLabel,
  recruitmentSourceName,
  nameHints = [],
} = {}) {
  const current = sanitizePersonNameFields({ fullName, firstName, lastName });
  if (personNameLooksAcceptable(current.fullName)) {
    return {
      fullName: current.fullName,
      firstName: current.firstName || null,
      lastName: current.lastName || null,
      source: 'existing',
    };
  }

  const candidates = [
    ...nameHints.filter(Boolean),
    extractNameFromIngestSubject(subject, { recruitmentSourceName })?.fullName,
  ].filter(Boolean);

  for (const hint of candidates) {
    const normalized = normalizeIngestPersonName(hint);
    if (normalized) {
      return { ...normalized, source: 'fallback' };
    }
  }

  return null;
}

function extractNameHintFromResumeFilename(fileLabel) {
  if (!fileLabel) return null;
  let s = String(fileLabel).split(/[/\\]/).pop() || '';
  s = s.replace(/\.[^.]+$/i, '');
  s = s.replace(/^\d+-\d+-of-\d+-/i, '').replace(/^\d+-/i, '');
  const m1 = s.match(/של\s+(.+?)(?:\s+ללא)?$/u);
  if (m1 && m1[1]) {
    const name = m1[1].replace(/קורות\s*חיים/gi, '').trim();
    if (name.length >= 2) return name;
  }
  const m2 = s.match(/קורות\s*חיים\s*[-–]\s*(.+)/u);
  if (m2 && m2[1]) {
    const v = m2[1].trim();
    if (v.length >= 2) return v;
  }
  return null;
}

function extractNameHintFromCvBody(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reName = /^(?:שם|שם מלא|name)\s*[:：]\s*(.+)/i;
  for (const line of lines.slice(0, 55)) {
    const mm = line.match(reName);
    if (mm && mm[1]) {
      const v = mm[1].replace(/\s+/g, ' ').trim();
      if (v.length >= 2 && v.length < 120) return v;
    }
  }
  const reCvDash = /^קורות\s*חיים\s*[-–]\s*(.+)$/i;
  for (const line of lines.slice(0, 8)) {
    const m = line.match(reCvDash);
    if (m && m[1]) {
      const v = m[1].trim();
      if (v.length >= 2 && v.length < 120) return v;
    }
  }
  if (lines[0]) {
    const L = lines[0]
      .replace(/^קו["׳״]?ח\s*[-–]?\s*/i, '')
      .replace(/^קורות\s*חיים\s*[-–]?\s*/i, '')
      .trim();
    if (
      L.length >= 2
      && L.length < 90
      && !/@/.test(L)
      && !/^\d+$/.test(L)
      && !nameLooksLikeJobHeadline(L)
      && !isPortalLikePersonName(L)
    ) {
      return L;
    }
  }
  return null;
}

function collectIngestNameHints(cvText, fileLabel) {
  return [
    extractNameHintFromCvBody(cvText),
    extractNameHintFromResumeFilename(fileLabel),
  ].filter(Boolean);
}

module.exports = {
  isPortalFromEmail,
  extractNameFromIngestSubject,
  resolveIngestStubFullName,
  resolvePostIngestPersonName,
  extractNameHintFromCvBody,
  extractNameHintFromResumeFilename,
  collectIngestNameHints,
  normalizeIngestPersonName,
  personNameLooksAcceptable,
};
