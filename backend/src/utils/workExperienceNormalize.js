const { roleTagsFromExperience } = require('../services/cvParseQuality');
const {
  PRESENT_END_RE,
  sanitizeExperienceDate,
} = require('./experienceDateSanitize');

const MILITARY_EXPERIENCE_RE =
  /צה["']?ל|צבא|שירות\s+צבאי|שירות\s+בצבא|\bidf\b|חיל\s+ה|חייל|מג"ב|גולני|נח"ל|עוצב|שב"?ס|מודיעין|שריון|חיל\s+האוויר|חיל\s+הים|חיל\s+התותחנים|חיל\s+החימוש|חיל\s+הלוגיסטיקה|חיל\s+הקשר|חיל\s+המשלוחים|חיל\s+הרפואה|חיל\s+החינוך|חיל\s+המשטרה|משטרה\s+צבאית/i;

const CV_PARSE_FAILED_STATUS = 'נכשל בעיבוד';
const CV_PARSE_FAILED_EXPLANATION = 'עיבוד קו"ח נכשל. שורות הניסיון לא נשמרו מטקסט מפורק.';
const CV_EMPTY_TEMPLATE_EXPLANATION =
  'קובץ קורות החיים כמעט ריק (פרטי קשר בלבד / "אין מידע"). יש להעלות קו"ח מעודכן עם ניסיון והשכלה.';

/** AllJobs / portal stubs that list section headers with "אין מידע" and no real experience. */
const looksLikeEmptyCvTemplate = (resumeText) => {
  const s = String(resumeText || '').trim();
  if (!s) return false;
  const noInfoHits = (s.match(/אין\s*מידע/g) || []).length;
  if (noInfoHits < 2) return false;
  const hasRealJobSignal =
    /\b(20\d{2}|19\d{2})\b/.test(s) ||
    /מנהל|רכז|נציג|מהנדס|חשב|מפתח|עובד|אחראי|מוכר|נהג|טכנאי/i.test(s);
  return !hasRealJobSignal || noInfoHits >= 3;
};

const intInRange = (raw, min, max) => {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < min || i > max) return null;
  return i;
};

/** YYYY-MM when both parts exist; year-only "YYYY" when the month was not written. Never "2024-null". */
const yearMonthToYm = (year, month) => {
  const y = intInRange(year, 1950, 2100);
  if (y == null) return null;
  const m = intInRange(month, 1, 12);
  if (m == null) return String(y);
  return `${y}-${String(m).padStart(2, '0')}`;
};

const workDateIsInTheFuture = (raw, now = new Date()) => {
  const s = String(raw ?? '').trim();
  if (!s || PRESENT_END_RE.test(s)) return false;
  const ym = s.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const idx = Number(ym[1]) * 12 + Number(ym[2]) - 1;
    return idx > now.getFullYear() * 12 + now.getMonth();
  }
  const yOnly = s.match(/^(\d{4})$/);
  if (yOnly) return Number(yOnly[1]) > now.getFullYear();
  return false;
};

/** Heuristic splitter placeholder. Not a real job. */
const isFabricatedExperienceRow = (row) => {
  const start = String(row?.startDate || '');
  const end = String(row?.endDate || '');
  return start === '2000-01' && (end === '2000-12' || end === '2000-01');
};

/**
 * AI returned no jobs for a real CV. Do not fill experience from split text.
 * @returns {object|null}
 */
const cvParseFailedUpdate = (aiWorkExperience, resumeText) => {
  const rows = normalizeWorkExperience(aiWorkExperience).filter((row) => !isFabricatedExperienceRow(row));
  if (rows.length) return null;
  if (String(resumeText || '').trim().length <= 30) return null;
  const emptyTemplate = looksLikeEmptyCvTemplate(resumeText);
  return {
    status: CV_PARSE_FAILED_STATUS,
    statusExplanation: emptyTemplate ? CV_EMPTY_TEMPLATE_EXPLANATION : CV_PARSE_FAILED_EXPLANATION,
    workExperience: [],
  };
};

