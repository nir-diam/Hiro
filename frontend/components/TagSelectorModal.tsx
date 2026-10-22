
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
    XMarkIcon, MagnifyingGlassIcon, CheckCircleIcon, BriefcaseIcon,
    SparklesIcon, WrenchScrewdriverIcon, LanguageIcon, BuildingOffice2Icon,
    AcademicCapIcon, UserGroupIcon, ChatBubbleBottomCenterTextIcon, PlusIcon,
    Squares2X2Icon, CheckIcon,
} from './Icons';
import {
    categoryResultCounts,
    hasExactCatalogMatch,
    highlightParts,
    isAssociatedTag,
    sortTags,
    tagMatchesSearch,
    type TagSortMode,
} from '../utils/tagSelectorModalUtils';

export type TagCategory = 'all' | 'role' | 'skill' | 'tool' | 'soft_skill' | 'industry' | 'language' | 'education' | 'certification' | 'seniority';

export type TagSelectorContext = 'candidate' | 'job' | 'generic';

export type TagSaveMode = 'normal' | 'mandatory';

export interface TagOption {
    id: string;
    nameHe: string;
    nameEn: string;
    category: TagCategory;
    description?: string;
    synonyms?: string[];
    rawType?: string;
    tagKey?: string;
    usageCount?: number;
    verified?: boolean;
    domains?: string[];
    /** Job-only: required tag when saving from modal tray */
    saveMode?: TagSaveMode;
}

interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedTags: TagOption[]) => void;
  existingTags: string[];
  associatedTagIds?: string[];
  initialCategory?: TagCategory;
  context?: TagSelectorContext;
  candidateId?: string;
  jobId?: string;
  contextText?: string;
  jobFieldCategory?: string;
  enableRequiredTagToggle?: boolean;
}

type PrimaryPane = 'all' | 'suggested';

const categoryConfig: Record<TagCategory, { label: string; icon: React.ReactNode }> = {
    'all': { label: 'הכל', icon: <Squares2X2Icon className="w-4 h-4"/> },
    'role': { label: 'תפקיד', icon: <BriefcaseIcon className="w-4 h-4"/> },
    'skill': { label: 'מיומנות', icon: <SparklesIcon className="w-4 h-4"/> },
    'tool': { label: 'כלי / תוכנה', icon: <WrenchScrewdriverIcon className="w-4 h-4"/> },
    'soft_skill': { label: 'כישור רך', icon: <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> },
    'industry': { label: 'תעשייה', icon: <BuildingOffice2Icon className="w-4 h-4"/> },
    'language': { label: 'שפה', icon: <LanguageIcon className="w-4 h-4"/> },
    'education': { label: 'השכלה', icon: <AcademicCapIcon className="w-4 h-4"/> },
    'seniority': { label: 'בכירות', icon: <UserGroupIcon className="w-4 h-4"/> },
    'certification': { label: 'הסמכה', icon: <CheckCircleIcon className="w-4 h-4"/> },
};

const VISIBLE_CATEGORIES: TagCategory[] = ['role', 'skill', 'tool', 'soft_skill', 'industry', 'seniority', 'education', 'certification', 'language'];

const mapBackendTypeToCategory = (type?: string): TagCategory => {
    if (!type) return 'role';
    const normalized = type.toLowerCase();
    if (normalized === 'soft_skill') return 'soft_skill';
    if (normalized === 'skill' || normalized === 'hard_skill') return 'skill';
    if (normalized === 'tool') return 'tool';
    if (normalized === 'industry') return 'industry';
    if (normalized === 'language') return 'language';
    if (normalized === 'education' || normalized === 'degree') return 'education';
    if (normalized === 'certification') return 'certification';
    if (normalized === 'seniority') return 'seniority';
    return 'role';
};

const HighlightedName: React.FC<{ text: string; searchTerm: string; className?: string }> = ({ text, searchTerm, className }) => (
    <span className={className}>
        {highlightParts(text, searchTerm).map((part, i) =>
            part.highlight ? (
                <mark key={i} className="bg-amber-200/80 text-inherit rounded px-0.5">{part.text}</mark>
            ) : (
                <span key={i}>{part.text}</span>
            ),
        )}
    </span>
);

