/** Slim journal head in clients.events_recent — list/search only, not full event blobs. */

const { QueryTypes } = require('sequelize');

const CLIENT_EVENTS_RECENT_MAX = Math.max(
  80,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_MAX || '360', 10) || 360,
);

/** ~600 chars description + metadata + updates → typical row ~0.5–1.5 KB JSON (not MB blobs). */
const MAX_RECENT_TITLE_CHARS = Math.max(
  80,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_TITLE_CHARS || '320', 10) || 320,
);
const MAX_RECENT_DESCRIPTION_CHARS = Math.max(
  0,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_DESCRIPTION_CHARS || '600', 10) || 600,
);
const MAX_RECENT_UPDATES = Math.max(
  1,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_UPDATES || '5', 10) || 5,
);
const MAX_RECENT_UPDATE_COMMENT_CHARS = Math.max(
  0,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_UPDATE_COMMENT_CHARS || '160', 10) || 160,
);
const MAX_RECENT_META_STRING_CHARS = Math.max(
  40,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_META_STRING_CHARS || '200', 10) || 200,
);

const JOURNAL_RECENT_METADATA_KEYS = [
  'candidateId',
  'candidateName',
  'contactName',
  'jobTitle',
  'jobCompany',
];

const clip = (value, max) => {
  if (value == null) return undefined;
  const s = String(value);
  if (!max) return s || undefined;
  return s.length > max ? s.slice(0, max) : s;
};

const slimLinkedTo = (linked) => {
  if (!linked || typeof linked !== 'object') return null;
  const id = linked.id != null ? String(linked.id).trim() : '';
  const name = clip(linked.name, MAX_RECENT_META_STRING_CHARS);
  const type = linked.type != null ? String(linked.type).trim() : '';
  if (!id && !name && !type) return null;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(type ? { type } : {}),
  };
};

const slimMetadata = (meta) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const out = {};
  for (const key of JOURNAL_RECENT_METADATA_KEYS) {
    if (meta[key] == null) continue;
    out[key] = clip(meta[key], MAX_RECENT_META_STRING_CHARS);
  }
  if (Array.isArray(meta.linkedContacts) && meta.linkedContacts.length) {
    out.linkedContacts = meta.linkedContacts.slice(0, 6).map((c) => {
      if (!c || typeof c !== 'object') return null;
      const id = c.id != null ? String(c.id).trim() : '';
      const name = clip(c.name, MAX_RECENT_META_STRING_CHARS);
      if (!id && !name) return null;
      return { ...(id ? { id } : {}), ...(name ? { name } : {}) };
    }).filter(Boolean);
  }
  return Object.keys(out).length ? out : undefined;
};

const slimUpdateRow = (u, index) => {
  if (!u || typeof u !== 'object') return null;
  const title = clip(u.title || u.summary, MAX_RECENT_TITLE_CHARS);
  if (!title) return null;
  const commentRaw = u.comment != null ? String(u.comment).trim() : '';
  const comment = clip(commentRaw, MAX_RECENT_UPDATE_COMMENT_CHARS);
  return {
    id: u.id ? String(u.id) : `u-${index}`,
    title,
    date: u.date || u.timestamp || '',
    creator: clip(u.creator || u.user, MAX_RECENT_META_STRING_CHARS) || '',
    ...(comment ? { comment } : {}),
  };
};

/**
 * Whitelist fields used by journal list (summary=1). Never copies history or unknown keys.
 */
