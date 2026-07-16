export type LandingContact = {
  contactEmail: string;
  contactPhone1: string;
  contactPhone2: string;
};

export type CareerPageTheme = {
  bannerBg: string;
  bannerText: string;
  structure: string;
  buttonBg: string;
  buttonText: string;
  formBg: string;
  additionalDetails: string;
};

export const DEFAULT_CAREER_THEME: CareerPageTheme = {
  bannerBg: 'linear-gradient(90deg, #1e293b, #334155)',
  bannerText: '#ffffff',
  structure: '#4f46e5',
  buttonBg: '#4f46e5',
  buttonText: '#ffffff',
  formBg: '#f8fafc',
  additionalDetails: '#cbd5e1',
};

export type PosthogAnalyticsConfig = {
  key: string;
  host: string;
};

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/** Must match the region where the PostHog project was created (see Project Settings → Region). */
export const POSTHOG_HOST_OPTIONS = [
  { value: 'https://us.i.posthog.com', label: 'US — https://us.i.posthog.com' },
  { value: 'https://eu.i.posthog.com', label: 'EU — https://eu.i.posthog.com' },
] as const;

export type HeroGalleryImage = {
  id: string;
  url: string;
  label?: string;
  createdAt?: string;
};

export type CompanyCreatedImage = HeroGalleryImage & {
  source?: 'gallery' | 'publication';
  jobId?: string | null;
  canDelete?: boolean;
};

export type PublicBoardJob = {
  jobId: string;
  postingCode?: string;
  title: string;
  companyName: string;
  client: string;
  field?: string;
  role?: string;
  industry?: string;
  city?: string;
  region?: string;
  location: string;
  jobType: string;
  logo: string | null;
  primaryColor?: string | null;
  heroImage?: string | null;
  heroImageUrl?: string | null;
  description: string;
  requirements: string[];
  tags: string[];
  postedDate: string;
  salaryMin: number;
  salaryMax: number;
  landingUrl: string;
  isPromoted?: boolean;
};

export type LandingPageField = {
  key: string;
  label: string;
  status: 'mandatory' | 'optional';
};

export type ScreeningQuestion = {
  id: number | string;
  question: string;
  answerType: 'Yes/No' | 'טקסט חופשי' | 'בחירה מרובה' | string;
  idealAnswer?: string;
  isMandatory?: boolean;
  isPublished?: boolean;
  multipleChoiceOptions?: string;
  order?: number;
};

export type LandingLayout = 'detailed' | 'summary' | 'short' | 'title_only';

export type LayoutVariantContent = {
  publicJobTitle: string;
  publicJobDescription: string;
  publicJobRequirements: string;
  contactEmail: string;
  contactPhone1: string;
  contactPhone2: string;
};

export type LandingLayoutsMap = Partial<Record<LandingLayout, LayoutVariantContent>>;

export type PublicLandingData = {
  jobId: string;
  companyId?: string | null;
  postingCode?: string;
  companyName: string;
  jobTitle: string;
  location: string;
  jobType: string;
  logo: string | null;
  heroImage: string | null;
  videoUrl: string | null;
  description: string;
  descriptionPlain?: string;
  requirements: string[];
  landingPageFields: LandingPageField[];
  screeningQuestions: ScreeningQuestion[];
  theme?: CareerPageTheme;
  shareUrl?: string;
  contactEmail?: string | null;
  contactPhone1?: string | null;
  contactPhone2?: string | null;
  landingLayout?: LandingLayout;
  posthog?: PosthogAnalyticsConfig;
  clientBranding?: {
    clientName?: string;
    logoUrl: string | null;
    primaryColor: string | null;
    domain?: string | null;
  };
};

export type PublishingLinkRow = {
  id: string;
  jobId: string;
  /** Tenant client FK on the job (jobs.client_id). */
  clientId?: string | null;
  /** End employer name (jobs.client free-text label). */
  client: string;
  employer?: string;
  jobTitle: string;
  status: string;
  source: string;
  visits: number;
  submissions: number;
  subPercent: number;
  url: string;
  heroImage: string | null;
  heroImageUrl?: string | null;
  postingCode?: string | null;
};

