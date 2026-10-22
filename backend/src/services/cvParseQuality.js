const {
  sanitizePersonNameFields,
  nameLooksLikeCvDocumentTitle,
  nameLooksLikeJobHeadline,
  isPlaceholderPersonName,
  isSplitCvDocumentTitle,
} = require('../utils/personName');

/** Panel option "Gemini 3 Pro". Used only when a Flash parse fails the quality check. */
const CV_PARSE_PRO_MODEL = 'gemini-3.1-pro-preview';

/** Recruiter-facing badge. Stored on candidate.internalTags. */
const CV_REVIEW_TAG = 'לבדוק קו"ח';

/** Set together with the badge when a parse is still incomplete after one retry. */
const CV_PARTIAL_TAG = 'פרסור חלקי';

/** Below this, a PDF text layer is treated as a scan / empty extract and the file goes to the model. */
const THIN_RESUME_TEXT_CHARS = 400;

const PORTAL_HOST_RE = /(jobmaster|alljobs|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|sql\.co\.il|nisha)/i;
const BORING_LOCAL_RE = /^(?:noreply|no-reply|no_reply|donotreply|mailer-daemon|jobs?|cv|resume|mailer)$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+972[\s\-]?|972[\s\-]?|0)(?:5\d|[23489]\d|7\d)[\s\-]?\d{3}[\s\-]?\d{4}/g;

function resolveGeminiModelName(model, fallback = null) {
  const raw = String(model || fallback || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(raw)) return fallback;
  if (raw === 'gemini-3-flash-preview') return 'gemini-3.8-flash';
  if (raw === 'gemini-3-pro-preview') return 'gemini-3.1-pro-preview';
  return raw;
}

function isProParseModel(model) {
  return /pro/i.test(String(model || ''));
}

function experienceEntries(workExperience) {
  if (!Array.isArray(workExperience)) return [];
  return workExperience.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    return Boolean(
      String(entry.title || '').trim()
      || String(entry.company || '').trim()
      || String(entry.description || '').trim(),
    );
  });
}

function tagCountOf(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean).length;
  const n = Number(tags);
  return Number.isFinite(n) ? n : 0;
}

function hasContact(email, phone) {
  const mail = String(email || '').includes('@');
  const digits = String(phone || '').replace(/\D/g, '');
  return mail || digits.length >= 9;
}

const PORTAL_PERSON_NAME_RE = /^(?:jobmaster|alljobs|drushim|gotfriends|ethosia|linkedin|indeed|glassdoor|careerjet|דרושים|all jobs)$/i;

function suspiciousName({ fullName, firstName, lastName, email }) {
  const sanitized = sanitizePersonNameFields({ fullName, firstName, lastName });
  if (sanitized.cleared) return true;
  if (!sanitized.fullName || isPlaceholderPersonName(sanitized.fullName)) return true;
  const raw = [fullName, firstName, lastName].filter(Boolean).join(' ');
  if (nameLooksLikeCvDocumentTitle(raw) && sanitized.fullName === '') return true;
  if (isSplitCvDocumentTitle(firstName, lastName) && !sanitized.fullName) return true;
  if (nameLooksLikeJobHeadline(sanitized.fullName)) return true;
  const tokens = sanitized.fullName.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return true;
  if (PORTAL_PERSON_NAME_RE.test(sanitized.fullName)) return true;
  const local = String(email || '').split('@')[0].trim().toLowerCase();
  if (local && sanitized.fullName.toLowerCase() === local) return true;
  return false;
}

/** Rows returned by tag sync include pending catalog links. The list only shows active ones. */
function activeTagCount(rows) {
  if (typeof rows === 'number') return tagCountOf(rows);
  if (!Array.isArray(rows)) return 0;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return Boolean(row);
    const flag = row.is_active ?? row.isActive;
    return flag !== false && flag !== 0 && flag !== 'false';
  }).length;
}

