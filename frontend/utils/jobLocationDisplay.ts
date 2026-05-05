import type { LocationItem } from '../components/LocationSelector';

/** Split persisted job.location / city lists (same delimiter as NewJobView LOCATION_SEP). */
export const JOB_LOCATION_SPLIT_RE = /,\s*/;

export function splitJobLocationString(loc: string | null | undefined): string[] {
  if (!loc || !String(loc).trim()) return [];
  return String(loc)
    .split(JOB_LOCATION_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type JobLocationDisplayModel =
  | { kind: 'empty' }
  | { kind: 'inline'; cities: string[] }
  | { kind: 'compact'; firstCity: string; extraCount: number; cities: string[] }
  | { kind: 'radius'; center: string; km: number; cities: string[] };

const INLINE_MAX = 4;

/**
 * Build a compact summary for job cards (Studio-style when `locations` includes a radius row).
 */
export function buildJobLocationDisplayModel(raw: {
  location?: string | null;
  city?: string | null;
  locations?: LocationItem[] | null;
}): JobLocationDisplayModel {
  const locationsArr = Array.isArray(raw.locations) ? raw.locations : null;

  let radiusItem: LocationItem | undefined;
  const citiesFromJson: string[] = [];
  if (locationsArr?.length) {
    radiusItem = locationsArr.find((l) => l.type === 'radius');
    for (const l of locationsArr) {
      if (l.type === 'city' && l.value?.trim()) citiesFromJson.push(l.value.trim());
    }
  }

  const fromString = splitJobLocationString(raw.location || raw.city || '');
  const cities = citiesFromJson.length ? citiesFromJson : fromString;

  if (radiusItem?.value?.trim()) {
    const center = radiusItem.value.trim();
    const km =
      typeof radiusItem.radius === 'number' && Number.isFinite(radiusItem.radius)
        ? radiusItem.radius
        : 20;
    return { kind: 'radius', center, km, cities };
  }

  if (cities.length === 0) return { kind: 'empty' };
  if (cities.length <= INLINE_MAX) return { kind: 'inline', cities };
  return {
    kind: 'compact',
    firstCity: cities[0],
    extraCount: cities.length - 1,
    cities,
  };
}
