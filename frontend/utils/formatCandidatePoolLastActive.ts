/**
 * Prefer readable Hebrew locale for API ISO dates; leave informal placeholders (e.g. "3 ימים") unchanged.
 */
export function formatCandidatePoolLastActive(value: unknown): string {
  if (value == null || value === '') return '—';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const ms = Date.parse(s);
    if (!Number.isNaN(ms)) {
      return new Date(ms).toLocaleString('he-IL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return s;
}

export function isIsoLikeTimestamp(value: unknown): boolean {
  if (value == null || value === '') return false;
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
}
