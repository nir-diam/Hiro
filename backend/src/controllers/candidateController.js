const path = require('path');
const jwt = require('jsonwebtoken');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const candidateService = require('../services/candidateService');
const { embedCandidateAndSave, searchCandidates, buildSearchDocument, cosineSimilarity, normalizeEmbedding } = require('../services/vectorSearchService');
const { embedText } = require('../services/embeddingService');
const { sendChat, sendSingleTurnChat } = require('../services/geminiService');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const jobCandidateService = require('../services/jobCandidateService');
const { sequelize } = require('../config/db');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

const isMissing = (v) => v === undefined || v === null || v === '';

const valuesDiffer = (a, b) => {
  if (isMissing(a) && isMissing(b)) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
    } catch {
      return a !== b;
    }
  }
  return String(a ?? '') !== String(b ?? '');
};

/** Until DB migration runs (add_job_candidate_screening_rejection.sql), skip rejection columns */
let screeningRejectionColumnsCache = null;

function dbErrorText(err) {
  if (!err) return '';
  const parts = [];
  const seen = new Set();
  let e = err;
  while (e && !seen.has(e)) {
    seen.add(e);
    if (typeof e.message === 'string' && e.message) parts.push(e.message);
    e = e.parent || e.original;
  }
  return parts.join(' ');
}

function isMissingScreeningRejectionColumnError(err) {
  const msg = dbErrorText(err);
  const code = err && (err.parent?.code || err.original?.code || err.code);
  if (code === '42703' && /screeningStatus|rejectionReason|rejectionNotes/i.test(msg)) return true;
  if (!/does not exist/i.test(msg)) return false;
  return /screeningStatus|rejectionReason|rejectionNotes/i.test(msg);
}

async function jobCandidateScreeningHasRejectionColumns(options = {}) {
  const { forceRefresh = false } = options;
  if (!forceRefresh && screeningRejectionColumnsCache !== null) return screeningRejectionColumnsCache;
  try {
    if (sequelize.getDialect() !== 'postgres') {
      screeningRejectionColumnsCache = false;
      return screeningRejectionColumnsCache;
    }
    const [rows] = await sequelize.query(
      `SELECT COALESCE((
        SELECT COUNT(DISTINCT a.attname)::int
        FROM pg_attribute a
        INNER JOIN pg_class c ON c.oid = a.attrelid
        INNER JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relname = 'job_candidate_screening'
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname IN ('screeningStatus', 'rejectionReason', 'rejectionNotes')
      ), 0) AS cnt`,
    );
    const cnt = rows && rows[0] != null ? Number(rows[0].cnt) : 0;
    screeningRejectionColumnsCache = cnt === 3;
  } catch (e) {
    console.warn('[jobCandidateScreeningHasRejectionColumns]', e.message);
    screeningRejectionColumnsCache = false;
  }
  return screeningRejectionColumnsCache;
}
const organizationService = require('../services/organizationService');
const candidateCompletenessService = require('../services/candidateCompletenessService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const candidateTagService = require('../services/candidateTagService');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

/** Detect PDF by magic bytes (do not treat as UTF-8 text). */
const isPdfMagicBuffer = (buf) =>
  Boolean(buf && buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-');

/**
 * If "extracted text" starts like a PDF header, we fed raw bytes as a string — LLM will invent a profile.
 * See createFromAi / extractFromBuffer (pdf-parse often returns nothing for scanned/image PDFs).
 */
const looksLikeRawPdfUtf8String = (s) => Boolean(s && typeof s === 'string' && s.trimStart().startsWith('%PDF'));

/** Decode client `fileBase64`: strip `data:*;base64,` and whitespace (common in browsers / copy-paste). */
const decodeFileBase64Payload = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let s = raw.trim();
  const m = /^data:[^;]*;base64\s*,\s*(.*)$/is.exec(s);
  if (m) s = m[1];
  s = s.replace(/\s/g, '');
  if (!s) return null;
  const buf = Buffer.from(s, 'base64');
  return buf.length ? buf : null;
};

const { createS3Client, buildPublicUrl } = require('../services/s3Service');
const messageTemplateService = require('../services/messageTemplateService');

const getBearerTokenFromRequest = (req) => {
  const raw =
    (typeof req.get === 'function' && req.get('Authorization')) ||
    req.headers?.authorization ||
    req.headers?.Authorization ||
    '';
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('bearer ')) return s.slice(7).trim();
  return s;
};

/**
 * Tenant UUID for client-scoped welcome templates when staff is authenticated.
 * Returns null if no/invalid JWT, user missing, or user has no clientId — in those cases
 * `queueCandidateWelcomeEmail` uses the admin template catalog (see messageTemplateService).
 */
const getStaffClientIdFromRequest = async (req) => {
  const token = getBearerTokenFromRequest(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_me');
    const userId = decoded.sub;
    if (!userId) return null;
    const user = await User.findByPk(userId, { attributes: ['clientId'] });
    return user?.clientId || null;
  } catch (err) {
    return null;
  }
};

const extractTextFromImageBuffer = async (buffer) => {
  const worker = await createWorker('eng+heb');
  try {
    const { data } = await worker.recognize(buffer);
    return data?.text?.trim() || '';
  } catch (err) {
    console.error('[embed-ocr-error]', err.message || err);
    return '';
  } finally {
    await worker.terminate();
  }
};

const PDF_OCR_MAX_PAGES = 5;
const PDF_OCR_RENDER_SCALE = 2.0;
const PDF_OCR_MAX_EDGE_PX = 2400;
/**
 * If pdf-parse returns at least this many chars, we skip render+OCR (real text-layer CVs are usually much longer).
 * Below this we still run OCR and take the longer result so metadata-only strings do not mask scans.
 */
const PDF_TEXT_MIN_TO_SKIP_OCR = 800;
const MIN_JPEG_OCR_BYTES = 2000;

let _pdfjsLibCache = null;
let _nodeCanvasShimForPdfjsInstalled = false;
/** PDF.js `require('canvas')` for Node polyfills; map to @napi-rs/canvas (prebuilt on Windows/Node 22). */
const shimNodeCanvasForPdfjs = () => {
  if (_nodeCanvasShimForPdfjsInstalled) return;
  const Module = require('module');
  const napi = require('@napi-rs/canvas');
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'canvas') return napi;
    return origLoad.apply(this, arguments);
  };
  _nodeCanvasShimForPdfjsInstalled = true;
};

const getPdfjsLib = () => {
  if (_pdfjsLibCache) return _pdfjsLibCache;
  shimNodeCanvasForPdfjs();
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  _pdfjsLibCache = pdfjsLib;
  return pdfjsLib;
};

/**
 * Renders the first N PDF pages to PNG buffers for Tesseract (scanned / image-only PDFs).
 * Uses @napi-rs/canvas (prebuilt) instead of node-canvas.
 */
const renderPdfPagesToPngBuffers = async (buffer) => {
  const pdfjsLib = getPdfjsLib();
  const { createCanvas } = require('@napi-rs/canvas');
  const raw = buffer instanceof Uint8Array ? buffer : Buffer.from(buffer);
  const u8 = new Uint8Array(raw);
  const doc = await pdfjsLib.getDocument({
    data: u8,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const totalPages = doc.numPages || 0;
  const n = Math.min(totalPages, PDF_OCR_MAX_PAGES);
  if (!n) {
    console.warn('[pdf-render] document has no pages', { totalPages });
    return [];
  }
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    try {
      const page = await doc.getPage(i);
      let viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE });
      const w = viewport.width;
      const h = viewport.height;
      const maxE = Math.max(w, h);
      if (maxE > PDF_OCR_MAX_EDGE_PX) {
        const s = PDF_OCR_MAX_EDGE_PX / maxE;
        viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE * s });
      }
      const cw = Math.ceil(viewport.width);
      const ch = Math.ceil(viewport.height);
      const canvas = createCanvas(cw, ch);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      await page.render({
        canvasContext: ctx,
        viewport,
        background: '#ffffff',
      }).promise;
      // eslint-disable-next-line no-await-in-loop
      out.push(await canvas.encode('png'));
    } catch (pageErr) {
      console.error(`[pdf-render-page-${i}]`, pageErr.message || pageErr);
    }
  }
  return out;
};

/** OCR several image buffers; try eng+heb first, then eng if the result is empty (Hebrew pack can fail offline). */
const ocrImageBuffersWithSharedWorker = async (buffers) => {
  if (!buffers || !buffers.length) return '';
  const runWithLang = async (langs) => {
    const worker = await createWorker(langs);
    try {
      const parts = [];
      for (let i = 0; i < buffers.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await worker.recognize(buffers[i]);
        const t = (data?.text || '').trim();
        if (t) parts.push(t);
      }
      return parts.join('\n\n').trim();
    } finally {
      await worker.terminate();
    }
  };
  try {
    let text = await runWithLang('eng+heb');
    if (!text) {
      text = await runWithLang('eng');
    }
    return text;
  } catch (err) {
    console.error('[pdf-ocr-error]', err.message || err);
    return '';
  }
};

/**
 * For PDFs with no text layer, render pages to images and run OCR.
 */
/**
 * Scanned apps often store page bitmaps as raw JPEG bitstreams; those may be visible without inflating XObjects.
 * Best-effort: collect larger JPEGs (ignore tiny UI icons).
 */
const extractJpegBuffersFromBinary = (buf) => {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const found = [];
  let i = 0;
  while (i < u8.length - 2) {
    if (u8[i] !== 0xff || u8[i + 1] !== 0xd8 || u8[i + 2] !== 0xff) {
      i += 1;
      continue;
    }
    const start = i;
    let j = i + 2;
    let end = -1;
    for (; j < u8.length - 1; j += 1) {
      if (u8[j] === 0xff && u8[j + 1] === 0xd9) {
        end = j + 2;
        break;
      }
    }
    if (end > start && end - start >= MIN_JPEG_OCR_BYTES) {
      found.push(Buffer.from(u8.subarray(start, end)));
      i = end;
    } else {
      i += 1;
    }
  }
  found.sort((a, b) => b.length - a.length);
  return found.slice(0, 5);
};

const extractTextFromScannedPdfBuffer = async (buffer) => {
  let fromRender = '';
  let pngs = [];
  try {
    pngs = await renderPdfPagesToPngBuffers(buffer);
    if (pngs.length) {
      fromRender = (await ocrImageBuffersWithSharedWorker(pngs)).trim();
    }
  } catch (err) {
    console.error('[scanned-pdf-ocr]', err.message || err);
  }
  if (fromRender.length >= 30) return fromRender;
  let jpegs = [];
  try {
    jpegs = extractJpegBuffersFromBinary(buffer);
    if (jpegs.length) {
      const fromJpeg = (await ocrImageBuffersWithSharedWorker(jpegs)).trim();
      if (fromJpeg.length > fromRender.length) return fromJpeg;
      if (fromJpeg) return fromJpeg;
    }
  } catch (err) {
    console.error('[jpeg-embedded-ocr]', err.message || err);
  }
  if (!fromRender && !pngs.length) {
    console.warn('[pdf-ocr] no PNGs rendered and no embedded large JPEGs', {
      bufLen: buffer.length,
    });
  } else if (!fromRender && pngs.length) {
    console.warn('[pdf-ocr] Tesseract returned empty for rendered page images', { pages: pngs.length });
  }
  return fromRender;
};

/** Text layer from pdf-parse; if too short, render pages and OCR (image-only / scanned PDFs). */
const extractTextFromPdfBuffer = async (buffer) => {
  let fromParse = '';
  try {
    const resPdf = await pdfParse(buffer);
    fromParse = (resPdf.text && String(resPdf.text).trim()) || '';
  } catch (e) {
    console.log('[embed-parse-pdf-error]', e.message || e);
  }
  if (fromParse.length >= PDF_TEXT_MIN_TO_SKIP_OCR) return fromParse;
  let fromOcr = '';
  try {
    fromOcr = await extractTextFromScannedPdfBuffer(buffer);
  } catch (e) {
    console.log('[scanned-pdf-ocr-fallback-error]', e.message || e);
  }
  if (fromOcr.length > fromParse.length) return fromOcr;
  if (fromOcr) return fromOcr;
  if (fromParse) return fromParse;
  if (!fromOcr && !fromParse) {
    console.warn('[pdf-extract-empty]', {
      byteLength: buffer.length,
      headAscii: buffer.slice(0, Math.min(12, buffer.length)).toString('latin1'),
    });
  }
  return '';
};

// Best-effort embedding wrapper so we don't block main response
const tryEmbedCandidate = async (candidateId, extraText = '') => {
  if (!candidateId) return;
  try {
    await embedCandidateAndSave(candidateId, extraText);
  } catch (err) {
    // Swallow errors to avoid breaking main flow; log for observability
    console.error('Embedding failed for candidate', candidateId, err.message || err);
  }
};

const requiredS3Env = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];

// --- AI CV parsing (Gemini) ---
/**
 * Salvage a truncated JSON document by:
 *  - dropping anything before the first `{` or `[`
 *  - closing an unterminated string
 *  - trimming any partial token after the last completed value
 *  - balancing the open `[` / `{` brackets with closing ones
 * Returns null if it still can't parse.
 */
