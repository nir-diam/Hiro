import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, CheckIcon } from './Icons';

export type FieldInterestPreviewJob = {
    jobId: string;
    matchScore?: number | null;
    job: {
        title?: string;
        publicJobTitle?: string;
        client?: string;
        city?: string;
        location?: string;
        field?: string;
        role?: string;
    };
};

interface FieldInterestJobPickerModalProps {
    isOpen: boolean;
    roleLabel: string;
    jobs: FieldInterestPreviewJob[];
    saving?: boolean;
    onClose: () => void;
    onConfirm: (selectedJobIds: string[]) => void;
    labels: {
        title: string;
        subtitle: string;
        colJob: string;
        colCompany: string;
        colLocation: string;
        colMatch: string;
        selectAll: string;
        clearAll: string;
        cancel: string;
        confirm: string;
        confirmCount: string;
        empty: string;
    };
}

const FieldInterestJobPickerModal: React.FC<FieldInterestJobPickerModalProps> = ({
    isOpen,
    roleLabel,
    jobs,
    saving = false,
    onClose,
    onConfirm,
    labels,
}) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(new Set(jobs.map((j) => String(j.jobId)).filter(Boolean)));
    }, [isOpen, jobs]);

    const allSelected = jobs.length > 0 && selectedIds.size === jobs.length;

    const sortedJobs = useMemo(
        () =>
            [...jobs].sort(
                (a, b) =>
                    (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0),
            ),
        [jobs],
    );

    if (!isOpen) return null;

    const toggleOne = (jobId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(jobId)) next.delete(jobId);
            else next.add(jobId);
            return next;
        });
    };

    const toggleAll = () => {
        if (allSelected) setSelectedIds(new Set());
        else setSelectedIds(new Set(jobs.map((j) => String(j.jobId)).filter(Boolean)));
    };

    const modal = (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
                aria-label={labels.cancel}
                onClick={saving ? undefined : onClose}
            />
            <div
                className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-border-default overflow-hidden"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-default bg-bg-subtle/40">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-text-default">{labels.title}</h2>
                        <p className="text-sm text-text-muted mt-0.5 truncate">
                            {labels.subtitle.replace('{role}', roleLabel)}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted disabled:opacity-50"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center justify-between gap-2 px-5 py-2 border-b border-border-subtle bg-white">
                    <span className="text-xs text-text-muted">
                        {labels.confirmCount.replace('{count}', String(selectedIds.size))}
                    </span>
                    <button
                        type="button"
                        onClick={toggleAll}
                        disabled={saving || jobs.length === 0}
                        className="text-xs font-bold text-primary-600 hover:text-primary-800 disabled:opacity-50"
                    >
                        {allSelected ? labels.clearAll : labels.selectAll}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                    {sortedJobs.length === 0 ? (
                        <div className="p-8 text-center text-sm text-text-muted">{labels.empty}</div>
                    ) : (
                        <ul className="divide-y divide-border-subtle">
                            {sortedJobs.map((row) => {
                                const jobId = String(row.jobId);
                                const job = row.job || {};
                                const title =
                                    String(job.title || job.publicJobTitle || '').trim() || '—';
                                const company = String(job.client || '').trim() || '—';
                                const city = String(job.city || '').trim();
                                const loc = String(job.location || '').trim();
                                const location = [city, loc].filter(Boolean).join(', ') || '—';
                                const score =
                                    typeof row.matchScore === 'number' && Number.isFinite(row.matchScore)
                                        ? Math.round(row.matchScore)
                                        : null;
                                const checked = selectedIds.has(jobId);
                                return (
                                    <li key={jobId}>
                                        <label
                                            className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                                                checked ? 'bg-primary-50/60' : 'hover:bg-bg-hover'
                                            } ${saving ? 'pointer-events-none opacity-70' : ''}`}
                                        >
                                            <div
                                                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                                                    checked
                                                        ? 'bg-primary-600 border-primary-600'
                                                        : 'border-border-default bg-white'
                                                }`}
                                            >
                                                {checked && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={checked}
                                                onChange={() => toggleOne(jobId)}
                                            />
                                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-1 sm:gap-3 text-sm">
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-text-default truncate">
                                                        {title}
                                                    </div>
                                                    <div className="text-xs text-text-muted truncate sm:hidden">
                                                        {[company, location].filter(Boolean).join(' · ')}
                                                    </div>
                                                </div>
                                                <div className="hidden sm:block text-text-muted truncate">
                                                    {company}
                                                </div>
                                                <div className="hidden sm:block text-text-muted truncate max-w-[140px]">
                                                    {location}
                                                </div>
                                                <div className="text-left sm:text-center font-bold text-primary-600 tabular-nums">
                                                    {score != null ? `${score}%` : '—'}
                                                </div>
                                            </div>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-default bg-bg-subtle/30">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-bold text-text-muted hover:text-text-default disabled:opacity-50"
                    >
                        {labels.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm(Array.from(selectedIds))}
                        disabled={saving || selectedIds.size === 0}
                        className="px-5 py-2 text-sm font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 shadow-sm"
                    >
                        {saving ? '…' : labels.confirm}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default FieldInterestJobPickerModal;
