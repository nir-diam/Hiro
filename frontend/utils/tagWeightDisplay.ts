/** Bounds for structural weight (calculated_weight), aligned with backend tagScoringEngine base table + boosters. */
export const TAG_WEIGHT_STRUCTURAL_MIN = 0.5;
export const TAG_WEIGHT_STRUCTURAL_MAX = 1.65;

/** Mirrors backend/src/services/tagScoringEngine.js (defaults when env not set). */
const BASE_WEIGHT_TABLE: Record<string, number> = {
  'role:core': 1.0,
  'role:tool': 0.85,
  'skill:tool': 0.6,
  'skill:core': 0.75,
  'tool:tool': 0.5,
};
const DEFAULT_BASE_WEIGHT = 0.65;
const TAG_CURRENT_BOOSTER = 0.4;
const TAG_SUMMARY_BOOSTER = 0.25;

function normalizeWeightKey(rawType: unknown, context: unknown): string {
  return `${String(rawType ?? 'role').trim().toLowerCase()}:${String(context ?? 'core').trim().toLowerCase()}`;
}

/** When DB has no calculated_weight yet, derive structural weight from type/context/boosters (same formula as server). */
export function estimateStructuralWeightFromMeta(meta: {
  rawType?: unknown;
  context?: unknown;
  isCurrent?: unknown;
  isInSummary?: unknown;
}): number {
  const rt = meta.rawType != null ? String(meta.rawType).trim().toLowerCase() : 'role';
  const ctx = meta.context != null ? String(meta.context).trim().toLowerCase() : 'core';
  const key = normalizeWeightKey(rt, ctx);
  let base = BASE_WEIGHT_TABLE[key];
  if (typeof base !== 'number') {
    const fb = BASE_WEIGHT_TABLE[normalizeWeightKey(rt, 'core')];
    base = typeof fb === 'number' ? fb : DEFAULT_BASE_WEIGHT;
  }
  const booster =
    (meta.isCurrent === true ? TAG_CURRENT_BOOSTER : 0) +
    (meta.isInSummary === true ? TAG_SUMMARY_BOOSTER : 0);
  return base + booster;
}

export type TagWeightBarTier = 1 | 2 | 3;

/** 0 = all bars muted; 1–3 = primary fill height pattern (same as TagWeightBars). */
export type WeightBarFilled = 0 | TagWeightBarTier;

/** One-line label for native tooltip (matches legacy UI copy). */
export function shortStructuralWeightTitleHe(w: number): string {
  return `משקל: ${w.toFixed(2)} - ${vitalityLabelHe(w)}`;
}

/** Map structural weight to how many of the 3 bars are filled (by tertiles of [min, max]). */
export function weightToFilledBarCount(w: number): TagWeightBarTier {
  const span = TAG_WEIGHT_STRUCTURAL_MAX - TAG_WEIGHT_STRUCTURAL_MIN || 1;
  const t =
    (Math.min(TAG_WEIGHT_STRUCTURAL_MAX, Math.max(TAG_WEIGHT_STRUCTURAL_MIN, w)) -
      TAG_WEIGHT_STRUCTURAL_MIN) /
    span;
  if (t <= 1 / 3) return 1;
  if (t <= 2 / 3) return 2;
  return 3;
}

export function vitalityLabelHe(w: number): string {
  const span = TAG_WEIGHT_STRUCTURAL_MAX - TAG_WEIGHT_STRUCTURAL_MIN || 1;
  const t =
    (Math.min(TAG_WEIGHT_STRUCTURAL_MAX, Math.max(TAG_WEIGHT_STRUCTURAL_MIN, w)) -
      TAG_WEIGHT_STRUCTURAL_MIN) /
    span;
  if (t >= 2 / 3) return 'חיוניות גבוהה';
  if (t >= 1 / 3) return 'חיוניות בינונית';
  return 'חיוניות נמוכה';
}

/** Vitality bands aligned with job tag-match legend copy (< 0.85 / 0.85–1.04 / ≥ 1.05). */
export function vitalityLabelHeJobBands(w: number): string {
  if (!Number.isFinite(w)) return 'חיוניות לא ידועה';
  if (w < 0.85) return 'חיוניות נמוכה';
  if (w < 1.05) return 'חיוניות בינונית';
  return 'חיוניות גבוהה';
}

/** Tooltip headline for job requirement structural weight (tag-match drawer). */
export function shortJobStructuralWeightTooltipHe(w: number): string {
  return `משקל: ${w.toFixed(2)} - ${vitalityLabelHeJobBands(w)}`;
}

/** Three-bar fill count using fixed breakpoints for job requirements / legend. */
export function weightToFilledBarCountJobBands(w: number): WeightBarFilled {
  if (!Number.isFinite(w)) return 0;
  if (w < 0.85) return 1;
  if (w < 1.05) return 2;
  return 3;
}

export function formatTagWeightTooltipHe(params: {
  weight: number;
  confidence?: number | null;
  finalScore?: number | null;
  /** True when weight came from client-side formula (no calculatedWeight on tag row). */
  structuralWeightEstimated?: boolean;
  /** When true, skip the first "משקל..." line (use with shortStructuralWeightTitleHe). */
  omitWeightHeadline?: boolean;
}): string {
  const parts: string[] = [];
  if (!params.omitWeightHeadline) {
    if (params.structuralWeightEstimated) {
      parts.push(
        `משקל מבני (משוער לפי סוג/הקשר/חיזוקים): ${params.weight.toFixed(2)} - ${vitalityLabelHe(params.weight)}`,
      );
    } else {
      parts.push(shortStructuralWeightTitleHe(params.weight).replace(/^משקל:/, 'משקל מבני:'));
    }
  }
  parts.push(
    `טווח ייחוס (מבני): ${TAG_WEIGHT_STRUCTURAL_MIN.toFixed(2)}–${TAG_WEIGHT_STRUCTURAL_MAX.toFixed(2)}`,
  );
  if (params.confidence != null && Number.isFinite(Number(params.confidence))) {
    parts.push(`ביטחון (confidence): ${Number(params.confidence).toFixed(3)}`);
  }
  if (params.finalScore != null && Number.isFinite(Number(params.finalScore))) {
    parts.push(`ציון סופי (final_score): ${Number(params.finalScore).toFixed(2)}`);
  }
  return parts.join('\n');
}
