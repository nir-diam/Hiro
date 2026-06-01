import type { TagMatchCategory } from '../components/TagMatchPanel';
import {
  estimateStructuralWeightFromMeta,
  TAG_WEIGHT_STRUCTURAL_MIN,
  TAG_WEIGHT_STRUCTURAL_MAX,
} from './tagWeightDisplay';

/** Matches backend Job.skills JSON */
export interface ScreeningJobSkillRow {
  key?: string;
  name?: string;
  mode?: string;
  tagType?: string;
  calculated_weight?: number;
  calculatedWeight?: number;
  relevance_score?: number;
  raw_type?: string;
  rawType?: string;
  context?: string;
  is_current?: boolean;
  isCurrent?: boolean;
  is_in_summary?: boolean;
  isInSummary?: boolean;
}

/** Matches backend Job.languages JSON */
export interface ScreeningJobLanguageRow {
  language?: string;
  name?: string;
  level?: string;
  mandatory?: boolean;
}

/** Minimal job payload for 9-category tag comparison (Sonar + screening). */
export interface JobTagMatchInput {
  title?: string;
  role?: string;
  field?: string;
  skills?: ScreeningJobSkillRow[];
  languages?: ScreeningJobLanguageRow[];
  requirements?: unknown;
  filterPosition?: string;
  filterNotes?: string;
}

function uniqueNonEmptyStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function normJobSkillMode(mode: unknown): string {
  return String(mode ?? '')
    .trim()
    .toLowerCase();
}

function normJobTagType(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function jobSkillRowToChipRow(s: ScreeningJobSkillRow): Pick<JobTagChipRow, 'label' | 'mode'> | null {
  const mode = skillRowMode(s);
  const name = typeof s.name === 'string' ? s.name.trim() : '';
  const key = typeof s.key === 'string' ? s.key.trim() : '';
  const labelBase = name || key;
  if (!labelBase) return null;
  const suf = mode === 'negative' ? ' (שלילי)' : '';
  return { label: `${labelBase}${suf}`, mode };
}

type TagCategoryKey =
  | 'seniority'
  | 'certification'
  | 'education'
  | 'soft'
  | 'tool'
  | 'skill'
  | 'language'
  | 'industry'
  | 'role';

const TAG_MATCH_CATEGORY_ORDER: { key: TagCategoryKey; name: string }[] = [
  { key: 'role', name: 'תפקיד' },
  { key: 'seniority', name: 'בכירות' },
  { key: 'skill', name: 'מיומנות' },
  { key: 'tool', name: 'כלי / תוכנה' },
  { key: 'industry', name: 'תעשייה' },
  { key: 'education', name: 'השכלה (תואר)' },
  { key: 'language', name: 'שפה' },
  { key: 'soft', name: 'כישור רך' },
  { key: 'certification', name: 'הסמכה/תעודה' },
];

interface JobTagChipRow {
  label: string;
  mode: 'mandatory' | 'negative' | 'normal';
  structuralWeight: number;
  structuralWeightEstimated: boolean;
}

function syntheticStructuralWeight(categoryKey: TagCategoryKey): number {
  const rawByCat: Record<TagCategoryKey, string> = {
    role: 'role',
    seniority: 'seniority',
    certification: 'certification',
    education: 'degree',
    soft: 'soft_skill',
    tool: 'tool',
    skill: 'skill',
    language: 'language',
    industry: 'industry',
  };
  return estimateStructuralWeightFromMeta({ rawType: rawByCat[categoryKey], context: 'core' });
}

function jobSkillRowStructuralWeight(s: ScreeningJobSkillRow): { weight: number; estimated: boolean } {
  const o = s as Record<string, unknown>;
  const cw = o.calculated_weight ?? o.calculatedWeight;
  if (typeof cw === 'number' && Number.isFinite(cw)) return { weight: cw, estimated: false };
  const rs = o.relevance_score;
  if (typeof rs === 'number' && Number.isFinite(rs)) {
    const t = Math.min(10, Math.max(0, rs)) / 10;
    const w =
      TAG_WEIGHT_STRUCTURAL_MIN + t * (TAG_WEIGHT_STRUCTURAL_MAX - TAG_WEIGHT_STRUCTURAL_MIN);
    return { weight: w, estimated: true };
  }
  return {
    weight: estimateStructuralWeightFromMeta({
      rawType: s.tagType ?? o.raw_type ?? o.rawType,
      context: o.context ?? 'core',
      isCurrent: o.is_current ?? o.isCurrent,
      isInSummary: o.is_in_summary ?? o.isInSummary,
    }),
    estimated: true,
  };
}

function addJobChip(
  b: Record<TagCategoryKey, JobTagChipRow[]>,
  key: TagCategoryKey,
  partial: Pick<JobTagChipRow, 'label' | 'mode'> & Partial<Pick<JobTagChipRow, 'structuralWeight' | 'structuralWeightEstimated'>>,
  skillSource?: ScreeningJobSkillRow | null,
): void {
  let structuralWeight = partial.structuralWeight;
  let structuralWeightEstimated = partial.structuralWeightEstimated ?? false;
  if (structuralWeight == null && skillSource) {
    const r = jobSkillRowStructuralWeight(skillSource);
    structuralWeight = r.weight;
    structuralWeightEstimated = r.estimated;
  }
  if (structuralWeight == null) {
    structuralWeight = syntheticStructuralWeight(key);
    structuralWeightEstimated = true;
  }
  b[key].push({
    label: partial.label,
    mode: partial.mode,
    structuralWeight,
    structuralWeightEstimated,
  });
}

/** Candidate tag with scoring fields from API (candidate_tags). */
interface WeightedCandTag {
  label: string;
  weight: number;
  confidence?: number;
  finalScore?: number;
  /** True when calculatedWeight was missing and weight was derived locally. */
  weightEstimated?: boolean;
}

type TagMatchChipState = 'match' | 'gap' | 'neutral';

function stripCompareLabel(label: string): string {
  return label
    .replace(/\s*\(חובה\)\s*$/u, '')
    .replace(/\s*\(שלילי\)\s*$/u, '')
    .replace(/^תחום:\s*/i, '')
    .replace(/^תפקיד במשרה:\s*/i, '')
    .trim();
}

function chipsRelate(aRaw: string, bRaw: string): boolean {
  const normalizeChipCmp = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const c = normalizeChipCmp(aRaw);
  const hn = normalizeChipCmp(bRaw);
  if (!c || !hn) return false;
  if (c.includes(hn) || hn.includes(c)) return true;
  const ctokens = c.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1);
  const htokens = hn.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 1);
  for (const ct of ctokens) {
    for (const ht of htokens) {
      if (ct === ht || ct.includes(ht) || ht.includes(ct)) return true;
    }
  }
  return false;
}

