
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon, UserIcon,
    ArrowTopRightOnSquareIcon, CheckCircleIcon, ExclamationTriangleIcon,
    SparklesIcon, XMarkIcon, Squares2X2Icon, AdjustmentsHorizontalIcon,
} from './Icons';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import AdminCompanyAgentDashboard from './AdminCompanyAgentDashboard';
import {
    fetchOrgAiDecisions,
    resolveOrgAiDecision,
    type OrgAiDecisionDto,
} from '../services/organizationCorrectionsApi';

// ─── Shared Types ─────────────────────────────────────────────────────────────

type TabType = 'dashboard' | 'ai_decisions' | 'manual' | 'blacklist';
type DecisionType = 'merge_company' | 'create_company' | 'create_company_enrich' | 'map_generic';

// ─── Manual Tab Types ─────────────────────────────────────────────────────────

interface UnmatchedCompany {
    id: string;
    name: string;
    source: string;
    candidateId?: string | null;
    candidateName?: string;
    aiSuggestion?: string;
    aiReason?: string;
    confidence: number;
    occurrences: number;
    isCompany?: boolean;
}

interface HistoryEntry {
    id: string;
    name: string;
    isCompany?: boolean;
    resolutionType?: string;
    resolvedValue?: string;
    createdAt: string;
    updatedAt?: string;
}

// ─── AI Decisions Tab Types ───────────────────────────────────────────────────

interface AiDecision {
    id: string;
    originalTerm: string;
    candidateName: string;
    candidateId?: string | null;
    actionDate: string;
    context: string;
    decisionType: DecisionType;
    decisionTarget?: string;
    decisionExplanation: string;
    hesitationPct: number;
    hesitationLabel: string;
    hesitationQuote: string;
    similarEntities: { name: string; similarity: number }[];
    needsManual: boolean;
    isAutoHandled: boolean;
    source: string;
}

interface BlacklistEntry {
    id: string;
    term: string;
    addedAt: string;
    source?: string;
    candidateName?: string;
}

// ─── Generic bucket options ───────────────────────────────────────────────────

const GENERIC_BUCKETS = [
    'הייטק ומחשוב (גנרי)',
    'שירותי תוכנה (גנרי)',
    'פיננסים וביטוח (גנרי)',
    'תעשייה ויצור (גנרי)',
    'בריאות ורפואה (גנרי)',
    'חינוך והוראה (גנרי)',
    'ביטחון וצבא (גנרי)',
    'שירותים ומסחר קמעונאי (גנרי)',
    'נדל"ן ובנייה (גנרי)',
    'תחבורה ולוגיסטיקה (גנרי)',
    'מנהל ואדמיניסטרציה (גנרי)',
    'משפטים ורגולציה (גנרי)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const p = (n: number) => n.toString().padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const getHesitationConfig = (pct: number) => {
    // ודאי (< 30) = GREEN, בינוני (30-59) = ORANGE, נמוך (≥ 60) = RED
    if (pct < 30) return { textColor: 'text-emerald-700', iconColor: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-100' };
    if (pct < 60) return { textColor: 'text-amber-700', iconColor: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100' };
    return { textColor: 'text-rose-700', iconColor: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-100' };
};

const mapApiEntry = (entry: OrgAiDecisionDto): AiDecision => {
    const pct = entry.hesitationLevel ?? 0;
    // confidence = certainty (100 - hesitation). Used for display only.
    const confidence = 100 - pct;
    const hesitationLabel = pct < 30 ? `ודאי: ${confidence}%` : pct < 60 ? `בינוני: ${confidence}%` : `נמוך: ${confidence}%`;
    return {
        id: entry.id,
        originalTerm: entry.originalTerm,
        candidateName: entry.candidateName || 'לא ידוע',
        candidateId: entry.candidateId,
        actionDate: entry.actionDate,
        context: entry.context === 'resume' ? 'קורות חיים' : entry.context === 'email' ? 'מייל' : entry.context,
        decisionType: entry.aiDecision as DecisionType,
        decisionTarget: entry.aiSuggestedTarget ?? undefined,
        decisionExplanation: entry.aiReasoning || '',
        hesitationPct: pct,
        hesitationLabel,
        hesitationQuote: entry.dilemmaReasoning || entry.aiReasoning || '',
        similarEntities: entry.similarEntities || [],
        needsManual: entry.reviewStatus === 'manual' || pct >= 60,
        isAutoHandled: entry.reviewStatus === 'approved' || pct < 30,
        source: 'קורות חיים',
    };
};

const DECISION_META: Record<DecisionType, {
    color: string; bg: string; border: string;
    labelFn: (target?: string) => string;
    icon: React.ReactNode;
}> = {
    merge_company: {
        color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100',
        labelFn: (t) => `מיזוג לחברה "${t ?? ''}"`,
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
        ),
    },
    map_generic: {
        color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100',
        labelFn: (t) => `שיוך לגנרי: "${t ?? ''}"`,
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 18v2.25A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
        ),
    },
    create_company: {
        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
        labelFn: () => 'יצירת חברה חדשה',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
        ),
    },
    create_company_enrich: {
        color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100',
        labelFn: () => 'יצירת חברה + העשרה',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
        ),
    },
};

// ─── Inline SVG atoms ─────────────────────────────────────────────────────────

const IconClock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const IconUser = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
);
const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
);
const IconCheck = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className ?? 'w-4 h-4'}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);
const IconWarning = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className ?? 'w-4 h-4'}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);
const IconXCircle = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className ?? 'w-4 h-4 rounded-full border border-current p-0.5'}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);
const IconGrid = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className ?? 'w-4 h-4'}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 18v2.25A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
);
const IconChevronDown = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-text-muted">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);
const IconTrash = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);
const IconLink = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
);
const IconPlus = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

// ─── Toast ────────────────────────────────────────────────────────────────────

const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const t = setTimeout(onClose, 3000);
        return () => clearTimeout(t);
    }, [onClose]);
    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
    return (
        <div className={`fixed bottom-6 left-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white ${bg}`}>
            {type === 'success' ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationTriangleIcon className="w-5 h-5" />}
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><XMarkIcon className="w-4 h-4" /></button>
        </div>
    );
};

// ─── Quick Create Modal ───────────────────────────────────────────────────────