const salvageTruncatedJson = (text) => {
  const startObj = text.indexOf('{');
  const startArr = text.indexOf('[');
  const start = startObj === -1
    ? startArr
    : startArr === -1
      ? startObj
      : Math.min(startObj, startArr);
  if (start === -1) return null;

  const stack = [];
  let inString = false;
  let escape = false;
  let lastSafe = -1; // index right after the last fully-closed value at depth>=1

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      if (!inString && stack.length) lastSafe = i + 1;
      continue;
    }
    if (inString) continue;

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }
    if (ch === '}' || ch === ']') {
      stack.pop();
      lastSafe = i + 1;
      continue;
    }
    if (ch === ',' && stack.length) {
      lastSafe = i; // drop the trailing comma
    }
  }

  let slice;
  if (inString) {
    // Unterminated string -> close it, then drop the partial value.
    slice = `${text.slice(start)}"`;
    const lastComma = slice.lastIndexOf(',');
    const lastOpen = Math.max(slice.lastIndexOf('['), slice.lastIndexOf('{'));
    const cut = Math.max(lastComma, lastOpen);
    if (cut > 0) slice = slice.slice(0, cut);
  } else if (lastSafe > start) {
    slice = text.slice(start, lastSafe);
    if (slice.endsWith(',')) slice = slice.slice(0, -1);
  } else {
    slice = text.slice(start);
  }

  // Recount the still-open brackets and close them in reverse.
  const reopened = [];
  inString = false;
  escape = false;
  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { if (inString) escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') reopened.push(ch);
    else if (ch === '}') {
      const top = reopened[reopened.length - 1];
      if (top === '{') reopened.pop();
    } else if (ch === ']') {
      const top = reopened[reopened.length - 1];
      if (top === '[') reopened.pop();
    }
  }
  while (reopened.length) {
    const open = reopened.pop();
    slice += open === '{' ? '}' : ']';
  }

  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
};

const tryParseJson = (text) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract the first JSON object/array from the response
    const startObj = trimmed.indexOf('{');
    const startArr = trimmed.indexOf('[');
    const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
    if (start === -1) return null;
    const endObj = trimmed.lastIndexOf('}');
    const endArr = trimmed.lastIndexOf(']');
    const end = endObj === -1 ? endArr : endArr === -1 ? endObj : Math.max(endObj, endArr);
    if (end !== -1 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // fall through to salvage
      }
    }
    // Last resort: salvage a truncated response (close strings/brackets).
    return salvageTruncatedJson(trimmed);
  }
};

const normalizeStringArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const strOrNull = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};

const parseSalaryInt = (v) => {
  if (v == null || v === '') return null;
  const n = parseInt(String(v).replace(/[\s,_]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

/** LLM often returns drivingLicenses as [{ class: "…" }] or similar — extract displayable strings. */
const normalizeDrivingLicenseList = (arr) => {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const x of arr) {
    if (x == null) continue;
    if (typeof x === 'string') {
      const t = x.trim();
      if (t && t !== '-') out.push(t);
      continue;
    }
    if (typeof x === 'object') {
      const t = String(
        x.value ?? x.class ?? x.name ?? x.label ?? x.license ?? x.type ?? x.title ?? '',
      ).trim();
      if (t && t !== '-' && t !== '[object Object]') out.push(t);
    }
  }
  return out;
};

const MARITAL_STATUS_LIKE = /^(רווק|רווקה|נשוי|נשואה|גרוש|גרושה|אלמן|אלמנה|ידועים בציבור)/i;

const maritalStatusFromAi = (ai) => {
  const m = strOrNull(ai.maritalStatus);
  if (m) return m;
  const st = strOrNull(ai.status);
  if (st && MARITAL_STATUS_LIKE.test(st)) return st;
  return null;
};

/** Map LLM keys (drivingLicense / drivingLicenses, mobility) onto Candidate fields. Omits empty / placeholder "-". */
const normalizeMobilityDrivingFromAi = (ai) => {
  if (!ai || typeof ai !== 'object') return {};
  const out = {};
  const mob = ai.mobility != null ? String(ai.mobility).trim() : '';
  if (mob && mob !== '-') out.mobility = mob;

  let licenses = normalizeDrivingLicenseList(ai.drivingLicenses);
  if (!licenses.length && ai.drivingLicenses != null && typeof ai.drivingLicenses === 'string') {
    licenses = normalizeStringArray(ai.drivingLicenses).filter((x) => x && x !== '-');
  }
  if (!licenses.length && ai.drivingLicense != null) {
    const one = String(ai.drivingLicense).trim();
    if (one && one !== '-') licenses = [one];
  }
  licenses = licenses.filter((x) => x && x !== '-');
  if (licenses.length) {
    out.drivingLicenses = licenses;
    out.drivingLicense = licenses[0];
  }
  return out;
};

/**
 * Scalar / JSON fields from CV parse JSON → Candidate model (no skills, workExperience, education, languages, tags).
 * Uses fallback (e.g. regex extract) when AI omitted a field.
 */
const buildPersistFieldsFromAiParse = (ai, fallback = {}) => {
  if (!ai || typeof ai !== 'object') return {};
  const fb = fallback && typeof fallback === 'object' ? fallback : {};
  const out = {};

  const mergeStr = (key) => {
    const v = strOrNull(ai[key]) ?? strOrNull(fb[key]);
    if (v) out[key] = v;
  };

  [
    'email',
    'phone',
    'address',
    'location',
    'idNumber',
    'gender',
    'availability',
    'physicalWork',
    'jobScope',
    'industry',
    'field',
    'sector',
    'companySize',
    'candidateNotes',
    'internalNotes',
    'birthYear',
    'birthMonth',
    'birthDay',
    'age',
    'title',
    'professionalSummary',
  ].forEach(mergeStr);

  const ms = maritalStatusFromAi(ai);
  if (ms) out.maritalStatus = ms;

  const et = Array.isArray(ai.employmentTypes)
    ? ai.employmentTypes.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  const etSingle = strOrNull(ai.employmentType) ?? strOrNull(fb.employmentType);
  if (et.length) {
    out.employmentTypes = et;
    if (etSingle) out.employmentType = etSingle;
  } else if (etSingle) {
    out.employmentType = etSingle;
    out.employmentTypes = [etSingle];
  }

  const js = normalizeStringArray(ai.jobScopes);
  if (js.length) out.jobScopes = js.slice(0, 50);

  const pwm = normalizeStringArray(ai.preferredWorkModels);
  if (pwm.length) out.preferredWorkModels = pwm.slice(0, 20);

  const hi = normalizeStringArray(ai.highlights);
  if (hi.length) out.highlights = hi.slice(0, 50);

  const it = normalizeStringArray(ai.internalTags);
  if (it.length) out.internalTags = it.slice(0, 100);

  const smin = parseSalaryInt(ai.salaryMin ?? fb.salaryMin);
  const smax = parseSalaryInt(ai.salaryMax ?? fb.salaryMax);
  if (smin != null) out.salaryMin = smin;
  if (smax != null) out.salaryMax = smax;

  if (ai.experience != null && typeof ai.experience === 'object') {
    if (Array.isArray(ai.experience)) {
      if (ai.experience.length) out.experience = ai.experience;
    } else if (Object.keys(ai.experience).length) {
      out.experience = ai.experience;
    }
  }

  Object.assign(out, normalizeMobilityDrivingFromAi(ai));

  const fn = strOrNull(ai.firstName) ?? strOrNull(fb.firstName);
  const ln = strOrNull(ai.lastName) ?? strOrNull(fb.lastName);
  const full = strOrNull(ai.fullName) ?? strOrNull(fb.fullName);
  if (fn) out.firstName = fn;
  if (ln) out.lastName = ln;
  if (full) out.fullName = full;

  return out;
};

const normalizeWorkExperience = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x || typeof x !== 'object') return null;
      const title = String(x.title || '').trim();
      const company = String(x.company || '').trim();
      const description = String(x.description || '').trim();
      if (!title && !company && !description) return null;
      const startDate = String(x.startDate || '').trim() || '2000-01';
      const endDate = String(x.endDate || '').trim() || (startDate || '2000-12');
      return {
        id: x.id || idx + 1,
        title: title || 'ניסיון תעסוקתי',
        company,
        companyField: String(x.companyField || '').trim(),
        startDate,
        endDate,
        description: description || [title, company].filter(Boolean).join(' - '),
      };
    })
    .filter(Boolean);
};

const normalizeRoleKey = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const ensureRoleTagCoverage = (existingTags = [], workExperience = []) => {
  const sourceTags = Array.isArray(existingTags) ? existingTags : [];
  const experienceList = Array.isArray(workExperience) ? workExperience : [];
  const roleNameSet = new Set(
    sourceTags
      .filter((tag) => tag && typeof tag === 'object' && String(tag.raw_type || '').toLowerCase() === 'role')
      .map((tag) => normalizeRoleKey(tag.name))
      .filter(Boolean),
  );

  const merged = [...sourceTags];
  if(false){
  for (const exp of experienceList) {
    const title = String(exp?.title || '').trim();
    if (!title) continue;
    const normalizedTitle = normalizeRoleKey(title);
    if (!normalizedTitle || roleNameSet.has(normalizedTitle)) continue;
    merged.push({
      name: title,
      evidence: title,
      raw_type: 'Role',
      context: 'Core',
      raw_type_reason: 'Direct job title from workExperience entry.',
      tag_reason: 'Auto-added to guarantee at least one Role tag per workExperience title.',
      is_current: !exp?.endDate,
      confidence_score: 1,
    });
    roleNameSet.add(normalizedTitle);
  }
  }

  return merged;
};

const normalizeEducation = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const v = x.trim();
        return v ? { id: idx + 1, value: v } : null;
      }
      if (typeof x === 'object') {
        const v = String(x.value || x.degree || x.title || x.description || '').trim();
        return v ? { id: x.id || idx + 1, value: v } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const normalizeLanguages = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const name = x.trim();
        return name ? { id: idx + 1, name, level: 50, levelText: '' } : null;
      }
      if (typeof x === 'object') {
        const name = String(x.name || '').trim();
        if (!name) return null;
        const level = typeof x.level === 'number' ? x.level : 50;
        return { id: x.id || idx + 1, name, level, levelText: String(x.levelText || x.level || '').trim() };
      }
      return null;
    })
    .filter(Boolean);
};

const extractCompanyNames = (experience) => {
  if (!Array.isArray(experience)) return [];
  const names = experience
    .map((item) => {
      if (!item) return '';
      const candidate =  item.company|| '';
      return String(candidate || '').trim();
    })
    .filter(Boolean);
  return Array.from(new Set(names));
};

const promptTemplateCache = new Map();
const loadPromptTemplate = async (promptId) => {
  if (!promptId) return null;
  if (promptTemplateCache.has(promptId)) return promptTemplateCache.get(promptId);
  try {
    const record = await promptService.getById(promptId);
    const template = record?.template || null;
    promptTemplateCache.set(promptId, template);
    return template;
  } catch (err) {
    console.warn(`[candidateController] prompt ${promptId} missing`, err.message || err);
    promptTemplateCache.set(promptId, null);
    return null;
  }
};

const buildExperiencePrompt = async (contextParts) => {
  const template = await loadPromptTemplate('candidate_Profile Summary AI-Enhanced');
  if (template) {
    return template.replace(/{{contextParts}}/g, contextParts.join('\n'));
  }
  return `
פעל כיועץ קריירה ומומחה לכתיבת קורות חיים (CV Expert) בעברית.
המטרה: כתיבה או שכתוב של תיאור ניסיון תעסוקתי בעברית בצורה מקצועית.
הנתונים עליהם יש להתבסס:
${contextParts.join('\n')}
הנחיות כתיבה:
1. כתוב 3-5 נקודות קצרות ומקצועיות בגוף ראשון עבר.
2. אם קיים תיאור - שפר אותו; אם לא, צור תיאור חדש.
3. החזר רק את רשימת הנקודות בעברית, ללא מבואות.
`.trim();
};

const CandidateOrganization = require('../models/CandidateOrganization');
const Organization = require('../models/Organization');

const ensureOrganizationsFromExperience = async (experience, candidateId = null) => {
  const companyNames = extractCompanyNames(experience);
  if (!companyNames.length) return;
  console.debug('[candidateController] syncing organizations for workExperience', { companyNames });
  try {
    await Promise.all(
      companyNames.map(async (name) => {
        console.debug('[candidateController] ensuring organization', { name });
        const org = await organizationService.findOrCreateByName(name, { candidateId });
        console.debug('[candidateController] ensured organization', { name, orgId: org?.id });
        // Only create link when we got a real Organization instance (not OrganizationTmp)
        if (candidateId && org && org.id && org instanceof Organization) {
          await CandidateOrganization.findOrCreate({
            where: { candidateId, organizationId: org.id },
          });
        }
        return org;
      }),
    );
  } catch (err) {
    console.error('Failed to sync organizations for work experience', err);
  }
};

const generateExperienceSummary = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const payload = req.body || {};
    const experience = {
      title: payload.title || candidate.title || '',
      company: payload.company || '',
      companyField: payload.companyField || '',
      description: payload.description || '',
    };
    const contextParts = [];
    if (experience.title) contextParts.push(`תפקיד: ${experience.title}`);
    if (experience.company) contextParts.push(`חברה: ${experience.company}`);
    if (experience.companyField) contextParts.push(`תחום עיסוק החברה: ${experience.companyField}`);
    if (experience.description) {
      const sanitizedDescription = experience.description.replace(/"/g, '\\"');
      contextParts.push(`תיאור קיים (טיוטה/נקודות): "${sanitizedDescription}"`);
    }

    if (!contextParts.length) {
      return res.status(400).json({ message: 'חובה לספק לפחות תפקיד או חברה כדי לגבש תיאור.' });
    }

    const prompt = await buildExperiencePrompt(contextParts);
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GIMINI_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'מפתח Gemini/API לא מוגדר.' });
    }

    const text = await sendSingleTurnChat({
      apiKey,
      systemPrompt: prompt,
      message: prompt,
    });

    const summary = (text || '').trim();
    if (!summary) {
      return res.status(500).json({ message: 'המודל לא החזיר תיאור תקין.' });
    }

    const updated = await candidateService.update(candidate.id, { professionalSummary: summary });
    res.json({ summary, candidate: updated });
  } catch (err) {
    console.error('[generateExperienceSummary]', err);
    res.status(err.status || 500).json({ message: err.message || 'יצירת תיאור ניסיון נכשלה.' });
  }
};

