/**
 * Copy client logos stored under the private `client-documents/` prefix to `public-assets/client-logos/`
 * and repoint clients.logoUrl. Run before blocking public reads on the rest of the bucket.
 *
 *   node scripts/migrate-client-logos-to-public-assets.js          # dry run
 *   node scripts/migrate-client-logos-to-public-assets.js --apply  # copy + update DB
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'src', '.env'), override: true });
const { CopyObjectCommand } = require('@aws-sdk/client-s3');
const { sequelize } = require('../src/config/db');
const { createS3Client, buildPublicUrl, parseS3KeyFromStoredUrl } = require('../src/services/s3Service');

const APPLY = process.argv.includes('--apply');

(async () => {
  await sequelize.authenticate();
  const [rows] = await sequelize.query(
    `SELECT id, name, "logoUrl" FROM clients WHERE "logoUrl" LIKE '%/client-documents/%'`,
  );
  console.log(`${rows.length} client logo(s) under client-documents/ ${APPLY ? '' : '(dry run)'}`);
  const s3 = APPLY ? createS3Client() : null;
  const bucket = process.env.AWS_S3_BUCKET;

  for (const row of rows) {
    const srcKey = parseS3KeyFromStoredUrl(row.logoUrl);
    if (!srcKey) {
      console.log(`skip ${row.id}: not our bucket (${row.logoUrl})`);
      continue;
    }
    const destKey = `public-assets/client-logos/${row.id}/${path.basename(srcKey)}`;
    const destUrl = buildPublicUrl(destKey);
    console.log(`${row.name || row.id}: ${srcKey} -> ${destKey}`);
    if (!APPLY) continue;
    await s3.send(new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${srcKey.split('/').map(encodeURIComponent).join('/')}`,
      Key: destKey,
    }));
    await sequelize.query('UPDATE clients SET "logoUrl" = :destUrl, "updatedAt" = NOW() WHERE id = :id', {
      replacements: { destUrl, id: row.id },
    });
  }
  await sequelize.close();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
