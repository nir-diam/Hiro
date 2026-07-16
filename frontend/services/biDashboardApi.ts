/**
 * BI performance dashboard API.
 */

export type BiKpi = {
  id: string;
  current: number;
  previous: number;
  changePct: number;
};

export type BiSeriesPoint = {
  label: string;
  periodStart: string;
  value: number;
};

export type BiComparisonRow = {
  id: string;
  metric: string;
  current: number;
  previous: number;
  changePct: number;
  sparkline: number[];
};

export type BiHeatmapRow = {
  recruiterId: string;
  name: string;
  [metricId: string]: string | number;
};

export type BiDashboardResponse = {
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  clientId: string | null;
  recruiterId: string | null;
  granularity: 'month' | 'quarter';
  metricId: string;
  recruiters: Array<{ id: string; name: string; role: string; isActive: boolean }>;
  kpis: BiKpi[];
  series: { metricId: string; points: BiSeriesPoint[] };
  comparison: BiComparisonRow[];
  recruiterGaps: Array<{
    recruiterId: string;
    name: string;
    actualHires: number;
    target: number;
    delta: number;
  }>;
  funnel: {
    cv_ingestions: number;
    screenings_done: number;
    passed_screening: number;
    moved_to_hired: number;
  };
  heatmap: BiHeatmapRow[];
};

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): HeadersInit => {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: Record<string, string> = { Accept: 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

export async function fetchBiDashboard(params: {
  range?: string;
  startDate?: string;
  endDate?: string;
  clientId?: string | null;
  recruiterId?: string | null;
  granularity?: 'month' | 'quarter';
  metric?: string;
}): Promise<BiDashboardResponse> {
  const base = apiBase();
  const qs = new URLSearchParams();
  if (params.range) qs.set('range', params.range);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate) qs.set('endDate', params.endDate);
  if (params.clientId) qs.set('clientId', params.clientId);
  if (params.recruiterId) qs.set('recruiterId', params.recruiterId);
  if (params.granularity) qs.set('granularity', params.granularity);
  if (params.metric) qs.set('metric', params.metric);

  const res = await fetch(`${base}/api/reports/bi-dashboard?${qs.toString()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || res.statusText || `HTTP ${res.status}`);
  }
  return res.json() as Promise<BiDashboardResponse>;
}
