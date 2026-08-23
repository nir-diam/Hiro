const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Candidate = require('../models/Candidate');

const normalizeEmail = (raw) => {
  const e = String(raw || '').trim().toLowerCase();
  return e && e.includes('@') ? e : null;
};

const normalizePhoneDigits = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972') && d.length >= 11) d = `0${d.slice(3)}`;
  if (d.length < 9) return null;
  return d.length > 9 ? d.slice(-9) : d;
};

const normalizeIdNumber = (raw) => {
  const id = String(raw || '').replace(/\D/g, '');
  return id.length >= 5 ? id : null;
};

/** SQL expression: stable identity bucket for list deduplication (one row per person). */
const LIST_IDENTITY_PARTITION_SQL = `
  COALESCE(
    CASE WHEN "userId" IS NOT NULL THEN 'person:' || "userId"::text END,
    CASE WHEN "canonicalCandidateId" IS NOT NULL THEN 'person:' || "canonicalCandidateId"::text END,
    CASE WHEN NULLIF(LOWER(TRIM(COALESCE(email, ''))), '') IS NOT NULL
      THEN 'email:' || LOWER(TRIM(email)) END,
    CASE WHEN LENGTH(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 9
      THEN 'phone:' || RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) END,
    CASE WHEN LENGTH(regexp_replace(COALESCE("idNumber", ''), '[^0-9]', '', 'g')) >= 5
      THEN 'tz:' || regexp_replace(COALESCE("idNumber", ''), '[^0-9]', '', 'g') END,
    'id:' || id::text
  )
`;

const CV_MERGE_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'title',
  'phone',
  'email',
  'address',
  'location',
  'idNumber',
  'gender',
  'maritalStatus',
  'professionalSummary',
  'resumeUrl',
  'resumeUploadedAt',
  'resumeContentHash',
  'searchText',
  'searchTextSavedAt',
  'skills',
  'languages',
  'workExperience',
  'education',
  'industryAnalysis',
  'companyExperiences',
  'experience',
  'salaryMin',
  'salaryMax',
  'availability',
  'preferredWorkingHours',
  'preferredWorkModels',
  'employmentType',
  'employmentTypes',
  'drivingLicense',
  'drivingLicenses',
  'source',
  'recruitmentSourceId',
  'profilePicture',
  'profileVideoUrl',
  'inboundFromEmail',
];

