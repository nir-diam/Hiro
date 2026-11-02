const { Op, QueryTypes } = require('sequelize');
const readThrough = require('./readThroughCacheService');
const redis = require('./redisService');
const { isReadThroughEnabled, isRedisAvailable } = require('../config/redis');
const { recordHit, recordMiss, recordBypass } = require('../utils/appCacheContext');
const Client = require('../models/Client');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const organizationClientLinkPipelineService = require('./organizationClientLinkPipelineService');
const clientOrganizationSyncService = require('./clientOrganizationSyncService');
const {
  scheduleOrganizationEnrichment,
  scheduleOrganizationEnrichmentIfNeeded,
} = require('./organizationEnrichmentService');
const {
  CLIENT_EVENTS_RECENT_MAX,
  ensureClientEventsRecentBackfill,
  scheduleBackfillClientEventsRecent,
  upsertClientEventInRecentCache,
  prependClientEventInRecentCache,
} = require('../utils/clientEventsRecentCache');

const isPlatformAdmin = (dbUser) =>
  dbUser?.role === 'super_admin' || dbUser?.role === 'admin';

const isClientManager = (dbUser) => dbUser?.role === 'manager';

const isClientTenantStaff = (dbUser) =>
  Boolean(dbUser?.clientId) && !isPlatformAdmin(dbUser);

const coerceString = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

const coerceStringArray = (v) => {
  if (!Array.isArray(v)) return undefined;
  const clean = v.map((item) => String(item || '').trim()).filter(Boolean);
  return clean.length ? clean : undefined;
};

const buildClientCreatePayload = (payload = {}) => {
  const meta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : {};
  const mainField = coerceString(payload.mainField) || coerceString(payload.industry);
  const mainField2 = coerceStringArray(payload.mainField2) ?? coerceStringArray(meta.mainField2);
  const subField = coerceStringArray(payload.subField) ?? coerceStringArray(meta.subField);
  const secondaryField = coerceString(payload.secondaryField) ?? coerceString(meta.secondaryField);

  const out = {
    name: coerceString(payload.name) || coerceString(payload.clientName) || 'Client',
    displayName: coerceString(payload.displayName) || coerceString(payload.name) || coerceString(payload.clientName),
    industry: mainField,
    phone: coerceString(payload.phone),
    email: coerceString(payload.email),
    status: coerceString(payload.status),
    accountManager: coerceString(payload.accountManager),
    city: coerceString(payload.city),
    region: coerceString(payload.region),
    mainContactName: coerceString(payload.mainContactName),
    mainContactEmail: coerceString(payload.mainContactEmail),
    mainContactPhone: coerceString(payload.mainContactPhone),
    metadata: {
      ...meta,
      // keep commonly-used meta keys even if callers send them top-level
      website: meta.website ?? payload.website,
      address: meta.address ?? payload.address,
      contactRole: meta.contactRole ?? payload.contactRole,
      notes: meta.notes ?? payload.notes,
      ...(mainField ? { mainField } : {}),
      ...(mainField2 ? { mainField2 } : {}),
      ...(subField ? { subField } : {}),
      ...(secondaryField ? { secondaryField } : {}),
    },
  };
  if (payload.modules && typeof payload.modules === 'object' && !Array.isArray(payload.modules)) {
    out.modules = payload.modules;
  }
  const pkg = coerceString(payload.packageType);
  if (pkg) out.packageType = pkg;
  if (payload.isActive === true || payload.isActive === false) out.isActive = payload.isActive;
  const pc = coerceString(payload.primaryColor);
  if (pc) out.primaryColor = pc;
  const logo = coerceString(payload.logoUrl);
  if (logo !== undefined && payload.logoUrl != null) out.logoUrl = logo || null;
  const sms = coerceString(payload.smsSource);
  if (sms !== undefined && payload.smsSource != null) out.smsSource = sms || null;
  const domain = coerceString(payload.domain);
  if (domain !== undefined && payload.domain != null) out.domain = domain || null;
  const ips = coerceString(payload.authorizedIps);
  if (ips !== undefined && payload.authorizedIps != null) out.authorizedIps = ips || null;
  if (payload.renewalDate) {
    const d = new Date(payload.renewalDate);
    if (!Number.isNaN(d.getTime())) out.renewalDate = d;
  }
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const cvT = n(payload.cvQuotaTotal);
  if (cvT !== undefined) out.cvQuotaTotal = cvT;
  const tagsT = n(payload.tagsQuotaTotal);
  if (tagsT !== undefined) out.tagsQuotaTotal = tagsT;
  const jobsT = n(payload.jobsTotal);
  if (jobsT !== undefined) out.jobsTotal = jobsT;
  const usersT = n(payload.usersTotal);
  if (usersT !== undefined) out.usersTotal = usersT;
  const smsTot = n(payload.smsTotal);
  if (smsTot !== undefined) out.smsTotal = smsTot;
  const emailsT = n(payload.emailsQuotaTotal);
  if (emailsT !== undefined) out.emailsQuotaTotal = emailsT;
  const storageT = n(payload.storageQuotaTotal);
  if (storageT !== undefined) out.storageQuotaTotal = storageT;
  const aiT = n(payload.aiCreditsQuotaTotal);
  if (aiT !== undefined) out.aiCreditsQuotaTotal = aiT;
  return out;
};

const buildClientUpdatePayload = (client, payload = {}) => {
  const incomingMeta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : null;
  const mergedMeta = incomingMeta ? { ...(client.metadata || {}), ...incomingMeta } : undefined;

  const out = { ...payload };
  if (mergedMeta) out.metadata = mergedMeta;
  return out;
};

/**
 * Defensive helper: if a client's displayName was corrupted by a previous org-sync bug
 * (detectable by metadata.organizationSyncedAt being set), clear it from the serialised
 * response so the client's own `name` field is used instead.
 * This does NOT write back to the DB — run the SQL migration to permanently fix rows:
 *   UPDATE clients SET display_name = NULL
 *   WHERE metadata->>'organizationSyncedAt' IS NOT NULL AND display_name IS NOT NULL;
 */
const sanitizeClientDisplayName = (client) => {
  const plain = client && typeof client.get === 'function' ? client.get({ plain: true }) : client;
  if (!plain) return plain;
  const meta = plain.metadata;
  // If this row was synced from an org, and displayName differs from name, it was likely corrupted.
  if (meta?.organizationSyncedAt && plain.displayName && plain.displayName !== plain.name) {
    return { ...plain, displayName: null };
  }
  return plain;
};

/** Large JSONB columns — kept in DB for journal/history but omitted from GET /api/clients/:id. */
const CLIENT_API_EXCLUDE = ['events', 'documents', 'users', 'finance'];

const ORG_LINK_SUMMARY_ATTRIBUTES = [
  'id',
  'name',
  'nameEn',
  'legalName',
  'mainField',
  'mainField2',
  'subField',
  'secondaryField',
  'employeeCount',
  'type',
  'website',
  'logo',
  'address',
  'phone',
  'location',
  'description',
  'snippet',
  'structure',
  'businessModel',
  'productType',
  'activityStatus',
  'createdAt',
];

const clientToApiJson = (client) => {
  if (!client) return client;
  const plain = sanitizeClientDisplayName(
    client.toJSON ? client.toJSON() : (typeof client.get === 'function' ? client.get({ plain: true }) : client),
  );
  if (!plain || typeof plain !== 'object') return plain;
  for (const key of CLIENT_API_EXCLUDE) {
    if (key in plain) delete plain[key];
  }
  return plain;
};

const CLIENT_LIST_KEY = (activeOnly) => `clients:list:${activeOnly ? 'active' : 'all'}`;
const CLIENT_API_REDIS_KEY = (id) => `client:api:${id}`;
const CLIENT_JOURNAL_VER_REDIS_KEY = (id) => `client:journal:ver:${id}`;
const clientJournalRedisKey = (clientId, version, localKey) =>
  `client:journal:${clientId}:v${version}:${localKey}`;
const CLIENT_LIST_TTL = 300;
const CLIENT_API_REDIS_TTL = 3600;

const getClientJournalRedisVersion = async (clientId) => {
  if (!isReadThroughEnabled()) return 0;
  try {
    const raw = await redis.get(CLIENT_JOURNAL_VER_REDIS_KEY(clientId));
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
};

const bumpClientJournalRedisVersion = async (clientId) => {
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(CLIENT_JOURNAL_VER_REDIS_KEY(clientId));
  } catch {
    /* non-fatal */
  }
};

