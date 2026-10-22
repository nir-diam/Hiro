import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';
import { jobIsOpenForStaffPick } from '../utils/jobPickerOpen';
import { getJobHealthData, daysOpenFromDate } from '../utils/jobHealth';
import { fetchCandidateLinkedJobs } from '../utils/candidateLinkedJobs';
import type { JobFilterSaveOptions } from '../utils/candidateJobFilterApi';
import { authHeaders } from '../utils/authHeaders';

export interface BulkJobPickerOption {
    id: string;
    title: string;
    subtitle?: string;
    status?: string;
    city?: string;
    activeProcess?: number;
    associatedCandidates?: number;
    waitingForScreening?: number;
    openDate?: string;
    healthProfile?: string;
    postingCode?: string;
    recruiter?: string;
    recruitingCoordinator?: string;
    accountManager?: string;
}

type JobTab = 'mine' | 'all';
type JobSort = 'match' | 'new' | 'urgency';

type RowBlockReason = 'referral' | 'linked' | null;

interface BulkAddToFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (jobIds: string[], options?: JobFilterSaveOptions) => void | Promise<void>;
    /** Number of candidates being added (for header). */
    selectedCount: number;
    jobs?: BulkJobPickerOption[];
    candidateBackendIds?: string[];
    candidateDisplayName?: string;
    /** Match % by job id — used when adding a single candidate. */
    matchScoresByJobId?: Record<string, number>;
    /** Recruiter name on job row — for "המשרות שלי" tab. */
    currentUserRecruiter?: string;
}

function normId(id: string | null | undefined): string {
    return String(id ?? '')
        .trim()
        .toLowerCase();
}

function normRecruiter(s: string | null | undefined): string {
    return String(s ?? '')
        .trim()
        .toLowerCase();
}

function jobAssignedToRecruiter(job: BulkJobPickerOption, recruiterNorm: string): boolean {
    if (!recruiterNorm) return false;
    for (const raw of [job.recruiter, job.recruitingCoordinator, job.accountManager]) {
        if (normRecruiter(raw) === recruiterNorm) return true;
    }
    return false;
}

function getScoreColorClass(score: number): string {
    if (score >= 90) return 'text-green-600 border-green-200 bg-green-50';
    if (score >= 75) return 'text-yellow-600 border-yellow-200 bg-yellow-50';
    if (score >= 60) return 'text-orange-600 border-orange-200 bg-orange-50';
    return 'text-red-600 border-red-200 bg-red-50';
}

function urgencyRank(job: BulkJobPickerOption): number {
    const h = getJobHealthData(job);
    if (h.color.includes('red-500') && h.pulse) return 100;
    if (h.color.includes('red-500')) return 90;
    if (h.color.includes('orange-500')) return 70;
    if (h.color.includes('yellow')) return 20;
    return 0;
}

function isUrgentJob(job: BulkJobPickerOption): boolean {
    const h = getJobHealthData(job);
    return h.color.includes('red-500') || h.color.includes('orange-500');
}

