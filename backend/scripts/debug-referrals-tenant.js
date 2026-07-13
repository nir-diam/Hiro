const { sequelize, connectDb } = require('../src/config/db');
const { Op } = require('sequelize');

const USER_EMAIL = process.argv[2] || 'diamantnir@gmail.com';
const CLIENT_LABEL = process.argv[3] || 'מימד אנושי';

function screeningClientNameMatchesScope(rowClientName, scopeLabels) {
  const name = String(rowClientName || '').trim();
  if (!name || !scopeLabels.length) return false;
  if (scopeLabels.includes(name)) return true;
  const lower = name.toLowerCase();
  return scopeLabels.some((l) => String(l).trim().toLowerCase() === lower);
}

async function collectClientScopeLabels(clientId) {
  const Client = require('../src/models/Client');
  const id = String(clientId || '').trim();
  if (!id) return [];
  const client = await Client.findByPk(id, {
    attributes: ['id', 'name', 'displayName', 'domain', 'metadata'],
  });
  if (!client) return [];
  const plain = client.get({ plain: true });
  const labels = new Set();
  const add = (v) => {
    const s = String(v || '').trim();
    if (s) labels.add(s);
  };
  add(plain.name);
  add(plain.displayName);
  add(plain.domain);
  if (plain.metadata && typeof plain.metadata === 'object') {
    add(plain.metadata.companyName);
    add(plain.metadata.legalName);
    add(plain.metadata.nameEn);
    if (Array.isArray(plain.metadata.aliases)) {
      for (const alias of plain.metadata.aliases) add(alias);
    }
  }
  return [...labels];
}

async function main() {
  await connectDb();
  const User = require('../src/models/User');
  const NotificationMessage = require('../src/models/NotificationMessage');
  const authService = require('../src/services/authService');

  const user = await User.findOne({ where: { email: USER_EMAIL } });
  console.log('USER:', user ? { email: user.email, role: user.role, clientId: user.clientId } : null);

  const effectiveClientId = user ? await authService.resolveEffectiveClientIdForUser(user) : null;
  console.log('EFFECTIVE CLIENT ID:', effectiveClientId);

  const tenantClientLabels = effectiveClientId ? await collectClientScopeLabels(effectiveClientId) : [];
  console.log('TENANT LABELS:', tenantClientLabels);

  const rows = await NotificationMessage.findAll({
    where: { category: 'screening_cv' },
    order: [['createdAt', 'DESC']],
    limit: 20000,
  });
  console.log('TOTAL screening_cv rows:', rows.length);

  const clientNamesInData = new Map();
  for (const r of rows) {
    const tp = r.get('metadata')?.taskPayload || {};
    const cn = String(tp.clientName || '').trim() || '(empty)';
    clientNamesInData.set(cn, (clientNamesInData.get(cn) || 0) + 1);
  }
  console.log('CLIENT NAMES IN DATA:', Object.fromEntries(clientNamesInData));

  const matched = rows.filter((r) => {
    const tp = r.get('metadata')?.taskPayload || {};
    const cn = String(tp.clientName || '').trim();
    return screeningClientNameMatchesScope(cn, tenantClientLabels);
  });
  console.log('ROWS MATCHING TENANT LABELS:', matched.length);

  const referralDateFrom = '2026-06-09';
  const referralDateTo = '2026-07-09';
  const dateFiltered = matched.filter((r) => {
    const refDate = new Date(r.createdAt);
    const start = new Date(referralDateFrom);
    const end = new Date(referralDateTo);
    end.setHours(23, 59, 59, 999);
    return refDate >= start && refDate <= end;
  });
  console.log(`ROWS IN DATE RANGE ${referralDateFrom}..${referralDateTo}:`, dateFiltered.length);

  // Old behavior: sender-only filter (peers on same clientId)
  if (user?.clientId) {
    const peers = await User.findAll({ where: { clientId: user.clientId }, attributes: ['id', 'email'] });
    const senderIds = peers.map((p) => p.id).filter(Boolean);
    const senderFiltered = rows.filter((r) => senderIds.includes(r.senderUserId));
    console.log('PEERS ON CLIENT:', peers.map((p) => p.email));
    console.log('ROWS SENT BY PEERS (old filter):', senderFiltered.length);
    const peerMatched = senderFiltered.filter((r) => {
      const tp = r.get('metadata')?.taskPayload || {};
      return screeningClientNameMatchesScope(tp.clientName, tenantClientLabels);
    });
    console.log('PEER-SENT + CLIENT MATCH:', peerMatched.length);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