const invalidateClientRedis = async (id) => {
  await readThrough.invalidate(CLIENT_LIST_KEY(true), CLIENT_LIST_KEY(false));
  if (id) {
    await readThrough.invalidate(CLIENT_API_REDIS_KEY(id));
    await bumpClientJournalRedisVersion(id);
  }
};

const journalEventCountSql = `
  CASE
    WHEN jsonb_array_length(COALESCE(events_recent, '[]'::jsonb)) > 0
    THEN jsonb_array_length(events_recent)
    ELSE jsonb_array_length(COALESCE(events, '[]'::jsonb))
  END`;

/** Clients that have at least one journal row (events_recent or full events blob). */
const listClientIdsWithJournalEvents = async () => {
  const { sequelize } = Client;
  const rows = await sequelize.query(
    `SELECT id
     FROM clients
     WHERE jsonb_array_length(COALESCE(events_recent, '[]'::jsonb)) > 0
        OR jsonb_array_length(COALESCE(events, '[]'::jsonb)) > 0
     ORDER BY ${journalEventCountSql} DESC, name ASC`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => String(row.id));
};

const fetchJournalEventCountsByClientId = async (activeOnly = false) => {
  const { sequelize } = Client;
  const where = activeOnly ? 'WHERE "isActive" IS NOT FALSE' : '';
  const rows = await sequelize.query(
    `SELECT id, ${journalEventCountSql} AS cnt FROM clients ${where}`,
    { type: QueryTypes.SELECT },
  );
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.id), Math.max(0, Number(row.cnt) || 0));
  }
  return map;
};

const list = async (options = {}) => {
  const activeOnly = Boolean(options.activeOnly);
  const includeJournalCounts = Boolean(options.includeJournalCounts);
  const cacheKey = `${CLIENT_LIST_KEY(activeOnly)}${includeJournalCounts ? ':jc' : ''}`;
  return readThrough.getOrLoad(
    cacheKey,
    async () => {
      const q = {
        order: [['name', 'ASC']],
        attributes: { exclude: CLIENT_API_EXCLUDE },
      };
      if (activeOnly) {
        q.where = { isActive: true };
      }
      const rows = await Client.findAll(q);
      const sanitized = rows.map(sanitizeClientDisplayName);
      if (!includeJournalCounts) return sanitized;
      const counts = await fetchJournalEventCountsByClientId(activeOnly);
      return sanitized.map((row) => {
        const plain = clientToApiJson(row);
        return {
          ...plain,
          journalEventCount: counts.get(String(plain.id)) || 0,
        };
      });
    },
    { ttlSeconds: CLIENT_LIST_TTL, scope: 'clients:list' },
  );
};

const clientNotFound = () => {
  const err = new Error('Client not found');
  err.status = 404;
  return err;
};

const getById = async (id, { include } = {}) => {
  const includeBlobs = new Set(
    (Array.isArray(include) ? include : include ? [include] : []).filter((col) =>
      CLIENT_API_EXCLUDE.includes(col),
    ),
  );
  const exclude = CLIENT_API_EXCLUDE.filter((col) => !includeBlobs.has(col));
  const client = await Client.findByPk(id, {
    attributes: exclude.length ? { exclude } : undefined,
  });
  if (!client) throw clientNotFound();
  return client;
};

const CLIENT_JOURNAL_CACHE_MS = Math.max(
  0,
  Number.parseInt(process.env.CLIENT_JOURNAL_CACHE_MS || '45000', 10) || 45000,
);
/** @type {Map<string, { at: number, data: unknown }>} */
const clientJournalCache = new Map();
/** @type {Map<string, Promise<unknown>>} */
const clientJournalInflight = new Map();

/** Cap concurrent scans/writes on clients.events JSONB so the API pool keeps headroom. */
const CLIENT_JSONB_HEAVY_MAX = Math.max(
  1,
  Number.parseInt(process.env.CLIENT_JSONB_HEAVY_MAX || '2', 10) || 2,
);
const CLIENT_JSONB_HEAVY_QUEUE_MS = Math.max(
  1000,
  Number.parseInt(process.env.CLIENT_JSONB_HEAVY_QUEUE_MS || '12000', 10) || 12000,
);
let clientJsonbHeavyInflight = 0;
/** @type {Array<() => void>} */
const clientJsonbHeavyWaiters = [];

const acquireClientJsonbHeavySlot = () =>
  new Promise((resolve, reject) => {
    if (clientJsonbHeavyInflight < CLIENT_JSONB_HEAVY_MAX) {
      clientJsonbHeavyInflight += 1;
      resolve();
      return;
    }
    const entry = () => {
      clearTimeout(timer);
      clientJsonbHeavyInflight += 1;
      resolve();
    };
    const timer = setTimeout(() => {
      const i = clientJsonbHeavyWaiters.indexOf(entry);
      if (i >= 0) clientJsonbHeavyWaiters.splice(i, 1);
      const err = new Error('Client events database busy; retry shortly');
      err.status = 503;
      reject(err);
    }, CLIENT_JSONB_HEAVY_QUEUE_MS);
    clientJsonbHeavyWaiters.push(entry);
  });

const releaseClientJsonbHeavySlot = () => {
  clientJsonbHeavyInflight = Math.max(0, clientJsonbHeavyInflight - 1);
  const next = clientJsonbHeavyWaiters.shift();
  if (next) next();
};

const withClientJsonbHeavySlot = async (fn) => {
  await acquireClientJsonbHeavySlot();
  try {
    return await fn();
  } finally {
    releaseClientJsonbHeavySlot();
  }
};

const journalCacheKey = (
  clientId,
  contactId,
  eventsElementCap = 0,
  journalLoadHint = null,
  organizationScope = null,
) => {
  const hintKey = journalLoadHint
    ? `${String(journalLoadHint.q || '')}|${journalLoadHint.activeOnly ? 'a1' : 'a0'}|${journalLoadHint.preferRecentCache ? 'recent' : 'full'}`
    : '';
  const orgKey =
    organizationScope && (organizationScope.organizationId || organizationScope.organizationTmpId)
      ? `${String(organizationScope.organizationId || '')}|${String(organizationScope.organizationTmpId || '')}`
      : '';
  return `${clientId}:${contactId || ''}:org${orgKey}:${eventsElementCap > 0 ? `cap${eventsElementCap}` : 'all'}:${hintKey}`;
};

/** Max rows returned from SQL slice (API may still apply limit=20 after filters). */
const CLIENT_JOURNAL_LIST_EVENTS_CAP = Math.max(
  40,
  Number.parseInt(process.env.CLIENT_JOURNAL_LIST_EVENTS_CAP || '280', 10) || 280,
);

/** Only expand the first N entries of clients.events (new events are prepended). */
const CLIENT_JOURNAL_EVENTS_SCAN_WINDOW = Math.max(
  80,
  Number.parseInt(process.env.CLIENT_JOURNAL_EVENTS_SCAN_WINDOW || '520', 10) || 520,
);

const JOURNAL_EVENTS_SLICE_STATEMENT_MS = Math.max(
  8000,
  Number.parseInt(process.env.CLIENT_JOURNAL_EVENTS_SLICE_STATEMENT_MS || '25000', 10) || 25000,
);

/**
 * Journal list loads a capped SQL slice of JSONB (not the full blob). Set CLIENT_JOURNAL_LIST_EVENTS_FULL=1 to force full load.
 */
const resolveJournalListEventsCap = (limit, useSlice, needsDeepFilters, offset = 0) => {
  if (!useSlice) return 0;
  if (process.env.CLIENT_JOURNAL_LIST_EVENTS_FULL === '1') return 0;
  const lim = Math.max(1, Number(limit) || 10);
  const off = Math.max(0, Number(offset) || 0);
  const pageNeed = off + lim;
  if (needsDeepFilters) {
    const deepCap = Math.max(
      120,
      Number.parseInt(process.env.CLIENT_JOURNAL_DEEP_FILTER_CAP || '480', 10) || 480,
    );
    const mult = Number.parseInt(process.env.CLIENT_JOURNAL_DEEP_FILTER_MULT || '16', 10) || 16;
    return Math.min(900, Math.max(deepCap, pageNeed * mult));
  }
  const mult = Number.parseInt(process.env.CLIENT_JOURNAL_PAGE_FETCH_MULT || '14', 10) || 14;
  return Math.min(450, Math.max(CLIENT_JOURNAL_LIST_EVENTS_CAP, pageNeed * mult));
};

