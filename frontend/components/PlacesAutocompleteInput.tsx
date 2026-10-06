import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMapsPlaces, resolvePlacesAutocompleteCtor } from '../utils/googleMapsLoader';

export type PlacesSelection = {
    address: string;
    latitude: number;
    longitude: number;
};

type PlacesAutocompleteInputProps = {
    value: string;
    onChange: (value: string) => void;
    onPlaceSelect: (selection: PlacesSelection) => void;
    onBlur?: () => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
};

const PlacesAutocompleteInput: React.FC<PlacesAutocompleteInputProps> = ({
    value,
    onChange,
    onPlaceSelect,
    onBlur,
    placeholder,
    disabled = false,
    className = '',
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const onChangeRef = useRef(onChange);
    const onPlaceSelectRef = useRef(onPlaceSelect);
    const onBlurRef = useRef(onBlur);
    const selectingRef = useRef(false);
    const pendingBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
    const [mapsReady, setMapsReady] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null);

    onChangeRef.current = onChange;
    onPlaceSelectRef.current = onPlaceSelect;
    onBlurRef.current = onBlur;

    useEffect(() => {
        if (!apiKey || disabled || !inputRef.current) {
            setMapsReady(false);
            return;
        }

        let cancelled = false;
        let placeListener: { remove: () => void } | null = null;

        setLoadFailed(false);
        setLoadErrorDetail(null);
        setMapsReady(false);

        void loadGoogleMapsPlaces(apiKey)
            .then(({ places }) => {
                const AutocompleteCtor = resolvePlacesAutocompleteCtor(places);
                if (cancelled || !inputRef.current || !AutocompleteCtor) {
                    if (!cancelled && !AutocompleteCtor) {
                        setLoadFailed(true);
                        setLoadErrorDetail('google_maps_places_unavailable');
                    }
                    return;
                }

                const autocomplete = new AutocompleteCtor(inputRef.current, {
                    fields: ['formatted_address', 'geometry', 'name'],
                    componentRestrictions: { country: 'il' },
                });

                placeListener = autocomplete.addListener('place_changed', () => {
                    selectingRef.current = true;
                    if (pendingBlurTimerRef.current != null) {
                        clearTimeout(pendingBlurTimerRef.current);
                        pendingBlurTimerRef.current = null;
                    }

                    const place = autocomplete.getPlace();
                    const address = String(
                        place.formatted_address || place.name || inputRef.current?.value || '',
                    ).trim();
                    const lat = place.geometry?.location?.lat();
                    const lng = place.geometry?.location?.lng();

                    if (address && Number.isFinite(lat) && Number.isFinite(lng)) {
                        onPlaceSelectRef.current({
                            address,
                            latitude: lat as number,
                            longitude: lng as number,
                        });
                    } else if (address) {
                        onChangeRef.current(address);
                    }

                    window.setTimeout(() => {
                        selectingRef.current = false;
                    }, 300);
                });

                setMapsReady(true);
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setLoadFailed(true);
                    setLoadErrorDetail(err instanceof Error ? err.message : 'google_maps_load_failed');
                    console.error('[PlacesAutocompleteInput]', err);
                }
            });

        return () => {
            cancelled = true;
            placeListener?.remove();
            if (pendingBlurTimerRef.current != null) {
                clearTimeout(pendingBlurTimerRef.current);
                pendingBlurTimerRef.current = null;
            }
            setMapsReady(false);
        };
    }, [apiKey, disabled]);

    const handleBlur = () => {
        if (selectingRef.current) return;
        if (pendingBlurTimerRef.current != null) {
            clearTimeout(pendingBlurTimerRef.current);
        }
        pendingBlurTimerRef.current = setTimeout(() => {
            pendingBlurTimerRef.current = null;
            if (!selectingRef.current) onBlurRef.current?.();
        }, 250);
    };

    return (
        <div className="space-y-1" data-places-autocomplete-root>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onBlur={handleBlur}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                autoComplete="off"
            />
            {apiKey && !mapsReady && !loadFailed ? (
                <p className="text-xs text-text-muted">טוען השלמה אוטומטית…</p>
            ) : null}
            {!apiKey ? (
                <p className="text-xs text-amber-700">חסר VITE_GOOGLE_MAPS_API_KEY — השלמה אוטומטית כבויה.</p>
            ) : null}
            {loadFailed ? (
                <div className="text-xs text-amber-800 space-y-1 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                    <p className="font-semibold">
                        לא ניתן לטעון Google Places בדפדפן (Geocoding ב-curl יכול לעבוד בנפרד).
                    </p>
                    <p>
                        ב-Google Cloud → Library: הפעילו <strong>Maps JavaScript API</strong> ו-<strong>Places API</strong>.
                        ב-Credentials → מפתח הדפדפן: הוסיפו referrer כמו <code dir="ltr">http://localhost:5173/*</code>.
                    </p>
                    {loadErrorDetail ? (
                        <p dir="ltr" className="text-[11px] text-amber-900/80 font-mono break-all">
                            {loadErrorDetail}
                        </p>
                    ) : null}
                    <p className="text-[11px]">פתחו Console (F12) וחפשו RefererNotAllowedMapError / ApiNotActivatedMapError.</p>
                </div>
            ) : null}
        </div>
    );
};

export default PlacesAutocompleteInput;
