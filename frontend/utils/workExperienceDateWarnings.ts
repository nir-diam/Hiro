/** Coordinator-facing date checks (not shown on printable CV). */

export type WorkExperienceRow = {
  startDate?: string | null;
  endDate?: string | null;
  datesSuspicious?: boolean;
};

const PRESENT_RE = /^(present|היום|נוכחי|current|עכשיו)$/i;

export function isPresentEndDate(end?: string | null): boolean {
  const s = String(end ?? '').trim();
  return PRESENT_RE.test(s);
}

export function formatExperienceEndForDisplay(end?: string | null): string {
  const s = String(end ?? '').trim();
  if (!s) return 'כיום';
  if (PRESENT_RE.test(s)) return 'כיום';
  if (/^\d{4}-\d{2}/.test(s)) {
    try {
      return new Date(s.length === 7 ? `${s}-01` : s).toLocaleDateString('he-IL');
    } catch {
      return s;
    }
  }
  return s;
}

export function formatExperienceDateRange(start?: string | null, end?: string | null): string {
  const a = String(start ?? '').trim();
  const b = formatExperienceEndForDisplay(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || '';
}

function parseYearMonth(raw?: string | null): { y: number; m: number } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (PRESENT_RE.test(s)) {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }
  const ym = s.match(/^(\d{4})-(\d{2})/);
  if (ym) return { y: Number(ym[1]), m: Number(ym[2]) };
  const yOnly = s.match(/^(\d{4})$/);
  if (yOnly) return { y: Number(yOnly[1]), m: 1 };
  return null;
}

function toMonthIndex(p: { y: number; m: number } | null): number | null {
  if (!p || !Number.isFinite(p.y)) return null;
  return p.y * 12 + (p.m || 1) - 1;
}

function spanYears(start?: string | null, end?: string | null): number | null {
  const a = toMonthIndex(parseYearMonth(start));
  const b = toMonthIndex(parseYearMonth(end));
  if (a == null || b == null) return null;
  const months = Math.max(0, b - a + 1);
  return months / 12;
}

function rangesOverlap(
  s1?: string | null,
  e1?: string | null,
  s2?: string | null,
  e2?: string | null,
): boolean {
  const a0 = toMonthIndex(parseYearMonth(s1));
  const a1 = toMonthIndex(parseYearMonth(e1));
  const b0 = toMonthIndex(parseYearMonth(s2));
  const b1 = toMonthIndex(parseYearMonth(e2));
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return a0 <= b1 && b0 <= a1;
}

/** True when recruiters should verify dates for this row. */
export function workExperienceNeedsDateReview(
  row: WorkExperienceRow,
  allRows: WorkExperienceRow[] = [],
): boolean {
  if (row?.datesSuspicious === true) return true;
  const years = spanYears(row.startDate, row.endDate);
  if (years != null && years > 15) {
    const others = allRows.filter((r) => r !== row);
    if (others.some((other) => rangesOverlap(row.startDate, row.endDate, other.startDate, other.endDate))) {
      return true;
    }
  }
  return false;
}

export const COORDINATOR_DATE_REVIEW_TOOLTIP = 'בדוק תאריכים';