const normalizeExperienceEndDate = (raw) =>
  sanitizeExperienceDate(raw, { allowPresent: true }).value;

const normalizeExperienceStartDate = (raw) =>
  sanitizeExperienceDate(raw, { allowPresent: false }).value;

const normalizeExperienceDescription = (raw) => {
  const s = String(raw ?? '').trim();
  return s || null;
};

/** v7: military block only when isMilitaryService === true; explicit false → civilian. */
const isMilitaryWorkEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.isMilitaryService === true) return true;
  if (entry.isMilitaryService === false) return false;
  if (entry.isMilitary === true || entry.type === 'military' || entry.category === 'military') {
    return true;
  }
  const blob = [entry.title, entry.company, entry.companyField, entry.description]
    .filter((v) => v != null && String(v).trim())
    .join(' ');
  return MILITARY_EXPERIENCE_RE.test(blob);
};

const normalizeWorkExperience = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x || typeof x !== 'object') return null;
      const title = String(x.title || '').trim();
      const company = String(x.company || '').trim();
      const description = normalizeExperienceDescription(x.description);
      if (!title && !company && !description) return null;
      const fromPartsStart = yearMonthToYm(x.startYear, x.startMonth);
      let isCurrent = x.isCurrent === true || x.is_current === true;
      const fromPartsEnd = isCurrent ? 'Present' : yearMonthToYm(x.endYear, x.endMonth);
      const startParsed = fromPartsStart
        ? { value: fromPartsStart, suspicious: false }
        : sanitizeExperienceDate(x.startDate || x.from || x.start, { allowPresent: false });
      const endParsed = fromPartsEnd
        ? { value: fromPartsEnd, suspicious: false }
        : sanitizeExperienceDate(x.endDate || x.to || x.end, { allowPresent: true });
      const startDate = startParsed.value;
      let endDate = endParsed.value;
      if (workDateIsInTheFuture(endDate)) isCurrent = true;
      if (isCurrent) endDate = 'Present';
      const startYear = intInRange(x.startYear, 1950, 2100);
      const startMonth = intInRange(x.startMonth, 1, 12);
      const endYear = isCurrent ? null : intInRange(x.endYear, 1950, 2100);
      const endMonth = isCurrent ? null : intInRange(x.endMonth, 1, 12);
      const datesSuspicious =
        x.datesSuspicious === true || startParsed.suspicious || endParsed.suspicious;
      const roleTag = String(x.roleTag || x.role_tag || '').trim() || null;
      const tagId = x.tagId || x.tag_id || null;
      const organizationId = x.organizationId || x.organization_id || null;
      const roleTagIdsRaw = Array.isArray(x.roleTagIds)
        ? x.roleTagIds
        : Array.isArray(x.role_tag_ids)
          ? x.role_tag_ids
          : [];
      const roleTagIds = [...new Set(roleTagIdsRaw.map((id) => String(id || '').trim()).filter(Boolean))].slice(
        0,
        2,
      );
      const military = isMilitaryWorkEntry(x);
      const base = {
        id: x.id || idx + 1,
        title: title || 'ניסיון תעסוקתי',
        company,
        companyField: String(x.companyField || x.industry || '').trim(),
        ...(startYear != null ? { startYear } : {}),
        ...(startMonth != null ? { startMonth } : {}),
        ...(endYear != null ? { endYear } : {}),
        ...(endMonth != null ? { endMonth } : {}),
        ...(isCurrent || endDate === 'Present' ? { isCurrent: true } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(description ? { description } : {}),
        ...(roleTag ? { roleTag } : {}),
        ...(tagId ? { tagId: String(tagId) } : {}),
        ...(roleTagIds.length ? { roleTagIds } : {}),
        ...(organizationId ? { organizationId: String(organizationId) } : {}),
        ...(datesSuspicious ? { datesSuspicious: true } : {}),
        ...(x.isMilitaryService === true
          ? { isMilitaryService: true }
          : x.isMilitaryService === false
            ? { isMilitaryService: false }
            : {}),
      };
      return military
        ? { ...base, isMilitary: true, isMilitaryService: base.isMilitaryService !== false ? true : false }
        : base;
    })
    .filter(Boolean);
};

const isRoleTagEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  const rt = String(entry.raw_type || entry.rawType || '').toLowerCase();
  return rt === 'role';
};

const defaultRoleTagFromRow = (row) => {
  const title = String(row?.title || '').trim();
  if (!title || title === 'ניסיון תעסוקתי') return null;
  return title;
};

/** Ensure each work row has roleTag; merge missing role tags into the tag list for sync. */
const enrichWorkExperienceRoleTags = (workExperience = [], tagEntries = []) => {
  const exp = Array.isArray(workExperience) ? workExperience : [];
  const tags = Array.isArray(tagEntries) ? [...tagEntries] : [];
  const roleNameByKey = new Map();
  for (const t of tags) {
    if (!isRoleTagEntry(t)) continue;
    const name = String(t.name || t.displayNameHe || '').trim();
    if (name) roleNameByKey.set(name.toLowerCase(), name);
  }

  const enrichedExp = exp.map((row) => {
    const roleTag = String(row.roleTag || '').trim();
    const titleRole = defaultRoleTagFromRow(row);
    const nameForSync = roleTag || titleRole;
    if (nameForSync && !roleNameByKey.has(nameForSync.toLowerCase())) {
      roleNameByKey.set(nameForSync.toLowerCase(), nameForSync);
      tags.push({
        name: nameForSync,
        evidence: nameForSync,
        quote: nameForSync,
        raw_type: 'role',
        context: 'Core',
        tag_reason: 'תפקיד מקושר לניסיון תעסוקתי',
        is_current: !row.endDate || PRESENT_END_RE.test(String(row.endDate)),
        confidence_score: 0.75,
      });
    }
    return roleTag ? { ...row, roleTag } : row;
  });

  return { workExperience: enrichedExp, tagEntries: tags };
};

/**
 * Every job row must have roleTag + at least one role tag in the sync list (per row when titles differ).
 * @returns {{ workExperience: object[], tagEntries: object[] }}
 */
const ensureRoleTagCoverage = (existingTags = [], workExperience = []) => {
  let { workExperience: exp, tagEntries: tags } = enrichWorkExperienceRoleTags(
    workExperience,
    existingTags,
  );

  const roleKeysInTags = new Set(
    tags.filter(isRoleTagEntry).map((t) => String(t.name || '').trim().toLowerCase()).filter(Boolean),
  );

  for (const syn of roleTagsFromExperience(exp)) {
    const key = String(syn.name || '').trim().toLowerCase();
    if (!key || roleKeysInTags.has(key)) continue;
    roleKeysInTags.add(key);
    tags.push(syn);
  }

  return { workExperience: exp, tagEntries: tags };
};

const isCandidateRoleSystemTag = (row) => {
  const raw = String(row?.raw_type || row?.rawType || '').toLowerCase();
  return raw === 'role' || raw.includes('role');
};

const buildRoleCatalogFromSystemTags = (systemTagRows = []) => {
  const roles = [];
  for (const row of Array.isArray(systemTagRows) ? systemTagRows : []) {
    if (!isCandidateRoleSystemTag(row)) continue;
    const tag = row?.tag || row?.Tag || null;
    if (!tag?.id) continue;
    const labels = [tag.displayNameHe, tag.displayNameEn, tag.tagKey]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    if (!labels.length) continue;
    roles.push({
      tagId: String(tag.id),
      displayNameHe: String(tag.displayNameHe || labels[0]).trim(),
      labels,
    });
  }
  return roles;
};

