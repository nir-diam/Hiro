/**
 * Restore the "misc" module (dashboard + notifications) for a tenant.
 * Usage: node scripts/restore-misc-module.js [clientName] [--apply]
 * Without --apply it only reports.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/.env') });
const { sequelize } = require('../src/config/db');
const { QueryTypes } = require('sequelize');
const Client = require('../src/models/Client');
const { getEffectivePermissions } = require('../src/services/permissionService');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const clientName = args.find((a) => !a.startsWith('--')) || 'מימד אנושי';

async function main() {
  const clients = await sequelize.query(
    `SELECT id, name, modules FROM clients WHERE name = :name`,
    { replacements: { name: clientName }, type: QueryTypes.SELECT },
  );
  if (!clients.length) {
    console.error('client not found:', clientName);
    process.exit(1);
  }
  const client = clients[0];
  console.log('client:', client.name, client.id);
  console.log('modules BEFORE:', JSON.stringify(client.modules));

  if (!apply) {
    console.log('\n(dry run — pass --apply to write)');
    await sequelize.close();
    return;
  }

  const next = { ...(client.modules || {}), misc: true };
  const row = await Client.findByPk(client.id);
  await row.update({ modules: next });
  await row.reload();
  console.log('modules AFTER :', JSON.stringify(row.modules));

  const users = await sequelize.query(
    `SELECT u.email, u.role, u.permissions FROM users u WHERE u."clientId" = :cid AND u.role <> 'candidate' ORDER BY u.email`,
    { replacements: { cid: client.id }, type: QueryTypes.SELECT },
  );
  console.log('\n=== effective permissions after change ===');
  let missing = 0;
  for (const u of users) {
    const eff = getEffectivePermissions({ ...u, client: { modules: row.modules || {} } });
    const dash = eff['page:dashboard'];
    const notif = eff['page:notifications'];
    if (!dash || !notif) missing += 1;
    console.log(`  ${u.email.padEnd(28)} dashboard=${dash}  notifications=${notif}`);
  }
  console.log(`\nusers still missing dashboard or notifications: ${missing} of ${users.length}`);

  await sequelize.close();
}
main().catch((e) => { console.error(e?.message || e); process.exit(1); });
