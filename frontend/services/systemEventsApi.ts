export type SystemEventApiRow = {
  id: string;
  isActive: boolean;
  triggerName: string;
  eventName: string;
  contentTemplate: string;
  forCandidate: boolean;
  forJob: boolean;
  forClient: boolean;
  textColor: string;
  bgColor: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SystemEventInput = {
  isActive?: boolean;
  triggerName: string;
  eventName: string;
  contentTemplate?: string;
  forCandidate?: boolean;
  forJob?: boolean;
  forClient?: boolean;
  textColor?: string;
  bgColor?: string;
  sortOrder?: number;
};

const API_PATH = '/api/system-events';

const buildHeaders = (token: string | null, json = false): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const normalize = (raw: Record<string, unknown>): SystemEventApiRow => ({
  id: String(raw.id ?? ''),
  isActive: Boolean(raw.isActive),
  triggerName: String(raw.triggerName ?? ''),
  eventName: String(raw.eventName ?? ''),
  contentTemplate: String(raw.contentTemplate ?? ''),
  forCandidate: Boolean(raw.forCandidate),
  forJob: Boolean(raw.forJob),
  forClient: Boolean(raw.forClient),
  textColor: String(raw.textColor ?? '#000000'),
  bgColor: String(raw.bgColor ?? '#ffffff'),
  sortOrder: Number(raw.sortOrder ?? 0),
  createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
  updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
});

const parseError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // ignore
  }
  return fallback;
};

export async function fetchSystemEvents(apiBase: string, token: string | null): Promise<SystemEventApiRow[]> {
  if (!apiBase) return [];
  const res = await fetch(`${apiBase}${API_PATH}`, {
    headers: buildHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await parseError(res, `שגיאה בטעינה (${res.status})`));
  }
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map((row) => normalize(row as Record<string, unknown>));
}

export async function createSystemEvent(
  apiBase: string,
  token: string | null,
  payload: SystemEventInput,
): Promise<SystemEventApiRow> {
  const res = await fetch(`${apiBase}${API_PATH}`, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'יצירת אירוע מערכת חדש נכשלה.'));
  }
  const data = await res.json();
  return normalize(data as Record<string, unknown>);
}

export async function updateSystemEvent(
  apiBase: string,
  token: string | null,
  id: string,
  payload: Partial<SystemEventInput>,
): Promise<SystemEventApiRow> {
  const res = await fetch(`${apiBase}${API_PATH}/${id}`, {
    method: 'PUT',
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'העדכון נכשל.'));
  }
  const data = await res.json();
  return normalize(data as Record<string, unknown>);
}

export async function deleteSystemEvent(apiBase: string, token: string | null, id: string): Promise<void> {
  const res = await fetch(`${apiBase}${API_PATH}/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res, 'המחיקה נכשלה.'));
  }
}