const extractSkillsHeuristic = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return { soft: [], technical: [] };

  // Very lightweight keyword-based extraction (fallback if Gemini returns empty)
  const techKeywords = [
    'excel', 'word', 'powerpoint', 'sql', 'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node.js',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jira', 'confluence', 'sap', 'salesforce', 'power bi', 'tableau',
    'git', 'github', 'gitlab', 'linux', 'windows', 'photoshop', 'figma', 'google ads', 'meta ads', 'facebook ads',
    'seo', 'ppc', 'crm', 'erp',
    // Hebrew common
    'אקסל', 'אופיס', 'וורד', 'פאוורפוינט', 'סאפ', 'ג\'ירה', 'גירה', 'קונפלואנס', 'פאוור בי', 'טאבלו', 'פוטושופ',
  ];
  const softKeywords = [
    'communication', 'teamwork', 'leadership', 'problem solving', 'organization', 'time management', 'customer service',
    // Hebrew common
    'תקשורת', 'עבודת צוות', 'עבודה בצוות', 'מנהיגות', 'שירותיות', 'שירות לקוחות', 'סדר', 'ארגון', 'ניהול זמן', 'פתרון בעיות',
    'אחריות', 'מוטיבציה', 'יחסי אנוש', 'עצמאות', 'יכולת למידה',
  ];

  const pick = (arr) => arr.filter((k) => t.includes(k.toLowerCase()));
  const tech = Array.from(new Set(pick(techKeywords))).slice(0, 30);
  const soft = Array.from(new Set(pick(softKeywords))).slice(0, 30);
  return { soft, technical: tech };
};

const buildAiSkillsPrompt = () => `
You are an expert CV skill extractor. You receive raw CV text (Hebrew or English).
Return ONLY strict JSON (no markdown) exactly in this shape:
{
  "skills": {
    "soft": string[],
    "technical": string[]
  }
}

Rules:
- Do NOT invent skills that are not supported by the CV.
- If the CV contains skills/tools/technologies/traits, extract them (do not leave both arrays empty).
- soft = interpersonal/behavioral skills (e.g., תקשורת בין-אישית, עבודת צוות, מנהיגות, שירותיות, סדר וארגון, פתרון בעיות).
- technical = tools/technologies/platforms/methods/certifications (e.g., Excel, SQL, Python, React, Jira, AWS, Google Ads, Power BI).
- Max 30 items per list. Prefer concise tokens.
`;

const parseSkillsWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!resumeText || !String(resumeText).trim()) return null;
  const raw = await sendChat({
    apiKey,
    systemPrompt: buildAiSkillsPrompt(),
    history: [{ role: 'user', text: String(resumeText).slice(0, 50000) }],
  });
  const parsed = tryParseJson(raw);
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const buildAiResumePrompt = (candidate_tag) => `
You are an expert CV parser. You receive raw CV text (Hebrew or English).
Return ONLY a valid JSON object (no markdown, no explanations) matching this schema:
{
  "firstName": string|null,
  "lastName": string|null,
  "fullName": string|null,
  "email": string|null,
  "phone": string|null,
  "address": string|null,
  "title": string|null,
  "professionalSummary": string|null,
  "skills": { "soft": string[], "technical": string[] },
 "tags": [{
    "name": string,
    "evidence": string,
    "raw_type": "role" | "skill" | "tool" | "degree" | "methodology" | "seniority" | "industry" | "soft_skill",
    "context": "Core" | "Tool" | "Degree" | "Profile",
    "raw_type_reason": string|null,
    "tag_reason": string|null,
    "is_current": boolean,
    "confidence_score": number
  }],
   "languages": [{ "name": string, "level": string|number|null, "levelText": string|null }],
  "workExperience": [{
    "title": string|null,
    "company": string|null,
    "companyField": string|null,
    "startDate": string|null,   // YYYY-MM if possible
    "endDate": string|null,     // YYYY-MM or "Present"
    "description": string|null
  }],
  "education": [{ "value": string|null }]
}

Rules:
- Do NOT invent facts. If unknown, use null/empty.
- Extract multiple work/education entries when present.
- You MUST ALWAYS include the "skills" key with BOTH arrays: skills.soft and skills.technical (even if empty).
- If the user mentions skills, roles, tools, or other professional tags,also include them under the \`tags\` field so the backend can synchronize candidate_tag rows. candidate_tag  scehma:${candidate_tag } (must implement in candidate_tag from the llm: raw_type: (String) הסיווג מה-LLM (Role, Skill, industry, tool, certification, language, seniority, domain, soft_skill, education). context: (String) האם זה Core, Tool או Degree.  is_current: (Boolean) האם מופיע בניסיון האחרון.  is_in_summary: (Boolean) האם מופיע בפתיח.  confidence_score: (Float) רמת הביטחון של ה-AI.)
- If the CV contains any skills/tools/technologies/traits, you MUST extract them into the relevant list (do not leave both lists empty).
- skills.soft = interpersonal/behavioral skills (e.g., תקשורת בין-אישית, עבודת צוות, מנהיגות, שירותיות, סדר וארגון, פתרון בעיות). Max 30.
- skills.technical = tools/technologies/platforms/methods/certifications (e.g., Excel, SQL, Python, React, Salesforce, Google Ads, Power BI, Jira, AWS, Docker). Max 30.
- Prefer realistic date formats; if only year exists use YYYY-01 / YYYY-12.

Output constraints:
- Return STRICT JSON (double quotes, no trailing commas).
- Do not wrap in \`\`\` fences.
`;

/** Sequelize attribute type → short label for LLM context */
const sequelizeAttrTypeLabel = (t) => {
  if (!t) return 'unknown';
  if (typeof t === 'string') return t;
  if (t.key) return String(t.key);
  const nm = t.constructor && t.constructor.name;
  if (nm === 'ARRAY') {
    return `ARRAY(${sequelizeAttrTypeLabel(t.type)})`;
  }
  return nm || 'unknown';
};

/** JSON description of `Candidate` model fields (matches models/Candidate.js) for cv_parsing prompt */
const buildCandidateModelSchemaJsonForPrompt = () => {
  const raw = Candidate.rawAttributes;
  const out = {};
  for (const [field, def] of Object.entries(raw)) {
    const entry = {
      type: sequelizeAttrTypeLabel(def.type),
      allowNull: def.allowNull !== false,
    };
    if (def.primaryKey) entry.primaryKey = true;
    if (def.defaultValue !== undefined && def.defaultValue !== null) entry.hasDefault = true;
    if (def.field && def.field !== field) entry.column = def.field;
    out[field] = entry;
  }
  return JSON.stringify(out, null, 2);
};

/**
 * Gemini-compatible response schema for CV parsing.
 * Forces the LLM to return EVERY top-level field every time, in the right shape.
 *
 * IMPORTANT: Gemini's structured-output schema is a strict SUBSET of OpenAPI 3,
 * and `gemini-3-flash-preview` is more restrictive than older models. The
 * keywords confirmed to work on this model are:
 *   type, items, properties, required, enum, nullable, description, propertyOrdering.
 * Things known to break (HTTP 400 INVALID_ARGUMENT):
 *   maxLength, minLength, pattern, minimum, maximum, maxItems, minItems,
 *   additionalProperties, oneOf/anyOf/allOf, `nullable: true` on required arrays.
 *
 * Array sizes and string lengths therefore live in the PROMPT only (Brevity rules),
 * and the truncation salvager (`salvageTruncatedJson`) plus the validate-and-repair
 * pass cover whatever leaks through.
 */
const buildResumeResponseSchema = () => ({
  type: 'object',
  description: 'Parsed CV data. Every key MUST be present even if its value is null/empty.',
  propertyOrdering: [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'address',
    'birthYear', 'birthMonth', 'birthDay', 'age',
    'maritalStatus', 'gender',
    'mobility', 'drivingLicenses',
    'title', 'professionalSummary',
    'skills', 'tags', 'languages', 'workExperience', 'education',
    'industryAnalysis',
  ],
  required: [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'address',
    'birthYear', 'birthMonth', 'birthDay', 'age',
    'maritalStatus', 'gender',
    'mobility', 'drivingLicenses',
    'title', 'professionalSummary',
    'skills', 'tags', 'languages', 'workExperience', 'education',
  ],
  properties: {
    firstName:           { type: 'string', nullable: true },
    lastName:            { type: 'string', nullable: true },
    fullName:            { type: 'string', nullable: true },
    email:               { type: 'string', nullable: true },
    phone:               { type: 'string', nullable: true },
    address:             { type: 'string', nullable: true },
    birthYear:           { type: 'integer', nullable: true, description: '4-digit year, e.g. 1985' },
    birthMonth:          { type: 'integer', nullable: true, description: '1-12' },
    birthDay:            { type: 'integer', nullable: true, description: '1-31' },
    age:                 { type: 'integer', nullable: true, description: 'Computed from birth date if known' },
    maritalStatus:       { type: 'string', nullable: true },
    gender:              { type: 'string', nullable: true },
    mobility:            { type: 'string', nullable: true, description: 'Must be one of the allowed mobility values' },
    drivingLicenses: {
      type: 'array',
      items: { type: 'string' },
      description: 'Allowed driving-license codes. Up to 10 items.',
    },
    title:               { type: 'string', nullable: true },
    professionalSummary: { type: 'string', nullable: true, description: '2-3 short lines, ≤ 600 chars, no fluff' },
    skills: {
      type: 'object',
      required: ['soft', 'technical'],
      properties: {
        soft:      { type: 'array', items: { type: 'string' }, description: 'Up to 30 items.' },
        technical: { type: 'array', items: { type: 'string' }, description: 'Up to 30 items.' },
      },
    },
    tags: {
      type: 'array',
      description: '10-15 tags total (HARD CAP 15). 1-2 Role tags, exactly 1 Seniority, exactly 1 Industry.',
      items: {
        type: 'object',
        required: ['name', 'evidence', 'raw_type', 'context'],
        properties: {
          name:             { type: 'string' },
          evidence:         { type: 'string', description: 'Verbatim short snippet from the CV. ≤ 160 chars.' },
          raw_type: {
            type: 'string',
            enum: ['role', 'skill', 'tool', 'degree', 'methodology', 'seniority', 'industry', 'soft_skill'],
          },
          context: {
            type: 'string',
            enum: ['Core', 'Tool', 'Degree', 'Profile'],
          },
          raw_type_reason:  { type: 'string', nullable: true, description: 'One Hebrew sentence, ≤ 160 chars.' },
          tag_reason:       { type: 'string', nullable: true, description: 'One Hebrew sentence, ≤ 160 chars.' },
          is_current:       { type: 'boolean', nullable: true },
          confidence_score: { type: 'number',  nullable: true },
        },
      },
    },
    languages: {
      type: 'array',
      description: 'Up to 10 items.',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name:      { type: 'string' },
          level:     { type: 'integer', nullable: true, description: '0..100' },
          levelText: { type: 'string',  nullable: true },
        },
      },
    },
    workExperience: {
      type: 'array',
      description: 'Up to 20 items, most recent first.',
      items: {
        type: 'object',
        required: ['title', 'company'],
        properties: {
          title:        { type: 'string', nullable: true },
          company:      { type: 'string', nullable: true },
          companyField: { type: 'string', nullable: true },
          startDate:    { type: 'string', nullable: true, description: 'YYYY-MM' },
          endDate:      { type: 'string', nullable: true, description: 'YYYY-MM or "Present"' },
          description:  { type: 'string', nullable: true, description: '2-4 short bullet sentences, ≤ 600 chars' },
        },
      },
    },
    education: {
      type: 'array',
      description: 'Up to 10 items.',
      items: {
        type: 'object',
        required: ['value'],
        properties: {
          value: { type: 'string' },
        },
      },
    },
    industryAnalysis: {
      type: 'object',
      properties: {
        primaryIndustry: { type: 'string', nullable: true },
        years:           { type: 'number', nullable: true },
      },
    },
  },
});

/** Required top-level keys we expect the LLM to return; used by the validate-and-repair pass. */
const RESUME_REQUIRED_TOP_KEYS = [
  'firstName', 'lastName', 'fullName', 'email', 'phone',
  'professionalSummary', 'skills', 'tags', 'workExperience', 'education',
];

const findMissingResumeKeys = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return [...RESUME_REQUIRED_TOP_KEYS];
  const missing = [];
  for (const key of RESUME_REQUIRED_TOP_KEYS) {
    if (!(key in parsed)) {
      missing.push(key);
      continue;
    }
    const v = parsed[key];
    if (key === 'skills') {
      if (!v || typeof v !== 'object' || !Array.isArray(v.soft) || !Array.isArray(v.technical)) {
        missing.push(key);
      }
    } else if (['tags', 'workExperience', 'education'].includes(key)) {
      if (!Array.isArray(v)) missing.push(key);
    }
  }
  return missing;
};

