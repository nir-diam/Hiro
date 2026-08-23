const crypto = require('crypto');
const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const { resolvePrimaryCandidateId } = require('./candidateIdentityService');

/** Decode client fileBase64: strip data URL prefix and whitespace. */
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

/** SHA-256 hex of raw file bytes — stable regardless of Gemini parse output. */
const hashResumeBuffer = (buffer) => {
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return null;
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

const hashFileBase64 = (fileBase64) => {
  let buffer = decodeFileBase64Payload(fileBase64);
  if (!buffer?.length && fileBase64) {
    buffer = Buffer.from(String(fileBase64).replace(/\s/g, ''), 'base64');
  }
  return hashResumeBuffer(buffer);
};

const normalizeHash = (hash) => {
  const norm = String(hash || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(norm) ? norm : null;
};

/**
 * Find an existing non-deleted candidate ingested with the same raw CV bytes.
 * Prefers the primary row (canonicalCandidateId IS NULL), oldest first.
 */
const findCandidateByResumeContentHash = async (hash, { excludeId } = {}) => {
  const norm = normalizeHash(hash);
  if (!norm) return null;

  const binds = [norm];
  let excludeClause = '';
  if (excludeId) {
    binds.push(String(excludeId));
    excludeClause = ` AND id != $${binds.length}::uuid`;
  }

  const rows = await sequelize.query(
    `
    SELECT id, "fullName", email, phone, "userId", "canonicalCandidateId", "resumeContentHash", "createdAt"
    FROM candidates
    WHERE "isDeleted" = false
      AND LOWER("resumeContentHash") = $1
      ${excludeClause}
    ORDER BY
      CASE WHEN "canonicalCandidateId" IS NULL THEN 0 ELSE 1 END,
      "createdAt" ASC NULLS LAST
    LIMIT 1
    `,
    { bind: binds, type: QueryTypes.SELECT },
  );

  return rows[0] || null;
};

/** Resolve hash match to the visible primary candidate row when possible. */
const resolvePrimaryFromHashMatch = async (row) => {
  if (!row) return null;
  const primaryId = String(resolvePrimaryCandidateId(row));
  if (String(row.id) === primaryId) return row;

  const rows = await sequelize.query(
    `
    SELECT id, "fullName", email, phone, "userId", "canonicalCandidateId", "resumeContentHash", "createdAt"
    FROM candidates
    WHERE id = $1::uuid AND "isDeleted" = false
    LIMIT 1
    `,
    { bind: [primaryId], type: QueryTypes.SELECT },
  );
  return rows[0] || row;
};

const persistResumeContentHash = async (candidateId, source = {}) => {
  const cid = String(candidateId || '').trim();
  if (!cid) return null;
  const hash =
    normalizeHash(source.hash) ||
    hashResumeBuffer(source.buffer) ||
    (source.fileBase64 ? hashFileBase64(source.fileBase64) : null);
  if (!hash) return null;
  const Candidate = require('../models/Candidate');
  await Candidate.update({ resumeContentHash: hash }, { where: { id: cid } });
  return hash;
};

module.exports = {
  decodeFileBase64Payload,
  hashResumeBuffer,
  hashFileBase64,
  normalizeHash,
  findCandidateByResumeContentHash,
  resolvePrimaryFromHashMatch,
  persistResumeContentHash,
};
