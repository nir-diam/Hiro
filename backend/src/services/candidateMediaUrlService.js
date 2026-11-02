const {
  getPresignedGetUrl,
  parseS3KeyFromStoredUrl,
} = require('./s3Service');

const DEFAULT_TTL_SEC = Math.max(
  60,
  Number.parseInt(process.env.S3_PRESIGN_GET_TTL_SEC || '900', 10) || 900,
);

const presignIfOurS3 = async (storedUrl, expiresInSec = DEFAULT_TTL_SEC) => {
  if (!storedUrl || typeof storedUrl !== 'string') return storedUrl;
  if (!parseS3KeyFromStoredUrl(storedUrl)) return storedUrl;
  const ttl = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : DEFAULT_TTL_SEC;
  return getPresignedGetUrl(storedUrl, ttl);
};

const pushOwnedFile = (owned, field, stored, documentId = null) => {
  const raw = stored != null ? String(stored).trim() : '';
  if (!raw) return;
  const key = parseS3KeyFromStoredUrl(raw);
  if (!key) return;
  owned.push({ field, key, stored: raw, documentId: documentId != null ? String(documentId) : null });
};

/**
 * Pick a file that is already stored on this candidate. Never signs an arbitrary key.
 * @returns {{ field: string, key: string, stored: string, documentId: string | null } | null}
 */
const selectOwnedCandidateFile = (candidate, { which, documentId, storedUrl } = {}) => {
  const owned = [];
  pushOwnedFile(owned, 'resume', candidate?.resumeUrl);
  pushOwnedFile(owned, 'picture', candidate?.profilePicture);
  pushOwnedFile(owned, 'video', candidate?.profileVideoUrl);
  const docs = Array.isArray(candidate?.documents) ? candidate.documents : [];
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    pushOwnedFile(owned, 'document', doc.url || doc.key, doc.id);
  }

  const wantedId = documentId != null ? String(documentId).trim() : '';
  if (wantedId) {
    const byId = owned.find((row) => row.documentId && row.documentId === wantedId);
    if (byId) return byId;
  }

  const wantedKey = storedUrl ? parseS3KeyFromStoredUrl(String(storedUrl)) : null;
  if (wantedKey) {
    const byKey = owned.find((row) => row.key === wantedKey);
    if (byKey) return byKey;
  }

  const kind = String(which || '').trim().toLowerCase();
  if (kind === 'resume' || kind === 'picture' || kind === 'video') {
    return owned.find((row) => row.field === kind) || null;
  }
  return null;
};

/**
 * Fresh presigned GET for a file that belongs to the candidate. Called when the file is opened.
 * @returns {Promise<{ url: string, expiresIn: number }>}
 */
const presignOwnedCandidateFile = async (candidate, query = {}) => {
  const match = selectOwnedCandidateFile(candidate, query);
  if (!match) {
    const err = new Error('File not found');
    err.status = 404;
    throw err;
  }
  const url = await getPresignedGetUrl(match.stored, DEFAULT_TTL_SEC);
  return { url, expiresIn: DEFAULT_TTL_SEC };
};

const presignCandidateMediaFields = async (row, { fields } = {}) => {
  if (!row || typeof row !== 'object') return row;
  const allow = Array.isArray(fields) && fields.length ? new Set(fields) : null;
  const want = (name) => !allow || allow.has(name);
  const out = { ...row };
  if (want('resumeUrl') && out.resumeUrl) out.resumeUrl = await presignIfOurS3(out.resumeUrl);
  if (want('profilePicture') && out.profilePicture) out.profilePicture = await presignIfOurS3(out.profilePicture);
  if (want('profileVideoUrl') && out.profileVideoUrl) out.profileVideoUrl = await presignIfOurS3(out.profileVideoUrl);
  if (Array.isArray(out.documents)) {
    out.documents = await Promise.all(
      out.documents.map(async (doc) => {
        if (!doc || typeof doc !== 'object') return doc;
        const d = { ...doc };
        if (d.url) d.url = await presignIfOurS3(d.url);
        return d;
      }),
    );
  }
  return out;
};

module.exports = {
  DEFAULT_TTL_SEC,
  presignIfOurS3,
  presignCandidateMediaFields,
  selectOwnedCandidateFile,
  presignOwnedCandidateFile,
};