/**
 * Stricter than chipsRelate: avoids Hebrew morphological false positives where a short stem is a
 * prefix of a longer token (e.g. job token "מנהל" vs candidate "מנהלת") — those must not turn the
 * candidate chip green unless there's a real token match.
 */
function tokenRelateForCandidateHighlight(ct: string, ht: string): boolean {
  if (ct === ht) return true;
  const shorter = ct.length <= ht.length ? ct : ht;
  const longer = ct.length <= ht.length ? ht : ct;
  if (shorter.length < 2) return false;
  if (!longer.includes(shorter)) return false;
  if (longer.startsWith(shorter)) {
    const gap = longer.length - shorter.length;
    if (gap === 1 && shorter.length <= 4) return false;
    return true;
  }
  if (longer.endsWith(shorter)) return shorter.length >= 5;
  return shorter.length >= 5;
}

function normalizeChipCmp(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function phraseTokensForHighlight(s: string): string[] {
  return normalizeChipCmp(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((x) => x.length > 1);
}

/** Latin / tech tokens: allow shorter single-token hits (CRM, AWS, …). */
function isAsciiTechToken(t: string): boolean {
  return /^[a-z0-9][a-z0-9.+_-]*$/i.test(t) && /[a-z]/i.test(t);
}

/** Single shared token is enough only if it is specific enough (not generic Hebrew stems like "ניהול"). */
function singleTokenOkForHighlight(t: string): boolean {
  if (t.length >= 7) return true;
  if (isAsciiTechToken(t) && t.length >= 3) return true;
  return false;
}

function chipsRelateForCandidateHighlight(aRaw: string, bRaw: string): boolean {
  const c = normalizeChipCmp(aRaw);
  const hn = normalizeChipCmp(bRaw);
  if (!c || !hn) return false;
  if (c === hn) return true;

  const shorter = c.length <= hn.length ? c : hn;
  const longer = c.length <= hn.length ? hn : c;
  if (shorter.length >= 8 && longer.includes(shorter)) return true;

  const ctokens = phraseTokensForHighlight(c);
  const htokens = phraseTokensForHighlight(hn);
  if (!ctokens.length || !htokens.length) return false;

  const matchedCand = new Set<string>();
  for (const ct of ctokens) {
    if (htokens.some((ht) => tokenRelateForCandidateHighlight(ct, ht))) matchedCand.add(ct);
  }
  if (matchedCand.size >= 2) return true;
  if (matchedCand.size === 1) {
    const only = matchedCand.values().next().value as string;
    return singleTokenOkForHighlight(only);
  }
  return false;
}

function poolMatchesLabel(pool: string[], jobLabel: string): boolean {
  const core = stripCompareLabel(jobLabel);
  if (!core) return false;
  return pool.some((chip) => chipsRelate(chip, core));
}

/** Strict version: consistent with the chip-highlight logic (uses chipsRelateForCandidateHighlight). */
function poolMatchesLabelStrict(pool: string[], jobLabel: string): boolean {
  const core = stripCompareLabel(jobLabel);
  if (!core) return false;
  return pool.some((chip) => chipsRelateForCandidateHighlight(chip, core));
}

function chipVisualState(label: string, mode: JobTagChipRow['mode'], candPool: string[]): TagMatchChipState {
  if (mode === 'normal') return 'neutral';
  const negative = mode === 'negative';
  const has = poolMatchesLabel(candPool, label);
  if (negative) return has ? 'gap' : 'match';
  return has ? 'match' : 'gap';
}

function skillRowMode(s: ScreeningJobSkillRow): JobTagChipRow['mode'] {
  const m = normJobSkillMode(s.mode);
  if (m === 'mandatory' || m === 'required') return 'mandatory';
  if (m === 'negative' || m === 'exclusion') return 'negative';
  return 'normal';
}

function jobSkillCategoryFromRow(s: ScreeningJobSkillRow): TagCategoryKey {
  const tt = normJobTagType(s.tagType ?? s.raw_type ?? s.rawType);
  if (tt === 'role') return 'role';
  if (tt === 'seniority') return 'seniority';
  if (tt === 'certification') return 'certification';
  if (tt === 'degree') return 'education';
  if (tt === 'soft' || tt === 'soft_skill') return 'soft';
  if (tt === 'tool') return 'tool';
  if (tt === 'skill') return 'skill';
  if (tt === 'language') return 'language';
  if (tt === 'industry') return 'industry';
  return 'skill';
}

function emptyJobChipBuckets(): Record<TagCategoryKey, JobTagChipRow[]> {
  return {
    seniority: [],
    certification: [],
    education: [],
    soft: [],
    tool: [],
    skill: [],
    language: [],
    industry: [],
    role: [],
  };
}

function dedupeJobChips(rows: JobTagChipRow[]): JobTagChipRow[] {
  const seen = new Set<string>();
  const out: JobTagChipRow[] = [];
  for (const r of rows) {
    const k = `${r.label}|${r.mode}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function collectJobTagChipsByCategory(job: JobTagMatchInput): Record<TagCategoryKey, JobTagChipRow[]> {
  const b = emptyJobChipBuckets();

  const arr = Array.isArray(job.skills) ? job.skills : [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as ScreeningJobSkillRow;
    const chip = jobSkillRowToChipRow(s);
    if (!chip) continue;
    addJobChip(b, jobSkillCategoryFromRow(s), chip, s);
  }

  const langArr = Array.isArray(job.languages) ? job.languages : [];
  for (const jl of langArr) {
    if (!jl || typeof jl !== 'object') continue;
    const nm = String(jl.language ?? jl.name ?? '').trim();
    if (!nm) continue;
    const mandatory = jl.mandatory === true || normJobSkillMode(jl.level) === 'mandatory';
    addJobChip(b, 'language', {
      label: nm,
      mode: mandatory ? 'mandatory' : 'normal',
    });
  }

  (Object.keys(b) as TagCategoryKey[]).forEach((k) => {
    b[k] = dedupeJobChips(b[k]);
  });
  return b;
}

function emptyCandPools(): Record<TagCategoryKey, string[]> {
  return {
    seniority: [],
    certification: [],
    education: [],
    soft: [],
    tool: [],
    skill: [],
    language: [],
    industry: [],
    role: [],
  };
}

function emptyWeightedBuckets(): Record<TagCategoryKey, WeightedCandTag[]> {
  return {
    seniority: [],
    certification: [],
    education: [],
    soft: [],
    tool: [],
    skill: [],
    language: [],
    industry: [],
    role: [],
  };
}

function extractCandTagWeighted(x: unknown): {
  label: string;
  weight?: number;
  confidence?: number;
  finalScore?: number;
} | null {
  if (typeof x === 'string') {
    const s = x.trim();
    return s ? { label: s } : null;
  }
  const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const tagNest = o.tag && typeof o.tag === 'object' ? (o.tag as Record<string, unknown>) : {};
  const name =
    (typeof o.name === 'string' && o.name.trim()) ||
    (typeof tagNest.displayNameHe === 'string' && tagNest.displayNameHe.trim()) ||
    (typeof tagNest.displayNameEn === 'string' && tagNest.displayNameEn.trim()) ||
    (typeof tagNest.tagKey === 'string' && tagNest.tagKey.trim()) ||
    '';
  if (!name) return null;
  const cw = o.calculated_weight ?? o.calculatedWeight;
  const weight = typeof cw === 'number' && Number.isFinite(cw) ? cw : undefined;
  const cf = o.confidence_score ?? o.confidenceScore;
  const confidence = typeof cf === 'number' && Number.isFinite(cf) ? cf : undefined;
  const fs = o.final_score ?? o.finalScore;
  const finalScore = typeof fs === 'number' && Number.isFinite(fs) ? fs : undefined;
  return { label: name, weight, confidence, finalScore };
}

function dedupeWeightedCandTags(rows: WeightedCandTag[]): WeightedCandTag[] {
  const map = new Map<string, WeightedCandTag>();
  for (const r of rows) {
    const k = stripCompareLabel(r.label)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    if (!k) continue;
    const prev = map.get(k);
    const preferNew =
      !prev ||
      r.weight > prev.weight ||
      (r.weight === prev.weight && prev.weightEstimated && !r.weightEstimated);
    if (preferNew) map.set(k, r);
  }
  return [...map.values()];
}

function collectCandidatePoolsDetailed(candidate: unknown): {
  labels: Record<TagCategoryKey, string[]>;
  weighted: Record<TagCategoryKey, WeightedCandTag[]>;
} {
  const p = emptyCandPools();
  const w = emptyWeightedBuckets();
  if (!candidate || typeof candidate !== 'object') {
    return { labels: p, weighted: w };
  }
  const c = candidate as Record<string, unknown>;

  if (typeof c.field === 'string' && c.field.trim())
    p.industry.push(`תחום: ${c.field.trim()}`);

  const detailArr = c.tagDetails;
  if (Array.isArray(detailArr) && detailArr.length > 0) {
    for (const td of detailArr) {
      const o = td && typeof td === 'object' ? (td as Record<string, unknown>) : {};
      const name = String(o.displayNameHe ?? o.displayNameEn ?? o.tagKey ?? '').trim();
      if (!name) continue;
      const tt = normCandTagType(o.rawType ?? o.raw_type);
      let bucket: TagCategoryKey = 'skill';
      if (tt === 'soft_skill' || tt === 'soft') bucket = 'soft';
      else if (tt === 'tool') bucket = 'tool';
      else if (tt === 'role') bucket = 'role';
      else if (tt === 'seniority') bucket = 'seniority';
      else if (tt === 'certification') bucket = 'certification';
      else if (tt === 'degree') bucket = 'education';
      else if (tt === 'skill') bucket = 'skill';
      else if (tt === 'language') bucket = 'language';
      else if (tt === 'industry') bucket = 'industry';
      else if (looksLikeToolBullet(name)) bucket = 'tool';
      else bucket = 'skill';

      p[bucket].push(name);
      const cw = o.calculatedWeight ?? o.calculated_weight;
      let weight = typeof cw === 'number' && Number.isFinite(cw) ? cw : undefined;
      let weightEstimated = false;
      if (weight == null) {
        weight = estimateStructuralWeightFromMeta({
          rawType: o.rawType ?? o.raw_type,
          context: o.context,
          isCurrent: o.isCurrent ?? o.is_current,
          isInSummary: o.isInSummary ?? o.is_in_summary,
        });
        weightEstimated = true;
      }
      const cf = o.confidenceScore ?? o.confidence_score;
      const confidence = typeof cf === 'number' && Number.isFinite(cf) ? cf : undefined;
      const fs = o.finalScore ?? o.final_score;
      const finalScore = typeof fs === 'number' && Number.isFinite(fs) ? fs : undefined;
      const entry: WeightedCandTag = { label: name, weight, weightEstimated };
      if (confidence != null) entry.confidence = confidence;
      if (finalScore != null) entry.finalScore = finalScore;
      w[bucket].push(entry);
    }
  } else {
    const tagArr = c.tags;
    if (Array.isArray(tagArr)) {
      for (const x of tagArr) {
        const meta = extractCandTagWeighted(x);
        if (!meta) continue;
        const name = meta.label;
        const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
        const tt = normCandTagType(o.raw_type ?? o.rawType ?? o.tagType ?? o.type);
        let bucket: TagCategoryKey = 'skill';
        if (tt === 'soft_skill' || tt === 'soft') bucket = 'soft';
        else if (tt === 'tool') bucket = 'tool';
        else if (tt === 'role') bucket = 'role';
        else if (tt === 'seniority') bucket = 'seniority';
        else if (tt === 'certification') bucket = 'certification';
        else if (tt === 'degree') bucket = 'education';
        else if (tt === 'skill') bucket = 'skill';
        else if (tt === 'language') bucket = 'language';
        else if (tt === 'industry') bucket = 'industry';
        else if (looksLikeToolBullet(name)) bucket = 'tool';
        else bucket = 'skill';

        p[bucket].push(name);
        if (meta.weight != null && Number.isFinite(meta.weight)) {
          const entry: WeightedCandTag = { label: name, weight: meta.weight, weightEstimated: false };
          if (meta.confidence != null) entry.confidence = meta.confidence;
          if (meta.finalScore != null) entry.finalScore = meta.finalScore;
          w[bucket].push(entry);
        } else if (Object.keys(o).length > 0) {
          const est = estimateStructuralWeightFromMeta({
            rawType: o.raw_type ?? o.rawType,
            context: o.context,
            isCurrent: o.is_current ?? o.isCurrent,
            isInSummary: o.is_in_summary ?? o.isInSummary,
          });
          const entry: WeightedCandTag = {
            label: name,
            weight: est,
            weightEstimated: true,
          };
          if (meta.confidence != null) entry.confidence = meta.confidence;
          if (meta.finalScore != null) entry.finalScore = meta.finalScore;
          w[bucket].push(entry);
        }
      }
    }
  }

  const skillObj = c.skills;
  if (skillObj && typeof skillObj === 'object' && !(Array.isArray(detailArr) && detailArr.length > 0)) {
    const so = skillObj as Record<string, unknown>;
    const softArr = so.soft;
    if (Array.isArray(softArr)) {
      for (const s of softArr) {
        const lab = skillCellToLabel(s);
        if (lab) p.soft.push(lab);
      }
    }
    for (const bucketKey of ['technical', 'hard', 'other'] as const) {
      const arr = so[bucketKey];
      if (!Array.isArray(arr)) continue;
      for (const s of arr) {
        const lab = skillCellToLabel(s);
        if (!lab) continue;
        if (looksLikeToolBullet(lab)) p.tool.push(lab);
        else p.skill.push(lab);
      }
    }
  }

  const eduArr = c.education;
  if (Array.isArray(eduArr)) {
    for (const e of eduArr as unknown[]) {
      const o = e as Record<string, unknown>;
      const parts = [o?.degree, o?.title, o?.field, o?.qualification, o?.institution, o?.school]
        .map((x) => (x != null ? String(x).trim() : ''))
        .filter(Boolean);
      if (parts.length) p.education.push(parts.join(' — '));
    }
  }

  const langs = c.languages;
  if (Array.isArray(langs)) {
    for (const l of langs as unknown[]) {
      const o = l as Record<string, unknown>;
      const n = o?.name ?? o?.language ?? o?.value;
      if (n) {
        const lvl = o?.levelText ?? o?.proficiency;
        p.language.push(lvl ? `${String(n)} (${String(lvl)})` : String(n));
      }
    }
  }

  (Object.keys(p) as TagCategoryKey[]).forEach((k) => {
    p[k] = uniqueNonEmptyStrings(p[k]);
    w[k] = dedupeWeightedCandTags(w[k]);
  });
  return { labels: p, weighted: w };
}

function collectCandidateNinePools(candidate: unknown): Record<TagCategoryKey, string[]> {
  return collectCandidatePoolsDetailed(candidate).labels;
}

function buildJobTagMatchCategories(job: JobTagMatchInput, candidate: unknown): TagMatchCategory[] {
  const { labels: candPools, weighted: candWeighted } = collectCandidatePoolsDetailed(candidate);
  const jobBuckets = collectJobTagChipsByCategory(job);

  const out: TagMatchCategory[] = [];
  for (const { key, name } of TAG_MATCH_CATEGORY_ORDER) {
    const rows = jobBuckets[key];
    if (!rows.length) continue;
    const pool =
      key === 'role'
        ? candWeighted.role.map((t) => t.label).filter(Boolean)
        : candPools[key];
    const chips = rows.map((row) => {
      const state = chipVisualState(row.label, row.mode, pool);
      // Language uses loose matching (substring); all other categories use strict matching
      // so the card colour is always consistent with the highlighted chips.
      const satisfiesRequirement =
        key === 'language'
          ? poolMatchesLabel(pool, row.label)
          : poolMatchesLabelStrict(pool, row.label);
      return {
        label: row.label,
        state,
        satisfiesRequirement,
        jobStructuralWeight: row.structuralWeight,
        jobWeightEstimated: row.structuralWeightEstimated,
      };
    });
    // תפקיד: show only candidate_tag rows typed as role — not title / inferred labels.
    const displayLabels =
      key === 'role'
        ? candWeighted.role.map((t) => t.label).filter(Boolean)
        : pool;
    const candidateTags = displayLabels.map((label) => ({
      label,
      matchesJob: rows.some((row) => {
        const jobLabel = stripCompareLabel(row.label);
        // Language: use the looser chipsRelate so "אנגלית (רמה גבוהה)" correctly
        // highlights against job tag "אנגלית" (6 Hebrew chars, below strict threshold).
        if (key === 'language') return chipsRelate(label, jobLabel);
        return chipsRelateForCandidateHighlight(label, jobLabel);
      }),
    }));
    out.push({ name, key, chips, candidateTags });
  }
  return out;
}

function looksLikeEducationRequirement(line: string): boolean {
  return /תואר|אקדמ|השכלה|בגרות|תעודה|מוסמך|מהנדס|מדעי|\bMBA\b|B\.?\s*Sc|M\.?\s*Sc|דוקטור|מגיסטר|לימודים/i.test(
    line.trim(),
  );
}

function hasHebrewText(line: string): boolean {
  return /[\u0590-\u05FF]/.test(line);
}

/** Latin standalone tech-ish tokens from requirements (React, Node.js — not internal taxonomy keys). */
function looksLikeToolBullet(line: string): boolean {
  const s = line.trim();
  if (s.length < 2 || s.length > 72) return false;
  if (looksLikeEducationRequirement(s)) return false;
  if (hasHebrewText(s)) return false;
  if (/שפה|english|arabic/i.test(s)) return false;
  // taxonomies like seniority_manager → תפקיד bucket
  if (/^[a-z][a-z0-9_]+$/i.test(s)) return false;
  // PascalCase (React, TypeScript) or tokens with version/dot patterns
  if (/^[A-Z][a-zA-Z0-9]*(?:\.[A-Za-z0-9]+)+/.test(s)) return true;
  if (/^[A-Z][a-z]+\/?[a-z]*$/i.test(s)) return true;
  if (/\d/.test(s) && /^[a-z0-9.\-+#/]{2,64}$/i.test(s)) return true;
  return /^[a-z0-9.\-+#/]{2,64}$/i.test(s) && /[.+#\d]/i.test(s);
}

function normCandTagType(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function skillCellToLabel(s: unknown): string | null {
  if (typeof s === 'string') {
    const v = s.trim();
    return v || null;
  }
  if (s && typeof s === 'object') {
    const o = s as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const key = typeof o.key === 'string' ? o.key.trim() : '';
    const lab = typeof o.label === 'string' ? o.label.trim() : '';
    return name || lab || key || null;
  }
  return null;
}
export {
  buildJobTagMatchCategories,
  TAG_MATCH_CATEGORY_ORDER,
};