let resumePromptCache = null;
const getResumePromptTemplate = async () => {
  if (resumePromptCache) return resumePromptCache;
  try {
    const record = await promptService.getById('cv_parsing');
    const schemaJson = buildCandidateModelSchemaJsonForPrompt();
    const mobilityPicklist = await picklistService.formatCategoryValuesForLlmPrompt('mobility');
    const drivingPicklist = await picklistService.formatCategoryValuesForLlmPrompt('driving_license');
    let template = String(record.template || '');
    template = template.replace(/\$\{JSON\}/g, schemaJson).replace(/\$JSON/g, schemaJson);
    template = template.replace(/\$\{Mobility\}/g, mobilityPicklist);
    template = template.replace(/\$\{DrivingLicenses\}/g, drivingPicklist);
    resumePromptCache = { ...record, template };
  } catch (err) {
    console.warn('[attachMedia-ai] cv_parsing prompt missing', err.message || err);
    resumePromptCache = null;
  }
  return resumePromptCache;
};

const parseResumeWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('[attachMedia-ai] missing GEMINI_API_KEY/API_KEY/GOOGLE_API_KEY -> skip ai');
    return null;
  }
  if (!resumeText || !String(resumeText).trim()) {
    console.log('[attachMedia-ai] empty resumeText -> skip ai');
    return null;
  }
  if (looksLikeRawPdfUtf8String(resumeText)) {
    console.warn('[attachMedia-ai] skip: input looks like raw PDF bytes, not extracted text');
    return null;
  }
  const promptRecord = await getResumePromptTemplate();
  const systemPrompt = promptRecord?.template
    ? String(promptRecord.template).replace('{candidate_tag}', getCandidateTagsSchemaText())
    : buildAiResumePrompt(getCandidateTagsSchemaText());

  const cvText = String(resumeText).slice(0, 50000);
  // NOTE: we deliberately do NOT pass a `responseSchema` here.
  // gemini-3-flash-preview rejects `maxItems` (HTTP 400 INVALID_ARGUMENT), and
  // without `maxItems` a strict responseSchema makes the model run away —
  // it keeps generating tag/work-experience items until it hits maxOutputTokens
  // (we observed 32,753 output tokens / ~100KB of JSON for one CV).
  // We keep `responseMimeType: 'application/json'` to force JSON-only output,
  // and rely on the prompt's HARD CAPS + the controller's validate-and-repair
  // pass + the truncation salvager to keep the result clean and complete.
  const generationConfig = {
    temperature: 0.1,
    // 16K is plenty for any reasonable CV; if the model still overshoots we
    // fail fast and let the salvager + repair pass clean up.
    maxOutputTokens: 16384,
    responseMimeType: 'application/json',
    // Disable hidden chain-of-thought — extraction is deterministic and the
    // thinking budget would otherwise eat the whole output budget.
    thinkingConfig: { thinkingBudget: 0 },
  };

  console.log('[attachMedia-ai] calling gemini', { resumeLen: cvText.length });
  // First pass: pass the CV exactly once (stop double-feeding via history+message).
  const raw = await sendChat({
    apiKey,
    systemPrompt,
    message: `CV TEXT (verbatim, do not summarize before extracting):\n\n${cvText}`,
    generationConfig,
  });
  const rawStr = String(raw || '');
  let parsed = tryParseJson(rawStr);
  let missing = findMissingResumeKeys(parsed);
  const looksTruncated = rawStr.length > 0 && !rawStr.trimEnd().endsWith('}') && !rawStr.trimEnd().endsWith(']');

  console.log('[attachMedia-ai] gemini response', JSON.stringify({
    rawLen: rawStr.length,
    parsedOk: !!parsed,
    looksTruncated,
    rawHead: rawStr.slice(0, 300),
    rawTail: rawStr.slice(-300),
    keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 30) : [],
    missing,
    softSkillsCount: Array.isArray(parsed?.skills?.soft) ? parsed.skills.soft.length : 0,
    technicalSkillsCount: Array.isArray(parsed?.skills?.technical) ? parsed.skills.technical.length : 0,
    tagsCount: Array.isArray(parsed?.tags) ? parsed.tags.length : 0,
    workExpCount: Array.isArray(parsed?.workExperience) ? parsed.workExperience.length : 0,
    educationCount: Array.isArray(parsed?.education) ? parsed.education.length : 0,
  }));

  // One-shot validate-and-repair pass when the model dropped required keys.
  if (missing.length) {
    try {
      const repairMessage =
        `Your previous JSON was missing or malformed for these keys: ${JSON.stringify(missing)}.\n` +
        `Re-read the CV below and return the SAME JSON object you produced before, ` +
        `but with EVERY required key present (use null / [] / {} when truly unknown). ` +
        `Do not drop any fields you already populated correctly.\n\n` +
        `CV TEXT:\n${cvText}`;
      const repairRaw = await sendChat({
        apiKey,
        systemPrompt,
        message: repairMessage,
        generationConfig,
      });
      const repairedParsed = tryParseJson(repairRaw);
      if (repairedParsed && typeof repairedParsed === 'object') {
        parsed = parsed && typeof parsed === 'object'
          ? { ...parsed, ...repairedParsed }
          : repairedParsed;
        const stillMissing = findMissingResumeKeys(parsed);
        console.log('[attachMedia-ai] repair pass', {
          repairedKeys: Object.keys(repairedParsed).slice(0, 30),
          stillMissing,
        });
      }
    } catch (err) {
      console.warn('[attachMedia-ai] repair pass failed', err.message || err);
    }
  }

  return parsed;
};

const list = async (req, res) => {
  try {
    const incomingPage = Number(req.query.page) || 1;
    const incomingLimit = Number(req.query.limit) || 100;
    const page = Number.isFinite(incomingPage) && incomingPage > 0 ? Math.round(incomingPage) : 1;
    const limit = Number.isFinite(incomingLimit) ? Math.round(incomingLimit) : 100;
    const clampedLimit = Math.min(500, Math.max(10, limit));
    const search = String(req.query.search || '').trim();
    let advanced = null;
    const advRaw = req.query.adv;
    if (advRaw != null && String(advRaw).trim() !== '') {
      try {
        const parsed = JSON.parse(String(advRaw));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const encoded = JSON.stringify(parsed);
          if (encoded.length > 16_000) {
            return res.status(400).json({ message: 'adv payload too large' });
          }
          advanced = parsed;
        }
      } catch {
        return res.status(400).json({ message: 'Invalid adv JSON' });
      }
    }
    const dc = req.query.dataIncomplete ?? req.query.incomplete;
    if (dc === '1' || String(dc).toLowerCase() === 'true') {
      advanced =
        advanced && typeof advanced === 'object' && !Array.isArray(advanced)
          ? { ...advanced, dataIncomplete: true }
          : { dataIncomplete: true };
    }
    const payload = await candidateService.listPaginated({
      page,
      limit: clampedLimit,
      search,
      advanced,
    });
    const safeRows = (Array.isArray(payload.rows) ? payload.rows : []).map((row) => {
      if (!row || typeof row !== 'object') return row;
      const out = { ...row };
      delete out.embedding;
      delete out.searchText;
      return out;
    });
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json({
      data: safeRows,
      total: payload.count || 0,
      page: payload.page,
      limit: payload.limit,
    });
  } catch (err) {
    console.error('[candidateController.list]', err.message || err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to list candidates' });
  }
};

/** List candidates filtered by worked-at-company (organizationId). Optional: yearsExperience, employmentStatus, yearsLeftAgo (for future use). */
const listByWorkedAtCompany = async (req, res) => {
  try {
    const organizationId = String(req.query.organizationId || '').trim();
    const yearsExperience = req.query.yearsExperience != null ? Number(req.query.yearsExperience) : undefined;
    const employmentStatus = String(req.query.employmentStatus || '').trim() || undefined;
    const yearsLeftAgo = req.query.yearsLeftAgo != null ? Number(req.query.yearsLeftAgo) : undefined;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 500));
    if (!organizationId) {
      return res.status(400).json({ message: 'organizationId is required' });
    }
    const { rows, count } = await candidateService.listByWorkedAtOrganization({
      organizationId,
      yearsExperience,
      employmentStatus,
      yearsLeftAgo,
      limit,
    });
    res.json({ data: rows, total: count });
  } catch (err) {
    console.error('[candidateController.listByWorkedAtCompany]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidates by worked-at-company' });
  }
};

const getByUser = async (req, res) => {
  try {
    const candidates = await candidateService.listByUserId(req.params.userId);
    res.json(candidates);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Not found' });
  }
};


const getCandidateTagsSchemaText = () => `
Candidate tag schema (from backend/src/models/CandidateTag.js):
- name (String)
- candidate_id (UUID, FK -> candidates.id)
- tag_id (UUID, FK -> tags.id)
- raw_type (role/skill/education/etc.)
- context (Core/Tool/Degree)
- is_current (boolean)
- is_in_summary (boolean)
- confidence_score (float)
- calculated_weight (float)
- final_score (float)
Use this schema as guidance when tagging professional skills or roles.
`;