const matchRoleCatalogLabel = (needles, roles) => {
  const normalizedNeedles = needles.map((n) => String(n || '').trim().toLowerCase()).filter(Boolean);
  if (!normalizedNeedles.length || !roles.length) return null;

  for (const needle of normalizedNeedles) {
    for (const role of roles) {
      for (const label of role.labels) {
        if (String(label).trim().toLowerCase() === needle) {
          return { tagId: role.tagId, roleTag: role.displayNameHe || label };
        }
      }
    }
  }

  let best = null;
  for (const needle of normalizedNeedles) {
    if (needle.length < 4) continue;
    for (const role of roles) {
      for (const label of role.labels) {
        const lk = String(label).trim().toLowerCase();
        if (lk.length < 4) continue;
        if (!lk.includes(needle) && !needle.includes(lk)) continue;
        const score = Math.min(lk.length, needle.length);
        if (!best || score > best.score) {
          best = { tagId: role.tagId, roleTag: role.displayNameHe || label, score };
        }
      }
    }
  }
  return best ? { tagId: best.tagId, roleTag: best.roleTag } : null;
};

const attachTagIdsToWorkExperience = (workExperience = [], systemTagRows = []) => {
  const rows = Array.isArray(workExperience) ? workExperience : [];
  const roles = buildRoleCatalogFromSystemTags(systemTagRows);
  if (!roles.length) {
    return rows.map((exp) => {
      if (!exp || typeof exp !== 'object') return exp;
      if (exp.roleTag == null && exp.tagId == null) return exp;
      const next = { ...exp };
      delete next.roleTag;
      delete next.tagId;
      return next;
    });
  }

  return rows.map((exp) => {
    if (!exp || typeof exp !== 'object') return exp;

    const explicitIds = Array.isArray(exp.roleTagIds)
      ? [...new Set(exp.roleTagIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 2)
      : [];
    if (explicitIds.length) {
      const primary = explicitIds[0];
      const byId = roles.find((r) => r.tagId === primary);
      return {
        ...exp,
        roleTagIds: explicitIds,
        tagId: primary,
        ...(byId ? { roleTag: byId.displayNameHe } : {}),
      };
    }

    const existingTagId = exp.tagId != null ? String(exp.tagId) : '';
    if (existingTagId) {
      const byId = roles.find((r) => r.tagId === existingTagId);
      if (byId) {
        return { ...exp, tagId: byId.tagId, roleTag: byId.displayNameHe };
      }
    }

    const needles = [exp.roleTag, exp.title].filter((v) => v != null && String(v).trim());
    const match = matchRoleCatalogLabel(needles, roles);
    if (!match) {
      const next = { ...exp };
      delete next.roleTag;
      delete next.tagId;
      return next;
    }
    return { ...exp, tagId: match.tagId, roleTag: match.roleTag };
  });
};

const workExperienceTagLinksChanged = (before = [], after = []) =>
  JSON.stringify(before) !== JSON.stringify(after);

const tagDetailsToRoleSystemTagRows = (tagDetails = []) =>
  (Array.isArray(tagDetails) ? tagDetails : [])
    .filter((d) => {
      const raw = String(d?.rawType || d?.raw_type || '').toLowerCase();
      return raw === 'role' || raw.includes('role');
    })
    .map((d) => ({
      raw_type: 'role',
      tag: {
        id: d.tagId ?? d.tag_id ?? d.tag?.id,
        displayNameHe: d.displayNameHe ?? d.display_name_he,
        displayNameEn: d.displayNameEn ?? d.display_name_en,
        tagKey: d.tagKey ?? d.tag_key,
      },
    }))
    .filter((row) => row.tag?.id);

module.exports = {
  CV_PARSE_FAILED_STATUS,
  normalizeWorkExperience,
  cvParseFailedUpdate,
  looksLikeEmptyCvTemplate,
  CV_EMPTY_TEMPLATE_EXPLANATION,
  isFabricatedExperienceRow,
  enrichWorkExperienceRoleTags,
  ensureRoleTagCoverage,
  attachTagIdsToWorkExperience,
  tagDetailsToRoleSystemTagRows,
  workExperienceTagLinksChanged,
  isMilitaryWorkEntry,
};