const parseJsonbRow = (raw) => {
  if (raw == null) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

const JOURNAL_EVENT_HAYSTACK_SQL = `
  lower(concat_ws(' ',
    coalesce(t.elem->>'contactName',''),
    coalesce(t.elem->>'title',''),
    coalesce(t.elem->>'description',''),
    coalesce(t.elem->>'stage',''),
    coalesce(t.elem->>'process',''),
    coalesce(t.elem->'metadata'->>'candidateName',''),
    coalesce(t.elem->'metadata'->>'contactName',''),
    coalesce(t.elem->'metadata'->>'jobTitle',''),
    coalesce(t.elem->'metadata'->>'jobCompany','')
  ))
`;

const loadJournalEventsSliceFromDb = async (sequelize, id, { cap, q, activeOnly }) =>
  withClientJsonbHeavySlot(() => loadJournalEventsSliceFromDbInner(sequelize, id, { cap, q, activeOnly }));

const runJournalEventsSliceQuery = async (sequelize, id, eventsSourceColumn, opts, transaction) => {
  const { cap, q, activeOnly } = opts;
  const searchTokens = q ? String(q).trim().split(/\s+/).filter(Boolean) : [];
  const rowCap = Math.max(1, Number(cap) || 20);
  const hasSearch = searchTokens.length > 0;
  const scanWindow = Math.min(
    CLIENT_JOURNAL_EVENTS_SCAN_WINDOW,
    Math.max(rowCap * 3, 120),
  );
  const replacements = { id, cap: rowCap, scanWindow, activeOnly: Boolean(activeOnly) };
  const ordinalityClause = hasSearch ? '' : 'AND t.ordinality <= :scanWindow';
  let searchClause = '';
  if (searchTokens.length) {
    const parts = searchTokens.map((tok, i) => {
      const key = `st${i}`;
      replacements[key] = `%${String(tok).replace(/[%_\\]/g, '\\$&')}%`;
      return `${JOURNAL_EVENT_HAYSTACK_SQL} LIKE :${key}`;
    });
    searchClause = `AND (${parts.join(' AND ')})`;
  }
  const activeClause = activeOnly ? `AND (t.elem->>'isActive') IS DISTINCT FROM 'false'` : '';
  const sourceJsonb = `COALESCE(c.events, '[]'::jsonb)`;

  const rows = await sequelize.query(
    `SELECT c.id, c.name, c."displayName",
       (
         SELECT COALESCE(jsonb_agg(sub.elem ORDER BY sub.sort_ts DESC NULLS LAST), '[]'::jsonb)
         FROM (
           SELECT t.elem,
             COALESCE(
               NULLIF(trim(both from t.elem->>'dueDate'), ''),
               NULLIF(trim(both from t.elem->>'date'), '')
             ) AS sort_ts
           FROM jsonb_array_elements(${sourceJsonb})
             WITH ORDINALITY AS t(elem, ordinality)
           WHERE 1=1
           ${ordinalityClause}
           ${activeClause}
           ${searchClause}
           ORDER BY sort_ts DESC NULLS LAST
           LIMIT :cap
         ) sub
       ) AS events
     FROM clients c
     WHERE c.id = :id
     LIMIT 1`,
    {
      replacements,
      type: QueryTypes.SELECT,
      transaction,
    },
  );
  return rows[0];
};

const journalEventSearchHaystack = (elem) => {
  if (!elem || typeof elem !== 'object') return '';
  const meta = elem.metadata && typeof elem.metadata === 'object' ? elem.metadata : {};
  return [
    elem.contactName,
    elem.title,
    elem.description,
    elem.stage,
    elem.process,
    meta.candidateName,
    meta.contactName,
    meta.jobTitle,
    meta.jobCompany,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
};

const readClientEventsRecentRow = async (sequelize, id) =>
  sequelize.transaction(async (t) => {
    await sequelize.query('SET LOCAL statement_timeout = 8000', { transaction: t });
    const rows = await sequelize.query(
      `SELECT id, name, "displayName", COALESCE(events_recent, '[]'::jsonb) AS events_recent
       FROM clients
       WHERE id = :id
       LIMIT 1`,
      {
        replacements: { id },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    const row = rows[0];
    if (!row) throw clientNotFound();
    let list = parseJsonbRow(row.events_recent);
    if (!Array.isArray(list)) list = [];
    return { row, list };
  });

const CLOSED_JOURNAL_STATUSES = new Set(['הושלם', 'בוטל']);

const isOpenJournalStatus = (status) =>
  !CLOSED_JOURNAL_STATUSES.has(String(status || 'עתידי').trim());

const recentEventContactIds = (event) => {
  const ids = [];
  const direct = String(event?.contactId || '').trim();
  if (direct) ids.push(direct);
  const linkedId = String(event?.linkedTo?.id || '').trim();
  if (linkedId) ids.push(linkedId);
  const metaContacts = event?.metadata?.linkedContacts;
  if (Array.isArray(metaContacts)) {
    for (const row of metaContacts) {
      const linked = String(row?.id || '').trim();
      if (linked) ids.push(linked);
    }
  }
  return ids;
};

/** Same contact rules as the profile badge (`rawEventMatchesContactScope`). */
const recentEventMatchesContact = (event, contactId, contactName) => {
  const cid = String(contactId || '').trim();
  if (!cid) return true;
  if (recentEventContactIds(event).includes(cid)) return true;
  const eventContactId = String(event?.contactId || '').trim();
  if (eventContactId && eventContactId !== cid) return false;
  const linkedId = String(event?.linkedTo?.id || '').trim();
  if (linkedId && linkedId !== cid) return false;
  const metaContacts = event?.metadata?.linkedContacts;
  if (Array.isArray(metaContacts) && metaContacts.length > 0) {
    const metaIds = metaContacts.map((row) => String(row?.id || '').trim()).filter(Boolean);
    if (metaIds.length > 0) return metaIds.includes(cid);
  }
  if (eventContactId || linkedId) return false;
  const name = String(contactName || '').trim();
  if (!name) return false;
  if (String(event?.contactName || '').trim() === name) return true;
  return String(event?.linkedTo?.name || '').trim() === name;
};

const recentEventMatchesOrg = (event, { orgId, tmpId, contactIds, byId }, seen = new Set()) => {
  const eventOrgId = String(event?.organizationId || '').trim();
  const eventTmpId = String(event?.organizationTmpId || '').trim();
  if (tmpId) {
    if (eventTmpId) return eventTmpId === tmpId;
    if (eventOrgId) return false;
  } else if (orgId) {
    if (eventOrgId === orgId) return true;
    if (recentEventContactIds(event).some((id) => contactIds.has(id))) return true;
  }
  const parentId = String(event?.metadata?.parentEventId || '').trim();
  if (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (parent) return recentEventMatchesOrg(parent, { orgId, tmpId, contactIds, byId }, seen);
  }
  return false;
};

const loadOrgContactIdSet = async (clientId, organizationId) => {
  const ClientContact = require('../models/ClientContact');
  const contacts = await ClientContact.findAll({
    where: { clientId, organizationId },
    attributes: ['id'],
    limit: 2000,
  });
  return new Set(contacts.map((c) => String(c.id)));
};

const loadRecentJournalHead = async (sequelize, id) => {
  let { row, list } = await readClientEventsRecentRow(sequelize, id);
  if (!list.length) {
    try {
      await withClientJsonbHeavySlot(() => ensureClientEventsRecentBackfill(sequelize, id));
      ({ row, list } = await readClientEventsRecentRow(sequelize, id));
    } catch (err) {
      console.warn(
        '[clientService] events_recent backfill failed',
        id,
        String(err?.message || err).slice(0, 160),
      );
    }
  }
  return { row, list };
};

/**
 * Badge count from the slim journal head. Does not expand clients.events.
 * Returns null when the head is missing so the caller can fall back.
 */
const countOpenJournalEvents = async (
  clientId,
  { contactId, contactName, organizationId, organizationTmpId } = {},
) => {
  const key = String(clientId || '').trim();
  if (!key) return 0;
  const { sequelize } = Client;
  const { list } = await loadRecentJournalHead(sequelize, key);
  const cid = String(contactId || '').trim();
  const orgId = String(organizationId || '').trim();
  const tmpId = String(organizationTmpId || '').trim();
  let rows = list;
  if (cid) {
    rows = rows.filter((event) => recentEventMatchesContact(event, cid, contactName));
  } else if (tmpId) {
    rows = rows.filter((event) => String(event?.organizationTmpId || '').trim() === tmpId);
  } else if (orgId) {
    rows = rows.filter((event) => String(event?.organizationId || '').trim() === orgId);
  }
  return rows.filter((event) => event && isOpenJournalStatus(event.status)).length;
};

/** Paginated journal: read events_recent only (hot path). One-time backfill if cache empty. */
const loadJournalEventsRecentOnlyInner = async (sequelize, id, { cap, q, activeOnly }) => {
  const rowCap = Math.max(1, Number(cap) || 20);
  const searchTokens = q ? String(q).trim().split(/\s+/).filter(Boolean) : [];

  let { row, list } = await readClientEventsRecentRow(sequelize, id);

  if (!list.length) {
    try {
      await withClientJsonbHeavySlot(() => ensureClientEventsRecentBackfill(sequelize, id));
      ({ row, list } = await readClientEventsRecentRow(sequelize, id));
    } catch (err) {
      console.warn(
        '[clientService] events_recent backfill failed',
        id,
        String(err?.message || err).slice(0, 160),
      );
    }
  }

  if (!list.length) {
    try {
      const fallback = await withClientJsonbHeavySlot(() =>
        loadJournalEventsSliceFromDbInner(sequelize, id, {
          cap: rowCap,
          q,
          activeOnly,
          preferRecentCache: false,
        }),
      );
      const parsed = parseJsonbRow(fallback?.events);
      list = Array.isArray(parsed) ? parsed : [];
      if (fallback?.id) {
        row = {
          id: fallback.id,
          name: fallback.name,
          displayName: fallback.displayName,
        };
      }
      if (list.length) {
        scheduleBackfillClientEventsRecent(sequelize, id);
      }
    } catch (err) {
      console.warn(
        '[clientService] journal fallback to clients.events failed',
        id,
        String(err?.message || err).slice(0, 160),
      );
    }
  }

  if (activeOnly) {
    list = list.filter((e) => e && e.isActive !== false);
  }
  if (searchTokens.length) {
    list = list.filter((e) => {
      const hay = journalEventSearchHaystack(e);
      return searchTokens.every((tok) => hay.includes(String(tok).toLowerCase()));
    });
  }
  list.sort((a, b) => {
    const da = String(a?.dueDate || a?.date || '');
    const db = String(b?.dueDate || b?.date || '');
    return db.localeCompare(da);
  });

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    events: list.slice(0, rowCap),
  };
};

const loadJournalEventsSliceFromDbInner = async (
  sequelize,
  id,
  { cap, q, activeOnly, preferRecentCache },
) => {
  const searchQ = q ? String(q).trim() : '';
  const useRecentOnly =
    Boolean(preferRecentCache)
    && !searchQ
    && process.env.CLIENT_JOURNAL_USE_RECENT !== '0';

  if (useRecentOnly) {
    return loadJournalEventsRecentOnlyInner(sequelize, id, { cap, q, activeOnly });
  }

  return sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${JOURNAL_EVENTS_SLICE_STATEMENT_MS}`, {
      transaction: t,
    });
    const row = await runJournalEventsSliceQuery(
      sequelize,
      id,
      'events',
      { cap, q, activeOnly },
      t,
    );
    if (!row) throw clientNotFound();
    return row;
  });
};

/** Journal list scoped to organization — scans full events JSONB for org/contact matches (not global recent slice). */
const loadJournalEventsForOrganizationScopeInner = async (
  sequelize,
  id,
  { organizationId, organizationTmpId, cap, q, activeOnly },
) => {
  const orgId = organizationId ? String(organizationId).trim() : '';
  const tmpId = organizationTmpId ? String(organizationTmpId).trim() : '';
  if (!orgId && !tmpId) return null;

  let contactIds = [];
  if (orgId) {
    const ClientContact = require('../models/ClientContact');
    const contacts = await ClientContact.findAll({
      where: { clientId: id, organizationId: orgId },
      attributes: ['id'],
      limit: 2000,
    });
    contactIds = contacts.map((c) => String(c.id));
  }

  const rowCap = Math.max(1, Number(cap) || 20);
  const searchTokens = q ? String(q).trim().split(/\s+/).filter(Boolean) : [];
  const replacements = {
    id,
    cap: rowCap,
    orgId: orgId || null,
    tmpId: tmpId || null,
    contactIds: contactIds.length ? contactIds : ['__no_contacts__'],
    activeOnly: Boolean(activeOnly),
  };
  let searchClause = '';
  if (searchTokens.length) {
    const parts = searchTokens.map((tok, i) => {
      const key = `st${i}`;
      replacements[key] = `%${String(tok).replace(/[%_\\]/g, '\\$&')}%`;
      return `${JOURNAL_EVENT_HAYSTACK_SQL} LIKE :${key}`;
    });
    searchClause = `AND (${parts.join(' AND ')})`;
  }
  const activeClause = activeOnly ? `AND (t.elem->>'isActive') IS DISTINCT FROM 'false'` : '';

  let orgMatchClause;
  if (tmpId && !orgId) {
    orgMatchClause = `(t.elem->>'organizationTmpId' = :tmpId)`;
  } else if (orgId) {
    orgMatchClause = `(
      t.elem->>'organizationId' = :orgId
      OR t.elem->>'contactId' = ANY(ARRAY[:contactIds]::text[])
      OR t.elem->'linkedTo'->>'id' = ANY(ARRAY[:contactIds]::text[])
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(t.elem->'metadata'->'linkedContacts', '[]'::jsonb)) AS lc(elem)
        WHERE lc.elem->>'id' = ANY(ARRAY[:contactIds]::text[])
      )
    )`;
  } else {
    return null;
  }

  return sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${JOURNAL_EVENTS_SLICE_STATEMENT_MS}`, {
      transaction: t,
    });
    const rows = await sequelize.query(
      `SELECT c.id, c.name, c."displayName",
         (
           SELECT COALESCE(jsonb_agg(sub.elem ORDER BY sub.sort_ts DESC NULLS LAST), '[]'::jsonb)
           FROM (
             SELECT t.elem,
               COALESCE(
                 NULLIF(trim(both from t.elem->>'dueDate'), ''),
                 NULLIF(trim(both from t.elem->>'date'), '')
               ) AS sort_ts
             FROM jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) AS t(elem)
             WHERE ${orgMatchClause}
             ${activeClause}
             ${searchClause}
             ORDER BY sort_ts DESC NULLS LAST
             LIMIT :cap
           ) sub
         ) AS events
       FROM clients c
       WHERE c.id = :id
       LIMIT 1`,
      {
        replacements,
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    const row = rows[0];
    if (!row) throw clientNotFound();
    return row;
  });
};

