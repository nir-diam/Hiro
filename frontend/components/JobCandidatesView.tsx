
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, TableCellsIcon, Squares2X2Icon,
    PlusIcon, ChevronUpIcon, FolderIcon, ArchiveBoxIcon, ArrowPathIcon,
    ChatBubbleBottomCenterTextIcon, EnvelopeIcon, WhatsappIcon, XMarkIcon, SparklesIcon,
    MapPinIcon, CheckCircleIcon, FlagIcon, ChevronLeftIcon
} from './Icons';
import { useLanguage } from '../context/LanguageContext';

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

const statusStyles: { [key in CandidateStatus]: string } = {
  'חדש': 'bg-blue-100 text-blue-800 border-blue-200',
  'סינון טלפוני': 'bg-purple-100 text-purple-800 border-purple-200',
  'ראיון': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'הצעה': 'bg-green-100 text-green-800 border-green-200',
  'נדחה': 'bg-gray-100 text-gray-700 border-gray-200',
};

// --- AI MATCH POPUP COMPONENT ---
const MatchAnalysisPopover: React.FC<{ 
    candidate: any; 
    onClose: () => void; 
    onRecalculate: () => Promise<void>; 
    lastAnalyzed: string; 
}> = ({ candidate, onClose, onRecalculate, lastAnalyzed }) => {
    const { t } = useLanguage();
    const [isLoading, setIsLoading] = useState(false);

    const handleRecalculate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsLoading(true);
        await onRecalculate();
        setIsLoading(false);
    };

    return (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-border-default z-[200] p-5 text-right animate-fade-in" style={{ direction: 'rtl' }}>
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-4 h-4 transform rotate-45 -mb-2 bg-white border-b border-r border-border-default"></div>
            
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary-50 rounded-lg">
                        <SparklesIcon className="w-5 h-5 text-primary-600" />
                    </div>
                    <h4 className="font-extrabold text-text-default text-base">{t('job_candidates.ai_analysis')}</h4>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-1.5 rounded-full hover:bg-bg-hover transition-colors">
                    <XMarkIcon className="w-4 h-4 text-text-muted" />
                </button>
            </div>
            
            <div className="space-y-4">
                <p className="text-sm text-text-default leading-relaxed font-medium">
                    התאמה גבוהה (92%). המועמד מציג ניסיון ניהולי משמעותי התואם את דרישות המשרה. הרקע בתחום הלוגיסטיקה נרחב ומדויק.
                </p>
                
                <div className="pt-3 border-t border-border-subtle flex justify-between items-center">
                    <div className="flex items-center gap-1.5 text-text-subtle">
                         <FlagIcon className="w-3.5 h-3.5" />
                         <span className="text-[10px] font-bold uppercase tracking-tight">{t('job_candidates.analyzed_at')} {lastAnalyzed}</span>
                    </div>
                </div>

                <button 
                    onClick={handleRecalculate}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-white bg-primary-600 py-2.5 px-4 rounded-xl hover:bg-primary-700 transition-all font-bold text-sm disabled:opacity-50 shadow-md shadow-primary-500/20"
                >
                    {isLoading ? (
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                    )}
                    <span>{t('job_candidates.recalculate')}</span>
                </button>
            </div>
        </div>
    );
};

interface JobCandidatesViewProps {
    openSummaryDrawer: (candidate: any | number) => void;
    jobId: string | number;
}

