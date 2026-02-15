
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { 
    MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon, TagIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon, 
    ArrowTopRightOnSquareIcon, FunnelIcon, AdjustmentsHorizontalIcon,
    Squares2X2Icon, ListBulletIcon, XMarkIcon, UserIcon
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';

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

const AdminTagCorrectionsView: React.FC = () => {
    const { t } = useLanguage();
    
    // State
    const [unmatched, setUnmatched] = useState<UnmatchedTag[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<GroupedTag | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    
    // Filters State
    const [filterType, setFilterType] = useState<string>('all');
    const [minOccurrences, setMinOccurrences] = useState<number>(1);
    
    // Link Action State
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingTag, setSelectedExistingTag] = useState<TagOption | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [allTags, setAllTags] = useState<TagOption[]>([]);
    const [linkedCandidates, setLinkedCandidates] = useState<{ id: string; name: string }[]>([]);
    const [drawerCandidate, setDrawerCandidate] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
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
        total: unmatched.length,
        highConfidence: unmatched.filter(u => u.confidence > 90).length,
        totalOccurrences: unmatched.reduce((acc, curr) => acc + curr.occurrences, 0)
    }), [unmatched]);

    const loadUnmatched = useCallback(async () => {
        if (!apiBase) return;
        try {
            const res = await fetch(`${apiBase}/api/tags/pending`);
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;
            setUnmatched(data.map(mapPendingTagEntry));
        } catch (err) {
            console.error('Failed to load tag corrections', err);
        }
    }, [apiBase]);

    const loadAllTags = useCallback(async () => {
        if (!apiBase) return;
        try {
            const res = await fetch(`${apiBase}/api/tags`);
            if (!res.ok) return;
            const payload = await res.json();
            if (!Array.isArray(payload)) return;
            const normalized = payload
                .filter((tag) => tag.status === 'active')
                .map((tag) => ({
                id: tag.id,
                name: String(tag.displayNameHe || tag.tagKey || 'תגית').trim(),
            }));
            setAllTags(normalized);
        } catch (err) {
            console.error('Failed to load tags list', err);
        }
    }, [apiBase]);

    useEffect(() => {
        loadUnmatched();
    }, [loadUnmatched]);

    useEffect(() => {
        loadAllTags();
    }, [loadAllTags]);

    useEffect(() => {
        if (!selectedGroup) return;
        if (topRef.current) {
            topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [selectedGroup]);

    const existingTagNames = useMemo(
        () => new Set(allTags.map(tag => tag.name)),
        [allTags],
    );

    const filteredUnmatched = useMemo(() => {
        return unmatched.filter(u => {
            const matchesSearch = u.originalTerm.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesType = filterType === 'all' || u.detectedType === filterType;
            const matchesOccurrences = u.occurrences >= minOccurrences;
            return matchesSearch && matchesType && matchesOccurrences;
        });
    }, [unmatched, searchTerm, filterType, minOccurrences]);

    const groupedTags = useMemo(() => {
        const map = new Map<string, GroupedTag>();
        filteredUnmatched.forEach(tag => {
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
    }, [filteredUnmatched]);

    const filteredExistingTags = useMemo(() => 
        linkSearchTerm ? allTags.filter(t => t.name.toLowerCase().includes(linkSearchTerm.toLowerCase())) : [],
    [linkSearchTerm, allTags]);

    // Effects
    useEffect(() => {
        if (!groupedTags.length) {
            setSelectedGroup(null);
            return;
        }
        setSelectedGroup((prev) => {
            if (!prev) return groupedTags[0];
            const match = groupedTags.find((group) => group.term === prev.term);
            return match || groupedTags[0];
        });
    }, [groupedTags]);

    useEffect(() => {
        // Auto-fill search with AI suggestion when selection changes
        if (selectedGroup?.aiSuggestion) {
            setLinkSearchTerm(selectedGroup.aiSuggestion);
            const match = allTags.find((tag) => tag.name === selectedGroup.aiSuggestion);
            setSelectedExistingTag(match || null);
        } else {
            setLinkSearchTerm('');
            setSelectedExistingTag(null);
        }
    }, [selectedGroup, allTags]);

    const flashStatus = (message: string) => {
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(''), 3500);
    };

    useEffect(() => {
        let active = true;
        if (!selectedGroup || !apiBase) {
            setLinkedCandidates([]);
            return;
        }
        const loadCandidates = async () => {
            try {
                const responses = await Promise.all(
                    selectedGroup.ids.map(async (id) => {
                        const res = await fetch(`${apiBase}/api/tags/${id}/candidates`);
                        if (!res.ok) return [];
                        return res.json();
                    }),
                );
                if (!active) return;
                const entries = responses.flat().filter(Boolean);
                const normalized = entries.map((entry: any) => ({
                    id: entry.candidate_id || entry.candidateId || entry.id,
                    name: entry.full_name || entry.fullName || entry.email || entry.phone || 'מועמד',
                }));
                const unique = Array.from(new Map(normalized.map((item) => [item.id, item])).values());
                setLinkedCandidates(unique);
            } catch (err) {
                console.error('[AdminTagCorrectionsView] failed to load candidate info', err);
                if (active) setLinkedCandidates([]);
            }
        };
        loadCandidates();
        return () => {
            active = false;
        };
    }, [selectedGroup, apiBase]);

    const resolvePendingTag = async (
        action: 'link' | 'create' | 'ignore',
        targetTagId?: string,
    ) => {
        if (!selectedGroup || !apiBase) return;
        const payload: Record<string, any> = {
            ids: selectedGroup.ids,
            action,
        };
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
        if (action !== 'ignore') {
            await loadAllTags();
        }
        setLinkSearchTerm('');
        setSelectedExistingTag(null);
    };

    const handleResolve = async (action: 'link' | 'create' | 'ignore') => {
        if (!selectedGroup) return;
        try {
            if (action === 'link') {
                if (!selectedExistingTag) {
                    flashStatus('בחר תגית קיימת למיזוג');
                    return;
                }
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
        setDrawerCandidate({
            id: candidateId,
            backendId: candidateId,
            name: name || linkedCandidates[0]?.name || 'מועמד',
        });
        setIsDrawerOpen(true);
    };

    return (
        <>
        <div ref={topRef} className="space-y-6 h-full flex flex-col pb-6 relative">
            
            {/* Header & Stats */}
            <div className="flex flex-col gap-6 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                            <TagIcon className="w-8 h-8 text-primary-500"/>
                            תיקון וטיוב תגיות (Tag Corrections)
                        </h1>
                        <p className="text-sm text-text-muted mt-1">ניהול תגיות שזוהו ע"י ה-AI ודורשות סיווג או מיזוג</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard 
                        title="ממתינים לטיפול" 
                        value={stats.total} 
                        icon={<ExclamationTriangleIcon className="w-6 h-6 text-orange-600"/>} 
                        color="bg-orange-50" 
                    />
                    <StatCard 
                        title="זיהוי ודאי (AI)" 
                        value={stats.highConfidence} 
                        icon={<SparklesIcon className="w-6 h-6 text-purple-600"/>} 
                        color="bg-purple-50" 
                    />
                    <StatCard 
                        title="סה״כ מופעים" 
                        value={stats.totalOccurrences} 
                        icon={<ListBulletIcon className="w-6 h-6 text-blue-600"/>} 
                        color="bg-blue-50" 
                    />
                </div>
                {statusMessage && (
                    <div className="mt-3 px-4 py-2 rounded-2xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold shadow-sm">
                        {statusMessage}
                    </div>
                )}
            </div>

            {/* Split View */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* LEFT COLUMN: The Queue */}
                <div className="w-full lg:w-1/3 bg-bg-card rounded-2xl border border-border-default flex flex-col overflow-hidden shadow-sm">
                    <div className="p-4 border-b border-border-default space-y-3">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="סינון רשימה..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                            />
                        </div>
                        <div className="flex gap-2">
                             <div className="flex-1 relative">
                                <select 
                                    value={filterType} 
                                    onChange={(e) => setFilterType(e.target.value)}
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-2 text-xs focus:ring-1 focus:ring-primary-500 appearance-none cursor-pointer"
                                >
                                    <option value="all">כל הסוגים</option>
                                    <option value="skill">Skill</option>
                                    <option value="role">Role</option>
                                    <option value="tool">Tool</option>
                                    <option value="unknown">Unknown</option>
                                </select>
                                <FunnelIcon className="w-3 h-3 text-text-subtle absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"/>
                             </div>
                             <div className="flex-1 flex items-center gap-2 bg-bg-input border border-border-default rounded-lg px-2" title="מינימום מופעים">
                                 <span className="text-[10px] text-text-muted font-bold whitespace-nowrap">min:</span>
                                 <input 
                                    type="number" 
                                    min="1" 
                                    value={minOccurrences}
                                    onChange={(e) => setMinOccurrences(parseInt(e.target.value) || 1)}
                                    className="w-full bg-transparent border-none outline-none text-xs py-2"
                                 />
                             </div>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar bg-bg-subtle/20">
                        {groupedTags.map(group => (
                            <div 
                                key={group.term} 
                                onClick={() => setSelectedGroup(group)}
                                className={`p-3 rounded-xl cursor-pointer border transition-all relative flex flex-col gap-2 ${
                                    selectedGroup?.term === group.term
                                    ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-100' 
                                    : 'bg-white border-transparent hover:bg-bg-subtle hover:border-border-default'
                                }`}
                            >
                                <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-text-default text-base truncate" dir="ltr">{group.term}</h4>
                                    
                                    <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-transparent">
                                        {group.occurrences} מופעים
                                    </div>

                                </div>
                                <div className="flex items-center justify-between text-xs">
                                     <div className="flex gap-2">
                                        <span className={`px-1.5 py-0.5 rounded uppercase font-bold border ${group.detectedType === 'skill' ? 'bg-purple-50 text-purple-700 border-purple-100' : group.detectedType === 'role' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                            {group.detectedType}
                                        </span>
                                        {group.ids.length > 1 && (
                                            <span className="px-1.5 py-0.5 rounded-full bg-white border border-border-default text-[10px] text-text-muted">
                                                {group.ids.length} תיקים
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 bg-yellow-50 text-yellow-700">
                                        {Math.round((group.entries.reduce((acc, curr) => acc + curr.confidence, 0) / group.entries.length) || 0)}% AI
                                    </div>
                                </div>
                            </div>
                        ))}
                        {groupedTags.length === 0 && (
                            <div className="text-center p-8 text-text-muted text-sm">
                                לא נמצאו תגיות לטיפול
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Action Workspace */}
                <div className="w-full lg:w-2/3 flex flex-col gap-4">
                    {selectedGroup ? (
                        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm flex-1 flex flex-col relative overflow-hidden animate-fade-in">
                            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-primary-50/50 to-transparent z-0"></div>
                            
                            <div className="p-8 relative z-10">
                                {/* Header Info */}
                                <div className="text-center mb-8 space-y-2">
                                    <span className="inline-block px-3 py-1 rounded-full bg-white border border-border-default text-xs font-bold text-text-muted mb-3 shadow-sm">
                                        מקור: {representativeTag?.contextSample || selectedGroup?.contextSample}
                                    </span>
                                    <h2 className="text-4xl font-black text-text-default mb-2" dir="ltr">{selectedGroup?.term}</h2>
                                    <div className="text-sm text-text-muted">
                                        זוהה כ-<span className="font-bold text-text-default">{selectedGroup?.detectedType}</span> ב-{selectedGroup?.occurrences || 0} קורות חיים שונים
                                    </div>
                                    {linkedCandidates.length > 0 && (
                                        <div className="flex flex-wrap gap-2 justify-center">
                                            {linkedCandidates.map(candidate => (
                                                <button
                                                    key={candidate.id}
                                                    onClick={() => handleOpenCandidateDrawer(candidate.id, candidate.name)}
                                                    className="flex items-center gap-1 text-xs text-text-muted bg-white px-3 py-1 rounded-full border border-border-default shadow-sm hover:text-primary-600 transition-colors"
                                                >
                                                    <UserIcon className="w-4 h-4" />
                                                    {candidate.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* AI Suggestion Box */}
                                {selectedGroup?.aiSuggestion && (
                                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center gap-4 shadow-sm mb-8 mx-auto max-w-xl">
                                        <div className="bg-purple-100 p-2 rounded-full text-purple-600">
                                            <SparklesIcon className="w-6 h-6"/>
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-0.5">המלצת המערכת</p>
                                            <p className="text-sm text-purple-900">
                                                נראה שזה וריאציה של התגית <strong>"{selectedGroup?.aiSuggestion}"</strong>. האם למזג?
                                            </p>
                                        </div>
                                    </div>
                                )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                                    {/* Action A: Merge */}
                                    <div className="flex flex-col h-full">
                                        <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                                            <LinkIcon className="w-5 h-5 text-primary-500"/>
                                            אפשרות א': מיזוג לתגית קיימת
                                        </h3>
                                        <div className="bg-bg-subtle/30 border border-border-default rounded-xl p-5 flex-1 flex flex-col">
                                            <p className="text-sm text-text-muted mb-4">
                                                הוסף את "{selectedGroup?.term}" כ-Alias (מילה נרדפת) לתגית ראשית קיימת.
                                            </p>
                                            
                                            <div className="relative mb-4">
                                                <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                                <input 
                                                    type="text" 
                                                    placeholder="חפש תגית ראשית..." 
                                                    value={linkSearchTerm}
                                                    onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingTag(null); }}
                                                    className="w-full bg-white border border-border-default rounded-lg py-2.5 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                                                />
                                            </div>

                                            {/* Results Dropdown */}
                                            {linkSearchTerm && !selectedExistingTag && (
                                                <div className="border border-border-default rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto mb-4 custom-scrollbar">
                                            {filteredExistingTags.length > 0 ? (
                                                filteredExistingTags.map(tag => (
                                                    <button 
                                                        key={tag.id}
                                                        onClick={() => { setSelectedExistingTag(tag); setLinkSearchTerm(tag.name); }}
                                                        className="w-full text-right p-2.5 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors border-b border-border-subtle last:border-0"
                                                    >
                                                        {tag.name}
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="p-3 text-center text-xs text-text-muted">לא נמצאו תגיות</div>
                                            )}
                                                </div>
                                            )}

                                            <div className="mt-auto">
                                                <button 
                                                    onClick={() => handleResolve('link')}
                                                    disabled={!selectedExistingTag}
                                                    className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition shadow-md disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircleIcon className="w-5 h-5"/>
                                                    מזג ל-{selectedExistingTag?.name || '...'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action B: Create */}
                                    <div className="flex flex-col h-full relative">
                                         {/* Divider on Desktop */}
                                        <div className="hidden md:block absolute left-[-17px] top-10 bottom-10 w-px bg-border-default"></div>
                                        <div className="hidden md:flex absolute left-[-32px] top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border border-border-default items-center justify-center text-xs font-bold text-text-muted">או</div>

                                        <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                                            <PlusIcon className="w-5 h-5 text-green-600"/>
                                            אפשרות ב': יצירת תגית חדשה
                                        </h3>
                                        <div className="bg-bg-subtle/30 border border-border-default rounded-xl p-5 flex-1 flex flex-col">
                                            <p className="text-sm text-text-muted mb-4">
                                                הפוך את "{selectedGroup?.term}" לתגית ראשית חדשה במערכת.
                                            </p>
                                            
                                            <div className="mt-auto space-y-3">
                                                <button 
                                                    onClick={() => handleResolve('create')}
                                                    className="w-full bg-white border-2 border-green-500 text-green-700 font-bold py-3 rounded-xl hover:bg-green-50 transition shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    <PlusIcon className="w-5 h-5"/>
                                                    צור תגית "{selectedGroup?.term}"
                                                </button>
                                                
                                                <button 
                                                    onClick={() => handleResolve('ignore')}
                                                    className="w-full text-text-muted hover:text-red-600 text-xs font-bold py-2 flex items-center justify-center gap-1 transition-colors"
                                                >
                                                    <TrashIcon className="w-3.5 h-3.5"/>
                                                    התעלם (מחק מהרשימה)
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm h-full flex flex-col items-center justify-center p-12 text-center text-text-muted">
                            <div className="w-24 h-24 bg-bg-subtle rounded-full flex items-center justify-center mb-6">
                                <TagIcon className="w-12 h-12 opacity-20"/>
                            </div>
                            <h3 className="text-xl font-bold text-text-default mb-2">בחר תגית לטיפול</h3>
                            <p className="max-w-xs">בחר מונח מהרשימה מימין כדי להחליט אם למזג אותו לתגית קיימת או ליצור תגית חדשה.</p>
                        </div>
                    )}
                </div>
            </div>

        </div>
        <CandidateSummaryDrawer
            candidate={drawerCandidate}
            isOpen={isDrawerOpen && Boolean(drawerCandidate)}
            onClose={() => setIsDrawerOpen(false)}
            isFavorite={false}
            onToggleFavorite={() => {}}
        />
        </>
    );
};

export default AdminTagCorrectionsView;