export const getLinkHeroImage = (link: Pick<PublishingLinkRow, 'heroImage' | 'heroImageUrl'>) =>
  link.heroImage?.trim() || link.heroImageUrl?.trim() || null;

export const getLinkPublicUrl = (link: Pick<PublishingLinkRow, 'url' | 'jobId' | 'postingCode' | 'client'>) =>
  link.url?.trim() || buildPublicJobUrl(link.jobId, undefined, link.postingCode, link.client);

export type PublishingCandidateRow = {
  id: string;
  candidateId: string;
  name: string;
  client: string;
  jobTitle: string;
  city: string;
  date: string;
  time: string;
  source: string;
};

export type PublishingStats = {
  totalPublishedJobs: number;
  jobsWithActiveLinks: number;
  totalLinks: number;
  totalVisits: number;
  totalSubmissions: number;
  conversionRate: number;
};

const apiBase = () => import.meta.env.VITE_API_BASE || '';

export const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const publishingClientQuery = (clientId?: string | null): string => {
  const id = clientId?.trim();
  if (!id) return '';
  return `?${new URLSearchParams({ clientId: id }).toString()}`;
};

export type PublicBoardBranding = {
  clientId: string;
  clientName: string;
  domain?: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type PublicBoardResponse = {
  jobs: PublicBoardJob[];
  branding: PublicBoardBranding | null;
};

export async function fetchPublicBoardBranding(client: string): Promise<PublicBoardBranding | null> {
  const qs = new URLSearchParams({ client });
  const res = await fetch(`${apiBase()}/api/public/jobs/board/branding?${qs}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || typeof data !== 'object') return null;
  return data as PublicBoardBranding;
}

export async function fetchPublicJobBoard(params?: {
  search?: string;
  location?: string;
  jobType?: string;
  client?: string;
}): Promise<PublicBoardResponse> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.location) qs.set('location', params.location);
  if (params?.jobType) qs.set('jobType', params.jobType);
  if (params?.client) qs.set('client', params.client);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${apiBase()}/api/public/jobs/board${suffix}`);
  if (!res.ok) throw new Error('Failed to load job board');
  const data = await res.json();
  if (Array.isArray(data)) {
    const branding = params?.client ? await fetchPublicBoardBranding(params.client) : null;
    return { jobs: data, branding };
  }
  let branding = data?.branding ?? null;
  if (!branding && params?.client) {
    branding = await fetchPublicBoardBranding(params.client);
  }
  return {
    jobs: Array.isArray(data?.jobs) ? data.jobs : [],
    branding,
  };
}

export async function fetchHeroGallery(clientId?: string | null): Promise<HeroGalleryImage[]> {
  const res = await fetch(`${apiBase()}/api/publishing/hero-gallery${publishingClientQuery(clientId)}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load hero gallery');
  return res.json();
}

export async function fetchCompanyCreatedImages(clientId?: string | null): Promise<CompanyCreatedImage[]> {
  const res = await fetch(`${apiBase()}/api/publishing/company-images${publishingClientQuery(clientId)}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load company images');
  return res.json();
}

export async function fetchJobCompanyImages(jobId: string): Promise<CompanyCreatedImage[]> {
  const res = await fetch(
    `${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/publication/company-images`,
    { headers: getAuthHeaders() },
  );
  if (!res.ok) throw new Error('Failed to load company images');
  return res.json();
}

const mergeCompanyImages = (...lists: CompanyCreatedImage[][]): CompanyCreatedImage[] => {
  const byUrl = new Map<string, CompanyCreatedImage>();
  for (const list of lists) {
    for (const img of list) {
      const url = String(img?.url || '').trim();
      if (!url) continue;
      if (!byUrl.has(url)) byUrl.set(url, img);
    }
  }
  return [...byUrl.values()].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
};

/** Merge job-scoped images with the logged-in user's full company gallery. */
export async function fetchJobCompanyImagesWithFallback(jobId: string): Promise<CompanyCreatedImage[]> {
  const results = await Promise.allSettled([
    jobId ? fetchJobCompanyImages(jobId) : Promise.resolve([] as CompanyCreatedImage[]),
    fetchCompanyCreatedImages(),
  ]);
  const lists = results
    .filter((result): result is PromiseFulfilledResult<CompanyCreatedImage[]> => result.status === 'fulfilled')
    .map((result) => result.value);
  return mergeCompanyImages(...lists);
}

export async function addHeroGalleryImage(url: string, label?: string, clientId?: string | null): Promise<HeroGalleryImage[]> {
  const res = await fetch(`${apiBase()}/api/publishing/hero-gallery${publishingClientQuery(clientId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ url, label }),
  });
  if (!res.ok) throw new Error('Failed to add image');
  return res.json();
}

export async function removeHeroGalleryImage(imageId: string, clientId?: string | null): Promise<HeroGalleryImage[]> {
  const res = await fetch(`${apiBase()}/api/publishing/hero-gallery/${encodeURIComponent(imageId)}${publishingClientQuery(clientId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove image');
  return res.json();
}

export type GenerateHeroImagePayload = {
  aspectRatio?: '16:9' | '4:3' | '3:4' | '1:1';
  landingLayout?: LandingLayout;
  companyLogo?: string | null;
  /** Staffing agency / Hiro client name — never the employer organization. */
  clientName?: string;
  /** @deprecated use clientName */
  companyName?: string;
  companySlogan?: string;
  brandColor?: string;
  publicJobTitle?: string;
  publicJobDescription?: string;
  publicJobRequirements?: string;
  contactEmail?: string;
  contactPhone1?: string;
  contactPhone2?: string;
};

export async function generateHeroImage(
  jobId: string,
  payload?: GenerateHeroImagePayload,
): Promise<{ url: string; heroImageUrl: string }> {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/publication/generate-hero-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to generate image');
  return data;
}

export async function fetchPublicLanding(
  slug: string,
  src?: string | null,
  client?: string | null,
): Promise<PublicLandingData> {
  const qs = new URLSearchParams();
  if (src) qs.set('src', src);
  if (client) qs.set('client', client);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${apiBase()}/api/public/jobs/${encodeURIComponent(slug)}/landing${suffix}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to load job');
  }
  return res.json();
}

export async function recordLandingVisit(slug: string, src?: string | null): Promise<void> {
  await fetch(`${apiBase()}/api/public/jobs/${encodeURIComponent(slug)}/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: src || 'direct' }),
  }).catch(() => {});
}

export async function submitLandingApplication(
  slug: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; companyName?: string }> {
  const res = await fetch(`${apiBase()}/api/public/jobs/${encodeURIComponent(slug)}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Application failed');
  return data;
}

export async function fetchPublishingLinks(clientId?: string | null): Promise<PublishingLinkRow[]> {
  const res = await fetch(`${apiBase()}/api/publishing/links${publishingClientQuery(clientId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load links');
  return res.json();
}

export async function fetchPublishingCandidates(clientId?: string | null): Promise<PublishingCandidateRow[]> {
  const res = await fetch(`${apiBase()}/api/publishing/candidates${publishingClientQuery(clientId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load candidates');
  return res.json();
}

export async function fetchPublishingStats(clientId?: string | null): Promise<PublishingStats> {
  const res = await fetch(`${apiBase()}/api/publishing/stats${publishingClientQuery(clientId)}`, {
    headers: getAuthHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json();
}

export async function fetchCareerTheme(clientId?: string | null): Promise<CareerPageTheme> {
  const res = await fetch(`${apiBase()}/api/publishing/theme${publishingClientQuery(clientId)}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load theme');
  return res.json();
}

export async function saveCareerTheme(theme: CareerPageTheme, clientId?: string | null): Promise<CareerPageTheme> {
  const res = await fetch(`${apiBase()}/api/publishing/theme${publishingClientQuery(clientId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(theme),
  });
  if (!res.ok) throw new Error('Failed to save theme');
  return res.json();
}

export async function fetchPosthogAnalytics(clientId?: string | null): Promise<PosthogAnalyticsConfig> {
  const res = await fetch(`${apiBase()}/api/publishing/posthog-analytics${publishingClientQuery(clientId)}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load PostHog settings');
  return res.json();
}

export async function savePosthogAnalytics(
  config: Partial<PosthogAnalyticsConfig>,
  clientId?: string | null,
): Promise<PosthogAnalyticsConfig> {
  const res = await fetch(`${apiBase()}/api/publishing/posthog-analytics${publishingClientQuery(clientId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to save PostHog settings');
  }
  return res.json();
}

export async function fetchLandingContact(clientId?: string | null): Promise<LandingContact> {
  const res = await fetch(`${apiBase()}/api/publishing/landing-contact${publishingClientQuery(clientId)}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to load landing contact settings');
  return res.json();
}

export async function saveLandingContact(contact: Partial<LandingContact>, clientId?: string | null): Promise<LandingContact> {
  const res = await fetch(`${apiBase()}/api/publishing/landing-contact${publishingClientQuery(clientId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to save landing contact settings');
  }
  return res.json();
}

export async function fetchJobPublication(jobId: string) {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/publication`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load publication settings');
  return res.json();
}

export async function saveJobPublication(jobId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/publication`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to save publication settings');
  }
  return res.json();
}

export function getPublicJobSlug(jobId: string, postingCode?: string | null): string {
  return postingCode?.trim() || jobId;
}

/** Tenant domain for public URLs — never use client UUID in share links. */
export function resolvePublicClientRouteKey(domain?: string | null): string | undefined {
  const d = String(domain || '').trim();
  return d || undefined;
}

const CLIENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** When the URL segment is a client UUID, resolve the tenant domain for canonical routing. */
export async function resolvePublicBoardRouteKey(clientParam?: string | null): Promise<string | undefined> {
  const decoded = String(clientParam || '').trim();
  if (!decoded) return undefined;
  if (!CLIENT_UUID_RE.test(decodeURIComponent(decoded))) {
    return decodeURIComponent(decoded);
  }
  const branding = await fetchPublicBoardBranding(decoded);
  return resolvePublicClientRouteKey(branding?.domain);
}

export function buildPublicJobHashPath(
  jobId: string,
  postingCode?: string | null,
  clientName?: string | null,
): string {
  const slug = getPublicJobSlug(jobId, postingCode);
  const client = String(clientName || '').trim();
  if (client) {
    return `/jobs/${encodeURIComponent(client)}/public/${encodeURIComponent(slug)}`;
  }
  return `/jobs/public/${encodeURIComponent(slug)}`;
}

/** Origin for share-preview HTML (API). Uses VITE_API_BASE when set. */
function shareApiOrigin(): string {
  const api = apiBase()?.replace(/\/$/, '');
  if (api) return api;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** In-app landing URL (after share page redirect). */
export function buildPublicJobAppUrl(
  jobId: string,
  src?: string,
  postingCode?: string | null,
  clientName?: string | null,
) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = buildPublicJobHashPath(jobId, postingCode, clientName);
  const query = src ? `?src=${encodeURIComponent(src)}` : '';
  return `${origin}${path}${query}`;
}

/**
 * Share link for WhatsApp / LinkedIn / copy — hits backend HTML with Open Graph tags,
 * then redirects humans to the app landing URL.
 */
export function buildPublicJobUrl(
  jobId: string,
  src?: string,
  postingCode?: string | null,
  clientName?: string | null,
) {
  const slug = getPublicJobSlug(jobId, postingCode);
  const client = String(clientName || '').trim();
  const query = src ? `?src=${encodeURIComponent(src)}` : '';
  const base = shareApiOrigin();
  if (client) {
    return `${base}/api/public/jobs/share/${encodeURIComponent(client)}/${encodeURIComponent(slug)}${query}`;
  }
  return `${base}/api/public/jobs/share/${encodeURIComponent(slug)}${query}`;
}

/** Public job board — no login required. Accepts tenant domain or client UUID. */
export function buildPublicJobBoardHashPath(clientDomainOrId?: string | null): string {
  const client = String(clientDomainOrId || '').trim();
  if (client) {
    return `/jobs/${encodeURIComponent(client)}/public/board`;
  }
  return `/jobs/public/board`;
}

/** In-app job board URL (opens the SPA directly). */
export function buildPublicJobBoardAppUrl(clientDomainOrId?: string | null) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${buildPublicJobBoardHashPath(clientDomainOrId)}`;
}

/**
 * Share link for WhatsApp / LinkedIn / copy — backend HTML with Open Graph tags,
 * then redirects humans to the job board SPA URL.
 */
export function buildPublicJobBoardUrl(clientDomainOrId?: string | null) {
  const client = String(clientDomainOrId || '').trim();
  const base = shareApiOrigin();
  if (client) {
    return `${base}/api/public/jobs/share/${encodeURIComponent(client)}/board`;
  }
  return `${base}/api/public/jobs/share/board`;
}

/** Extract tenant route segment from a landing URL path (with or without legacy hash). */
export function parsePublicRouteClientFromLandingUrl(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:#|\/)jobs\/([^/]+)\/public\//);
  return match ? decodeURIComponent(match[1]) : null;
}

export function createTrackingSrcKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36) || 'campaign';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}_${suffix}`;
}

export type TrackingLinkRow = {
  id: string | number;
  source: string;
  srcKey: string;
  url: string;
  views: number;
  applicants: number;
};

export function mapTrackingLinkFromApi(
  link: any,
  jobId: string,
  postingCode?: string | null,
  clientName?: string | null,
): TrackingLinkRow {
  const srcKey =
    link.srcKey ||
    String(link.source || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_') ||
    `link_${link.id || Date.now()}`;
  return {
    id: link.id ?? srcKey,
    source: link.source || 'קישור',
    srcKey,
    url: buildPublicJobUrl(jobId, srcKey, postingCode, clientName),
    views: Number(link.visits ?? link.views ?? 0) || 0,
    applicants: Number(link.submissions ?? link.applicants ?? 0) || 0,
  };
}

export type BoardPublicationRow = {
  jobId: string;
  jobTitle: string;
  company: string;
  domain: string;
  role: string;
  city: string;
  region: string;
  publicationDate: string | null;
  jobStatus: string;
  clientId: string | null;
  sourceId: string;
  sourceName: string;
  sourceStatus: 'published' | 'draft';
  alertDays: number | null;
  candidatesCount: number;
};

export async function fetchBoardPublications(params?: {
  startDate?: string;
  endDate?: string;
  clientId?: string | null;
}): Promise<BoardPublicationRow[]> {
  const qs = new URLSearchParams();
  if (params?.startDate) qs.set('startDate', params.startDate);
  if (params?.endDate) qs.set('endDate', params.endDate);
  if (params?.clientId) qs.set('clientId', params.clientId);
  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`${apiBase()}/api/jobs/board-publications${suffix}`, {
    headers: { Accept: 'application/json', ...getAuthHeaders() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to load board publications');
  const data = await res.json() as { publications?: BoardPublicationRow[] };
  return Array.isArray(data.publications) ? data.publications : [];
}

export async function patchJobBoardSources(
  jobId: string,
  recruitmentSources: Array<{ id: string; name: string; selected: boolean; status: string; alertDays: number | null }>,
): Promise<void> {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/board-sources`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ recruitmentSources }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message || 'Failed to save board sources');
  }
}

export async function fetchJobPublicationCandidates(jobId: string) {
  const res = await fetch(`${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/publication/candidates`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load publication candidates');
  return res.json();
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
