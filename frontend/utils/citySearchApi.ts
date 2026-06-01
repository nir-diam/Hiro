export type CitySearchRow = {
    id?: number;
    cityName?: string;
    city?: string;
    column4?: string;
    region?: string;
};

export type CitySearchOption = {
    id: number;
    name: string;
    region: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export function cityNameFromRow(row: CitySearchRow): string {
    return (row.cityName || row.city || '').trim();
}

export function regionFromRow(row: CitySearchRow): string {
    return (row.column4 || row.region || 'ערים').trim() || 'ערים';
}

/** Flat city options from `/api/cities` (deduped by id). */
export async function fetchCitySearchOptions(search: string): Promise<CitySearchOption[]> {
    const q = String(search || '').trim();
    if (q.length < 2) return [];

    const url = `${API_BASE}/api/cities?search=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as CitySearchRow[];
    if (!Array.isArray(data)) return [];

    const byId = new Map<number, CitySearchOption>();
    for (const row of data) {
        const id = row.id != null ? Number(row.id) : NaN;
        if (!Number.isFinite(id)) continue;
        const name = cityNameFromRow(row);
        if (!name) continue;
        if (!byId.has(id)) {
            byId.set(id, { id, name, region: regionFromRow(row) });
        }
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

/** Exact city name in DB (case-insensitive). */
export async function resolveExactCityName(name: string): Promise<string | null> {
    const q = String(name || '').trim();
    if (!q) return null;
    const url = `${API_BASE}/api/cities/resolve?city=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string };
    const city = typeof data?.city === 'string' ? data.city.trim() : '';
    return city || null;
}

/** Resolve by cities.id — used when user picks from search dropdown. */
export async function resolveCityById(id: number): Promise<string | null> {
    if (!Number.isFinite(id) || id <= 0) return null;
    const url = `${API_BASE}/api/cities/resolve?id=${encodeURIComponent(String(id))}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { city?: string };
    const city = typeof data?.city === 'string' ? data.city.trim() : '';
    return city || null;
}

/** Display city from candidate record (address + location kept in sync). */
export function candidateCityDisplay(data: { address?: string | null; location?: string | null }): string {
    return String(data.address ?? data.location ?? '').trim();
}

export function candidateCityPatch(city: string): { address: string; location: string } {
    const v = String(city ?? '').trim();
    return { address: v, location: v };
}