const QuickCreateCompanyModal: React.FC<{
    isOpen: boolean; onClose: () => void; initialName: string; onSave: (data: any) => void;
}> = ({ isOpen, onClose, initialName, onSave }) => {
    const [name, setName] = useState(initialName);
    const [industry, setIndustry] = useState('');
    const [website, setWebsite] = useState('');
    const [alias, setAlias] = useState('');

    useEffect(() => {
        if (isOpen) { setName(initialName); setIndustry(''); setWebsite(''); setAlias(''); }
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border-default" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-5 border-b border-border-default">
                    <h3 className="font-bold text-lg text-text-default">הקמת חברה חדשה</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {[
                        { label: 'שם החברה', value: name, onChange: setName, placeholder: '', bold: true, autoFocus: true },
                        { label: 'תעשייה / תחום', value: industry, onChange: setIndustry, placeholder: 'לדוגמה: הייטק, פיננסים' },
                        { label: 'אתר אינטרנט', value: website, onChange: setWebsite, placeholder: 'https://...' },
                        { label: 'שם קצר / Alias', value: alias, onChange: setAlias, placeholder: '' },
                    ].map(({ label, value, onChange, placeholder, bold, autoFocus }) => (
                        <div key={label}>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">{label}</label>
                            <input
                                type="text" value={value} onChange={e => onChange(e.target.value)}
                                placeholder={placeholder} autoFocus={autoFocus}
                                className={`w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-orange-500 ${bold ? 'font-bold' : ''}`}
                            />
                        </div>
                    ))}
                </div>
                <div className="p-5 border-t border-border-default flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg">ביטול</button>
                    <button
                        onClick={() => onSave({ name, industry, website, alias })}
                        className="px-6 py-2 text-sm font-bold text-white bg-orange-500 rounded-lg hover:bg-orange-600 flex items-center gap-2"
                    >
                        <PlusIcon />
                        צור חברה
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AdminCompanyCorrectionsView: React.FC = () => {
    const apiBase = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '';

    // ── Shared state ──
    const [activeTab, setActiveTab] = useState<TabType>('dashboard');
    const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [drawerCandidate, setDrawerCandidate] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') =>
        setNotification({ message, type });

    // ══════════════════════════════════════════════════════════════════════════
    //  MANUAL TAB STATE (original split-panel)
    // ══════════════════════════════════════════════════════════════════════════

    const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
    const [unmatched, setUnmatched] = useState<UnmatchedCompany[]>([]);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [companyFlags, setCompanyFlags] = useState<Record<string, boolean>>({});
    const [selected, setSelected] = useState<UnmatchedCompany | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [manualSearchTerm, setManualSearchTerm] = useState('');
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingCompany, setSelectedExistingCompany] = useState<{ id: string; name: string } | null>(null);
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
    const [sortBy, setSortBy] = useState<'confidence' | 'occurrences' | 'name'>('confidence');
    const [minConfidence] = useState(0);

    const companyFlagClass = (isCompany?: boolean) => isCompany ? 'bg-green-500' : 'bg-red-500';

    const mapTmpEntry = (entry: any): UnmatchedCompany => ({
        id: entry.id,
        name: entry.name || 'לא ידוע',
        source: entry.source || 'AI Detection',
        candidateId: entry.candidateId || null,
        candidateName: entry.candidate?.fullName || entry.candidateName || 'לא ידוע',
        aiSuggestion: entry.aiSuggestion || entry.nameEn || '',
        aiReason: entry.aiReason || entry.description || '',
        confidence: entry.confidence ?? 80,
        occurrences: entry.occurrences ?? 1,
        isCompany: entry.isCompany ?? false,
    });

    const loadUnmatched = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${apiBase}/api/organizations/tmp`, { headers });
            if (!res.ok) throw new Error('Failed to load corrections');
            const data = await res.json();
            if (Array.isArray(data)) setUnmatched(data.map(mapTmpEntry));
        } catch (err) {
            console.error('Unable to fetch organization corrections', err);
        }
    }, [apiBase]);

    const loadOrganizationsData = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/organizations`);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data))
                setOrganizations(data.filter((o: any) => o.name).map((o: any) => ({ id: o.id, name: o.name })));
        } catch { /* swallow */ }
    }, [apiBase]);

    const loadHistory = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
            const res = await fetch(`${apiBase}/api/organizations/tmp/history`, { headers });
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setHistoryEntries(data);
        } catch { /* swallow */ }
    }, [apiBase]);

    const filteredUnmatched = useMemo(() => {
        let items = unmatched.filter(u =>
            u.name.toLowerCase().includes(manualSearchTerm.toLowerCase()) &&
            u.confidence >= minConfidence,
        );
        return items.sort((a, b) => {
            if (sortBy === 'confidence') return b.confidence - a.confidence;
            if (sortBy === 'occurrences') return b.occurrences - a.occurrences;
            return a.name.localeCompare(b.name);
        });
    }, [unmatched, manualSearchTerm, minConfidence, sortBy]);

    const filteredHistory = useMemo(() =>
        historyEntries.filter(h => h.name.toLowerCase().includes(manualSearchTerm.toLowerCase())),
        [historyEntries, manualSearchTerm],
    );

    const filteredExisting = useMemo(() =>
        linkSearchTerm
            ? organizations.filter(o => o.name.toLowerCase().includes(linkSearchTerm.toLowerCase()))
            : [],
        [linkSearchTerm, organizations],
    );

    const isBulkMode = checkedIds.size > 1;
    const selectedItemsForAction = isBulkMode
        ? unmatched.filter(u => checkedIds.has(u.id))
        : selected ? [selected] : [];

    const handleToggleCheck = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setCheckedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCheckedIds(e.target.checked ? new Set(filteredUnmatched.map(u => u.id)) : new Set());
    };

    const addAliasToOrganization = async (orgId: string, alias: string) => {
        if (!orgId || !alias) return;
        try {
            const res = await fetch(`${apiBase}/api/organizations/${orgId}`);
            if (!res.ok) return;
            const org = await res.json();
            const aliases: string[] = Array.isArray(org.aliases) ? [...org.aliases] : [];
            if (aliases.includes(alias)) return;
            aliases.push(alias);
            await fetch(`${apiBase}/api/organizations/${orgId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aliases }),
            });
        } catch { /* swallow */ }
    };

    const resolveTmpEntries = async (
        ids: string[], add: boolean, actionType: 'link' | 'create' | 'delete',
        flags: { id: string; isCompany?: boolean }[], resolvedValue?: string, organizationId?: string,
    ) => {
        if (!ids.length) return;
        const payload: Record<string, any> = { ids, add, actionType, flags };
        if (resolvedValue) payload.resolvedValue = resolvedValue;
        if (organizationId) payload.organizationId = organizationId;
        const token = localStorage.getItem('token');
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${apiBase}/api/organizations/tmp/resolve`, {
            method: 'POST', headers, body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text().catch(() => '') || 'הסרת החברה נכשלה');
    };

    const finalizeAction = async (
        add: boolean, actionType: 'link' | 'create' | 'delete',
        items: UnmatchedCompany[], resolvedValue?: string, organizationId?: string,
    ) => {
        const idsToRemove = items.map(u => u.id);
        const flagPayload = items
            .map(item => typeof companyFlags[item.id] !== 'undefined' ? { id: item.id, isCompany: companyFlags[item.id] } : null)
            .filter(Boolean) as { id: string; isCompany: boolean }[];

        setUnmatched(prev => prev.filter(u => !idsToRemove.includes(u.id)));
        setSelected(null);
        setCheckedIds(new Set());
        setLinkSearchTerm('');
        setSelectedExistingCompany(null);

        try {
            await resolveTmpEntries(idsToRemove, add, actionType, flagPayload, resolvedValue, organizationId);
            await loadUnmatched();
            await loadHistory();
            if (actionType === 'link' || actionType === 'create') await loadOrganizationsData();
        } catch (err: any) {
            notify(err.message || 'הפעולה נכשלה', 'error');
        } finally {
            setCompanyFlags(prev => {
                const next = { ...prev };
                idsToRemove.forEach(id => delete next[id]);
                return next;
            });
        }
    };

    const handleResolve = async (action: 'link' | 'create' | 'delete') => {
        if (selectedItemsForAction.length === 0) return;
        if (action === 'link') {
            if (!selectedExistingCompany) { notify('אנא בחר חברה קיימת למיזוג.', 'error'); return; }
            if (selected) await addAliasToOrganization(selectedExistingCompany.id, selected.name);
            notify(`${selectedItemsForAction.length} חברות מוזגו בהצלחה ל-${selectedExistingCompany.name}`);
            await finalizeAction(false, 'link', selectedItemsForAction, selectedExistingCompany.name, selectedExistingCompany.id);
        } else if (action === 'create') {
            setIsCreateModalOpen(true);
        } else if (action === 'delete') {
            if (window.confirm(`האם אתה בטוח שברצונך להתעלם מ-${selectedItemsForAction.length} הפריטים המסומנים?`)) {
                notify(`${selectedItemsForAction.length} פריטים הוסרו`, 'info');
                await finalizeAction(false, 'delete', selectedItemsForAction);
            }
        }
    };

    const handleCreateNewCompany = async (data: any) => {
        setIsCreateModalOpen(false);
        notify(`החברה "${data.name}" נוצרה והפריטים שויכו בהצלחה`);
        try {
            const res = await fetch(`${apiBase}/api/organizations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    mainField: data.industry || undefined,
                    website: data.website || undefined,
                    aliases: data.alias ? [data.alias] : [],
                }),
            });
            if (!res.ok) throw new Error(await res.text().catch(() => '') || 'יצירת החברה נכשלה');
            const created = await res.json();
            const orgId = typeof created?.id === 'string' ? created.id : undefined;
            if (orgId && selectedItemsForAction.length) {
                const extraNames = selectedItemsForAction.map(i => i.name?.trim()).filter(n => n && n !== data.name);
                if (extraNames[0]) await addAliasToOrganization(orgId, extraNames[0]);
            }
            await finalizeAction(true, 'create', selectedItemsForAction, data.name, orgId);
        } catch (err: any) {
            notify(err.message || 'יצירת החברה נכשלה', 'error');
        }
    };

    const handleSelectForMerge = (company: { id: string; name: string }) => {
        setSelectedExistingCompany(company);
        setLinkSearchTerm(company.name);
    };

    // Auto-select first pending item
    useEffect(() => {
        if (viewMode === 'pending' && !selected && filteredUnmatched.length > 0 && checkedIds.size === 0) {
            setSelected(filteredUnmatched[0]);
        }
    }, [filteredUnmatched, selected, viewMode, checkedIds]);

    // Auto-fill link search from AI suggestion
    useEffect(() => {
        if (!isBulkMode && selected?.aiSuggestion) {
            setLinkSearchTerm(selected.aiSuggestion);
            setSelectedExistingCompany(null);
        } else if (!isBulkMode) {
            setLinkSearchTerm('');
            setSelectedExistingCompany(null);
        }
    }, [selected, isBulkMode]);

    // ══════════════════════════════════════════════════════════════════════════
    //  AI DECISIONS TAB STATE
    // ══════════════════════════════════════════════════════════════════════════

    const [agentActive, setAgentActive] = useState(true);
    const [decisions, setDecisions] = useState<AiDecision[]>([]);
    const [loadingDecisions, setLoadingDecisions] = useState(false);
    const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
    const [aiSearchTerm, setAiSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    const [decisionTypeFilter, setDecisionTypeFilter] = useState<'all' | DecisionType>('all');
    const [showManual, setShowManual] = useState(true);
    const [showAutoHandled, setShowAutoHandled] = useState(true);
    const [isMultiSelect, setIsMultiSelect] = useState(false);

    // ── Merge / Generic modal state ──
    const [mergeModal, setMergeModal] = useState<{ id: string; mode: 'merge_company' | 'map_generic'; term: string } | null>(null);
    const [mergeTarget, setMergeTarget] = useState('');
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [mergeOrgSearch, setMergeOrgSearch] = useState('');
    const [isMerging, setIsMerging] = useState(false);
    const [aiCheckedIds, setAiCheckedIds] = useState<Set<string>>(new Set());
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [aiCreateModalName, setAiCreateModalName] = useState('');

    const loadDecisions = useCallback(async () => {
        setLoadingDecisions(true);
        try {
            const result = await fetchOrgAiDecisions({ limit: 200, sortOrder: sortOrder === 'oldest' ? 'asc' : 'desc' });
            setDecisions(result.data.map(mapApiEntry));
        } catch (err) {
            console.error('[AdminCompanyCorrectionsView] load error:', err);
        } finally {
            setLoadingDecisions(false);
        }
    }, [sortOrder]);

    const filteredDecisions = useMemo(() => {
        let items = decisions;
        if (!showManual || !showAutoHandled) {
            items = items.filter(d => (d.needsManual && showManual) || (d.isAutoHandled && showAutoHandled));
        }
        if (aiSearchTerm.trim()) {
            const q = aiSearchTerm.toLowerCase();
            items = items.filter(d =>
                d.originalTerm.toLowerCase().includes(q) ||
                d.candidateName.toLowerCase().includes(q) ||
                (d.decisionTarget ?? '').toLowerCase().includes(q),
            );
        }
        if (filterDate) items = items.filter(d => d.actionDate.startsWith(filterDate));
        if (decisionTypeFilter !== 'all') items = items.filter(d => d.decisionType === decisionTypeFilter);
        return [...items].sort((a, b) => {
            const cmp = new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime();
            return sortOrder === 'newest' ? cmp : -cmp;
        });
    }, [decisions, showManual, showAutoHandled, aiSearchTerm, filterDate, decisionTypeFilter, sortOrder]);

    const toggleAiCheck = (id: string) => {
        setAiCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const removeDecision = (id: string) => setDecisions(prev => prev.filter(d => d.id !== id));
    const updateDecision = (id: string, patch: Partial<AiDecision>) =>
        setDecisions(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));

    const handleAddToBlacklist = async (decision: AiDecision) => {
        setOpenDropdownId(null);
        try {
            await resolveOrgAiDecision(decision.id, { reviewerAction: 'blacklist', reviewStatus: 'changed' });
            removeDecision(decision.id);
            setBlacklist(prev => [...prev, {
                id: `bl-${Date.now()}`,
                term: decision.originalTerm,
                addedAt: new Date().toISOString(),
                source: decision.source,
                candidateName: decision.candidateName,
            }]);
            notify(`"${decision.originalTerm}" נוסף לרשימה השחורה`, 'info');
        } catch {
            notify('שגיאה בעדכון ההחלטה', 'error');
        }
    };

    const handleAiApprove = async (id: string) => {
        setOpenDropdownId(null);
        const dec = decisions.find(d => d.id === id);
        try {
            // For create_company decisions: create the org record + trigger enrichment in background
            if (dec?.decisionType === 'create_company') {
                const term = dec.originalTerm;
                const createRes = await fetch(`${apiBase}/api/organizations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: term }),
                });
                if (!createRes.ok) throw new Error(await createRes.text().catch(() => '') || 'יצירת החברה נכשלה');
                const created = await createRes.json();
                const orgId: string = created?.id;
                notify(`החברה "${term}" נוצרה — מתחיל העשרה ברקע...`, 'info');
                // Fire enrichment in background (do not block approval)
                fetch(`${apiBase}/api/organizations/enrich`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: [orgId] }),
                }).then(async (r) => {
                    if (r.ok) notify(`העשרת "${term}" הושלמה בהצלחה`);
                    else notify(`העשרה נכשלה עבור "${term}"`, 'error');
                }).catch(() => notify(`העשרה נכשלה עבור "${term}"`, 'error'));
            }
            await resolveOrgAiDecision(id, { reviewerAction: 'approved', reviewStatus: 'approved' });
            updateDecision(id, { isAutoHandled: true, needsManual: false });
            notify(dec?.decisionType === 'create_company' ? `ההחלטה אושרה והחברה נוצרה` : 'ההחלטה אושרה');
        } catch (err: any) { notify(err.message || 'שגיאה בעדכון ההחלטה', 'error'); }
    };

    const handleAiMarkManual = async (id: string) => {
        setOpenDropdownId(null);
        try {
            await resolveOrgAiDecision(id, { reviewerAction: 'manual', reviewStatus: 'manual' });
            updateDecision(id, { needsManual: true, isAutoHandled: false });
            notify('הועבר לטיפול ידני');
        } catch { notify('שגיאה בעדכון ההחלטה', 'error'); }
    };

    const handleAiChangeDecision = async (decisionId: string, newType: DecisionType) => {
        setOpenDropdownId(null);
        if (newType === 'create_company') {
            const dec = decisions.find(d => d.id === decisionId);
            setAiCreateModalName(dec?.originalTerm ?? '');
            setIsCreateModalOpen(true);
            return;
        }
        if (newType === 'create_company_enrich') {
            const dec = decisions.find(d => d.id === decisionId);
            const term = dec?.originalTerm ?? '';
            if (!term) { notify('לא נמצא שם חברה', 'error'); return; }
            try {
                // 1. Create canonical org
                const createRes = await fetch(`${apiBase}/api/organizations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: term }),
                });
                if (!createRes.ok) throw new Error(await createRes.text().catch(() => '') || 'יצירת החברה נכשלה');
                const created = await createRes.json();
                const orgId: string = created?.id;
                notify(`החברה "${term}" נוצרה — מתחיל העשרה ברקע...`, 'info');
                // 2. Trigger enrichment in background (fire-and-forget — don't await)
                fetch(`${apiBase}/api/organizations/enrich`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyIds: [orgId] }),
                }).then(async (r) => {
                    if (r.ok) notify(`העשרת "${term}" הושלמה בהצלחה`);
                    else notify(`העשרה נכשלה עבור "${term}"`, 'error');
                }).catch(() => notify(`העשרה נכשלה עבור "${term}"`, 'error'));
                // 3. Mark AI decision as resolved
                await resolveOrgAiDecision(decisionId, {
                    aiDecision: 'create_company',
                    reviewerAction: 'changed',
                    reviewStatus: 'changed',
                });
                updateDecision(decisionId, { decisionType: 'create_company', decisionTarget: undefined });
            } catch (err: any) { notify(err.message || 'שגיאה ביצירת החברה', 'error'); }
            return;
        }
        // merge_company and map_generic open a target-selection modal
        if (newType === 'merge_company' || newType === 'map_generic') {
            const dec = decisions.find(d => d.id === decisionId);
            setMergeModal({ id: decisionId, mode: newType, term: dec?.originalTerm ?? '' });
            setMergeTarget('');
            setMergeTargetId('');
            setMergeOrgSearch('');
            return;
        }
        try {
            await resolveOrgAiDecision(decisionId, { aiDecision: newType, reviewerAction: 'changed', reviewStatus: 'changed' });
            updateDecision(decisionId, { decisionType: newType, decisionTarget: undefined });
            notify('ההחלטה עודכנה');
        } catch { notify('שגיאה בעדכון ההחלטה', 'error'); }
    };

    const handleMergeConfirm = async () => {
        if (!mergeModal || !mergeTarget) return;
        setIsMerging(true);
        try {
            const result = await resolveOrgAiDecision(mergeModal.id, {
                aiDecision: mergeModal.mode,
                aiSuggestedTarget: mergeTarget,
                aiSuggestedTargetId: mergeTargetId || undefined,
                reviewerAction: 'changed',
                reviewStatus: 'changed',
            });
            updateDecision(mergeModal.id, { decisionType: mergeModal.mode, decisionTarget: mergeTarget });
            setMergeModal(null);
            if (mergeModal.mode === 'merge_company') {
                const ar = (result as any)?.aliasResult;
                if (ar?.ok) {
                    notify(`Alias "${ar.term}" נוסף לחברה "${ar.orgName}"`);
                } else if (ar?.reason === 'already_exists') {
                    notify(`"${mergeTarget}" — ה-Alias כבר קיים`, 'info');
                } else if (ar?.reason === 'org_not_found') {
                    notify(`שגיאה: חברת היעד לא נמצאה (${mergeTargetId})`, 'error');
                } else {
                    notify(`מוזג לחברה "${mergeTarget}"`);
                }
            } else {
                notify(`שויך לסל "${mergeTarget}"`);
            }
        } catch { notify('שגיאה בביצוע הפעולה', 'error'); }
        finally { setIsMerging(false); }
    };

    // ── Data loading — refresh whenever the active tab changes ──
    useEffect(() => {
        void loadOrganizationsData(); // always needed (merge modal, etc.)
        if (activeTab === 'ai_decisions') {
            void loadDecisions();
        } else if (activeTab === 'manual') {
            void loadUnmatched();
            void loadHistory();
        } else if (activeTab === 'blacklist') {
            // blacklist is managed locally; no server reload needed
        }
        // dashboard tab manages its own data via AdminCompanyAgentDashboard
    }, [activeTab, loadDecisions, loadUnmatched, loadHistory, loadOrganizationsData]);

    // ─── Render helpers (AI tab) ───────────────────────────────────────────────

    const renderHesitationBox = (d: AiDecision) => {
        const { textColor, iconColor, bg, border } = getHesitationConfig(d.hesitationPct);
        return (
            <div className={`${bg} ${border} border rounded-xl p-2.5 max-w-[240px] mx-auto`}>
                <div className="bg-white rounded border border-slate-100/50 p-1.5 flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.02)] mb-2">
                    <div className={`flex items-center gap-1 px-4 text-center mx-auto text-xs font-bold leading-5 ${textColor}`}>
                        {d.hesitationLabel}
                    </div>
                    <span className={`${iconColor} pl-1`}>
                        {d.hesitationPct < 30
                            ? <IconCheck className="w-4 h-4" />
                            : d.hesitationPct < 60
                            ? <IconWarning className="w-4 h-4" />
                            : <IconXCircle className="w-4 h-4" />
                        }
                    </span>
                </div>
                {d.hesitationQuote && (
                    <p className="text-[10px] text-slate-500 italic text-center w-full block px-1">"{d.hesitationQuote}"</p>
                )}
            </div>
        );
    };

    const renderSimilarEntities = (d: AiDecision) => {
        const entities = d.similarEntities;
        if (!entities.length) return <span className="text-[11px] text-text-muted">—</span>;

        const isExpanded = expandedEntities.has(d.id);
        const visible = isExpanded ? entities : entities.slice(0, 2);
        const remaining = entities.length - 2;

        const toggleExpand = () => setExpandedEntities(prev => {
            const next = new Set(prev);
            next.has(d.id) ? next.delete(d.id) : next.add(d.id);
            return next;
        });

        return (
            <div className="flex flex-wrap justify-center gap-1.5 max-w-[260px] mx-auto text-[10px] font-bold">
                {visible.map((e, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-md">
                        <span>{e.name}</span>
                        <span className="text-purple-400 bg-white px-1 rounded-sm">{e.similarity}%</span>
                    </div>
                ))}
                {!isExpanded && remaining > 0 && (
                    <button
                        onClick={toggleExpand}
                        className="text-orange-600 bg-orange-50/50 border border-orange-100 px-2 py-1 rounded-md hover:bg-orange-100/50 transition-colors"
                    >
                        +{remaining} נוספים
                    </button>
                )}
                {isExpanded && entities.length > 2 && (
                    <button
                        onClick={toggleExpand}
                        className="text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                    >
                        הסתר
                    </button>
                )}
            </div>
        );
    };

    const renderDecisionBadge = (d: AiDecision) => {
        const meta = DECISION_META[d.decisionType];
        return (
            <div>
                <div className={`flex items-center gap-1.5 ${meta.color} font-bold ${meta.bg} px-3 py-1 rounded-full w-max mx-auto border ${meta.border}`}>
                    {meta.icon}
                    <span>{meta.labelFn(d.decisionTarget)}</span>
                </div>
                <div className="text-[11px] text-text-subtle mt-3 max-w-[280px] mx-auto leading-relaxed">
                    {d.decisionExplanation}
                </div>
            </div>
        );
    };

    const renderActionDropdown = (d: AiDecision) => {
        const isOpen = openDropdownId === d.id;
        return (
            <div className="relative text-left">
                <button
                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isOpen ? null : d.id); }}
                    className="bg-white border border-border-default rounded-lg px-3 py-1.5 text-xs font-semibold text-text-default shadow-sm hover:border-text-subtle flex items-center gap-2 justify-between w-32 focus:ring-2 focus:ring-orange-500 mr-auto transition-colors"
                >
                    <span>שנה החלטה</span>
                    <IconChevronDown />
                </button>
                {isOpen && (
                    <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-border-default rounded-xl shadow-lg z-20 overflow-hidden">
                        <button onClick={() => handleAiApprove(d.id)}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 border-b border-border-default/40">
                            <IconCheck className="w-3.5 h-3.5" /> אשר החלטה
                        </button>
                        <button onClick={() => handleAiMarkManual(d.id)}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-amber-50 text-amber-700 flex items-center gap-2 border-b border-border-default/40">
                            <IconWarning className="w-3.5 h-3.5" /> העבר לטיפול ידני
                        </button>
                        <button onClick={() => handleAiChangeDecision(d.id, 'merge_company')}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-indigo-50 text-indigo-700 flex items-center gap-2 border-b border-border-default/40">
                            <IconLink /> מיזוג לחברה קיימת
                        </button>
                        <button onClick={() => handleAiChangeDecision(d.id, 'create_company')}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 border-b border-border-default/40">
                            <IconPlus /> יצירת חברה חדשה
                        </button>
                        <button onClick={() => handleAiChangeDecision(d.id, 'create_company_enrich')}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-teal-50 text-teal-700 flex items-center gap-2 border-b border-border-default/40">
                            <SparklesIcon className="w-3.5 h-3.5" /> יצירת חברה + העשרה
                        </button>
                        <button onClick={() => handleAiChangeDecision(d.id, 'map_generic')}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-orange-50 text-orange-700 flex items-center gap-2 border-b border-border-default/40">
                            <IconGrid className="w-3.5 h-3.5" /> שיוך לסל גנרי
                        </button>
                        <button onClick={() => handleAddToBlacklist(d)}
                            className="w-full text-right px-3 py-2.5 text-xs font-semibold hover:bg-gray-50 text-gray-700 flex items-center gap-2">
                            <IconXCircle className="w-3.5 h-3.5 rounded-full border border-current p-0.5" /> הוסף לרשימה שחורה
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ══════════════════════════════════════════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════════════════════════════════════════

    return (
        <div className="space-y-4 h-full flex flex-col pb-6 relative font-sans">
            {notification && (
                <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />
            )}

            {/* Dropdown backdrop */}
            {openDropdownId && <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownId(null)} />}

            {/* ── Header ── */}
            <div className="flex justify-between items-center bg-white border border-border-default rounded-xl p-4 shadow-sm flex-shrink-0">
                <div>
                    <h1 className="text-xl font-black text-text-default">בקרת איכות דאטה (Data Quality)</h1>
                    <p className="text-sm text-text-muted">תיקון ומיזוג שמות חברות שזוהו מקורות חיים</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-text-muted">סוכן AI: {agentActive ? 'פעיל' : 'כבוי'}</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={agentActive} onChange={e => setAgentActive(e.target.checked)} />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                    </label>
                </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex border-b border-border-default space-x-reverse space-x-8 px-2 font-bold text-sm text-text-muted flex-shrink-0">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'border-indigo-500 text-indigo-600' : 'border-transparent hover:text-text-default'}`}
                >
                    <SparklesIcon className="w-4 h-4" />
                    <span>לוח בקרה</span>
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${activeTab === 'manual' ? 'border-orange-500 text-orange-600' : 'border-transparent hover:text-text-default'}`}
                >
                    <span>לטיפול ידני</span>
                    {unmatched.length > 0 && (
                        <span className="bg-orange-100 text-orange-800 text-[10px] px-2 py-0.5 rounded-full">{unmatched.length}</span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('ai_decisions')}
                    className={`pb-3 border-b-2 transition-all ${activeTab === 'ai_decisions' ? 'border-orange-500 text-orange-600' : 'border-transparent hover:text-text-default'}`}
                >
                    החלטות הסוכן (AI)
                </button>
                <button
                    onClick={() => setActiveTab('blacklist')}
                    className={`pb-3 border-b-2 transition-all flex items-center gap-2 ${activeTab === 'blacklist' ? 'border-orange-500 text-orange-600' : 'border-transparent hover:text-text-default'}`}
                >
                    <span className="text-rose-500"><IconXCircle className="w-4 h-4 rounded-full border border-rose-500 p-0.5" /></span>
                    <span>רשימה שחורה</span>
                    <span className="bg-gray-100 text-gray-800 text-[10px] px-2 py-0.5 rounded-full">{blacklist.length}</span>
                </button>
            </div>

            {/* ══════════════ DASHBOARD TAB ══════════════ */}
            {activeTab === 'dashboard' && (
                <div className="flex-1 overflow-y-auto min-h-0 px-1">
                    <AdminCompanyAgentDashboard />
                </div>
            )}

            {/* ══════════════ MANUAL TAB (original split-panel) ══════════════ */}
            {activeTab === 'manual' && (
                <div className="flex flex-col gap-4 flex-1 min-h-0">
                    {/* Sub-mode switcher */}
                    <div className="flex justify-between items-center flex-shrink-0">
                        <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default">
                            <button
                                onClick={() => setViewMode('pending')}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'pending' ? 'bg-white text-orange-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                            >
                                <ExclamationTriangleIcon className="w-4 h-4" />
                                ממתין לטיפול
                                <span className="bg-orange-100 text-orange-800 text-xs px-1.5 rounded-full">{unmatched.length}</span>
                            </button>
                            <button
                                onClick={() => setViewMode('history')}
                                className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'history' ? 'bg-white text-orange-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                            >
                                היסטוריה
                                <span className="bg-gray-100 text-gray-700 text-xs px-1.5 rounded-full">{historyEntries.length}</span>
                            </button>
                        </div>
                    </div>

                    {/* Split panel */}
                    <div className="flex gap-4 flex-1 min-h-0">
                        {/* LEFT: list */}
                        <div className="w-full lg:w-1/3 bg-white rounded-2xl border border-border-default shadow-sm flex flex-col min-h-0">
                            {/* Search + sort */}
                            <div className="p-3 border-b border-border-default flex-shrink-0">
                                <div className="relative mb-2">
                                    <MagnifyingGlassIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle" />
                                    <input
                                        type="text"
                                        placeholder="חיפוש..."
                                        value={manualSearchTerm}
                                        onChange={e => setManualSearchTerm(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-2 pr-9 pl-3 text-sm focus:ring-2 focus:ring-orange-500"
                                    />
                                </div>
                                {viewMode === 'pending' && (
                                    <div className="flex items-center justify-between text-[11px] text-text-muted px-1">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={filteredUnmatched.length > 0 && checkedIds.size === filteredUnmatched.length}
                                                onChange={handleSelectAll}
                                                className="w-3.5 h-3.5 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                                            />
                                            <span>בחר הכל</span>
                                            {checkedIds.size > 0 && (
                                                <button onClick={() => setCheckedIds(new Set())} className="text-red-500 hover:underline">נקה</button>
                                            )}
                                        </div>
                                        <select
                                            value={sortBy}
                                            onChange={e => setSortBy(e.target.value as any)}
                                            className="bg-transparent text-[11px] font-semibold text-text-muted focus:outline-none cursor-pointer"
                                        >
                                            <option value="confidence">לפי ביטחון</option>
                                            <option value="occurrences">לפי שכיחות</option>
                                            <option value="name">א-ב</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* List */}
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {viewMode === 'pending' ? (
                                    filteredUnmatched.length > 0 ? filteredUnmatched.map(item => {
                                        const displayIsCompany = companyFlags[item.id] ?? item.isCompany;
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => setSelected(item)}
                                                className={`p-3 rounded-xl cursor-pointer border transition-all relative group flex items-start gap-3 ${
                                                    selected?.id === item.id && checkedIds.size === 0
                                                        ? 'bg-orange-50 border-orange-200 shadow-sm ring-1 ring-orange-100'
                                                        : checkedIds.has(item.id)
                                                        ? 'bg-purple-50 border-purple-200 shadow-sm'
                                                        : 'bg-white border-transparent hover:bg-bg-subtle hover:border-border-default'
                                                }`}
                                            >
                                                <div className="pt-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={checkedIds.has(item.id)}
                                                        onClick={e => handleToggleCheck(e, item.id)}
                                                        onChange={() => {}}
                                                        className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${companyFlagClass(displayIsCompany)}`} />
                                                            <h4 className="font-bold text-text-default text-base truncate" title={item.name}>{item.name}</h4>
                                                        </div>
                                                        {item.occurrences > 1 && (
                                                            <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex-shrink-0">x{item.occurrences}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-xs text-text-muted flex items-center gap-1 max-w-[110px]">
                                                            <UserIcon className="w-3 h-3" />
                                                            <span className="truncate">{item.candidateName}</span>
                                                        </div>
                                                        <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0 ${item.confidence > 90 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {item.confidence > 90 && <SparklesIcon className="w-3 h-3" />}
                                                            {item.confidence}%
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 mt-2 flex-wrap text-[10px]">
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setCompanyFlags(prev => ({ ...prev, [item.id]: true })); }}
                                                            className={`px-2 py-1 rounded-full border ${displayIsCompany ? 'bg-green-100 border-green-200 text-green-700' : 'border-gray-200 text-text-muted hover:border-border-default hover:bg-bg-subtle'}`}
                                                        >
                                                            חברה
                                                        </button>
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setCompanyFlags(prev => ({ ...prev, [item.id]: false })); }}
                                                            className={`px-2 py-1 rounded-full border ${displayIsCompany ? 'border-gray-200 text-text-muted hover:border-border-default hover:bg-bg-subtle' : 'bg-red-100 border-red-200 text-red-700'}`}
                                                        >
                                                            לא חברה
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="text-center p-8 text-text-muted text-sm">אין פריטים לטיפול!</div>
                                    )
                                ) : (
                                    <div className="space-y-0 divide-y divide-border-default">
                                        {filteredHistory.map(entry => (
                                            <div key={entry.id} className="p-4 hover:bg-bg-subtle/50 transition-colors">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${companyFlagClass(entry.isCompany)}`} />
                                                            {entry.resolvedValue ? (
                                                                <>
                                                                    <span className="font-bold text-text-default line-through opacity-60">{entry.name}</span>
                                                                    <ArrowTopRightOnSquareIcon className="w-3 h-3 text-text-subtle" />
                                                                    <span className="font-bold text-green-700">{entry.resolvedValue}</span>
                                                                </>
                                                            ) : (
                                                                <span className="font-bold text-text-default">{entry.name}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-text-muted mt-1 flex items-center gap-2">
                                                            <span className="capitalize bg-bg-subtle px-1.5 rounded">{entry.resolutionType || 'הוסר'}</span>
                                                            <span>•</span>
                                                            <span>{new Date(entry.createdAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[10px] text-text-muted">{new Date(entry.createdAt).toLocaleDateString('he-IL')}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredHistory.length === 0 && <div className="text-center p-10 text-text-muted">אין היסטוריה להצגה</div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: action workspace */}
                        {viewMode === 'pending' && (
                            <div className="w-full lg:w-2/3 flex flex-col gap-4">
                                {isBulkMode ? (
                                    /* BULK MODE */
                                    <div className="bg-white rounded-2xl border border-purple-200 shadow-sm flex-1 flex flex-col overflow-hidden ring-1 ring-purple-100">
                                        <div className="p-6 bg-purple-50 border-b border-purple-100">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="p-2 bg-purple-200 text-purple-700 rounded-lg">
                                                    <Squares2X2Icon className="w-6 h-6" />
                                                </div>
                                                <h2 className="text-xl font-black text-purple-900">טיפול מרוכז (Batch)</h2>
                                            </div>
                                            <p className="text-purple-800 text-sm">
                                                נבחרו <span className="font-bold">{checkedIds.size}</span> פריטים למיזוג.
                                            </p>
                                        </div>
                                        <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                                            <div className="flex flex-wrap gap-2">
                                                {selectedItemsForAction.map(item => (
                                                    <div key={item.id} className="bg-white border border-purple-200 text-purple-800 text-sm px-3 py-1.5 rounded-full shadow-sm flex items-center gap-2">
                                                        <span>{item.name}</span>
                                                        <button onClick={e => handleToggleCheck(e as any, item.id)} className="text-purple-400 hover:text-purple-700">
                                                            <XMarkIcon className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="bg-white p-6 rounded-xl border border-border-default shadow-sm">
                                                <label className="block text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                                                    <LinkIcon className="w-5 h-5 text-orange-500" />
                                                    בחר חברת יעד למיזוג כולם
                                                </label>
                                                <div className="relative max-w-lg mb-2">
                                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                                    <input
                                                        type="text"
                                                        placeholder="חפש חברה במאגר..."
                                                        value={linkSearchTerm}
                                                        onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                                        className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-orange-500 font-medium"
                                                        autoFocus
                                                    />
                                                </div>
                                                {linkSearchTerm && !selectedExistingCompany && (
                                                    <div className="border border-border-default rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto max-w-lg mb-4">
                                                        {filteredExisting.length > 0 ? filteredExisting.map(company => (
                                                            <button key={company.id} onClick={() => handleSelectForMerge(company)}
                                                                className="w-full text-right p-3 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors border-b border-border-default last:border-0 flex justify-between items-center">
                                                                <span>{company.name}</span>
                                                                <span className="text-xs text-text-subtle">בחר</span>
                                                            </button>
                                                        )) : (
                                                            <div className="p-4 text-center text-sm text-text-muted">לא נמצאו חברות תואמות</div>
                                                        )}
                                                    </div>
                                                )}
                                                {selectedExistingCompany && (
                                                    <div className="mt-4 flex gap-3">
                                                        <button onClick={() => handleResolve('link')}
                                                            className="bg-orange-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-orange-700 transition flex items-center gap-2">
                                                            <CheckCircleIcon className="w-5 h-5" />
                                                            מזג ל-{selectedExistingCompany.name}
                                                        </button>
                                                        <button onClick={() => { setSelectedExistingCompany(null); setLinkSearchTerm(''); }}
                                                            className="bg-bg-subtle text-text-default font-bold py-2.5 px-4 rounded-xl hover:bg-bg-hover border border-border-default">
                                                            ביטול
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap gap-3">
                                                <button onClick={() => handleResolve('create')}
                                                    className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-bg-subtle transition shadow-sm">
                                                    <PlusIcon className="w-4 h-4 text-green-600" />
                                                    צור כחברה חדשה
                                                </button>
                                                <button onClick={() => handleResolve('delete')}
                                                    className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition shadow-sm">
                                                    <TrashIcon className="w-4 h-4" />
                                                    מחק / התעלם
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ) : selected ? (
                                    /* SINGLE SELECTION */
                                    <div className="bg-white rounded-2xl border border-border-default shadow-sm flex-1 flex flex-col overflow-hidden">
                                        {/* Item header */}
                                        <div className="p-6 border-b border-border-default bg-bg-subtle/30">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className={`w-3 h-3 rounded-full ${companyFlagClass(companyFlags[selected.id] ?? selected.isCompany)}`} />
                                                        <h2 className="text-2xl font-black text-text-default">{selected.name}</h2>
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selected.confidence > 90 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                                            {selected.confidence}% ביטחון
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-4 text-sm text-text-muted mt-1">
                                                        <button
                                                            onClick={() => {
                                                                if (!selected.candidateId) return;
                                                                setDrawerCandidate({ id: selected.candidateId, backendId: selected.candidateId, name: selected.candidateName });
                                                                setIsDrawerOpen(true);
                                                            }}
                                                            className="flex items-center gap-1.5 hover:text-orange-600 transition-colors"
                                                        >
                                                            <UserIcon className="w-4 h-4" />
                                                            {selected.candidateName}
                                                        </button>
                                                        {selected.occurrences > 1 && (
                                                            <span className="text-[11px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
                                                                {selected.occurrences} מופעים
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => setCompanyFlags(prev => ({ ...prev, [selected.id]: true }))}
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${(companyFlags[selected.id] ?? selected.isCompany) ? 'bg-green-500 text-white border-green-500' : 'bg-white border-border-default text-text-muted hover:border-green-400 hover:text-green-700'}`}
                                                    >
                                                        חברה
                                                    </button>
                                                    <button
                                                        onClick={() => setCompanyFlags(prev => ({ ...prev, [selected.id]: false }))}
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${!(companyFlags[selected.id] ?? selected.isCompany) ? 'bg-red-500 text-white border-red-500' : 'bg-white border-border-default text-text-muted hover:border-red-400 hover:text-red-700'}`}
                                                    >
                                                        לא חברה
                                                    </button>
                                                </div>
                                            </div>
                                            {selected.aiSuggestion && (
                                                <div className="mt-4 bg-orange-50 border border-orange-100 rounded-xl p-3">
                                                    <p className="text-xs text-orange-600 font-bold mb-1">הצעת AI</p>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-lg font-black text-gray-900">{selected.aiSuggestion}</span>
                                                    </div>
                                                    {selected.aiReason && (
                                                        <p className="text-xs text-orange-700 bg-orange-100/50 p-2 rounded-lg border border-orange-100 mt-2">
                                                            💡 סיבה: <strong>{selected.aiReason}</strong>
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                                            {/* Merge */}
                                            <div>
                                                <label className="block text-sm font-bold text-text-default mb-2 flex items-center gap-2">
                                                    <LinkIcon className="w-4 h-4 text-orange-500" />
                                                    מיזוג לחברה קיימת (הוספה כ-Alias)
                                                </label>
                                                <div className="relative max-w-lg">
                                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                                    <input
                                                        type="text"
                                                        placeholder="חפש חברה במאגר..."
                                                        value={linkSearchTerm}
                                                        onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                                        className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-orange-500 font-medium"
                                                    />
                                                </div>
                                                {linkSearchTerm && !selectedExistingCompany && (
                                                    <div className="mt-2 border border-border-default rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto max-w-lg">
                                                        {filteredExisting.length > 0 ? filteredExisting.map(company => (
                                                            <button key={company.id} onClick={() => handleSelectForMerge(company)}
                                                                className="w-full text-right p-3 text-sm hover:bg-orange-50 hover:text-orange-700 transition-colors border-b border-border-default last:border-0 flex justify-between items-center group">
                                                                <span>{company.name}</span>
                                                                <span className="text-xs text-text-subtle group-hover:text-orange-500">בחר</span>
                                                            </button>
                                                        )) : (
                                                            <div className="p-4 text-center text-sm text-text-muted">לא נמצאו חברות תואמות</div>
                                                        )}
                                                    </div>
                                                )}
                                                {selectedExistingCompany && (
                                                    <div className="mt-4">
                                                        <div className="flex gap-3">
                                                            <button onClick={() => handleResolve('link')}
                                                                className="bg-orange-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-orange-700 transition shadow-lg flex items-center gap-2">
                                                                <CheckCircleIcon className="w-5 h-5" />
                                                                תקן ל-{selectedExistingCompany.name}
                                                            </button>
                                                            <button onClick={() => { setSelectedExistingCompany(null); setLinkSearchTerm(''); }}
                                                                className="bg-bg-subtle text-text-default font-bold py-2.5 px-4 rounded-xl hover:bg-bg-hover border border-border-default">
                                                                ביטול
                                                            </button>
                                                        </div>
                                                        {selected.occurrences > 1 && (
                                                            <p className="text-xs text-text-muted mt-2">
                                                                * יעדכן אוטומטית {selected.occurrences} מופעים של "{selected.name}" במערכת.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="h-px bg-border-default w-full" />

                                            {/* Other actions */}
                                            <div>
                                                <p className="text-xs font-bold text-text-muted uppercase mb-3 tracking-wide">אפשרויות נוספות</p>
                                                <div className="flex flex-wrap gap-3">
                                                    <button onClick={() => handleResolve('create')}
                                                        className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-bg-subtle transition shadow-sm">
                                                        <PlusIcon className="w-4 h-4 text-green-600" />
                                                        צור כחברה חדשה במאגר
                                                    </button>
                                                    <button onClick={() => handleResolve('delete')}
                                                        className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition shadow-sm">
                                                        <TrashIcon className="w-4 h-4" />
                                                        מחק / התעלם
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* EMPTY STATE */
                                    <div className="bg-white rounded-2xl border border-border-default shadow-sm flex-1 flex flex-col items-center justify-center p-12 text-center text-text-muted">
                                        <div className="w-20 h-20 bg-bg-subtle rounded-full flex items-center justify-center mb-6">
                                            <LinkIcon className="w-10 h-10 opacity-30" />
                                        </div>
                                        <h3 className="text-xl font-bold text-text-default mb-2">בחר שגיאה לטיפול</h3>
                                        <p className="max-w-xs">בחר שם חברה מהרשימה מימין כדי לראות את הצעות המערכת ולבצע מיזוג או יצירה.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════ AI DECISIONS TAB ══════════════ */}
            {activeTab === 'ai_decisions' && (
                <>
                    {/* Filter bar */}
                    <div className="bg-white p-4 rounded-2xl border border-border-default shadow-sm space-y-4 flex-shrink-0">
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex items-center gap-6 text-sm font-semibold text-text-default order-2 md:order-1 self-start md:self-auto px-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-rose-500 focus:ring-rose-500 cursor-pointer"
                                        checked={showManual} onChange={e => setShowManual(e.target.checked)} />
                                    <span className="text-rose-500"><IconWarning className="w-4 h-4" /></span>
                                    <span>נדרש ידנית</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                                        checked={showAutoHandled} onChange={e => setShowAutoHandled(e.target.checked)} />
                                    <span className="text-emerald-500 bg-emerald-100 p-0.5 rounded-sm"><IconCheck className="w-3.5 h-3.5" /></span>
                                    <span>טופל אוטומטית</span>
                                </label>
                            </div>
                            <div className="relative w-full md:w-1/2 lg:w-1/3 order-1 md:order-2">
                                <IconSearch />
                                <input
                                    type="text" placeholder="חיפוש חופשי לפי מונח..."
                                    value={aiSearchTerm} onChange={e => setAiSearchTerm(e.target.value)}
                                    className="bg-bg-input border border-border-default rounded-xl w-full py-2.5 pr-9 pl-3 text-sm focus:ring-2 focus:ring-orange-500 font-medium"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                                className="bg-bg-subtle border border-border-default rounded-xl px-4 py-2 text-sm font-semibold text-text-default hover:bg-bg-hover focus:ring-2 focus:ring-orange-500 [color-scheme:light]" />
                            <select value={sortOrder} onChange={e => setSortOrder(e.target.value as 'newest' | 'oldest')}
                                className="bg-bg-subtle border border-border-default rounded-xl px-4 py-2 text-sm font-semibold text-text-default hover:bg-bg-hover cursor-pointer focus:ring-2 focus:ring-orange-500">
                                <option value="newest">חדש ביותר</option>
                                <option value="oldest">ישן ביותר</option>
                            </select>
                            <select value={decisionTypeFilter} onChange={e => setDecisionTypeFilter(e.target.value as 'all' | DecisionType)}
                                className="bg-bg-subtle border border-border-default rounded-xl px-4 py-2 text-sm font-semibold text-text-default hover:bg-bg-hover cursor-pointer focus:ring-2 focus:ring-orange-500">
                                <option value="all">כל ההחלטות</option>
                                <option value="create_company">יצירת חברה חדשה</option>
                                <option value="merge_company">מיזוג לחברה קיימת</option>
                                <option value="map_generic">שיוך לסל גנרי</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden flex-1 flex flex-col min-h-[400px]">
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-right border-collapse">
                                <thead className="bg-[#f8fafc] border-b border-border-default sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 w-12 text-center align-middle border-l border-border-default/50">
                                            <button
                                                title="בחירה מרובה"
                                                onClick={() => { setIsMultiSelect(v => !v); setAiCheckedIds(new Set()); }}
                                                className={`p-1.5 rounded-lg border ${isMultiSelect ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-border-default text-text-muted hover:text-text-default'}`}
                                            >
                                                <IconGrid className="w-4 h-4" />
                                            </button>
                                        </th>
                                        {['מונח מקורי', 'תאריך פעולה', 'קונטקסט', 'החלטת מודל והסבר', 'מדד התלבטות AI', 'הקשר רחב בבסיס הנתונים'].map((col, i) => (
                                            <th key={col} className={`p-4 text-xs font-bold text-text-muted uppercase whitespace-nowrap ${i === 0 ? 'text-right min-w-[200px]' : 'text-center'} ${i === 1 ? 'min-w-[120px]' : ''} ${i === 2 ? 'min-w-[110px]' : ''} ${i === 3 ? 'min-w-[340px]' : ''} ${i === 4 || i === 5 ? 'min-w-[250px]' : ''}`}>
                                                {col}
                                            </th>
                                        ))}
                                        <th className="p-4 text-xs font-bold text-text-muted uppercase text-left whitespace-nowrap">פעולה</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-default">
                                    {filteredDecisions.map(d => (
                                        <tr key={d.id} className={`transition-colors ${
                                            d.needsManual
                                                ? 'bg-slate-50/70 opacity-55 hover:opacity-75 pointer-events-none'
                                                : 'hover:bg-[#f8fafc]'
                                        }`}>
                                            <td className="p-4 align-top text-center w-12 border-l border-border-default/20 pt-6">
                                                {isMultiSelect && (
                                                    <input type="checkbox" checked={aiCheckedIds.has(d.id)} onChange={() => toggleAiCheck(d.id)}
                                                        className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 cursor-pointer" />
                                                )}
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="font-extrabold text-text-default text-base mb-2">{d.originalTerm}</div>
                                                <button
                                                    onClick={() => {
                                                        if (!d.candidateId) return;
                                                        setDrawerCandidate({ id: d.candidateId, backendId: d.candidateId, name: d.candidateName });
                                                        setIsDrawerOpen(true);
                                                    }}
                                                    className="inline-flex items-center gap-1.5 text-text-muted text-xs cursor-pointer hover:bg-bg-subtle px-2 py-1 -ml-2 rounded-md"
                                                >
                                                    <IconUser />
                                                    <span>{d.candidateName}</span>
                                                </button>
                                                <div className="mt-2.5">
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-100/50 border border-indigo-200/60 rounded px-1.5 py-0.5">{d.source}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-top text-[11px] text-text-muted whitespace-nowrap pt-5">
                                                <div className="flex justify-center items-center gap-1.5">
                                                    <IconClock />
                                                    <span>{formatDate(d.actionDate)}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center align-top text-xs text-text-muted pt-5">{d.context}</td>
                                            <td className="p-4 align-top text-center pt-5">{renderDecisionBadge(d)}</td>
                                            <td className="p-4 align-top pt-5">{renderHesitationBox(d)}</td>
                                            <td className="p-4 align-top text-center pt-5">{renderSimilarEntities(d)}</td>
                                            <td className="p-4 align-top text-left pt-5">{renderActionDropdown(d)}</td>
                                        </tr>
                                    ))}
                                    {loadingDecisions && (
                                        <tr>
                                            <td colSpan={8} className="p-12 text-center text-text-muted text-sm">
                                                <div className="flex items-center justify-center gap-2">
                                                    <svg className="animate-spin w-4 h-4 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                    </svg>
                                                    טוען נתונים...
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {!loadingDecisions && filteredDecisions.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="p-12 text-center text-text-muted text-sm">אין נתונים להצגה</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ══════════════ BLACKLIST TAB ══════════════ */}
            {activeTab === 'blacklist' && (
                <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden flex-1 flex flex-col min-h-[400px]">
                    {blacklist.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-text-muted">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-400">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-text-default mb-1">הרשימה השחורה ריקה</h3>
                            <p className="text-sm max-w-xs">מונחים שיוספו לרשימה השחורה לא יעובדו מחדש ע"י הסוכן</p>
                        </div>
                    ) : (
                        <div className="overflow-auto flex-1 custom-scrollbar">
                            <table className="w-full text-right border-collapse">
                                <thead className="bg-[#f8fafc] border-b border-border-default sticky top-0 z-10">
                                    <tr>
                                        {['מונח', 'מקור', 'מועמד', 'תאריך הוספה', 'פעולה'].map(col => (
                                            <th key={col} className={`p-4 text-xs font-bold text-text-muted uppercase whitespace-nowrap ${col === 'מונח' ? 'text-right' : 'text-center'}`}>{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-default">
                                    {blacklist.map(entry => (
                                        <tr key={entry.id} className="hover:bg-[#f8fafc] transition-colors">
                                            <td className="p-4 align-middle">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-rose-500 flex-shrink-0">
                                                        <IconXCircle className="w-4 h-4 rounded-full border border-rose-400 p-0.5" />
                                                    </span>
                                                    <span className="font-bold text-text-default">{entry.term}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 align-middle text-center">
                                                {entry.source && (
                                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-100/50 border border-indigo-200/60 rounded px-1.5 py-0.5">{entry.source}</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle text-center text-xs text-text-muted">
                                                {entry.candidateName && (
                                                    <div className="flex justify-center items-center gap-1">
                                                        <IconUser />
                                                        {entry.candidateName}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle text-center text-[11px] text-text-muted">{formatDate(entry.addedAt)}</td>
                                            <td className="p-4 align-middle text-center">
                                                <button onClick={() => setBlacklist(prev => prev.filter(e => e.id !== entry.id))}
                                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                                                    <IconTrash />
                                                    הסר
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Candidate drawer */}
            <CandidateSummaryDrawer
                candidate={drawerCandidate}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                isFavorite={false}
                onToggleFavorite={() => {}}
            />

            {/* Quick create modal */}
            <QuickCreateCompanyModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                initialName={activeTab === 'manual' ? (selected?.name || '') : aiCreateModalName}
                onSave={activeTab === 'manual' ? handleCreateNewCompany : (data) => {
                    setIsCreateModalOpen(false);
                    notify(`החברה "${data.name}" נוצרה בהצלחה`);
                }}
            />

            {/* ── Merge / Generic modal ────────────────────────────────── */}
            {mergeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMergeModal(null)}>
                    <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md text-right" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-black text-slate-800 mb-1">
                            {mergeModal.mode === 'merge_company' ? 'מיזוג לחברה קיימת' : 'שיוך לסל גנרי'}
                        </h2>
                        <p className="text-sm text-text-muted mb-5">
                            הביטוי <span className="font-bold text-text-default">"{mergeModal.term}"</span> {mergeModal.mode === 'merge_company' ? 'ישויך כ-Alias לחברה שנבחר' : 'ימופה לסל הגנרי שנבחר'}
                        </p>

                        {mergeModal.mode === 'merge_company' ? (
                            <>
                                <label className="block text-xs font-bold text-text-muted mb-1.5">חברה קיימת במאגר</label>
                                <input
                                    type="text"
                                    placeholder="חיפוש חברה..."
                                    value={mergeOrgSearch}
                                    onChange={e => setMergeOrgSearch(e.target.value)}
                                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-2 bg-white"
                                    autoFocus
                                />
                                <div className="w-full border border-slate-300 rounded-xl bg-slate-50 mb-5 max-h-48 overflow-y-auto">
                                    {[...organizations]
                                        .filter(o => !mergeOrgSearch.trim() || o.name.toLowerCase().includes(mergeOrgSearch.trim().toLowerCase()))
                                        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                                        .map(org => (
                                            <button
                                                key={org.id}
                                                type="button"
                                                onClick={() => { setMergeTargetId(org.id); setMergeTarget(org.name); }}
                                                className={`w-full text-right px-4 py-2 text-sm font-medium transition-colors ${mergeTargetId === org.id ? 'bg-indigo-100 text-indigo-800 font-bold' : 'text-slate-700 hover:bg-slate-100'}`}
                                            >
                                                {org.name}
                                            </button>
                                        ))
                                    }
                                    {organizations.filter(o => !mergeOrgSearch.trim() || o.name.toLowerCase().includes(mergeOrgSearch.trim().toLowerCase())).length === 0 && (
                                        <p className="text-center text-xs text-text-muted py-4">לא נמצאו תוצאות</p>
                                    )}
                                </div>
                                {mergeTargetId && (
                                    <div className="mb-4 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                                        ✓ "{mergeModal.term}" יצורף כ-Alias לחברה "{mergeTarget}"
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <label className="block text-xs font-bold text-text-muted mb-1.5">סל גנרי</label>
                                <select
                                    value={mergeTargetId}
                                    onChange={e => {
                                        setMergeTargetId(e.target.value);
                                        const org = organizations.find(o => o.id === e.target.value);
                                        setMergeTarget(org?.name ?? '');
                                    }}
                                    className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 mb-5 bg-slate-50"
                                >
                                    <option value="">-- בחר סל גנרי --</option>
                                    {organizations
                                        .filter(o => o.name?.includes('(גנרי)'))
                                        .map(o => (
                                            <option key={o.id} value={o.id}>{o.name}</option>
                                        ))
                                    }
                                </select>
                                {mergeTarget && (
                                    <div className="mb-4 text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                                        ✓ "{mergeModal.term}" ימופה לסל "{mergeTarget}"
                                    </div>
                                )}
                            </>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={handleMergeConfirm}
                                disabled={!mergeTarget || isMerging}
                                className={`flex-1 font-bold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-40 text-white ${
                                    mergeModal.mode === 'merge_company'
                                        ? 'bg-indigo-600 hover:bg-indigo-700'
                                        : 'bg-orange-600 hover:bg-orange-700'
                                }`}
                            >
                                {isMerging ? 'מבצע...' : mergeModal.mode === 'merge_company' ? 'אשר ובצע מיזוג' : 'אשר שיוך גנרי'}
                            </button>
                            <button
                                onClick={() => setMergeModal(null)}
                                className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-colors"
                            >
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminCompanyCorrectionsView;