const TagSelectorModal: React.FC<TagSelectorModalProps> = (props) => {
    const {
        isOpen,
        onClose,
        onSave,
        existingTags,
        associatedTagIds = [],
        initialCategory = 'all',
        context = 'generic',
        candidateId,
        jobId,
        contextText,
        jobFieldCategory,
        enableRequiredTagToggle = false,
    } = props;

    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<TagCategory>(initialCategory);
    const [primaryPane, setPrimaryPane] = useState<PrimaryPane>('all');
    const [sortMode, setSortMode] = useState<TagSortMode>('usage');
    const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);
    const [suggestedIds, setSuggestedIds] = useState<string[]>([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [suggestionsHasVector, setSuggestionsHasVector] = useState(false);
    const [roleDomainFilter, setRoleDomainFilter] = useState<string>('');
    const [roleDomainSearch, setRoleDomainSearch] = useState('');
    const [jobFieldCategories, setJobFieldCategories] = useState<string[]>([]);
    const [focusedIndex, setFocusedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const existingNameSet = useMemo(() => new Set(existingTags), [existingTags]);
    const associatedIdSet = useMemo(
        () => new Set(associatedTagIds.map((id) => String(id))),
        [associatedTagIds],
    );

    const suggestedTitle =
        context === 'job' ? 'מוצע למשרה הזו' : context === 'candidate' ? 'מוצע לפרופיל הזה' : 'מוצע';

    useEffect(() => {
        if (!isOpen) return;
        setSelectedTags([]);
        setSearchTerm('');
        setError(null);
        setPrimaryPane('all');
        setSortMode('usage');
        setSuggestedIds([]);
        setFocusedIndex(0);
        setRoleDomainFilter(jobFieldCategory?.trim() || '');
        setRoleDomainSearch('');
        setActiveTab((prev) => {
            if (initialCategory !== 'all' && !VISIBLE_CATEGORIES.includes(initialCategory)) return 'all';
            return initialCategory;
        });

        const controller = new AbortController();

        const fetchTags = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`${apiBase}/api/tags`, {
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    signal: controller.signal,
                });
                if (!res.ok) throw new Error('Failed to load tags');
                const payload = await res.json();
                if (!Array.isArray(payload.data)) {
                    setAvailableTags([]);
                    return;
                }
                const normalized = payload.data
                    .filter((tag: { status?: string }) => tag?.status === 'active')
                    .map((tag: Record<string, unknown>) => {
                        const nameHe = String(tag.displayNameHe || tag.tagKey || tag.displayNameEn || tag.id || '');
                        const nameEn = String(tag.displayNameEn || tag.tagKey || tag.displayNameHe || tag.id || '');
                        return {
                            id: String(tag.id || `${tag.tagKey || nameHe}-${Math.random().toString(36).slice(2, 8)}`),
                            nameHe,
                            nameEn,
                            category: mapBackendTypeToCategory(String(tag.type || '')),
                            description: String(tag.descriptionHe || tag.descriptionEn || ''),
                            synonyms: Array.isArray(tag.synonyms) ? tag.synonyms as string[] : [],
                            rawType: String(tag.type || ''),
                            tagKey: tag.tagKey ? String(tag.tagKey) : undefined,
                            usageCount: Number(tag.usageCount) || 0,
                            verified: tag.qualityState === 'verified',
                            domains: Array.isArray(tag.domains) ? tag.domains as string[] : [],
                        } as TagOption;
                    })
                    .filter((tag) => tag.nameHe);
                setAvailableTags(normalized);
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'AbortError') return;
                setError(err instanceof Error ? err.message : 'שגיאה בטעינת תגיות');
                setAvailableTags([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTags();
        return () => controller.abort();
    }, [isOpen, apiBase, initialCategory, jobFieldCategory]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'role') return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${apiBase}/api/job-fields`, { headers: { ...authHeaders() } });
                if (!res.ok) return;
                const data = await res.json();
                if (!Array.isArray(data) || cancelled) return;
                const names = data
                    .map((row: { name?: string }) => String(row.name || '').trim())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b, 'he'));
                setJobFieldCategories(names);
            } catch {
                /* optional */
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, activeTab, apiBase]);

    const roleDomainOptions = useMemo(() => {
        const q = roleDomainSearch.trim().toLowerCase();
        const base = jobFieldCategories;
        if (!q) return base;
        return base.filter((name) => name.toLowerCase().includes(q));
    }, [jobFieldCategories, roleDomainSearch]);

    const seedTagIds = useMemo(() => {
        const ids = new Set<string>();
        for (const id of associatedTagIds) if (id) ids.add(String(id));
        for (const tag of selectedTags) if (tag.id && !tag.id.startsWith('custom-')) ids.add(tag.id);
        return [...ids];
    }, [associatedTagIds, selectedTags]);

    const loadSuggestions = useCallback(async () => {
        if (context === 'generic') {
            setSuggestedIds([]);
            return;
        }
        setSuggestionsLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/tags/selector-suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    context,
                    category: activeTab,
                    candidateId: candidateId || undefined,
                    jobId: jobId || undefined,
                    contextText: contextText || undefined,
                    jobFieldCategory: jobFieldCategory || roleDomainFilter || undefined,
                    roleDomainFilter: roleDomainFilter || undefined,
                    associatedTagIds: associatedTagIds,
                    selectedTagIds: selectedTags.map((t) => t.id).filter((id) => !id.startsWith('custom-')),
                }),
            });
            if (!res.ok) throw new Error('suggestions failed');
            const payload = await res.json();
            setSuggestedIds(Array.isArray(payload.tagIds) ? payload.tagIds.map(String) : []);
            setSuggestionsHasVector(Boolean(payload.hasVector));
        } catch {
            setSuggestedIds([]);
            setSuggestionsHasVector(false);
        } finally {
            setSuggestionsLoading(false);
        }
    }, [
        apiBase,
        context,
        activeTab,
        candidateId,
        jobId,
        contextText,
        jobFieldCategory,
        roleDomainFilter,
        associatedTagIds,
        selectedTags,
    ]);

    useEffect(() => {
        if (!isOpen || primaryPane !== 'suggested') return;
        const timer = window.setTimeout(() => { void loadSuggestions(); }, 180);
        return () => window.clearTimeout(timer);
    }, [isOpen, primaryPane, loadSuggestions, seedTagIds.join('|')]);

    const baseFiltered = useMemo(() => {
        const lowerSearch = searchTerm.trim();
        return availableTags.filter((tag) => {
            const matchesCategory = activeTab === 'all' || tag.category === activeTab;
            const matchesSearch = !lowerSearch || tagMatchesSearch(tag, lowerSearch);
            const domainOk =
                activeTab !== 'role' || !roleDomainFilter
                || !(tag.domains?.length)
                || tag.domains.some((d) => d.includes(roleDomainFilter) || roleDomainFilter.includes(d));
            return matchesCategory && matchesSearch && domainOk;
        });
    }, [availableTags, activeTab, searchTerm, roleDomainFilter]);

    const paneTags = useMemo(() => {
        let pool = baseFiltered;
        if (primaryPane === 'suggested') {
            const idSet = new Set(suggestedIds);
            pool = pool.filter((t) => idSet.has(t.id));
        }
        return sortTags(pool, sortMode, searchTerm);
    }, [baseFiltered, primaryPane, suggestedIds, sortMode, searchTerm]);

    const categoryCounts = useMemo(
        () => (searchTerm.trim() && activeTab === 'all' ? categoryResultCounts(availableTags, searchTerm, existingNameSet) : {}),
        [availableTags, searchTerm, activeTab, existingNameSet],
    );

    const groupedByCategory = useMemo(() => {
        if (!(searchTerm.trim() && activeTab === 'all' && primaryPane === 'all')) return null;
        const groups: Partial<Record<TagCategory, TagOption[]>> = {};
        for (const tag of paneTags) {
            const cat = tag.category || 'role';
            if (!groups[cat]) groups[cat] = [];
            groups[cat]!.push(tag);
        }
        return groups;
    }, [paneTags, searchTerm, activeTab, primaryPane]);

    const showExactAdd = Boolean(
        searchTerm.trim()
        && !hasExactCatalogMatch(availableTags, searchTerm)
        && !existingNameSet.has(searchTerm.trim()),
    );

    const handleToggleTag = (tag: TagOption) => {
        if (isAssociatedTag(tag, existingNameSet, associatedIdSet)) return;
        setSelectedTags((prev) => {
            const exists = prev.some((item) => item.id === tag.id || item.nameHe === tag.nameHe);
            if (exists) return prev.filter((item) => item.id !== tag.id && item.nameHe !== tag.nameHe);
            return [...prev, { ...tag, saveMode: 'normal' }];
        });
    };

    const handleToggleChipMode = (tag: TagOption) => {
        if (!enableRequiredTagToggle) {
            handleToggleTag(tag);
            return;
        }
        setSelectedTags((prev) =>
            prev.map((item) => {
                if (item.id !== tag.id) return item;
                const next: TagSaveMode = item.saveMode === 'mandatory' ? 'normal' : 'mandatory';
                return { ...item, saveMode: next };
            }),
        );
    };

    const handleSave = () => {
        onSave(selectedTags);
        setSelectedTags([]);
        setSearchTerm('');
        onClose();
    };

    const handleProposeNewTag = () => {
        const trimmed = searchTerm.trim();
        if (!trimmed || hasExactCatalogMatch(availableTags, trimmed)) return;
        const customTag: TagOption = {
            id: `custom-${Date.now()}-${trimmed}`,
            nameHe: trimmed,
            nameEn: trimmed,
            category: activeTab === 'all' ? 'role' : activeTab,
            description: '',
            synonyms: [],
            rawType: activeTab === 'all' ? 'role' : activeTab,
            saveMode: 'normal',
        };
        handleToggleTag(customTag);
        setSearchTerm('');
    };

    const flatRenderableTags = useMemo(() => {
        if (groupedByCategory) {
            return VISIBLE_CATEGORIES.flatMap((cat) => groupedByCategory[cat] || []);
        }
        return paneTags;
    }, [groupedByCategory, paneTags]);

    useEffect(() => {
        setFocusedIndex(0);
    }, [primaryPane, activeTab, searchTerm, paneTags.length]);

    const onListKeyDown = (e: React.KeyboardEvent) => {
        if (!flatRenderableTags.length) {
            if (e.key === 'Enter') handleSave();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex((i) => Math.min(i + 1, flatRenderableTags.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            const tag = flatRenderableTags[focusedIndex];
            if (tag) handleToggleTag(tag);
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const renderTagRow = (tag: TagOption, index: number) => {
        const associated = isAssociatedTag(tag, existingNameSet, associatedIdSet);
        const isSelected = selectedTags.some((item) => item.id === tag.id || item.nameHe === tag.nameHe);
        const showCategoryIcon = activeTab === 'all' && !searchTerm.trim();
        const isFocused = index === focusedIndex;

        return (
            <div
                key={tag.id}
                role="option"
                aria-selected={isSelected || associated}
                tabIndex={-1}
                onClick={() => handleToggleTag(tag)}
                className={`flex items-center gap-2.5 p-2.5 min-h-[3.25rem] rounded-xl border cursor-pointer transition-colors ${
                    associated
                        ? 'opacity-50 cursor-default bg-bg-subtle/40 border-border-default/80'
                        : isSelected
                          ? 'bg-primary-50/80 border-primary-300 shadow-sm'
                          : 'bg-bg-card border-border-default hover:border-primary-200 hover:bg-bg-hover'
                } ${isFocused ? 'ring-2 ring-primary-400 ring-offset-1' : ''}`}
            >
                <div className="shrink-0">
                    {associated ? (
                        <div className="w-6 h-6 flex items-center justify-center text-emerald-600" aria-label="כבר משויך">
                            <CheckIcon className="w-4 h-4" />
                        </div>
                    ) : (
                        <div
                            className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-border-default bg-white'
                            }`}
                        >
                            {isSelected ? <CheckIcon className="w-4 h-4" /> : null}
                        </div>
                    )}
                </div>
                {showCategoryIcon ? (
                    <span className="p-1 rounded-md bg-bg-subtle text-text-muted shrink-0">
                        {categoryConfig[tag.category]?.icon || categoryConfig.role.icon}
                    </span>
                ) : null}
                <div className="min-w-0 flex-1">
                    <div className={`font-bold text-base leading-tight line-clamp-2 ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>
                        <HighlightedName text={tag.nameHe} searchTerm={searchTerm} />
                    </div>
                    {tag.nameEn && tag.nameEn !== tag.nameHe ? (
                        <div className="text-sm text-text-muted mt-0.5 truncate" title={tag.nameEn}>
                            <HighlightedName text={tag.nameEn} searchTerm={searchTerm} />
                        </div>
                    ) : null}
                </div>
            </div>
        );
    };

    const renderTagGrid = (tags: TagOption[], indexOffset = 0) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {tags.map((tag, i) => renderTagRow(tag, indexOffset + i))}
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col h-[92vh] overflow-hidden border border-border-default animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">בחר תגיות וכישורים</h2>
                        <p className="text-sm text-text-muted mt-1">דייק את הפרופיל באמצעות תגיות מקצועיות</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                {context !== 'generic' ? (
                    <div className="px-5 pt-3 flex gap-2 border-b border-border-default bg-bg-card">
                        <button
                            type="button"
                            onClick={() => setPrimaryPane('all')}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                                primaryPane === 'all' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'
                            }`}
                        >
                            הכל
                        </button>
                        <button
                            type="button"
                            onClick={() => setPrimaryPane('suggested')}
                            className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                                primaryPane === 'suggested' ? 'border-primary-600 text-primary-700' : 'border-transparent text-text-muted hover:text-text-default'
                            }`}
                        >
                            {suggestedTitle}
                        </button>
                    </div>
                ) : null}

                <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                    <nav className="w-full md:w-64 bg-bg-card border-b md:border-b-0 md:border-l border-border-default flex-shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar flex md:flex-col p-2 gap-1 z-10">
                        {(Object.entries(categoryConfig) as [TagCategory, { label: string; icon: React.ReactNode }][])
                            .filter(([key]) => key === 'all' || VISIBLE_CATEGORIES.includes(key))
                            .map(([key, config]) => {
                                const count = categoryCounts[key];
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setActiveTab(key)}
                                        className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap md:whitespace-normal ${
                                            activeTab === key
                                                ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100'
                                                : 'text-text-muted hover:bg-bg-subtle hover:text-text-default border border-transparent'
                                        }`}
                                    >
                                        <span className="flex items-center gap-3 min-w-0">
                                            <span className={`p-1 rounded-md shrink-0 ${activeTab === key ? 'bg-white' : 'bg-bg-subtle'}`}>
                                                {config.icon}
                                            </span>
                                            {config.label}
                                        </span>
                                        {typeof count === 'number' && count > 0 ? (
                                            <span className="text-xs font-bold bg-primary-100 text-primary-800 px-2 py-0.5 rounded-full">{count}</span>
                                        ) : null}
                                    </button>
                                );
                            })}
                    </nav>

                    <div className="flex-1 flex flex-col min-w-0 bg-bg-subtle/20">
                        <div className="p-4 border-b border-border-default bg-bg-card sticky top-0 z-10 flex flex-col gap-3">
                            <div className="flex gap-3">
                                <div className="relative flex-grow">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="חיפוש לפי שם או נרדף..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={onListKeyDown}
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow shadow-sm"
                                        autoFocus
                                    />
                                </div>
                                <select
                                    value={sortMode}
                                    onChange={(e) => setSortMode(e.target.value as TagSortMode)}
                                    className="text-sm border border-border-default rounded-xl px-3 bg-bg-input shrink-0"
                                    aria-label="מיון"
                                >
                                    <option value="usage">לפי שכיחות</option>
                                    <option value="hebrew">א-ב בעברית</option>
                                </select>
                            </div>
                            {showExactAdd ? (
                                <button
                                    type="button"
                                    onClick={handleProposeNewTag}
                                    className="text-sm text-left text-primary-700 font-semibold hover:underline inline-flex items-center gap-1"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                    לא נמצא — הצע תגית חדשה «{searchTerm.trim()}»
                                </button>
                            ) : null}
                        </div>

                        {activeTab === 'role' && jobFieldCategories.length > 0 ? (
                            <div className="px-4 py-2 border-b border-border-default bg-bg-card flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
                                <label htmlFor="tag-selector-role-domain-search" className="text-[11px] font-bold text-text-muted shrink-0">
                                    תחום
                                </label>
                                <div className="relative flex-1 min-w-0 max-w-xs">
                                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        id="tag-selector-role-domain-search"
                                        type="text"
                                        value={roleDomainSearch}
                                        onChange={(e) => setRoleDomainSearch(e.target.value)}
                                        placeholder="חיפוש תחום..."
                                        className="w-full text-xs py-1 pl-2 pr-8 rounded-lg border border-border-default bg-bg-input text-text-default"
                                    />
                                </div>
                                <select
                                    id="tag-selector-role-domain"
                                    value={roleDomainFilter}
                                    onChange={(e) => setRoleDomainFilter(e.target.value)}
                                    className="flex-1 min-w-0 max-w-lg text-xs py-1 pl-2 pr-7 rounded-lg border border-border-default bg-bg-input text-text-default"
                                >
                                    <option value="">הכל</option>
                                    {roleDomainFilter && !roleDomainOptions.includes(roleDomainFilter) ? (
                                        <option value={roleDomainFilter}>{roleDomainFilter}</option>
                                    ) : null}
                                    {roleDomainOptions.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : null}

                        {selectedTags.length > 0 ? (
                            <div className="px-4 py-3 border-b border-border-default bg-primary-50/40">
                                <p className="text-xs font-bold text-text-muted mb-2">
                                    נבחרו לשמירה ({selectedTags.length})
                                    {enableRequiredTagToggle ? ' — לחיצה על צ\'יפ: סימון חובה' : ' — לחץ על תגית להסרה'}
                                </p>
                                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto custom-scrollbar">
                                    {selectedTags.map((tag) => (
                                        <div key={tag.id} className="inline-flex items-center gap-0.5">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleChipMode(tag)}
                                                className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors max-w-[16rem] ${
                                                    tag.saveMode === 'mandatory'
                                                        ? 'border-red-500 bg-red-50 text-red-900'
                                                        : 'border-primary-400 bg-primary-100 text-primary-900 hover:bg-primary-200'
                                                }`}
                                                title={enableRequiredTagToggle ? 'החלף חובה/רגיל' : 'הסר'}
                                            >
                                                <span className="break-words text-right leading-snug">{tag.nameHe}</span>
                                                {tag.saveMode === 'mandatory' ? (
                                                    <span className="text-[10px] font-bold shrink-0">חובה</span>
                                                ) : null}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleTag(tag)}
                                                className="p-1 rounded-full hover:bg-black/5 text-text-muted"
                                                aria-label="הסר"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div
                            ref={listRef}
                            className="flex-1 overflow-y-auto p-2 sm:p-3 custom-scrollbar min-h-0"
                            role="listbox"
                            tabIndex={0}
                            onKeyDown={onListKeyDown}
                        >
                            {error ? <p className="text-red-600 text-sm">{error}</p> : null}
                            {isLoading ? <p className="text-sm text-text-muted">טוען תגיות...</p> : null}
                            {primaryPane === 'suggested' && suggestionsLoading ? (
                                <p className="text-sm text-text-muted">מחשב הצעות...</p>
                            ) : null}
                            {primaryPane === 'suggested' && !suggestionsLoading && !suggestionsHasVector && seedTagIds.length === 0 ? (
                                <p className="text-sm text-text-muted">אין מספיק נתונים להצעות (הוסף תגיות או העלה קו&quot;ח / תיאור משרה).</p>
                            ) : null}

                            {groupedByCategory ? (
                                VISIBLE_CATEGORIES.map((cat) => {
                                    const rows = groupedByCategory[cat];
                                    if (!rows?.length) return null;
                                    let offset = 0;
                                    for (const c of VISIBLE_CATEGORIES) {
                                        if (c === cat) break;
                                        offset += groupedByCategory[c]?.length || 0;
                                    }
                                    return (
                                        <div key={cat} className="mb-4">
                                            <h3 className="text-xs font-bold text-text-muted mb-2 px-1">
                                                {categoryConfig[cat]?.label || cat}
                                            </h3>
                                            {renderTagGrid(rows, offset)}
                                        </div>
                                    );
                                })
                            ) : paneTags.length > 0 ? (
                                renderTagGrid(paneTags, 0)
                            ) : !isLoading && !suggestionsLoading ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-text-muted py-12">
                                    <MagnifyingGlassIcon className="w-12 h-12 mb-3 opacity-20"/>
                                    <p className="font-semibold">לא נמצאו תגיות</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <footer className="p-4 bg-bg-card border-t border-border-default flex justify-between items-center flex-shrink-0">
                    <div className="text-sm text-text-muted">
                        <span className="font-bold text-primary-700">{selectedTags.length}</span> תגיות נבחרו
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-subtle transition-colors text-sm">ביטול</button>
                        <button type="button" onClick={handleSave} className="px-8 py-2.5 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg transition-all text-sm flex items-center gap-2">
                            <CheckCircleIcon className="w-4 h-4"/>
                            שמור בחירה
                        </button>
                    </div>
                </footer>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.3); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(156, 163, 175, 0.5); }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
        </div>
    );
};

export default TagSelectorModal;
