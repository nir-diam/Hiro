const PublicSiteKey = require('../models/PublicSiteKey');
const Client = require('../models/Client');
const { PUBLIC_SITE_KEY_MODES } = require('../constants/publicJobsApi');
const { hashSiteKey, keyPrefix, timingSafeEqualHex } = require('../utils/publicSiteKeyCrypto');

let envKeysCache = null;

const parseEnvSiteKeys = () => {
  if (envKeysCache) return envKeysCache;
  const entries = [];
  const raw = String(process.env.PUBLIC_SITE_KEYS || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row?.key) continue;
          entries.push({
            id: `env-${entries.length}`,
            name: row.name || row.label || 'env',
            mode: row.mode === PUBLIC_SITE_KEY_MODES.AGGREGATOR ? PUBLIC_SITE_KEY_MODES.AGGREGATOR : PUBLIC_SITE_KEY_MODES.TENANT,
            clientId: row.clientId || null,
            siteLabels: Array.isArray(row.siteLabels) ? row.siteLabels : [],
            keyHash: hashSiteKey(row.key),
            keyPrefix: keyPrefix(row.key),
            revokedAt: null,
          });
        }
      }
    } catch {
      /* ignore malformed env */
    }
  }
  const agg = String(process.env.PUBLIC_SITE_AGGREGATOR_KEY || '').trim();
  if (agg) {
    entries.push({
      id: 'env-aggregator',
      name: 'Hiro aggregator (env)',
      mode: PUBLIC_SITE_KEY_MODES.AGGREGATOR,
      clientId: null,
      siteLabels: ['hiro'],
      keyHash: hashSiteKey(agg),
      keyPrefix: keyPrefix(agg),
      revokedAt: null,
    });
  }
  envKeysCache = entries;
  return entries;
};

const matchKeyRecord = (rawKey, record) => {
  if (record.revokedAt) return false;
  if (record.keyPrefix !== keyPrefix(rawKey)) return false;
  return timingSafeEqualHex(record.keyHash, hashSiteKey(rawKey));
};

/**
 * @returns {Promise<{ id: string, name: string, mode: string, clientId: string | null, siteLabels: string[], client?: import('../models/Client') | null } | null>}
 */
const resolveSiteKey = async (rawKey) => {
  const key = String(rawKey || '').trim();
  if (!key) return null;

  for (const envRow of parseEnvSiteKeys()) {
    if (matchKeyRecord(key, envRow)) {
      let client = null;
      if (envRow.clientId) {
        client = await Client.findByPk(envRow.clientId, {
          attributes: ['id', 'name', 'displayName', 'domain', 'logoUrl', 'primaryColor', 'metadata'],
        });
      }
      return { ...envRow, client };
    }
  }

  const prefix = keyPrefix(key);
  const candidates = await PublicSiteKey.findAll({
    where: { keyPrefix: prefix, revokedAt: null },
    limit: 20,
  });
  const row = candidates.find((c) => matchKeyRecord(key, c.get({ plain: true })));
  if (!row) return null;

  const plain = row.get({ plain: true });
  let client = null;
  if (plain.clientId) {
    client = await Client.findByPk(plain.clientId, {
      attributes: ['id', 'name', 'displayName', 'domain', 'logoUrl', 'primaryColor', 'metadata'],
    });
  }
  return {
    id: plain.id,
    name: plain.name,
    mode: plain.mode,
    clientId: plain.clientId,
    siteLabels: Array.isArray(plain.siteLabels) ? plain.siteLabels : [],
    client,
  };
};

module.exports = {
  resolveSiteKey,
  parseEnvSiteKeys,
};
