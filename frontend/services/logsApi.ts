export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: AppLogLevel;
  source: string;
  message: string;
  context: Record<string, unknown>;
  userId: string | null;
  userEmail: string | null;
  requestId: string | null;
  stackTrace: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  level?: string;
  source?: string;
  from?: string;
  to?: string;
}

export interface AppLogListResponse {
  items: AppLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AppLogStats {
  logsToday: number;
  errors24h: number;
  activeSources: number;
}

const API_PATH = '/api/admin/logs';

const authHeaders = (token: string | null): HeadersInit => {
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
};

const normalizeLevel = (val: unknown): AppLogLevel => {
  const v = String(val || '').toLowerCase();
  return ['debug', 'info', 'warn', 'error', 'fatal'].includes(v) ? (v as AppLogLevel) : 'info';
};

const normalizeRow = (raw: Record<string, unknown>): AppLogEntry => {
  const context = (raw.context && typeof raw.context === 'object' && !Array.isArray(raw.context))
    ? (raw.context as Record<string, unknown>)
    : {};
  const ts = raw.timestamp || raw.createdAt || raw.created_at;
  return {
    id: String(raw.id || ''),
    timestamp: ts ? new Date(String(ts)).toISOString() : new Date().toISOString(),
    level: normalizeLevel(raw.level),
    source: String(raw.source || 'system'),
    message: String(raw.message || ''),
    context,
    userId: raw.userId || raw.user_id ? String(raw.userId || raw.user_id) : null,
    userEmail: raw.userEmail || raw.user_email ? String(raw.userEmail || raw.user_email) : null,
    requestId: raw.requestId || raw.request_id ? String(raw.requestId || raw.request_id) : null,
    stackTrace: raw.stackTrace || raw.stack_trace ? String(raw.stackTrace || raw.stack_trace) : null,
    createdAt: raw.createdAt || raw.created_at ? String(raw.createdAt || raw.created_at) : undefined,
    updatedAt: raw.updatedAt || raw.updated_at ? String(raw.updatedAt || raw.updated_at) : undefined,
  };
};

const buildQuery = (params: AppLogListParams): string => {
  const q = new URLSearchParams();
  if (params.page) q.set('page', String(params.page));
  if (params.pageSize) q.set('pageSize', String(params.pageSize));
  if (params.search) q.set('search', params.search);
  if (params.level) q.set('level', params.level);
  if (params.source) q.set('source', params.source);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export async function fetchAppLogs(
  apiBase: string,
  token: string | null,
  params: AppLogListParams = {},
): Promise<AppLogListResponse> {
  const res = await fetch(`${apiBase}${API_PATH}${buildQuery(params)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to load logs (${res.status})`);
  }
  const data = (await res.json()) as {
    items?: Record<string, unknown>[];
    total?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
  };
  return {
    items: (data.items || []).map(normalizeRow),
    total: data.total ?? 0,
    page: data.page ?? 1,
    pageSize: data.pageSize ?? 25,
    hasMore: Boolean(data.hasMore),
  };
}

export async function fetchAppLogStats(apiBase: string, token: string | null): Promise<AppLogStats> {
  const res = await fetch(`${apiBase}${API_PATH}/stats`, { headers: authHeaders(token) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to load stats (${res.status})`);
  }
  const data = (await res.json().catch(() => ({}))) as Partial<AppLogStats>;
  return {
    logsToday: data.logsToday ?? 0,
    errors24h: data.errors24h ?? 0,
    activeSources: data.activeSources ?? 0,
  };
}

export async function fetchAppLogSources(apiBase: string, token: string | null): Promise<string[]> {
  const res = await fetch(`${apiBase}${API_PATH}/sources`, { headers: authHeaders(token) });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { sources?: string[] };
  return Array.isArray(data.sources) ? data.sources : [];
}

export async function fetchAppLogById(
  apiBase: string,
  token: string | null,
  id: string,
): Promise<AppLogEntry> {
  const res = await fetch(`${apiBase}${API_PATH}/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to load log (${res.status})`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return normalizeRow(data);
}

export async function deleteAppLog(apiBase: string, token: string | null, id: string): Promise<void> {
  const res = await fetch(`${apiBase}${API_PATH}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Failed to delete log (${res.status})`);
  }
}