/**
 * Org/contact journal reads from the slim head (events_recent).
 * Returns null when the head is empty so the caller can scan clients.events once.
 */
const tryLoadJournalFromRecent = async (
  id,
  {
    contactId,
    organizationId,
    organizationTmpId,
    eventsElementCap = 0,
    journalLoadHint = null,
  } = {},
) => {
  const key = String(id || '').trim();
  const cap = Math.max(0, Number(eventsElementCap) || 0);
  if (!key || cap <= 0) return null;
  const { sequelize } = Client;
  const { row, list } = await loadRecentJournalHead(sequelize, key);
  if (!row || !list.length) return null;

  const cid = String(contactId || '').trim();
  const orgId = String(organizationId || '').trim();
  const tmpId = String(organizationTmpId || '').trim();
  let rows = list;
  if (cid) {
    rows = rows.filter((event) =>
      recentEventMatchesContact(event, cid, journalLoadHint?.contactName),
    );
  } else if (orgId || tmpId) {
    const contactIds = orgId ? await loadOrgContactIdSet(key, orgId) : new Set();
    const byId = new Map(rows.map((event) => [String(event?.id || ''), event]));
    rows = rows.filter((event) =>
      recentEventMatchesOrg(event, { orgId, tmpId, contactIds, byId }),
    );
  }
  if (journalLoadHint?.activeOnly) {
    rows = rows.filter((event) => event && event.isActive !== false);
  }
  const searchTokens = journalLoadHint?.q
    ? String(journalLoadHint.q).trim().split(/\s+/).filter(Boolean)
    : [];
  if (searchTokens.length) {
    rows = rows.filter((event) => {
      const hay = journalEventSearchHaystack(event);
      return searchTokens.every((tok) => hay.includes(String(tok).toLowerCase()));
    });
  }
  rows.sort((a, b) => {
    const da = String(a?.dueDate || a?.date || '');
    const db = String(b?.dueDate || b?.date || '');
    return db.localeCompare(da);
  });
  const scoped = Boolean(cid || orgId || tmpId);
  const headTruncated = list.length >= CLIENT_EVENTS_RECENT_MAX;
  if (scoped && headTruncated && rows.length < cap) return null;
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    events: rows.slice(0, cap),
  };
};

