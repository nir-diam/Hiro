
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
    MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon, TagIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon, 
    FunnelIcon, Squares2X2Icon, ListBulletIcon, XMarkIcon, UserIcon,
    ChevronUpIcon, ChevronDownIcon, CalendarIcon,
    NoSymbolIcon, ArrowPathIcon, ArrowUturnLeftIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import JobDetailsDrawer from './JobDetailsDrawer';
import {
    fetchTagAiDecisions,
    fetchTagCorrectionAgentEnabled,
    resolveTagAiDecisions,
    saveTagCorrectionAgentEnabled,
    type TagAiDecisionDto,
} from '../services/tagCorrectionsApi';

// --- TYPES ---
interface UnmatchedTag {
    id: string;
    originalTerm: string;
    detectedType: 'skill' | 'role' | 'tool' | 'unknown';
    aiSuggestion?: string;
    confidence: number;
    contextSample: string;
    occurrences: number;
    tagKey?: string;
    status?: string;
    category?: string;
    description?: string;
}

interface TagOption {
    id: string;
    name: string;
}

interface GroupedTag {
    term: string;
    ids: string[];
    occurrences: number;
    detectedType: UnmatchedTag['detectedType'];
    contextSample: string;
    aiSuggestion?: string;
    entries: UnmatchedTag[];
}

