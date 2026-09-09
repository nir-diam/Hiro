require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { simpleParser } = require('mailparser');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { sequelize } = require('../src/config/db');
const { createS3Client } = require('../src/services/s3Service');
const { hashResumeBuffer } = require('../src/services/cvContentHashService');

const supportedResumeExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.odt'];
const supportedMimes = ['pdf', 'msword', 'wordprocessingml', 'rtf', 'opendocument.text'];

const isResumeAttachment = (attachment) => {
  if (!attachment || !attachment.content) return false;
  const filename = (attachment.filename || '').toLowerCase();
  if (supportedResumeExtensions.some((ext) => filename.endsWith(ext))) return true;
  const contentType = (attachment.contentType || '').toLowerCase();
  return supportedMimes.some((mimeHint) => contentType.includes(mimeHint));
};

const extractFirstEmailFromCvText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const sample = String(text).slice(0, 20000);
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m;
  while ((m = re.exec(sample)) != null) {
    const raw = m[0];
    const e = raw.toLowerCase();
    const local = e.split('@')[0];
    if (['noreply', 'no-reply', 'mailer-daemon', 'donotreply', 'no_reply'].includes(local)) continue;
    if (e.endsWith('@example.com')) continue;
    return raw;
  }
  return null;
};

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    if (!chunk) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadEmail(bucket, key) {
  const client = createS3Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) return null;
  return streamToBuffer(response.Body);
}

async function analyzeUpload(row) {
  const raw = await downloadEmail(row.bucket, row.fileKey);
  if (!raw) return { error: 'download failed' };
  const parsed = await simpleParser(raw);
  const resumeAttachments = (parsed.attachments || []).filter(
    (a) => isResumeAttachment(a) && a.content,
  );
  const attachmentInfo = resumeAttachments.map((a, i) => {
    const hash = hashResumeBuffer(a.content);
    return {
      index: i,
      filename: a.filename,
      size: a.content.length,
      hashPrefix: hash ? hash.slice(0, 16) : null,
      hash,
    };
  });
  return {
    from: parsed.from?.text || null,
    subject: parsed.subject || null,
    resumeCount: resumeAttachments.length,
    attachmentInfo,
    preCreateWouldReuse:
      resumeAttachments.length === 1 && attachmentInfo[0]?.hash
        ? '(check vs DB separately)'
        : 'N/A (multi or none)',
  };
}

async function main() {
  await sequelize.authenticate();

  const [target] = await sequelize.query(
    `SELECT id, "candidateId", bucket, "fileKey", subject, "createdAt"
     FROM email_uploads
     WHERE id IN (972, 973, 974, 985, 986, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1001)
     ORDER BY id`,
  );

  const [candidate] = await sequelize.query(
    `SELECT id, "fullName", email, "resumeContentHash", "resumeUrl"
     FROM candidates WHERE id = '87d4e302-ded1-41c6-a7ae-b39889a89c1e'`,
  );
  const storedHash = candidate[0]?.resumeContentHash;
  console.log('Stored candidate resumeContentHash:', storedHash);
  console.log('Stored hash prefix:', storedHash?.slice(0, 16));
  console.log('---');

  const hashGroups = new Map();
  for (const row of target) {
    console.log(`\n=== upload #${row.id} candidateId=${row.candidateId} ===`);
    console.log('fileKey:', row.fileKey);
    console.log('createdAt:', row.createdAt);
    try {
      const info = await analyzeUpload(row);
      console.log(JSON.stringify(info, null, 2));
      if (info.attachmentInfo?.length === 1 && info.attachmentInfo[0].hash) {
        const h = info.attachmentInfo[0].hash;
        if (h === storedHash) {
          console.log('>>> MATCHES current candidate resumeContentHash (Uriah)');
        }
        const list = hashGroups.get(h) || [];
        list.push(row.id);
        hashGroups.set(h, list);
      }
    } catch (err) {
      console.error('ERROR:', err.message);
    }
  }

  console.log('\n=== hash groups (single attachment uploads) ===');
  for (const [hash, ids] of hashGroups.entries()) {
    console.log(`${hash.slice(0, 16)}... -> uploads ${ids.join(', ')}`);
  }

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
