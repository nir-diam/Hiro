
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, TableCellsIcon, Squares2X2Icon,
    PlusIcon, ChevronUpIcon, FolderIcon, ArchiveBoxIcon, ArrowPathIcon,
    ChatBubbleBottomCenterTextIcon, EnvelopeIcon, WhatsappIcon, XMarkIcon, SparklesIcon,
    MapPinIcon, CheckCircleIcon, FlagIcon, ChevronLeftIcon, ComputerDesktopIcon, VideoCameraIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { MatchScorePopup, matchScorePopupPositionFromEvent, useMatchScorePopupDismiss } from './MatchScorePopup';
import type { MatchScoreBreakdownData } from './MatchScoreBreakdownPanel';
import TagMatchPanel, { type TagMatchCategory } from './TagMatchPanel';
import {
    buildJobTagMatchCategories,
    type JobTagMatchInput,
} from '../utils/jobTagMatchCategories';
import {
    digitalScreeningBadgeClass,
    summarizeDigitalScreening,
    type DigitalAnswerRow,
    type JobDigitalQuestion,
} from '../utils/digitalScreening';

type CandidateStatus = 'חדש' | 'סינון טלפוני' | 'ראיון' | 'הצעה' | 'נדחה';

/** Calendar add in UTC so server ISO timestamps behave consistently across timezones. */
function addCalendarMonthsFromIsoUtc(iso: string, months: number): Date {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return new Date(0);
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d;
}

/** Newer application is "too soon" vs an older one with the same name+title. */
function withinReturnMonthsWindow(olderIso: string, newerIso: string, returnMonths: number): boolean {
    const oTs = new Date(olderIso).getTime();
    const nTs = new Date(newerIso).getTime();
    if (!Number.isFinite(oTs) || !Number.isFinite(nTs) || nTs <= oTs) return false;
    const rm = Math.max(0, returnMonths);
    if (rm === 0) return false;
    const cutoff = addCalendarMonthsFromIsoUtc(olderIso, rm);
    if (nTs <= cutoff.getTime()) return true;
    // With returnMonths === 1, a strict month boundary can miss ~5-week gaps (e.g. Feb 28 → Apr 4).
    if (rm === 1) {
        const maxMs = 45 * 24 * 60 * 60 * 1000;
        return nTs - oTs <= maxMs;
    }
    return false;
}

function candidateDuplicateKey(c: { name?: string; title?: string }) {
    return `${String(c.name || '').trim()}|${String(c.title || '').trim()}`;
}

type ParameterMatchStatus = 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';

type JobCandidateRow = {
    matchScore?: number;
    scoreBreakdown?: {
        geoDistance?: number | null;
        geoMissing?: boolean;
        semanticScore?: number;
        vector?: number;
        tagsScore?: number;
        tags?: number;
        geoScore?: number;
        geo?: number;
        intentScore?: number;
        intent?: number;
        coreScore?: number;
        penaltyReasons?: { label: string; amount: number }[];
    } | null;
    parameterMatches?: Partial<Record<
        | 'salary'
        | 'scope'
        | 'mobility'
        | 'license'
        | 'age'
        | 'gender'
        | 'mandatory_skill'
        | 'mandatory_language'
        | 'work_hours'
        | 'availability',
        ParameterMatchStatus
    >>;
};

type JobGeoSlice = {
    city?: string;
    location?: string;
    region?: string;
    title?: string;
    client?: string;
    role?: string;
    field?: string;
    description?: string;
    requirements?: unknown;
    skills?: unknown;
    languages?: unknown;
};

function jobRecordToTagMatchJob(job: JobGeoSlice | null): JobTagMatchInput {
    const req = job?.requirements;
    const requirements = Array.isArray(req) ? req.map((r) => String(r ?? '').trim()).filter(Boolean) : [];
    return {
        title: typeof job?.title === 'string' ? job.title : undefined,
        role: typeof job?.role === 'string' ? job.role : undefined,
        field: typeof job?.field === 'string' ? job.field : undefined,
        skills: Array.isArray(job?.skills) ? (job.skills as JobTagMatchInput['skills']) : undefined,
        languages: Array.isArray(job?.languages) ? (job.languages as JobTagMatchInput['languages']) : undefined,
        requirements,
    };
}

function stripGapChipLabel(label: string): string {
    return label
        .replace(/\s*\(חובה\)\s*$/u, '')
        .replace(/\s*\(שלילי\)\s*$/u, '')
        .trim();
}

function isNegativeGapChipLabel(label: string): boolean {
    return /\(\s*שלילי\s*\)\s*$/u.test(label.trim());
}

function jobCandidateGapChipLabels(
    categories: TagMatchCategory[],
    parameterMatches: JobCandidateRow['parameterMatches'],
    max = 8,
): string[] {
    const hideMandatoryGaps = parameterMatches?.mandatory_skill === 'match';
    const out: string[] = [];
    for (const cat of categories) {
        for (const ch of cat.chips) {
            if (ch.state !== 'gap' || ch.satisfiesRequirement) continue;
            const negativeGap = isNegativeGapChipLabel(ch.label);
            if (hideMandatoryGaps && !negativeGap) continue;
            out.push(stripGapChipLabel(ch.label));
        }
    }
    return out.slice(0, max);
}

const GEO_COORD_CACHE = new Map<string, { lat: number; lon: number } | null>();

