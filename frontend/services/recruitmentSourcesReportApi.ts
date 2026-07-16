/**
 * Recruitment sources report API.
 */

export type SourceReportRow = {
  id: number;
  sourceName: string;
  candidates: number;
  referrals: number;
  placements: number;
  accepted: number;
  current: number;
  initial: number;
};

export type RecruitmentSourcesReportResponse = {
  startDate: string;
  endDate: string;
  source: string | null;
  totals: {
    candidates: number;
    referrals: number;
    placements: number;
    accepted: number;
    current: number;
    initial: number;
    conversionRate: number;
  };
  topSources: { sourceName: string; candidates: number }[];
  sourceOptions: string[];
  items: SourceReportRow[];
};

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): HeadersInit => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

export async function fetchRecruitmentSourcesReport(params: {
  startDate: string;
  endDate: string;
  source?: string;
  clientId?: string | null;
}): Promise<RecruitmentSourcesReportResponse> {
  const base = apiBase();
  const qs = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
  });
  if (params.source && params.source !== 'הכל') {
    qs.set('source', params.source);
  }
  if (params.clientId) {
    qs.set('clientId', params.clientId);
  }
  const res = await fetch(`${base}/api/reports/recruitment-sources?${qs.toString()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<RecruitmentSourcesReportResponse>;
}