const get = async (req, res) => {
  console.log(
    '[candidateController.get] incoming request',
    { method: req.method, url: req.originalUrl, host: req.get('host'), candidateId: req.params.id },
  );
  try {
    const candidate = await candidateService.getById(req.params.id);
    console.log('[candidateController.get] found candidate', { id: candidate.id });
    res.json(candidate);
  } catch (err) {
    console.error('[candidateController.get] lookup failed', { id: req.params.id, error: err.message || err });
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const sendWelcome = req.body?.sendWelcomeEmail !== false;
    const candidate = await candidateService.create(req.body);

    // Audit: 'קליטת קו"ח' — manual / API-driven candidate creation
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CV_RECEIVED,
      entityType: 'Candidate',
      entityId: candidate.id,
      entityName: candidate.fullName,
      params: { id: candidate.id },
    });

    // Audit: 'הגדרת מקור גיוס'
    if (req.body?.source) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_SOURCE,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidate.fullName,
        params: { source: req.body.source },
      });
    }

    // Audit: 'הגדרת תחום משרה' on candidate
    if (req.body?.field) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_FIELD,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidate.fullName,
        params: { job: req.body.field },
      });
    }

    if (Array.isArray(req.body.tags) && req.body.tags.length) {
      await candidateTagService.syncTagsForCandidate(candidate.id, req.body.tags);

      // Audit: 'הגדרת תגיות'
      const tagsLabel = req.body.tags
        .map((t) => (typeof t === 'string' ? t : t?.displayNameHe || t?.displayNameEn || t?.tagKey || t?.name))
        .filter(Boolean)
        .slice(0, 12)
        .join(', ');
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_TAGS,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidate.fullName,
        params: { tags: tagsLabel || `${req.body.tags.length} תגיות` },
      });
    }
    const enrichedCandidate = await candidateService.getById(candidate.id);
    // Fire-and-forget embedding only if we have text to embed
    const embedText = [
      candidate.fullName,
      candidate.professionalSummary,
      candidate.searchText,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (embedText.length > 3) {
      void tryEmbedCandidate(candidate.id, embedText);
    }
    await ensureOrganizationsFromExperience(enrichedCandidate.workExperience, enrichedCandidate.id);
    await candidateCompletenessService.refreshCandidateDataStatusAfterSave(candidate.id, req);
    const enrichedAfter = await candidateService.getById(candidate.id);
    const welcomeClientId = await getStaffClientIdFromRequest(req);
    if (sendWelcome) {
      messageTemplateService.queueCandidateWelcomeEmail(enrichedAfter, { clientId: welcomeClientId });
    }
    res.status(201).json(enrichedAfter);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const createFromAi = async (req, res) => {
  try {
    const sendWelcome = req.body?.sendWelcomeEmail !== false;
    const { resumeText, fileBase64, mimeType, fileName } = req.body || {};
    let text = typeof resumeText === 'string' ? resumeText : '';
    if (fileBase64 && !text) {
      let buffer = decodeFileBase64Payload(fileBase64);
      if (!buffer?.length) {
        buffer = Buffer.from(String(fileBase64).replace(/\s/g, ''), 'base64');
      }
      if (!buffer?.length) {
        return res.status(400).json({ message: 'Invalid or empty file upload (could not decode base64).' });
      }
      if ((mimeType || '').startsWith('image/')) {
        text = await extractTextFromImageBuffer(buffer);
      } else {
        text = await extractFromBuffer(buffer, mimeType);
      }
      if (!text || !String(text).trim()) {
        // Never decode PDF/Office as UTF-8: that produces binary noise; Gemini will hallucinate a fake CV.
        if (!isPdfMagicBuffer(buffer) && !(String(mimeType).toLowerCase().includes('pdf'))) {
          text = buffer.toString('utf8');
        }
      }
    }
    if (!text || !String(text).trim()) {
      return res.status(400).json({
        message:
          'Could not extract readable text from this file. If the PDF is a scan or image-only, paste the resume as text in resumeText, or export a text-based PDF. Otherwise ensure fileBase64 is a valid file.',
      });
    }
    if (looksLikeRawPdfUtf8String(text)) {
      return res.status(400).json({
        message:
          'Extracted data looks like raw PDF bytes, not text. The PDF may be image-based — use resumeText to paste the CV, or a text-based PDF export.',
      });
    }

    const aiResult = (await parseResumeWithAi({ resumeText: text })) || {};
    const fallback = extractStructuredFields(text);

    const aiSkills = aiResult.skills || {};
    let softSkills = normalizeStringArray(aiSkills.soft);
    let techSkills = normalizeStringArray(aiSkills.technical);
    if (!softSkills.length && !techSkills.length) {
      const heuristic = extractSkillsHeuristic(text);
      softSkills = heuristic.soft;
      techSkills = heuristic.technical;
    }

    const normalizedWorkExperience = normalizeWorkExperience(aiResult.workExperience || fallback.workExperience);

    const aiTagObjects = Array.isArray(aiResult.tags)
      ? aiResult.tags
          .map((entry) => {
            if (typeof entry === 'string') return { name: entry };
            if (!entry || typeof entry !== 'object') return null;
            const name = String(entry.name || entry.displayNameHe || entry.displayNameEn || '').trim();
            if (!name) return null;
            return {
              ...entry,
              name,
              raw_type_reason: entry.raw_type_reason || null,
              tag_reason: entry.tag_reason || null,
            };
          })
          .filter(Boolean)
      : [];
    const TAG_TARGET = 15;
    if (aiTagObjects.length < TAG_TARGET) {
      console.warn(
        `[createFromAi] AI returned ${aiTagObjects.length} tags (target ${TAG_TARGET}). ` +
          `Consider tightening the cv_parsing prompt or re-running the request.`,
      );
    }
      //DISABLE CANDIDATE TAGS BY JOB
    const roleCoveredTags = ensureRoleTagCoverage(aiTagObjects, normalizedWorkExperience);

    let tags = normalizeStringArray(roleCoveredTags.map((t) => t.name));
    if (!tags.length && (softSkills.length || techSkills.length)) {
      tags = Array.from(new Set([...softSkills, ...techSkills])).slice(0, 50);
    }

    const aiTagsForSync = roleCoveredTags.length
      ? roleCoveredTags
      : tags.map((name) => ({ name, raw_type_reason: null, tag_reason: null }));

    const persist = buildPersistFieldsFromAiParse(aiResult, fallback);
    const industryAnalysis = {
      ...(typeof fallback.industryAnalysis === 'object' && fallback.industryAnalysis ? fallback.industryAnalysis : {}),
      ...(typeof aiResult.industryAnalysis === 'object' && aiResult.industryAnalysis ? aiResult.industryAnalysis : {}),
    };

    const candidatePayload = {
      ...persist,
      firstName: strOrNull(aiResult.firstName) ?? persist.firstName ?? null,
      lastName: strOrNull(aiResult.lastName) ?? persist.lastName ?? null,
      fullName:
        strOrNull(aiResult.fullName) ??
        strOrNull(fallback.fullName) ??
        persist.fullName ??
        'מועמד חדש',
      professionalSummary:
        strOrNull(aiResult.professionalSummary) ??
        strOrNull(fallback.professionalSummary) ??
        strOrNull(fallback.summary) ??
        persist.professionalSummary ??
        null,
      skills: {
        soft: softSkills.slice(0, 50),
        technical: techSkills.slice(0, 50),
      },
      tags,
      workExperience: normalizedWorkExperience,
      education: normalizeEducation(aiResult.education || fallback.education),
      languages: normalizeLanguages(aiResult.languages || fallback.languages),
      industryAnalysis,
      searchText: text.slice(0, 50000),
      source: strOrNull(aiResult.source) || 'ai-upload',
    };

    const createdCandidate = await candidateService.create(candidatePayload);

    // Audit: 'קליטת קו"ח' — AI-driven CV ingestion
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CV_RECEIVED,
      entityType: 'Candidate',
      entityId: createdCandidate.id,
      entityName: createdCandidate.fullName,
      params: { id: createdCandidate.id },
    });

    // Audit: 'פרסור ניתוח ועיבוד מידע' — AI parsed the resume
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CV_PARSED,
      entityType: 'Candidate',
      entityId: createdCandidate.id,
      entityName: createdCandidate.fullName,
      params: { source: candidatePayload.source || 'ai-upload' },
    });

    // Audit: 'הגדרת מקור גיוס'
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CV_SOURCE,
      entityType: 'Candidate',
      entityId: createdCandidate.id,
      entityName: createdCandidate.fullName,
      params: { source: candidatePayload.source || 'ai-upload' },
    });

    // Audit: 'הגדרת תחום משרה' (candidate field)
    if (candidatePayload.field) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_FIELD,
        entityType: 'Candidate',
        entityId: createdCandidate.id,
        entityName: createdCandidate.fullName,
        params: { job: candidatePayload.field },
      });
    }

    if (fileBase64) {
      await uploadResumeForCandidate(createdCandidate.id, fileBase64, fileName, mimeType);
    }
    void tryEmbedCandidate(createdCandidate.id, text);
    void ensureOrganizationsFromExperience(createdCandidate.workExperience, createdCandidate.id);
    if (aiTagsForSync.length) {
      await candidateTagService.syncTagsForCandidate(createdCandidate.id, aiTagsForSync);

      // Audit: 'הגדרת תגיות' — AI tags synced
      const tagsLabel = aiTagsForSync
        .map((t) => t?.displayNameHe || t?.displayNameEn || t?.tagKey || t?.name)
        .filter(Boolean)
        .slice(0, 12)
        .join(', ');
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_TAGS,
        entityType: 'Candidate',
        entityId: createdCandidate.id,
        entityName: createdCandidate.fullName,
        params: { tags: tagsLabel || `${aiTagsForSync.length} תגיות` },
      });
    }
    await candidateCompletenessService.refreshCandidateDataStatusAfterSave(createdCandidate.id, req);
    const enrichedCandidate = await candidateService.getById(createdCandidate.id);
    const welcomeClientId = await getStaffClientIdFromRequest(req);
    if (sendWelcome) {
      messageTemplateService.queueCandidateWelcomeEmail(enrichedCandidate, { clientId: welcomeClientId });
    }
    res.status(201).json({ candidate: enrichedCandidate, parsed: aiResult });
  } catch (err) {
    console.error('[createFromAi-error]', err);
    res.status(err.status || 500).json({ message: err.message || 'AI candidate creation failed' });
  }
};

