export type GooglePlaceAutocomplete = {
    getPlace: () => {
        formatted_address?: string;
        name?: string;
        geometry?: { location?: { lat: () => number; lng: () => number } };
    };
    addListener: (event: 'place_changed', handler: () => void) => { remove: () => void };
};

export type GooglePlacesLibrary = {
    PlaceAutocompleteElement?: new (options?: {
        includedRegionCodes?: string[];
        componentRestrictions?: { country: string | string[] };
    }) => HTMLElement;
    Autocomplete: new (
        input: HTMLInputElement,
        options?: {
            fields?: string[];
            componentRestrictions?: { country: string | string[] };
            includedRegionCodes?: string[];
        },
    ) => GooglePlaceAutocomplete;
};

type GoogleMapsBootstrap = {
    maps: {
        importLibrary: (name: string) => Promise<GooglePlacesLibrary>;
    };
};

declare global {
    interface Window {
        google?: GoogleMapsBootstrap & {
            maps?: GoogleMapsBootstrap['maps'] & {
                places?: {
                    Autocomplete?: GooglePlacesLibrary['Autocomplete'];
                };
            };
        };
    }
}

export function resolvePlacesAutocompleteCtor(
    places: GooglePlacesLibrary,
): GooglePlacesLibrary['Autocomplete'] | null {
    if (places?.Autocomplete) return places.Autocomplete;
    const legacy = window.google?.maps?.places?.Autocomplete;
    return legacy ?? null;
}

let loadPromise: Promise<{ places: GooglePlacesLibrary }> | null = null;

const MAPS_BOOTSTRAP_TIMEOUT_MS = 15000;

function hasImportLibrary(): boolean {
    return typeof window.google?.maps?.importLibrary === 'function';
}

function hasLegacyPlacesAutocomplete(): boolean {
    return typeof window.google?.maps?.places?.Autocomplete === 'function';
}

/** With loading=async, script onload fires before importLibrary exists — poll until ready. */
function waitForMapsBootstrap(timeoutMs = MAPS_BOOTSTRAP_TIMEOUT_MS): Promise<void> {
    if (hasImportLibrary() || hasLegacyPlacesAutocomplete()) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            if (hasImportLibrary() || hasLegacyPlacesAutocomplete()) {
                resolve();
                return;
            }
            if (Date.now() - started >= timeoutMs) {
                reject(new Error('google_maps_import_unavailable'));
                return;
            }
            window.setTimeout(tick, 50);
        };
        tick();
    });
}

function appendMapsScript(key: string): Promise<void> {
    const existing = document.querySelector('script[data-hiro-google-maps]') as HTMLScriptElement | null;
    if (existing) {
        // Script may already be loaded; importLibrary appears slightly after onload with loading=async.
        return waitForMapsBootstrap();
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.dataset.hiroGoogleMaps = '1';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&language=he&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            waitForMapsBootstrap().then(resolve).catch(reject);
        };
        script.onerror = () => reject(new Error('google_maps_script_failed'));
        document.head.appendChild(script);
    });
}

async function loadPlacesLibraryFromBootstrap(): Promise<GooglePlacesLibrary> {
    if (hasImportLibrary()) {
        return (await window.google!.maps.importLibrary('places')) as GooglePlacesLibrary;
    }
    if (hasLegacyPlacesAutocomplete()) {
        return { Autocomplete: window.google!.maps!.places!.Autocomplete! };
    }
    throw new Error('google_maps_places_unavailable');
}

async function bootstrapPlacesLibrary(key: string): Promise<{ places: GooglePlacesLibrary }> {
    if (hasImportLibrary() || hasLegacyPlacesAutocomplete()) {
        const places = await loadPlacesLibraryFromBootstrap();
        if (!resolvePlacesAutocompleteCtor(places) && !places?.PlaceAutocompleteElement) {
            throw new Error('google_maps_places_unavailable');
        }
        return { places };
    }

    await appendMapsScript(key);
    const places = await loadPlacesLibraryFromBootstrap();
    if (!resolvePlacesAutocompleteCtor(places) && !places?.PlaceAutocompleteElement) {
        throw new Error('google_maps_places_unavailable');
    }
    return { places };
}

export function loadGoogleMapsPlaces(apiKey: string): Promise<{ places: GooglePlacesLibrary }> {
    const key = String(apiKey || '').trim();
    if (!key) return Promise.reject(new Error('missing_google_maps_api_key'));
    if (loadPromise) return loadPromise;

    loadPromise = bootstrapPlacesLibrary(key).catch((err) => {
        loadPromise = null;
        throw err;
    });

    return loadPromise;
}

export type GeocodedAddress = {
    latitude: number;
    longitude: number;
    formattedAddress: string;
};

/** Resolve coordinates for a free-text address (Israel-biased). Requires Maps JS + Geocoding API. */
export async function geocodeAddress(apiKey: string, address: string): Promise<GeocodedAddress | null> {
    const query = String(address || '').trim();
    if (!query) return null;
    await loadGoogleMapsPlaces(apiKey);

    if (hasImportLibrary()) {
        type GeocoderResult = {
            formatted_address?: string;
            geometry?: { location?: { lat: () => number; lng: () => number } };
        };
        type GeocoderLibrary = {
            Geocoder: new () => {
                geocode: (req: { address: string; region?: string }) => Promise<{ results: GeocoderResult[] }>;
            };
        };

        const { Geocoder } = (await window.google!.maps.importLibrary('geocoding')) as GeocoderLibrary;
        const geocoder = new Geocoder();
        const { results } = await geocoder.geocode({ address: query, region: 'il' });
        const top = Array.isArray(results) ? results[0] : null;
        const lat = top?.geometry?.location?.lat?.();
        const lng = top?.geometry?.location?.lng?.();
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
            latitude: lat as number,
            longitude: lng as number,
            formattedAddress: String(top?.formatted_address || query).trim(),
        };
    }

    // Legacy Geocoder when importLibrary is unavailable
    type LegacyGeocoder = {
        geocode: (
            req: { address: string; region?: string },
            cb: (results: Array<{ formatted_address?: string; geometry?: { location?: { lat: () => number; lng: () => number } } }> | null, status: string) => void,
        ) => void;
    };
    const legacyGeocoder = new (window.google!.maps as unknown as { Geocoder: new () => LegacyGeocoder }).Geocoder();
    return new Promise((resolve) => {
        legacyGeocoder.geocode({ address: query, region: 'il' }, (results, status) => {
            if (status !== 'OK' || !results?.[0]) {
                resolve(null);
                return;
            }
            const top = results[0];
            const lat = top.geometry?.location?.lat?.();
            const lng = top.geometry?.location?.lng?.();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                resolve(null);
                return;
            }
            resolve({
                latitude: lat as number,
                longitude: lng as number,
                formattedAddress: String(top.formatted_address || query).trim(),
            });
        });
    });
}
