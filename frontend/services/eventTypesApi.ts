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

export async function fetchEventTypes(apiBase: string, token: string | null): Promise<EventTypeApiRow[]> {
  if (!apiBase) return [];
  const res = await fetch(`${apiBase}/api/event-types`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    isActive: Boolean(r.isActive),
    name: String(r.name ?? ''),
    textColor: String(r.textColor ?? '#000000'),
    bgColor: String(r.bgColor ?? '#ffffff'),
    forCandidate: Boolean(r.forCandidate),
    forJob: Boolean(r.forJob),
    forClient: Boolean(r.forClient),
    forFlight: Boolean(r.forFlight),
  }));
}