const update = async (req, res) => {
  try {
    // Snapshot previous values BEFORE applying the update so we can audit only
    // fields that actually changed.
    let previous = null;
    try {
      previous = await candidateService.getById(req.params.id);
    } catch {
      previous = null;
    }

    const candidate = await candidateService.update(req.params.id, req.body);
    const embedText = [
      candidate.fullName,
      candidate.professionalSummary,
      candidate.searchText,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (embedText.length > 3) {
      void tryEmbedCandidate(candidate.id, embedText);
    }
    const enrichedCandidate = await candidateService.getById(candidate.id);

    const body = req.body || {};
    const candidateLabel = enrichedCandidate.fullName || candidate.fullName;

    // Audit: 'הגדרת מקור גיוס' — only when value actually changed
    if (
      Object.prototype.hasOwnProperty.call(body, 'source') &&
      body.source &&
      valuesDiffer(previous?.source, body.source)
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_SOURCE,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidateLabel,
        params: { source: body.source },
      });
    }
    // Audit: 'הגדרת תחום משרה' (candidate field) — only when changed
    if (
      Object.prototype.hasOwnProperty.call(body, 'field') &&
      body.field &&
      valuesDiffer(previous?.field, body.field)
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CV_FIELD,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidateLabel,
        params: { job: body.field },
      });
    }
    // Audit: 'הגדרת תגיות' — only when the tags list actually changed.
    // We surface the *added* tags in the description so the audit message
    // reflects what was newly attached (matches the row's "נוספו תגיות" template).
    if (
      Object.prototype.hasOwnProperty.call(body, 'tags') &&
      Array.isArray(body.tags) &&
      valuesDiffer(previous?.tags, body.tags)
    ) {
      const tagLabel = (t) =>
        typeof t === 'string'
          ? t
          : t?.displayNameHe || t?.displayNameEn || t?.tagKey || t?.name || '';
      const prevSet = new Set(
        (Array.isArray(previous?.tags) ? previous.tags : []).map(tagLabel).filter(Boolean),
      );
      const nextLabels = body.tags.map(tagLabel).filter(Boolean);
      const added = nextLabels.filter((label) => !prevSet.has(label));
      const labelForAudit = added.length ? added : nextLabels;
      const tagsLabel = labelForAudit.slice(0, 12).join(', ');
      if (tagsLabel) {
        systemEventEmitter.emit(req, {
          ...SYSTEM_EVENTS.CV_TAGS,
          entityType: 'Candidate',
          entityId: candidate.id,
          entityName: candidateLabel,
          params: { tags: tagsLabel },
        });
      }
    }
    // Audit: 'עדכון שפות' — only when the languages array actually changed
    if (
      Object.prototype.hasOwnProperty.call(body, 'languages') &&
      Array.isArray(body.languages) &&
      valuesDiffer(previous?.languages, body.languages)
    ) {
      const languagesLabel = body.languages
        .map((l) => (typeof l === 'string' ? l : `${l?.name || ''} (${l?.level || ''})`))
        .filter(Boolean)
        .slice(0, 8)
        .join(', ');
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.SCREEN_LANGS,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidateLabel,
        params: { languages: languagesLabel || '—' },
      });
    }
    // Audit: 'הודעה פנימית' (candidate internal notes) — only when changed
    if (
      Object.prototype.hasOwnProperty.call(body, 'internalNotes') &&
      body.internalNotes &&
      valuesDiffer(previous?.internalNotes, body.internalNotes)
    ) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.TEAM_INTERNAL,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidateLabel,
        params: { comment: String(body.internalNotes).slice(0, 400) },
      });
    }

    await candidateCompletenessService.refreshCandidateDataStatusAfterSave(candidate.id, req);
    const refreshed = await candidateService.getById(candidate.id);
    res.json(refreshed);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const approveDataCorrections = async (req, res) => {
  try {
    const { id } = req.params;
    const usage = await candidateCompletenessService.resolveUsageSettingsForRequest(req);
    const tagCount = await candidateCompletenessService.countActiveTagsForCandidate(id);
    const row = await candidateService.getById(id);
    const { ok, missing } = candidateCompletenessService.evaluateCandidateDataCompleteness(row, usage, tagCount);
    if (!ok) {
      return res.status(400).json({
        message: 'לא ניתן לאשר: עדיין חסרים שדות חובה לפי הגדרות החברה.',
        missing,
      });
    }
    const updated = await candidateService.update(id, {
      status: candidateCompletenessService.STATUS_ACTIVE,
      statusExplanation: null,
    });
    const label = updated.fullName || row.fullName || '';
    const dbUser = req.dbUser;
    const jwtUser = req.user || {};
    const actor =
      (dbUser && `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim()) ||
      dbUser?.fullName ||
      jwtUser.name ||
      jwtUser.email ||
      null;
    await systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CANDIDATE_DATA_APPROVED,
      entityType: 'Candidate',
      entityId: id,
      entityName: label,
      params: {
        name: label || id,
        fromStatus: candidateCompletenessService.STATUS_INCOMPLETE,
        toStatus: candidateCompletenessService.STATUS_ACTIVE,
        actor: actor || '—',
      },
    });
    res.json(updated);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'אישור תיקונים נכשל' });
  }
};

const remove = async (req, res) => {
  try {
    await candidateService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const createUploadUrl = async (req, res) => {
  const { fileName, contentType, folder = 'profiles', sendWelcomeEmail } = req.body;
  const sendWelcome = sendWelcomeEmail !== false;

  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }

  try {
    const client = createS3Client();
    const safeName = path.basename(fileName);
    const key = `${folder}/${req.params.id}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      // Do not sign ContentType or checksum constraints
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    try {
      if (sendWelcome) {
        const candidateRow = await candidateService.getById(req.params.id);
        const welcomeClientId = await getStaffClientIdFromRequest(req);
        messageTemplateService.queueCandidateWelcomeEmail(candidateRow, {
          onlyIfNoResume: true,
          clientId: welcomeClientId,
        });
      }
    } catch (welcomeErr) {
      console.warn('[createUploadUrl] welcome email skipped', welcomeErr?.message || welcomeErr);
    }
    res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

const attachMedia = async (req, res) => {
  const { key, type } = req.body;
  if (!key || !type) {
    return res.status(400).json({ message: 'key and type are required' });
  }

  try {
    const field = type === 'resume' ? 'resumeUrl' : 'profilePicture';
    const url = buildPublicUrl(key);
    console.log('[attachMedia] candidate', req.params.id, { key, type, field, url });
    const baseCandidate = await candidateService.update(req.params.id, { [field]: url });
    if (type === 'resume') {
      const extraText = await fetchResumeText(url, baseCandidate.id);
      console.log('[attachMedia] resume extraText length', baseCandidate.id, extraText ? extraText.length : 0);
      // Persist raw text for search/embedding + allow downstream keyword match
      const baseUpdates = extraText && extraText.trim()
        ? { searchText: extraText.slice(0, 50000) }
        : {};

      // Prefer AI parsing (Gemini) to populate candidate fields; fallback to regex parsing.
      let mergedUpdates = { ...baseUpdates };
      let aiTagEntries = [];
      try {
        const ai = await parseResumeWithAi({ resumeText: extraText || '' });
        if (ai && typeof ai === 'object') {
          const candidateUpdates = { ...buildPersistFieldsFromAiParse(ai, {}) };
          if (
            ai.industryAnalysis &&
            typeof ai.industryAnalysis === 'object' &&
            Object.keys(ai.industryAnalysis).length
          ) {
            const prev =
              baseCandidate.industryAnalysis && typeof baseCandidate.industryAnalysis === 'object'
                ? baseCandidate.industryAnalysis
                : {};
            candidateUpdates.industryAnalysis = { ...prev, ...ai.industryAnalysis };
          }

          // Skills: merge into candidate.skills (JSONB)
          const softFromAi = normalizeStringArray(ai.skills?.soft);
          const techFromAi = normalizeStringArray(ai.skills?.technical);
          if (softFromAi.length || techFromAi.length) {
            const existingSkills = baseCandidate.skills && typeof baseCandidate.skills === 'object'
              ? baseCandidate.skills
              : { soft: [], technical: [] };
            const existingSoft = normalizeStringArray(existingSkills.soft);
            const existingTech = normalizeStringArray(existingSkills.technical);
            candidateUpdates.skills = {
              soft: Array.from(new Set([...existingSoft, ...softFromAi])).slice(0, 50),
              technical: Array.from(new Set([...existingTech, ...techFromAi])).slice(0, 50),
            };
          }

          // If Gemini returned empty/missing skills, do a dedicated skills extraction pass (Gemini), then fallback heuristic.
          const currentSoft = normalizeStringArray(candidateUpdates.skills?.soft);
          const currentTech = normalizeStringArray(candidateUpdates.skills?.technical);
          if ((!currentSoft.length && !currentTech.length) && (extraText || '').trim().length > 50) {
            try {
              const skillsOnly = await parseSkillsWithAi({ resumeText: extraText });
              const soft2 = normalizeStringArray(skillsOnly?.skills?.soft);
              const tech2 = normalizeStringArray(skillsOnly?.skills?.technical);
              if (soft2.length || tech2.length) {
                const existingSkills = baseCandidate.skills && typeof baseCandidate.skills === 'object'
                  ? baseCandidate.skills
                  : { soft: [], technical: [] };
                const existingSoft = normalizeStringArray(existingSkills.soft);
                const existingTech = normalizeStringArray(existingSkills.technical);
                candidateUpdates.skills = {
                  soft: Array.from(new Set([...existingSoft, ...soft2])).slice(0, 50),
                  technical: Array.from(new Set([...existingTech, ...tech2])).slice(0, 50),
                };
                console.log('[attachMedia-ai] skills second-pass', baseCandidate.id, { soft: soft2.length, technical: tech2.length });
              } else {
                const heur = extractSkillsHeuristic(extraText);
                if (heur.soft.length || heur.technical.length) {
                  candidateUpdates.skills = {
                    soft: heur.soft,
                    technical: heur.technical,
                  };
                  console.log('[attachMedia-ai] skills heuristic', baseCandidate.id, { soft: heur.soft.length, technical: heur.technical.length });
                } else {
                  console.log('[attachMedia-ai] skills still empty after second-pass + heuristic', baseCandidate.id);
                }
              }
            } catch (e) {
              console.error('[attachMedia-ai] skills second-pass error', baseCandidate.id, e.message || e);
            }
          }

          aiTagEntries = Array.isArray(ai.tags) ? ai.tags : [];

          const exp = normalizeWorkExperience(ai.workExperience);
          if (exp.length) candidateUpdates.workExperience = exp;

          const edu = normalizeEducation(ai.education);
          if (edu.length) candidateUpdates.education = edu;

          const langs = normalizeLanguages(ai.languages);
          if (langs.length) candidateUpdates.languages = langs;

          mergedUpdates = { ...mergedUpdates, ...candidateUpdates };
          console.log('[attachMedia-ai]', baseCandidate.id, 'updates keys', Object.keys(candidateUpdates));
        } else {
          console.log('[attachMedia-ai]', baseCandidate.id, 'no ai result, fallback to regex');
          const fallback = buildParsedUpdates(baseCandidate, extraText);
          mergedUpdates = { ...mergedUpdates, ...fallback };
        }
      } catch (e) {
       
      }

      const needsUpdate = Object.keys(mergedUpdates).length > 0;
      if (needsUpdate) {
        await candidateService.update(baseCandidate.id, mergedUpdates);
      }
      if (aiTagEntries.length) {

        await candidateTagService.syncTagsForCandidate(baseCandidate.id, aiTagEntries);
      }
      // Fire-and-forget embedding with extra text
      void tryEmbedCandidate(baseCandidate.id, extraText);
      const refreshedCandidate = await candidateService.getById(baseCandidate.id);
      await ensureOrganizationsFromExperience(refreshedCandidate.workExperience, refreshedCandidate.id);
      return res.json(refreshedCandidate);
    }
    res.json(baseCandidate);
  } catch (err) {
    console.error('[attachMedia-error]', req.params.id, err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to attach media' });
  }
};

/**
 * Store resume bytes in S3 only (no candidate row update). Use when uploading multiple
 * files so a single `candidateService.update` can set `resumeUrl` + `documents` together.
 * @returns {Promise<{ publicUrl: string, key: string, size: number } | null>}
 */
const putResumeFileInS3 = async (candidateId, fileBase64, filename, mimeType) => {
  if (!fileBase64) return null;
  const buffer = Buffer.from(fileBase64, 'base64');
  const name = filename ? path.basename(filename) : `resume-${Date.now()}.bin`;
  const key = `resumes/${candidateId}/${Date.now()}-${name}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  });
  const client = createS3Client();
  await client.send(command);
  const publicUrl = buildPublicUrl(key);
  return { publicUrl, key, size: buffer.length };
};

const uploadResumeForCandidate = async (candidateId, fileBase64, filename, mimeType) => {
  const out = await putResumeFileInS3(candidateId, fileBase64, filename, mimeType);
  if (!out) return null;
  await candidateService.update(candidateId, { resumeUrl: out.publicUrl });
  return out.publicUrl;
};

// Rebuild embeddings for all candidates with resumeUrl (best-effort)
const rewriteDriveUrl = (url) => {
  try {
    const m = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://drive.google.com/uc?export=download&id=${m[1]}`;
    }
    return url;
  } catch {
    return url;
  }
};

const rewriteDocsExportTxt = (url) => {
  try {
    const m = url.match(/https:\/\/docs\.google\.com\/document\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://docs.google.com/document/d/${m[1]}/export?format=txt`;
    }
    return url;
  } catch {
    return url;
  }
};

const rewriteSheetsExportCsv = (url) => {
  try {
    const m = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
    }
    return url;
  } catch {
    return url;
  }
};

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractFromBuffer = async (buffer, ct) => {
  const contentType = (ct || '').toLowerCase();
  const magic4 = buffer.slice(0, 4).toString('utf8');
  const magic2 = buffer.slice(0, 2).toString('binary');
  const looksPdf = magic4 === '%PDF';
  const looksZip = magic2 === 'PK';

  try {
    // Prefer magic-number detection, then fall back to content-type hints
    if (looksPdf || contentType.includes('pdf') || isPdfMagicBuffer(buffer)) {
      return await extractTextFromPdfBuffer(buffer);
    }

    if (
      looksZip ||
      contentType.includes('officedocument') ||
      contentType.includes('wordprocessingml') ||
      contentType.includes('msword') ||
      contentType.includes('application/octet-stream')
    ) {
      try {
        const resDoc = await mammoth.extractRawText({ buffer });
        if (resDoc.value) return resDoc.value;
      } catch (e) {
        console.log('[embed-parse-doc-error]', e.message || e);
      }
    }

    // Wrong content-type (e.g. application/octet-stream) but file is a valid PDF
    try {
      await pdfParse(buffer);
      return await extractTextFromPdfBuffer(buffer);
    } catch (e) {
      // not a parseable PDF; continue
    }

    // Do not return UTF-8 decoded PDF/DOCX bytes as "text" — it breaks AI parsing (hallucinated candidates).
    if (isPdfMagicBuffer(buffer)) {
      return '';
    }
    if (
      looksZip ||
      contentType.includes('officedocument') ||
      contentType.includes('wordprocessingml') ||
      contentType.includes('msword')
    ) {
      return '';
    }

    const asText = buffer.toString('utf8');
    if (asText && asText.trim()) return asText;
  } catch (e) {
    console.log('[embed-parse-error]', e.message || e);
  }
  return '';
};

const fetchResumeText = async (resumeUrl, candidateIdForLog = '') => {
  let extraText = '';
  try {
    let fetchUrl = resumeUrl;
    if (fetchUrl.includes('docs.google.com/document/d/')) {
      fetchUrl = rewriteDocsExportTxt(fetchUrl);
    } else if (fetchUrl.includes('docs.google.com/spreadsheets/d/')) {
      fetchUrl = rewriteSheetsExportCsv(fetchUrl);
    } else if (fetchUrl.includes('drive.google.com/file/d/')) {
      fetchUrl = rewriteDriveUrl(fetchUrl);
    }

    const resp = await fetch(fetchUrl);
    const ct = resp.headers.get('content-type') || '';
    console.log('[embed-fetch]', candidateIdForLog, { fetchUrl, status: resp.status, contentType: ct });
    if (resp.ok) {
      if (ct.startsWith('text/') || ct.includes('json') || ct.includes('html') || ct.includes('csv')) {
        const raw = await resp.text();
        extraText = ct.includes('html') ? stripHtml(raw) : raw;
        console.log('[embed-fetch]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else if (ct.includes('pdf') || ct.includes('officedocument') || ct.includes('msword') || ct.includes('application/octet-stream')) {
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        extraText = await extractFromBuffer(buf, ct);
        console.log('[embed-fetch-binary]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else if (ct.startsWith('image/')) {
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        extraText = await extractTextFromImageBuffer(buf);
        console.log('[embed-fetch-ocr]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else {
        console.log('[embed-fetch-skip]', candidateIdForLog, 'unsupported content-type');
      }
    } else {
      console.log('[embed-fetch-skip]', candidateIdForLog, 'status not ok');
    }
  } catch (e) {
    console.log('[embed-fetch-error]', candidateIdForLog, e.message || e);
  }
  return extraText;
};

const extFromContentType = (ct) => {
  const c = (ct || '').toLowerCase();
  if (c.includes('pdf')) return 'pdf';
  if (c.includes('wordprocessingml')) return 'docx';
  if (c.includes('msword')) return 'doc';
  if (c.includes('rtf')) return 'rtf';
  if (c.includes('plain')) return 'txt';
  return 'bin';
};

/** Download candidate resume bytes for email attachment (S3/public URL). */
const fetchResumeBinaryForMail = async (resumeUrl, candidateIdForLog = '') => {
  if (!resumeUrl || typeof resumeUrl !== 'string') return null;
  try {
    let fetchUrl = resumeUrl;
    if (fetchUrl.includes('docs.google.com/document/d/')) {
      fetchUrl = rewriteDocsExportTxt(fetchUrl);
    } else if (fetchUrl.includes('docs.google.com/spreadsheets/d/')) {
      fetchUrl = rewriteSheetsExportCsv(fetchUrl);
    } else if (fetchUrl.includes('drive.google.com/file/d/')) {
      fetchUrl = rewriteDriveUrl(fetchUrl);
    }

    const resp = await fetch(fetchUrl);
    const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!resp.ok) {
      console.log('[resume-binary-fetch]', candidateIdForLog, 'status', resp.status);
      return null;
    }
    if (ct.includes('text/html') && /google|docs\.google/.test(fetchUrl)) {
      console.warn('[resume-binary-fetch]', candidateIdForLog, 'unexpected html from docs url');
      return null;
    }

    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (!buffer.length) return null;

    const ext = extFromContentType(ct);
    return {
      buffer,
      contentType: ct || 'application/octet-stream',
      filename: `resume.${ext}`,
    };
  } catch (e) {
    console.log('[resume-binary-fetch-error]', candidateIdForLog, e.message || e);
    return null;
  }
};

const extractStructuredFields = (text) => {
  if (!text) return {};
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  const pipeParts = firstLine.split('|').map((p) => p.trim()).filter(Boolean);
  const nameCandidate = (() => {
    const raw = pipeParts[0] ? pipeParts[0].split(',')[0].trim() : firstLine.split(',')[0].trim();
    if (!raw) return undefined;
    if (/\d/.test(raw) || raw.includes('@')) return undefined;
    if (raw.length < 2 || raw.length > 80) return undefined;
    return raw;
  })();
  const phoneRegex = /(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/;
  const addressCandidate = (() => {
    const candidates = pipeParts.slice(1);
    for (const part of candidates) {
      if (!part) continue;
      if (part.includes('@')) continue;
      if (phoneRegex.test(part)) continue;
      if (part.length < 2 || part.length > 80) continue;
      return part;
    }
    return undefined;
  })();
  const genderCandidate = (() => {
    const lower = text.toLowerCase();
    if (lower.includes('נקבה') || lower.includes('female')) return 'female';
    if (lower.includes('זכר') || lower.includes('male')) return 'male';
    return undefined;
  })();
  const titleLine = lines.find(
    (l) =>
      l.length >= 4 &&
      l.length <= 80 &&
      !l.includes('@') &&
      !/\d{4,}/.test(l),
  );
  const summary = text.slice(0, 600);
  const linesLower = lines.map((l) => l.toLowerCase());
  const collectSections = (keywords, stopKeywords) => {
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = linesLower[i];
      if (!keywords.some((k) => lower.includes(k))) continue;
      let acc = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        const lwr = linesLower[j];
        if (!line) {
          if (acc.length) {
            sections.push(acc.join(' '));
            acc = [];
          }
          continue;
        }
        if (keywords.some((k) => lwr.includes(k))) break; // next same header
        if (stopKeywords.some((k) => lwr.includes(k))) break; // other header
        if (/^(skills|כישורים|summary|סיכום|about|אודות)/i.test(line)) break;
        acc.push(line.trim());
      }
      if (acc.length) sections.push(acc.join(' '));
    }
    return sections;
  };
  const experienceBlocks = collectSections(
    [
      'נסיון',
      'ניסיון',
      'experience',
      'employment',
      'work history',
      'professional experience',
      'career history',
      'תעסוקה',
      'עבודה',
    ],
    ['השכלה', 'education', 'degree', 'תואר', 'לימודים', 'certification', 'תעודה', 'studies', 'academy'],
  );
  const educationBlocks = collectSections(
    [
      'השכלה',
      'education',
      'degree',
      'degrees',
      'תואר',
      'לימודים',
      'certification',
      'certifications',
      'תעודה',
      'studies',
      'academy',
      'academic',
      'bachelor',
      'master',
      'phd',
      'university',
      'college',
    ],
    ['נסיון', 'ניסיון', 'experience', 'employment', 'work history', 'professional experience', 'career history', 'תעסוקה', 'עבודה'],
  );
  const experienceCards = [];
  experienceBlocks.forEach((block) => {
    const segments = [];
    const rangeRegex = /(20\d{2}|19\d{2})\s*[–-]\s*(present|כיום|20\d{2}|19\d{2})/gi;
    const indices = [];
    let m;
    while ((m = rangeRegex.exec(block)) !== null) {
      indices.push({ index: m.index, sy: m[1], eyRaw: m[2] });
    }
    if (indices.length > 0) {
      indices.forEach((item, idx) => {
        const start = item.index;
        const end = idx + 1 < indices.length ? indices[idx + 1].index : block.length;
        const snippet = block.slice(start, end).trim();
        if (!snippet) return;
        const ey = /present|כיום/i.test(item.eyRaw) ? 'Present' : item.eyRaw;
        segments.push({
          sy: item.sy,
          ey,
          text: snippet,
        });
      });
    } else {
      segments.push({ sy: '2000', ey: '2000', text: block.trim() });
    }

    segments.forEach((seg) => {
      const sy = seg.sy || '2000';
      const ey = seg.ey || sy;
      experienceCards.push({
        id: experienceCards.length + 1,
        title: seg.text.split('.')[0] || `ניסיון ${sy}${ey ? `-${ey}` : ''}`,
        company: '',
        companyField: '',
        startDate: `${sy}-01`,
        endDate: /present|כיום/i.test(ey) ? 'Present' : ey === sy ? `${ey}-12` : `${ey}-12`,
        description: seg.text,
      });
    });
  });
  const educationCards = educationBlocks.map((block, idx) => ({
    id: idx + 1,
    value: block,
  }));

  // Fallback: if no experience blocks, try year-based lines
  if (experienceCards.length === 0) {
    const yearLines = lines
      .filter((l) => /(20\d{2}|19\d{2})/.test(l))
      .map((l) => l.trim())
      .filter(Boolean);
    if (yearLines.length) {
      experienceCards.push(
        ...yearLines.map((l, idx) => {
          const m = l.match(/(20\d{2}|19\d{2}).{0,10}(20\d{2}|19\d{2}|כיום|present)/i);
          const single = l.match(/(20\d{2}|19\d{2})/);
          const sy = m ? m[1] : single ? single[1] : '2000';
          const eyRaw = m ? m[2] : sy;
          const ey = /כיום|present/i.test(eyRaw) ? 'Present' : eyRaw;
          return {
            id: idx + 1,
            title: l,
            company: '',
            companyField: '',
            startDate: `${sy}-01`,
            endDate: ey === sy ? `${ey}-12` : ey === 'Present' ? 'Present' : `${ey}-12`,
            description: l,
          };
        }),
      );
    }
  }

  // Fallback: if no education blocks, look for common edu keywords per line
  if (educationCards.length === 0) {
    const eduLines = lines
      .filter((l) =>
        /(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma)/i.test(l),
      )
      .map((l) => l.trim())
      .filter(Boolean);
    if (eduLines.length) {
      eduLines.forEach((l, idx) => educationCards.push({ id: idx + 1, value: l }));
    }
  }

  // Final fallbacks: ensure at least one card is created so UI shows data
  if (experienceCards.length === 0 && text && text.trim().length > 30) {
    const snippet = text.trim().slice(0, 220);
    experienceCards.push({
      id: 1,
      title: snippet.split('.')[0] || 'ניסיון תעסוקתי',
      company: '',
      companyField: '',
      startDate: '2000-01',
      endDate: '2000-12',
      description: snippet,
    });
  }
  if (educationCards.length === 0) {
    const eduMatch = text.match(/.{0,50}(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma).{0,80}/i);
    const eduText = eduMatch ? eduMatch[0].trim() : text.trim().slice(0, 150);
    if (eduText) {
      educationCards.push({ id: 1, value: eduText });
    }
  }

  return {
    email: emailMatch ? emailMatch[0] : undefined,
    phone: phoneMatch ? phoneMatch[0] : undefined,
    fullName: nameCandidate,
    address: addressCandidate,
    gender: genderCandidate,
    title: titleLine,
    professionalSummary: summary,
    workExperience: experienceCards,
    education: educationCards,
  };
};

const buildParsedUpdates = (candidate, text) => {
  const parsed = extractStructuredFields(text);
  const updates = {};
  if (parsed.email && parsed.email !== candidate.email) updates.email = parsed.email;
  if (parsed.phone && parsed.phone !== candidate.phone) updates.phone = parsed.phone;
  if (parsed.fullName && parsed.fullName !== candidate.fullName) updates.fullName = parsed.fullName;
  if (parsed.address && parsed.address !== candidate.address) updates.address = parsed.address;
  if (parsed.gender && parsed.gender !== candidate.gender) updates.gender = parsed.gender;
  if (parsed.title && parsed.title !== candidate.title) updates.title = parsed.title;
  if (parsed.professionalSummary && parsed.professionalSummary !== candidate.professionalSummary) {
    updates.professionalSummary = parsed.professionalSummary;
  }
  if (parsed.workExperience && parsed.workExperience.length) {
    updates.workExperience = parsed.workExperience
      .map((item, idx) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (!text) return null;
          const yearMatch = text.match(/(20\d{2}|19\d{2})/);
          const year = yearMatch ? `${yearMatch[1]}-01` : '2000-01';
          return {
            id: idx + 1,
            title: text,
            company: '',
            companyField: '',
            startDate: year,
            endDate: year,
            description: text,
          };
        }
        if (item && typeof item === 'object') {
          const title = item.title || item.value || item.description || '';
          const description = item.description || title;
          if (!title && !description) return null;
          const startDate = item.startDate || '2000-01';
          const endDate = item.endDate || startDate;
          return {
            id: item.id || idx + 1,
            title: title || 'ניסיון תעסוקתי',
            company: item.company || '',
            companyField: item.companyField || '',
            startDate,
            endDate,
            description,
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (parsed.education && parsed.education.length) {
    updates.education = parsed.education
      .map((item, idx) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (!text) return null;
          return { id: idx + 1, value: text };
        }
        if (item && typeof item === 'object') {
          const val = item.value || item.title || item.description || '';
          if (!val) return null;
          return { id: item.id || idx + 1, value: val };
        }
        return null;
      })
      .filter(Boolean);
  }
  return updates;
};

const rebuildAllEmbeddings = async (_req, res) => {
  try {
    const candidates = await candidateService.list();
    let success = 0;
    let fail = 0;

    for (const c of candidates) {
      try {
        let extraText = '';
        if (c.resumeUrl) {
          extraText = await fetchResumeText(c.resumeUrl, c.id);
        }
        const updates = buildParsedUpdates(c, extraText);
        if (Object.keys(updates).length) {
          await candidateService.update(c.id, updates);
        }
        await embedCandidateAndSave(c.id, extraText);
        success++;
      } catch (e) {
        fail++;
        console.error('rebuildAllEmbeddings failed', c.id, e.message || e);
      }
    }

    res.json({ success, fail, total: candidates.length });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to rebuild embeddings' });
  }
};

// Rebuild embedding from stored candidate data (optionally with extra CV text)
const rebuildEmbedding = async (req, res) => {
  try {
    const { extraText } = req.body || {};
    const embedding = await embedCandidateAndSave(req.params.id, extraText || '');
    res.json({ embedding });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to rebuild embedding' });
  }
};

// Semantic search endpoint
const semanticSearch = async (req, res) => {
  try {
    const { query, filters, limit } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ message: 'query is required' });
    }
    const results = await searchCandidates({ query, filters, limit: limit || 20 });
    res.json(results);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Semantic search failed' });
  }
};

