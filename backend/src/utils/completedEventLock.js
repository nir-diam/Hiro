/**
 * A journal event in status "הושלם" records something that already happened and feeds the
 * activity report, so it is read-only: only new updates/history rows may be added, and
 * it can still be closed / reopened (isActive). Everything else is rejected with 409.
 */
const COMPLETED_EVENT_STATUS = 'הושלם';
const COMPLETED_EVENT_LOCKED_MESSAGE = 'אירוע שהושלם נעול לעריכה — אפשר רק להוסיף עדכון';

const MUTABLE_KEYS_WHEN_COMPLETED = new Set(['id', 'updates', 'history', 'isActive', 'updatedAt']);

const isCompletedEvent = (event) =>
  String(event?.status ?? '').trim() === COMPLETED_EVENT_STATUS;

const completedEventLockedError = () => {
  const err = new Error(COMPLETED_EVENT_LOCKED_MESSAGE);
  err.status = 409;
  err.code = 'EVENT_COMPLETED_LOCKED';
  return err;
};

const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

const sameValue = (a, b) => {
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a !== 'object' && typeof b !== 'object') return String(a) === String(b);
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
};

const updateRowKey = (u) =>
  [u?.date ?? u?.timestamp, u?.title ?? u?.summary, u?.creator ?? u?.user]
    .map((x) => String(x ?? '').trim())
    .join('|');

/** Stored rows stay exactly as they were; only rows not seen before are added (newest first). */
const appendOnlyRows = (prevRows, incomingRows) => {
  const prev = Array.isArray(prevRows) ? prevRows : [];
  if (!Array.isArray(incomingRows)) return prev;
  const known = new Set(prev.map(updateRowKey));
  const added = incomingRows.filter((row) => row && typeof row === 'object' && !known.has(updateRowKey(row)));
  return [...added, ...prev];
};

/**
 * @param {object} prevEvent stored event
 * @param {object} patch fields about to be merged onto it
 * @returns {object} patch to apply (updates/history made append-only when completed)
 * @throws 409 when a completed event's locked field would change
 */
const applyCompletedEventLock = (prevEvent, patch) => {
  if (!isCompletedEvent(prevEvent) || !patch || typeof patch !== 'object') return patch;
  for (const [key, value] of Object.entries(patch)) {
    if (MUTABLE_KEYS_WHEN_COMPLETED.has(key)) continue;
    if (!sameValue(prevEvent[key], value)) throw completedEventLockedError();
  }
  const out = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'updates')) {
    out.updates = appendOnlyRows(prevEvent.updates, patch.updates);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'history')) {
    out.history = appendOnlyRows(prevEvent.history, patch.history);
  }
  return out;
};

module.exports = {
  COMPLETED_EVENT_STATUS,
  COMPLETED_EVENT_LOCKED_MESSAGE,
  isCompletedEvent,
  completedEventLockedError,
  applyCompletedEventLock,
};
