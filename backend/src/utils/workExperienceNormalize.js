const { roleTagsFromExperience } = require('../services/cvParseQuality');

const PRESENT_END_RE = /^(present|היום|נוכחי|current|עכשיו)$/i;

const MILITARY_EXPERIENCE_RE =
  /צה["']?ל|צבא|שירות\s+צבאי|שירות\s+בצבא|\bidf\b|חיל\s+ה|חייל|מג"ב|גולני|נח"ל|עוצב|שב"?ס|מודיעין|שריון|חיל\s+האוויר|חיל\s+הים|חיל\s+התותחנים|חיל\s+החימוש|חיל\s+הלוגיסטיקה|חיל\s+הקשר|חיל\s+המשלוחים|חיל\s+הרפואה|חיל\s+החינוך|חיל\s+המשטרה|משטרה\s+צבאית/i;

const normalizeExperienceEndDate = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (PRESENT_END_RE.test(s)) return 'Present';
  return s;
};

const normalizeExperienceStartDate = (raw) => {
  const s = String(raw ?? '').trim();
  return s || null;
};

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
      const startDate = normalizeExperienceStartDate(x.startDate || x.from || x.start);
      let endDate = normalizeExperienceEndDate(x.endDate || x.to || x.end);
      if (!endDate && x.isCurrent) endDate = 'Present';
      const roleTag = String(x.roleTag || x.role_tag || '').trim() || null;
      const tagId = x.tagId || x.tag_id || null;
      const military = isMilitaryWorkEntry(x);
      const base = {
        id: x.id || idx + 1,
        title: title || 'ניסיון תעסוקתי',
        company,
        companyField: String(x.companyField || x.industry || '').trim(),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(description ? { description } : {}),
        ...(roleTag ? { roleTag } : {}),
        ...(tagId ? { tagId: String(tagId) } : {}),
        ...(x.datesSuspicious === true ? { datesSuspicious: true } : {}),
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
    let roleTag = String(row.roleTag || '').trim();
    if (!roleTag) {
      const titleKey = String(row.title || '').trim().toLowerCase();
      if (titleKey && roleNameByKey.has(titleKey)) {
        roleTag = roleNameByKey.get(titleKey);
      }
    }
    if (!roleTag) {
      roleTag = defaultRoleTagFromRow(row) || '';
    }
    if (roleTag && !roleNameByKey.has(roleTag.toLowerCase())) {
      roleNameByKey.set(roleTag.toLowerCase(), roleTag);
      tags.push({
        name: roleTag,
        evidence: roleTag,
        quote: roleTag,
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

  exp = exp.map((row) => {
    if (String(row.roleTag || '').trim()) return row;
    const fromTitle = defaultRoleTagFromRow(row);
    return fromTitle ? { ...row, roleTag: fromTitle } : row;
  });

  return { workExperience: exp, tagEntries: tags };
};

const attachTagIdsToWorkExperience = (workExperience = [], systemTagRows = []) => {
  const rows = Array.isArray(workExperience) ? workExperience : [];
  const nameToId = new Map();
  for (const row of Array.isArray(systemTagRows) ? systemTagRows : []) {
    const tag = row?.tag || row?.Tag || null;
    if (!tag?.id) continue;
    for (const label of [tag.displayNameHe, tag.displayNameEn, tag.tagKey]) {
      const key = String(label || '').trim().toLowerCase();
      if (key) nameToId.set(key, String(tag.id));
    }
  }
  return rows.map((exp) => {
    const roleTag = String(exp.roleTag || '').trim();
    if (!roleTag) return exp;
    const tagId = nameToId.get(roleTag.toLowerCase());
    if (!tagId || exp.tagId === tagId) return exp;
    return { ...exp, tagId };
  });
};

const workExperienceTagLinksChanged = (before = [], after = []) =>
  JSON.stringify(before) !== JSON.stringify(after);

module.exports = {
  normalizeWorkExperience,
  enrichWorkExperienceRoleTags,
  ensureRoleTagCoverage,
  attachTagIdsToWorkExperience,
  workExperienceTagLinksChanged,
  isMilitaryWorkEntry,
};