const invalidateClientJournalCache = (id) => {
  const key = String(id || '').trim();
  if (!key) return;
  for (const k of clientJournalCache.keys()) {
    if (k.startsWith(`${key}:`)) clientJournalCache.delete(k);
  }
};

const loadByIdForJournalFromDb = async (
  id,
  {
    contactId,
    organizationId,
    organizationTmpId,
    eventsElementCap = 0,
    journalLoadHint = null,
  } = {},
) => {
  const preferRecent =
    Boolean(journalLoadHint?.preferRecentCache)
    && process.env.CLIENT_JOURNAL_USE_RECENT !== '0';
  if (preferRecent) {
    const recent = await tryLoadJournalFromRecent(id, {
      contactId,
      organizationId,
      organizationTmpId,
      eventsElementCap,
      journalLoadHint,
    });
    if (recent) return recent;
  }
  return withClientJsonbHeavySlot(() =>
    loadByIdForJournalFromDbInner(id, {
      contactId,
      organizationId,
      organizationTmpId,
      eventsElementCap,
      journalLoadHint: journalLoadHint
        ? { ...journalLoadHint, preferRecentCache: false }
        : journalLoadHint,
    }),
  );
};

const loadByIdForJournalFromDbInner = async (
  id,
  {
    contactId,
    organizationId,
    organizationTmpId,
    eventsElementCap = 0,
    journalLoadHint = null,
  } = {},
) => {
  const key = String(id || '').trim();
  if (!key) throw clientNotFound();
  const cid = String(contactId || '').trim();
  const orgId = String(organizationId || '').trim();
  const orgTmp = String(organizationTmpId || '').trim();
  const cap = Math.max(0, Number(eventsElementCap) || 0);
  const { sequelize } = Client;

  if (cap > 0 && !cid && (orgId || orgTmp)) {
    const orgRow = await loadJournalEventsForOrganizationScopeInner(sequelize, key, {
      organizationId: orgId,
      organizationTmpId: orgTmp,
      cap,
      q: journalLoadHint?.q || '',
      activeOnly: Boolean(journalLoadHint?.activeOnly),
    });
    if (orgRow) return orgRow;
  }

  if (cap > 0 && !cid) {
    return loadJournalEventsSliceFromDbInner(sequelize, key, {
      cap,
      q: journalLoadHint?.q || '',
      activeOnly: Boolean(journalLoadHint?.activeOnly),
      preferRecentCache: Boolean(journalLoadHint?.preferRecentCache),
    });
  }

  return sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${JOURNAL_EVENTS_SLICE_STATEMENT_MS}`, {
      transaction: t,
    });
    if (cid) {
      const contactCap = cap > 0 ? cap : null;
      const rows = await sequelize.query(
        `SELECT id, name, "displayName",
           COALESCE((
             SELECT jsonb_agg(sub.elem ORDER BY sub.sort_ts DESC NULLS LAST)
             FROM (
               SELECT elem,
                 COALESCE(
                   NULLIF(trim(both from elem->>'dueDate'), ''),
                   NULLIF(trim(both from elem->>'date'), '')
                 ) AS sort_ts
               FROM jsonb_array_elements(COALESCE(events, '[]'::jsonb)) AS elem
               WHERE elem->>'contactId' = :contactId
                  OR elem->'linkedTo'->>'id' = :contactId
                  OR COALESCE(elem->'metadata'->'linkedContacts', '[]'::jsonb)
                     @> jsonb_build_array(jsonb_build_object('id', :contactId))
               ORDER BY sort_ts DESC NULLS LAST
               ${contactCap ? 'LIMIT :cap' : ''}
             ) sub
           ), '[]'::jsonb) AS events
         FROM clients
         WHERE id = :id
         LIMIT 1`,
        {
          replacements: { id: key, contactId: cid, ...(contactCap ? { cap: contactCap } : {}) },
          type: QueryTypes.SELECT,
          transaction: t,
        },
      );
      const row = rows[0];
      if (!row) throw clientNotFound();
      return row;
    }
    const client = await Client.findByPk(key, {
      attributes: ['id', 'name', 'displayName', 'events'],
      transaction: t,
    });
    if (!client) throw clientNotFound();
    return client;
  });
};

/** Journal read: id/name/events (+ optional contact filter). Cached + single-flight per key. */
const getByIdForJournal = async (
  id,
  {
    contactId,
    organizationId,
    organizationTmpId,
    skipCache = false,
    eventsElementCap = 0,
    journalLoadHint = null,
  } = {},
) => {
  const key = String(id || '').trim();
  if (!key) throw clientNotFound();
  const cap = Math.max(0, Number(eventsElementCap) || 0);
  const organizationScope =
    organizationId || organizationTmpId
      ? {
          organizationId: organizationId ? String(organizationId).trim() : '',
          organizationTmpId: organizationTmpId ? String(organizationTmpId).trim() : '',
        }
      : null;
  const cacheKey = journalCacheKey(key, contactId, cap, journalLoadHint, organizationScope);

  if (!skipCache && CLIENT_JOURNAL_CACHE_MS > 0) {
    const hit = clientJournalCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CLIENT_JOURNAL_CACHE_MS) {
      return hit.data;
    }
    const inflight = clientJournalInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const loadFromDb = () =>
    loadByIdForJournalFromDb(id, {
      contactId,
      organizationId: organizationScope?.organizationId,
      organizationTmpId: organizationScope?.organizationTmpId,
      eventsElementCap: cap,
      journalLoadHint,
    });

  const journalRedisTtl = Math.max(15, Math.ceil(CLIENT_JOURNAL_CACHE_MS / 1000) || 45);

  const run = (async () => {
    if (skipCache || !isReadThroughEnabled()) {
      return loadFromDb();
    }
    const ver = await getClientJournalRedisVersion(key);
    return readThrough.getOrLoad(
      clientJournalRedisKey(key, ver, cacheKey),
      loadFromDb,
      { ttlSeconds: journalRedisTtl, scope: 'client:journal' },
    );
  })();

  if (!skipCache && CLIENT_JOURNAL_CACHE_MS > 0) {
    clientJournalInflight.set(cacheKey, run);
  }
  try {
    const data = await run;
    if (!skipCache && CLIENT_JOURNAL_CACHE_MS > 0) {
      clientJournalCache.set(cacheKey, { at: Date.now(), data });
    }
    return data;
  } catch (err) {
    const timedOut =
      err?.status === 503
      || err?.parent?.code === '57014'
      || err?.parent?.code === '55P03'
      || /statement timeout/i.test(String(err?.message || ''))
      || /lock timeout/i.test(String(err?.message || ''))
      || /database busy/i.test(String(err?.message || ''));
    if (!skipCache && timedOut) {
      const stale = clientJournalCache.get(cacheKey);
      if (stale?.data) return stale.data;
    }
    throw err;
  } finally {
    clientJournalInflight.delete(cacheKey);
  }
};

const CLIENT_BY_ID_CACHE_MS = 30_000;
/** @type {Map<string, { at: number, data: Record<string, unknown> }>} */
const clientByIdApiCache = new Map();

const invalidateClientApiCache = (id) => {
  const key = String(id || '').trim();
  if (key) {
    clientByIdApiCache.delete(key);
    invalidateClientJournalCache(key);
  }
  invalidateClientRedis(key).catch(() => {});
};

/** Slim client row for HTTP API (no events journal blob / embedded documents). */
const getByIdForApi = async (id, { skipCache = false } = {}) => {
  const key = String(id || '').trim();
  if (!key) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  if (!skipCache) {
    const hit = clientByIdApiCache.get(key);
    if (hit && Date.now() - hit.at < CLIENT_BY_ID_CACHE_MS) {
      recordBypass('client:api');
      return hit.data;
    }
    if (isReadThroughEnabled()) {
      try {
        const redisHit = await redis.get(CLIENT_API_REDIS_KEY(key));
        if (redisHit) {
          recordHit('client:api');
          clientByIdApiCache.set(key, { at: Date.now(), data: redisHit });
          return redisHit;
        }
        recordMiss('client:api');
      } catch (_) {
        recordMiss('client:api');
      }
    } else {
      recordBypass('client:api');
    }
  }
  const client = await Client.findByPk(key, {
    attributes: { exclude: CLIENT_API_EXCLUDE },
  });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const data = clientToApiJson(client);
  clientByIdApiCache.set(key, { at: Date.now(), data });
  if (isReadThroughEnabled()) {
    redis.set(CLIENT_API_REDIS_KEY(key), data, { ttlSeconds: CLIENT_API_REDIS_TTL }).catch(() => {});
  }
  return data;
};

const create = async (payload) => {
  const clean = buildClientCreatePayload(payload);
  const client = await Client.create(clean);
  await invalidateClientRedis(client.id);
  return client;
};

/**
 * After Client.create: link an existing org immediately, or start Gemini classify +
 * background enrichment for a typed company name (same deferred pipeline as organization-link).
 */
const attachOrganizationAfterCreate = async (client, payload = {}, options = {}) => {
  if (!client?.id) return client;

  const linkedId = coerceString(payload.linkedOrganizationId) || coerceString(payload.organizationId);
  if (linkedId) {
    const linked = await clientOrganizationSyncService.linkClientToOrganization(client.id, linkedId);
    if (linked) return linked;
  }

  if (options.skipOrganizationStaging) return client;

  return linkOrganizationForClient(client.id, {
    ...payload,
    name: coerceString(payload.name) || coerceString(payload.displayName) || client.name,
    backgroundEnrichment: payload.backgroundEnrichment !== false,
  });
};

const applyClientOrganizationLinkPipelineResult = async (clientId, pipelineResult) => {
  if (pipelineResult?.organization?.id) {
    const orgId = String(pipelineResult.organization.id);
    console.log(`[orgLinkPipeline] linking client ${clientId} to new org ${orgId} (post-enrichment)`);
    await clientOrganizationSyncService.linkClientToOrganization(clientId, orgId, { fullSync: true });
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationId = orgId;
    json.orgPipeline = pipelineResult.orgPipeline || null;
    console.log(`[orgLinkPipeline] ✓ client ${clientId} linked to enriched org ${orgId}`, json.orgPipeline);
    return json;
  }

  const tmp = pipelineResult?.organizationTmp;
  if (tmp?.id) {
    console.log(`[orgLinkPipeline] linking client ${clientId} to OrganizationTmp ${tmp.id}`);
    await clientOrganizationSyncService.ensureOrganizationTmpLink(clientId, tmp.id, { isPrimary: true });
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationTmpId = String(tmp.id);
    json.orgPipeline = pipelineResult.orgPipeline || null;
    console.log(`[orgLinkPipeline] ✓ client ${clientId} staged via tmp ${tmp.id}`, json.orgPipeline);
    return json;
  }

  console.warn(`[orgLinkPipeline] pipeline returned no org/tmp for client ${clientId}`, pipelineResult?.orgPipeline);
  const json = await getByIdWithLinks(clientId);
  json.orgPipeline = pipelineResult?.orgPipeline || null;
  return json;
};

/**
 * Client manager: link existing Organization or stage OrganizationTmp for their tenant client.
 * Does not create a new Client row.
 */
const linkOrganizationForClient = async (clientId, payload = {}) => {
  const client = await getById(clientId);
  const linkedId = coerceString(payload.linkedOrganizationId) || coerceString(payload.organizationId);
  const companyName = coerceString(payload.name) || client?.name || '';
  const backgroundEnrichment = payload.backgroundEnrichment !== false;

  console.log('[orgLinkPipeline] linkOrganizationForClient called', {
    clientId,
    companyName,
    linkedOrganizationId: linkedId || null,
    mode: linkedId ? 'link_existing' : 'new_company',
    backgroundEnrichment,
  });

  if (linkedId) {
    console.log(`[orgLinkPipeline] linking client ${clientId} to existing org ${linkedId}`);
    await clientOrganizationSyncService.linkClientToOrganization(clientId, linkedId, { fullSync: true });
    if (backgroundEnrichment) {
      const existingOrg = await Organization.findByPk(linkedId);
      scheduleOrganizationEnrichmentIfNeeded(existingOrg);
    }
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationId = linkedId;
    console.log(`[orgLinkPipeline] ✓ linked client ${clientId} → org ${linkedId}`);
    return json;
  }

  const patch = buildClientCreatePayload(payload);
  const clientUpdates = {};
  if (patch.industry) clientUpdates.industry = patch.industry;
  if (patch.phone) clientUpdates.phone = patch.phone;
  if (patch.logoUrl != null) clientUpdates.logoUrl = patch.logoUrl;
  if (patch.metadata) {
    clientUpdates.metadata = { ...(client.metadata || {}), ...patch.metadata };
  }
  if (Object.keys(clientUpdates).length) {
    await client.update(clientUpdates);
  }

  // Exact name only — alias matches must not steal a typed new company onto another org.
  const existingOrg = companyName
    ? await Organization.findOne({ where: { name: { [Op.iLike]: companyName } } })
    : null;
  if (existingOrg?.id) {
    console.log(`[orgLinkPipeline] quick link — org already in DB (${existingOrg.id})`);
    return applyClientOrganizationLinkPipelineResult(clientId, {
      organization: existingOrg,
      orgPipeline: { phase: 'skipped', reason: 'already_in_db', engine: 'gemini' },
    });
  }

  if (backgroundEnrichment) {
    if (!companyName) {
      const err = new Error('Company name is required');
      err.status = 400;
      throw err;
    }

    let stubOrg;
    try {
      stubOrg = await Organization.create({
        name: companyName,
        dataConfidence: 'לביקורת',
        comments: '',
        history: [],
      });
    } catch (err) {
      stubOrg = await Organization.findOne({ where: { name: { [Op.iLike]: companyName } } });
      if (!stubOrg) {
        console.error('[orgLinkPipeline] stub org create failed', err?.message || err);
        throw err;
      }
    }

    await clientOrganizationSyncService.linkClientToOrganization(clientId, stubOrg.id, { fullSync: true });
    scheduleOrganizationEnrichment(stubOrg);
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationId = String(stubOrg.id);
    json.orgPipeline = {
      phase: 'enriching',
      background: true,
      engine: 'gemini',
      companyName,
      deferred: true,
    };
    console.log('[orgLinkPipeline] HTTP response — stub org linked, enrichment continues in background', {
      clientId,
      organizationId: stubOrg.id,
      companyName,
    });
    return json;
  }

  const pipelineResult = await organizationClientLinkPipelineService.processNewCompanyForClientLink({
    ...payload,
    clientId,
    name: payload.name || client.name,
    backgroundEnrichment: false,
  });

  return applyClientOrganizationLinkPipelineResult(clientId, pipelineResult);
};

const getByIdWithLinks = async (id, opts = {}) => {
  const includeLinks = opts.includeLinks !== false;
  if (!includeLinks) {
    return getByIdForApi(id, { skipCache: opts.skipCache });
  }
  const [client, links] = await Promise.all([
    Client.findByPk(id, { attributes: { exclude: CLIENT_API_EXCLUDE } }),
    includeLinks
      ? ClientOrganizationLink.findAll({
        where: { clientId: id },
        include: [
          {
            model: Organization,
            as: 'organization',
            required: false,
            attributes: ORG_LINK_SUMMARY_ATTRIBUTES,
          },
          { model: OrganizationTmp, as: 'organizationTmp', required: false, attributes: ['id', 'name', 'createdAt'] },
        ],
        order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
      })
      : Promise.resolve([]),
  ]);
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const json = clientToApiJson(client);
  if (includeLinks) {
    json.organizationLinks = links.map((l) => (l.toJSON ? l.toJSON() : l));
  }
  return json;
};

const likePattern = (q) => `%${String(q || '').replace(/[%_\\]/g, '\\$&')}%`;

/** ClientOrganizationLink rows with Organization / OrganizationTmp included. */
const listLinkedOrganizationsForClient = async (clientId, opts = {}) => {
  await getById(clientId);
  const paginate = Boolean(opts.paginate);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 50));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const q = String(opts.q || '').trim();
  const pipelineId = opts.pipelineId ? String(opts.pipelineId).trim() : '';
  const pipelineStage = opts.pipelineStage ? String(opts.pipelineStage).trim() : '';

  const where = { clientId };
  if (pipelineId && pipelineId !== 'all') where.pipelineId = pipelineId;
  if (pipelineStage && pipelineStage !== 'all') where.pipelineStage = pipelineStage;
  if (q) {
    const pattern = likePattern(q);
    where[Op.or] = [
      { '$organization.name$': { [Op.iLike]: pattern } },
      { '$organization.nameEn$': { [Op.iLike]: pattern } },
      { '$organizationTmp.name$': { [Op.iLike]: pattern } },
    ];
  }

  const query = {
    where,
    include: [
      {
        model: Organization,
        as: 'organization',
        required: false,
        attributes: ORG_LINK_SUMMARY_ATTRIBUTES,
      },
      {
        model: OrganizationTmp,
        as: 'organizationTmp',
        required: false,
        attributes: ['id', 'name', 'createdAt'],
      },
    ],
    order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
    subQuery: false,
    distinct: true,
  };

  const mapRow = (row) => (row.toJSON ? row.toJSON() : row.get());

  if (paginate) {
    const { count, rows } = await ClientOrganizationLink.findAndCountAll({
      ...query,
      limit,
      offset,
    });
    const total = typeof count === 'number' ? count : rows.length;
    const items = rows.map(mapRow);
    return {
      items,
      total,
      offset,
      limit,
      returned: items.length,
      hasMore: offset + items.length < total,
    };
  }

  const rows = await ClientOrganizationLink.findAll(query);
  return rows.map(mapRow);
};

const assertCanAccessClientOrganizations = (actor, clientId) => {
  if (!actor) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (isPlatformAdmin(actor)) return;
  if (actor.clientId && String(actor.clientId) === String(clientId)) return;
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
};

const unlinkOrganizationFromClient = async (clientId, linkId, actor) => {
  assertCanAccessClientOrganizations(actor, clientId);
  const row = await ClientOrganizationLink.findOne({
    where: { id: linkId, clientId },
  });
  if (!row) {
    const err = new Error('Organization link not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return true;
};

const updateOrganizationLinkForClient = async (clientId, linkId, payload, actor) => {
  assertCanAccessClientOrganizations(actor, clientId);
  const row = await ClientOrganizationLink.findOne({
    where: { id: linkId, clientId },
  });
  if (!row) {
    const err = new Error('Organization link not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'pipelineId')) {
    const v = payload.pipelineId;
    patch.pipelineId = v != null && String(v).trim() !== '' ? String(v).trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'pipelineStage')) {
    const v = payload.pipelineStage;
    patch.pipelineStage = v != null && String(v).trim() !== '' ? String(v).trim() : null;
  }
  if (Object.keys(patch).length) {
    await row.update(patch);
  }
  return row.reload({
    include: [
      { model: Organization, as: 'organization', required: false, attributes: { exclude: ['embedding'] } },
      { model: OrganizationTmp, as: 'organizationTmp', required: false, attributes: { exclude: ['embedding'] } },
    ],
  });
};

const update = async (id, payload) => {
  const payloadKeys = Object.keys(payload || {}).filter((k) => payload[k] !== undefined);
  const eventsOnly = payloadKeys.length === 1 && payloadKeys[0] === 'events';
  const blobKeys = CLIENT_API_EXCLUDE.filter((k) => payloadKeys.includes(k));
  const client = eventsOnly
    ? await getByIdForJournal(id, { skipCache: true })
    : await getById(id, { include: blobKeys });
  if (!client) throw clientNotFound();
  const merged = buildClientUpdatePayload(client, payload);
  const allowed = new Set(Object.keys(Client.rawAttributes));
  const clean = {};
  for (const [k, v] of Object.entries(merged)) {
    if (!allowed.has(k) || k === 'id') continue;
    if (v === undefined) continue;
    clean[k] = v;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'logoUrl')) {
    const logo = coerceString(payload.logoUrl);
    clean.logoUrl = logo !== undefined ? logo || null : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'primaryColor')) {
    const pc = coerceString(payload.primaryColor);
    clean.primaryColor = pc !== undefined ? pc || null : null;
  }
  await client.update(clean);
  if (eventsOnly && Array.isArray(clean.events) && clean.events[0]?.id) {
    const { sequelize } = Client;
    await prependClientEventInRecentCache(sequelize, id, clean.events[0]).catch(() => {});
  }
  invalidateClientApiCache(id);
  return getByIdForApi(id);
};

const remove = async (id) => {
  const client = await getById(id);
  await client.destroy();
  invalidateClientApiCache(id);
};

/** Map Job.client (free-text company label) to Client.id for templates / tenancy. */
const findIdByJobClientLabel = async (label) => {
  const t = String(label || '').trim();
  if (!t) return null;
  const row = await Client.findOne({
    where: {
      [Op.or]: [
        { name: t },
        { displayName: t },
        { name: { [Op.iLike]: t } },
        { displayName: { [Op.iLike]: t } },
      ],
    },
    attributes: ['id'],
  });
  return row ? row.id : null;
};

const CLIENT_EVENT_PATCH_STATEMENT_MS = Math.max(
  5000,
  Number.parseInt(process.env.CLIENT_EVENT_PATCH_STATEMENT_MS || '20000', 10) || 20000,
);

const useRecentFirstEventPatch = () => process.env.CLIENT_EVENT_PATCH_RECENT_FIRST !== '0';

/** @type {Set<string>} */
const deferredFullEventPatchKeys = new Set();

const scheduleDeferredFullClientEventPatch = (clientId, eventId, runner) => {
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid || typeof runner !== 'function') return;
  const key = `${cid}:${eid}`;
  if (deferredFullEventPatchKeys.has(key)) return;
  deferredFullEventPatchKeys.add(key);
  setImmediate(async () => {
    try {
      await withClientJsonbHeavySlot(runner);
    } catch (err) {
      console.warn(
        '[clientService] deferred clients.events patch failed',
        key,
        String(err?.message || err).slice(0, 160),
      );
    } finally {
      deferredFullEventPatchKeys.delete(key);
    }
  });
};

/** One journal row from slim events_recent (fast). */
const getClientEventFromRecentDb = async (clientId, eventId) => {
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid) return null;
  const { sequelize } = Client;
  const rows = await sequelize.query(
    `SELECT t.elem AS event
     FROM clients c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events_recent, '[]'::jsonb))
       WITH ORDINALITY AS t(elem, ordinality)
     WHERE c.id = :clientId AND t.elem->>'id' = :eventId
     LIMIT 1`,
    {
      replacements: { clientId: cid, eventId: eid },
      type: QueryTypes.SELECT,
    },
  );
  if (!rows?.length) return null;
  return parseJsonbRow(rows[0].event);
};

/** One journal row — prefers events_recent, then full clients.events. */
const getClientEventFromDb = async (clientId, eventId) => {
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid) return null;
  const fromRecent = await getClientEventFromRecentDb(cid, eid);
  if (fromRecent) return fromRecent;
  const { sequelize } = Client;
  const rows = await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${JOURNAL_EVENTS_SLICE_STATEMENT_MS}`, {
      transaction: t,
    });
    return sequelize.query(
      `SELECT t.elem AS event
       FROM clients c
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb))
         WITH ORDINALITY AS t(elem, ordinality)
       WHERE c.id = :clientId AND t.elem->>'id' = :eventId
       LIMIT 1`,
      {
        replacements: { clientId: cid, eventId: eid },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
  });
  if (!rows?.length) return null;
  return parseJsonbRow(rows[0].event);
};

