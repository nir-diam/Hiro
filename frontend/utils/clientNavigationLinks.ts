export const INTERVIEW_ARRIVAL_META_KEY = 'interviewArrival';

export type InterviewArrival = {
    address: string;
    latitude: number | null;
    longitude: number | null;
    wazeLinkOverride: string;
    googleMapsLinkOverride: string;
};

export function readInterviewArrival(metadata: unknown): InterviewArrival {
    const meta = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
    const raw = meta[INTERVIEW_ARRIVAL_META_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
            address: '',
            latitude: null,
            longitude: null,
            wazeLinkOverride: '',
            googleMapsLinkOverride: '',
        };
    }
    const row = raw as Record<string, unknown>;
    const lat = row.latitude != null ? Number(row.latitude) : null;
    const lng = row.longitude != null ? Number(row.longitude) : null;
    const latitude = Number.isFinite(lat) ? lat : null;
    const longitude = Number.isFinite(lng) ? lng : null;
    let wazeLinkOverride = String(row.wazeLinkOverride || '').trim();
    let googleMapsLinkOverride = String(row.googleMapsLinkOverride || '').trim();
    if (latitude != null && longitude != null) {
        if (!wazeLinkOverride) wazeLinkOverride = buildWazeLink(latitude, longitude);
        if (!googleMapsLinkOverride) googleMapsLinkOverride = buildGoogleMapsLink(latitude, longitude);
    }
    return {
        address: String(row.address || '').trim(),
        latitude,
        longitude,
        wazeLinkOverride,
        googleMapsLinkOverride,
    };
}

export function buildWazeLink(latitude: number, longitude: number): string {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
    return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
}

export function buildGoogleMapsLink(latitude: number, longitude: number): string {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
}

/** Navigation links from address text when coordinates are not available yet. */
export function buildWazeLinkFromAddress(address: string): string {
    const q = String(address || '').trim();
    if (!q) return '';
    return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

export function buildGoogleMapsLinkFromAddress(address: string): string {
    const q = String(address || '').trim();
    if (!q) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function applyNavigationLinksToDraft(
    draft: InterviewArrival,
    address: string,
    latitude: number | null,
    longitude: number | null,
): InterviewArrival {
    const trimmed = String(address || '').trim();
    if (latitude != null && longitude != null && Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
            ...draft,
            address: trimmed,
            latitude,
            longitude,
            wazeLinkOverride: buildWazeLink(latitude, longitude),
            googleMapsLinkOverride: buildGoogleMapsLink(latitude, longitude),
        };
    }
    return {
        ...draft,
        address: trimmed,
        latitude: null,
        longitude: null,
        wazeLinkOverride: buildWazeLinkFromAddress(trimmed),
        googleMapsLinkOverride: buildGoogleMapsLinkFromAddress(trimmed),
    };
}

export function buildInterviewArrivalFromPlace(
    address: string,
    latitude: number,
    longitude: number,
): InterviewArrival {
    return {
        address: String(address || '').trim(),
        latitude,
        longitude,
        wazeLinkOverride: buildWazeLink(latitude, longitude),
        googleMapsLinkOverride: buildGoogleMapsLink(latitude, longitude),
    };
}

export function resolveWazeLink(arrival: InterviewArrival): string {
    if (arrival.wazeLinkOverride) return arrival.wazeLinkOverride;
    if (arrival.latitude == null || arrival.longitude == null) return '';
    return buildWazeLink(arrival.latitude, arrival.longitude);
}

export function resolveGoogleMapsLink(arrival: InterviewArrival): string {
    if (arrival.googleMapsLinkOverride) return arrival.googleMapsLinkOverride;
    if (arrival.latitude == null || arrival.longitude == null) return '';
    return buildGoogleMapsLink(arrival.latitude, arrival.longitude);
}

export function navigationPlaceholdersFromMetadata(metadata: unknown): { waze_link: string; google_maps_link: string } {
    const arrival = readInterviewArrival(metadata);
    return {
        waze_link: resolveWazeLink(arrival),
        google_maps_link: resolveGoogleMapsLink(arrival),
    };
}
