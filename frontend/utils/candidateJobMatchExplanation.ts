import type { JobMatchResult } from './candidateJobMatchingApi';
import { pickBreakdownScore } from './sonarMatchBreakdown';

export type CandidateMatchTier = 'exact' | 'high' | 'medium' | 'low';

export type CandidateProfileMatchContext = {
  title?: string;
  desiredRoles?: string[];
  techSkills?: string[];
  softSkills?: string[];
  location?: string;
};

export type CandidateMatchPresentation = {
  tier: CandidateMatchTier;
  tierLabel: string;
  score: number;
  explanation: string;
  dominantFactor: 'role' | 'tags' | 'geo' | 'experience';
};

const TIER_LABELS: Record<CandidateMatchTier, string> = {
  exact: 'התאמה מדוייקת',
  high: 'התאמה גבוהה',
  medium: 'התאמה בינונית',
  low: 'התאמה נמוכה',
};

export function resolveCandidateMatchTier(score: number): CandidateMatchTier {
  const s = Math.round(Number(score) || 0);
  if (s >= 90) return 'exact';
  if (s >= 75) return 'high';
  if (s >= 50) return 'medium';
  return 'low';
}

export function candidateMatchTierLabel(tier: CandidateMatchTier): string {
  return TIER_LABELS[tier];
}

export function candidateMatchTierBadgeClass(tier: CandidateMatchTier): string {
  switch (tier) {
    case 'exact':
      return 'text-emerald-800 bg-emerald-50 border-emerald-200';
    case 'high':
      return 'text-green-800 bg-green-50 border-green-200';
    case 'medium':
      return 'text-amber-800 bg-amber-50 border-amber-200';
    default:
      return 'text-slate-700 bg-slate-50 border-slate-200';
  }
}

function firstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function resolveCandidateRole(profile: CandidateProfileMatchContext): string {
  const desired = Array.isArray(profile.desiredRoles)
    ? profile.desiredRoles.map((r) => String(r || '').trim()).find(Boolean)
    : '';
  return firstNonEmpty(profile.title, desired);
}

