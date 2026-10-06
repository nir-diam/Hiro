import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinkIcon, MapPinIcon } from './Icons';
import AccordionSection from './AccordionSection';
import PlacesAutocompleteInput from './PlacesAutocompleteInput';
import { useLanguage } from '../context/LanguageContext';
import { authHeaders } from '../utils/authHeaders';
import {
    INTERVIEW_ARRIVAL_META_KEY,
    applyNavigationLinksToDraft,
    buildInterviewArrivalFromPlace,
    readInterviewArrival,
    resolveGoogleMapsLink,
    resolveWazeLink,
    type InterviewArrival,
} from '../utils/clientNavigationLinks';
import { geocodeAddress } from '../utils/googleMapsLoader';

type ClientInterviewArrivalCardProps = {
    clientId?: string;
    clientMetadata?: Record<string, unknown>;
    onMetadataUpdated?: (metadata: Record<string, unknown>) => void;
};

const ClientInterviewArrivalCard: React.FC<ClientInterviewArrivalCardProps> = ({
    clientId,
    clientMetadata: clientMetadataProp,
    onMetadataUpdated,
}) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [clientMetadata, setClientMetadata] = useState<Record<string, unknown>>({});
    const [draft, setDraft] = useState<InterviewArrival>(readInterviewArrival(null));
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const clientMetadataRef = useRef(clientMetadata);
    clientMetadataRef.current = clientMetadata;
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const skipNextAddressBlurRef = useRef(false);

    const wazeLink = useMemo(() => resolveWazeLink(draft), [draft]);
    const googleMapsLink = useMemo(() => resolveGoogleMapsLink(draft), [draft]);

    const applyMetadata = useCallback((meta: Record<string, unknown>) => {
        setClientMetadata(meta);
        setDraft(readInterviewArrival(meta));
    }, []);

    const load = useCallback(async () => {
        if (!apiBase || !clientId) {
            applyMetadata({});
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, {
                headers: authHeaders(true),
            });
            if (!res.ok) throw new Error('load_failed');
            const data = await res.json();
            const meta = data?.metadata && typeof data.metadata === 'object' ? data.metadata : {};
            applyMetadata(meta);
        } catch {
            setError(t('client_profile.interview_arrival_load_error'));
        } finally {
            setLoading(false);
        }
    }, [apiBase, clientId, applyMetadata, t]);

    useEffect(() => {
        if (clientMetadataProp && typeof clientMetadataProp === 'object') {
            applyMetadata(clientMetadataProp);
            setLoading(false);
            setError(null);
            return;
        }
        void load();
    }, [load, clientMetadataProp, applyMetadata]);

    const persist = useCallback(async (nextDraft: InterviewArrival) => {
        if (!apiBase || !clientId) return;
        setSaving(true);
        setError(null);
        setSaved(false);
        try {
            const nextMetadata = {
                ...clientMetadataRef.current,
                [INTERVIEW_ARRIVAL_META_KEY]: {
                    address: nextDraft.address.trim(),
                    latitude: nextDraft.latitude,
                    longitude: nextDraft.longitude,
                    wazeLinkOverride: nextDraft.wazeLinkOverride.trim() || null,
                    googleMapsLinkOverride: nextDraft.googleMapsLinkOverride.trim() || null,
                },
            };
            const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify({ metadata: nextMetadata }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(typeof body?.message === 'string' ? body.message : 'save_failed');
            }
            const updated = await res.json();
            const meta = updated?.metadata && typeof updated.metadata === 'object' ? updated.metadata : nextMetadata;
            applyMetadata(meta);
            onMetadataUpdated?.(meta);
            setSaved(true);
        } catch (e: unknown) {
            setError((e as Error)?.message || t('client_profile.interview_arrival_save_error'));
        } finally {
            setSaving(false);
        }
    }, [apiBase, clientId, applyMetadata, onMetadataUpdated, t]);

    const handlePlaceSelect = useCallback((sel: { address: string; latitude: number; longitude: number }) => {
        skipNextAddressBlurRef.current = true;
        const next = buildInterviewArrivalFromPlace(sel.address, sel.latitude, sel.longitude);
        setDraft(next);
        setError(null);
        setSaved(false);
        void persist(next);
    }, [persist]);

    const handleAddressBlur = useCallback(async () => {
        if (skipNextAddressBlurRef.current) {
            skipNextAddressBlurRef.current = false;
            return;
        }
        const current = draftRef.current;
        const address = current.address.trim();
        if (!address) return;

        setError(null);
        setSaved(false);

        const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
        if (apiKey) {
            try {
                const hit = await geocodeAddress(apiKey, address);
                if (hit) {
                    setDraft((prev) => applyNavigationLinksToDraft(
                        prev,
                        hit.formattedAddress,
                        hit.latitude,
                        hit.longitude,
                    ));
                    return;
                }
            } catch {
                /* fall back to query-based links */
            }
        }

        setDraft((prev) => applyNavigationLinksToDraft(prev, address, null, null));
    }, []);

    const handleSave = () => {
        if (!draft.address.trim()) {
            setError(t('client_profile.interview_arrival_validation_address'));
            return;
        }
        if (!resolveWazeLink(draft) && !resolveGoogleMapsLink(draft)) {
            setError(t('client_profile.interview_arrival_validation_coords'));
            return;
        }
        void persist(draft);
    };

    if (!clientId) {
        return (
            <AccordionSection
                title={t('client_profile.section_interview_arrival')}
                icon={<MapPinIcon className="w-5 h-5" />}
                defaultOpen
            >
                <p className="text-sm text-text-muted">{t('client_profile.interview_arrival_no_client')}</p>
            </AccordionSection>
        );
    }

    return (
        <AccordionSection
            title={t('client_profile.section_interview_arrival')}
            icon={<MapPinIcon className="w-5 h-5" />}
            defaultOpen
        >
            <div className="space-y-4 text-sm">
                <p className="text-text-muted leading-relaxed">{t('client_profile.interview_arrival_hint')}</p>

                {error ? (
                    <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-700">{error}</div>
                ) : null}
                {saved ? (
                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800 font-semibold">
                        {t('client_profile.interview_arrival_saved')}
                    </div>
                ) : null}

                {loading ? (
                    <p className="text-text-muted">{t('client_profile.interview_arrival_loading')}</p>
                ) : (
                    <div className="rounded-xl border border-border-default bg-bg-subtle/30 p-4 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">
                                {t('client_profile.interview_arrival_address')}
                            </label>
                            <PlacesAutocompleteInput
                                value={draft.address}
                                onChange={(address) => setDraft((prev) => ({
                                    ...prev,
                                    address,
                                    latitude: null,
                                    longitude: null,
                                    wazeLinkOverride: '',
                                    googleMapsLinkOverride: '',
                                }))}
                                onPlaceSelect={handlePlaceSelect}
                                onBlur={() => { void handleAddressBlur(); }}
                                placeholder={t('client_profile.interview_arrival_address_placeholder')}
                                disabled={saving}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                            />
                            {draft.latitude != null && draft.longitude != null ? (
                                <p className="text-xs text-text-muted mt-1" dir="ltr">
                                    {draft.latitude.toFixed(6)}, {draft.longitude.toFixed(6)}
                                </p>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">
                                    {t('client_profile.interview_arrival_waze_override')}
                                </label>
                                <input
                                    type="url"
                                    value={draft.wazeLinkOverride || wazeLink}
                                    onChange={(e) => setDraft((prev) => ({ ...prev, wazeLinkOverride: e.target.value }))}
                                    placeholder="https://waze.com/ul?..."
                                    dir="ltr"
                                    disabled={saving}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">
                                    {t('client_profile.interview_arrival_maps_override')}
                                </label>
                                <input
                                    type="url"
                                    value={draft.googleMapsLinkOverride || googleMapsLink}
                                    onChange={(e) => setDraft((prev) => ({ ...prev, googleMapsLinkOverride: e.target.value }))}
                                    placeholder="https://www.google.com/maps/..."
                                    dir="ltr"
                                    disabled={saving}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {wazeLink ? (
                                <a
                                    href={wazeLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-bold text-primary-600 hover:bg-primary-50"
                                >
                                    <LinkIcon className="w-4 h-4" />
                                    {t('client_profile.interview_arrival_test_waze')}
                                </a>
                            ) : null}
                            {googleMapsLink ? (
                                <a
                                    href={googleMapsLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-card px-3 py-2 text-xs font-bold text-primary-600 hover:bg-primary-50"
                                >
                                    <LinkIcon className="w-4 h-4" />
                                    {t('client_profile.interview_arrival_test_maps')}
                                </a>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60 ms-auto"
                            >
                                {saving ? t('client_profile.interview_arrival_saving') : t('client_profile.interview_arrival_save')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </AccordionSection>
    );
};

export default ClientInterviewArrivalCard;
