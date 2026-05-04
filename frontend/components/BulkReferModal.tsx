import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, EnvelopeIcon } from './Icons';
import type { BulkJobPickerOption } from './BulkAddToFilterModal';
import { useLanguage } from '../context/LanguageContext';
import { jobIsOpenForStaffPick } from '../utils/jobPickerOpen';

export type BulkReferSuccessSummary = {
    /** Total email dispatches returned by the API (sum of count per candidate). */
    emailsSent: number;
    /** Candidates for which at least one send succeeded. */
    candidatesSucceeded: number;
    /** Candidates skipped or failed. */
    candidatesFailed: number;
    errors: string[];
};

interface ReferralContactRow {
    id: string;
    name: string;
    email: string;
    role?: string;
}

interface BulkReferModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Backend candidate UUIDs (same as screening CV / referrals). */
    candidateBackendIds: string[];
    selectedCount: number;
    jobs?: BulkJobPickerOption[];
    onSuccess?: (summary: BulkReferSuccessSummary) => void;
}

/** Match other staff API calls: trimmed token, Accept header, cookies when CORS uses credentials. */
const getStaffToken = (): string | null => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('token');
    const t = raw != null ? String(raw).trim() : '';
    return t || null;
};

const staffFetchInit = (
    token: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): RequestInit => ({
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
    },
});

