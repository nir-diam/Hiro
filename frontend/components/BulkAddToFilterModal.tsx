import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';
import { jobIsOpenForStaffPick } from '../utils/jobPickerOpen';
import { getJobHealthData, daysOpenFromDate } from '../utils/jobHealth';

export interface BulkJobPickerOption {
    id: string;
    title: string;
    subtitle?: string;
    /** Job row status from API (e.g. `פתוחה` = open / active for referrals). */
    status?: string;
    city?: string;
    activeProcess?: number;
    associatedCandidates?: number;
    waitingForScreening?: number;
    openDate?: string;
    healthProfile?: string;
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

const getToken = (): string | null => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('token');
    const t = raw != null ? String(raw).trim() : '';
    return t || null;
};

const BulkAddToFilterModal: React.FC<BulkAddToFilterModalProps> = ({
    isOpen,
    onClose,
    onSave,
    selectedCount,
    jobs: jobsFromProp = [],
    candidateBackendIds = [],
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [filterPosition, setFilterPosition] = useState('');
    const [referralsLoading, setReferralsLoading] = useState(false);
    /** Job ids (lowercased) where at least one selected candidate already has a screening_cv referral. */
    const [jobIdsWithReferralForSelection, setJobIdsWithReferralForSelection] = useState<Set<string>>(() => new Set());

    const [fetchedJobs, setFetchedJobs] = useState<BulkJobPickerOption[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);

    const apiBase = import.meta.env.VITE_API_BASE || '';

    // Fetch lightweight jobs list when modal opens
    useEffect(() => {
        if (!isOpen || !apiBase) return;
        let cancelled = false;
        setJobsLoading(true);
        setJobsError(null);
        void (async () => {
            try {
                const token = getToken();
                const headers: Record<string, string> = { Accept: 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch(`${apiBase}/api/jobs/for-picker`, { headers, cache: 'no-store' });
                if (!res.ok) throw new Error('שגיאה בטעינת המשרות');
                const data = await res.json();
                const list: any[] = Array.isArray(data) ? data : [];
                if (cancelled) return;
                setFetchedJobs(
                    list.map((j) => ({
                        id: String(j.id),
                        title: String(j.title || 'ללא שם'),
                        subtitle: j.client ? String(j.client) : undefined,
                        status: j.status != null ? String(j.status) : undefined,
                        city: j.city ? String(j.city) : undefined,
                        activeProcess: typeof j.activeProcess === 'number' ? j.activeProcess : 0,
                        associatedCandidates: typeof j.associatedCandidates === 'number' ? j.associatedCandidates : 0,
                        waitingForScreening: typeof j.waitingForScreening === 'number' ? j.waitingForScreening : 0,
                        openDate: j.openDate ? String(j.openDate) : undefined,
                        healthProfile: j.healthProfile ? String(j.healthProfile) : undefined,
                    })),
                );
            } catch (e) {
                if (!cancelled) setJobsError((e as Error).message || 'שגיאה בטעינת המשרות');
            } finally {
                if (!cancelled) setJobsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, apiBase]);

    const jobsFromApi = useMemo(
        () => (fetchedJobs.length > 0 ? fetchedJobs : jobsFromProp),
        [fetchedJobs, jobsFromProp],
    );

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
            setFetchedJobs([]);
            setJobsError(null);
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
                            {jobsLoading ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">
                                    <svg className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>
                                    טוען משרות...
                                </div>
                            ) : jobsError ? (
                                <div className="p-8 text-center text-red-500 text-sm bg-red-50 rounded-2xl border border-dashed border-red-200">{jobsError}</div>
                            ) : referralsLoading && selectedCandidateKeys.size > 0 ? (
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
                                        const health = getJobHealthData(job);
                                        const days = daysOpenFromDate(job.openDate);
                                        const locationParts = [job.subtitle, job.city].filter(Boolean);
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
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className={`font-bold text-sm truncate pr-1 ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>{job.title}</h4>
                                                        <div className="scale-75 origin-top-left -mt-1 -ml-2 shrink-0">
                                                            <div className="group/health relative inline-flex items-center justify-center cursor-help w-8 h-8">
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <div className={`w-3 h-3 rounded-full ${health.color} ${health.pulse ? 'animate-pulse ring-2 ring-offset-1 ring-red-200' : ''} shadow-sm`} />
                                                                </div>
                                                                <div className="absolute bottom-full mb-2 right-0 w-max max-w-[200px] bg-gray-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl z-50 text-center opacity-0 group-hover/health:opacity-100 transition-opacity duration-200 pointer-events-none">
                                                                    {health.message}
                                                                    <div className="absolute top-full right-3 border-4 border-transparent border-t-gray-800" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {locationParts.length > 0 && (
                                                        <p className="text-xs text-text-subtle mb-2">{locationParts.join(' • ')}</p>
                                                    )}
                                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                                                        <span className="px-2 py-1 rounded-md flex items-center gap-1.5 bg-bg-subtle">
                                                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                                                            <span>{job.associatedCandidates ?? 0} מועמדים</span>
                                                        </span>
                                                        <span className="px-2 py-1 rounded-md flex items-center gap-1.5 bg-bg-subtle">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                            <span>{job.activeProcess ?? 0} בתהליך</span>
                                                        </span>
                                                        <span className="px-2 py-1 rounded-md flex items-center gap-1.5 bg-bg-subtle">
                                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                                            <span>פתוחה {days} ימים</span>
                                                        </span>
                                                    </div>
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