const slimEventForRecentCache = (raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const updatesSource = Array.isArray(raw.updates) && raw.updates.length
    ? raw.updates
    : Array.isArray(raw.history)
      ? raw.history
      : [];
  const updates = updatesSource
    .slice(0, MAX_RECENT_UPDATES)
    .map(slimUpdateRow)
    .filter(Boolean);

  const row = {
    id: String(raw.id || ''),
    type: raw.type,
    title: clip(raw.title, MAX_RECENT_TITLE_CHARS) || '',
    date: raw.date,
    dueDate: raw.dueDate != null ? clip(raw.dueDate, 32) : undefined,
    status: raw.status != null ? clip(raw.status, 120) : undefined,
    coordinator: raw.coordinator != null ? clip(raw.coordinator, MAX_RECENT_META_STRING_CHARS) : undefined,
    creator: raw.creator != null ? clip(raw.creator, MAX_RECENT_META_STRING_CHARS) : undefined,
    contactId: raw.contactId != null ? String(raw.contactId).trim() : undefined,
    contactName: raw.contactName != null ? clip(raw.contactName, MAX_RECENT_META_STRING_CHARS) : undefined,
    isActive: raw.isActive !== false,
    process: raw.process != null ? clip(raw.process, 120) : undefined,
    processId: raw.processId != null ? String(raw.processId).trim() : undefined,
    stage: raw.stage != null ? clip(raw.stage, 120) : undefined,
    stageId: raw.stageId != null ? String(raw.stageId).trim() : undefined,
    organizationId: raw.organizationId != null ? String(raw.organizationId).trim() : undefined,
    organizationTmpId: raw.organizationTmpId != null ? String(raw.organizationTmpId).trim() : undefined,
    linkedTo: slimLinkedTo(raw.linkedTo),
    metadata: slimMetadata(raw.metadata),
    updates,
  };

  if (MAX_RECENT_DESCRIPTION_CHARS > 0) {
    const desc = clip(raw.description, MAX_RECENT_DESCRIPTION_CHARS);
    if (desc) row.description = desc;
  }

  return row;
};

const slimEventsForRecentCache = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  return list.slice(0, CLIENT_EVENTS_RECENT_MAX).map(slimEventForRecentCache);
};

const BACKFILL_STATEMENT_MS = Math.max(
  15000,
  Number.parseInt(process.env.CLIENT_EVENTS_RECENT_BACKFILL_MS || '90000', 10) || 90000,
);

/** @type {Map<string, Promise<{ id: string, count: number }>>} */
const backfillFlight = new Map();

/** One-off heavy read of clients.events — builds slim events_recent (not for hot polling). */
const backfillClientEventsRecentFromDb = async (sequelize, clientId) => {
  const id = String(clientId || '').trim();
  if (!id || !sequelize) throw new Error('clientId and sequelize required');
  const scanWindow = Math.max(120, CLIENT_EVENTS_RECENT_MAX);
  const rows = await sequelize.transaction(async (t) => {
    await sequelize.query(`SET LOCAL statement_timeout = ${BACKFILL_STATEMENT_MS}`, { transaction: t });
    return sequelize.query(
    `SELECT (
       SELECT COALESCE(jsonb_agg(sub.elem ORDER BY sub.sort_ts DESC NULLS LAST), '[]'::jsonb)
       FROM (
         SELECT t.elem,
           COALESCE(
             NULLIF(trim(both from t.elem->>'dueDate'), ''),
             NULLIF(trim(both from t.elem->>'date'), '')
           ) AS sort_ts
         FROM jsonb_array_elements(COALESCE(c.events, '[]'::jsonb))
           WITH ORDINALITY AS t(elem, ordinality)
         WHERE t.ordinality <= :scanWindow
         ORDER BY sort_ts DESC NULLS LAST
         LIMIT :cap
       ) sub
     ) AS events
     FROM clients c
     WHERE c.id = :id
     LIMIT 1`,
      {
        replacements: { id, scanWindow, cap: CLIENT_EVENTS_RECENT_MAX },
        type: QueryTypes.SELECT,
        transaction: t,
      },
    );
  });
  const raw = rows[0]?.events;
  const list = Array.isArray(raw) ? raw : [];
  const recent = slimEventsForRecentCache(list);
  await sequelize.query(
    `UPDATE clients SET events_recent = CAST(:recent AS jsonb), events_recent_at = NOW() WHERE id = :id`,
    { replacements: { id, recent: JSON.stringify(recent) } },
  );
  return { id, count: recent.length };
};

/** Single-flight backfill per client (sync on first journal load, or async retry). */
const ensureClientEventsRecentBackfill = async (sequelize, clientId) => {
  const id = String(clientId || '').trim();
  if (!id || !sequelize) return { id, count: 0 };
  const existing = backfillFlight.get(id);
  if (existing) return existing;
  const flight = backfillClientEventsRecentFromDb(sequelize, id).finally(() => {
    if (backfillFlight.get(id) === flight) backfillFlight.delete(id);
  });
  backfillFlight.set(id, flight);
  return flight;
};