// Lightweight free-text search on name / title / source only
const freeSearch = async (req, res) => {
  try {
    const { query, limit } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ message: 'query is required' });
    }
    const results = await candidateService.searchFree({ query, limit: limit || 50 });
    res.json(results);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Free search failed' });
  }
};

// Generate internal opinion (חוות דעת פנימית) via LLM for candidate + job context
const generateInternalOpinion = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'Gemini API key not configured' });
    }

    let promptRow;
    try {
      promptRow = await promptService.getById('internal_opinion');
    } catch {
      promptRow = null;
    }
    const template = promptRow?.template || `אתה מומחה גיוס בכיר. כתוב חוות דעת פנימית מקצועית בעברית על מועמד בהתאם למשרה.
החזר HTML עם <p>, <h3>, <ul>, <li>, <strong>. נתוני המועמד: {{candidate_summary}}. נתוני המשרה: {{job_context}}.`;

    const candidateSummary = [
      `שם: ${candidate.fullName || 'לא צוין'}`,
      `תפקיד נוכחי: ${candidate.title || 'לא צוין'}`,
      `סיכום: ${candidate.professionalSummary || 'אין'}`,
      `ניסיון: ${JSON.stringify(candidate.workExperience || [], null, 0)}`,
      `כישורים: ${JSON.stringify(candidate.skills || {}, null, 0)}`,
    ].join('\n');

    const body = req.body || {};
    const jobContext = body.jobTitle || body.title
      ? [
          `משרה: ${body.jobTitle || body.title}`,
          `תיאור: ${body.jobDescription || body.description || 'אין'}`,
          `דרישות: ${Array.isArray(body.requirements) ? body.requirements.join('; ') : (body.requirements || 'אין')}`,
        ].join('\n')
      : 'לא סופקה משרה ספציפית. כתוב חוות דעת כללית על המועמד.';

    const systemPrompt = template
      .replace(/\{\{candidate_summary\}\}/g, candidateSummary)
      .replace(/\{\{job_context\}\}/g, jobContext);

    const text = await sendChat({
      apiKey,
      systemPrompt,
      history: [],
      message: 'צור את חוות הדעת המקצועית עכשיו בפורמט HTML.',
    });

    const html = (text && text.trim()) ? text.trim() : '<p>לא התקבלה תשובה מהמערכת.</p>';
    res.json({ html });
  } catch (err) {
    console.error('[generateInternalOpinion]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate internal opinion' });
  }
};

/** Explicit job–candidate links (job_candidates + jobs) for “התעניינות במשרה”. */
const listLinkedJobs = async (req, res) => {
  try {
    const candidateId = req.params.id;
    const rows = await jobCandidateService.listForCandidate(candidateId);
    res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.json(rows);
  } catch (err) {
    console.error('[listLinkedJobs]', err.message || err);
    res.status(400).json({ message: err.message || 'Failed to list linked jobs' });
  }
};

/** Update status on a job_candidates row (e.g. from InterestedInJobs modal). */
const patchJobLinkStatus = async (req, res) => {
  try {
    const { jobCandidateId } = req.params;
    const body = req.body || {};
    const { status, internalNote, dueDate, dueTime, inviteCandidate, inviteClient } = body;
    if (status === undefined || status === null || String(status).trim() === '') {
      return res.status(400).json({ message: 'status is required' });
    }
    const jc = await JobCandidate.findByPk(jobCandidateId);
    if (!jc) {
      return res.status(404).json({ message: 'Job link not found' });
    }
    const prevMeta =
      jc.workflowMeta && typeof jc.workflowMeta === 'object' && !Array.isArray(jc.workflowMeta)
        ? { ...jc.workflowMeta }
        : {};
    if (internalNote !== undefined) {
      prevMeta.internalNote =
        internalNote === null || internalNote === '' ? null : String(internalNote).trim();
    }
    if (dueDate !== undefined) {
      prevMeta.dueDate = dueDate === null || dueDate === '' ? null : String(dueDate).trim();
    }
    if (dueTime !== undefined) {
      prevMeta.dueTime = dueTime === null || dueTime === '' ? null : String(dueTime).trim();
    }
    if (inviteCandidate !== undefined) {
      prevMeta.inviteCandidate = Boolean(inviteCandidate);
    }
    if (inviteClient !== undefined) {
      prevMeta.inviteClient = Boolean(inviteClient);
    }
    const prevStatus = jc.status;
    prevMeta.workflowUpdatedAt = new Date().toISOString();
    const newStatus = String(status).trim();
    await jc.update({ status: newStatus, workflowMeta: prevMeta });

    // Resolve a friendly candidate label for the audit description.
    let candidateLabel = null;
    try {
      const cand = await Candidate.findByPk(jc.candidateId, { attributes: ['id', 'fullName', 'email'] });
      candidateLabel = cand?.fullName || cand?.email || null;
    } catch {
      // ignore — label is optional
    }

    // Audit: 'סטטוס השתנה'
    if (prevStatus !== newStatus) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CANDIDATE_STATUS,
        entityType: 'Candidate',
        entityId: jc.candidateId,
        entityName: candidateLabel,
        params: {
          candidate: candidateLabel || jc.candidateId,
          status: newStatus,
        },
      });
    }
    // Audit: 'עדכון תאריך יעד'
    if (dueDate !== undefined && prevMeta.dueDate) {
      const dateStr = prevMeta.dueTime
        ? `${prevMeta.dueDate} ${prevMeta.dueTime}`
        : prevMeta.dueDate;
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.CANDIDATE_DUE_DATE,
        entityType: 'Candidate',
        entityId: jc.candidateId,
        entityName: candidateLabel,
        params: { date: dateStr },
      });
    }
    // Audit: 'הודעה פנימית' (link-level)
    if (internalNote !== undefined && prevMeta.internalNote) {
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.TEAM_INTERNAL,
        entityType: 'Candidate',
        entityId: jc.candidateId,
        entityName: candidateLabel,
        params: { comment: String(prevMeta.internalNote).slice(0, 400) },
      });
    }

    res.set('Cache-Control', 'private, no-store');
    return res.json(jc.get({ plain: true }));
  } catch (err) {
    console.error('[patchJobLinkStatus]', err.message || err);
    return res.status(500).json({ message: err.message || 'Failed to update job link status' });
  }
};

