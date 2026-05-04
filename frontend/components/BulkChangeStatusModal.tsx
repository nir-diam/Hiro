import React, { useState, useEffect, useCallback } from 'react';
import { XMarkIcon, InformationCircleIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
    CANDIDATE_STATUS_FALLBACK,
    CANDIDATE_STATUS_PICKLIST_KEY,
    fetchPicklistValuesByKey,
    picklistRowLabel,
    type PicklistValueRow,
} from '../services/picklistValuesApi';

const getStaffToken = (): string | null => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('token');
    const t = raw != null ? String(raw).trim() : '';
    return t || null;
};

export interface BulkChangeStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidateIds: string[];
    selectedCount: number;
    onSuccess?: () => void;
}

const BulkChangeStatusModal: React.FC<BulkChangeStatusModalProps> = ({
    isOpen,
    onClose,
    candidateIds,
    selectedCount,
    onSuccess,
}) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const { t } = useLanguage();
    const [status, setStatus] = useState('');
    const [statusExplanation, setStatusExplanation] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusOptions, setStatusOptions] = useState<PicklistValueRow[]>([]);
    const [picklistLoading, setPicklistLoading] = useState(false);

    const reset = useCallback(() => {
        setStatus('');
        setStatusExplanation('');
        setError(null);
        setStatusOptions([]);
        setPicklistLoading(false);
    }, []);

    useEffect(() => {
        if (!isOpen) reset();
    }, [isOpen, reset]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setPicklistLoading(true);
        void fetchPicklistValuesByKey(apiBase, CANDIDATE_STATUS_PICKLIST_KEY)
            .then((rows) => {
                if (cancelled) return;
                setStatusOptions(rows.length > 0 ? rows : CANDIDATE_STATUS_FALLBACK);
            })
            .catch(() => {
                if (!cancelled) setStatusOptions(CANDIDATE_STATUS_FALLBACK);
            })
            .finally(() => {
                if (!cancelled) setPicklistLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, apiBase]);

    useEffect(() => {
        if (!status || statusOptions.length === 0) return;
        const allowed = new Set(statusOptions.map((r) => String(r.value ?? '').trim()));
        if (!allowed.has(String(status).trim())) setStatus('');
    }, [statusOptions, status]);

    const handleSubmit = async () => {
        const st = String(status || '').trim();
        if (!st) {
            setError(t('bulk_status.status_required'));
            return;
        }
        if (!apiBase || candidateIds.length === 0) {
            setError(t('bulk_status.missing_config'));
            return;
        }
        const token = getStaffToken();
        if (!token) {
            setError(t('bulk_status.login_required'));
            return;
        }

        const body: Record<string, unknown> = { status: st };
        const expl = String(statusExplanation || '').trim();
        if (expl) body.statusExplanation = expl;

        setSubmitting(true);
        setError(null);
        const failures: string[] = [];
        try {
            for (const id of candidateIds) {
                const sid = String(id || '').trim();
                if (!sid) continue;
                try {
                    const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(sid)}`, {
                        method: 'PUT',
                        headers: {
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        credentials: 'include',
                        cache: 'no-store',
                        body: JSON.stringify(body),
                    });
                    if (!res.ok) {
                        let msg = res.statusText;
                        try {
                            const j = (await res.json()) as { message?: string };
                            if (j?.message) msg = j.message;
                        } catch {
                            /* ignore */
                        }
                        failures.push(`${sid.slice(0, 8)}… — ${msg}`);
                    }
                } catch (e) {
                    failures.push(`${sid.slice(0, 8)}… — ${(e as Error).message || 'Error'}`);
                }
            }

            if (failures.length > 0) {
                setError(`${t('bulk_status.partial_fail')} (${failures.length}): ${failures.slice(0, 3).join('; ')}${failures.length > 3 ? '…' : ''}`);
                return;
            }

            onSuccess?.();
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[200] flex items-center justify-center p-4"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-bg-card rounded-2xl shadow-xl border border-border-subtle w-full max-w-md overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                    <h2 className="text-lg font-bold text-text-default">{t('bulk_status.title')}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-full text-text-muted hover:bg-bg-hover disabled:opacity-50"
                        aria-label={t('bulk_status.close')}
                    >
                        <XMarkIcon className="w-5 h-5" /><span className="sr-only">{t('bulk_status.close')}</span>
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    <p className="text-sm text-text-muted">
                        {t('bulk_status.subtitle', { count: selectedCount })}
                    </p>

                    <div>
                        <div className="flex items-center gap-2 mb-1 min-h-[1.25rem]">
                            <label htmlFor="bulk-status-select" className="block text-sm font-semibold text-text-muted flex-1">
                                {t('form.status')}
                            </label>
                            <details className="relative z-10 shrink-0">
                                <summary
                                    className="list-none cursor-pointer rounded-full p-1 text-primary-600 hover:text-primary-700 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 focus:ring-offset-bg-card [&::-webkit-details-marker]:hidden flex items-center justify-center"
                                    aria-label={t('form.status_tip_aria')}
                                >
                                    <InformationCircleIcon className="h-4 w-4" />
                                </summary>
                                <div
                                    role="tooltip"
                                    className="absolute z-[60] mt-1 max-h-48 w-max max-w-[min(20rem,calc(100vw-2rem))] overflow-y-auto whitespace-normal rounded-lg border border-border-default bg-bg-card p-3 text-start text-xs leading-relaxed text-text-default shadow-lg end-0 top-full"
                                >
                                    {String(statusExplanation || '').trim() || t('form.status_tip_empty')}
                                </div>
                            </details>
                        </div>
                        <select
                            id="bulk-status-select"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            disabled={submitting || picklistLoading}
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                        >
                            <option value="">{picklistLoading ? 'טוען…' : '—'}</option>
                            {statusOptions.map((row) => (
                                <option key={row.id} value={row.value}>
                                    {picklistRowLabel(row)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="bulk-status-explanation" className="block text-sm font-semibold text-text-muted mb-1">
                            {t('bulk_status.explanation_label')}
                        </label>
                        <textarea
                            id="bulk-status-explanation"
                            value={statusExplanation}
                            onChange={(e) => setStatusExplanation(e.target.value)}
                            disabled={submitting}
                            rows={4}
                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 resize-y min-h-[5rem]"
                            placeholder={t('bulk_status.explanation_placeholder')}
                        />
                    </div>

                    {error ? <p className="text-sm text-red-600">{error}</p> : null}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={() => void handleSubmit()}
                            disabled={submitting || picklistLoading || !status.trim()}
                            className="flex-1 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-center"
                        >
                            {submitting ? t('bulk_status.saving') : t('bulk_status.submit')}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="px-4 py-3 rounded-xl font-semibold border border-border-default text-text-default hover:bg-bg-hover disabled:opacity-50 shrink-0"
                        >
                            {t('bulk_status.cancel')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkChangeStatusModal;