const StatCard: React.FC<{ title: string; value: number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between">
        <div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl font-black text-text-default">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

// --- MULTI-SELECT COMPONENT ---
const MultiSelectDropdown: React.FC<{ 
    options: {value: string, label: string}[]; 
    selectedValues: string[]; 
    onChange: (values: string[]) => void; 
    placeholder: string;
    allLabel?: string;
}> = ({ options, selectedValues, onChange, placeholder, allLabel = "בחר הכל" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (val: string) => {
        if (val === 'all') { onChange(['all']); return; }
        let newValues = [...selectedValues];
        if (newValues.includes('all')) newValues = [];
        if (newValues.includes(val)) {
            newValues = newValues.filter(v => v !== val);
            if (newValues.length === 0) newValues = ['all'];
        } else {
            newValues.push(val);
        }
        onChange(newValues);
    };

    const isAllSelected = selectedValues.includes('all') || selectedValues.length === 0;
    let displayLabel = placeholder;
    if (!isAllSelected) {
        const selectedLabels = options.filter(o => selectedValues.includes(o.value)).map(o => o.label);
        displayLabel = selectedLabels.length > 1 ? `${selectedLabels.length} נבחרו` : selectedLabels[0];
    }

    return (
        <div className="relative inline-block text-right w-full" ref={containerRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white border border-border-default rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 transition-all font-medium text-text-default flex items-center justify-between gap-2"
            >
                <span className="truncate max-w-[120px]">{displayLabel}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="absolute z-10 mt-1 w-56 bg-white border border-border-default rounded-lg shadow-lg max-h-60 overflow-auto flex flex-col p-1 right-0">
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-subtle rounded cursor-pointer text-sm font-medium">
                        <input type="checkbox" checked={isAllSelected} onChange={() => toggleOption('all')} className="rounded text-primary-600 focus:ring-primary-500 border-border-default" />
                        {allLabel}
                    </label>
                    <div className="border-t border-border-default my-1" />
                    {options.map(opt => (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-subtle rounded cursor-pointer text-sm">
                            <input type="checkbox" checked={!isAllSelected && selectedValues.includes(opt.value)} onChange={() => toggleOption(opt.value)} className="rounded text-primary-600 focus:ring-primary-500 border-border-default" />
                            {opt.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const AI_HESITATION_FILTER_OPTIONS = [
    { value: 'low', label: 'ודאי / נמוך' },
    { value: 'medium', label: 'התלבטות בינונית' },
    { value: 'high', label: 'התלבטות קשה' },
];

const AI_STATUS_FILTER_OPTIONS = [
    { value: 'pending', label: 'ממתין לבדיקה' },
    { value: 'changed', label: 'טופל (שונה ע"י משתמש)' },
    { value: 'manual', label: 'הוחזר לטיפול ידני' },
    { value: 'approved', label: 'נבדק ואושר' },
    { value: 'delete', label: 'מחיקה / התעלמות' },
];

const getHesitationBucket = (level: number | null | undefined): 'low' | 'medium' | 'high' | null => {
    if (level == null) return null;
    if (level >= 61) return 'high';
    if (level >= 31) return 'medium';
    return 'low';
};

const getDecisionStatusBucket = (
    d: TagAiDecisionDto,
    manualQueuedIds: Set<string>,
): string => {
    if (manualQueuedIds.has(d.id) || d.reviewStatus === 'manual_queue' || d.reviewerAction === 'manual' || d.aiDecision === 'manual') {
        return 'manual';
    }
    if (d.reviewStatus === 'approved' || d.status === 'approved') {
        return 'approved';
    }
    if (d.reviewerAction === 'blacklist' || d.reviewerAction === 'delete' || d.aiDecision === 'delete') {
        return 'delete';
    }
    if (d.reviewStatus === 'overridden' || d.status === 'overridden') {
        return 'changed';
    }
    if (d.reviewStatus === 'pending_review') {
        return 'pending';
    }
    return 'agent';
};

const AdminTagCorrectionsView: React.FC = () => {
    const { t } = useLanguage();

    const [activeTab, setActiveTab] = useState<'manual' | 'ai' | 'blacklist'>('ai');
    const [isAgentOn, setIsAgentOn] = useState(true);
    const [agentSettingsLoading, setAgentSettingsLoading] = useState(false);
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
    const [selectedDecisions, setSelectedDecisions] = useState<Set<string>>(new Set());
    const [aiDecisions, setAiDecisions] = useState<TagAiDecisionDto[]>([]);
    const [aiDecisionsLoading, setAiDecisionsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize] = useState(25);
    const [listTotal, setListTotal] = useState(0);
    const [listTotalPages, setListTotalPages] = useState(1);
    const [listLoading, setListLoading] = useState(false);
    const [globalStats, setGlobalStats] = useState<{ totalPending: number; pendingUsageSum: number } | null>(null);

    // State
    const [unmatched, setUnmatched] = useState<UnmatchedTag[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<GroupedTag | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Filters State
    const [filterType, setFilterType] = useState<string>('all');
    const [minOccurrences, setMinOccurrences] = useState<number>(1);

    // AI Tab Filtering State
    const [aiFilterDecision, setAiFilterDecision] = useState<string[]>(['all']);
    const [aiFilterHesitation, setAiFilterHesitation] = useState<string[]>(['all']);
    const [aiFilterStatus, setAiFilterStatus] = useState<string[]>(['all']);
    const [aiFilterDate, setAiFilterDate] = useState('');
    const [aiSortOrder, setAiSortOrder] = useState<'asc' | 'desc'>('desc');
    const [aiSearchTerm, setAiSearchTerm] = useState('');
    const [aiFilterType, setAiFilterType] = useState('all');
    const [aiMinOccurrences, setAiMinOccurrences] = useState(1);
    const [aiReviewStatus, setAiReviewStatus] = useState<'pending_review' | 'approved' | 'overridden' | 'manual_queue' | 'all'>('all');
    const aiPageSize = 25;
    const [aiPage, setAiPage] = useState(1);

    // Link Action State
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingTag, setSelectedExistingTag] = useState<TagOption | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [linkTagResults, setLinkTagResults] = useState<TagOption[]>([]);
    const [linkTagSearchLoading, setLinkTagSearchLoading] = useState(false);
    const [linkedCandidates, setLinkedCandidates] = useState<{ id: string; name: string }[]>([]);
    const [linkedJobs, setLinkedJobs] = useState<{ id: string; title: string }[]>([]);
    const [linkedCandidatesLoading, setLinkedCandidatesLoading] = useState(false);
    const [drawerCandidate, setDrawerCandidate] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerJob, setDrawerJob] = useState<any | null>(null);
    const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);
    const [expandedAiRows, setExpandedAiRows] = useState<Set<string>>(new Set());

    // Optimistic local state for rows sent to manual queue (grayed-out with undo)
    const [manualQueuedDecisions, setManualQueuedDecisions] = useState<Map<string, Date>>(new Map());

    // Blacklist tab state
    const [blacklistDecisions, setBlacklistDecisions] = useState<TagAiDecisionDto[]>([]);
    const [blacklistLoading, setBlacklistLoading] = useState(false);
    const [blacklistSearchTerm, setBlacklistSearchTerm] = useState('');
    const [blacklistFilterType, setBlacklistFilterType] = useState('all');
    const [blacklistPage, setBlacklistPage] = useState(1);
    const blacklistPageSize = 25;

    // AI occurrences popup (shows candidates/jobs linked to a pending tag)
    const [aiOccurrencesPopup, setAiOccurrencesPopup] = useState<{
        decisionId: string;
        pendingTagId: string;
        term: string;
        candidates: { id: string; name: string }[];
        jobs: { id: string; title: string }[];
        loading: boolean;
    } | null>(null);

    const openAiOccurrences = async (decision: TagAiDecisionDto) => {
        setAiOccurrencesPopup({ decisionId: decision.id, pendingTagId: decision.pendingTagId, term: decision.originalTerm, candidates: [], jobs: [], loading: true });
        try {
            const res = await fetch(`${apiBase}/api/tags/${decision.pendingTagId}/candidates`);
            const body = res.ok ? await res.json() : {};
            const rawCandidates = Array.isArray(body) ? body : (Array.isArray(body.candidates) ? body.candidates : []);
            const rawJobs = Array.isArray(body.jobs) ? body.jobs : [];
            const candidates = rawCandidates.map((e: any) => ({
                id: e.candidate_id || e.candidateId || e.id,
                name: e.full_name || e.fullName || e.email || e.phone || 'מועמד',
            }));
            const jobs = rawJobs.map((j: any) => ({ id: j.id, title: j.title || j.name || 'משרה' }));
            setAiOccurrencesPopup((prev) => prev ? { ...prev, candidates, jobs, loading: false } : null);
        } catch {
            setAiOccurrencesPopup((prev) => prev ? { ...prev, loading: false } : null);
        }
    };

    // Merge-target picker modal (AI tab)
    const [mergePendingDecision, setMergePendingDecision] = useState<TagAiDecisionDto | null>(null);
    const [mergePriority, setMergePriority] = useState<number>(3);
    const [mergeSearchTerm, setMergeSearchTerm] = useState('');
    const [mergeSearchResults, setMergeSearchResults] = useState<TagOption[]>([]);
    const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
    const [mergeSelectedTag, setMergeSelectedTag] = useState<TagOption | null>(null);

    const topRef = useRef<HTMLDivElement | null>(null);

    const mapPendingTagEntry = (entry: any): UnmatchedTag => ({
        id: entry.id,
        originalTerm: entry.displayNameHe || entry.tagKey || 'תגית',
        detectedType: (entry.type as UnmatchedTag['detectedType']) || 'skill',
        aiSuggestion: entry.tagKey || entry.displayNameHe,
        confidence: entry.qualityState === 'verified' ? 98 : 80,
        contextSample: entry.description || entry.source || entry.category || 'AI detection',
        occurrences: entry.usageCount || 1,
        tagKey: entry.tagKey,
        status: entry.status,
        category: entry.category,
        description: entry.description,
    });

    const stats = useMemo(() => ({
        total: globalStats?.totalPending ?? listTotal,
        highConfidence: unmatched.filter((u) => u.confidence > 90).length,
        totalOccurrences: globalStats?.pendingUsageSum ?? unmatched.reduce((acc, curr) => acc + curr.occurrences, 0),
    }), [globalStats, listTotal, unmatched]);

    const flashStatus = (message: string) => {
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(''), 3500);
    };

    const loadAgentSettings = useCallback(async () => {
        if (!apiBase) return;
        setAgentSettingsLoading(true);
        try {
            const enabled = await fetchTagCorrectionAgentEnabled();
            setIsAgentOn(enabled);
        } catch (err) {
            console.error('[AdminTagCorrectionsView] agent settings load failed', err);
        } finally {
            setAgentSettingsLoading(false);
        }
    }, [apiBase]);

    const loadAiDecisions = useCallback(async () => {
        if (!apiBase) return;
        setAiDecisionsLoading(true);
        try {
            const decisionFilter = aiFilterDecision.includes('all') ? 'all' : aiFilterDecision[0];
            const payload = await fetchTagAiDecisions({
                page: 1,
                limit: 200,
                decision: decisionFilter,
                date: aiFilterDate,
                sortOrder: aiSortOrder,
                reviewStatus: aiReviewStatus,
                autoBackfill: isAgentOn && aiReviewStatus === 'pending_review',
                backfillLimit: 25,
            });
            setAiDecisions(payload.data);
            if (payload.total === 0 && payload.backfill?.processed === 0 && payload.backfill?.lastError) {
                flashStatus(`סוכן AI: ${payload.backfill.lastError}`);
            } else if (payload.backfill?.processed) {
                flashStatus(`סוכן AI עיבד ${payload.backfill.processed} תגיות ממתינות`);
            }
        } catch (err) {
            console.error('[AdminTagCorrectionsView] AI decisions load failed', err);
            setAiDecisions([]);
        } finally {
            setAiDecisionsLoading(false);
        }
    }, [apiBase, aiFilterDecision, aiFilterDate, aiSortOrder, aiReviewStatus, isAgentOn]);

    const loadBlacklistDecisions = useCallback(async () => {
        setBlacklistLoading(true);
        try {
            const payload = await fetchTagAiDecisions({
                page: 1,
                limit: 200,
                reviewStatus: 'overridden',
                reviewerAction: 'blacklist',
            });
            setBlacklistDecisions(payload.data);
        } catch (err) {
            console.error('[AdminTagCorrectionsView] Blacklist load failed', err);
            setBlacklistDecisions([]);
        } finally {
            setBlacklistLoading(false);
        }
    }, []);

    useEffect(() => { void loadAgentSettings(); }, [loadAgentSettings]);

    useEffect(() => {
        if (activeTab === 'ai') void loadAiDecisions();
        if (activeTab === 'blacklist') void loadBlacklistDecisions();
    }, [activeTab, loadAiDecisions, loadBlacklistDecisions]);

    const filteredAndSortedAiDecisions = useMemo(() => {
        let result = [...aiDecisions];
        if (aiSearchTerm) {
            result = result.filter(d => d.originalTerm.toLowerCase().includes(aiSearchTerm.toLowerCase()));
        }
        if (!aiFilterDecision.includes('all')) {
            result = result.filter(d => aiFilterDecision.includes(d.aiDecision));
        }
        if (aiFilterType !== 'all') {
            result = result.filter(d => {
                const t = (d.detectedType || '').toLowerCase();
                const ft = aiFilterType.toLowerCase();
                // 'education' in filter matches 'degree' or 'education' detectedType
                if (ft === 'education') return t === 'education' || t === 'degree';
                return t === ft;
            });
        }
        if (!aiFilterHesitation.includes('all')) {
            result = result.filter((d) => {
                const bucket = getHesitationBucket(d.hesitationLevel);
                return bucket != null && aiFilterHesitation.includes(bucket);
            });
        }
        if (!aiFilterStatus.includes('all')) {
            const manualQueuedIds = new Set<string>(manualQueuedDecisions.keys());
            result = result.filter((d) => aiFilterStatus.includes(getDecisionStatusBucket(d, manualQueuedIds)));
        }
        result.sort((a, b) => {
            const dateA = new Date(a.actionDate).getTime();
            const dateB = new Date(b.actionDate).getTime();
            return aiSortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
        return result;
    }, [aiDecisions, aiFilterDecision, aiFilterHesitation, aiFilterStatus, aiSearchTerm, aiSortOrder, aiFilterType, manualQueuedDecisions]);

    const aiTotalFiltered = filteredAndSortedAiDecisions.length;
    const aiTotalPages = Math.max(1, Math.ceil(aiTotalFiltered / aiPageSize));
    const paginatedAiDecisions = useMemo(() => {
        const start = (aiPage - 1) * aiPageSize;
        return filteredAndSortedAiDecisions.slice(start, start + aiPageSize);
    }, [filteredAndSortedAiDecisions, aiPage, aiPageSize]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => { setPage(1); }, [debouncedSearch, filterType, minOccurrences]);
    useEffect(() => { setAiPage(1); }, [aiSearchTerm, aiFilterType, aiFilterDecision, aiFilterHesitation, aiFilterStatus, aiFilterDate, aiReviewStatus, aiMinOccurrences]);

    const loadUnmatched = useCallback(async () => {
        if (!apiBase) return;
        setListLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', String(page));
            params.set('limit', String(pageSize));
            if (debouncedSearch) params.set('search', debouncedSearch);
            if (filterType !== 'all') params.set('type', filterType);
            if (minOccurrences > 1) params.set('minUsage', String(minOccurrences));
            const res = await fetch(`${apiBase}/api/tags/pending?${params.toString()}`);
            if (!res.ok) return;
            const body = await res.json();
            const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
            setUnmatched(list.map(mapPendingTagEntry));
            setListTotal(typeof body.total === 'number' ? body.total : list.length);
            setListTotalPages(typeof body.totalPages === 'number' ? body.totalPages : 1);
            if (body.stats) {
                setGlobalStats({
                    totalPending: Number(body.stats.totalPending) || 0,
                    pendingUsageSum: Number(body.stats.pendingUsageSum) || 0,
                });
            }
        } catch (err) {
            console.error('Failed to load tag corrections', err);
        } finally {
            setListLoading(false);
        }
    }, [apiBase, page, pageSize, debouncedSearch, filterType, minOccurrences]);

    useEffect(() => { void loadUnmatched(); }, [loadUnmatched]);

    const loadLinkTagOptions = useCallback(async (q: string) => {
        if (!apiBase || !q.trim()) { setLinkTagResults([]); return; }
        setLinkTagSearchLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('search', q.trim());
            params.set('limit', '40');
            params.set('page', '1');
            params.set('statuses', 'active');
            const res = await fetch(`${apiBase}/api/tags?${params.toString()}`);
            if (!res.ok) { setLinkTagResults([]); return; }
            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
            setLinkTagResults(list.map((tag: any) => ({
                id: tag.id,
                name: String(tag.displayNameHe || tag.displayNameEn || tag.tagKey || 'תגית').trim(),
            })));
        } catch {
            setLinkTagResults([]);
        } finally {
            setLinkTagSearchLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        const timer = setTimeout(() => void loadLinkTagOptions(linkSearchTerm), 280);
        return () => clearTimeout(timer);
    }, [linkSearchTerm, loadLinkTagOptions]);

    const loadMergeSearchResults = useCallback(async (q: string) => {
        if (!apiBase || !q.trim()) { setMergeSearchResults([]); return; }
        setMergeSearchLoading(true);
        try {
            const params = new URLSearchParams({ search: q.trim(), limit: '20', page: '1', statuses: 'active' });
            const res = await fetch(`${apiBase}/api/tags?${params.toString()}`);
            if (!res.ok) { setMergeSearchResults([]); return; }
            const payload = await res.json();
            const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
            setMergeSearchResults(list.map((tag: any) => ({
                id: tag.id,
                name: String(tag.displayNameHe || tag.displayNameEn || tag.tagKey || 'תגית').trim(),
            })));
        } catch {
            setMergeSearchResults([]);
        } finally {
            setMergeSearchLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        const timer = setTimeout(() => void loadMergeSearchResults(mergeSearchTerm), 280);
        return () => clearTimeout(timer);
    }, [mergeSearchTerm, loadMergeSearchResults]);

    useEffect(() => {
        if (selectedGroup && topRef.current) {
            topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [selectedGroup]);

    const groupedTags = useMemo(() => {
        const map = new Map<string, GroupedTag>();
        unmatched.forEach(tag => {
            const existing = map.get(tag.originalTerm);
            if (existing) {
                existing.ids.push(tag.id);
                existing.occurrences += tag.occurrences;
                existing.entries.push(tag);
            } else {
                map.set(tag.originalTerm, {
                    term: tag.originalTerm,
                    ids: [tag.id],
                    occurrences: tag.occurrences,
                    detectedType: tag.detectedType,
                    contextSample: tag.contextSample,
                    aiSuggestion: tag.aiSuggestion,
                    entries: [tag],
                });
            }
        });
        return Array.from(map.values());
    }, [unmatched]);

    useEffect(() => {
        if (!groupedTags.length) { setSelectedGroup(null); return; }
        setSelectedGroup((prev) => {
            if (!prev) return groupedTags[0];
            return groupedTags.find((g) => g.term === prev.term) || groupedTags[0];
        });
    }, [groupedTags]);

    useEffect(() => {
        if (!selectedGroup) { setLinkSearchTerm(''); setSelectedExistingTag(null); return; }
        setLinkSearchTerm(selectedGroup.aiSuggestion || selectedGroup.term || '');
        setSelectedExistingTag(null);
    }, [selectedGroup]);

    useEffect(() => {
        if (!selectedGroup || selectedExistingTag) return;
        const want = (selectedGroup.aiSuggestion || selectedGroup.term || '').trim().toLowerCase();
        if (!want || !linkTagResults.length) return;
        const hit = linkTagResults.find((t) => t.name.trim().toLowerCase() === want);
        if (hit) setSelectedExistingTag(hit);
    }, [selectedGroup, linkTagResults, selectedExistingTag]);

    // Load linked candidates/jobs when a group is selected
    useEffect(() => {
        let active = true;
        if (!selectedGroup || !apiBase) {
            setLinkedCandidates([]); setLinkedJobs([]); setLinkedCandidatesLoading(false);
            return;
        }
        setLinkedCandidatesLoading(true);
        setLinkedCandidates([]); setLinkedJobs([]);
        const loadCandidates = async () => {
            try {
                const responses = await Promise.all(
                    selectedGroup.ids.map(async (id) => {
                        const res = await fetch(`${apiBase}/api/tags/${id}/candidates`);
                        if (!res.ok) return { candidates: [], jobs: [] };
                        const body = await res.json();
                        if (Array.isArray(body)) return { candidates: body, jobs: [] };
                        return {
                            candidates: Array.isArray(body.candidates) ? body.candidates : [],
                            jobs: Array.isArray(body.jobs) ? body.jobs : [],
                        };
                    }),
                );
                if (!active) return;
                const allCandidates = responses.flatMap((r: any) => r.candidates || []).filter(Boolean);
                const allJobs = responses.flatMap((r: any) => r.jobs || []).filter(Boolean);
                const normalizedCandidates = allCandidates.map((entry: any) => ({
                    id: entry.candidate_id || entry.candidateId || entry.id,
                    name: entry.full_name || entry.fullName || entry.email || entry.phone || 'מועמד',
                }));
                setLinkedCandidates(Array.from(new Map(normalizedCandidates.map((c) => [c.id, c])).values()));
                const normalizedJobs = allJobs.map((job: any) => ({ id: job.id, title: job.title || job.name || 'משרה' }));
                setLinkedJobs(Array.from(new Map(normalizedJobs.map((j) => [j.id, j])).values()));
            } catch (err) {
                console.error('[AdminTagCorrectionsView] failed to load candidate info', err);
                if (active) { setLinkedCandidates([]); setLinkedJobs([]); }
            } finally {
                if (active) setLinkedCandidatesLoading(false);
            }
        };
        loadCandidates();
        return () => { active = false; };
    }, [selectedGroup, apiBase]);

    const applyAiActions = async (decisionIds: string[], action: 'merge' | 'create' | 'delete' | 'blacklist' | 'manual' | 'undo_manual', targetTagId?: string, aliasPriority?: number) => {
        if (!apiBase || !decisionIds.length) return;
        await resolveTagAiDecisions({ decisionIds, action, targetTagId, aliasPriority });
        // Only reload full list for actions that change the data set; manual is handled optimistically
        if (action !== 'manual' && action !== 'undo_manual') {
            await loadAiDecisions();
            await loadUnmatched();
        }
    };

    const handleBulkAction = async (action: 'merge' | 'create' | 'delete') => {
        if (selectedDecisions.size === 0) return;
        let msg = '';
        if (action === 'merge') msg = `האם לשנות פעולה למיזוג עבור ${selectedDecisions.size} התגיות הנבחרות?`;
        if (action === 'create') msg = `האם לשנות פעולה ליצירת תגית חדשה עבור ${selectedDecisions.size} התגיות הנבחרות?`;
        if (action === 'delete') msg = `האם למחוק ${selectedDecisions.size} תגיות נבחרות?`;
        if (!window.confirm(msg)) return;
        try {
            await applyAiActions(Array.from(selectedDecisions), action);
            setSelectedDecisions(new Set());
            setIsMultiSelectMode(false);
            flashStatus('הפעולה המרובה בוצעה בהצלחה.');
        } catch (err: unknown) {
            flashStatus(err instanceof Error ? err.message : 'הפעולה נכשלה');
        }
    };

    const handleSingleAiAction = async (decisionId: string, action: 'merge' | 'create' | 'delete' | 'blacklist' | 'manual' | 'undo_manual', targetTagId?: string, aliasPriority?: number) => {
        try {
            if (action === 'manual') {
                // Optimistic: immediately show grayed row, then call API
                setManualQueuedDecisions(prev => new Map(prev).set(decisionId, new Date()));
                await applyAiActions([decisionId], 'manual');
                flashStatus('הועבר לתיקון ידני.');
            } else if (action === 'undo_manual') {
                await applyAiActions([decisionId], 'undo_manual');
                setManualQueuedDecisions(prev => { const m = new Map(prev); m.delete(decisionId); return m; });
                flashStatus('הוחזר לתור.');
            } else {
                await applyAiActions([decisionId], action, targetTagId, aliasPriority);
                flashStatus('הפעולה בוצעה בהצלחה.');
            }
        } catch (err: unknown) {
            if (action === 'manual') setManualQueuedDecisions(prev => { const m = new Map(prev); m.delete(decisionId); return m; });
            flashStatus(err instanceof Error ? err.message : 'הפעולה נכשלה');
        }
    };

    const handleUndoBlacklist = async (decisionId: string, target: 'ai' | 'manual' = 'ai') => {
        try {
            await resolveTagAiDecisions({ decisionIds: [decisionId], action: 'undo_blacklist' });
            if (target === 'manual') {
                // After restoring to pending_review, immediately move to manual queue
                await resolveTagAiDecisions({ decisionIds: [decisionId], action: 'manual' });
            }
            setBlacklistDecisions(prev => prev.filter(d => d.id !== decisionId));
            flashStatus(target === 'manual' ? 'הוסר מהרשימה השחורה והועבר לטיפול ידני.' : 'הוסר מהרשימה השחורה והוחזר לתור AI.');
        } catch (err: unknown) {
            flashStatus(err instanceof Error ? err.message : 'הפעולה נכשלה');
        }
    };

    const openMergeModal = (decision: TagAiDecisionDto) => {
        setMergePendingDecision(decision);
        setMergeSelectedTag(null);
        setMergeSearchTerm(decision.aiSuggestedTarget ?? '');
        setMergeSearchResults([]);
        setMergePriority(3);
    };

    const closeMergeModal = () => {
        setMergePendingDecision(null);
        setMergeSelectedTag(null);
        setMergeSearchTerm('');
        setMergeSearchResults([]);
        setMergePriority(3);
    };

    const confirmMerge = async () => {
        if (!mergePendingDecision) return;
        const targetTagId = mergeSelectedTag?.id;
        // If no tag explicitly selected, we need aiSuggestedTarget for backend auto-resolution
        if (!targetTagId && !mergePendingDecision.aiSuggestedTarget) {
            flashStatus('יש לבחור תגית יעד למיזוג');
            return;
        }
        const priority = mergePriority;
        closeMergeModal();
        await handleSingleAiAction(mergePendingDecision.id, 'merge', targetTagId, priority);
    };

    const handleAgentToggle = async () => {
        const next = !isAgentOn;
        setIsAgentOn(next);
        if (!next) setActiveTab('manual');
        if (!apiBase) return;
        try {
            await saveTagCorrectionAgentEnabled(next);
            flashStatus(next ? 'סוכן AI הופעל' : 'סוכן AI כובה — תגיות חדשות יעברו לטיפול ידני');
        } catch (err: unknown) {
            setIsAgentOn(!next);
            flashStatus(err instanceof Error ? err.message : 'שמירת הגדרת סוכן נכשלה');
        }
    };

    const resolvePendingTag = async (action: 'link' | 'create' | 'ignore', targetTagId?: string) => {
        if (!selectedGroup || !apiBase) return;
        const payload: Record<string, any> = { ids: selectedGroup.ids, action };
        if (targetTagId) payload.targetTagId = targetTagId;
        const res = await fetch(`${apiBase}/api/tags/pending/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(body || 'הפעולה נכשלה');
        }
        await loadUnmatched();
        setLinkSearchTerm('');
        setSelectedExistingTag(null);
    };

    const handleResolve = async (action: 'link' | 'create' | 'ignore') => {
        if (!selectedGroup) return;
        try {
            if (action === 'link') {
                if (!selectedExistingTag) { flashStatus('בחר תגית קיימת למיזוג'); return; }
                await resolvePendingTag('link', selectedExistingTag.id);
                flashStatus(`הביטוי "${selectedGroup.term}" נוסף כמילה נרדפת ל-${selectedExistingTag.name}`);
            } else if (action === 'create') {
                await resolvePendingTag('create');
                flashStatus(`התגית "${selectedGroup.term}" נוצרה בהצלחה במאגר`);
            } else {
                await resolvePendingTag('ignore');
                flashStatus(`הביטוי "${selectedGroup.term}" הוסר מהרשימה`);
            }
            setSelectedGroup(null);
        } catch (err: any) {
            flashStatus(err.message || 'הפעולה נכשלה');
        }
    };

    const representativeTag = selectedGroup?.entries[0] || null;

    const handleOpenCandidateDrawer = (candidateId?: string | null, name?: string) => {
        if (!candidateId) return;
        setDrawerCandidate({ id: candidateId, backendId: candidateId, name: name || 'מועמד' });
        setIsDrawerOpen(true);
    };

    const handleOpenJobDrawer = (job: { id: string; title: string }) => {
        setDrawerJob({ id: job.id, title: job.title });
        setIsJobDrawerOpen(true);
    };

    const renderListPagination = (variant: 'top' | 'bottom') => (
        <div className={`p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted ${variant === 'top' ? 'border-b border-border-default' : 'border-t border-border-default'}`}>
            <span>{listTotal.toLocaleString()} רשומות · עמוד {page} / {listTotalPages}</span>
            <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40">הקודם</button>
                <button type="button" disabled={page >= listTotalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40">הבא</button>
            </div>
        </div>
    );

    return (
        <>
        <div ref={topRef} className="space-y-6 h-full flex flex-col pb-6 relative">

            {/* Header */}
            <div className="flex flex-col gap-6 flex-shrink-0">
                <div className="flex justify-between items-end border-b border-border-default pb-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                            <TagIcon className="w-8 h-8 text-primary-500"/>
                            תיקון וטיוב תגיות (Tag Corrections)
                        </h1>
                        <p className="text-sm text-text-muted mt-1">ניהול תגיות שזוהו ע"י ה-AI ודורשות סיווג או מיזוג</p>
                    </div>
                    <div className="flex items-center gap-3 bg-bg-subtle px-4 py-2 rounded-xl border border-border-default shadow-sm">
                        <span className="text-sm font-bold text-text-default">סוכן AI: {isAgentOn ? 'פעיל' : 'כבוי'}</span>
                        <button
                            type="button"
                            onClick={() => void handleAgentToggle()}
                            disabled={agentSettingsLoading}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${isAgentOn ? 'bg-primary-600' : 'bg-gray-300'}`}
                            dir="ltr"
                        >
                            <span className={`${isAgentOn ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border-subtle gap-8">
                    <button type="button" onClick={() => setActiveTab('ai')} disabled={!isAgentOn} className={`pb-3 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'ai' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'} ${!isAgentOn ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        החלטות הסוכן (AI)
                        {!isAgentOn && <span className="bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-[10px]">מושבת</span>}
                    </button>
                    <button type="button" onClick={() => setActiveTab('manual')} className={`pb-3 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'manual' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>
                        לטיפול ידני
                        {stats.total > 0 && <span className="bg-orange-100 text-orange-700 py-0.5 px-2 rounded-full text-[10px]">{stats.total}</span>}
                    </button>
                    <button type="button" onClick={() => setActiveTab('blacklist')} className={`pb-3 font-bold text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'blacklist' ? 'border-red-600 text-red-700' : 'border-transparent text-text-muted hover:text-text-default'}`}>
                        🚫 רשימה שחורה
                        {blacklistDecisions.length > 0 && <span className="bg-red-100 text-red-700 py-0.5 px-2 rounded-full text-[10px]">{blacklistDecisions.length}</span>}
                    </button>
                </div>

                {activeTab === 'manual' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <StatCard title="ממתינים לטיפול" value={stats.total} icon={<ExclamationTriangleIcon className="w-6 h-6 text-orange-600"/>} color="bg-orange-50" />
                        <StatCard title="זיהוי ודאי (AI)" value={stats.highConfidence} icon={<SparklesIcon className="w-6 h-6 text-purple-600"/>} color="bg-purple-50" />
                        <StatCard title="סה״כ מופעים" value={stats.totalOccurrences} icon={<ListBulletIcon className="w-6 h-6 text-blue-600"/>} color="bg-blue-50" />
                    </div>
                )}

                {statusMessage && (
                    <div className="px-4 py-2 rounded-2xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold shadow-sm">
                        {statusMessage}
                    </div>
                )}
            </div>

            {/* Manual tab — split view */}
            {activeTab === 'manual' && (
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

                {/* LEFT COLUMN */}
                <div className="w-full lg:w-1/3 bg-bg-card rounded-2xl border border-border-default flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-border-default space-y-3">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="חיפוש בשרת — נקה לעמוד ראשון"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-2 text-xs focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer">
                                    <option value="all">כל הסוגים</option>
                                    <option value="skill">Skill</option>
                                    <option value="role">Role</option>
                                    <option value="industry">Industry</option>
                                    <option value="tool">Tool</option>
                                    <option value="certification">Certification</option>
                                    <option value="language">Language</option>
                                    <option value="seniority">Seniority</option>
                                    <option value="domain">Domain</option>
                                    <option value="hard_skill">Hard Skill</option>
                                    <option value="soft_skill">Soft Skill</option>
                                    <option value="education">Education</option>
                                </select>
                                <FunnelIcon className="w-3 h-3 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                            </div>
                            <div className="flex-1 flex items-center gap-2 bg-bg-input border border-border-default rounded-lg px-2" title="מינימום מופעים">
                                <span className="text-[10px] text-text-muted font-bold whitespace-nowrap">min:</span>
                                <input type="number" min="1" value={minOccurrences} onChange={(e) => setMinOccurrences(parseInt(e.target.value) || 1)} className="w-full bg-transparent border-none outline-none text-xs py-2" />
                            </div>
                        </div>
                    </div>
                    {renderListPagination('top')}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-bg-subtle/20 min-h-[200px]">
                        {listLoading ? (
                            <div className="text-center text-sm text-text-muted py-8">טוען רשימה…</div>
                        ) : (
                            groupedTags.map((group) => (
                                <div key={group.term} onClick={() => setSelectedGroup(group)} className={`p-3 rounded-xl cursor-pointer border transition-all relative flex flex-col gap-2 ${selectedGroup?.term === group.term ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-100' : 'bg-white border-transparent hover:bg-bg-subtle hover:border-border-default'}`}>
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-text-default text-base truncate" dir="ltr">{group.term}</h4>
                                        <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{group.occurrences} מופעים</div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex gap-2">
                                            <span className={`px-1.5 py-0.5 rounded uppercase font-bold border ${group.detectedType === 'skill' ? 'bg-purple-50 text-purple-700 border-purple-100' : group.detectedType === 'role' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>{group.detectedType}</span>
                                            {group.ids.length > 1 && <span className="px-1.5 py-0.5 rounded-full bg-white border border-border-default text-[10px] text-text-muted">{group.ids.length} תיקים</span>}
                                        </div>
                                        <div className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 bg-yellow-50 text-yellow-700">
                                            {Math.round((group.entries.reduce((acc, curr) => acc + curr.confidence, 0) / group.entries.length) || 0)}% AI
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        {!listLoading && groupedTags.length === 0 && (
                            <div className="text-center p-8 text-text-muted text-sm">לא נמצאו תגיות לטיפול בעמוד זה</div>
                        )}
                    </div>
                    {renderListPagination('bottom')}
                </div>

                {/* RIGHT COLUMN */}
                <div className="w-full lg:w-2/3 flex flex-col gap-4">
                    {selectedGroup ? (
                        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm flex-1 flex flex-col relative overflow-hidden animate-fade-in">
                            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-primary-50/50 to-transparent z-0" />
                            <div className="p-8 relative z-10">
                                <div className="text-center mb-8 space-y-2">
                                    <span className="inline-block px-3 py-1 rounded-full bg-white border border-border-default text-xs font-bold text-text-muted mb-3 shadow-sm">
                                        מקור: {representativeTag?.contextSample || selectedGroup?.contextSample}
                                    </span>
                                    <h2 className="text-4xl font-black text-text-default mb-2" dir="ltr">{selectedGroup?.term}</h2>
                                    {linkedCandidatesLoading ? (
                                        <div className="flex items-center justify-center gap-2 text-sm text-text-muted py-4">
                                            <span className="inline-block w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                                            <span>טוען מועמדים...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="text-sm text-text-muted">
                                                זוהה כ-<span className="font-bold text-text-default">{selectedGroup?.detectedType}</span> ב-{selectedGroup?.occurrences || 0} קורות חיים שונים
                                            </div>
                                            {linkedCandidates.length > 0 && (
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {linkedCandidates.map(candidate => (
                                                        <button key={candidate.id} type="button" onClick={() => handleOpenCandidateDrawer(candidate.id, candidate.name)} className="flex items-center gap-1 text-xs text-text-muted bg-white px-3 py-1 rounded-full border border-border-default shadow-sm hover:text-primary-600 transition-colors">
                                                            <UserIcon className="w-4 h-4" />{candidate.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {linkedCandidates.length === 0 && linkedJobs.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="text-sm text-text-muted mb-2">התגית משויכת ל-{linkedJobs.length} משרות:</div>
                                                    <div className="flex flex-wrap gap-2 justify-center">
                                                        {linkedJobs.map(job => (
                                                            <button key={job.id} type="button" onClick={() => handleOpenJobDrawer(job)} className="inline-flex items-center gap-1 text-xs text-text-muted bg-white px-3 py-1 rounded-full border border-border-default shadow-sm hover:text-primary-600 hover:border-primary-300 transition-colors">
                                                                <TagIcon className="w-3.5 h-3.5" />{job.title}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {selectedGroup?.aiSuggestion && (
                                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center gap-4 shadow-sm mb-8 mx-auto max-w-xl">
                                        <div className="bg-purple-100 p-2 rounded-full text-purple-600"><SparklesIcon className="w-6 h-6"/></div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-0.5">המלצת המערכת</p>
                                            <p className="text-sm text-purple-900">נראה שזה וריאציה של התגית <strong>"{selectedGroup?.aiSuggestion}"</strong>. האם למזג?</p>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                                    {linkedCandidatesLoading ? (
                                        <div className="col-span-full flex items-center justify-center gap-2 text-sm text-text-muted py-12">
                                            <span className="inline-block w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                                            <span>טוען מועמדים...</span>
                                        </div>
                                    ) : (
                                        <>
                                        {/* Action A: Merge */}
                                        <div className="flex flex-col h-full">
                                            <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                                                <LinkIcon className="w-5 h-5 text-primary-500"/>אפשרות א': מיזוג לתגית קיימת
                                            </h3>
                                            <div className="bg-bg-subtle/30 border border-border-default rounded-xl p-5 flex-1 flex flex-col">
                                                <p className="text-sm text-text-muted mb-4">הוסף את "{selectedGroup?.term}" כ-Alias לתגית ראשית קיימת.</p>
                                                <div className="relative mb-4">
                                                    <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                                    <input type="text" placeholder="חפש תגית ראשית..." value={linkSearchTerm} onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingTag(null); }} className="w-full bg-white border border-border-default rounded-lg py-2.5 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500 transition-all" />
                                                </div>
                                                {linkSearchTerm && !selectedExistingTag && (
                                                    <div className="border border-border-default rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto mb-4 custom-scrollbar">
                                                        {linkTagSearchLoading && <div className="p-3 text-center text-xs text-text-muted">מחפש תגיות…</div>}
                                                        {!linkTagSearchLoading && linkTagResults.length > 0 ? (
                                                            linkTagResults.map(tag => (
                                                                <button key={tag.id} type="button" onClick={() => { setSelectedExistingTag(tag); setLinkSearchTerm(tag.name); }} className="w-full text-right p-2.5 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors border-b border-border-subtle last:border-0">{tag.name}</button>
                                                            ))
                                                        ) : !linkTagSearchLoading ? (
                                                            <div className="p-3 text-center text-xs text-text-muted">לא נמצאו תגיות</div>
                                                        ) : null}
                                                    </div>
                                                )}
                                                <div className="mt-auto">
                                                    <button onClick={() => handleResolve('link')} disabled={!selectedExistingTag} className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition shadow-md disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none flex items-center justify-center gap-2">
                                                        <CheckCircleIcon className="w-5 h-5"/>מזג ל-{selectedExistingTag?.name || '...'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action B: Create */}
                                        <div className="flex flex-col h-full relative">
                                            <div className="hidden md:block absolute left-[-17px] top-10 bottom-10 w-px bg-border-default" />
                                            <div className="hidden md:flex absolute left-[-32px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-border-default items-center justify-center text-xs font-bold text-text-muted">או</div>
                                            <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                                                <PlusIcon className="w-5 h-5 text-green-600"/>אפשרות ב': יצירת תגית חדשה
                                            </h3>
                                            <div className="bg-bg-subtle/30 border border-border-default rounded-xl p-5 flex-1 flex flex-col">
                                                <p className="text-sm text-text-muted mb-4">הפוך את "{selectedGroup?.term}" לתגית ראשית חדשה במערכת.</p>
                                                <div className="mt-auto space-y-3">
                                                    <button onClick={() => handleResolve('create')} className="w-full bg-white border-2 border-green-500 text-green-700 font-bold py-3 rounded-xl hover:bg-green-50 transition shadow-sm flex items-center justify-center gap-2">
                                                        <PlusIcon className="w-5 h-5"/>צור תגית "{selectedGroup?.term}"
                                                    </button>
                                                    <button onClick={() => handleResolve('ignore')} className="w-full text-text-muted hover:text-red-600 text-xs font-bold py-2 flex items-center justify-center gap-1 transition-colors">
                                                        <TrashIcon className="w-3.5 h-3.5"/>התעלם (מחק מהרשימה)
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm h-full flex flex-col items-center justify-center p-12 text-center text-text-muted">
                            <div className="w-24 h-24 bg-bg-subtle rounded-full flex items-center justify-center mb-6"><TagIcon className="w-12 h-12 opacity-20"/></div>
                            <h3 className="text-xl font-bold text-text-default mb-2">בחר תגית לטיפול</h3>
                            <p className="max-w-xs">בחר מונח מהרשימה מימין כדי להחליט אם למזג אותו לתגית קיימת או ליצור תגית חדשה.</p>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* AI Review tab */}
            {activeTab === 'ai' && (
                <div className="flex flex-col flex-1 min-h-0 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-border-default space-y-3 relative z-20">
                        {/* Status tabs */}
                        <div className="flex items-center gap-1 bg-bg-surface rounded-xl p-1 border border-border-subtle">
                            {([
                                { value: 'pending_review', label: 'ממתין לאישור', icon: '⏳' },
                                { value: 'approved',       label: 'מוזג אוטו׳',   icon: '✅' },
                                { value: 'manual_queue',   label: 'לטיפול ידני',  icon: '🖐️' },
                                { value: 'overridden',     label: 'נדרס ידנית',   icon: '✏️' },
                                { value: 'all',            label: 'הכל',          icon: '📋' },
                            ] as { value: 'pending_review' | 'approved' | 'overridden' | 'manual_queue' | 'all'; label: string; icon: string }[]).map(tab => (
                                <button
                                    key={tab.value}
                                    type="button"
                                    onClick={() => setAiReviewStatus(tab.value)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 px-2 rounded-lg transition-colors ${
                                        aiReviewStatus === tab.value
                                            ? 'bg-white text-primary-700 shadow-sm border border-border-default'
                                            : 'text-text-muted hover:text-text-default hover:bg-white/60'
                                    }`}
                                >
                                    <span>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Search + type + min occurrences */}
                        <div className="space-y-2">
                            <div className="relative">
                                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="חיפוש חופשי לפי מונח..."
                                    value={aiSearchTerm}
                                    onChange={e => setAiSearchTerm(e.target.value)}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                                />
                            </div>
                            <div className="flex gap-2">
                                {/* Type filter */}
                                <div className="flex-1 relative min-w-0">
                                    <select
                                        value={aiFilterType}
                                        onChange={e => setAiFilterType(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-2 pr-7 text-xs focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer"
                                    >
                                        <option value="all">כל הסוגים</option>
                                        <option value="skill">Skill</option>
                                        <option value="role">Role</option>
                                        <option value="industry">Industry</option>
                                        <option value="tool">Tool</option>
                                        <option value="certification">Certification</option>
                                        <option value="language">Language</option>
                                        <option value="seniority">Seniority</option>
                                        <option value="education">Education / Degree</option>
                                        <option value="soft_skill">Soft Skill</option>
                                    </select>
                                    <FunnelIcon className="w-3 h-3 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                                {/* Date filter */}
                                <div className="flex items-center gap-2 bg-bg-input border border-border-default rounded-lg pl-3 pr-2 py-1.5 focus-within:ring-2 focus-within:ring-primary-500 transition-shadow flex-shrink-0">
                                    <CalendarIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                                    <input type="date" value={aiFilterDate} onChange={(e) => setAiFilterDate(e.target.value)} className="bg-transparent border-none focus:ring-0 text-xs text-text-default p-0 w-28" />
                                    {aiFilterDate && <button type="button" onClick={() => setAiFilterDate('')} className="text-text-muted hover:text-text-default"><XMarkIcon className="w-3.5 h-3.5" /></button>}
                                </div>
                            </div>
                        </div>

                        {/* Decision filter + sort + multi-select */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-bg-surface p-3 rounded-xl border border-border-subtle">
                            <MultiSelectDropdown
                                options={AI_STATUS_FILTER_OPTIONS}
                                selectedValues={aiFilterStatus}
                                onChange={setAiFilterStatus}
                                placeholder="כל הסטטוסים"
                            />
                            <MultiSelectDropdown
                                options={[
                                    {value: 'merge', label: 'מיזוג והתאמה'},
                                    {value: 'create', label: 'יצירת תגית חדשה'},
                                    {value: 'delete', label: 'מחיקה / התעלמות'},
                                ]}
                                selectedValues={aiFilterDecision}
                                onChange={setAiFilterDecision}
                                placeholder="כל ההחלטות"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAiSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                    className="flex items-center gap-1.5 bg-white border border-border-default rounded-xl px-3 py-2 text-sm font-medium text-text-default hover:bg-bg-hover transition-colors w-full justify-between"
                                >
                                    <span>מיון לפי תאריך</span>
                                    {aiSortOrder === 'asc' ? <ChevronUpIcon className="w-4 h-4 text-primary-600"/> : <ChevronDownIcon className="w-4 h-4 text-primary-600"/>}
                                </button>
                            </div>
                            <div className="min-w-0">
                                <MultiSelectDropdown
                                    options={AI_HESITATION_FILTER_OPTIONS}
                                    selectedValues={aiFilterHesitation}
                                    onChange={setAiFilterHesitation}
                                    placeholder="כל רמות ההתלבטות"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsMultiSelectMode(!isMultiSelectMode); if (isMultiSelectMode) setSelectedDecisions(new Set()); }}
                                    className={`flex items-center gap-2 text-sm px-3 py-2 rounded-xl border font-bold transition-colors shadow-sm ${isMultiSelectMode ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-default hover:bg-bg-hover'}`}
                                >
                                    <Squares2X2Icon className="w-4 h-4"/>בחירה מרובה
                                </button>
                            </div>
                        </div>

                        {isMultiSelectMode && selectedDecisions.size > 0 && (
                            <div className="flex items-center gap-2 animate-fade-in bg-white border border-border-default p-1.5 rounded-lg shadow-sm">
                                <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2 py-1 rounded w-max">{selectedDecisions.size} נבחרו</span>
                                <select
                                    className="text-xs border border-border-default rounded flex-1 py-1 px-2 focus:ring-1 focus:ring-primary-500 outline-none"
                                    onChange={(e) => {
                                        const action = e.target.value;
                                        if (action === 'merge' || action === 'create' || action === 'delete') {
                                            void handleBulkAction(action as 'merge' | 'create' | 'delete');
                                            e.target.value = '';
                                        }
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>פעולה מרובה...</option>
                                    <option value="merge">שנה למיזוג לתגית אחרת</option>
                                    <option value="create">שנה ליצירת תגית חדשה</option>
                                    <option value="delete">שנה למחיקה</option>
                                </select>
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto flex-1 min-h-0">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-bg-subtle text-text-muted font-semibold text-xs border-b border-border-subtle sticky top-0 z-10">
                                <tr>
                                    {isMultiSelectMode && (
                                        <th className="p-4 w-[5%]">
                                            <input type="checkbox"
                                                onChange={(e) => { if (e.target.checked) setSelectedDecisions(new Set(filteredAndSortedAiDecisions.map((d) => d.id))); else setSelectedDecisions(new Set()); }}
                                                checked={selectedDecisions.size === filteredAndSortedAiDecisions.length && filteredAndSortedAiDecisions.length > 0}
                                                className="w-4 h-4 rounded text-primary-600 border-border-default focus:ring-primary-500 cursor-pointer"
                                            />
                                        </th>
                                    )}
                                    <th className={`p-4 ${isMultiSelectMode ? 'w-[13%]' : 'w-[14%]'}`}>מונח מקורי</th>
                                    <th className="p-4 w-[9%]">תאריך פעולה</th>
                                    <th className="p-4 w-[12%]">קונטקסט</th>
                                    <th className="p-4 w-[17%]">החלטת מודל והסבר</th>
                                    <th className="p-4 w-[16%]">מדד התלבטות AI</th>
                                    <th className="p-4 w-[17%]">הקשר רחב בבסיס הנתונים</th>
                                    <th className="p-4 w-[12%]">פעולה</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {aiDecisionsLoading ? (
                                    <tr><td colSpan={isMultiSelectMode ? 8 : 7} className="p-8 text-center text-text-muted">טוען החלטות סוכן…</td></tr>
                                ) : filteredAndSortedAiDecisions.length === 0 ? (
                                    <tr><td colSpan={isMultiSelectMode ? 8 : 7} className="p-8 text-center text-text-muted">לא נמצאו תוצאות לסינון הנוכחי.</td></tr>
                                ) : (
                                    paginatedAiDecisions.map((decision) => (
                                        <tr key={decision.id} className={`hover:bg-bg-hover transition-all duration-500 ${
                                            manualQueuedDecisions.has(decision.id) ? 'opacity-40 grayscale bg-gray-100' :
                                            decision.status === 'overridden' ? 'opacity-60 bg-gray-50' : ''
                                        } ${selectedDecisions.has(decision.id) ? 'bg-primary-50/50' : ''}`}>
                                            {isMultiSelectMode && (
                                                <td className="p-4 align-top text-center">
                                                    <input type="checkbox" checked={selectedDecisions.has(decision.id)} onChange={() => { const s = new Set(selectedDecisions); if (s.has(decision.id)) s.delete(decision.id); else s.add(decision.id); setSelectedDecisions(s); }} className="w-4 h-4 rounded text-primary-600 border-border-default focus:ring-primary-500 cursor-pointer" />
                                                </td>
                                            )}
                                            <td className="p-4 align-top">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="font-bold text-text-default text-base" dir="auto">{decision.originalTerm}</div>
                                                    <button
                                                        onClick={() => void openAiOccurrences(decision)}
                                                        className="text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full flex-shrink-0 hover:bg-gray-200 transition-colors flex items-center gap-1 border border-transparent hover:border-gray-300"
                                                        title="צפה במועמדים/משרות"
                                                    >
                                                        <UserIcon className="w-3 h-3" />
                                                        קורות חיים
                                                    </button>
                                                </div>
                                                <span className={`inline-block px-1.5 py-0.5 rounded uppercase font-bold border text-[10px] ${
                                                    decision.detectedType === 'skill' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                    decision.detectedType === 'role' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                    decision.detectedType === 'education' ? 'bg-green-50 text-green-700 border-green-100' :
                                                    decision.detectedType === 'certification' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                    decision.detectedType === 'degree' ? 'bg-green-50 text-green-700 border-green-100' :
                                                    decision.detectedType === 'language' ? 'bg-cyan-50 text-cyan-700 border-cyan-100' :
                                                    decision.detectedType === 'seniority' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                                    decision.detectedType === 'industry' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                    decision.detectedType === 'soft_skill' ? 'bg-pink-50 text-pink-700 border-pink-100' :
                                                    decision.detectedType === 'tool' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                                                    'bg-gray-50 text-gray-600 border-gray-200'
                                                }`}>
                                                    {decision.detectedType}
                                                </span>
                                            </td>
                                            <td className="p-4 align-top text-xs text-text-muted">
                                                <div className="flex items-center justify-end gap-1.5 w-full" dir="ltr">
                                                    <CalendarIcon className="w-3.5 h-3.5 opacity-70" />
                                                    <span>{new Date(decision.actionDate).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-text-muted align-top text-xs leading-relaxed" dir="auto">{decision.contextSample}</td>
                                            <td className="p-4 align-top">
                                                <div className="flex items-center gap-2 mb-2">
                                                    {decision.aiDecision === 'merge' ? (
                                                        <span className="flex items-center gap-1 text-primary-700 bg-primary-50 px-2 py-1 rounded-md text-xs font-bold border border-primary-100">
                                                            <LinkIcon className="w-3.5 h-3.5" /> מיזוג לתגית &quot;{decision.aiSuggestedTarget}&quot;
                                                        </span>
                                                    ) : decision.aiDecision === 'create' ? (
                                                        <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-md text-xs font-bold border border-green-100">
                                                            <PlusIcon className="w-3.5 h-3.5" /> יצירת תגית חדשה
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-red-700 bg-red-50 px-2 py-1 rounded-md text-xs font-bold border border-red-100">
                                                            <TrashIcon className="w-3.5 h-3.5" /> מחיקה / התעלמות
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-text-muted leading-tight">{decision.aiReasoning}</p>
                                            </td>
                                            {/* Hesitation / Dilemma column */}
                                            <td className="p-4 align-top w-[16%]">
                                                {decision.hesitationLevel != null ? (() => {
                                                    const lvl = decision.hesitationLevel;
                                                    const isHigh = lvl >= 61;
                                                    const isMed  = lvl >= 31 && lvl < 61;
                                                    const color  = isHigh ? 'red' : isMed ? 'amber' : 'green';
                                                    const label  = isHigh ? `התלבטות קשה: ${lvl}%` : isMed ? `התלבטות בינונית: ${lvl}%` : `ודאי / נמוך: ${lvl}%`;
                                                    const barColor = isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : 'bg-green-500';
                                                    const badgeCls = isHigh
                                                        ? 'bg-red-50 text-red-700 border-red-100 animate-pulse'
                                                        : isMed
                                                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                                                            : 'bg-green-50 text-green-700 border-green-100';
                                                    const Icon = isHigh
                                                        ? () => <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                                        : isMed
                                                            ? () => <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                                                        : () => <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
                                                    return (
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex flex-wrap items-center gap-1.5">
                                                                <span className={`inline-flex items-center gap-1 ${badgeCls} border text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm`}>
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-3.5 h-3.5 text-${color}-600`}><Icon /></svg>
                                                                    {label}
                                                                </span>
                                                                {isHigh && (
                                                                    <span className="text-[9px] font-black tracking-wider uppercase bg-red-600 text-white px-1.5 py-0.5 rounded animate-bounce shadow-sm" title="מומלץ לבדוק ביסודיות">בחינה דחופה</span>
                                                                )}
                                                            </div>
                                                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                                                <div className={`h-full transition-all duration-500 rounded-full ${barColor}`} style={{ width: `${lvl}%` }} />
                                                            </div>
                                                            {decision.dilemmaReasoning && (
                                                                <p className="text-xs text-text-muted leading-relaxed font-normal bg-bg-subtle/40 p-2 rounded-lg border border-border-subtle/50 italic" dir="auto">
                                                                    &ldquo;{decision.dilemmaReasoning}&rdquo;
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <span className="text-xs text-text-muted italic">—</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-top">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {decision.candidateTagsFromDB.slice(0, expandedAiRows.has(decision.id) ? undefined : 5).map((tag) => (
                                                        <div key={tag.name} className="flex items-center gap-1 bg-bg-subtle border border-border-subtle pl-1.5 pr-2 py-0.5 rounded text-[10px]" dir="auto">
                                                            {tag.source === 'vector' ? (
                                                                <div className="flex items-center gap-0.5 text-purple-700 bg-purple-100/70 border border-purple-200 px-1 rounded-[4px]" title="Semantic Match (Vector)">
                                                                    <SparklesIcon className="w-2.5 h-2.5" />
                                                                    {tag.score != null && <span className="font-mono text-[9px] font-bold leading-none">{Math.round(tag.score * 100)}%</span>}
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-0.5 text-blue-700 bg-blue-100/70 border border-blue-200 px-1 py-[1.5px] rounded-[4px]" title="Text Match (Fuzzy)">
                                                                    <MagnifyingGlassIcon className="w-2.5 h-2.5" />
                                                                    <span className="font-mono text-[9px] font-bold leading-none hidden md:inline">FUZZY</span>
                                                                </div>
                                                            )}
                                                            <span className="text-text-default font-medium leading-none">{tag.name}</span>
                                                        </div>
                                                    ))}
                                                    {decision.candidateTagsFromDB.length > 5 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedAiRows(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(decision.id)) next.delete(decision.id);
                                                                else next.add(decision.id);
                                                                return next;
                                                            })}
                                                            className={`text-[10px] py-0.5 px-1.5 flex items-center rounded transition-colors font-bold cursor-pointer ${
                                                                expandedAiRows.has(decision.id)
                                                                    ? 'bg-bg-subtle border border-border-default text-text-muted hover:text-text-default hover:bg-bg-hover'
                                                                    : 'bg-primary-50 border border-primary-100 text-primary-600 hover:text-primary-800 hover:bg-primary-100'
                                                            }`}
                                                        >
                                                            {expandedAiRows.has(decision.id) ? 'הצג פחות' : `+${decision.candidateTagsFromDB.length - 5} נוספים`}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 align-top">
                                                {manualQueuedDecisions.has(decision.id) ? (
                                                    <span className="text-[10px] font-bold text-gray-700 bg-gray-100 border border-gray-300 px-2 py-1.5 rounded flex flex-col items-start w-full shadow-sm text-right">
                                                        <span>הוחזר לטיפול ידני</span>
                                                        <span className="text-[9px] font-normal opacity-70 mt-0.5">
                                                            {manualQueuedDecisions.get(decision.id)!.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <div className="flex gap-2 mt-2 w-full">
                                                            <button
                                                                onClick={() => void handleSingleAiAction(decision.id, 'undo_manual')}
                                                                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-2.5 py-1 rounded text-xs font-bold transition-colors shadow-sm flex-1 text-center cursor-pointer"
                                                            >
                                                                בטל והחזר
                                                            </button>
                                                        </div>
                                                    </span>
                                                ) : decision.status === 'overridden' ? (
                                                    <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1.5 rounded flex items-center gap-1 shadow-sm">
                                                        <CheckCircleIcon className="w-3.5 h-3.5" />דורס ואושר
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="w-full bg-white border border-border-default rounded-lg py-1.5 px-2 text-xs focus:ring-1 focus:ring-primary-500 cursor-pointer text-text-default shadow-sm"
                                                        onChange={(e) => {
                                                            const newVal = e.target.value;
                                                            if (newVal === 'merge') {
                                                                openMergeModal(decision);
                                                            } else if (newVal === 'create' || newVal === 'delete' || newVal === 'blacklist' || newVal === 'manual') {
                                                                void handleSingleAiAction(decision.id, newVal as 'create' | 'delete' | 'blacklist' | 'manual');
                                                            }
                                                            e.target.value = '';
                                                        }}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>דרוס מודל / שנה</option>
                                                        <option value="merge">שנה ל-מיזוג לתגית אחרת</option>
                                                        <option value="create">שנה ליצירת תגית חדשה</option>
                                                        <option value="delete">שנה למחיקת המונח</option>
                                                        <option value="manual">העבר לתיקון ידני</option>
                                                        <option value="blacklist">העבר לרשימה שחורה</option>
                                                    </select>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination footer */}
                    {aiTotalFiltered > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default bg-bg-subtle/40 text-xs text-text-muted">
                            <span>
                                {aiTotalFiltered.toLocaleString()} תוצאות · עמוד {aiPage} / {aiTotalPages}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={aiPage <= 1}
                                    onClick={() => setAiPage(1)}
                                    className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors"
                                    title="ראשון"
                                >«</button>
                                <button
                                    type="button"
                                    disabled={aiPage <= 1}
                                    onClick={() => setAiPage(p => Math.max(1, p - 1))}
                                    className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors"
                                >הקודם</button>
                                {Array.from({ length: Math.min(5, aiTotalPages) }, (_, i) => {
                                    const half = 2;
                                    let start = Math.max(1, Math.min(aiPage - half, aiTotalPages - 4));
                                    return start + i;
                                }).map(pg => (
                                    <button
                                        key={pg}
                                        type="button"
                                        onClick={() => setAiPage(pg)}
                                        className={`w-8 py-1 rounded-lg border text-xs font-medium transition-colors ${pg === aiPage ? 'bg-primary-600 text-white border-primary-600' : 'border-border-default hover:bg-bg-hover'}`}
                                    >{pg}</button>
                                ))}
                                <button
                                    type="button"
                                    disabled={aiPage >= aiTotalPages}
                                    onClick={() => setAiPage(p => Math.min(aiTotalPages, p + 1))}
                                    className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors"
                                >הבא</button>
                                <button
                                    type="button"
                                    disabled={aiPage >= aiTotalPages}
                                    onClick={() => setAiPage(aiTotalPages)}
                                    className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors"
                                    title="אחרון"
                                >»</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* ========== BLACKLIST TAB ========== */}
        {activeTab === 'blacklist' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
                {/* Header bar */}
                <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-border-default flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                                <NoSymbolIcon className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-text-default text-sm">רשימה שחורה</h3>
                                <p className="text-xs text-text-muted">מונחים שסווגו כלא רלוונטיים ולא יאוספו מחדש</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadBlacklistDecisions()}
                            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-default transition-colors border border-border-subtle rounded-lg px-3 py-1.5 hover:bg-bg-hover"
                        >
                            <ArrowPathIcon className="w-3.5 h-3.5" />
                            רענן
                        </button>
                    </div>

                    {/* Search + filter bar */}
                    <div className="p-4 border-b border-border-default flex gap-3 items-center">
                        <div className="relative flex-1">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="חיפוש מונח..."
                                value={blacklistSearchTerm}
                                onChange={e => { setBlacklistSearchTerm(e.target.value); setBlacklistPage(1); }}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                            />
                        </div>
                        <div className="relative">
                            <select
                                value={blacklistFilterType}
                                onChange={e => { setBlacklistFilterType(e.target.value); setBlacklistPage(1); }}
                                className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-xs focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer pr-7"
                            >
                                <option value="all">כל הסוגים</option>
                                <option value="role">Role</option>
                                <option value="skill">Skill</option>
                                <option value="tool">Tool</option>
                                <option value="certification">Certification</option>
                                <option value="industry">Industry</option>
                                <option value="degree">Degree</option>
                                <option value="language">Language</option>
                                <option value="soft_skill">Soft Skill</option>
                                <option value="seniority">Seniority</option>
                                <option value="unknown">Unknown</option>
                            </select>
                            <ChevronDownIcon className="w-3 h-3 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                        <span className="text-xs text-text-muted whitespace-nowrap">
                            {(() => {
                                const filtered = blacklistDecisions.filter(d => {
                                    if (blacklistFilterType !== 'all' && d.detectedType !== blacklistFilterType) return false;
                                    if (blacklistSearchTerm && !d.originalTerm.toLowerCase().includes(blacklistSearchTerm.toLowerCase())) return false;
                                    return true;
                                });
                                return `${filtered.length} מונחים`;
                            })()}
                        </span>
                    </div>

                    {/* Table */}
                    <div className="overflow-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-bg-subtle text-text-muted text-xs border-b border-border-subtle sticky top-0">
                                <tr>
                                    <th className="p-4 w-[22%]">מונח מקורי</th>
                                    <th className="p-4 w-[10%]">סוג</th>
                                    <th className="p-4 w-[18%]">קונטקסט</th>
                                    <th className="p-4 w-[20%]">החלטת AI מקורית</th>
                                    <th className="p-4 w-[15%]">תאריך הוספה לרשימה</th>
                                    <th className="p-4 w-[15%]">פעולה</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {blacklistLoading ? (
                                    <tr><td colSpan={6} className="p-8 text-center text-text-muted">טוען רשימה שחורה…</td></tr>
                                ) : (() => {
                                    const filtered = blacklistDecisions.filter(d => {
                                        if (blacklistFilterType !== 'all' && d.detectedType !== blacklistFilterType) return false;
                                        if (blacklistSearchTerm && !d.originalTerm.toLowerCase().includes(blacklistSearchTerm.toLowerCase())) return false;
                                        return true;
                                    });
                                    const totalPages = Math.max(1, Math.ceil(filtered.length / blacklistPageSize));
                                    const page = Math.min(blacklistPage, totalPages);
                                    const paginated = filtered.slice((page - 1) * blacklistPageSize, page * blacklistPageSize);
                                    if (filtered.length === 0) return (
                                        <tr><td colSpan={6} className="p-8 text-center text-text-muted">
                                            {blacklistDecisions.length === 0 ? 'הרשימה השחורה ריקה.' : 'לא נמצאו תוצאות לסינון הנוכחי.'}
                                        </td></tr>
                                    );
                                    return (
                                        <>
                                            {paginated.map(decision => {
                                                const typeColors: Record<string, string> = {
                                                    role: 'bg-blue-50 text-blue-700 border-blue-100',
                                                    skill: 'bg-green-50 text-green-700 border-green-100',
                                                    tool: 'bg-violet-50 text-violet-700 border-violet-100',
                                                    certification: 'bg-amber-50 text-amber-700 border-amber-100',
                                                    industry: 'bg-cyan-50 text-cyan-700 border-cyan-100',
                                                    degree: 'bg-pink-50 text-pink-700 border-pink-100',
                                                    language: 'bg-teal-50 text-teal-700 border-teal-100',
                                                    soft_skill: 'bg-rose-50 text-rose-700 border-rose-100',
                                                    seniority: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                                                };
                                                const typeCls = typeColors[decision.detectedType] || 'bg-gray-50 text-gray-600 border-gray-200';
                                                return (
                                                    <tr key={decision.id} className="hover:bg-red-50/30 transition-colors">
                                                        <td className="p-4 align-top">
                                                            <div className="font-bold text-text-default text-sm" dir="auto">{decision.originalTerm}</div>
                                                        </td>
                                                        <td className="p-4 align-top">
                                                            <span className={`inline-block px-1.5 py-0.5 rounded uppercase font-bold border text-[10px] ${typeCls}`}>
                                                                {decision.detectedType}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 align-top text-xs text-text-muted" dir="auto">
                                                            {decision.contextSample || '—'}
                                                        </td>
                                                        <td className="p-4 align-top">
                                                            {decision.aiDecision === 'merge' && decision.aiSuggestedTarget ? (
                                                                <span className="text-xs text-primary-700 flex items-center gap-1">
                                                                    <LinkIcon className="w-3.5 h-3.5" />
                                                                    מיזוג → {decision.aiSuggestedTarget}
                                                                </span>
                                                            ) : decision.aiDecision === 'create' ? (
                                                                <span className="text-xs text-green-700 flex items-center gap-1">
                                                                    <PlusIcon className="w-3.5 h-3.5" />
                                                                    יצירת תגית
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-red-700 flex items-center gap-1">
                                                                    <TrashIcon className="w-3.5 h-3.5" />
                                                                    מחיקה
                                                                </span>
                                                            )}
                                                            {decision.aiReasoning && (
                                                                <p className="text-[11px] text-text-muted mt-1 leading-snug" dir="auto">{decision.aiReasoning}</p>
                                                            )}
                                                        </td>
                                                        <td className="p-4 align-top text-xs text-text-muted">
                                                            {decision.actionDate ? new Date(decision.actionDate).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                                                        </td>
                                                        <td className="p-4 align-top">
                                                            <div className="flex flex-col gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleUndoBlacklist(decision.id, 'ai')}
                                                                    className="text-xs bg-white border border-primary-200 text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap w-full justify-center"
                                                                    title="החזר לתור החלטות הסוכן (AI)"
                                                                >
                                                                    <SparklesIcon className="w-3.5 h-3.5" />
                                                                    החזר לסוכן AI
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handleUndoBlacklist(decision.id, 'manual')}
                                                                    className="text-xs bg-white border border-orange-200 text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap w-full justify-center"
                                                                    title="העבר לרשימת הטיפול הידני"
                                                                >
                                                                    <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                                                                    לטיפול ידני
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {/* Pagination */}
                                            {totalPages > 1 && (
                                                <tr>
                                                    <td colSpan={6}>
                                                        <div className="flex items-center justify-between p-4 border-t border-border-subtle">
                                                            <span className="text-xs text-text-muted">
                                                                עמוד {page} מתוך {totalPages} ({filtered.length} מונחים)
                                                            </span>
                                                            <div className="flex items-center gap-1">
                                                                <button disabled={page <= 1} onClick={() => setBlacklistPage(1)} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors text-xs">«</button>
                                                                <button disabled={page <= 1} onClick={() => setBlacklistPage(p => p - 1)} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors text-xs">‹</button>
                                                                <button disabled={page >= totalPages} onClick={() => setBlacklistPage(p => p + 1)} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors text-xs">›</button>
                                                                <button disabled={page >= totalPages} onClick={() => setBlacklistPage(totalPages)} className="px-2 py-1 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover transition-colors text-xs">»</button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        <CandidateSummaryDrawer
            candidate={drawerCandidate}
            isOpen={isDrawerOpen && Boolean(drawerCandidate)}
            onClose={() => setIsDrawerOpen(false)}
            isFavorite={false}
            onToggleFavorite={() => {}}
        />
        {drawerJob && (
            <JobDetailsDrawer
                job={drawerJob}
                isOpen={isJobDrawerOpen}
                onClose={() => setIsJobDrawerOpen(false)}
            />
        )}

        {/* Merge target picker modal */}
        {mergePendingDecision && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeMergeModal}>
                <div
                    className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4"
                    dir="rtl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={closeMergeModal} className="absolute top-4 left-4 text-text-muted hover:text-text-default transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2">
                        <LinkIcon className="w-5 h-5 text-primary-600" />
                        <h2 className="text-base font-bold text-text-default">מיזוג תגית</h2>
                    </div>

                    <p className="text-sm text-text-muted">
                        מיזוג <span className="font-semibold text-text-default">&quot;{mergePendingDecision.originalTerm}&quot;</span> כ-alias של:
                    </p>

                    {mergePendingDecision.aiSuggestedTarget && (
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-text-muted font-medium">הצעת המודל:</span>
                            <button
                                onClick={() => {
                                    setMergeSelectedTag({ id: '', name: mergePendingDecision.aiSuggestedTarget! });
                                    setMergeSearchTerm(mergePendingDecision.aiSuggestedTarget!);
                                    setMergeSearchResults([]);
                                }}
                                className={`self-start flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    mergeSelectedTag?.name === mergePendingDecision.aiSuggestedTarget
                                        ? 'bg-primary-600 text-white border-primary-600'
                                        : 'bg-primary-50 text-primary-700 border-primary-200 hover:bg-primary-100'
                                }`}
                            >
                                <TagIcon className="w-3 h-3" />
                                {mergePendingDecision.aiSuggestedTarget}
                                {mergeSelectedTag?.name === mergePendingDecision.aiSuggestedTarget && (
                                    <CheckCircleIcon className="w-3 h-3" />
                                )}
                            </button>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-text-muted font-medium">או חפש תגית אחרת:</span>
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input
                                type="text"
                                placeholder="הקלד שם תגית..."
                                value={mergeSearchTerm}
                                onChange={(e) => {
                                    setMergeSearchTerm(e.target.value);
                                    setMergeSelectedTag(null);
                                }}
                                className="w-full bg-white border border-border-default rounded-lg py-2 pr-9 pl-3 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                                autoFocus={!mergePendingDecision.aiSuggestedTarget}
                            />
                        </div>

                        {mergeSearchLoading && (
                            <p className="text-xs text-text-muted px-1">מחפש...</p>
                        )}

                        {!mergeSearchLoading && mergeSearchResults.length > 0 && !mergeSelectedTag && (
                            <ul className="border border-border-default rounded-lg bg-white shadow-lg max-h-44 overflow-y-auto divide-y divide-border-default">
                                {mergeSearchResults.map((tag) => (
                                    <li key={tag.id}>
                                        <button
                                            onClick={() => {
                                                setMergeSelectedTag(tag);
                                                setMergeSearchTerm(tag.name);
                                                setMergeSearchResults([]);
                                            }}
                                            className="w-full text-right px-3 py-2 text-sm hover:bg-primary-50 transition-colors flex items-center gap-2"
                                        >
                                            <TagIcon className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                                            {tag.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {mergeSelectedTag && mergeSelectedTag.id && (
                            <div className="flex items-center gap-2 mt-1 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                                <span>נבחר: <strong>{mergeSelectedTag.name}</strong></span>
                                <button onClick={() => { setMergeSelectedTag(null); setMergeSearchTerm(''); }} className="mr-auto text-green-600 hover:text-green-800">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Priority selector */}
                    <div className="flex flex-col gap-1.5 pt-3 border-t border-border-default/60">
                        <span className="text-xs font-semibold text-text-muted">עדיפות ה-Alias (1 = נמוך, 5 = ראשי):</span>
                        <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setMergePriority(p)}
                                    className={`w-9 h-9 rounded-lg text-sm font-bold border transition-colors ${
                                        mergePriority === p
                                            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                            : 'bg-white text-text-muted border-border-default hover:border-primary-400 hover:text-primary-600'
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                            <span className="mr-2 text-xs text-text-subtle self-center">
                                {mergePriority === 5 ? 'שם ראשי / הכי נפוץ' : mergePriority === 4 ? 'נפוץ' : mergePriority === 3 ? 'בינוני' : mergePriority === 2 ? 'נדיר' : 'גרסה היסטורית'}
                            </span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border-default">
                        <button onClick={closeMergeModal} className="px-4 py-2 text-sm text-text-muted hover:text-text-default border border-border-default rounded-lg transition-colors">
                            ביטול
                        </button>
                        <button
                            onClick={() => void confirmMerge()}
                            disabled={!mergeSelectedTag && !mergePendingDecision.aiSuggestedTarget}
                            className="px-4 py-2 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                            <LinkIcon className="w-4 h-4" />
                            אישור מיזוג
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* AI Occurrences popup */}
        {aiOccurrencesPopup && (
            <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4" onClick={() => setAiOccurrencesPopup(null)}>
                <div className="bg-white rounded-xl shadow-xl border border-border-default w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/50">
                        <span className="font-bold text-text-default" dir="auto">
                            {aiOccurrencesPopup.loading ? 'טוען...' : (
                                aiOccurrencesPopup.candidates.length > 0
                                    ? `נמצא ב-${aiOccurrencesPopup.candidates.length} קורות חיים`
                                    : aiOccurrencesPopup.jobs.length > 0
                                        ? `נמצא ב-${aiOccurrencesPopup.jobs.length} משרות`
                                        : `"${aiOccurrencesPopup.term}" — לא נמצאו קישורים`
                            )}
                        </span>
                        <button onClick={() => setAiOccurrencesPopup(null)} className="p-1 rounded-md hover:bg-bg-hover text-text-muted hover:text-text-default transition-colors">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-2">
                        {aiOccurrencesPopup.loading && (
                            <div className="flex items-center justify-center py-8 text-text-muted text-sm gap-2">
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full" />
                                טוען...
                            </div>
                        )}

                        {!aiOccurrencesPopup.loading && aiOccurrencesPopup.candidates.length === 0 && aiOccurrencesPopup.jobs.length === 0 && (
                            <div className="py-8 text-center text-text-muted text-sm">לא נמצאו קורות חיים או משרות מקושרות</div>
                        )}

                        {!aiOccurrencesPopup.loading && aiOccurrencesPopup.candidates.length > 0 && (
                            <>
                                <div className="px-2 py-1 text-xs font-bold text-text-muted uppercase tracking-wide">מועמדים</div>
                                {aiOccurrencesPopup.candidates.map((c) => (
                                    <button
                                        key={c.id}
                                        onClick={() => { setDrawerCandidate({ id: c.id }); setIsDrawerOpen(true); setAiOccurrencesPopup(null); }}
                                        className="w-full text-right p-3 hover:bg-bg-hover rounded-lg text-sm flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center font-bold flex-shrink-0">
                                            {c.name.charAt(0)}
                                        </div>
                                        <span className="truncate text-text-default font-medium">{c.name}</span>
                                    </button>
                                ))}
                            </>
                        )}

                        {!aiOccurrencesPopup.loading && aiOccurrencesPopup.jobs.length > 0 && (
                            <>
                                <div className="px-2 py-1 text-xs font-bold text-text-muted uppercase tracking-wide mt-1">משרות</div>
                                {aiOccurrencesPopup.jobs.map((j) => (
                                    <button
                                        key={j.id}
                                        onClick={() => { setDrawerJob({ id: j.id }); setIsJobDrawerOpen(true); setAiOccurrencesPopup(null); }}
                                        className="w-full text-right p-3 hover:bg-bg-hover rounded-lg text-sm flex items-center gap-3 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                                            <TagIcon className="w-4 h-4" />
                                        </div>
                                        <span className="truncate text-text-default font-medium">{j.title}</span>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default AdminTagCorrectionsView;
