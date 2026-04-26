export type ReferenceInfoEntry = {
  id: string;
  key: string;
  value: string;
  description: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ReferenceInfoInput = {
  key: string;
  value: string;
  description: string;
  sortOrder?: number;
};

const API_PATH = '/api/reference-info';

const buildHeaders = (token: string | null, json = false): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (json) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

const normalize = (raw: Record<string, unknown>): ReferenceInfoEntry => ({
  id: String(raw.id ?? ''),
  key: String(raw.key ?? ''),
  value: String(raw.value ?? ''),
  description: String(raw.description ?? ''),
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

export async function fetchReferenceInfo(apiBase: string, token: string | null): Promise<ReferenceInfoEntry[]> {
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

export async function createReferenceInfo(
  apiBase: string,
  token: string | null,
  payload: ReferenceInfoInput,
): Promise<ReferenceInfoEntry> {
  const res = await fetch(`${apiBase}${API_PATH}`, {
    method: 'POST',
    headers: buildHeaders(token, true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, 'לא ניתן ליצור רשומה חדשה.'));
  }
  const data = await res.json();
  return normalize(data as Record<string, unknown>);
}

export async function updateReferenceInfo(
  apiBase: string,
  token: string | null,
  id: string,
  payload: Partial<ReferenceInfoInput>,
): Promise<ReferenceInfoEntry> {
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

export async function deleteReferenceInfo(apiBase: string, token: string | null, id: string): Promise<void> {
  const res = await fetch(`${apiBase}${API_PATH}/${id}`, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(await parseError(res, 'המחיקה נכשלה.'));
  }
}