function resolveHighlightTag(profile: CandidateProfileMatchContext, job: JobMatchResult): string {
  const matchedFromEngine = job.scoreBreakdown?.tagBreakdown;
  if (matchedFromEngine && typeof matchedFromEngine === 'object') {
    const entries = Object.entries(matchedFromEngine as Record<string, unknown>);
    const hit = entries.find(([, v]) => {
      if (typeof v === 'number') return v > 0;
      if (v && typeof v === 'object') {
        const row = v as Record<string, unknown>;
        return Number(row.score ?? row.matchScore ?? 0) > 0;
      }
      return false;
    });
    if (hit?.[0]) return String(hit[0]).trim();
  }

  const skills = [
    ...(Array.isArray(profile.techSkills) ? profile.techSkills : []),
    ...(Array.isArray(profile.softSkills) ? profile.softSkills : []),
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  if (skills.length) return skills[0];
  return '';
}

function resolveJobDomain(job: JobMatchResult): string {
  return firstNonEmpty(job.field, job.role, job.title, 'תחום המשרה');
}

function resolveJobLocation(job: JobMatchResult): string {
  return firstNonEmpty(job.city, job.region, 'אזור המשרה');
}

type LayerContributions = {
  role: number;
  tags: number;
  geo: number;
  experience: number;
};

function computeLayerContributions(job: JobMatchResult): LayerContributions {
  const bd = job.scoreBreakdown;
  const intent = pickBreakdownScore(bd?.intentScore, bd?.intent) ?? 0;
  const vector = pickBreakdownScore(bd?.semanticScore, bd?.vector) ?? 0;
  const tags = pickBreakdownScore(bd?.tagsScore, bd?.tags) ?? 0;
  const geo = pickBreakdownScore(bd?.geoScore, bd?.geo) ?? 0;
  const experience = pickBreakdownScore(bd?.experienceScore, bd?.experience) ?? 0;

  const roleScore = Math.max(intent, vector * 0.85 + intent * 0.15);

  return {
    role: (roleScore / 100) * 40,
    tags: (tags / 100) * 35,
    geo: (geo / 100) * 15,
    experience: (experience / 100) * 10,
  };
}

function dominantFactor(contributions: LayerContributions): keyof LayerContributions {
  const entries = Object.entries(contributions) as Array<[keyof LayerContributions, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? 'role';
}

function buildExactExplanation(
  profile: CandidateProfileMatchContext,
  job: JobMatchResult,
  jobDomain: string,
  jobLocation: string,
): string {
  const candidateRole = resolveCandidateRole(profile) || 'התפקיד שלך';
  const highlightTag = resolveHighlightTag(profile, job);
  const tagPart = highlightTag ? ` והרקע שלך ב${highlightTag}` : '';
  return `זיהינו התאמה מדוייקת לדרישות המשרה, במיוחד בזכות הניסיון שלך ב${candidateRole}${tagPart}. בנוסף, המשרה נמצאת ב${jobLocation}, התואם את אזור מגוריך.`;
}

function buildHighExplanation(
  dominant: keyof LayerContributions,
  profile: CandidateProfileMatchContext,
  job: JobMatchResult,
  jobDomain: string,
  jobLocation: string,
): string {
  const highlightTag = resolveHighlightTag(profile, job);
  if (dominant === 'geo') {
    return `הרקע שלך ב${jobDomain} תואם היטב לפרופיל המחופש, עם דגש על הידע שלך ב${highlightTag || 'כישורים רלוונטיים'}. שימ/י לב שהמשרה ממוקמת ב${jobLocation}.`;
  }
  return `פרופיל הניסיון שלך מראה זיקה גבוהה לתפקידי ${jobDomain}, נראה שאת/ה עונה על רוב דרישות הליבה של החברה.`;
}

function buildMediumExplanation(
  dominant: keyof LayerContributions,
  jobDomain: string,
  jobLocation: string,
): string {
  if (dominant === 'geo') {
    return `המשרה נמצאת באזור ${jobLocation} ומשיקה לתחומי ה${jobDomain}, ויכולה להתאים אם את/ה מחפש/ת אתגר קרוב לבית.`;
  }
  return `ישנה השקה בין הניסיון שלך לבין דרישות החברה ב${jobDomain}. ייתכן והתפקיד דורש העמקה במיומנויות ספציפיות מעבר לפרופיל הנוכחי שלך.`;
}

function buildLowExplanation(jobDomain: string): string {
  return `משרה זו פחות תואמת את הניסיון הישיר שציינת בפרופיל, אך יכולה להוות הזדמנות מעניינת אם את/ה שוקל/ת מעבר לעולמות ה${jobDomain}.`;
}

/** Portal display score — when HR penalties crush engine score, still surface semantic fit. */
export function resolvePortalMatchScore(job: JobMatchResult): number {
  const engine = Math.round(Number(job.matchScore) || 0);
  const bd = job.scoreBreakdown;
  const semantic = Math.round(pickBreakdownScore(bd?.semanticScore, bd?.vector) ?? 0);
  const tags = Math.round(pickBreakdownScore(bd?.tagsScore, bd?.tags) ?? 0);
  const core = Math.round(Number(bd?.coreScore) || 0);
  if (engine >= 50) return engine;
  return Math.max(engine, semantic, tags, core);
}

/** Rule-based match copy for candidate portal — no external AI calls. */
export function buildCandidateMatchPresentation(
  job: JobMatchResult,
  profile: CandidateProfileMatchContext,
): CandidateMatchPresentation {
  const score = resolvePortalMatchScore(job);
  const tier = resolveCandidateMatchTier(score);
  const contributions = computeLayerContributions(job);
  const dominant = dominantFactor(contributions);
  const jobDomain = resolveJobDomain(job);
  const jobLocation = resolveJobLocation(job);

  let explanation: string;
  if (tier === 'exact') {
    explanation = buildExactExplanation(profile, job, jobDomain, jobLocation);
  } else if (tier === 'high') {
    explanation = buildHighExplanation(dominant, profile, job, jobDomain, jobLocation);
  } else if (tier === 'medium') {
    explanation = buildMediumExplanation(dominant, jobDomain, jobLocation);
  } else {
    explanation = buildLowExplanation(jobDomain);
  }

  return {
    tier,
    tierLabel: candidateMatchTierLabel(tier),
    score,
    explanation,
    dominantFactor: dominant,
  };
}