const pickCvMergeFields = (source = {}) => {
  const out = {};
  for (const key of CV_MERGE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const val = source[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string' && !val.trim()) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    out[key] = val;
  }
  return out;
};

/**
 * Lookup existing candidate by identity (priority: idNumber → email → phone).
 * Returns the oldest non-deleted match (canonical primary when possible).
 */
const findExistingByIdentity = async ({ email, phone, idNumber, excludeId } = {}) => {
  const normEmail = normalizeEmail(email);
  const normPhone = normalizePhoneDigits(phone);
  const normId = normalizeIdNumber(idNumber);
  if (!normEmail && !normPhone && !normId) return null;

  const binds = [];
  const orParts = [];
  const push = (val) => {
    binds.push(val);
    return binds.length;
  };

  if (normId) {
    const n = push(normId);
    orParts.push(`regexp_replace(COALESCE("idNumber", ''), '[^0-9]', '', 'g') = $${n}`);
  }
  if (normEmail) {
    const n = push(normEmail);
    orParts.push(`LOWER(TRIM(COALESCE(email, ''))) = $${n}`);
  }
  if (normPhone) {
    const n = push(normPhone);
    orParts.push(`RIGHT(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = $${n}`);
  }

  let excludeClause = '';
  if (excludeId) {
    const n = push(String(excludeId));
    excludeClause = ` AND id != $${n}::uuid`;
  }

  const rows = await sequelize.query(
    `
    SELECT id, "userId", "canonicalCandidateId", email, phone, "idNumber", "fullName", "createdAt"
    FROM candidates
    WHERE "isDeleted" = false
      AND (${orParts.join(' OR ')})
      ${excludeClause}
    ORDER BY
      CASE WHEN "userId" IS NOT NULL AND "canonicalCandidateId" IS NULL THEN 0 ELSE 1 END,
      CASE WHEN "userId" IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN "canonicalCandidateId" IS NULL THEN 0 ELSE 1 END,
      "createdAt" ASC NULLS LAST
    LIMIT 1
    `,
    { bind: binds, type: QueryTypes.SELECT },
  );

  return rows[0] || null;
};

const resolvePrimaryCandidateId = (row) => {
  if (!row) return null;
  const canonical = row.canonicalCandidateId != null ? String(row.canonicalCandidateId).trim() : '';
  if (canonical) return canonical;
  return String(row.id);
};

/** Follow canonicalCandidateId chain until a true primary (canonical IS NULL). */
const resolvePrimaryCandidateIdDeep = async (rowOrId) => {
  let id = typeof rowOrId === 'string' ? rowOrId : rowOrId?.id;
  if (!id) return null;
  const seen = new Set();
  for (let depth = 0; depth < 12; depth += 1) {
    const sid = String(id);
    if (seen.has(sid)) return sid;
    seen.add(sid);
    const row = await Candidate.findByPk(sid, {
      attributes: ['id', 'canonicalCandidateId'],
      raw: true,
    });
    if (!row) return sid;
    const canonical =
      row.canonicalCandidateId != null ? String(row.canonicalCandidateId).trim() : '';
    if (!canonical) return sid;
    id = canonical;
  }
  return String(id);
};

/**
 * When the existing person already has a portal account, keep the ingest row as a linked profile version.
 */
const buildLinkPlan = (duplicateRow, existingRow) => {
  const primaryId = String(resolvePrimaryCandidateId(existingRow));
  const duplicateId = String(duplicateRow?.id || '');
  if (!primaryId || !duplicateId || primaryId === duplicateId || !existingRow?.userId) {
    return { linked: false, candidateId: duplicateId || primaryId };
  }
  return {
    linked: true,
    candidateId: duplicateId,
    linkedToId: primaryId,
    linkFields: {
      userId: existingRow.userId,
      canonicalCandidateId: primaryId,
      portalAccessToken: null,
      portalAccessTokenExpiresAt: null,
    },
  };
};

/**
 * Merge a freshly-ingested duplicate row into an existing primary candidate, then soft-delete the duplicate.
 * If the existing row already has a portal userId, link instead of merge.
 */
const buildMergePlan = (duplicateRow, existingRow, identity = {}) => {
  const primaryId = String(resolvePrimaryCandidateId(existingRow));
  const duplicateId = String(duplicateRow?.id || '');
  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    return { merged: false, candidateId: duplicateId || primaryId };
  }

  if (existingRow.userId) {
    const linkPlan = buildLinkPlan(duplicateRow, existingRow);
    if (linkPlan.linked) {
      return {
        merged: true,
        linked: true,
        candidateId: linkPlan.candidateId,
        linkedToId: linkPlan.linkedToId,
        linkFields: linkPlan.linkFields,
      };
    }
  }

  const mergeFields = pickCvMergeFields(duplicateRow);
  if (identity.email) mergeFields.email = normalizeEmail(identity.email);
  if (identity.phone && !mergeFields.phone) mergeFields.phone = identity.phone;
  if (identity.idNumber && !mergeFields.idNumber) mergeFields.idNumber = identity.idNumber;
  if (!existingRow.userId && duplicateRow.userId) mergeFields.userId = duplicateRow.userId;

  return {
    merged: true,
    linked: false,
    candidateId: primaryId,
    removedDuplicateId: duplicateId,
    mergeFields,
  };
};

module.exports = {
  normalizeEmail,
  normalizePhoneDigits,
  normalizeIdNumber,
  LIST_IDENTITY_PARTITION_SQL,
  CV_MERGE_FIELDS,
  pickCvMergeFields,
  findExistingByIdentity,
  resolvePrimaryCandidateId,
  resolvePrimaryCandidateIdDeep,
  buildLinkPlan,
  buildMergePlan,
};