const scheduleBackfillClientEventsRecent = (sequelize, clientId) => {
  setImmediate(() => {
    ensureClientEventsRecentBackfill(sequelize, clientId).catch((err) => {
      console.warn(
        '[events_recent] backfill failed',
        String(clientId || ''),
        String(err?.message || err).slice(0, 120),
      );
    });
  });
};

const schedulePersistEventsRecentCache = (sequelize, clientId, eventsArray) => {
  const id = String(clientId || '').trim();
  if (!id || !sequelize) return;
  const recent = slimEventsForRecentCache(eventsArray);
  const recentJson = JSON.stringify(recent);
  setImmediate(() => {
    sequelize
      .query(
        `UPDATE clients
         SET events_recent = CAST(:recent AS jsonb), events_recent_at = NOW()
         WHERE id = :id`,
        { replacements: { id, recent: recentJson } },
      )
      .catch(() => {});
  });
};

/** Replace one event in events_recent (no-op if cache empty). */
const upsertClientEventInRecentCache = async (sequelize, clientId, mergedEvent, { transaction } = {}) => {
  const cid = String(clientId || '').trim();
  const eid = String(mergedEvent?.id || '').trim();
  if (!cid || !eid || !sequelize) return;
  const slimJson = JSON.stringify(slimEventForRecentCache({ ...mergedEvent, id: eid }));
  await sequelize.query(
    `UPDATE clients c SET
       events_recent = CASE
         WHEN jsonb_array_length(COALESCE(c.events_recent, '[]'::jsonb)) = 0
         THEN jsonb_build_array(CAST(:slim AS jsonb))
         ELSE (
           SELECT COALESCE(jsonb_agg(
             CASE WHEN t.elem->>'id' = :eventId THEN CAST(:slim AS jsonb) ELSE t.elem END
             ORDER BY t.ordinality
           ), '[]'::jsonb)
           FROM jsonb_array_elements(COALESCE(c.events_recent, '[]'::jsonb))
             WITH ORDINALITY AS t(elem, ordinality)
         )
       END,
       events_recent_at = NOW()
     WHERE c.id = :clientId`,
    {
      replacements: { clientId: cid, eventId: eid, slim: slimJson },
      transaction,
    },
  );
};

/** Prepend slim event to events_recent (create / new head). */
const prependClientEventInRecentCache = async (sequelize, clientId, mergedEvent, { transaction } = {}) => {
  const cid = String(clientId || '').trim();
  const eid = String(mergedEvent?.id || '').trim();
  if (!cid || !eid || !sequelize) return;
  const slimJson = JSON.stringify(slimEventForRecentCache({ ...mergedEvent, id: eid }));
  await sequelize.query(
    `UPDATE clients c SET
       events_recent = (
         SELECT COALESCE(jsonb_agg(p.elem ORDER BY p.ord), '[]'::jsonb)
         FROM (
           SELECT 0 AS ord, CAST(:slim AS jsonb) AS elem
           UNION ALL
           SELECT t.ordinality AS ord, t.elem
           FROM jsonb_array_elements(COALESCE(c.events_recent, '[]'::jsonb))
             WITH ORDINALITY AS t(elem, ordinality)
           WHERE t.elem->>'id' IS DISTINCT FROM :eventId
             AND t.ordinality < :maxRecent
         ) p
       ),
       events_recent_at = NOW()
     WHERE c.id = :clientId`,
    {
      replacements: {
        clientId: cid,
        eventId: eid,
        slim: slimJson,
        maxRecent: CLIENT_EVENTS_RECENT_MAX,
      },
      transaction,
    },
  );
};

module.exports = {
  CLIENT_EVENTS_RECENT_MAX,
  slimEventForRecentCache,
  slimEventsForRecentCache,
  backfillClientEventsRecentFromDb,
  ensureClientEventsRecentBackfill,
  scheduleBackfillClientEventsRecent,
  schedulePersistEventsRecentCache,
  upsertClientEventInRecentCache,
  prependClientEventInRecentCache,
};
