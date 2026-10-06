
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BuildingOffice2Icon, PlusIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';

const LOOKUP_DEBOUNCE_MS = 300;
const LOOKUP_MIN_CHARS = 2;
const LOOKUP_LIMIT = 6;

type GlobalCompanyLookupResult = {
    id: string;
    name: string;
    website?: string | null;
    logo?: string | null;
    mainField?: string | null;
    matchedAlias?: string | null;
};

const FormInput: React.FC<{
    label: string;
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    required?: boolean;
    onFocus?: () => void;
    autoComplete?: string;
    readOnly?: boolean;
}> = ({ label, name, value, onChange, placeholder, required = false, onFocus, autoComplete, readOnly }) => (
    <div className="flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type="text"
            name={name}
            value={value}
            onChange={onChange}
            onFocus={onFocus}
            autoComplete={autoComplete}
            readOnly={readOnly}
            placeholder={placeholder}
            required={required}
            className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm ${readOnly ? 'opacity-80 cursor-default' : ''}`}
        />
    </div>
);

interface NewClientViewProps {
  onCancel: () => void;
  onSave: (clientData: any) => void;
}

const formatWebsiteLabel = (website?: string | null) =>
    String(website || '')
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\/$/, '');

const resolvePostCreatePath = (
    result: Record<string, unknown> | null | undefined,
    linkedOrganizationId: string | null,
): string => {
    const lastTmpId = result?.lastLinkedOrganizationTmpId
        ? String(result.lastLinkedOrganizationTmpId)
        : '';
    if (lastTmpId) return `/organizations/tmp/${lastTmpId}`;

    const lastOrgId = linkedOrganizationId
        || (result?.lastLinkedOrganizationId ? String(result.lastLinkedOrganizationId) : '');
    if (lastOrgId) return `/organizations/${lastOrgId}`;

    const clientId = result?.id ? String(result.id) : '';
    if (clientId) return `/clients/${clientId}`;
    return '/clients';
};

const NewClientView: React.FC<NewClientViewProps> = ({ onCancel, onSave }) => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const isTenantStaff = Boolean(user?.clientId) && !isPlatformAdmin;

    const [clientName, setClientName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [lookupResults, setLookupResults] = useState<GlobalCompanyLookupResult[]>([]);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [linkedOrganizationId, setLinkedOrganizationId] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const lookupAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedQuery(clientName.trim()), LOOKUP_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [clientName]);

    useEffect(() => {
        if (!apiBase || debouncedQuery.length < LOOKUP_MIN_CHARS) {
            lookupAbortRef.current?.abort();
            setLookupResults([]);
            setIsLookupLoading(false);
            return;
        }

        lookupAbortRef.current?.abort();
        const controller = new AbortController();
        lookupAbortRef.current = controller;
        setLookupResults([]);
        setIsLookupLoading(true);

        fetch(
            `${apiBase}/api/companies/global-lookup?q=${encodeURIComponent(debouncedQuery)}&limit=${LOOKUP_LIMIT}`,
            { signal: controller.signal, cache: 'no-store' },
        )
            .then((r) => {
                if (!r.ok) throw new Error('Lookup failed');
                return r.json();
            })
            .then((payload) => {
                if (controller.signal.aborted) return;
                const list = Array.isArray(payload?.data) ? payload.data : [];
                setLookupResults(list.slice(0, LOOKUP_LIMIT));
            })
            .catch((err) => {
                if (controller.signal.aborted || err?.name === 'AbortError') return;
                setLookupResults([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLookupLoading(false);
            });

        return () => controller.abort();
    }, [apiBase, debouncedQuery]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setClientName(e.target.value);
        setShowDropdown(true);
        setLinkedOrganizationId(null);
    };

    const selectExistingCompany = useCallback((company: GlobalCompanyLookupResult) => {
        setClientName(company.name || '');
        setLinkedOrganizationId(company.id || null);
        setShowDropdown(false);
    }, []);

    const handleCancel = () => {
        onCancel();
        navigate('/clients');
    };

    const isExistingOrgSelected = Boolean(linkedOrganizationId);
    const runBackgroundEnrichment = !isExistingOrgSelected && isTenantStaff;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            if (!apiBase) throw new Error('Missing API base (VITE_API_BASE)');

            if (isExistingOrgSelected && linkedOrganizationId) {
                const linkPayload = { linkedOrganizationId };

                if (isTenantStaff && user?.clientId) {
                    const res = await fetch(
                        `${apiBase}/api/clients/${encodeURIComponent(user.clientId)}/organization-link`,
                        {
                            method: 'POST',
                            headers: authHeaders(true),
                            body: JSON.stringify(linkPayload),
                        },
                    );
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body?.message || 'Organization link failed');
                    }
                    const updated = await res.json();
                    onSave(updated);
                    navigate(resolvePostCreatePath(updated, linkedOrganizationId));
                    return;
                }

                if (isPlatformAdmin) {
                    const res = await fetch(`${apiBase}/api/clients`, {
                        method: 'POST',
                        headers: authHeaders(true),
                        body: JSON.stringify({
                            name: clientName,
                            displayName: clientName,
                            ...linkPayload,
                        }),
                    });
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body?.message || 'Create failed');
                    }
                    const created = await res.json();
                    onSave(created);
                    navigate(resolvePostCreatePath(created, linkedOrganizationId));
                    return;
                }
            }

            const payload = {
                name: clientName.trim(),
                ...(runBackgroundEnrichment ? { backgroundEnrichment: true } : {}),
            };

            if (isTenantStaff && user?.clientId) {
                const res = await fetch(
                    `${apiBase}/api/clients/${encodeURIComponent(user.clientId)}/organization-link`,
                    {
                        method: 'POST',
                        headers: authHeaders(true),
                        body: JSON.stringify(payload),
                    },
                );
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.message || 'Organization link failed');
                }
                const updated = await res.json();
                onSave(updated);
                const path = resolvePostCreatePath(updated, null);
                const orgPipeline = updated?.orgPipeline as { background?: boolean; phase?: string } | null | undefined;
                const enrichingInBackground = Boolean(
                    runBackgroundEnrichment
                    && (orgPipeline?.background || orgPipeline?.phase === 'enriching'),
                );
                navigate(path, enrichingInBackground ? { state: { backgroundEnrichment: true } } : undefined);
                return;
            }

            const res = await fetch(`${apiBase}/api/clients`, {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    ...payload,
                    displayName: clientName.trim(),
                    ...(isPlatformAdmin ? { skipOrganizationLink: true } : {}),
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'Create failed');
            }
            const created = await res.json();
            onSave(created);
            const managerInvite = created?.managerInvite;
            if (managerInvite?.reason === 'user_active' || managerInvite?.reason === 'email_exists') {
                window.alert(t('client_form.manager_invite_user_active'));
            } else if (managerInvite?.ok === false) {
                window.alert(managerInvite.error || t('client_form.manager_invite_failed'));
            }
            navigate(resolvePostCreatePath(created, linkedOrganizationId));
        } catch (e: any) {
            setError(e?.message || 'Create failed');
        } finally {
            setIsSaving(false);
        }
    };

    const showLookupDropdown =
        showDropdown &&
        !isExistingOrgSelected &&
        clientName.trim().length >= LOOKUP_MIN_CHARS;

    return (
        <div className="max-w-lg mx-auto pb-24 w-full px-4 sm:px-6 animate-fade-in">
            <div className="mb-8 mt-6">
                <h1 className="text-3xl font-extrabold text-text-default mb-3 tracking-tight">
                    {t('client_form.title_new')}
                </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="relative" ref={dropdownRef}>
                    <FormInput
                        label={t('client_form.field_client_name')}
                        name="clientName"
                        value={clientName}
                        onChange={handleNameChange}
                        onFocus={() => { if (!isExistingOrgSelected) setShowDropdown(true); }}
                        autoComplete="off"
                        required
                        readOnly={isExistingOrgSelected}
                        placeholder={t('client_form.placeholder_name')}
                    />

                    {isExistingOrgSelected && (
                        <button
                            type="button"
                            onClick={() => {
                                setLinkedOrganizationId(null);
                                setShowDropdown(true);
                            }}
                            className="mt-2 text-sm font-bold text-primary-700 hover:text-primary-900 underline"
                        >
                            בחר חברה אחרת
                        </button>
                    )}

                    {showLookupDropdown && (
                        <div className="absolute z-50 w-full mt-2 bg-bg-card border border-border-default rounded-2xl shadow-2xl max-h-[22rem] overflow-hidden animate-fade-in flex flex-col ring-1 ring-black/5">
                            <div className="px-4 py-3 text-xs font-bold text-text-muted bg-bg-subtle/90 sticky top-0 backdrop-blur-md z-10 border-b border-border-subtle uppercase tracking-wider flex items-center justify-between gap-2">
                                <span>{t('client_form.lookup_results')}</span>
                                {isLookupLoading && (
                                    <span className="font-normal normal-case text-primary-600 animate-pulse">
                                        {t('client_form.lookup_searching')}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {isLookupLoading && (
                                    <div className="px-4 py-6 text-sm text-text-muted text-center">
                                        {t('client_form.lookup_searching')}
                                    </div>
                                )}
                                {!isLookupLoading && lookupResults.length === 0 && (
                                    <div className="px-4 py-3 text-sm text-text-muted">
                                        {t('client_form.lookup_no_results')}
                                    </div>
                                )}
                                {!isLookupLoading && lookupResults.map((company) => (
                                    <div
                                        key={company.id}
                                        className="p-4 hover:bg-bg-hover cursor-pointer border-b border-border-subtle last:border-0 flex justify-between items-center transition-colors group"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => selectExistingCompany(company)}
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            {company.logo ? (
                                                <img
                                                    src={company.logo}
                                                    alt=""
                                                    className="w-12 h-12 rounded-xl object-contain bg-bg-subtle border border-border-default shrink-0 p-1"
                                                />
                                            ) : (
                                                <div className="w-12 h-12 rounded-xl bg-bg-subtle flex items-center justify-center text-text-muted border border-border-default shrink-0">
                                                    <BuildingOffice2Icon className="w-6 h-6" />
                                                </div>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <div className="font-bold text-text-default truncate">{company.name}</div>
                                                {company.website ? (
                                                    <div className="text-sm text-text-muted truncate">
                                                        {formatWebsiteLabel(company.website)}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div
                                className="p-4 bg-bg-subtle hover:bg-primary-500/5 cursor-pointer text-primary-600 font-bold flex items-center gap-3 transition-colors border-t border-border-default"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setLinkedOrganizationId(null);
                                    setShowDropdown(false);
                                }}
                            >
                                <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center">
                                    <PlusIcon className="w-5 h-5" />
                                </div>
                                <span>{t('client_form.lookup_create_new', { name: clientName.trim() })}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end items-center gap-4 pt-2">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="text-text-muted font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover transition-colors"
                    >
                        {t('client_form.cancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'שומר...' : isExistingOrgSelected || isTenantStaff ? 'קשר לארגון' : t('client_form.save')}
                    </button>
                </div>
            </form>

            {error && (
                <div className="mt-4 text-sm text-red-600 font-semibold">{error}</div>
            )}

        </div>
    );
};

export default NewClientView;
