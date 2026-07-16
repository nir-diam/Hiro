import type { LandingLayoutsMap, LandingLayout } from '../services/publishingApi';

/** Fields that must not be carried into a duplicated job. */
const STRIP_JOB_KEYS = new Set([
  'id',
  'jobId',
  'postingCode',
  'uniqueEmail',
  'associatedCandidates',
  'waitingForScreening',
  'activeProcess',
  'candidates',
  'createdAt',
  'updatedAt',
  'visitCount',
  'submissionCount',
  'matchScore',
]);

/**
 * Build a seed payload for "שכפול משרה":
 * copies job content/settings; strips ids, job number, and candidate/stats fields.
 */
export function buildDuplicateJobSeed(job: Record<string, unknown>): Record<string, unknown> {
  const seed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(job || {})) {
    if (STRIP_JOB_KEYS.has(key)) continue;
    seed[key] = value;
  }
  // Force a fresh open date; keep status/settings from source.
  seed.openDate = new Date().toISOString();
  seed.associatedCandidates = 0;
  seed.waitingForScreening = 0;
  seed.activeProcess = 0;
  return seed;
}

export type DuplicatePublicationSeed = {
  publicJobTitle?: string | null;
  publicJobDescription?: string | null;
  publicJobRequirements?: string | null;
  landingPageFields?: unknown;
  screeningQuestions?: unknown;
  publishToGeneralBoard?: boolean;
  heroImageUrl?: string | null;
  videoUrl?: string | null;
  landingLayout?: LandingLayout | null;
  landingLayouts?: LandingLayoutsMap | null;
  trackingLinks?: Array<Record<string, unknown>>;
};

/** Publication fields to copy onto the new job (no visit/submission counters). */
export function buildDuplicatePublicationSeed(pub: Record<string, unknown> | null | undefined): DuplicatePublicationSeed | null {
  if (!pub || typeof pub !== 'object') return null;
  const links = Array.isArray(pub.trackingLinks)
    ? pub.trackingLinks.map((link: any) => ({
        id: link.id || link.srcKey,
        source: link.source,
        srcKey: link.srcKey,
        url: link.url || '',
        visits: 0,
        submissions: 0,
      }))
    : [];
  return {
    publicJobTitle: (pub.publicJobTitle as string) ?? null,
    publicJobDescription: (pub.publicJobDescription as string) ?? null,
    publicJobRequirements: (pub.publicJobRequirements as string) ?? null,
    landingPageFields: pub.landingPageFields,
    screeningQuestions: pub.screeningQuestions,
    publishToGeneralBoard: Boolean(pub.publishToGeneralBoard),
    heroImageUrl: (pub.heroImageUrl as string) ?? null,
    videoUrl: (pub.videoUrl as string) ?? null,
    landingLayout: (pub.landingLayout as LandingLayout) || null,
    landingLayouts: (pub.landingLayouts as LandingLayoutsMap) || null,
    trackingLinks: links,
  };
}

/** Human-readable recruitment source label from job_candidates.source. */
export function formatRecruitmentSourceLabel(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return 'מערכת';
  if (s.startsWith('public_apply:')) {
    const key = s.slice('public_apply:'.length).trim();
    return key || 'פרסום';
  }
  return s;
}
