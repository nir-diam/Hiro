export type ContactHistoryEntry = {
  id: string;
  timestamp: string;
  actor: string;
  actionLabel: string;
  description: string;
};

export const eventBelongsToContact = (
  event: Record<string, unknown>,
  contactId: string,
  contactName: string,
): boolean => {
  const linked =
    event.linkedTo && typeof event.linkedTo === 'object' && !Array.isArray(event.linkedTo)
      ? (event.linkedTo as Record<string, unknown>)
      : null;
  const eventContactId = String(event.contactId || linked?.id || '').trim();
  if (eventContactId && eventContactId === String(contactId)) return true;
  if (linked?.type === 'איש קשר' && String(linked.id || '') === String(contactId)) return true;
  const name = String(contactName || '').trim();
  const eventName = String(event.contactName || linked?.name || '').trim();
  if (name && eventName && (eventName === name || eventName.includes(name) || name.includes(eventName))) {
    return true;
  }
  return false;
};

const pushActivityRow = (
  entries: ContactHistoryEntry[],
  seen: Set<string>,
  base: { id: string; actionLabel: string; description: string; timestamp: string; actor: string },
) => {
  const key = `${base.description}|${base.timestamp}|${base.actor}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries.push(base);
};

const collectActivityRows = (
  rows: unknown[],
  event: Record<string, unknown>,
  entries: ContactHistoryEntry[],
  seen: Set<string>,
  prefix: string,
) => {
  const fallbackCreator = String(event.creator || event.coordinator || '').trim();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const activity = row as Record<string, unknown>;
    const title = String(activity.title || activity.summary || '').trim();
    if (!title) return;
    const timestamp = String(activity.date || activity.timestamp || event.date || event.createdAt || '').trim();
    const actor = String(activity.creator || activity.user || fallbackCreator || '').trim();
    pushActivityRow(entries, seen, {
      id: `${prefix}-${String(event.id || 'event')}-${index}`,
      actionLabel: 'עדכון',
      description: title,
      timestamp,
      actor,
    });
  });
};

export const flattenContactEventHistory = (event: Record<string, unknown>): ContactHistoryEntry[] => {
  const entries: ContactHistoryEntry[] = [];
  const seen = new Set<string>();
  const title = String(event.title || event.process || 'אירוע').trim();
  const timestamp = String(event.date || event.createdAt || event.dueDate || '').trim();
  const actor = String(event.creator || event.coordinator || '').trim();

  if (title) {
    pushActivityRow(entries, seen, {
      id: `event-create-${String(event.id || 'unknown')}`,
      actionLabel: 'יצירה',
      description: `אירוע: ${title}`,
      timestamp,
      actor,
    });
  }

  collectActivityRows(
    Array.isArray(event.updates) ? event.updates : [],
    event,
    entries,
    seen,
    'event-update',
  );
  collectActivityRows(
    Array.isArray(event.history) ? event.history : [],
    event,
    entries,
    seen,
    'event-history',
  );

  return entries;
};

const entryTimestampMs = (entry: ContactHistoryEntry): number => {
  const ms = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

export const buildContactHistoryEntries = (
  events: Record<string, unknown>[],
  contactId: string,
  contactName: string,
): ContactHistoryEntry[] => {
  const merged = events
    .filter((event) => eventBelongsToContact(event, contactId, contactName))
    .flatMap((event) => flattenContactEventHistory(event));

  merged.sort((a, b) => entryTimestampMs(b) - entryTimestampMs(a));
  return merged;
};
