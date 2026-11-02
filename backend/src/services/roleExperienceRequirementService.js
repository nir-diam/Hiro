/**
 * "ניסיון תעסוקתי" hard filter: job role tags carry years_experience / lookback_years;
 * a candidate passes when their workExperience in that role reaches the required years
 * inside the look-back window.
 */
const { parseYearMonth, toMonthIndex, PRESENT_RE } = require('../utils/workExperienceDateWarnings');

const LETTER_RE = /[\p{L}\p{N}]/u;

function normText(value) {
  return String(value ?? '')
    .replace(/[״”“]/g, '"')
    .replace(/[׳’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Whole-word containment, so "מנכ\"ל" does not match inside "סמנכ\"ל". */
function containsWord(haystack, needle) {
  if (!haystack || !needle) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? haystack[at - 1] : '';
    const after = haystack[at + needle.length] ?? '';
    if (!LETTER_RE.test(before) && !LETTER_RE.test(after)) return true;
    from = at + 1;
  }
  return false;
}

const GENDER_SLASH_RE = /\/(ית|ות|ים|ה|ת)(?=\s|$)/gu;

/** "מנהל/ת חשבונות" → masculine + feminine so "מנהלת חשבונות" still matches. */
function expandGenderSlash(text) {
  const s = String(text || '');
  GENDER_SLASH_RE.lastIndex = 0;
  if (!GENDER_SLASH_RE.test(s)) return [s];
  GENDER_SLASH_RE.lastIndex = 0;
  const stripped = s.replace(GENDER_SLASH_RE, '');
  GENDER_SLASH_RE.lastIndex = 0;
  const withSuffix = s.replace(GENDER_SLASH_RE, '$1');
  return [...new Set([s, stripped, withSuffix])];
}

/** "קניין/ית רכש" → "קניין רכש" / "קניינית רכש"; "CMO - סמנכ\"ל/ית שיווק" → also each half. */
function labelVariants(label) {
  const out = [];
  for (const form of expandGenderSlash(normText(label))) {
    const parts = form.split(/\s+[-–/]\s+/).map((p) => p.trim());
    out.push(form, ...parts);
  }
  return [...new Set(out)].filter((p) => p.length >= 2);
}

function positiveInt(value) {
  if (value == null || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Role tags on the job that have a years / look-back requirement set. */
function jobRoleExperienceRequirements(job) {
  const skills = Array.isArray(job?.skills) ? job.skills : [];
  const out = [];
  for (const s of skills) {
    if (!s || typeof s !== 'object') continue;
    const type = String(s.tagType || s.tag_type || s.raw_type || '').toLowerCase();
    if (type !== 'role') continue;
    const years = positiveInt(s.years_experience ?? s.yearsExperience);
    const lookbackYears = positiveInt(s.lookback_years ?? s.lookbackYears);
    if (years == null && lookbackYears == null) continue;
    const names = [s.name, s.key, s.displayNameHe, s.displayNameEn].filter(Boolean);
    out.push({
      tagId: s.tagId || s.id ? String(s.tagId || s.id) : null,
      name: String(s.name || s.key || ''),
      labels: new Set(names.map(normText)),
      variants: [...new Set(names.flatMap(labelVariants))],
      years,
      lookbackYears,
    });
  }
  return out;
}

function experienceRowMatchesRole(row, req) {
  const rowTagIds = [];
  if (Array.isArray(row.roleTagIds)) {
    for (const id of row.roleTagIds) {
      const s = String(id || '').trim();
      if (s) rowTagIds.push(s);
    }
  }
  const rowTagId = row.tagId ?? row.tag_id;
  if (rowTagId != null) rowTagIds.push(String(rowTagId));
  if (req.tagId && rowTagIds.some((id) => id === req.tagId)) return true;
  const roleTag = normText(row.roleTag ?? row.role_tag);
  if (roleTag && (req.labels.has(roleTag) || req.variants.includes(roleTag))) return true;
  const title = normText(row.title);
  return req.variants.some((v) => containsWord(title, v));
}

function parseMonth(raw, yearOnlyMonth = 1) {
  const s = String(raw ?? '').trim();
  const mmYyyy = s.match(/^(\d{1,2})[/.](\d{4})$/);
  if (mmYyyy) return Number(mmYyyy[2]) * 12 + Number(mmYyyy[1]) - 1;
  return toMonthIndex(parseYearMonth(s, yearOnlyMonth));
}

function yearMonthPartsToIndex(year, month, defaultMonth = 1) {
  const y = Number(year);
  if (!Number.isFinite(y) || y < 1950 || y > 2100) return null;
  const m = Number(month);
  const monthIdx = Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : defaultMonth - 1;
  return y * 12 + monthIdx;
}

/** Inclusive [start, end] month indexes, or null when the start date is unusable. */
function rowMonthRange(row, nowIdx) {
  let start = parseMonth(row.startDate ?? row.start_date, 1);
  if (start == null) start = yearMonthPartsToIndex(row.startYear ?? row.start_year, row.startMonth ?? row.start_month, 1);
  if (start == null) return null;
  const endRaw = String(row.endDate ?? row.end_date ?? '').trim();
  const isCurrent = row.isCurrent === true || row.is_current === true;
  let end = isCurrent || !endRaw || PRESENT_RE.test(endRaw) ? nowIdx : parseMonth(endRaw, 12);
  if (end == null && !isCurrent) {
    end = yearMonthPartsToIndex(row.endYear ?? row.end_year, row.endMonth ?? row.end_month, 12);
  }
  if (end == null || end < start) return null;
  return [start, Math.min(end, nowIdx)];
}

/** Months in the role, overlapping jobs counted once, clipped to the look-back window. */
function roleMonths(rows, req, nowIdx) {
  const windowStart = req.lookbackYears != null ? nowIdx - req.lookbackYears * 12 + 1 : -Infinity;
  const ranges = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !experienceRowMatchesRole(row, req)) continue;
    const range = rowMonthRange(row, nowIdx);
    if (!range) continue;
    const start = Math.max(range[0], windowStart);
    if (start > range[1]) continue;
    ranges.push([start, range[1]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur = null;
  for (const r of ranges) {
    if (cur && r[0] <= cur[1] + 1) {
      cur[1] = Math.max(cur[1], r[1]);
    } else {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [r[0], r[1]];
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

/**
 * Any one role requirement met → pass (a job's role tags are usually alternative titles).
 * Requirement with only a look-back → any experience in the role inside the window.
 * @returns {{ applicable: boolean, ok: boolean, details: Array<{ name: string, requiredYears: number|null, lookbackYears: number|null, years: number, ok: boolean }> }}
 */
function evaluateRoleExperience(candidate, job, now = new Date()) {
  const reqs = jobRoleExperienceRequirements(job);
  if (!reqs.length) return { applicable: false, ok: true, details: [] };
  const rows = Array.isArray(candidate?.workExperience) ? candidate.workExperience : [];
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const details = reqs.map((req) => {
    const months = roleMonths(rows, req, nowIdx);
    const ok = req.years != null ? months >= req.years * 12 : months > 0;
    return {
      name: req.name,
      requiredYears: req.years,
      lookbackYears: req.lookbackYears,
      years: Math.round((months / 12) * 10) / 10,
      ok,
    };
  });
  return { applicable: true, ok: details.some((d) => d.ok), details };
}

/** Latest month the candidate held this role, or null when they never did. */
function mostRecentRoleEndMonth(rows, req, nowIdx) {
  let last = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || !experienceRowMatchesRole(row, req)) continue;
    const range = rowMonthRange(row, nowIdx);
    if (!range) continue;
    if (last == null || range[1] > last) last = range[1];
  }
  return last;
}

function roundPts(n) {
  return Math.round(Math.max(0, Number(n) || 0));
}

/**
 * Soft penalties for role-tag ניסיון / אחורה (same units as ageGapPenalty: points per year).
 * When several role tags are set, they are alternatives — the lowest combined penalty wins.
 *
 * @returns {{
 *   roleExperiencePenalty: number,
 *   roleLookbackPenalty: number,
 *   reasons: Array<{ key: string, type: string, label: string, amount: number }>
 * }}
 */
function computeRoleExperiencePenalties(candidate, job, config = {}, now = new Date()) {
  const experienceRate = Math.max(0, Number(config.roleExperiencePenalty) || 0);
  const lookbackRate = Math.max(0, Number(config.roleLookbackPenalty) || 0);
  const empty = { roleExperiencePenalty: 0, roleLookbackPenalty: 0, reasons: [] };
  if (experienceRate <= 0 && lookbackRate <= 0) return empty;

  const reqs = jobRoleExperienceRequirements(job);
  if (!reqs.length) return empty;

  const rows = Array.isArray(candidate?.workExperience) ? candidate.workExperience : [];
  const nowIdx = now.getFullYear() * 12 + now.getMonth();

  const scored = reqs.map((req) => {
    const monthsInWindow = roleMonths(rows, req, nowIdx);
    const yearsInWindow = monthsInWindow / 12;
    let experiencePts = 0;
    if (req.years != null && experienceRate > 0) {
      experiencePts = roundPts(Math.max(0, req.years - yearsInWindow) * experienceRate);
    }

    // If they already lack the required years, look-back is the same gap — do not stack it.
    let lookbackPts = 0;
    if (experiencePts <= 0 && req.lookbackYears != null && lookbackRate > 0) {
      const lastEnd = mostRecentRoleEndMonth(rows, req, nowIdx);
      if (lastEnd == null) {
        lookbackPts = roundPts(req.lookbackYears * lookbackRate);
      } else {
        const yearsAgo = (nowIdx - lastEnd) / 12;
        lookbackPts = roundPts(Math.max(0, yearsAgo - req.lookbackYears) * lookbackRate);
      }
    }

    return { name: req.name, experiencePts, lookbackPts, total: experiencePts + lookbackPts };
  });

  const best = scored.reduce((a, b) => (a.total <= b.total ? a : b));
  const amount = best.experiencePts + best.lookbackPts;
  const reasons = amount > 0
    ? [{
        key: 'role_experience',
        type: 'mismatch',
        label: 'קנס ניסיון תעסוקתי',
        amount,
      }]
    : [];
  return {
    roleExperiencePenalty: best.experiencePts,
    roleLookbackPenalty: best.lookbackPts,
    reasons,
  };
}

module.exports = {
  evaluateRoleExperience,
  computeRoleExperiencePenalties,
  jobRoleExperienceRequirements,
  roleMonths,
};