function urgentLabel(job: BulkJobPickerOption): string {
    const h = getJobHealthData(job);
    if (h.color.includes('red-500')) return 'דחוף';
    if (h.color.includes('orange-500')) return 'דחיפות';
    return '';
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
    candidateDisplayName,
    matchScoresByJobId,
    currentUserRecruiter,
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(() => new Set());
    const [notes, setNotes] = useState('');
    const [showNotes, setShowNotes] = useState(false);
    const [jobTab, setJobTab] = useState<JobTab>('mine');
    const [jobSort, setJobSort] = useState<JobSort>('match');
    const [metaLoading, setMetaLoading] = useState(false);
    const [jobIdsWithReferral, setJobIdsWithReferral] = useState<Set<string>>(() => new Set());
    /** jobId -> count of selected candidates already linked to this job */
    const [linkedCountByJobId, setLinkedCountByJobId] = useState<Map<string, number>>(() => new Map());

    const [fetchedJobs, setFetchedJobs] = useState<BulkJobPickerOption[]>([]);
    const [jobsFetchSettled, setJobsFetchSettled] = useState(false);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);
    const [focusedRowIndex, setFocusedRowIndex] = useState(0);
    const [saving, setSaving] = useState(false);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const candidateCount = Math.max(1, selectedCount || candidateBackendIds.length || 1);
    const singleCandidate = candidateCount === 1 && candidateBackendIds.length === 1;
    const showMatchSort = singleCandidate && matchScoresByJobId && Object.keys(matchScoresByJobId).length > 0;

    useEffect(() => {
        if (!isOpen || !apiBase) return;
        let cancelled = false;
        setJobsLoading(true);
        setJobsError(null);
        setJobsFetchSettled(false);
        void (async () => {
            try {
                const res = await fetch(`${apiBase}/api/jobs/for-picker`, {
                    headers: { ...authHeaders(), Accept: 'application/json' },
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error('שגיאה בטעינת המשרות');
                const data = await res.json();
                const list: unknown[] = Array.isArray(data)
                    ? data
                    : Array.isArray((data as { rows?: unknown[] })?.rows)
                      ? (data as { rows: unknown[] }).rows
                      : [];
                if (cancelled) return;
                setFetchedJobs(
                    list.map((raw) => {
                        const j = raw as Record<string, unknown>;
                        return {
                            id: String(j.id),
                            title: String(j.title || 'ללא שם'),
                            subtitle: j.client ? String(j.client) : undefined,
                            status: j.status != null ? String(j.status) : undefined,
                            city: j.city ? String(j.city) : undefined,
                            activeProcess: typeof j.activeProcess === 'number' ? j.activeProcess : 0,
                            associatedCandidates:
                                typeof j.associatedCandidates === 'number' ? j.associatedCandidates : 0,
                            waitingForScreening:
                                typeof j.waitingForScreening === 'number' ? j.waitingForScreening : 0,
                            openDate: j.openDate ? String(j.openDate) : undefined,
                            healthProfile: j.healthProfile ? String(j.healthProfile) : undefined,
                            postingCode: j.postingCode != null ? String(j.postingCode).trim() : undefined,
                            recruiter: j.recruiter != null ? String(j.recruiter).trim() : undefined,
                            recruitingCoordinator:
                                j.recruitingCoordinator != null
                                    ? String(j.recruitingCoordinator).trim()
                                    : undefined,
                            accountManager:
                                j.accountManager != null ? String(j.accountManager).trim() : undefined,
                        };
                    }),
                );
            } catch (e) {
                if (!cancelled) setJobsError((e as Error).message || 'שגיאה בטעינת המשרות');
            } finally {
                if (!cancelled) {
                    setJobsLoading(false);
                    setJobsFetchSettled(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, apiBase]);

    const jobsFromApi = useMemo(() => {
        if (jobsFetchSettled) return fetchedJobs;
        if (jobsFromProp.length > 0) return jobsFromProp;
        return fetchedJobs;
    }, [jobsFetchSettled, fetchedJobs, jobsFromProp]);

    const selectedCandidateKeys = useMemo(() => {
        const s = new Set<string>();
        for (const id of candidateBackendIds) {
            const k = normId(id);
            if (k) s.add(k);
        }
        return s;
    }, [candidateBackendIds]);

    const selectedCandidateIdsList = useMemo(
        () => candidateBackendIds.map((id) => String(id).trim()).filter(Boolean),
        [candidateBackendIds],
    );

    const fetchReferralJobIds = useCallback(async (): Promise<Set<string>> => {
        const base = (apiBase || '').replace(/\/$/, '');
        const url = base ? `${base}/api/email-uploads/screening-cv-referrals` : '/api/email-uploads/screening-cv-referrals';
        const token = getToken();
        if (!token) return new Set();

        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) return new Set();

        const data: unknown = await res.json().catch(() => null);
        type Row = { candidateId?: string | null; jobId?: string | null };
        const list: Row[] = Array.isArray(data)
            ? (data as Row[])
            : data && typeof data === 'object' && data !== null && 'items' in data
              ? ((data as { items?: Row[] }).items ?? [])
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

    const fetchLinkedCounts = useCallback(async (): Promise<Map<string, number>> => {
        const map = new Map<string, number>();
        if (selectedCandidateIdsList.length === 0) return map;
        const results = await Promise.all(
            selectedCandidateIdsList.map(async (cid) => {
                try {
                    const links = await fetchCandidateLinkedJobs(cid);
                    return { cid, jobIds: links.map((l) => normId(l.jobId)) };
                } catch {
                    return { cid, jobIds: [] as string[] };
                }
            }),
        );
        for (const { jobIds } of results) {
            for (const jid of jobIds) {
                if (!jid) continue;
                map.set(jid, (map.get(jid) ?? 0) + 1);
            }
        }
        return map;
    }, [selectedCandidateIdsList]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
            setSelectedJobIds(new Set());
            setNotes('');
            setShowNotes(false);
            setMetaLoading(false);
            setJobIdsWithReferral(new Set());
            setLinkedCountByJobId(new Map());
            setFetchedJobs([]);
            setJobsFetchSettled(false);
            setJobsError(null);
            setFocusedRowIndex(0);
            setSaving(false);
            setJobTab('mine');
            setJobSort('match');
            return;
        }

        const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);

        let cancelled = false;
        if (selectedCandidateKeys.size === 0) {
            setJobIdsWithReferral(new Set());
            setLinkedCountByJobId(new Map());
            setMetaLoading(false);
            return () => clearTimeout(t);
        }

        setMetaLoading(true);
        void Promise.all([fetchReferralJobIds(), fetchLinkedCounts()])
            .then(([referrals, linked]) => {
                if (cancelled) return;
                setJobIdsWithReferral(referrals);
                setLinkedCountByJobId(linked);
            })
            .catch(() => {
                if (!cancelled) {
                    setJobIdsWithReferral(new Set());
                    setLinkedCountByJobId(new Map());
                }
            })
            .finally(() => {
                if (!cancelled) setMetaLoading(false);
            });

        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [isOpen, fetchReferralJobIds, fetchLinkedCounts, selectedCandidateKeys.size]);

    const myRecruiterNorm = normRecruiter(currentUserRecruiter);
    const hasMyJobsTab = Boolean(myRecruiterNorm);

    useEffect(() => {
        if (!hasMyJobsTab && jobTab === 'mine') setJobTab('all');
    }, [hasMyJobsTab, jobTab]);

    useEffect(() => {
        if (showMatchSort) setJobSort('match');
    }, [showMatchSort, isOpen]);

    const openJobs = useMemo(
        () => jobsFromApi.filter((j) => jobIsOpenForStaffPick(j.status)),
        [jobsFromApi],
    );

    useEffect(() => {
        if (!isOpen || !hasMyJobsTab || jobTab !== 'mine' || jobsLoading) return;
        const mineCount = openJobs.filter((j) => jobAssignedToRecruiter(j, myRecruiterNorm)).length;
        if (mineCount === 0 && openJobs.length > 0) setJobTab('all');
    }, [isOpen, hasMyJobsTab, jobTab, jobsLoading, openJobs, myRecruiterNorm]);

    const totalSelectedCandidates = selectedCandidateIdsList.length || candidateCount;

    const getRowBlockReason = useCallback(
        (job: BulkJobPickerOption): RowBlockReason => {
            const jid = normId(job.id);
            if (jobIdsWithReferral.has(jid)) return 'referral';
            const linked = linkedCountByJobId.get(jid) ?? 0;
            if (linked >= totalSelectedCandidates && totalSelectedCandidates > 0) return 'linked';
            return null;
        },
        [jobIdsWithReferral, linkedCountByJobId, totalSelectedCandidates],
    );

    const sortedFilteredJobs = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        let list = openJobs.filter((j) => {
            if (jobTab === 'mine' && hasMyJobsTab) {
                if (!jobAssignedToRecruiter(j, myRecruiterNorm)) return false;
            }
            if (!q) return true;
            const hay = [
                j.title,
                j.subtitle,
                j.city,
                j.postingCode,
                j.recruiter,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });

        list = [...list].sort((a, b) => {
            if (jobSort === 'match' && showMatchSort && matchScoresByJobId) {
                const sa = matchScoresByJobId[a.id] ?? matchScoresByJobId[normId(a.id)] ?? -1;
                const sb = matchScoresByJobId[b.id] ?? matchScoresByJobId[normId(b.id)] ?? -1;
                if (sb !== sa) return sb - sa;
                return a.title.localeCompare(b.title, 'he');
            }
            if (jobSort === 'new') {
                const da = a.openDate ? new Date(a.openDate).getTime() : 0;
                const db = b.openDate ? new Date(b.openDate).getTime() : 0;
                if (db !== da) return db - da;
                return a.title.localeCompare(b.title, 'he');
            }
            if (jobSort === 'urgency') {
                const ua = urgencyRank(a);
                const ub = urgencyRank(b);
                if (ub !== ua) return ub - ua;
                return a.title.localeCompare(b.title, 'he');
            }
            return a.title.localeCompare(b.title, 'he');
        });

        return list;
    }, [
        openJobs,
        searchTerm,
        jobTab,
        hasMyJobsTab,
        myRecruiterNorm,
        jobSort,
        showMatchSort,
        matchScoresByJobId,
    ]);

    useEffect(() => {
        if (!isOpen) return;
        setFocusedRowIndex((i) => {
            if (sortedFilteredJobs.length === 0) return 0;
            return Math.min(i, sortedFilteredJobs.length - 1);
        });
    }, [isOpen, sortedFilteredJobs.length]);

    useEffect(() => {
        const allowed = new Set(
            sortedFilteredJobs.filter((j) => getRowBlockReason(j) === null).map((j) => j.id),
        );
        setSelectedJobIds((prev) => {
            const next = new Set<string>();
            for (const id of prev) {
                if (allowed.has(id)) next.add(id);
            }
            return next.size === prev.size ? prev : next;
        });
    }, [sortedFilteredJobs, getRowBlockReason]);

    const toggleJob = useCallback(
        (jobId: string) => {
            const job = sortedFilteredJobs.find((j) => j.id === jobId);
            if (!job || getRowBlockReason(job)) return;
            setSelectedJobIds((prev) => {
                const next = new Set(prev);
                if (next.has(jobId)) next.delete(jobId);
                else next.add(jobId);
                return next;
            });
        },
        [sortedFilteredJobs, getRowBlockReason],
    );

    const handleSave = useCallback(async () => {
        const ids = [...selectedJobIds];
        if (ids.length === 0 || saving) return;
        setSaving(true);
        try {
            await onSave(ids, { notes: notes.trim() || undefined });
        } finally {
            setSaving(false);
        }
    }, [selectedJobIds, saving, onSave, notes]);

    const handleListKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (sortedFilteredJobs.length === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedRowIndex((i) => Math.min(i + 1, sortedFilteredJobs.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedRowIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === ' ') {
                e.preventDefault();
                const job = sortedFilteredJobs[focusedRowIndex];
                if (job) toggleJob(job.id);
            } else if (e.key === 'Enter' && selectedJobIds.size > 0) {
                e.preventDefault();
                void handleSave();
            }
        },
        [sortedFilteredJobs, focusedRowIndex, toggleJob, selectedJobIds.size, handleSave],
    );

    if (!isOpen) return null;

    const headerSubtitle =
        candidateDisplayName?.trim() ||
        (candidateCount > 1 ? `${candidateCount} מועמדים` : undefined);

    const selectedJobCount = selectedJobIds.size;
    const primaryLabel =
        selectedJobCount === 0
            ? 'בחר משרות לסינון'
            : selectedJobCount === 1
              ? 'הוסף לסינון במשרה אחת'
              : `הוסף לסינון ב-${selectedJobCount} משרות`;

    return (
        <div
            className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-bg-card flex flex-col max-h-[90vh] rounded-2xl shadow-xl border border-border-subtle w-full max-w-[640px] animate-scale-in relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleListKeyDown}
            >
                <div className="p-4 md:p-5 border-b border-border-subtle flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg font-bold text-text-default leading-tight">
                            הוספה לסינון משרה
                            {headerSubtitle ? (
                                <span className="text-text-muted font-semibold"> · {headerSubtitle}</span>
                            ) : null}
                        </h2>
                        <p className="text-xs text-text-muted mt-1.5">מוצגות משרות בסטטוס פתוח בלבד</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-text-muted hover:bg-bg-hover hover:text-text-default rounded-full transition-colors shrink-0"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-4 md:px-5 pt-3 pb-2 space-y-2 border-b border-border-subtle bg-bg-subtle/20">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="חיפוש לפי שם, מספר משרה, לקוח או עיר..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-border-default rounded-xl py-2.5 pr-9 pl-3 text-sm focus:ring-2 focus:border-primary-500 focus:outline-none"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {hasMyJobsTab ? (
                            <div className="flex rounded-lg border border-border-default overflow-hidden bg-white">
                                <button
                                    type="button"
                                    onClick={() => setJobTab('mine')}
                                    className={`px-3 py-1.5 font-medium transition-colors ${
                                        jobTab === 'mine'
                                            ? 'bg-primary-50 text-primary-700'
                                            : 'text-text-muted hover:bg-bg-subtle'
                                    }`}
                                >
                                    המשרות שלי
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setJobTab('all')}
                                    className={`px-3 py-1.5 font-medium transition-colors border-r border-border-default ${
                                        jobTab === 'all'
                                            ? 'bg-primary-50 text-primary-700'
                                            : 'text-text-muted hover:bg-bg-subtle'
                                    }`}
                                >
                                    כל המשרות
                                </button>
                            </div>
                        ) : null}
                        <label className="flex items-center gap-1.5 text-text-muted mr-auto">
                            <span className="shrink-0">מיון:</span>
                            <select
                                value={jobSort}
                                onChange={(e) => setJobSort(e.target.value as JobSort)}
                                className="border border-border-default rounded-lg py-1 px-2 bg-white text-text-default text-xs"
                            >
                                {showMatchSort ? <option value="match">התאמה</option> : null}
                                <option value="new">חדשות</option>
                                <option value="urgency">דחיפות</option>
                            </select>
                        </label>
                    </div>
                </div>

                <div
                    ref={listRef}
                    className="flex-1 overflow-y-auto min-h-0 max-h-[min(52vh,420px)] divide-y divide-border-subtle"
                    tabIndex={-1}
                >
                    {jobsLoading ? (
                        <div className="p-8 text-center text-text-muted text-sm">טוען משרות...</div>
                    ) : jobsError ? (
                        <div className="p-8 text-center text-red-600 text-sm">{jobsError}</div>
                    ) : metaLoading && selectedCandidateKeys.size > 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">טוען סטטוס מועמדים...</div>
                    ) : openJobs.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">אין משרות פתוחות</div>
                    ) : sortedFilteredJobs.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm space-y-2">
                            <p>
                                {jobTab === 'mine' && hasMyJobsTab
                                    ? 'אין משרות פתוחות שמשויכות אליך כמגייס/ת. נסה «כל המשרות».'
                                    : searchTerm.trim()
                                      ? 'לא נמצאו משרות לחיפוש זה'
                                      : 'לא נמצאו משרות'}
                            </p>
                            {jobTab === 'mine' && hasMyJobsTab && openJobs.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setJobTab('all')}
                                    className="text-primary-600 font-semibold hover:underline text-sm"
                                >
                                    הצג את כל המשרות ({openJobs.length})
                                </button>
                            ) : null}
                        </div>
                    ) : (
                        sortedFilteredJobs.map((job, index) => {
                            const block = getRowBlockReason(job);
                            const isSelected = selectedJobIds.has(job.id);
                            const isFocused = index === focusedRowIndex;
                            const days = daysOpenFromDate(job.openDate);
                            const linkedCount = linkedCountByJobId.get(normId(job.id)) ?? 0;
                            const matchScore =
                                showMatchSort && matchScoresByJobId
                                    ? (matchScoresByJobId[job.id] ??
                                      matchScoresByJobId[normId(job.id)])
                                    : undefined;
                            const urgent = isUrgentJob(job);
                            const dimmed = block !== null;

                            return (
                                <div
                                    key={job.id}
                                    role="button"
                                    tabIndex={dimmed ? -1 : 0}
                                    aria-disabled={dimmed}
                                    onClick={() => !dimmed && toggleJob(job.id)}
                                    onMouseEnter={() => setFocusedRowIndex(index)}
                                    className={`flex items-start gap-3 px-4 py-2.5 text-right transition-colors ${
                                        dimmed
                                            ? 'opacity-50 cursor-not-allowed bg-bg-subtle/40'
                                            : 'cursor-pointer hover:bg-bg-subtle/60'
                                    } ${isSelected && !dimmed ? 'bg-primary-50/70 ring-1 ring-inset ring-primary-200' : ''} ${
                                        isFocused && !dimmed ? 'outline outline-1 outline-primary-300/50 -outline-offset-1' : ''
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        disabled={dimmed}
                                        onChange={() => toggleJob(job.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="mt-1 w-4 h-4 rounded border-border-strong text-primary-600 focus:ring-primary-500 shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start gap-2 justify-between">
                                            <p
                                                className={`font-semibold text-sm leading-snug break-words ${
                                                    dimmed ? 'text-text-muted' : 'text-text-default'
                                                }`}
                                            >
                                                {job.title}
                                            </p>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {block === 'referral' ? (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-subtle text-text-muted">
                                                        כבר נשלח
                                                    </span>
                                                ) : block === 'linked' ? (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-subtle text-text-muted">
                                                        כבר בסינון
                                                    </span>
                                                ) : urgent ? (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
                                                        {urgentLabel(job)}
                                                    </span>
                                                ) : null}
                                                {matchScore != null && !dimmed ? (
                                                    <span
                                                        className={`text-[11px] font-bold px-1.5 py-0.5 rounded border tabular-nums ${getScoreColorClass(matchScore)}`}
                                                    >
                                                        {matchScore}%
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        {job.postingCode ? (
                                            <p className="text-[11px] text-text-muted mt-0.5 font-mono">
                                                {job.postingCode}
                                            </p>
                                        ) : null}
                                        <p className="text-xs text-text-subtle mt-0.5">
                                            {[job.subtitle, job.city].filter(Boolean).join(' · ')}
                                            {days > 0 ? ` · פתוחה ${days} ימים` : ''}
                                            {job.associatedCandidates != null && job.associatedCandidates > 0
                                                ? ` · ${job.associatedCandidates} מועמדים`
                                                : ''}
                                        </p>
                                        {!block && linkedCount > 0 && linkedCount < totalSelectedCandidates ? (
                                            <p className="text-[10px] text-amber-700 mt-0.5">
                                                חלק מהמועמדים כבר בסינון במשרה זו
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="p-4 md:p-5 border-t border-border-subtle bg-bg-subtle/20 space-y-3">
                    {!showNotes ? (
                        <button
                            type="button"
                            onClick={() => setShowNotes(true)}
                            className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                            + הוסף הערה
                        </button>
                    ) : (
                        <div>
                            <label className="text-xs font-medium text-text-default block mb-1">
                                הערות לסינון (אופציונלי)
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="הערה שתישמר על השיוכים שנוצרים..."
                                className="w-full bg-white border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:border-primary-500 min-h-[72px] resize-none"
                            />
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <p className="text-xs text-text-muted sm:flex-1 order-2 sm:order-1">
                            {selectedJobCount === 0
                                ? 'לא נבחרו משרות'
                                : selectedJobCount === 1
                                  ? 'נבחרה משרה אחת'
                                  : `נבחרו ${selectedJobCount} משרות`}
                        </p>
                        <div className="flex gap-2 order-1 sm:order-2 sm:shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2.5 rounded-xl font-semibold text-text-default hover:bg-bg-hover transition-colors border border-border-default text-sm"
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleSave()}
                                disabled={selectedJobCount === 0 || saving || metaLoading}
                                className="px-4 py-2.5 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm min-w-[140px]"
                            >
                                {saving ? 'שומר...' : primaryLabel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkAddToFilterModal;
