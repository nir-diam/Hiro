const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const candidateService = require('../services/candidateService');
const { createS3Client, buildPublicUrl, buildCandidateDocumentKey } = require('../services/s3Service');

const list = async (req, res) => {
  const candidate = await candidateService.getById(req.params.id);
  res.json(Array.isArray(candidate.documents) ? candidate.documents : []);
};

const createUploadUrl = async (req, res) => {
  const { fileName, contentType } = req.body || {};
  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }
  try {
    const client = createS3Client();
    const key = buildCandidateDocumentKey(req.params.id, fileName);
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

const attach = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.documents) ? candidate.documents : [];
    const payload = req.body || {};

    const doc = {
      id: payload.id || uuidv4(),
      name: payload.name,
      type: payload.type,
      uploadDate: payload.uploadDate || new Date().toISOString(),
      uploadedBy: payload.uploadedBy || 'מערכת',
      notes: payload.notes || '',
      fileSize: payload.fileSize || 0,
      key: payload.key,
      url: payload.url,
    };

    const next = [doc, ...prev];
    await candidateService.update(req.params.id, { documents: next });
    res.status(201).json(doc);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Attach failed' });
  }
};

const update = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.documents) ? candidate.documents : [];
    const docId = String(req.params.docId);
    const payload = req.body || {};
    const next = prev.map((d) => (String(d.id) === docId ? { ...d, ...payload, id: d.id } : d));
    await candidateService.update(req.params.id, { documents: next });
    const updatedDoc = next.find((d) => String(d.id) === docId);
    if (!updatedDoc) return res.status(404).json({ message: 'Document not found' });
    res.json(updatedDoc);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const prev = Array.isArray(candidate.documents) ? candidate.documents : [];
    const docId = String(req.params.docId);
    const doc = prev.find((d) => String(d.id) === docId);
    const next = prev.filter((d) => String(d.id) !== docId);
    await candidateService.update(req.params.id, { documents: next });

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
