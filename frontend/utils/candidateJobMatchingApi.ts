/**
 * API layer for the candidate → job matching screen.
 * All calls go through the backend — no AI keys exposed to the client.
 */

// Module-level cache so fetchClientOptions / fetchCityOptions hit the network only once per session.
let _jobsListCache: { client?: string; city?: string; status?: string }[] | null = null;
let _jobsListPending: Promise<{ client?: string; city?: string; status?: string }[]> | null = null;

async function getJobsList(): Promise<{ client?: string; city?: string; status?: string }[]> {
  if (_jobsListCache) return _jobsListCache;
  if (_jobsListPending) return _jobsListPending;
  const base = apiBase();
  _jobsListPending = fetch(`${base}/api/jobs?limit=2000`, { headers: authHeaders() })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data.jobs) ? data.jobs : []);
      _jobsListCache = list;
      _jobsListPending = null;
      return list;
    })
    .catch(() => { _jobsListPending = null; return []; });
  return _jobsListPending;
}

export interface JobMatchResult {
  id: string;
  title: string;
  client: string;
  status: string;
  city: string;
  region?: string;
  jobType: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  description?: string;
  requirements?: string[];
  skills?: unknown[];
  languages?: unknown[];
  role?: string;
  field?: string;
  matchScore: number;
  /** From matchingScoreService.computeFullMatchScore (includes geoDistance in km when resolved). */
  scoreBreakdown?: {
    semanticScore?: number;
    tagsScore?: number;
    geoScore?: number;
    intentScore?: number;
    experienceScore?: number;
    generalPenalties?: number;
    salaryPenalty?: number;
    ageGapPenalty?: number;
    penaltyReasons?: Array<{ label: string; amount: number; key?: string; type?: string }>;
    geoDistance?: number | null;
    geo?: number;
    geoMissing?: boolean;
    vector?: number;
    tags?: number;
    [key: string]: unknown;
  } | null;
  matchType: 'application' | 'ai';
  requirementsMet: boolean;
  parameterMatches: {
    mandatory_skill: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    license: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    age: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    gender: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    mobility: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    scope: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    work_hours: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    availability: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    mandatory_language: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
    salary: 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';
  };
  jobCandidateId?: string | null;
  lastAnalyzed?: string;
}

export interface MatchQuery {
  limit?: number;
  minScore?: number;
  statuses?: string[];
  clientIds?: string[];
  cities?: string[];
  jobTypes?: string[];
  useVector?: boolean;
}

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): HeadersInit => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch AI + parametric job matches for a candidate. */
export async function fetchJobMatches(candidateId: string, query: MatchQuery = {}): Promise<JobMatchResult[]> {
  const base = apiBase();
  const res = await fetch(`${base}/api/candidates/${encodeURIComponent(candidateId)}/job-matches`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(query),
  });
  const data = await handleResponse<{ rows: JobMatchResult[] }>(res);
  return Array.isArray(data.rows) ? data.rows : [];
}

/** Create a real job–candidate link (שיוך למשרה). */
export async function assignCandidateToJob(
  candidateId: string,
  jobId: string,
): Promise<{ ok: boolean }> {
  const base = apiBase();
  const res = await fetch(`${base}/api/candidates/${encodeURIComponent(candidateId)}/linked-jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ jobId, source: 'job_matching', manualOverride: true, status: 'חדש' }),
  });
  return handleResponse<{ ok: boolean }>(res);
}

/** Fetch a single candidate's full record (for TagMatchPanel enrichment). */
export async function fetchCandidate(candidateId: string): Promise<Record<string, unknown>> {
  const base = apiBase();
  const res = await fetch(`${base}/api/candidates/${encodeURIComponent(candidateId)}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  return handleResponse<Record<string, unknown>>(res);
}

/** Generate a Markdown deep-insight analysis (backend Gemini call). */
export async function fetchDeepInsight(candidateId: string, jobId: string): Promise<{ markdown: string }> {
  const base = apiBase();
  const res = await fetch(
    `${base}/api/candidates/${encodeURIComponent(candidateId)}/jobs/${encodeURIComponent(jobId)}/deep-insight`,
    { method: 'POST', headers: authHeaders(), body: JSON.stringify({}) },
  );
  return handleResponse<{ markdown: string }>(res);
}

/** Fetch distinct client names from all open/frozen jobs (reuse job list endpoint). */
export async function fetchClientOptions(): Promise<string[]> {
  try {
    const jobs = await getJobsList();
    const seen = new Set<string>();
    return jobs
      .map((j) => (j.client || '').trim())
      .filter((c) => c && !seen.has(c) && seen.add(c));
  } catch {
    return [];
  }
}

/** Fetch distinct cities from all open/frozen jobs. */
export async function fetchCityOptions(): Promise<string[]> {
  try {
    const jobs = await getJobsList();
    const seen = new Set<string>();
    return jobs
      .filter((j) => j.status === 'פתוחה' || j.status === 'מוקפאת')
      .map((j) => (j.city || '').trim())
      .filter((c) => c && !seen.has(c) && seen.add(c))
      .sort();
  } catch {
    return [];
  }
}
