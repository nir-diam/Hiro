const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { simpleParser } = require('mailparser');
const emailService = require('../services/emailService');
const candidateService = require('../services/candidateService');
const jobCandidateService = require('../services/jobCandidateService');
const jobService = require('../services/jobService');
const { createS3Client } = require('../services/s3Service');
const { uploadResumeForCandidate, fetchResumeText, buildParsedUpdates } = require('./candidateController');

const supportedResumeExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
const supportedMimes = ['pdf', 'msword', 'officedocument', 'application/octet-stream'];

const extractPostingCodeFromEmailAddress = (email = '') => {
  const match = (email || '').trim().toLowerCase().match(/hiro\+([0-9a-zA-Z_-]+)@/i);
  return match ? match[1] : null;
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    if (!chunk) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const isResumeAttachment = (attachment) => {
  if (!attachment || !attachment.content) return false;
  const filename = (attachment.filename || '').toLowerCase();
  if (supportedResumeExtensions.some((ext) => filename.endsWith(ext))) return true;
  const contentType = (attachment.contentType || '').toLowerCase();
  return supportedMimes.some((mimeHint) => contentType.includes(mimeHint));
};

const downloadEmailFromS3 = async (bucket, key) => {
  const client = createS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  if (!response.Body) return null;
  return streamToBuffer(response.Body);
};

const processEmailUpload = async (record) => {
  try {
    const rawEmail = await downloadEmailFromS3(record.bucket, record.fileKey);
    if (!rawEmail) {
      console.warn('[email] failed to download raw email', record.fileKey);
      return;
    }
    const parsed = await simpleParser(rawEmail, { skipHtmlToText: true });
    const fromText = parsed.from?.text || null;
    const toText = parsed.to?.text || null;
    const subject = parsed.subject || null;

    await record.update({ from: fromText, to: toText, subject });

    const fromAddress = parsed.from?.value?.[0];
    const fromEmail = fromAddress?.address?.trim().toLowerCase();
    if (!fromEmail) {
      console.warn('[email] missing from address', record.fileKey);
      return;
    }

    const resumeAttachment = (parsed.attachments || []).find(isResumeAttachment);
    if (!resumeAttachment || !resumeAttachment.content) {
      console.warn('[email] no resume attachment found', record.fileKey);
      return;
    }

    const fileBase64 = resumeAttachment.content.toString('base64');
    const filename = resumeAttachment.filename || `resume-${Date.now()}.bin`;
    const mimeType = resumeAttachment.contentType || 'application/octet-stream';

    const toRecipients = parsed.to?.value || [];
    let postingCode = null;
    for (const recipient of toRecipients) {
      const code = extractPostingCodeFromEmailAddress(recipient.address);
      if (code) {
        postingCode = code;
        break;
      }
    }
    if (!postingCode) {
      const toText = parsed.to?.text || '';
      const match = toText.match(/hiro\+([0-9a-zA-Z_-]+)@/i);
      postingCode = match ? match[1] : null;
    }
    let resolvedJob = null;
    if (postingCode) {
      resolvedJob = await jobService.findByPostingCode(postingCode);
      const isUuid = (value) =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      if (resolvedJob && !isUuid(resolvedJob.id)) {
        resolvedJob = null;
      }
    }

    let candidate = await candidateService.findByEmail(fromEmail);
    if (!candidate) {
      const inferredName =
        fromAddress?.name?.trim() || fromEmail.split('@')[0] || 'מועמד חדש';
      candidate = await candidateService.create({
        email: fromEmail,
        fullName: inferredName,
        source: 'email',
      });
    }

    const resumeUrl = await uploadResumeForCandidate(candidate.id, fileBase64, filename, mimeType);
    if (resumeUrl) {
      const extraText = await fetchResumeText(resumeUrl, candidate.id);
      const parsedUpdates = buildParsedUpdates(candidate, extraText || '');
      if (Object.keys(parsedUpdates).length) {
        await candidateService.update(candidate.id, parsedUpdates);
      }
      await jobCandidateService.associateCandidateWithJob({
        jobId: resolvedJob?.id || null,
        candidateId: candidate.id,
        source: 'email',
      });
    }
    console.log('[email] resume attached for candidate', candidate.id, record.fileKey);
  } catch (error) {
    console.error('[email][processEmailUpload]', error);
  }
};

const upload = async (req, res) => {
  const { jobId, fileKey, bucket } = req.body;
  if (!jobId || !fileKey || !bucket) {
    return res.status(400).json({ message: 'jobId, fileKey, and bucket are required' });
  }

  try {
    const record = await emailService.create({ jobId, fileKey, bucket });
    void processEmailUpload(record);
    return res.status(201).json(record);
  } catch (error) {
    console.error('Failed to save email upload', error);
    return res.status(500).json({ message: 'Could not persist upload' });
  }
};

module.exports = { upload };

