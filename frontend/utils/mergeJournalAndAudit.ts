import type { AuditLogEntry } from '../services/auditLogsApi';

export type MergedJournalRow<T> = { kind: 'journal'; event: T; sortTime: number };
export type MergedAuditRow = { kind: 'audit'; entry: AuditLogEntry; sortTime: number };
export type MergedRow<T> = MergedJournalRow<T> | MergedAuditRow;

export function filterAuditByDateRange(
  items: AuditLogEntry[],
  fromDate: string,
  toDate: string,
): AuditLogEntry[] {
  if (!fromDate && !toDate) return items;
  return items.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    if (Number.isNaN(t)) return false;
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      if (t < from.getTime()) return false;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      if (t > to.getTime()) return false;
    }
    return true;
  });
}

/**
 * Pairs journal rows with audit log rows, sorted by time descending (newest first).
 */
export function mergeJournalAndAudit<T>(
  journalEvents: T[],
  getJournalTime: (e: T) => number,
  auditEntries: AuditLogEntry[],
): MergedRow<T>[] {
  const journalRows: MergedJournalRow<T>[] = journalEvents.map((event) => ({
    kind: 'journal' as const,
    event,
    sortTime: getJournalTime(event),
  }));
  const auditRows: MergedAuditRow[] = auditEntries.map((entry) => ({
    kind: 'audit' as const,
    entry,
    sortTime: new Date(entry.timestamp).getTime(),
  }));
  const all = [...journalRows, ...auditRows] as MergedRow<T>[];
  all.sort((a, b) => b.sortTime - a.sortTime);
  return all;
}

/**
 * Re-order merged rows by a string column. Tie-break: newer `sortTime` first.
 */
export function sortMergedByColumn<T>(
  rows: MergedRow<T>[],
  key: string,
  direction: 'asc' | 'desc',
  getValue: (row: MergedRow<T>, columnKey: string) => string,
): MergedRow<T>[] {
  const out = [...rows];
  out.sort((a, b) => {
    const av = getValue(a, key).toLowerCase();
    const bv = getValue(b, key).toLowerCase();
    if (av < bv) return direction === 'asc' ? -1 : 1;
    if (av > bv) return direction === 'asc' ? 1 : -1;
    return b.sortTime - a.sortTime;
  });
  return out;
}
