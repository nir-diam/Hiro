const path = require('path');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const clientService = require('../services/clientService');
const { createS3Client, buildPublicUrl } = require('../services/s3Service');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

function resolveUploaderDisplayName(req) {
  const u = req.user;
  if (!u) return null;
  return (
    String(u.fullName || u.name || u.email || '').trim() || null
  );
}

/** Strip legacy mock placeholder saved before uploadedBy used real user names. */
function sanitizeDocumentUploader(value) {
  const name = String(value ?? '').trim();
  if (!name || name === 'דנה כהן') return '';
  return name;
}

function sanitizeDocumentRow(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  return { ...doc, uploadedBy: sanitizeDocumentUploader(doc.uploadedBy) };
}

const list = async (req, res) => {
  const client = await clientService.getById(req.params.id);
  let docs = Array.isArray(client.documents) ? client.documents : [];
  const organizationId = req.query?.organizationId
    ? String(req.query.organizationId).trim()
    : null;
  const organizationTmpId = req.query?.organizationTmpId
    ? String(req.query.organizationTmpId).trim()
    : null;
  if (organizationTmpId) {
    docs = docs.filter((d) => String(d?.organizationTmpId || '') === organizationTmpId);
  } else if (organizationId) {
    docs = docs.filter((d) => String(d?.organizationId || '') === organizationId);
  }
  res.json(docs.map(sanitizeDocumentRow));
};

// Presigned URL flow (frontend uploads directly to S3)
const createUploadUrl = async (req, res) => {
  const { fileName, contentType } = req.body || {};
  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }
  try {
    const client = createS3Client();
    const safeName = path.basename(fileName);
    const key = `client-documents/${req.params.id}/${Date.now()}-${safeName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      // Do not sign ContentType
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

// After upload, attach metadata row into client.documents
const attach = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.documents) ? client.documents : [];
    const payload = req.body || {};

    const doc = {
      id: payload.id || uuidv4(),
      name: payload.name,
      type: payload.type,
      uploadDate: payload.uploadDate || new Date().toISOString(),
      uploadedBy: resolveUploaderDisplayName(req) || payload.uploadedBy || 'מערכת',
      notes: payload.notes || '',
      fileSize: payload.fileSize || 0,
      key: payload.key,
      url: payload.url,
      organizationId: payload.organizationId != null
        ? (String(payload.organizationId).trim() || null)
        : null,
      organizationTmpId: payload.organizationTmpId != null
        ? (String(payload.organizationTmpId).trim() || null)
        : null,
    };

    const next = [doc, ...prev];
    await clientService.update(req.params.id, { documents: next });

    // Audit: 'העלאת מסמך' (client-scoped)
    systemEventEmitter.emit(req, {
      ...SYSTEM_EVENTS.CLIENT_DOC,
      entityType: 'Client',
      entityId: req.params.id,
      entityName: client?.name || client?.displayName || null,
      params: {
        filename: doc.name || '—',
        candidate: client?.name || client?.displayName || req.params.id,
      },
    });

    res.status(201).json(sanitizeDocumentRow(doc));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Attach failed' });
  }
};

const update = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.documents) ? client.documents : [];
    const docId = String(req.params.docId);
    const payload = req.body || {};
    const { uploadedBy: _ignoredUploader, ...metadataPatch } = payload;
    const next = prev.map((d) => (String(d.id) === docId ? { ...d, ...metadataPatch, id: d.id } : d));
    await clientService.update(req.params.id, { documents: next });
    const updatedDoc = next.find((d) => String(d.id) === docId);
    if (!updatedDoc) return res.status(404).json({ message: 'Document not found' });
    res.json(sanitizeDocumentRow(updatedDoc));
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    const prev = Array.isArray(client.documents) ? client.documents : [];
    const docId = String(req.params.docId);
    const doc = prev.find((d) => String(d.id) === docId);
    const next = prev.filter((d) => String(d.id) !== docId);
    await clientService.update(req.params.id, { documents: next });

    // best-effort delete from S3 if we have a key
    if (doc?.key) {
      try {
        const s3 = createS3Client();
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: doc.key }));
      } catch (_) {}
    }
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, createUploadUrl, attach, update, remove };

