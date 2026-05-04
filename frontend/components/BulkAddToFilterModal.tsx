import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';
import { jobIsOpenForStaffPick } from '../utils/jobPickerOpen';

export interface BulkJobPickerOption {
    id: string;
    title: string;
    subtitle?: string;
    /** Job row status from API (e.g. `פתוחה` = open / active for referrals). */
    status?: string;
}

interface ScreeningCvReferralListRow {
    candidateId?: string | null;
    jobId?: string | null;
}

interface BulkAddToFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (jobId: string, options?: { notes?: string; filterPosition?: string }) => void;
    selectedCount: number;
    /** Job rows (e.g. from GET /api/jobs — use string ids such as UUIDs). */
    jobs?: BulkJobPickerOption[];
    /** Backend candidate UUIDs — used to hide jobs that already have screening CV referrals for any selected candidate. */
    candidateBackendIds?: string[];
}

function normId(id: string | null | undefined): string {
    return String(id ?? '')
        .trim()
        .toLowerCase();
}

const BulkAddToFilterModal: React.FC<BulkAddToFilterModalProps> = ({
    isOpen,
    onClose,
    onSave,
    selectedCount,
    jobs: jobsFromApi = [],
    candidateBackendIds = [],
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [filterPosition, setFilterPosition] = useState('');
    const [referralsLoading, setReferralsLoading] = useState(false);
    /** Job ids (lowercased) where at least one selected candidate already has a screening_cv referral. */
    const [jobIdsWithReferralForSelection, setJobIdsWithReferralForSelection] = useState<Set<string>>(() => new Set());

    const apiBase = import.meta.env.VITE_API_BASE || '';

    const selectedCandidateKeys = useMemo(() => {
        const s = new Set<string>();
        for (const id of candidateBackendIds) {
            const k = normId(id);
            if (k) s.add(k);
        }
        return s;
    }, [candidateBackendIds]);

    const fetchReferralJobIds = useCallback(async (): Promise<Set<string>> => {
        const base = (apiBase || '').replace(/\/$/, '');
        const url = base ? `${base}/api/email-uploads/screening-cv-referrals` : '/api/email-uploads/screening-cv-referrals';
        const token =
            typeof localStorage !== 'undefined' ? String(localStorage.getItem('token') || '').trim() : '';
        if (!token) return new Set();

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) return new Set();

        const data: unknown = await res.json().catch(() => null);
        const list: ScreeningCvReferralListRow[] = Array.isArray(data)
            ? (data as ScreeningCvReferralListRow[])
            : data && typeof data === 'object' && data !== null && 'items' in data
              ? ((data as { items?: ScreeningCvReferralListRow[] }).items ?? [])
              : [];

        const out = new Set<string>();
        if (selectedCandidateKeys.size === 0) return out;

        for (const row of list) {
            const cid = normId(row.candidateId ?? '');
            const jid = normId(row.jobId ?? '');
            if (!cid || !jid) continue;
            if (selectedCandidateKeys.has(cid)) out.add(jid);
        }
        return out;
    }, [apiBase, selectedCandidateKeys]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            setSelectedJobId(null);
            setNotes('');
            setFilterPosition('');
            setReferralsLoading(false);
            setJobIdsWithReferralForSelection(new Set());
            return;
        }

        let cancelled = false;
        if (selectedCandidateKeys.size === 0) {
            setJobIdsWithReferralForSelection(new Set());
            setReferralsLoading(false);
            return;
        }

        setReferralsLoading(true);
        void fetchReferralJobIds()
            .then((ids) => {
                if (!cancelled) setJobIdsWithReferralForSelection(ids);
            })
            .catch(() => {
                if (!cancelled) setJobIdsWithReferralForSelection(new Set());
            })
            .finally(() => {
                if (!cancelled) setReferralsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, fetchReferralJobIds]);

    const openJobs = useMemo(
        () => jobsFromApi.filter((j) => jobIsOpenForStaffPick(j.status)),
        [jobsFromApi],
    );

    const pickerJobs = useMemo(() => {
        if (selectedCandidateKeys.size === 0) return openJobs;
        return openJobs.filter((j) => !jobIdsWithReferralForSelection.has(normId(j.id)));
    }, [openJobs, jobIdsWithReferralForSelection, selectedCandidateKeys.size]);

    const filteredJobs = useMemo(() => {
        const q = searchTerm.toLowerCase();
        return pickerJobs.filter(
            (j) =>
                j.title.toLowerCase().includes(q) || (j.subtitle && j.subtitle.toLowerCase().includes(q)),
        );
    }, [searchTerm, pickerJobs]);

    useEffect(() => {
        if (!isOpen || !selectedJobId) return;
        const allowed = new Set(pickerJobs.map((j) => j.id));
        if (!allowed.has(selectedJobId)) setSelectedJobId(null);
    }, [isOpen, selectedJobId, pickerJobs]);

    if (!isOpen) return null;

    const showReferralBlocking =
        selectedCandidateKeys.size > 0 && !referralsLoading && openJobs.length > 0 && pickerJobs.length === 0;

    return (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in" onClick={onClose} dir="rtl">
            <div className="bg-bg-card flex flex-col max-h-[90vh] md:max-h-[85vh] rounded-3xl shadow-xl border border-border-subtle w-full max-w-[800px] animate-scale-in relative overflow-hidden" onClick={e => e.stopPropagation()}>
                
                <div className="relative p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-subtle/30">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="bg-primary-100 text-primary-700 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-lg md:text-xl ring-4 ring-primary-50 shrink-0">
                            {selectedCount}
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-text-default leading-tight">הוספה לסינון משרה</h2>
                            <p className="text-xs md:text-sm text-text-subtle mt-1 text-primary-600/80 font-medium bg-primary-50 inline-block px-2 py-0.5 rounded-md leading-tight">
                                מוצגות משרות בסטטוס פתוח בלבד · ללא משרות שכבר נשלח להן קו״ח מהסינון עבור מועמד מהבחירה
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-text-muted hover:bg-bg-hover hover:text-text-default rounded-full transition-colors shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden min-h-0 md:max-h-[60vh]">
                    {/* Right side: Job Selection */}
                    <div className="w-full md:w-[55%] p-4 md:p-6 md:pt-5 border-b md:border-b-0 md:border-l border-border-subtle flex flex-col gap-4 md:overflow-y-auto bg-bg-card/50">
                        <div className="relative mb-2 sticky top-0 bg-transparent md:bg-bg-card z-10 pt-1 pb-2">
                            <MagnifyingGlassIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input 
                                type="text"
                                placeholder="חפש משרה לפי שם או חברה..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-border-default rounded-xl py-3 pr-10 pl-4 text-sm focus:ring-2 focus:border-primary-500 focus:outline-none shadow-sm transition-shadow"
                            />
                        </div>
                        
                        <div className="flex-1 space-y-3 pb-4">
                            {referralsLoading && selectedCandidateKeys.size > 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    טוען נתוני הפניות סינון…
                                </div>
                            ) : jobsFromApi.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">אין משרות זמינות לבחירה</div>
                            ) : openJobs.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    אין משרות בסטטוס פתוח לבחירה
                                </div>
                            ) : showReferralBlocking ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    אין משרות זמינות — לכל המשרות הפתוחות כבר נשלח קו״ח מהסינון עבור לפחות אחד מהמועמדים שנבחרו
                                </div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">לא נמצאו משרות תואמות לחיפוש</div>
                            ) : (
                                filteredJobs.map(job => {
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
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                        isSelected ? 'border-primary-600 bg-primary-600' : 'border-border-strong bg-white'
                                                    }`}>
                                                        {isSelected && (
                                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className={`font-bold text-sm truncate ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>{job.title}</h4>
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

                    {/* Left side: Notes & Settings */}
                    <div className="w-full md:w-[45%] p-4 md:p-6 md:pt-5 flex flex-col justify-between md:overflow-y-auto">
                        <div className="flex flex-col gap-6">
                            <div>
                                <h3 className="text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                                    תפקיד / מיקום בסינון
                                    <span className="text-[10px] font-normal text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded">אופציונלי</span>
                                </h3>
                                <input
                                    type="text"
                                    value={filterPosition}
                                    onChange={(e) => setFilterPosition(e.target.value)}
                                    placeholder="למשל: מנהל מכירות, אזור צפון..."
                                    className="w-full bg-white border border-border-default rounded-xl py-3 px-4 text-sm focus:ring-2 focus:border-primary-500 shadow-sm"
                                />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                                    הערות לסינון
                                    <span className="text-[10px] font-normal text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded">אופציונלי</span>
                                </h3>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="הוסף הערות למועמדים אלו..."
                                    className="w-full bg-white border border-border-default rounded-xl p-4 text-sm focus:ring-2 focus:border-primary-500 min-h-[160px] resize-none shadow-inner"
                                ></textarea>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button 
                                onClick={() => {
                                    if (selectedJobId !== null) {
                                        onSave(selectedJobId, {
                                            notes: notes.trim() || undefined,
                                            filterPosition: filterPosition.trim() || undefined,
                                        });
                                        onClose();
                                    }
                                }}
                                disabled={selectedJobId === null || referralsLoading}
                                className="px-4 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-center"
                            >
                                הוסף {selectedCount} מועמדים
                            </button>
                            <button onClick={onClose} className="px-4 py-3 rounded-xl font-semibold text-text-default hover:bg-border-subtle transition-colors w-1/3 text-center border border-border-default">
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkAddToFilterModal;
