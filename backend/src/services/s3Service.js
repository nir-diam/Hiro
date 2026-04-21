const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
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

const buildPublicUrl = (key) =>
  `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

/** S3 object key: one folder per candidate under candidates/files */
const buildCandidateDocumentKey = (candidateId, fileName) => {
  const safeName = path.basename(fileName || 'file');
  return `candidates/files/${candidateId}/${Date.now()}-${safeName}`;
};

module.exports = { ensureS3Env, createS3Client, buildPublicUrl, buildCandidateDocumentKey };