/**
 * API PUT: patch events_recent immediately; sync full clients.events in background.
 * applyMerge(prevEvent) runs in Node; only the merged event JSON is sent back to PG.
 */
const patchClientEventForApi = async (clientId, eventId, applyMerge) => {
  if (!useRecentFirstEventPatch()) {
    return patchClientEventInDb(clientId, eventId, applyMerge);
  }
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  const prev = await getClientEventFromRecentDb(cid, eid);
  if (!prev) {
    return patchClientEventInDb(clientId, eventId, applyMerge);
  }
  const merged = { ...applyMerge(prev), id: eid };
  const { sequelize } = Client;
  await upsertClientEventInRecentCache(sequelize, cid, merged);
  invalidateClientApiCache(cid);
  scheduleDeferredFullClientEventPatch(cid, eid, () =>
    patchClientEventInDb(cid, eid, applyMerge),
  );
  return merged;
};

/**
 * One transaction: lock row, read one event, jsonb_set (no full-array jsonb_agg).
 */
const patchClientEventInDb = async (clientId, eventId, applyMerge) => {
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid) {
    const err = new Error('Client id and event id are required');
    err.status = 400;
    throw err;
  }
  if (typeof applyMerge !== 'function') {
    const err = new Error('applyMerge is required');
    err.status = 500;
    throw err;
  }
  const { sequelize } = Client;
  return withClientJsonbHeavySlot(() => sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${CLIENT_EVENT_PATCH_STATEMENT_MS}`, {
      transaction: t,
    });
    await sequelize.query('SET LOCAL lock_timeout = 8000', { transaction: t });

    const found = await sequelize.query(
      `SELECT (t.ordinality - 1) AS idx, t.elem AS event
       FROM clients c
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb))
         WITH ORDINALITY AS t(elem, ordinality)
       WHERE c.id = :clientId AND t.elem->>'id' = :eventId
       LIMIT 1
       FOR UPDATE OF c`,
      {
        replacements: { clientId: cid, eventId: eid },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    if (!found?.length) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }

    const prevEvent = parseJsonbRow(found[0].event);
    const idx = Number(found[0].idx);
    if (!Number.isFinite(idx) || idx < 0) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }

    const merged = applyMerge(prevEvent);
    const eventJson = JSON.stringify({ ...merged, id: eid });

    const updated = await sequelize.query(
      `UPDATE clients SET
         events = jsonb_set(
           COALESCE(events, '[]'::jsonb),
           ARRAY[CAST(:idxPath AS TEXT)],
           :merged::jsonb,
           false
         ),
         "updatedAt" = NOW()
       WHERE id = :clientId
       RETURNING id`,
      {
        replacements: {
          clientId: cid,
          idxPath: String(idx),
          merged: eventJson,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    if (!updated?.length) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }
    invalidateClientApiCache(cid);
    const parsed = JSON.parse(eventJson);
    await upsertClientEventInRecentCache(sequelize, cid, parsed, { transaction: t }).catch(() => {});
    return parsed;
  }));
};

/** Prepend one event without loading the full clients.events JSONB array. */
const prependClientEventInDb = async (clientId, newEvent) => {
  const cid = String(clientId || '').trim();
  if (!cid || !newEvent || typeof newEvent !== 'object') {
    const err = new Error('Client id and event are required');
    err.status = 400;
    throw err;
  }
  const eventJson = JSON.stringify({ ...newEvent, id: String(newEvent.id || '') });
  const { sequelize } = Client;
  return withClientJsonbHeavySlot(() => sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${CLIENT_EVENT_PATCH_STATEMENT_MS}`, {
      transaction: t,
    });
    await sequelize.query(
      `UPDATE clients SET
         events = jsonb_insert(COALESCE(events, '[]'::jsonb), '{0}', CAST(:ev AS jsonb), true),
         "updatedAt" = NOW()
       WHERE id = :clientId`,
      {
        replacements: { clientId: cid, ev: eventJson },
        transaction: t,
      },
    );
    const parsed = JSON.parse(eventJson);
    await prependClientEventInRecentCache(sequelize, cid, parsed, { transaction: t }).catch(() => {});
    invalidateClientApiCache(cid);
    return parsed;
  }));
};

