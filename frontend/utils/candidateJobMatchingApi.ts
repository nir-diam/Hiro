/**
 * API layer for the candidate → job matching screen.
 * All calls go through the backend — no AI keys exposed to the client.
 */

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
  matchType: 'application' | 'ai';
  requirementsMet: boolean;
  parameterMatches: {
    mandatory_skill: 'match' | 'gap' | 'unknown';
    license: 'match' | 'gap' | 'unknown';
    age: 'match' | 'gap' | 'unknown';
    gender: 'match' | 'gap' | 'unknown';
    mobility: 'match' | 'gap' | 'unknown';
    scope: 'match' | 'gap' | 'unknown';
    mandatory_language: 'match' | 'gap' | 'unknown';
    salary: 'match' | 'gap' | 'unknown';
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
  const base = apiBase();
  try {
    const res = await fetch(`${base}/api/jobs?limit=2000`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: { client?: string }[] = Array.isArray(data) ? data : (Array.isArray(data.jobs) ? data.jobs : []);
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
  const base = apiBase();
  try {
    const res = await fetch(`${base}/api/jobs?limit=2000`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs: { city?: string; status?: string }[] = Array.isArray(data) ? data : (Array.isArray(data.jobs) ? data.jobs : []);
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
