const { isVideoQuestion } = require('./publicJobCatalog');

const MAX_CV_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 8 * 1024 * 1024;
const DEFAULT_PHONE_LIMIT = 5;
const DEFAULT_IP_LIMIT = 30;
const WINDOW_MS = 60 * 60 * 1000;

const buckets = new Map();

const resetApplyRateLimit = () => buckets.clear();

const prune = (list, now) => list.filter((ts) => now - ts < WINDOW_MS);

const hitRateLimit = ({ ip, phone, now = Date.now(), phoneLimit = DEFAULT_PHONE_LIMIT, ipLimit = DEFAULT_IP_LIMIT } = {}) => {
  const checks = [];
  if (phone) checks.push([`phone:${phone}`, phoneLimit]);
  if (ip) checks.push([`ip:${ip}`, ipLimit]);
  for (const [key, limit] of checks) {
    const recent = prune(buckets.get(key) || [], now);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return true;
    }
  }
  for (const [key] of checks) {
    const recent = prune(buckets.get(key) || [], now);
    recent.push(now);
    buckets.set(key, recent);
  }
  return false;
};

const clientIp = (headerValue) => {
  const raw = String(headerValue || '').split(',')[0].trim();
  return raw || null;
};

const validationError = (field, message) => {
  const err = new Error(message);
  err.status = 422;
  err.code = 'VALIDATION';
  err.field = field;
  return err;
};

const toIsraeliPhone = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 9) return null;
  return `0${digits}`;
};

const detectCvKind = (buffer) => {
  if (!buffer || buffer.length < 4) return null;
  if (buffer.slice(0, 4).toString('utf8') === '%PDF') return 'pdf';
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return 'doc';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx';
  return null;
};

const validatePublicApplication = (body = {}) => {
  if (String(body.hp || body.company_url || '').trim()) {
    throw validationError('hp', 'Rejected');
  }
  const fullName = String(body.fullName || `${body.firstName || ''} ${body.lastName || ''}`).trim();
  if (!fullName) throw validationError('fullName', 'fullName is required');

  const phone = toIsraeliPhone(body.phone);
  if (!phone) throw validationError('phone', 'phone must be an Israeli phone number');

  const email = String(body.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validationError('email', 'email is invalid');
  }

  const consentRaw = body.consent;
  const consent =
    consentRaw && typeof consentRaw === 'object'
      ? consentRaw
      : { accepted: consentRaw === true, policyVersion: body.policyVersion || body.consentPolicyVersion || null, policyUrl: body.policyUrl || null };
  const accepted = consent.accepted === true || consent.accepted === 'true';
  const policyVersion = String(consent.policyVersion || consent.version || '').trim();
  const policyUrl = String(consent.policyUrl || consent.url || '').trim();
  if (!accepted || (!policyVersion && !policyUrl)) {
    throw validationError('consent', 'consent must include acceptance and the policy version');
  }

  const optInsRaw = body.optIns && typeof body.optIns === 'object' ? body.optIns : {};
  const optIns = {
    otherJobs: optInsRaw.otherJobs === true,
    candidatePool: optInsRaw.candidatePool === true,
  };

  let cv = null;
  if (body.cvFile && Buffer.isBuffer(body.cvFile.buffer)) {
    cv = cvFromBuffer(body.cvFile.buffer, body.cvFile.filename);
  }
  const b64 = body.cv?.contentBase64 || body.resumeBase64;
  if (!cv && b64) {
    const cleaned = String(b64).replace(/^data:[^;]+;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(cleaned, 'base64');
    } catch {
      throw validationError('cv', 'cv is not valid base64');
    }
    cv = cvFromBuffer(buffer, body.cv?.filename || body.resumeFilename);
  }

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : body.screeningAnswers || {};
  const utm = body.utm && typeof body.utm === 'object'
    ? {
        utm_source: body.utm.utm_source || null,
        utm_medium: body.utm.utm_medium || null,
        utm_campaign: body.utm.utm_campaign || null,
      }
    : {};

  return {
    fullName,
    phone,
    email: email || null,
    cv,
    answers,
    consent: { accepted: true, policyVersion: policyVersion || null, policyUrl: policyUrl || null },
    optIns,
    utm,
  };
};