/** Journal comment/history PUT: events_recent first, full blob in background. */
const patchClientEventShallowForApi = async (clientId, eventId, patch) => {
  if (!useRecentFirstEventPatch()) {
    return patchClientEventShallowInDb(clientId, eventId, patch);
  }
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  const patchObj =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const prev = await getClientEventFromRecentDb(cid, eid);
  if (!prev) {
    return patchClientEventShallowInDb(clientId, eventId, patch);
  }
  const merged = { ...prev, ...patchObj, id: eid };
  const { sequelize } = Client;
  await upsertClientEventInRecentCache(sequelize, cid, merged);
  invalidateClientApiCache(cid);
  scheduleDeferredFullClientEventPatch(cid, eid, () =>
    patchClientEventShallowInDb(cid, eid, patchObj),
  );
  return merged;
};

/** One UPDATE: jsonb || patch at array index (journal comment / history only). */
const patchClientEventShallowInDb = async (clientId, eventId, patch) => {
  const cid = String(clientId || '').trim();
  const eid = String(eventId || '').trim();
  if (!cid || !eid) {
    const err = new Error('Client id and event id are required');
    err.status = 400;
    throw err;
  }
  const patchObj =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const patchJson = JSON.stringify(patchObj);
  const { sequelize } = Client;
  return withClientJsonbHeavySlot(() => sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${CLIENT_EVENT_PATCH_STATEMENT_MS}`, {
      transaction: t,
    });
    await sequelize.query('SET LOCAL lock_timeout = 8000', { transaction: t });

    const rows = await sequelize.query(
      `UPDATE clients AS c
       SET
         events = matched.new_events,
         "updatedAt" = NOW()
       FROM (
         SELECT
           c2.id AS client_id,
           jsonb_set(
             COALESCE(c2.events, '[]'::jsonb),
             ARRAY[(t.ordinality - 1)::text],
             t.elem || CAST(:patch AS jsonb) || jsonb_build_object('id', CAST(:eventId AS text)),
             false
           ) AS new_events,
           t.elem || CAST(:patch AS jsonb) || jsonb_build_object('id', CAST(:eventId AS text)) AS merged_event
         FROM clients c2
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c2.events, '[]'::jsonb))
           WITH ORDINALITY AS t(elem, ordinality)
         WHERE c2.id = :clientId
           AND t.elem->>'id' = :eventId
         LIMIT 1
       ) AS matched
       WHERE c.id = matched.client_id
       RETURNING matched.merged_event AS event`,
      {
        replacements: { clientId: cid, eventId: eid, patch: patchJson },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
    if (!rows?.length) {
      const err = new Error('Event not found');
      err.status = 404;
      throw err;
    }
    invalidateClientApiCache(cid);
    const parsed = parseJsonbRow(rows[0].event);
    await upsertClientEventInRecentCache(sequelize, cid, parsed, { transaction: t }).catch(() => {});
    return parsed;
  }));
};

/** @deprecated use patchClientEventInDb */
const replaceClientEventInDb = async (clientId, eventId, mergedEvent) =>
  patchClientEventInDb(clientId, eventId, () => mergedEvent);

module.exports = {
  list,
  listClientIdsWithJournalEvents,
  getById,
  getByIdForJournal,
  countOpenJournalEvents,
  resolveJournalListEventsCap,
  CLIENT_API_EXCLUDE,
  getByIdForApi,
  invalidateClientApiCache,
  getByIdWithLinks,
  clientToApiJson,
  create,
  update,
  remove,
  getClientEventFromDb,
  getClientEventFromRecentDb,
  patchClientEventForApi,
  patchClientEventInDb,
  patchClientEventShallowForApi,
  patchClientEventShallowInDb,
  prependClientEventInDb,
  replaceClientEventInDb,
  findIdByJobClientLabel,
  attachOrganizationAfterCreate,
  linkOrganizationForClient,
  listLinkedOrganizationsForClient,
  unlinkOrganizationFromClient,
  updateOrganizationLinkForClient,
  assertCanAccessClientOrganizations,
  isPlatformAdmin,
  isClientManager,
  isClientTenantStaff,
};

