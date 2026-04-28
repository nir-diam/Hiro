export type AuditLogLevel = 'info' | 'warning' | 'error' | 'critical';
export type AuditLogAction = 'create' | 'update' | 'delete' | 'login' | 'export' | 'system';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  level: AuditLogLevel;
  action: AuditLogAction;
  description: string;
  user: {
    id?: string | null;
    name: string;
    email: string;
    role: string;
    ip: string;
    avatar?: string;
  };
  entity?: {
    type: string;
    id: string;
    name: string;
  };
  metadata: {
    browser?: string;
    os?: string;
    userAgent?: string;
    duration?: number;
    statusCode?: number;
    [key: string]: unknown;
  };
  changes?: { field: string; oldValue: unknown; newValue: unknown }[];
}

export interface AuditLogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  level?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditLogListResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AuditLogStats {
  eventsToday: number;
  errors24h: number;
  activeUsers: number;
}

/** Path: GET /api/audit-logs/by-entity/:type/:entityId */
export type AuditEntityKind = 'client' | 'candidate' | 'job';

export interface AuditLogsByEntityResponse extends AuditLogListResponse {
  type: string;
  entityType: string;
  entityId: string;
}

const API_PATH = '/api/audit-logs';

const buildHeaders = (token: string | null, json = false): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const parseError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // ignore
  }
  return fallback;
};

const normalizeLevel = (val: unknown): AuditLogLevel => {
  const v = String(val || '').toLowerCase();
  return ['info', 'warning', 'error', 'critical'].includes(v) ? (v as AuditLogLevel) : 'info';
};

const normalizeAction = (val: unknown): AuditLogAction => {
  const v = String(val || '').toLowerCase();
  return ['create', 'update', 'delete', 'login', 'export', 'system'].includes(v)
    ? (v as AuditLogAction)
    : 'system';
};

const normalizeRow = (raw: Record<string, unknown>): AuditLogEntry => {
  const metadata = (raw.metadata && typeof raw.metadata === 'object'
    ? raw.metadata
    : {}) as AuditLogEntry['metadata'];
  const changesRaw = Array.isArray(raw.changes) ? (raw.changes as unknown[]) : [];
  const changes = changesRaw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => ({
      field: String(c.field ?? ''),
      oldValue: c.oldValue,
      newValue: c.newValue,
    }));

  const entityType = raw.entityType ? String(raw.entityType) : '';
  const entity = entityType
    ? {
        type: entityType,
        id: String(raw.entityId ?? ''),
        name: String(raw.entityName ?? ''),
      }
    : undefined;

  return {
    id: String(raw.id ?? ''),
    timestamp: String(raw.timestamp ?? new Date().toISOString()),
    level: normalizeLevel(raw.level),
    action: normalizeAction(raw.action),
    description: String(raw.description ?? ''),
    user: {
      id: raw.userId ? String(raw.userId) : null,
      name: String(raw.userName ?? ''),
      email: String(raw.userEmail ?? ''),
      role: String(raw.userRole ?? ''),
      ip: String(raw.userIp ?? ''),
      avatar: raw.userAvatar ? String(raw.userAvatar) : undefined,
    },
    entity,
    metadata,
    changes: changes.length ? changes : undefined,
  };
};

const buildQuery = (params: AuditLogListParams): string => {
  const usp = new URLSearchParams();
  if (params.page) usp.set('page', String(params.page));
  if (params.pageSize) usp.set('pageSize', String(params.pageSize));
  if (params.search) usp.set('search', params.search);
  if (params.level && params.level !== 'all') usp.set('level', params.level);
  if (params.action && params.action !== 'all') usp.set('action', params.action);
  if (params.from) usp.set('from', params.from);
  if (params.to) usp.set('to', params.to);
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
};

export async function fetchAuditLogs(
  apiBase: string,
  token: string | null,
  params: AuditLogListParams = {},
): Promise<AuditLogListResponse> {
  if (!apiBase) {
    return { items: [], total: 0, page: 1, pageSize: params.pageSize || 20, hasMore: false };
  }
  const res = await fetch(`${apiBase}${API_PATH}${buildQuery(params)}`, {
    headers: buildHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await parseError(res, `שגיאה בטעינה (${res.status})`));
  }
  const data = await res.json().catch(() => null);
  if (!data || !Array.isArray(data.items)) {
    return { items: [], total: 0, page: params.page || 1, pageSize: params.pageSize || 20, hasMore: false };
  }
  return {
    items: data.items.map((row: Record<string, unknown>) => normalizeRow(row)),
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    pageSize: Number(data.pageSize ?? 20),
    hasMore: Boolean(data.hasMore),
  };
}

const buildEntityQuery = (params?: { page?: number; pageSize?: number }): string => {
  const usp = new URLSearchParams();
  if (params?.page) usp.set('page', String(params.page));
  if (params?.pageSize) usp.set('pageSize', String(params.pageSize));
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
};

/**
 * All audit log rows for one Client / Candidate / Job (entity-scoped).
 */
export async function fetchAuditLogsByEntity(
  apiBase: string,
  token: string | null,
  kind: AuditEntityKind,
  entityId: string,
  params?: { page?: number; pageSize?: number },
): Promise<AuditLogsByEntityResponse> {
  const id = String(entityId || '').trim();
  if (!apiBase || !id) {
    return {
      type: kind,
      entityType: '',
      entityId: id,
      items: [],
      total: 0,
      page: 1,
      pageSize: params?.pageSize ?? 500,
      hasMore: false,
    };
  }
  const path = `${API_PATH}/by-entity/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${buildEntityQuery(params)}`;
  const res = await fetch(`${apiBase}${path}`, {
    headers: buildHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await parseError(res, `שגיאה בטעינת יומן ביקורת (${res.status})`));
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || !Array.isArray(data.items)) {
    return {
      type: String(data?.type ?? kind),
      entityType: String(data?.entityType ?? ''),
      entityId: String(data?.entityId ?? id),
      items: [],
      total: 0,
      page: Number(data?.page ?? 1),
      pageSize: Number(data?.pageSize ?? 500),
      hasMore: false,
    };
  }
  return {
    type: String(data.type ?? kind),
    entityType: String(data.entityType ?? ''),
    entityId: String(data.entityId ?? id),
    items: (data.items as Record<string, unknown>[]).map((row) => normalizeRow(row)),
    total: Number(data.total ?? 0),
    page: Number(data.page ?? 1),
    pageSize: Number(data.pageSize ?? 500),
    hasMore: Boolean(data.hasMore),
  };
}

export async function fetchAuditLogStats(apiBase: string, token: string | null): Promise<AuditLogStats> {
  if (!apiBase) return { eventsToday: 0, errors24h: 0, activeUsers: 0 };
  const res = await fetch(`${apiBase}${API_PATH}/stats`, {
    headers: buildHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await parseError(res, `שגיאה בטעינת סטטיסטיקות (${res.status})`));
  }
  const data = (await res.json().catch(() => ({}))) as Partial<AuditLogStats>;
  return {
    eventsToday: Number(data.eventsToday ?? 0),
    errors24h: Number(data.errors24h ?? 0),
    activeUsers: Number(data.activeUsers ?? 0),
  };
}

export async function deleteAuditLog(apiBase: string, token: string | null, id: string): Promise<void> {
  const res = await fetch(`${apiBase}${API_PATH}/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res, 'מחיקה נכשלה.'));
  }
}