const JobCandidatesView: React.FC<JobCandidatesViewProps> = ({ openSummaryDrawer, jobId }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [job, setJob] = useState<{ city?: string; location?: string } | null>(null);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('הכל');
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [returnMonths, setReturnMonths] = useState(3);
    const [activePopoverId, setActivePopoverId] = useState<string | null>(null);

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
                });
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
        setActivePopoverId(activePopoverId === id ? null : id);
    };

    const jobAddress = job?.location || job?.city || 'תל אביב';

    const handleNavigate = (e: React.MouseEvent, candidateAddress: string) => {
        e.stopPropagation();
        if (!candidateAddress) return;
        const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(candidateAddress)}&destination=${encodeURIComponent(jobAddress)}&travelmode=driving`;
        window.open(url, '_blank');
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
                                    <th className="p-4">{t('job_candidates.col_source')}</th>
                                    <th className="p-4">{t('job_candidates.col_activity')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle overflow-visible">
                                {loadingCandidates && (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-text-muted text-xs">
                                            טוען מועמדים...
                                        </td>
                                    </tr>
                                )}
                                {!loadingCandidates && filteredCandidates.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-4 text-center text-text-muted text-xs">
                                            אין מועמדים זמינים במשרה זו כרגע.
                                        </td>
                                    </tr>
                                )}
                                {filteredCandidates.map(c => {
                                    const dupGrey = duplicateNewerGreyIds.has(c.id);
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
                                                onClick={(e) => handleNavigate(e, c.address || '')}
                                                className={
                                                    dupGrey
                                                        ? 'flex items-center gap-1.5 text-xs font-semibold bg-neutral-200/60 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-500 px-2 py-1 rounded-md border border-neutral-200/80 transition-all group/map'
                                                        : 'flex items-center gap-1.5 text-xs font-semibold bg-bg-subtle hover:bg-blue-50 text-text-default hover:text-blue-600 px-2 py-1 rounded-md border border-transparent hover:border-blue-200 transition-all group/map'
                                                }
                                                title={`${t('job_candidates.nav_waze')} ${c.address || t('job_candidates.unknown_location')}`}
                                            >
                                                <MapPinIcon
                                                    className={`w-3.5 h-3.5 ${dupGrey ? 'text-neutral-400 group-hover/map:text-neutral-500' : 'text-text-subtle group-hover/map:text-blue-500'}`}
                                                />
                                                <span>{c.address ? `${Math.floor(Math.random() * 40) + 2} ק"מ` : t('job_candidates.unknown_location')}</span>
                                            </button>
                                        </td>
                                        <td className={`p-4 overflow-visible ${dupGrey ? 'text-neutral-400' : ''}`}>
                                            <div className="relative flex items-center gap-2">
                                                <button 
                                                    className="flex items-center gap-2 group/score outline-none"
                                                    onClick={(e) => handleScoreClick(e, c.id)}
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
                                                {activePopoverId === c.id && (
                                                    <MatchAnalysisPopover 
                                                        candidate={c} 
                                                        lastAnalyzed="28/07/2025"
                                                        onClose={() => setActivePopoverId(null)}
                                                        onRecalculate={async () => { await new Promise(r => setTimeout(r, 1000)); }}
                                                    />
                                                )}
                                            </div>
                                        </td>
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
                            filteredCandidates.map(c => {
                                const dupGrey = duplicateNewerGreyIds.has(c.id);
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
                                                className={
                                                    dupGrey
                                                        ? 'bg-neutral-200/80 text-neutral-400 font-black text-xs px-2 py-1 rounded-lg border border-neutral-300 flex items-center gap-1 hover:bg-neutral-200 transition-colors'
                                                        : 'bg-primary-50 text-primary-700 font-black text-xs px-2 py-1 rounded-lg border border-primary-100 flex items-center gap-1 hover:bg-primary-100 transition-colors'
                                                }
                                                onClick={(e) => handleScoreClick(e, c.id)}
                                            >
                                                <SparklesIcon className="w-3 h-3"/>
                                                {c.matchScore}%
                                            </button>
                                            {activePopoverId === c.id && (
                                                <MatchAnalysisPopover 
                                                    candidate={c} 
                                                    lastAnalyzed="28/07/2025"
                                                    onClose={() => setActivePopoverId(null)}
                                                    onRecalculate={async () => { await new Promise(r => setTimeout(r, 1000)); }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between mb-4">
                                         <button 
                                            onClick={(e) => handleNavigate(e, c.address || '')}
                                            className={
                                                dupGrey
                                                    ? 'text-xs flex items-center gap-1 bg-neutral-200/60 px-2 py-1 rounded-md text-neutral-400 hover:text-neutral-500 hover:bg-neutral-200 transition-colors'
                                                    : 'text-xs flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md text-text-muted hover:text-blue-600 hover:bg-blue-50 transition-colors'
                                            }
                                        >
                                            <MapPinIcon className={`w-3 h-3 ${dupGrey ? 'text-neutral-400' : ''}`}/>
                                            {c.address ? `${c.address} (~${Math.floor(Math.random() * 40) + 2} ק"מ)` : t('job_candidates.unknown_location')}
                                        </button>
                                    </div>

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
        </div>
    );
};

export default JobCandidatesView;
