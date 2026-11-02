const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { flexibleChecksumsMiddlewareOptions } = require('@aws-sdk/middleware-flexible-checksums');

const requiredS3Env = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];

const ensureS3Env = () => {
  const missing = requiredS3Env.filter((key) => !process.env[key]);
  if (missing.length) {
    const err = new Error(`Missing S3 config: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
};

const createS3Client = () => {
  ensureS3Env();
  const client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'NEVER',
  });
  client.middlewareStack.remove(flexibleChecksumsMiddlewareOptions.name);
  client.middlewareStack.removeByTag('SET_BODY_CHECKSUM');
  return client;
};

/** Canonical stored reference (DB). Bucket must be private; clients receive presigned GET URLs. */
const buildPublicUrl = (key) =>
  `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

/** Parse object key from our bucket URL or a raw key string. Returns null for non-S3 URLs (e.g. Google Docs). */
const parseS3KeyFromStoredUrl = (urlOrKey) => {
  if (!urlOrKey || typeof urlOrKey !== 'string') return null;
  const raw = urlOrKey.trim();
  if (!raw) return null;
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return raw.replace(/^\//, '');
  }
  try {
    const parsed = new URL(raw);
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || '';
    if (!bucket) return null;
    const virtualHost = `${bucket}.s3.${region}.amazonaws.com`;
    const legacyHost = `${bucket}.s3.amazonaws.com`;
    if (parsed.hostname === virtualHost || parsed.hostname === legacyHost
      || parsed.hostname.startsWith(`${bucket}.s3.`)) {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    }
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts[0] === bucket && pathParts.length > 1) {
      return decodeURIComponent(pathParts.slice(1).join('/'));
    }
  } catch {
    return null;
  }
  return null;
};

const getPresignedGetUrl = async (storedUrl, expiresInSec = 900) => {
  const key = parseS3KeyFromStoredUrl(storedUrl);
  if (!key) return storedUrl;
  ensureS3Env();
  const client = createS3Client();
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSec });
};

const getObjectBufferFromStoredUrl = async (storedUrl) => {
  const key = parseS3KeyFromStoredUrl(storedUrl);
  if (!key) return null;
  ensureS3Env();
  const client = createS3Client();
  const out = await client.send(new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
  }));
  const chunks = [];
  for await (const chunk of out.Body) {
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: (out.ContentType || 'application/octet-stream').split(';')[0].trim(),
  };
};

/**
 * Strip presign query params from our bucket URLs before persisting, so a short-lived
 * signed URL echoed back by the client never replaces the canonical reference.
 */
const toStoredS3Url = (url) => {
  if (!url || typeof url !== 'string') return url;
  const raw = url.trim();
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) return raw;
  const key = parseS3KeyFromStoredUrl(raw);
  return key ? buildPublicUrl(key) : raw;
};

/** Read a stored file: our bucket via credentials (works on a private bucket), anything else via HTTP. */
const fetchStoredFileBuffer = async (storedUrl) => {
  if (parseS3KeyFromStoredUrl(storedUrl)) return getObjectBufferFromStoredUrl(storedUrl);
  const resp = await fetch(String(storedUrl));
  if (!resp.ok) return null;
  return {
    buffer: Buffer.from(await resp.arrayBuffer()),
    contentType: (resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim(),
  };
};

/** S3 object key: one folder per candidate under candidates/files */
const buildCandidateDocumentKey = (candidateId, fileName) => {
  const safeName = path.basename(fileName || 'file');
  return `candidates/files/${candidateId}/${Date.now()}-${safeName}`;
};

module.exports = {
  ensureS3Env,
  createS3Client,
  buildPublicUrl,
  buildCandidateDocumentKey,
  parseS3KeyFromStoredUrl,
  getPresignedGetUrl,
  getObjectBufferFromStoredUrl,
  toStoredS3Url,
  fetchStoredFileBuffer,
};