const cvFromBuffer = (buffer, filenameHint) => {
  if (!buffer.length || buffer.length > MAX_CV_BYTES) {
    throw validationError('cv', 'cv must be a PDF, DOC, or DOCX up to 5MB');
  }
  const kind = detectCvKind(buffer);
  if (!kind) throw validationError('cv', 'cv must be a PDF, DOC, or DOCX');
  const filename = String(filenameHint || `cv.${kind === 'docx' ? 'docx' : kind}`).slice(0, 180);
  const mimeType = kind === 'pdf'
    ? 'application/pdf'
    : kind === 'doc'
      ? 'application/msword'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return { contentBase64: buffer.toString('base64'), filename, mimeType };
};

const parseMaybeJson = (value) => {
  const text = String(value || '').trim();
  if (!text || !/^[{\[]/.test(text)) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
};

const headerValue = (header, key) => {
  const match = header.match(new RegExp(`(?:^|[;\\s])${key}="([^"]*)"|(?:^|[;\\s])${key}=([^;\\s]+)`, 'i'));
  if (!match) return '';
  return String(match[1] != null ? match[1] : match[2] || '').trim();
};

const parseMultipartFields = (buffer, boundary) => {
  const delim = Buffer.from(`--${boundary}`);
  const fields = {};
  let cursor = buffer.indexOf(delim);
  if (cursor < 0) throw validationError('cv', 'multipart body is invalid');
  while (cursor !== -1) {
    let partStart = cursor + delim.length;
    if (buffer.slice(partStart, partStart + 2).toString('utf8') === '--') break;
    if (buffer[partStart] === 13 && buffer[partStart + 1] === 10) partStart += 2;
    else if (buffer[partStart] === 10) partStart += 1;
    const next = buffer.indexOf(delim, partStart);
    if (next < 0) break;
    let partEnd = next;
    if (partEnd >= 2 && buffer[partEnd - 2] === 13 && buffer[partEnd - 1] === 10) partEnd -= 2;
    else if (partEnd >= 1 && buffer[partEnd - 1] === 10) partEnd -= 1;
    const part = buffer.slice(partStart, partEnd);
    const splitAt = part.indexOf('\r\n\r\n');
    const split = splitAt >= 0 ? splitAt : part.indexOf('\n\n');
    const sep = splitAt >= 0 ? 4 : 2;
    if (split < 0) {
      cursor = next;
      continue;
    }
    const header = part.slice(0, split).toString('utf8');
    const content = part.slice(split + sep);
    const name = headerValue(header, 'name');
    if (!name) {
      cursor = next;
      continue;
    }
    const filename = headerValue(header, 'filename');
    if (filename || name === 'cv') {
      fields.cvFile = { buffer: content, filename: filename || 'cv' };
    } else {
      fields[name] = parseMaybeJson(content.toString('utf8'));
    }
    cursor = next;
  }
  return fields;
};

const readRequestBuffer = (req, limit = MAX_MULTIPART_BYTES) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  const fail = (err) => {
    req.destroy();
    reject(err);
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) {
      fail(validationError('cv', 'cv must be a PDF, DOC, or DOCX up to 5MB'));
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const readMultipartApplication = async (req) => {
  const contentType = String(req.headers['content-type'] || '');
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = String(match?.[1] || match?.[2] || '').trim();
  if (!boundary) throw validationError('cv', 'multipart body is invalid');
  const raw = await readRequestBuffer(req);
  return parseMultipartFields(raw, boundary);
};

const assertScreeningAnswers = (questions, answers) => {
  const list = Array.isArray(questions) ? questions : [];
  for (const question of list) {
    if (!question || question.isPublished === false) continue;
    if (isVideoQuestion(question)) continue;
    if (!question.isMandatory && question.required !== true) continue;
    const id = String(question.id);
    const answer = answers?.[id];
    if (answer == null || String(answer).trim() === '') {
      throw validationError('answers', `Missing answer for ${id}`);
    }
  }
};

module.exports = {
  MAX_CV_BYTES,
  MAX_MULTIPART_BYTES,
  resetApplyRateLimit,
  hitRateLimit,
  clientIp,
  validationError,
  toIsraeliPhone,
  detectCvKind,
  validatePublicApplication,
  parseMultipartFields,
  readMultipartApplication,
  assertScreeningAnswers,
};