function buildJobGeoQuery(job: JobGeoSlice | null): string {
    if (!job) return '';
    const loc = String(job.location ?? '').trim();
    const city = String(job.city ?? '').trim();
    const region = String(job.region ?? '').trim();
    const parts: string[] = [];
    const push = (s: string) => {
        if (!s) return;
        if (!parts.some((p) => p.toLowerCase() === s.toLowerCase())) parts.push(s);
    };
    push(loc);
    push(city);
    push(region);
    return parts.join(', ');
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const x =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function geocodeOpenMeteo(query: string): Promise<{ lat: number; lon: number } | null> {
    const key = query.trim().toLowerCase();
    if (!key) return null;
    if (GEO_COORD_CACHE.has(key)) return GEO_COORD_CACHE.get(key) ?? null;
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
            query.trim(),
        )}&count=1&language=en&format=json&countryCode=IL`;
        const res = await fetch(url);
        if (!res.ok) {
            GEO_COORD_CACHE.set(key, null);
            return null;
        }
        const data = (await res.json()) as { results?: { latitude: number; longitude: number }[] };
        const row = data.results?.[0];
        if (
            !row ||
            typeof row.latitude !== 'number' ||
            typeof row.longitude !== 'number' ||
            !Number.isFinite(row.latitude) ||
            !Number.isFinite(row.longitude)
        ) {
            GEO_COORD_CACHE.set(key, null);
            return null;
        }
        const pt = { lat: row.latitude, lon: row.longitude };
        GEO_COORD_CACHE.set(key, pt);
        return pt;
    } catch {
        GEO_COORD_CACHE.set(key, null);
        return null;
    }
}

/** Straight-line km from matching engine (same as Sonar), else client geocode fallback; not driving distance. */
function jobCandidateDistanceLabel(
    c: JobCandidateRow,
    jobHasGeoTarget: boolean,
    clientKm: number | null | undefined,
    clientPending: boolean,
    t: (key: string, opts?: Record<string, string | number>) => string,
): string {
    const raw = c?.scoreBreakdown?.geoDistance;
    const km = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : null;
    if (km != null) return t('job.sonar.distance_km', { km });
    if (clientPending && clientKm === undefined) {
        return t('job_candidates.distance_computing');
    }
    const fk = typeof clientKm === 'number' && Number.isFinite(clientKm) ? Math.round(clientKm) : null;
    if (fk != null) return t('job.sonar.distance_km', { km: fk });
    if (!jobHasGeoTarget) return t('job.sonar.distance_not_on_job');
    return t('job.sonar.distance_na');
}

const statusStyles: { [key in CandidateStatus]: string } = {
  'חדש': 'bg-blue-100 text-blue-800 border-blue-200',
  'סינון טלפוני': 'bg-purple-100 text-purple-800 border-purple-200',
  'ראיון': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'הצעה': 'bg-green-100 text-green-800 border-green-200',
  'נדחה': 'bg-gray-100 text-gray-700 border-gray-200',
};

const CandidateMatchSummaryLine: React.FC<{ candidate: JobCandidateRow }> = ({ candidate }) => {
    type Dot = { label: string; value: string; ok: boolean; muted?: boolean };
    const pm = candidate.parameterMatches;
    const scoreOk = (candidate.matchScore ?? 0) >= 70;
    const rawGeoKm = candidate.scoreBreakdown?.geoDistance;
    const geoKm =
        typeof rawGeoKm === 'number' && Number.isFinite(rawGeoKm) ? Math.round(rawGeoKm) : null;

    const map: {
        key: keyof NonNullable<typeof pm>;
        label: string;
        matchLabel: string;
        mismatchLabel: string;
        missingLabel: string;
    }[] = [
        { key: 'salary', label: 'ציפיות שכר', matchLabel: 'תואם', mismatchLabel: 'פער בשכר', missingLabel: 'מידע חסר' },
        { key: 'scope', label: 'שעות משרה', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
        { key: 'work_hours', label: 'שעות עבודה', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
        { key: 'availability', label: 'זמינות', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
        { key: 'mobility', label: 'ניידות', matchLabel: 'בסדר', mismatchLabel: 'נדרש רכב', missingLabel: 'מידע חסר' },
        { key: 'license', label: 'רישיון נהיגה', matchLabel: 'יש רישיון', mismatchLabel: 'נדרש רישיון', missingLabel: 'מידע חסר' },
        { key: 'age', label: 'גיל', matchLabel: 'מתאים', mismatchLabel: 'לא בטווח גיל', missingLabel: 'מידע חסר' },
        { key: 'gender', label: 'מגדר', matchLabel: 'מתאים', mismatchLabel: 'מגבלת מגדר', missingLabel: 'מידע חסר' },
        { key: 'mandatory_skill', label: 'מיומנות חובה', matchLabel: 'יש', mismatchLabel: 'חסרה', missingLabel: 'מידע חסר' },
        { key: 'mandatory_language', label: 'שפה חובה', matchLabel: 'יש', mismatchLabel: 'חסרה', missingLabel: 'מידע חסר' },
    ];

    const items: Dot[] = [
        { label: 'התאמה', value: `${candidate.matchScore ?? 0}%`, ok: scoreOk },
        {
            label: 'מרחק',
            value: geoKm != null ? `${geoKm} ק"מ` : 'לא זמין',
            ok: geoKm != null,
            muted: geoKm == null,
        },
        ...map.flatMap(({ key, label, matchLabel, mismatchLabel, missingLabel }) => {
            const v = pm?.[key];
            if (v === 'match') return [{ label, value: matchLabel, ok: true }];
            if (v === 'missing') return [{ label, value: missingLabel, ok: false }];
            if (v === 'mismatch' || v === 'gap') return [{ label, value: mismatchLabel, ok: false }];
            return [];
        }),
    ];

    if (items.length <= 2 && !pm) return null;

    return (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-1 shrink-0">
                    <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            item.muted ? 'bg-gray-400' : item.ok ? 'bg-green-500' : 'bg-red-500'
                        }`}
                    />
                    <span className="text-[10px] text-text-muted">{item.label}:</span>
                    <span
                        className={`text-[10px] font-bold ${
                            item.muted ? 'text-text-muted' : item.ok ? 'text-text-default' : 'text-red-700'
                        }`}
                    >
                        {item.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

const JobCandidateTagGapsBanner: React.FC<{
    candidate: JobCandidateRow & Record<string, unknown>;
    tagJobModel: JobTagMatchInput;
    tagLoadingId: string | null;
    onOpenTagPanel: (candidate: JobCandidateRow & Record<string, unknown>) => void;
    t: (key: string, opts?: Record<string, string | number>) => string;
}> = ({ candidate, tagJobModel, tagLoadingId, onOpenTagPanel, t }) => {
    const cid = candidate.id != null ? String(candidate.id) : '';
    const categories = buildJobTagMatchCategories(tagJobModel, candidate);
    const gaps = jobCandidateGapChipLabels(categories, candidate.parameterMatches);
    if (!gaps.length) return null;

    return (
        <div
            className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-red-50 p-2.5 rounded-lg border border-red-100 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="font-bold text-red-600 text-[11px] shrink-0">
                    {t('job.sonar.gaps_tags_heading')}
                </span>
                <span className="text-red-700 text-[11px]">{gaps.join(', ')}</span>
            </div>
            <button
                type="button"
                disabled={tagLoadingId === cid}
                onClick={() => void onOpenTagPanel(candidate)}
                className="text-[10px] font-bold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md bg-white border border-border-default shadow-sm hover:border-primary-200 transition-colors shrink-0 whitespace-nowrap"
            >
                {tagLoadingId === cid ? t('job.sonar.loading_tags') : t('job.sonar.gaps_more_details')}
            </button>
        </div>
    );
};

type CandidateDigitalScreening = {
    digitalAnswers?: DigitalAnswerRow[];
    screeningStatus?: string;
    rejectionReason?: string;
    rejectionNotes?: string;
};

type ScreeningModalState = {
    candidateId: string;
    candidateName: string;
    digitalAnswers: DigitalAnswerRow[];
    screeningStatus?: string;
    rejectionReason?: string;
};

const DigitalScreeningAnswersModal: React.FC<{
    isOpen: boolean;
    candidateName: string;
    questions: JobDigitalQuestion[];
    digitalAnswers: DigitalAnswerRow[];
    screeningStatus?: string;
    rejectionReason?: string;
    onClose: () => void;
}> = ({ isOpen, candidateName, questions, digitalAnswers, screeningStatus, rejectionReason, onClose }) => {
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const summary = summarizeDigitalScreening(questions, digitalAnswers, screeningStatus, rejectionReason);
    const byId = new Map<number, DigitalAnswerRow>(digitalAnswers.map((a) => [Number(a.questionId), a]));
    const ordered = [...questions]
        .filter((q) => String(q?.text || '').trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const questionTypeLabel = (type?: string) => {
        switch (type) {
            case 'yes_no':
                return 'כן / לא';
            case 'multiple_choice':
                return 'רב-ברירה';
            case 'video':
                return 'וידאו';
            default:
                return 'טקסט חופשי';
        }
    };

    const modal = (
        <div
            className="fixed inset-0 z-[10090] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            dir="rtl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="digital-screening-modal-title"
            onClick={onClose}
        >
            <div
                className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl border border-border-default flex flex-col max-h-[min(85vh,calc(100vh-2rem))]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-border-default flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-1">שאלון דיגיטלי</p>
                        <h3 id="digital-screening-modal-title" className="text-lg font-black text-text-default">{candidateName}</h3>
                        <span
                            className={`inline-flex mt-2 text-[11px] font-bold px-2.5 py-1 rounded-full border ${digitalScreeningBadgeClass(summary.status)}`}
                        >
                            {summary.label}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-subtle text-text-muted"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {ordered.length === 0 ? (
                        <p className="text-sm text-text-muted text-center py-8">אין שאלות במשרה זו.</p>
                    ) : (
                        ordered.map((q, index) => {
                            const row = byId.get(Number(q.id));
                            const answer = String(row?.answer || '').trim();
                            const isVideo = q.type === 'video' || answer === '[video]';
                            return (
                                <div
                                    key={q.id}
                                    className="rounded-xl border border-border-default bg-white p-4 shadow-sm"
                                >
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className="text-xs font-bold text-text-muted">#{index + 1}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted bg-bg-subtle px-2 py-0.5 rounded">
                                            {questionTypeLabel(q.type)}
                                        </span>
                                        {q.disqualifyIfWrong ? (
                                            <span className="text-[10px] bg-gray-800 text-white px-1.5 rounded font-bold">
                                                שאלה פוסלת
                                            </span>
                                        ) : null}
                                    </div>
                                    <p className="text-sm font-semibold text-text-default mb-3">{q.text}</p>
                                    {!answer ? (
                                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            לא נענה
                                        </p>
                                    ) : isVideo ? (
                                        <div className="flex items-center gap-3 bg-bg-subtle border border-border-default rounded-xl p-4">
                                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                                <VideoCameraIcon className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-text-default">וידאו הוקלט</p>
                                                <p className="text-xs text-text-muted mt-0.5">
                                                    הקלטת הווידאו נשמרה במערכת. צפייה בווידאו תהיה זמינה בקרוב.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-text-default bg-bg-subtle border border-border-default rounded-xl px-3 py-2.5 whitespace-pre-wrap">
                                            {answer}
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    )}
                    {summary.failedReasons.length > 0 ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                            <p className="font-bold mb-1">סיבות פסילה</p>
                            <ul className="list-disc list-inside space-y-1">
                                {summary.failedReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
};

interface JobCandidatesViewProps {
    openSummaryDrawer: (candidate: any | number) => void;
    jobId: string | number;
}

const JobCandidatesView: React.FC<JobCandidatesViewProps> = ({ openSummaryDrawer, jobId }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [job, setJob] = useState<JobGeoSlice | null>(null);
    const [clientKmByCandidateId, setClientKmByCandidateId] = useState<Record<string, number | null>>({});
    const [clientGeoPending, setClientGeoPending] = useState(false);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('הכל');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [returnMonths, setReturnMonths] = useState(3);
    const [activeMatchPopup, setActiveMatchPopup] = useState<{ id: string; x: number; y: number } | null>(null);
    const [tagPanelCategories, setTagPanelCategories] = useState<TagMatchCategory[] | null>(null);
    const [tagPanelTitle, setTagPanelTitle] = useState('');
    const [tagLoadingId, setTagLoadingId] = useState<string | null>(null);
    const [digitalQuestions, setDigitalQuestions] = useState<JobDigitalQuestion[]>([]);
    const [screeningModal, setScreeningModal] = useState<ScreeningModalState | null>(null);
    const clientGeoRunRef = useRef(0);

    const tagJobModel = useMemo(() => jobRecordToTagMatchJob(job), [job]);
    const showDigitalScreeningColumn = digitalQuestions.length > 0;

    const authHeaders = useCallback((): HeadersInit => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        return headers;
    }, []);

    const enrichCandidateForTags = useCallback(
        async (c: Record<string, unknown>): Promise<Record<string, unknown>> => {
            const cid = c.id != null ? String(c.id) : '';
            const hasDetails = Array.isArray(c.tagDetails) && (c.tagDetails as unknown[]).length > 0;
            if (!apiBase || !cid || hasDetails) return c;
            try {
                const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(cid)}`, {
                    headers: authHeaders(),
                    cache: 'no-store',
                });
                if (!res.ok) return c;
                const full = await res.json();
                return full && typeof full === 'object' ? { ...c, ...full } : c;
            } catch {
                return c;
            }
        },
        [apiBase, authHeaders],
    );

    const openTagPanel = useCallback(
        async (candidate: JobCandidateRow & Record<string, unknown>) => {
            const cid = candidate.id != null ? String(candidate.id) : '';
            const name = String(candidate.name ?? '').trim() || cid;
            setTagPanelTitle(name);
            setTagLoadingId(cid);
            setTagPanelCategories(null);
            try {
                const cand = await enrichCandidateForTags(candidate);
                const categories = buildJobTagMatchCategories(tagJobModel, cand);
                setTagPanelCategories(categories);
            } finally {
                setTagLoadingId(null);
            }
        },
        [enrichCandidateForTags, tagJobModel],
    );

    const closeTagPanel = useCallback(() => {
        setTagPanelCategories(null);
        setTagPanelTitle('');
    }, []);

    useEffect(() => {
        if (!apiBase || !jobId) return;
        let active = true;
        setLoadingCandidates(true);
        setFetchError(null);

        (async () => {
            try {
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
                const headers: HeadersInit = {};
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`${apiBase}/api/jobs/${jobId}/candidates`, { headers });
                if (!res.ok) {
                    throw new Error('Failed to load candidates for this job');
                }
                const payload = await res.json();
                if (!active) return;
                setJob({
                    city: payload.job?.city,
                    location: payload.job?.location,
                    region: payload.job?.region,
                    title: payload.job?.title,
                    client: payload.job?.client,
                    role: payload.job?.role,
                    field: payload.job?.field,
                    description: payload.job?.description,
                    requirements: payload.job?.requirements,
                    skills: payload.job?.skills,
                    languages: payload.job?.languages,
                });
                const jobDig = Array.isArray(payload.job?.digitalQuestions)
                    ? (payload.job.digitalQuestions as JobDigitalQuestion[])
                    : [];
                setDigitalQuestions(jobDig.filter((q) => String(q?.text || '').trim()));
                setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
                const rm = Number(payload.returnMonths);
                setReturnMonths(Number.isFinite(rm) && rm >= 0 ? rm : 3);
            } catch (err) {
                console.error('[JobCandidatesView] failed to load job candidates', err);
                if (active) setFetchError((err as Error).message || 'נכשל בטעינת מועמדים');
            } finally {
                if (active) setLoadingCandidates(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [apiBase, jobId]);

    const filteredCandidates = useMemo(() => {
        return candidates
            .filter((c) => statusFilter === 'הכל' || c.status === statusFilter)
            .filter((c) =>
                c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.title.toLowerCase().includes(searchTerm.toLowerCase())
            );
    }, [candidates, searchTerm, statusFilter]);

    /** Newer row (same name+title) is muted when it falls within `returnMonths` of an older association. */
    const duplicateNewerGreyIds = useMemo(() => {
        const months = Math.max(0, returnMonths);
        const grey = new Set<string>();
        for (const c of candidates) {
            const ts = c.createdDate ? new Date(c.createdDate).getTime() : NaN;
            if (!Number.isFinite(ts)) continue;
            const key = candidateDuplicateKey(c);
            for (const o of candidates) {
                if (o.id === c.id) continue;
                if (candidateDuplicateKey(o) !== key) continue;
                const oTs = o.createdDate ? new Date(o.createdDate).getTime() : NaN;
                if (!Number.isFinite(oTs) || oTs >= ts) continue;
                if (withinReturnMonthsWindow(String(o.createdDate), String(c.createdDate), months)) {
                    grey.add(c.id);
                    break;
                }
            }
        }
        return grey;
    }, [candidates, returnMonths]);

    const handleScoreClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (activeMatchPopup?.id === id) {
            setActiveMatchPopup(null);
            return;
        }
        setActiveMatchPopup({ id, ...matchScorePopupPositionFromEvent(e) });
    };

    useMatchScorePopupDismiss(Boolean(activeMatchPopup), () => setActiveMatchPopup(null));

    const topMatchCandidate = useMemo(() => {
        if (!filteredCandidates.length) return null;
        return [...filteredCandidates].sort(
            (a, b) => (Number(b.matchScore) || 0) - (Number(a.matchScore) || 0),
        )[0];
    }, [filteredCandidates]);

    const activePopupCandidate = activeMatchPopup
        ? filteredCandidates.find((c) => String(c.id) === activeMatchPopup.id)
        : null;

    const jobGeoQuery = useMemo(() => buildJobGeoQuery(job), [job]);
    const jobHasGeoTarget = Boolean(jobGeoQuery.trim());
    const jobAddress = job?.location || job?.city || 'תל אביב';

    useEffect(() => {
        const disabled =
            typeof import.meta !== 'undefined' && String(import.meta.env?.VITE_HIRO_DISABLE_GEOCODING ?? '') === '1';
        if (disabled) {
            setClientKmByCandidateId({});
            setClientGeoPending(false);
            return;
        }
        if (!jobHasGeoTarget || !candidates.length) {
            setClientKmByCandidateId({});
            setClientGeoPending(false);
            return;
        }

        const runId = ++clientGeoRunRef.current;
        setClientGeoPending(true);

        void (async () => {
            try {
                const jobPt = await geocodeOpenMeteo(jobGeoQuery);
                if (clientGeoRunRef.current !== runId) return;
                if (!jobPt) {
                    const empty: Record<string, number | null> = {};
                    for (const c of candidates) {
                        if (c?.id != null) empty[String(c.id)] = null;
                    }
                    setClientKmByCandidateId(empty);
                    return;
                }
                const out: Record<string, number | null> = {};
                for (const c of candidates) {
                    if (clientGeoRunRef.current !== runId) return;
                    const id = c?.id != null ? String(c.id) : '';
                    if (!id) continue;
                    const addr = String(c.address ?? '').trim();
                    if (!addr) {
                        out[id] = null;
                        continue;
                    }
                    const candPt = await geocodeOpenMeteo(addr);
                    if (clientGeoRunRef.current !== runId) return;
                    out[id] = candPt ? haversineKm(jobPt, candPt) : null;
                }
                if (clientGeoRunRef.current === runId) setClientKmByCandidateId(out);
            } finally {
                if (clientGeoRunRef.current === runId) setClientGeoPending(false);
            }
        })();
    }, [candidates, jobGeoQuery, jobHasGeoTarget]);

    const handleNavigate = (e: React.MouseEvent, candidateAddress: string) => {
        e.stopPropagation();
        if (!candidateAddress) return;
        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(candidateAddress)}&destination=${encodeURIComponent(jobAddress)}&travelmode=driving`;
        window.open(url, '_blank');
    };

    const getCandidateScreeningSummary = useCallback(
        (c: { digitalScreening?: CandidateDigitalScreening }) => {
            const ds = c.digitalScreening;
            return summarizeDigitalScreening(
                digitalQuestions,
                ds?.digitalAnswers,
                ds?.screeningStatus,
                ds?.rejectionReason,
            );
        },
        [digitalQuestions],
    );

    const openScreeningModal = (
        e: React.MouseEvent,
        c: { id: string | number; name?: string; digitalScreening?: CandidateDigitalScreening },
    ) => {
        e.stopPropagation();
        const ds = c.digitalScreening;
        const summary = getCandidateScreeningSummary(c);
        if (summary.status === 'none' || summary.status === 'pending') return;
        setScreeningModal({
            candidateId: String(c.id),
            candidateName: String(c.name || c.id),
            digitalAnswers: ds?.digitalAnswers || [],
            screeningStatus: ds?.screeningStatus,
            rejectionReason: ds?.rejectionReason,
        });
    };

    return (
        <div className="flex flex-col h-full bg-white relative">
            <header className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-4 bg-bg-subtle/20">
                <div className="flex items-center gap-3">
                    <h3 className="font-bold text-lg text-text-default">{t('job_candidates.title')}</h3>
                    <span className="text-xs font-bold bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                        {t('job_candidates.active_count', { count: filteredCandidates.length })}
                    </span>
                        <span className="text-xs text-text-subtle flex items-center gap-1 border-r border-border-default pr-3 mr-1">
                        <MapPinIcon className="w-3 h-3" />
                        {t('job_candidates.location')} {jobAddress}
                    </span>
                    {topMatchCandidate ? (
                        <button
                            type="button"
                            data-match-score-trigger
                            onClick={(e) => handleScoreClick(e, String(topMatchCandidate.id))}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100 px-2.5 py-1 rounded-full transition-colors"
                            title={t('job_candidates.col_match')}
                        >
                            <SparklesIcon className="w-3.5 h-3.5" />
                            {topMatchCandidate.matchScore}%
                        </button>
                    ) : null}
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder={t('job_candidates.search_placeholder')} 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-bg-input border border-border-default rounded-xl py-2 pr-9 pl-3 text-sm focus:ring-2 focus:ring-primary-500/20 w-48" 
                        />
                    </div>
                    <div className="flex items-center bg-bg-subtle p-1 rounded-xl border border-border-default">
                        <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>
            </header>

            <main className="p-6">
                {fetchError && (
                    <div className="mb-4 text-sm text-red-600">{fetchError}</div>
                )}
                {viewMode === 'table' ? (
                    <div className="overflow-x-visible rounded-2xl border border-border-default">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-bg-subtle/50 text-text-muted font-bold uppercase text-[11px] tracking-wider sticky top-0 z-20 backdrop-blur-sm">
                                <tr>
                                    <th className="p-4">{t('job_candidates.col_name')}</th>
                                    <th className="p-4">{t('job_candidates.col_status')}</th>
                                    <th className="p-4">{t('job_candidates.col_distance')}</th>
                                    <th className="p-4">{t('job_candidates.col_match')}</th>
                                    {showDigitalScreeningColumn ? (
                                        <th className="p-4">שאלון דיגיטלי</th>
                                    ) : null}
                                    <th className="p-4">{t('job_candidates.col_source')}</th>
                                    <th className="p-4">{t('job_candidates.col_activity')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle overflow-visible">
                                {loadingCandidates && (
                                    <tr>
                                        <td colSpan={showDigitalScreeningColumn ? 7 : 6} className="p-4 text-center text-text-muted text-xs">
                                            טוען מועמדים...
                                        </td>
                                    </tr>
                                )}
                                {!loadingCandidates && filteredCandidates.length === 0 && (
                                    <tr>
                                        <td colSpan={showDigitalScreeningColumn ? 7 : 6} className="p-4 text-center text-text-muted text-xs">
                                            אין מועמדים זמינים במשרה זו כרגע.
                                        </td>
                                    </tr>
                                )}
                                {filteredCandidates.map((c: JobCandidateRow & typeof filteredCandidates[number]) => {
                                    const dupGrey = duplicateNewerGreyIds.has(c.id);
                                    const distanceLabel = jobCandidateDistanceLabel(
                                        c,
                                        jobHasGeoTarget,
                                        clientKmByCandidateId[String(c.id)],
                                        clientGeoPending,
                                        t,
                                    );
                                    const screeningSummary = getCandidateScreeningSummary(c);
                                    const screeningClickable =
                                        screeningSummary.status === 'passed' ||
                                        screeningSummary.status === 'failed' ||
                                        screeningSummary.status === 'partial';
                                    return (
                                    <tr
                                        key={c.id}
                                        onClick={() => openSummaryDrawer(c)}
                                        className={`cursor-pointer transition-colors group ${
                                            dupGrey
                                                ? 'bg-neutral-100/90 text-neutral-400 hover:bg-neutral-100 [&_td]:text-neutral-400'
                                                : 'hover:bg-primary-50/30'
                                        }`}
                                    >
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className={`w-9 h-9 rounded-full flex items-center justify-center font-bold border ${
                                                        dupGrey
                                                            ? 'bg-neutral-200 text-neutral-400 border-neutral-300'
                                                            : 'bg-primary-100 text-primary-700 border-primary-200'
                                                    }`}
                                                >
                                                    {c.avatar}
                                                </div>
                                                <div className={dupGrey ? 'text-neutral-400' : ''}>
                                                    <span
                                                        className={`block ${
                                                            dupGrey
                                                                ? 'font-semibold text-neutral-400'
                                                                : 'font-bold text-text-default group-hover:text-primary-700'
                                                        }`}
                                                    >
                                                        {c.name}
                                                    </span>
                                                    <span
                                                        className={`text-xs ${dupGrey ? 'text-neutral-400/75' : 'text-text-muted'}`}
                                                    >
                                                        {c.title}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className={`p-4 ${dupGrey ? 'text-neutral-400' : ''}`}>
                                            <span
                                                className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                                                    dupGrey
                                                        ? 'bg-neutral-200/90 text-neutral-400 border-neutral-300'
                                                        : statusStyles[c.status as CandidateStatus] || 'bg-gray-100'
                                                }`}
                                            >
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className={`p-4 ${dupGrey ? 'text-neutral-400' : ''}`}>
                                            <button 
                                                type="button"
                                                onClick={(e) => handleNavigate(e, c.address || '')}
                                                disabled={!c.address}
                                                className={
                                                    dupGrey
                                                        ? 'flex items-center gap-1.5 text-xs font-semibold bg-neutral-200/60 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-500 px-2 py-1 rounded-md border border-neutral-200/80 transition-all group/map disabled:opacity-50 disabled:cursor-not-allowed'
                                                        : 'flex items-center gap-1.5 text-xs font-semibold bg-bg-subtle hover:bg-blue-50 text-text-default hover:text-blue-600 px-2 py-1 rounded-md border border-transparent hover:border-blue-200 transition-all group/map disabled:opacity-50 disabled:cursor-not-allowed'
                                                }
                                                title={`${t('job_candidates.nav_waze')} ${c.address || t('job_candidates.unknown_location')}`}
                                            >
                                                <MapPinIcon
                                                    className={`w-3.5 h-3.5 ${dupGrey ? 'text-neutral-400 group-hover/map:text-neutral-500' : 'text-text-subtle group-hover/map:text-blue-500'}`}
                                                />
                                                <span>{distanceLabel}</span>
                                            </button>
                                        </td>
                                        <td className={`p-4 overflow-visible ${dupGrey ? 'text-neutral-400' : ''}`}>
                                            <div className="relative flex flex-col gap-1 min-w-[140px]">
                                                <div className="flex items-center gap-2">
                                                <button 
                                                    type="button"
                                                    data-match-score-trigger
                                                    className="flex items-center gap-2 group/score outline-none"
                                                    onClick={(e) => handleScoreClick(e, String(c.id))}
                                                >
                                                    <div
                                                        className={`w-16 h-1.5 rounded-full overflow-hidden ${dupGrey ? 'bg-neutral-200' : 'bg-gray-100'}`}
                                                    >
                                                        <div
                                                            className={`h-full rounded-full ${dupGrey ? 'bg-neutral-400' : 'bg-primary-500'}`}
                                                            style={{ width: `${c.matchScore}%` }}
                                                        />
                                                    </div>
                                                    <span className={`font-bold text-xs ${dupGrey ? 'text-neutral-400' : ''}`}>{c.matchScore}%</span>
                                                </button>
                                                </div>
                                                <CandidateMatchSummaryLine candidate={c} />
                                                <JobCandidateTagGapsBanner
                                                    candidate={c}
                                                    tagJobModel={tagJobModel}
                                                    tagLoadingId={tagLoadingId}
                                                    onOpenTagPanel={openTagPanel}
                                                    t={t}
                                                />
                                            </div>
                                        </td>
                                        {showDigitalScreeningColumn ? (
                                            <td className={`p-4 ${dupGrey ? 'text-neutral-400' : ''}`}>
                                                {screeningSummary.status === 'none' ? (
                                                    <span className="text-xs text-text-subtle">—</span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => openScreeningModal(e, c)}
                                                        disabled={!screeningClickable}
                                                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                                                            dupGrey
                                                                ? 'bg-neutral-200/90 text-neutral-400 border-neutral-300 cursor-default'
                                                                : `${digitalScreeningBadgeClass(screeningSummary.status)} ${
                                                                      screeningClickable
                                                                          ? 'hover:opacity-90 cursor-pointer'
                                                                          : 'cursor-default opacity-90'
                                                                  }`
                                                        }`}
                                                        title={
                                                            screeningClickable
                                                                ? 'לחץ לצפייה בכל התשובות'
                                                                : screeningSummary.label
                                                        }
                                                    >
                                                        <ComputerDesktopIcon className="w-3.5 h-3.5 shrink-0" />
                                                        <span className="max-w-[140px] truncate">{screeningSummary.label}</span>
                                                    </button>
                                                )}
                                            </td>
                                        ) : null}
                                        <td className={`p-4 text-xs ${dupGrey ? 'text-neutral-400' : 'text-text-muted'}`}>{c.source}</td>
                                        <td className={`p-4 text-xs ${dupGrey ? 'text-neutral-400/80' : 'text-text-subtle'}`}>{c.lastActivity}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {loadingCandidates ? (
                            <div className="col-span-full py-10 text-center text-xs text-text-muted">
                                טוען מועמדים...
                            </div>
                        ) : filteredCandidates.length === 0 ? (
                            <div className="col-span-full py-10 text-center text-xs text-text-muted">
                                אין מועמדים זמינים למשרה זו.
                            </div>
                        ) : (
                            filteredCandidates.map((c: JobCandidateRow & typeof filteredCandidates[number]) => {
                                const dupGrey = duplicateNewerGreyIds.has(c.id);
                                const distanceLabel = jobCandidateDistanceLabel(
                                    c,
                                    jobHasGeoTarget,
                                    clientKmByCandidateId[String(c.id)],
                                    clientGeoPending,
                                    t,
                                );
                                return (
                                <div
                                    key={c.id}
                                    onClick={() => openSummaryDrawer(c)}
                                    className={`rounded-2xl border p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group ${
                                        dupGrey
                                            ? 'bg-neutral-100/90 border-neutral-200 text-neutral-400'
                                            : 'bg-bg-card border-border-default'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg border transition-transform group-hover:rotate-3 ${
                                                    dupGrey
                                                        ? 'bg-neutral-200 text-neutral-400 border-neutral-300'
                                                        : 'bg-primary-100 text-primary-700 border-primary-200'
                                                }`}
                                            >
                                                {c.avatar}
                                            </div>
                                            <div className={dupGrey ? 'text-neutral-400' : ''}>
                                                <h4
                                                    className={`transition-colors ${
                                                        dupGrey
                                                            ? 'font-semibold text-neutral-400'
                                                            : 'font-bold text-text-default group-hover:text-primary-700'
                                                    }`}
                                                >
                                                    {c.name}
                                                </h4>
                                                <p className={`text-xs ${dupGrey ? 'text-neutral-400/75' : 'text-text-muted'}`}>{c.title}</p>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <button 
                                                type="button"
                                                data-match-score-trigger
                                                className={
                                                    dupGrey
                                                        ? 'bg-neutral-200/80 text-neutral-400 font-black text-xs px-2 py-1 rounded-lg border border-neutral-300 flex items-center gap-1 hover:bg-neutral-200 transition-colors'
                                                        : 'bg-primary-50 text-primary-700 font-black text-xs px-2 py-1 rounded-lg border border-primary-100 flex items-center gap-1 hover:bg-primary-100 transition-colors'
                                                }
                                                onClick={(e) => handleScoreClick(e, String(c.id))}
                                            >
                                                <SparklesIcon className="w-3 h-3"/>
                                                {c.matchScore}%
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between mb-4">
                                         <button 
                                            type="button"
                                            onClick={(e) => handleNavigate(e, c.address || '')}
                                            disabled={!c.address}
                                            className={
                                                dupGrey
                                                    ? 'text-xs flex items-center gap-1 bg-neutral-200/60 px-2 py-1 rounded-md text-neutral-400 hover:text-neutral-500 hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-start min-w-0'
                                                    : 'text-xs flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md text-text-muted hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-start min-w-0'
                                            }
                                        >
                                            <MapPinIcon className={`w-3 h-3 shrink-0 ${dupGrey ? 'text-neutral-400' : ''}`}/>
                                            <span className="min-w-0 break-words">
                                                {c.address
                                                    ? `${c.address} · ${distanceLabel}`
                                                    : distanceLabel}
                                            </span>
                                        </button>
                                    </div>

                                    <CandidateMatchSummaryLine candidate={c} />

                                    {showDigitalScreeningColumn ? (() => {
                                        const screeningSummary = getCandidateScreeningSummary(c);
                                        const screeningClickable =
                                            screeningSummary.status === 'passed' ||
                                            screeningSummary.status === 'failed' ||
                                            screeningSummary.status === 'partial';
                                        if (screeningSummary.status === 'none') return null;
                                        return (
                                            <button
                                                type="button"
                                                onClick={(e) => openScreeningModal(e, c)}
                                                disabled={!screeningClickable}
                                                className={`mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                                    digitalScreeningBadgeClass(screeningSummary.status)
                                                } ${screeningClickable ? 'hover:opacity-90' : ''}`}
                                            >
                                                <ComputerDesktopIcon className="w-3.5 h-3.5" />
                                                {screeningSummary.label}
                                            </button>
                                        );
                                    })() : null}

                                    <JobCandidateTagGapsBanner
                                        candidate={c}
                                        tagJobModel={tagJobModel}
                                        tagLoadingId={tagLoadingId}
                                        onOpenTagPanel={openTagPanel}
                                        t={t}
                                    />

                                    <div
                                        className={`flex items-center justify-between mt-6 pt-4 border-t ${dupGrey ? 'border-neutral-200' : 'border-border-subtle'}`}
                                    >
                                        <span
                                            className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                                dupGrey
                                                    ? 'bg-neutral-200/90 text-neutral-400 border-neutral-300'
                                                    : statusStyles[c.status as CandidateStatus]
                                            }`}
                                        >
                                            {c.status}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                className={`p-1.5 transition-colors ${dupGrey ? 'text-neutral-400 hover:text-neutral-600' : 'text-text-subtle hover:text-primary-600'}`}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <WhatsappIcon className="w-4 h-4"/>
                                            </button>
                                            <button
                                                className={`p-1.5 transition-colors ${dupGrey ? 'text-neutral-400 hover:text-neutral-600' : 'text-text-subtle hover:text-primary-600'}`}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <EnvelopeIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                );
                            })
                        )}
                    </div>
                )}
            </main>

            {activeMatchPopup && activePopupCandidate ? (
                <MatchScorePopup
                    position={{ x: activeMatchPopup.x, y: activeMatchPopup.y }}
                    onClose={() => setActiveMatchPopup(null)}
                    matchScore={Number(activePopupCandidate.matchScore) || 0}
                    jobTitle={job?.title || null}
                    scoreBreakdown={(activePopupCandidate.scoreBreakdown as MatchScoreBreakdownData | null) ?? null}
                    parameterMatches={activePopupCandidate.parameterMatches ?? null}
                    job={(job as Record<string, unknown> | null) ?? null}
                    candidate={activePopupCandidate}
                    candidateName={activePopupCandidate.name || null}
                    candidateTitle={activePopupCandidate.title || null}
                    professionalSummary={activePopupCandidate.professionalSummary || null}
                />
            ) : null}

            {tagPanelCategories ? (
                <TagMatchPanel
                    isOpen
                    onClose={closeTagPanel}
                    title={tagPanelTitle}
                    subtitle={job?.client || undefined}
                    categories={tagPanelCategories}
                />
            ) : null}

            {screeningModal ? (
                <DigitalScreeningAnswersModal
                    isOpen
                    candidateName={screeningModal.candidateName}
                    questions={digitalQuestions}
                    digitalAnswers={screeningModal.digitalAnswers}
                    screeningStatus={screeningModal.screeningStatus}
                    rejectionReason={screeningModal.rejectionReason}
                    onClose={() => setScreeningModal(null)}
                />
            ) : null}
        </div>
    );
};

export default JobCandidatesView;
