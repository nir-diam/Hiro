/**
 * Home dashboard API (personal / company).
 */

export type DashboardScope = 'personal' | 'company';

export type DashboardKpi = {
  id: string;
  value: number;
  previous?: number;
  changePct?: number;
  sentiment?: 'neutral' | 'success' | 'warning' | 'critical';
  unit?: string | null;
  subtext?: string;
  offers?: number;
  accepted?: number;
};

export type HomeDashboardResponse = {
  scope: DashboardScope;
  startDate: string | null;
  endDate: string | null;
  previousStartDate?: string | null;
  previousEndDate?: string | null;
  clientId: string | null;
  userId: string | null;
  kpis: DashboardKpi[];
  goal: { current: number; target: number };
  funnel: { max: number; data: { label: string; group?: string; value: number }[] };
  timeToHireSeries: {
    max: number;
    avg: number;
    changePct: number;
    data: { label: string; period?: string; value: number }[];
  };
  recruiterPerformance: Array<{
    recruiterId: string;
    name: string;
    sent: number;
    interviewed: number;
    hired: number;
  }>;
  openJobs: Array<{ id?: string; main: string; sub?: string }>;
  topSources: { max: number; data: { label: string; value: number }[] };
  tasks: Array<{ id: string; title: string; time: string; status: string }>;
  recentUpdates: Array<{ id: string; user: string; action: string; time: string; at?: string }>;
  message?: string;
};

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): HeadersInit => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

export async function fetchHomeDashboard(params: {
  scope: DashboardScope;
  startDate?: string | null;
  endDate?: string | null;
  range?: string;
}): Promise<HomeDashboardResponse> {
  const base = apiBase();
  if (!base) throw new Error('VITE_API_BASE is missing');
  const qs = new URLSearchParams();
  qs.set('scope', params.scope);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.range) qs.set('range', params.range);
  const res = await fetch(`${base}/api/dashboard?${qs.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Dashboard failed (${res.status})`);
  }
  return res.json();
}