// Get 1–5 most relevant jobs for this candidate (from JobCandidate + Job by fit), with match percentage.
// Uses this candidate's embedding only so each candidate gets their own ranked list. No caching.
const getRelevantJobs = async (req, res) => {
  try {
    const candidateId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);

    // Load this candidate's embedding directly from DB (avoid any mapping that could drop it)
    let candidateRow = await Candidate.findByPk(candidateId, {
      attributes: ['id', 'embedding', 'matchScore'],
    });
    if (!candidateRow) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    let candidateEmb = normalizeEmbedding(candidateRow.embedding);
    if (!candidateEmb || !candidateEmb.length) {
      try {
        await embedCandidateAndSave(candidateId);
        candidateRow = await Candidate.findByPk(candidateId, { attributes: ['id', 'embedding', 'matchScore'] });
        candidateEmb = normalizeEmbedding(candidateRow?.embedding);
      } catch (e) {
        console.warn('[getRelevantJobs] embedding rebuild failed', e.message);
      }
    }

    let rejectedJobIds = new Set();
    if (await jobCandidateScreeningHasRejectionColumns()) {
      try {
        const rejectedRows = await JobCandidateScreening.findAll({
          where: { candidateId, screeningStatus: 'rejected' },
          attributes: ['jobId'],
        });
        rejectedJobIds = new Set(rejectedRows.map((r) => String(r.jobId)));
      } catch (e) {
        if (isMissingScreeningRejectionColumnError(e)) {
          screeningRejectionColumnsCache = false;
        } else {
          throw e;
        }
      }
    }

    const seenJobIds = new Set();
    const results = [];
    const defaultMatch = candidateRow.matchScore != null ? candidateRow.matchScore : 85;

    // 1) Jobs already linked to this candidate (JobCandidate) – candidate-specific
    const jobCandidateRecords = await JobCandidate.findAll({
      where: { candidateId },
      include: [{ model: Job, as: 'job', required: true }],
    });

    for (const jc of jobCandidateRecords) {
      const job = jc.job;
      if (!job || seenJobIds.has(job.id) || rejectedJobIds.has(String(job.id))) continue;
      seenJobIds.add(job.id);
      const jobData = job.toJSON ? job.toJSON() : job;
      results.push({
        job: jobData,
        matchPercentage: typeof jc.matchScore === 'number' ? jc.matchScore : defaultMatch,
        source: 'job_candidate',
      });
    }

    // 2) Open jobs scored by similarity to THIS candidate's embedding only
    const allJobs = await Job.findAll({
      where: { openPositions: 1 },
      limit: 100,
    });

    if (candidateEmb && candidateEmb.length) {
      const scored = [];
      for (const job of allJobs) {
        if (seenJobIds.has(job.id) || rejectedJobIds.has(String(job.id))) continue;
        const jobText = [
          job.title,
          job.description,
          Array.isArray(job.requirements) ? job.requirements.join(' ') : '',
        ].filter(Boolean).join(' ');
        if (!jobText.trim()) continue;
        try {
          const jobEmb = await embedText(jobText.slice(0, 8000));
          if (!jobEmb || !jobEmb.length || jobEmb.length !== candidateEmb.length) continue;
          const sim = cosineSimilarity(candidateEmb, jobEmb);
          if (sim < 0.2) continue;
          const matchPercentage = Math.round(Math.max(0, Math.min(100, (sim + 0.3) * 80)));
          scored.push({ job, matchPercentage });
        } catch (e) {
          // skip job on embed error
        }
      }
      scored.sort((a, b) => b.matchPercentage - a.matchPercentage);
      const toTake = limit - results.length;
      for (const { job, matchPercentage } of scored.slice(0, toTake)) {
        const jobData = job.toJSON ? job.toJSON() : job;
        results.push({ job: jobData, matchPercentage, source: 'match' });
      }
    }

    // Sort full list by match percentage descending so order is always by relevance for this candidate
    results.sort((a, b) => (b.matchPercentage ?? 0) - (a.matchPercentage ?? 0));
    const out = results
      .slice(0, limit)
      .map((r) => ({ ...r.job, matchPercentage: r.matchPercentage }));

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(out);
  } catch (err) {
    console.error('[getRelevantJobs]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to get relevant jobs' });
  }
};

// Get all screening data for a candidate (keyed by jobId)
const getScreeningData = async (req, res) => {
  const candidateId = req.params.id;
  const baseAttrs = ['jobId', 'screeningAnswers', 'telephoneImpression', 'internalOpinion'];
  const load = async (forceCoreOnly) => {
    const hasReject = forceCoreOnly
      ? false
      : await jobCandidateScreeningHasRejectionColumns({ forceRefresh: true });
    const attrs = hasReject
      ? [...baseAttrs, 'screeningStatus', 'rejectionReason', 'rejectionNotes']
      : baseAttrs;
    const rows = await JobCandidateScreening.findAll({
      where: { candidateId },
      attributes: attrs,
    });
    const byJob = {};
    for (const r of rows) {
      const jid = r.jobId;
      byJob[jid] = {
        screeningAnswers: r.screeningAnswers || [],
        telephoneImpression: r.telephoneImpression || '',
        internalOpinion: r.internalOpinion || '',
        screeningStatus: hasReject ? (r.screeningStatus || 'open') : 'open',
        rejectionReason: hasReject ? (r.rejectionReason || '') : '',
        rejectionNotes: hasReject ? (r.rejectionNotes || '') : '',
      };
    }
    return byJob;
  };
  try {
    let byJob;
    try {
      byJob = await load(false);
    } catch (err) {
      if (!isMissingScreeningRejectionColumnError(err)) throw err;
      screeningRejectionColumnsCache = false;
      byJob = await load(true);
    }
    res.json(byJob);
  } catch (err) {
    console.error('[getScreeningData]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to get screening data' });
  }
};

// Upsert screening data for one candidate + job (triggered after user stops typing)
const saveScreeningData = async (req, res) => {
  const candidateId = req.params.id;
  const {
    jobId,
    screeningAnswers,
    telephoneImpression,
    internalOpinion,
    screeningStatus,
    rejectionReason,
    rejectionNotes,
  } = req.body || {};

  const upsert = async (forceCoreOnly) => {
    if (!jobId) {
      const e = new Error('jobId is required');
      e.status = 400;
      throw e;
    }
    const answers = Array.isArray(screeningAnswers) ? screeningAnswers : [];
    const impression = typeof telephoneImpression === 'string' ? telephoneImpression : '';
    const opinion = typeof internalOpinion === 'string' ? internalOpinion : null;
    const hasReject = forceCoreOnly
      ? false
      : await jobCandidateScreeningHasRejectionColumns({ forceRefresh: true });

    const coreFields = ['candidateId', 'jobId', 'screeningAnswers', 'telephoneImpression', 'internalOpinion'];
    /** Sequelize needs primary key `id` on the instance for `.update()` — never omit it in attributes. */
    const coreAttrsForLoad = ['id', ...coreFields];

    if (!hasReject) {
      let row = await JobCandidateScreening.findOne({
        where: { candidateId, jobId },
        attributes: coreAttrsForLoad,
      });
      if (row) {
        await row.update(
          { screeningAnswers: answers, telephoneImpression: impression, internalOpinion: opinion },
          { fields: ['screeningAnswers', 'telephoneImpression', 'internalOpinion'] },
        );
      } else {
        row = await JobCandidateScreening.create(
          {
            candidateId,
            jobId,
            screeningAnswers: answers,
            telephoneImpression: impression,
            internalOpinion: opinion,
          },
          { fields: coreFields },
        );
      }
      return {
        jobId,
        screeningAnswers: row.screeningAnswers,
        telephoneImpression: row.telephoneImpression,
        internalOpinion: row.internalOpinion || '',
        screeningStatus: 'open',
        rejectionReason: '',
        rejectionNotes: '',
      };
    }

    const rejectFields = ['screeningStatus', 'rejectionReason', 'rejectionNotes'];
    const allAttrs = [...coreFields, ...rejectFields];
    const allAttrsForLoad = ['id', ...allAttrs];
    const st = typeof screeningStatus === 'string' ? screeningStatus : 'open';
    const rr = typeof rejectionReason === 'string' ? rejectionReason : null;
    const rn = typeof rejectionNotes === 'string' ? rejectionNotes : null;

    let row = await JobCandidateScreening.findOne({
      where: { candidateId, jobId },
      attributes: allAttrsForLoad,
    });
    if (row) {
      const updates = {};
      if (Array.isArray(screeningAnswers)) updates.screeningAnswers = answers;
      if (typeof telephoneImpression === 'string') updates.telephoneImpression = impression;
      if (typeof internalOpinion === 'string') updates.internalOpinion = internalOpinion;
      if (typeof screeningStatus === 'string') updates.screeningStatus = screeningStatus;
      if (typeof rejectionReason === 'string') updates.rejectionReason = rejectionReason;
      if (typeof rejectionNotes === 'string') updates.rejectionNotes = rejectionNotes;
      const fields = Object.keys(updates);
      if (fields.length > 0) {
        await row.update(updates, { fields });
        await row.reload({ attributes: allAttrsForLoad });
      }
    } else {
      row = await JobCandidateScreening.create(
        {
          candidateId,
          jobId,
          screeningAnswers: answers,
          telephoneImpression: impression,
          internalOpinion: opinion,
          screeningStatus: st,
          rejectionReason: rr,
          rejectionNotes: rn,
        },
        { fields: allAttrs },
      );
    }
    return {
      jobId,
      screeningAnswers: row.screeningAnswers,
      telephoneImpression: row.telephoneImpression,
      internalOpinion: row.internalOpinion || '',
      screeningStatus: row.screeningStatus || 'open',
      rejectionReason: row.rejectionReason || '',
      rejectionNotes: row.rejectionNotes || '',
    };
  };

  try {
    let payload;
    try {
      payload = await upsert(false);
    } catch (err) {
      if (!isMissingScreeningRejectionColumnError(err)) throw err;
      screeningRejectionColumnsCache = false;
      payload = await upsert(true);
    }

    // Audit: 'משוב לאחר ראיון' — only when impression / opinion is actually provided.
    const overviewParts = [];
    if (typeof telephoneImpression === 'string' && telephoneImpression.trim()) {
      overviewParts.push(telephoneImpression.trim());
    }
    if (typeof internalOpinion === 'string' && internalOpinion.trim()) {
      // Strip basic HTML for the audit description.
      overviewParts.push(internalOpinion.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    }
    if (overviewParts.length) {
      const fromName =
        req?.user?.fullName ||
        req?.user?.name ||
        req?.user?.email ||
        req?.dbUser?.fullName ||
        req?.dbUser?.email ||
        'מערכת';
      const overview = overviewParts.join(' • ').slice(0, 600);
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.TEAM_FEEDBACK,
        entityType: 'Candidate',
        entityId: candidateId,
        entityName: null,
        params: { from: fromName, overview },
      });
    }

    res.json(payload);
  } catch (err) {
    const status = err.status || 500;
    if (status === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[saveScreeningData]', err);
    res.status(status).json({ message: err.message || 'Failed to save screening data' });
  }
};

/** Report: all candidate+job screening rows marked rejected (for referrals / disqualified list). */
const listScreeningRejections = async (req, res) => {
  try {
    const hasReject = await jobCandidateScreeningHasRejectionColumns();
    if (!hasReject) {
      res.set('Cache-Control', 'private, no-store');
      return res.json([]);
    }

    const rows = await JobCandidateScreening.findAll({
      where: { screeningStatus: 'rejected' },
      include: [
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'], required: false },
        { model: Job, as: 'job', attributes: ['id', 'title', 'client', 'recruitingCoordinator'], required: false },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 500,
    });

    const out = rows.map((r) => {
      const row = r.get({ plain: true });
      const cand = row.candidate || {};
      const job = row.job || {};
      const reasonParts = [row.rejectionReason, row.rejectionNotes].filter((x) => x && String(x).trim());
      return {
        id: row.id,
        candidateId: cand.id || row.candidateId,
        candidateName: cand.fullName ? String(cand.fullName).trim() : '',
        jobId: job.id || row.jobId,
        jobTitle: job.title ? String(job.title).trim() : '—',
        clientName: job.client ? String(job.client).trim() : '',
        eventDate: row.updatedAt,
        coordinator: job.recruitingCoordinator ? String(job.recruitingCoordinator).trim() : '',
        screeningLevel: 'סינון מועמד',
        reason: reasonParts.length ? reasonParts.map((x) => String(x).trim()).join(' — ') : '—',
      };
    });

    res.set('Cache-Control', 'private, no-store');
    return res.json(out);
  } catch (err) {
    console.error('[listScreeningRejections]', err);
    return res.status(500).json({ message: err.message || 'Failed to list screening rejections' });
  }
};

module.exports = {
  list,
  listByWorkedAtCompany,
  getByUser,
  get,
  create,
  createFromAi,
  update,
  approveDataCorrections,
  remove,
  createUploadUrl,
  attachMedia,
  rebuildEmbedding,
  rebuildAllEmbeddings,
  semanticSearch,
  freeSearch,
  uploadResumeForCandidate,
  putResumeFileInS3,
  generateExperienceSummary,
  fetchResumeText,
  fetchResumeBinaryForMail,
  buildParsedUpdates,
  generateInternalOpinion,
  getRelevantJobs,
  listLinkedJobs,
  patchJobLinkStatus,
  getScreeningData,
  saveScreeningData,
  listScreeningRejections,
  buildCandidateModelSchemaJsonForPrompt,
  ensureOrganizationsFromExperience,
};


