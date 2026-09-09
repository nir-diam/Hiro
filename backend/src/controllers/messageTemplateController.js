const messageTemplateService = require('../services/messageTemplateService');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createS3Client, buildPublicUrl } = require('../services/s3Service');

const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
const ATTACHMENT_ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.csv', '.zip',
]);

const isPlatformAdmin = (u) => u && (u.role === 'admin' || u.role === 'super_admin');

/** Tenant users use their clientId; platform admins may pass clientId via query/body. */
const resolveTargetClientId = (req) => {
  const user = req.dbUser;
  if (!user) return null;
  if (user.clientId) return String(user.clientId);
  if (isPlatformAdmin(user)) {
    const raw = req.query?.clientId || req.body?.clientId;
    return raw ? String(raw) : null;
  }
  return null;
};

/** Messaging UI: tenant templates when user has clientId; otherwise Hiro admin catalog. */
const listForCompose = async (req, res) => {
  try {
    const user = req.dbUser;
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const recipientType = req.query?.recipientType
      ? String(req.query.recipientType).trim()
      : null;
    if (user.clientId) {
      const rows = messageTemplateService.filterTemplatesForRecipient(
        await messageTemplateService.listByClient(user.clientId),
        recipientType,
      );
      return res.json({ scope: 'client', templates: rows });
    }
    const rows = messageTemplateService.filterTemplatesForRecipient(
      await messageTemplateService.listAdmin(),
      recipientType,
    );
    return res.json({ scope: 'admin', templates: rows });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const listClient = async (req, res) => {
  try {
    const clientId = resolveTargetClientId(req);
    if (!clientId) {
      return res.status(403).json({ message: 'Company context required for client templates' });
    }
    const rows = await messageTemplateService.listByClient(clientId);
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const listAdmin = async (req, res) => {
  try {
    const rows = await messageTemplateService.listAdmin();
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const createClient = async (req, res) => {
  try {
    const user = req.dbUser;
    const clientId = resolveTargetClientId(req);
    if (!clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const row = await messageTemplateService.createClient(clientId, req.body, user);
    return res.status(201).json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const createAdmin = async (req, res) => {
  try {
    const user = req.dbUser;
    const row = await messageTemplateService.createAdmin(req.body, user);
    return res.status(201).json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const updateClient = async (req, res) => {
  try {
    const user = req.dbUser;
    const clientId = resolveTargetClientId(req);
    if (!clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const row = await messageTemplateService.update(req.params.id, 'client', clientId, req.body, user);
    return res.json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const updateAdmin = async (req, res) => {
  try {
    const user = req.dbUser;
    const row = await messageTemplateService.update(req.params.id, 'admin', null, req.body, user);
    return res.json(row);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const removeClient = async (req, res) => {
  try {
    const clientId = resolveTargetClientId(req);
    if (!clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    await messageTemplateService.remove(req.params.id, 'client', clientId);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const removeAdmin = async (req, res) => {
  try {
    await messageTemplateService.remove(req.params.id, 'admin', null);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const listCatalog = async (req, res) => {
  try {
    const rows = await messageTemplateService.listAllCatalog();
    return res.json(rows);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to list templates' });
  }
};

const createCatalog = async (req, res) => {
  try {
    const row = await messageTemplateService.createCatalog(req.body, req.dbUser);
    const full = await messageTemplateService.findByPkWithClient(row.id);
    return res.status(201).json(messageTemplateService.toCatalogRow(full));
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const updateCatalog = async (req, res) => {
  try {
    await messageTemplateService.updateByIdAny(req.params.id, req.body, req.dbUser);
    const full = await messageTemplateService.findByPkWithClient(req.params.id);
    return res.json(messageTemplateService.toCatalogRow(full));
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const removeCatalog = async (req, res) => {
  try {
    await messageTemplateService.removeByIdAny(req.params.id);
    return res.status(204).end();
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const createClientAttachmentUploadUrl = async (req, res) => {
  try {
    const clientId = resolveTargetClientId(req);
    if (!clientId) {
      return res.status(403).json({ message: 'Company context required' });
    }
    const template = await messageTemplateService.findScoped(req.params.id, 'client', clientId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    const { fileName, contentType, fileSize } = req.body || {};
    if (!fileName || !contentType) {
      return res.status(400).json({ message: 'fileName and contentType are required' });
    }
    const size = Number(fileSize);
    if (Number.isFinite(size) && size > ATTACHMENT_MAX_BYTES) {
      return res.status(400).json({ message: 'File exceeds 15MB limit' });
    }
    const safeName = path.basename(String(fileName));
    const ext = path.extname(safeName).toLowerCase();
    if (ext && !ATTACHMENT_ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ message: 'Unsupported file type' });
    }
    const key = `message-templates/${clientId}/${template.id}/${Date.now()}-${safeName}`;
    const client = createS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    return res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

module.exports = {
  listForCompose,
  listClient,
  listAdmin,
  listCatalog,
  createClient,
  createAdmin,
  createCatalog,
  updateClient,
  updateAdmin,
  updateCatalog,
  removeClient,
  removeAdmin,
  removeCatalog,
  createClientAttachmentUploadUrl,
};