const BulkReferModal: React.FC<BulkReferModalProps> = ({
    isOpen,
    onClose,
    candidateBackendIds,
    selectedCount,
    jobs: jobsFromApi = [],
    onSuccess,
}) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');

    const [contacts, setContacts] = useState<ReferralContactRow[]>([]);
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [jobClientLabel, setJobClientLabel] = useState('');
    const [contactsLoading, setContactsLoading] = useState(false);
    const [contactsError, setContactsError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const openJobsForReferral = useMemo(
        () => jobsFromApi.filter((j) => jobIsOpenForStaffPick(j.status)),
        [jobsFromApi],
    );

    const filteredJobs = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return openJobsForReferral.filter(
            (j) =>
                j.title.toLowerCase().includes(q) ||
                (j.subtitle && j.subtitle.toLowerCase().includes(q)),
        );
    }, [searchTerm, openJobsForReferral]);

    useEffect(() => {
        if (!isOpen || !selectedJobId) return;
        const openIds = new Set(openJobsForReferral.map((j) => j.id));
        if (!openIds.has(selectedJobId)) setSelectedJobId(null);
    }, [isOpen, selectedJobId, openJobsForReferral]);

    const selectedJobTitle = useMemo(() => {
        if (!selectedJobId) return '';
        return jobsFromApi.find((j) => j.id === selectedJobId)?.title || '';
    }, [selectedJobId, jobsFromApi]);

    const resetTransient = useCallback(() => {
        setSearchTerm('');
        setSelectedJobId(null);
        setNotes('');
        setContacts([]);
        setSelectedContactIds(new Set());
        setJobClientLabel('');
        setContactsError(null);
        setSubmitError(null);
        setSubmitProgress(null);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            resetTransient();
        }
    }, [isOpen, resetTransient]);

    useEffect(() => {
        if (!isOpen || !selectedJobId || !apiBase) {
            setContacts([]);
            setSelectedContactIds(new Set());
            setJobClientLabel('');
            setContactsError(null);
            return;
        }

        const token = getStaffToken();
        if (!token) {
            setContactsError(t('bulk_refer.login_required'));
            setContacts([]);
            setSelectedContactIds(new Set());
            return;
        }

        let cancelled = false;
        setContactsLoading(true);
        setContactsError(null);

        void (async () => {
            try {
                const res = await fetch(
                    `${apiBase}/api/jobs/${encodeURIComponent(selectedJobId)}/referral-client-contacts`,
                    staffFetchInit(token, { method: 'GET' }),
                );
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    if (res.status === 401) {
                        throw new Error(t('bulk_refer.session_expired'));
                    }
                    throw new Error(
                        typeof data?.message === 'string' ? data.message : t('bulk_refer.contacts_failed'),
                    );
                }
                if (cancelled) return;
                const raw = Array.isArray(data?.contacts) ? data.contacts : [];
                const rows: ReferralContactRow[] = raw.map((c: any) => ({
                    id: String(c.id ?? ''),
                    name: String(c.name || '').trim(),
                    email: String(c.email || '').trim(),
                    role: c.role != null ? String(c.role) : '',
                }));
                setContacts(rows);
                setSelectedContactIds(new Set(rows.map((r) => r.id)));
                setJobClientLabel(
                    typeof data?.jobClientLabel === 'string' ? String(data.jobClientLabel).trim() : '',
                );
            } catch (e) {
                if (!cancelled) {
                    setContacts([]);
                    setSelectedContactIds(new Set());
                    setContactsError((e as Error).message || t('bulk_refer.contacts_failed'));
                }
            } finally {
                if (!cancelled) setContactsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, selectedJobId, apiBase, t]);

    const toggleContact = (id: string) => {
        setSelectedContactIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllContacts = () => setSelectedContactIds(new Set(contacts.map((c) => c.id)));
    const clearContacts = () => setSelectedContactIds(new Set());

    const companyForSend = jobClientLabel || jobsFromApi.find((j) => j.id === selectedJobId)?.subtitle || '';

    const handleSubmit = async () => {
        if (!selectedJobId || candidateBackendIds.length === 0) return;

        const token = getStaffToken();
        if (!apiBase || !token) {
            setSubmitError(t('bulk_refer.login_required'));
            return;
        }

        const selectedContacts = contacts.filter((c) => selectedContactIds.has(c.id) && c.email);
        if (selectedContacts.length === 0) {
            setSubmitError(t('bulk_refer.pick_contacts'));
            return;
        }

        const sendsBlock = [
            {
                jobId: selectedJobId,
                jobTitle: selectedJobTitle,
                company: companyForSend,
                contacts: selectedContacts.map((c) => ({ email: c.email, name: c.name })),
                additionalNotes: notes.trim(),
            },
        ];

        setSubmitting(true);
        setSubmitError(null);
        const errors: string[] = [];
        let emailsSent = 0;
        let candidatesSucceeded = 0;

        try {
            const total = candidateBackendIds.length;
            for (let i = 0; i < total; i++) {
                setSubmitProgress({ current: i + 1, total });
                const candidateId = candidateBackendIds[i];
                try {
                    const res = await fetch(
                        `${apiBase}/api/email-uploads/send-screening-cv`,
                        staffFetchInit(token, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                candidateId,
                                attachOriginalCv: true,
                                attachSystemCvPdf: false,
                                attachLastReferral: false,
                                minimalCvReferralBody: true,
                                sends: sendsBlock,
                            }),
                        }),
                    );
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        const msg =
                            res.status === 401
                                ? t('bulk_refer.session_expired')
                                : typeof data?.message === 'string'
                                  ? data.message
                                  : t('bulk_refer.send_failed');
                        errors.push(`${candidateId.slice(0, 8)}… — ${msg}`);
                        continue;
                    }
                    const n = typeof data?.count === 'number' ? data.count : selectedContacts.length;
                    emailsSent += n;
                    candidatesSucceeded += 1;
                } catch (e) {
                    errors.push(`${candidateId.slice(0, 8)}… — ${(e as Error).message || 'Error'}`);
                }
            }
            setSubmitProgress({ current: total, total });

            const summary: BulkReferSuccessSummary = {
                emailsSent,
                candidatesSucceeded,
                candidatesFailed: total - candidatesSucceeded,
                errors,
            };
            onSuccess?.(summary);
            onClose();
        } finally {
            setSubmitting(false);
            setSubmitProgress(null);
        }
    };

    if (!isOpen) return null;

    const canSubmit =
        selectedJobId !== null &&
        candidateBackendIds.length > 0 &&
        selectedContactIds.size > 0 &&
        !contactsLoading &&
        !submitting;

    return (
        <div
            className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-bg-card flex flex-col max-h-[90vh] md:max-h-[85vh] rounded-3xl shadow-xl border border-border-subtle w-full max-w-[800px] animate-scale-in relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-subtle/30">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="bg-primary-100 text-primary-700 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-lg md:text-xl ring-4 ring-primary-50 shrink-0">
                            {selectedCount}
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-text-default leading-tight">
                                {t('actions.refer')}
                            </h2>
                            <p className="text-xs md:text-sm text-text-subtle mt-1 text-primary-600/80 font-medium bg-primary-50 inline-block px-2 py-0.5 rounded-md leading-tight">
                                {t('bulk_refer.subtitle')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 text-text-muted hover:bg-bg-hover hover:text-text-default rounded-full transition-colors shrink-0 disabled:opacity-50"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden min-h-0 md:max-h-[60vh]">
                    <div className="w-full md:w-[55%] p-4 md:p-6 md:pt-5 border-b md:border-b-0 md:border-l border-border-subtle flex flex-col gap-4 md:overflow-y-auto bg-bg-card/50">
                        <div className="relative shrink-0 mb-2">
                            <MagnifyingGlassIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                type="text"
                                placeholder={t('bulk_refer.search_job')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-border-default rounded-xl py-3 pr-10 pl-4 text-sm focus:ring-2 focus:border-primary-500 focus:outline-none shadow-sm transition-shadow"
                            />
                        </div>

                        <div className="flex-1 space-y-3 pb-4">
                            {jobsFromApi.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    {t('bulk_refer.no_jobs')}
                                </div>
                            ) : openJobsForReferral.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    {t('bulk_refer.no_open_jobs')}
                                </div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    {t('bulk_refer.no_jobs_match')}
                                </div>
                            ) : (
                                filteredJobs.map((job) => {
                                    const isSelected = selectedJobId === job.id;
                                    return (
                                        <div
                                            key={job.id}
                                            onClick={() => setSelectedJobId(job.id)}
                                            className={`p-4 cursor-pointer transition-all rounded-2xl border flex items-start gap-4 ${
                                                isSelected
                                                    ? 'bg-primary-50/80 border-primary-300 shadow-sm ring-1 ring-primary-100'
                                                    : 'bg-white border-border-subtle hover:border-primary-200 hover:bg-primary-50/30 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="pt-1">
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                        isSelected
                                                            ? 'border-primary-600 bg-primary-600'
                                                            : 'border-border-strong bg-white'
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <svg
                                                            className="w-3 h-3 text-white"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={3}
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4
                                                    className={`font-bold text-sm truncate ${isSelected ? 'text-primary-900' : 'text-text-default'}`}
                                                >
                                                    {job.title}
                                                </h4>
                                                {job.subtitle ? (
                                                    <p className="text-xs text-text-subtle mt-1">{job.subtitle}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="w-full md:w-[45%] p-4 md:p-6 md:pt-5 flex flex-col md:overflow-y-auto min-h-0">
                        <div className="flex flex-col gap-5 flex-1 min-h-0">
                            {selectedJobId ? (
                                <div className="rounded-2xl border border-border-subtle bg-bg-subtle/30 p-3 space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-bold text-text-default">
                                        <EnvelopeIcon className="w-5 h-5 text-primary-600 shrink-0" />
                                        {t('bulk_refer.email_recipients')}
                                    </div>
                                    {contactsLoading ? (
                                        <p className="text-xs text-text-muted">{t('bulk_refer.loading_contacts')}</p>
                                    ) : contactsError ? (
                                        <p className="text-xs text-red-600">{contactsError}</p>
                                    ) : contacts.length === 0 ? (
                                        <p className="text-xs text-text-muted">{t('bulk_refer.no_contacts')}</p>
                                    ) : (
                                        <>
                                            <div className="flex gap-2 text-xs font-semibold">
                                                <button
                                                    type="button"
                                                    onClick={selectAllContacts}
                                                    className="text-primary-600 hover:underline"
                                                >
                                                    {t('bulk_refer.select_all_contacts')}
                                                </button>
                                                <span className="text-text-muted">|</span>
                                                <button
                                                    type="button"
                                                    onClick={clearContacts}
                                                    className="text-primary-600 hover:underline"
                                                >
                                                    {t('bulk_refer.clear_contacts')}
                                                </button>
                                            </div>
                                            <ul className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
                                                {contacts.map((c) => (
                                                    <li key={c.id}>
                                                        <label className="flex items-start gap-2 cursor-pointer text-sm">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedContactIds.has(c.id)}
                                                                onChange={() => toggleContact(c.id)}
                                                                className="mt-1 h-4 w-4 rounded border-border-default text-primary-600"
                                                            />
                                                            <span className="min-w-0">
                                                                <span className="font-medium text-text-default block truncate">
                                                                    {c.name || c.email}
                                                                </span>
                                                                <span className="text-xs text-text-muted break-all">
                                                                    {c.email}
                                                                </span>
                                                            </span>
                                                        </label>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            ) : null}

                            <div>
                                <h3 className="text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                                    {t('bulk_refer.notes_title')}
                                    <span className="text-[10px] font-normal text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded">
                                        {t('bulk_refer.optional')}
                                    </span>
                                </h3>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder={t('bulk_refer.notes_placeholder')}
                                    className="w-full bg-white border border-border-default rounded-xl p-4 text-sm focus:ring-2 focus:border-primary-500 min-h-[120px] resize-none shadow-inner"
                                />
                            </div>

                            <p className="text-[11px] text-text-muted">{t('bulk_refer.merge_screening_hint')}</p>

                            {submitError ? (
                                <p className="text-xs text-red-600">{submitError}</p>
                            ) : null}
                            {submitProgress ? (
                                <p className="text-xs text-text-muted">
                                    {t('bulk_refer.progress', {
                                        current: submitProgress.current,
                                        total: submitProgress.total,
                                    })}
                                </p>
                            ) : null}
                        </div>

                        <div className="flex gap-3 mt-6 shrink-0">
                            <button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={!canSubmit}
                                className="px-4 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-center"
                            >
                                {submitting ? t('bulk_refer.sending') : t('bulk_refer.submit', { count: selectedCount })}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="px-4 py-3 rounded-xl font-semibold text-text-default hover:bg-border-subtle transition-colors w-1/3 text-center border border-border-default disabled:opacity-50"
                            >
                                {t('bulk_refer.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkReferModal;
