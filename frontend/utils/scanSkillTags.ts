/** Editable tag row for Sonar / candidate job-matching scan (not persisted until profile save). */

export type ScanSkillTagMode = 'normal' | 'mandatory' | 'negative';

export type ScanSkillTag = {
  id: string;
  name: string;
  key?: string;
  tagType?: string;
  mode: ScanSkillTagMode;
  years_experience?: number | null;
  lookback_years?: number | null;
};

export function cycleScanTagMode(mode: ScanSkillTagMode): ScanSkillTagMode {
  if (mode === 'normal') return 'mandatory';
  if (mode === 'mandatory') return 'negative';
  return 'normal';
}

function normalizeMode(raw: unknown): ScanSkillTagMode {
  const s = String(raw || '').toLowerCase();
  if (s === 'mandatory' || s === 'required') return 'mandatory';
  if (s === 'negative' || s === 'exclusion') return 'negative';
  return 'normal';
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function jobSkillsToScanTags(skills: unknown[]): ScanSkillTag[] {
  const list = Array.isArray(skills) ? skills : [];
  return list
    .map((raw, i) => {
      const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const name = String(s.name || s.key || s.tagKey || '').trim();
      if (!name) return null;
      const key = String(s.key || s.tagKey || name).trim();
      return {
        id: String(s.id || key || `skill-${i}`),
        name,
        key,
        tagType: s.tagType != null ? String(s.tagType) : undefined,
        mode: normalizeMode(s.mode),
        years_experience: numOrNull(s.years_experience),
        lookback_years: numOrNull(s.lookback_years),
      } satisfies ScanSkillTag;
    })
    .filter(Boolean) as ScanSkillTag[];
}

export function candidateTagDetailsToScanTags(tagDetails: unknown[]): ScanSkillTag[] {
  const list = Array.isArray(tagDetails) ? tagDetails : [];
  return list
    .map((raw, i) => {
      const td = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const name = String(td.displayNameHe || td.displayNameEn || td.tagKey || '').trim();
      if (!name) return null;
      const key = String(td.tagKey || name).trim();
      return {
        id: String(td.id || key || `tag-${i}`),
        name,
        key,
        tagType: td.rawType != null ? String(td.rawType) : td.tagType != null ? String(td.tagType) : undefined,
        mode: normalizeMode(td.mode),
        years_experience: numOrNull(td.years_experience ?? td.yearsExperience),
        lookback_years: numOrNull(td.lookback_years ?? td.lookbackYears),
      } satisfies ScanSkillTag;
    })
    .filter(Boolean) as ScanSkillTag[];
}

export function scanTagsToJobSkills(tags: ScanSkillTag[]): Record<string, unknown>[] {
  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    key: t.key || t.name,
    tagKey: t.key || t.name,
    tagType: t.tagType,
    mode: t.mode,
    source: 'manual',
    years_experience: t.years_experience ?? null,
    lookback_years: t.lookback_years ?? null,
  }));
}

/** Minimal tagDetails rows for matching engine overrides. */
export function scanTagsToCandidateTagDetails(tags: ScanSkillTag[]): Record<string, unknown>[] {
  return tags.map((t) => ({
    id: t.id,
    tagKey: t.key || t.name,
    displayNameHe: t.name,
    displayNameEn: t.name,
    rawType: t.tagType,
    mode: t.mode,
    years_experience: t.years_experience ?? null,
    lookback_years: t.lookback_years ?? null,
  }));
}

export function isRoleScanTag(tag: ScanSkillTag): boolean {
  const ty = String(tag.tagType || '').toLowerCase();
  return ty === 'role' || ty === 'job_title' || ty === 'position';
}

function scanTagDedupeKey(tag: ScanSkillTag): string {
  return String(tag.key || tag.name || tag.id).trim().toLowerCase();
}

/** Map catalog row from TagSelectorModal into a scan chip (normal mode). */
export function tagOptionToScanSkillTag(tag: {
  id: string;
  nameHe?: string;
  nameEn?: string;
  tagKey?: string;
  rawType?: string;
  category?: string;
}): ScanSkillTag {
  const name = String(tag.nameHe || tag.nameEn || tag.tagKey || '').trim();
  const key = String(tag.tagKey || tag.nameHe || tag.nameEn || tag.id).trim();
  return {
    id: tag.id,
    name: name || key,
    key,
    tagType: tag.rawType || tag.category,
    mode: 'normal',
    years_experience: null,
    lookback_years: null,
  };
}

export function mergeScanTags(existing: ScanSkillTag[], added: ScanSkillTag[]): ScanSkillTag[] {
  const seen = new Set(existing.map(scanTagDedupeKey));
  const out = [...existing];
  for (const tag of added) {
    const k = scanTagDedupeKey(tag);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
  }
  return out;
}
