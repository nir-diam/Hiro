/**
 * One-off: rotate RDS postgres user password and update backend/src/.env POSTGRES_URI.
 * Usage: node scripts/_rotate-postgres-password.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../src/.env') });
const crypto = require('crypto');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const newPassword = crypto.randomBytes(24).toString('base64url');
const uri = String(process.env.POSTGRES_URI || '').trim();
if (!uri) {
  console.error('POSTGRES_URI missing in backend/src/.env');
  process.exit(1);
}

(async () => {
  const client = new Client({
    connectionString: uri,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const escaped = newPassword.replace(/'/g, "''");
  await client.query(`ALTER USER postgres WITH PASSWORD '${escaped}'`);
  await client.end();

  const u = new URL(uri);
  u.password = newPassword;
  const newUri = u.toString();

  const envPath = path.join(__dirname, '../src/.env');
  let text = fs.readFileSync(envPath, 'utf8');
  const lines = text.split(/\r?\n/);
  let wrotePostgresUri = false;
  const out = [];
  for (const line of lines) {
    if (/^POSTGRES_URI=/.test(line)) {
      if (wrotePostgresUri) continue;
      out.push(`POSTGRES_URI=${newUri}`);
      wrotePostgresUri = true;
      continue;
    }
    out.push(line);
  }
  if (!wrotePostgresUri) {
    out.push(`POSTGRES_URI=${newUri}`);
  }
  fs.writeFileSync(envPath, out.join('\n'), 'utf8');

  console.log('SUCCESS');
  console.log(`NEW_PASSWORD=${newPassword}`);
})().catch((e) => {
  console.error('FAILED', e.message || e);
  process.exit(1);
});
