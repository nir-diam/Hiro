const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { flexibleChecksumsMiddlewareOptions } = require('@aws-sdk/middleware-flexible-checksums');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const candidateService = require('../services/candidateService');
const { embedCandidateAndSave, searchCandidates } = require('../services/vectorSearchService');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

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

const ensureS3Env = () => {
  const missing = requiredS3Env.filter((key) => !process.env[key]);
  if (missing.length) {
    const err = new Error(`Missing S3 config: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
};

const s3Client = () => {
  ensureS3Env();
  const client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // Force the SDK to avoid request checksum injection
    requestChecksumCalculation: 'NEVER',
  });
  // Remove checksum middleware globally so presigned URLs won't require checksum headers
  client.middlewareStack.remove(flexibleChecksumsMiddlewareOptions.name);
  client.middlewareStack.removeByTag('SET_BODY_CHECKSUM');
  return client;
};

const buildPublicUrl = (key) =>
  `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

const list = async (_req, res) => {
  const candidates = await candidateService.list();
  res.json(candidates);
};

const getByUser = async (req, res) => {
  try {
    const candidate = await candidateService.getByUserId(req.params.userId);
    if (!candidate) return res.status(404).json({ message: 'Not found' });
    res.json(candidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Not found' });
  }
};

const get = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    res.json(candidate);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const candidate = await candidateService.create(req.body);
    // Fire-and-forget embedding from current fields
    void tryEmbedCandidate(candidate.id);
    res.status(201).json(candidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const candidate = await candidateService.update(req.params.id, req.body);
    // Fire-and-forget embedding after significant update
    void tryEmbedCandidate(candidate.id);
    res.json(candidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
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
  const { fileName, contentType, folder = 'profiles' } = req.body;

  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }

  try {
    const client = s3Client();
    const safeName = path.basename(fileName);
    const key = `${folder}/${req.params.id}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      // Do not sign ContentType or checksum constraints
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
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
    const candidate = await candidateService.update(req.params.id, { [field]: url });
    // If resume updated, fetch text and rebuild embedding with searchText (best-effort)
    if (type === 'resume') {
      void (async () => {
        const extraText = await fetchResumeText(url, candidate.id);
        await tryEmbedCandidate(candidate.id, extraText);
      })();
    }
    res.json(candidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to attach media' });
  }
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
    if (looksPdf || contentType.includes('pdf')) {
      try {
        const resPdf = await pdfParse(buffer);
        if (resPdf.text) return resPdf.text;
      } catch (e) {
        console.log('[embed-parse-pdf-error]', e.message || e);
      }
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

    // Last resort: try PDF once more, then plain text decode
    try {
      const resPdf = await pdfParse(buffer);
      if (resPdf.text) return resPdf.text;
    } catch (e) {
      // ignore final pdf attempt
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

module.exports = {
  list,
  getByUser,
  get,
  create,
  update,
  remove,
  createUploadUrl,
  attachMedia,
  rebuildEmbedding,
  rebuildAllEmbeddings,
  semanticSearch,
};


