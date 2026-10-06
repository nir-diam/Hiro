export type EventTypeApiRow = {
  id: string;
  isActive: boolean;
  name: string;
  textColor: string;
  bgColor: string;
  forCandidate: boolean;
  forJob: boolean;
  forClient: boolean;
  forFlight: boolean;
};

export type EventTypeContext = 'candidate' | 'client' | 'job' | 'flight';

/** Built-in labels when API is empty or unavailable (manual events). */
export const LEGACY_MANUAL_EVENT_TYPE_NAMES = ['פגישה', 'ראיון', 'תזכורת', 'משימת מערכת'] as const;

export function filterEventTypesForContext(rows: EventTypeApiRow[], context: EventTypeContext): EventTypeApiRow[] {
  return rows.filter((r) => {
    if (!r.isActive) return false;
    if (context === 'candidate') return r.forCandidate;
    if (context === 'client') return r.forClient;
    if (context === 'flight') return r.forFlight;
    return r.forJob;
  });
}

function mapEventTypeRow(r: Record<string, unknown>): EventTypeApiRow {
  return {
    id: String(r.id),
    isActive: Boolean(r.isActive),
    name: String(r.name ?? ''),
    textColor: String(r.textColor ?? '#000000'),
    bgColor: String(r.bgColor ?? '#ffffff'),
    forCandidate: Boolean(r.forCandidate),
    forJob: Boolean(r.forJob),
    forClient: Boolean(r.forClient),
    forFlight: Boolean(r.forFlight),
  };
}

function eventTypeAuthHeaders(token: string | null): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchEventTypes(apiBase: string, token: string | null): Promise<EventTypeApiRow[]> {
  if (!apiBase) return [];
  const res = await fetch(`${apiBase}/api/event-types`, {
    headers: eventTypeAuthHeaders(token),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map((r) => mapEventTypeRow(r as Record<string, unknown>));
}

export async function createEventType(
  apiBase: string,
  token: string | null,
  payload: {
    name: string;
    isActive?: boolean;
    textColor?: string;
    bgColor?: string;
    forCandidate?: boolean;
    forJob?: boolean;
    forClient?: boolean;
    forFlight?: boolean;
  },
): Promise<EventTypeApiRow> {
  const res = await fetch(`${apiBase}/api/event-types`, {
    method: 'POST',
    headers: eventTypeAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'יצירת קטגוריה נכשלה');
  }
  return mapEventTypeRow(data as Record<string, unknown>);
}

export async function updateEventType(
  apiBase: string,
  token: string | null,
  id: string,
  payload: Partial<Omit<EventTypeApiRow, 'id'>>,
): Promise<EventTypeApiRow> {
  const res = await fetch(`${apiBase}/api/event-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: eventTypeAuthHeaders(token),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.message === 'string' ? data.message : 'עדכון קטגוריה נכשל');
  }
  return mapEventTypeRow(data as Record<string, unknown>);
}

export async function deleteEventType(
  apiBase: string,
  token: string | null,
  id: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/event-types/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: eventTypeAuthHeaders(token),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data?.message === 'string' ? data.message : 'מחיקת קטגוריה נכשלה');
  }
}
