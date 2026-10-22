/** Mirror of frontend/utils/workExperienceDateWarnings.ts for server-side checks if needed. */

const PRESENT_RE = /^(present|היום|נוכחי|current|עכשיו)$/i;

function parseYearMonth(raw) {
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

function toMonthIndex(p) {
  if (!p || !Number.isFinite(p.y)) return null;
  return p.y * 12 + (p.m || 1) - 1;
}

function spanYears(start, end) {
  const a = toMonthIndex(parseYearMonth(start));
  const b = toMonthIndex(parseYearMonth(end));
  if (a == null || b == null) return null;
  return Math.max(0, b - a + 1) / 12;
}

function rangesOverlap(s1, e1, s2, e2) {
  const a0 = toMonthIndex(parseYearMonth(s1));
  const a1 = toMonthIndex(parseYearMonth(e1));
  const b0 = toMonthIndex(parseYearMonth(s2));
  const b1 = toMonthIndex(parseYearMonth(e2));
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return a0 <= b1 && b0 <= a1;
}

function workExperienceNeedsDateReview(row, allRows = []) {
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

module.exports = { workExperienceNeedsDateReview };