/**
 * Quality gate after a parse. Partial when experience, tags, contact, or the name failed.
 * `stage` is the first broken step: file_to_text | text_to_model | model_to_profile | post_parse_tags.
 */
function assessCvParseQuality({
  fullName,
  firstName,
  lastName,
  email,
  phone,
  workExperience,
  tags,
  tagCount,
  extractedTextLength = null,
  hasResumeFile = true,
} = {}) {
  const reasons = [];
  const exp = experienceEntries(workExperience);
  const tagsN = tagCount != null ? tagCountOf(tagCount) : tagCountOf(tags);
  if (suspiciousName({ fullName, firstName, lastName, email })) reasons.push('suspicious_name');
  if (!exp.length) reasons.push('no_experience');
  if (!tagsN) reasons.push('no_tags');
  if (!hasContact(email, phone)) reasons.push('no_contact');

  const textLen = extractedTextLength == null ? null : Number(extractedTextLength) || 0;
  let stage = 'ok';
  if (!hasResumeFile) stage = 'file_to_text';
  else if (textLen != null && textLen < 80) stage = 'file_to_text';
  else if (reasons.includes('no_experience')) stage = 'text_to_model';
  else if (reasons.includes('no_tags') && exp.length) stage = 'post_parse_tags';
  else if (reasons.length) stage = 'model_to_profile';

  return {
    partial: reasons.length > 0,
    reasons,
    stage: reasons.length ? stage : 'ok',
  };
}

function assessFromAiResult(ai, { extractedTextLength = null, hasResumeFile = true } = {}) {
  const src = ai && typeof ai === 'object' ? ai : {};
  return assessCvParseQuality({
    fullName: src.fullName,
    firstName: src.firstName,
    lastName: src.lastName,
    email: src.email,
    phone: src.phone,
    workExperience: src.workExperience,
    tags: src.tags,
    extractedTextLength,
    hasResumeFile,
  });
}

function parsedCvScore(ai) {
  if (!ai || typeof ai !== 'object') return 0;
  let score = 0;
  score += Math.min(experienceEntries(ai.workExperience).length, 8) * 10;
  score += Math.min(tagCountOf(ai.tags), 12) * 3;
  if (String(ai.email || '').includes('@')) score += 8;
  if (String(ai.phone || '').replace(/\D/g, '').length >= 9) score += 8;
  const name = sanitizePersonNameFields({
    fullName: ai.fullName,
    firstName: ai.firstName,
    lastName: ai.lastName,
  });
  if (name.fullName && !isPlaceholderPersonName(name.fullName)) score += 6;
  if (String(ai.title || '').trim()) score += 2;
  return score;
}

/**
 * One Pro retry when the configured model is not already Pro and the parse is partial.
 * `parseWithModel({ resumeText, fileNameHint, model })` performs the second call.
 */
async function maybeUpgradeParseWithPro(ai, {
  resumeText,
  fileNameHint = null,
  modelUsed = null,
  parseWithModel,
} = {}) {
  const text = String(resumeText || '');
  const quality = assessFromAiResult(ai, { extractedTextLength: text.trim().length });
  const base = { ai: ai && typeof ai === 'object' ? ai : {}, quality, retriedWithPro: false, model: modelUsed || null };
  if (!quality.partial || isProParseModel(modelUsed)) return base;
  if (!text.trim() || typeof parseWithModel !== 'function') return base;
  console.log('[cv-parse] partial quality, one Pro retry', {
    reasons: quality.reasons,
    stage: quality.stage,
    modelUsed: modelUsed || null,
  });
  let proAi = null;
  try {
    proAi = await parseWithModel({
      resumeText: text,
      fileNameHint,
      model: CV_PARSE_PRO_MODEL,
    });
  } catch (err) {
    console.warn('[cv-parse] Pro retry failed', err?.message || err);
    return { ...base, retriedWithPro: true };
  }
  if (parsedCvScore(proAi) > parsedCvScore(ai)) {
    return {
      ai: proAi,
      quality: assessFromAiResult(proAi, { extractedTextLength: text.trim().length }),
      retriedWithPro: true,
      model: CV_PARSE_PRO_MODEL,
    };
  }
  return { ...base, retriedWithPro: true };
}

function isUsableContactEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return false;
  const [local, host] = e.split('@');
  if (!local || !host) return false;
  if (BORING_LOCAL_RE.test(local)) return false;
  if (PORTAL_HOST_RE.test(host)) return false;
  if (host.endsWith('.example.com') || host === 'example.com') return false;
  return true;
}

function normalizeIsraeliPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (d.length < 9 || d.length > 11) return null;
  return d;
}

/**
 * Contact that was not in the CV file: email body first, then a personal sender.
 * Portal / noreply addresses (JobMaster and similar) are skipped.
 */
function extractContactFromInboundMessage({ body, fromEmail, html } = {}) {
  const text = `${String(body || '')}\n${String(html || '').replace(/<[^>]+>/g, ' ')}`;
  const emails = [];
  const emailRe = new RegExp(EMAIL_RE.source, 'g');
  let match;
  while ((match = emailRe.exec(text)) && emails.length < 6) {
    const found = match[0].toLowerCase();
    if (isUsableContactEmail(found) && !emails.includes(found)) emails.push(found);
  }
  const phones = [];
  const phoneRe = new RegExp(PHONE_RE.source, 'g');
  while ((match = phoneRe.exec(text)) && phones.length < 6) {
    const phone = normalizeIsraeliPhone(match[0]);
    if (phone && !phones.includes(phone)) phones.push(phone);
  }
  let email = emails[0] || null;
  if (!email && isUsableContactEmail(fromEmail)) email = String(fromEmail).trim().toLowerCase();
  return { email, phone: phones[0] || null };
}

function applyInboundContact(fields, inbound) {
  const out = fields && typeof fields === 'object' ? { ...fields } : {};
  if (!inbound) return out;
  if (!String(out.email || '').includes('@') && inbound.email) out.email = inbound.email;
  if (String(out.phone || '').replace(/\D/g, '').length < 9 && inbound.phone) out.phone = inbound.phone;
  return out;
}

function roleTagsFromExperience(workExperience) {
  const out = [];
  const seen = new Set();
  for (const exp of experienceEntries(workExperience)) {
    const title = String(exp.title || '').trim();
    if (!title || title === 'ניסיון תעסוקתי') continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const end = String(exp.endDate || '');
    out.push({
      name: title,
      evidence: title,
      quote: title,
      raw_type: 'role',
      context: 'Core',
      tag_reason: 'תפקיד מניסיון תעסוקתי',
      is_current: !end || /present|היום|נוכחי/i.test(end),
      confidence_score: 0.6,
    });
  }
  return out;
}

function withCvReviewTags(existing, { partial }) {
  const tags = [];
  const seen = new Set();
  for (const tag of Array.isArray(existing) ? existing : []) {
    const value = String(tag || '').trim();
    if (!value || value === CV_REVIEW_TAG || value === CV_PARTIAL_TAG) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(value);
  }
  if (partial) {
    tags.push(CV_PARTIAL_TAG, CV_REVIEW_TAG);
  }
  return tags;
}

module.exports = {
  CV_PARSE_PRO_MODEL,
  CV_REVIEW_TAG,
  CV_PARTIAL_TAG,
  THIN_RESUME_TEXT_CHARS,
  resolveGeminiModelName,
  isProParseModel,
  assessCvParseQuality,
  assessFromAiResult,
  parsedCvScore,
  maybeUpgradeParseWithPro,
  extractContactFromInboundMessage,
  applyInboundContact,
  isUsableContactEmail,
  roleTagsFromExperience,
  withCvReviewTags,
  experienceEntries,
  activeTagCount,
};
