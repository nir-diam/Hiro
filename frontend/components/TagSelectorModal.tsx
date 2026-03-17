
import React, { useState, useMemo, useEffect } from 'react';
import { 
    XMarkIcon, MagnifyingGlassIcon, CheckCircleIcon, BriefcaseIcon, 
    SparklesIcon, WrenchScrewdriverIcon, LanguageIcon, BuildingOffice2Icon, 
    AcademicCapIcon, UserGroupIcon, ChatBubbleBottomCenterTextIcon, PlusIcon,
    Squares2X2Icon, TableCellsIcon
} from './Icons';

export type TagCategory = 'all' | 'role' | 'skill' | 'tool' | 'soft_skill' | 'industry' | 'language' | 'education' | 'certification' | 'seniority';

export interface TagOption {
    id: string;
    nameHe: string;
    nameEn: string;
    category: TagCategory;
    description?: string;
    synonyms?: string[];
    rawType?: string;
    tagKey?: string;
}

interface TagSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedTags: TagOption[]) => void;
  existingTags: string[];
  initialCategory?: TagCategory; // To open in specific tab
}

const categoryConfig: Record<TagCategory, { label: string; icon: React.ReactNode }> = {
    'all': { label: 'הכל', icon: <Squares2X2Icon className="w-4 h-4"/> },
    'role': { label: 'תפקיד', icon: <BriefcaseIcon className="w-4 h-4"/> },
    'skill': { label: 'מיומנות', icon: <SparklesIcon className="w-4 h-4"/> },
    'tool': { label: 'כלי / תוכנה', icon: <WrenchScrewdriverIcon className="w-4 h-4"/> },
    'soft_skill': { label: 'כישור רך', icon: <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> },
    
    // Configs for categories we might want to hide but keep defined for type safety
    'industry': { label: 'תעשייה', icon: <BuildingOffice2Icon className="w-4 h-4"/> },
    'language': { label: 'שפה', icon: <LanguageIcon className="w-4 h-4"/> },
    'education': { label: 'השכלה', icon: <AcademicCapIcon className="w-4 h-4"/> },
    'seniority': { label: 'בכירות', icon: <UserGroupIcon className="w-4 h-4"/> },
    'certification': { label: 'הסמכה', icon: <CheckCircleIcon className="w-4 h-4"/> },
};

// Define which categories are visible for manual addition
const VISIBLE_CATEGORIES: TagCategory[] = ['role', 'skill', 'tool', 'soft_skill'];

const mapBackendTypeToCategory = (type?: string): TagCategory => {
    if (!type) return 'role';
    const normalized = type.toLowerCase();
    if (normalized === 'soft_skill') return 'soft_skill';
    if (normalized === 'skill' || normalized === 'hard_skill') return 'skill';
    if (normalized === 'tool') return 'tool';
    if (normalized === 'industry') return 'industry';
    if (normalized === 'language') return 'language';
    if (normalized === 'education') return 'education';
    if (normalized === 'certification') return 'certification';
    if (normalized === 'seniority') return 'seniority';
    return 'role';
};

const TagSelectorModal: React.FC<TagSelectorModalProps> = (props) => {
    const { isOpen, onClose, onSave, existingTags, initialCategory = 'all' } = props;
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<TagCategory>(initialCategory);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<TagOption[]>([]);
    const [hoveredTag, setHoveredTag] = useState<TagOption | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
    
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    useEffect(() => {
        if (!isOpen) return;
        setSelectedTags([]);
        setSearchTerm('');
        setViewMode('grid');
        setError(null);
        setHoveredTag(null);
        setTooltipPos(null);
        setActiveTab((prev) => {
            if (initialCategory !== 'all' && !VISIBLE_CATEGORIES.includes(initialCategory)) {
                return 'all';
            }
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
                    .filter((tag) => tag?.status === 'active')
                    .map((tag) => {
                        const nameHe = tag.displayNameHe || tag.tagKey || tag.displayNameEn || tag.id || '';
                        const nameEn = tag.displayNameEn || tag.tagKey || tag.displayNameHe || tag.id || '';
                        return {
                            id: tag.id || `${tag.tagKey || nameHe}-${Math.random().toString(36).slice(2, 8)}`,
                            nameHe: typeof nameHe === 'string' ? nameHe : '',
                            nameEn: typeof nameEn === 'string' ? nameEn : '',
                            category: mapBackendTypeToCategory(tag.type),
                            description: tag.descriptionHe || tag.descriptionEn || '',
                            synonyms: Array.isArray(tag.synonyms) ? tag.synonyms : [],
                            rawType: tag.type,
                            tagKey: tag.tagKey,
                        } as TagOption;
                    })
                    .filter((tag) => tag.nameHe);
                setAvailableTags(normalized);
            } catch (err: any) {
                if (err.name === 'AbortError') return;
                setError(err?.message || 'שגיאה בטעינת תגיות');
                setAvailableTags([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTags();
        return () => controller.abort();
    }, [isOpen, apiBase, initialCategory]);

    const filteredTags = useMemo(() => {
        const lowerSearch = searchTerm.trim().toLowerCase();
        return availableTags.filter((tag) => {
            const matchesCategory = activeTab === 'all' || tag.category === activeTab || !tag.category;
                const normSynonyms = tag.synonyms || [];
                const matchesSearch =
                    !lowerSearch ||
                    tag.nameHe.toLowerCase().includes(lowerSearch) ||
                    tag.nameEn.toLowerCase().includes(lowerSearch) ||
                    normSynonyms.some((syn) => {
                        return typeof syn === 'string' && syn.toLowerCase().includes(lowerSearch);
                    });
            const alreadySelected = selectedTags.some((selected) => selected.nameHe === tag.nameHe);
            const alreadyExisting = existingTags.some((existing) => existing === tag.nameHe);
            return matchesCategory && matchesSearch && !alreadyExisting && !alreadySelected;
        });
    }, [availableTags, activeTab, searchTerm, existingTags, selectedTags]);

    const handleToggleTag = (tag: TagOption) => {
        setSelectedTags((prev) => {
            const exists = prev.some((item) => item.nameHe === tag.nameHe);
            if (exists) return prev.filter((item) => item.nameHe !== tag.nameHe);
            return [...prev, tag];
        });
    };

    const handleSave = () => {
        onSave(selectedTags);
        setSelectedTags([]);
        setSearchTerm('');
        setViewMode('grid');
        onClose();
    };

    const handleQuickAdd = () => {
        const trimmed = searchTerm.trim();
        if (!trimmed) return;
        if (selectedTags.some((tag) => tag.nameHe === trimmed) || existingTags.includes(trimmed)) {
            setSearchTerm('');
            return;
        }
        const customTag: TagOption = {
            id: `custom-${Date.now()}-${trimmed}`,
            nameHe: trimmed,
            nameEn: trimmed,
            category: activeTab === 'all' ? 'role' : activeTab,
            description: '',
            synonyms: [],
            rawType: activeTab === 'all' ? 'role' : activeTab,
        };
        handleToggleTag(customTag);
        setSearchTerm('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div 
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col h-[85vh] overflow-hidden border border-border-default animate-fade-in" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">בחר תגיות וכישורים</h2>
                        <p className="text-sm text-text-muted mt-1">דייק את הפרופיל באמצעות תגיות מקצועיות</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                {/* Main Layout: Sidebar Tabs + Content Area */}
                <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                    
                    {/* Category Tabs (Sidebar on Desktop, Top Scroll on Mobile) */}
                    <nav className="w-full md:w-64 bg-bg-card border-b md:border-b-0 md:border-l border-border-default flex-shrink-0 overflow-x-auto md:overflow-y-auto custom-scrollbar flex md:flex-col p-2 gap-1 z-10">
                        { (Object.entries(categoryConfig) as [TagCategory, { label: string; icon: React.ReactNode }][] )
                            .filter(([key]) => key === 'all' || VISIBLE_CATEGORIES.includes(key))
                            .map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => setActiveTab(key)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap md:whitespace-normal ${
                                        activeTab === key 
                                        ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100' 
                                        : 'text-text-muted hover:bg-bg-subtle hover:text-text-default border border-transparent'
                                    }`}
                                >
                                    <span className={`p-1 rounded-md ${activeTab === key ? 'bg-white' : 'bg-bg-subtle'}`}>
                                        {config.icon}
                                    </span>
                                    {config.label}
                                </button>
                        ))}
                    </nav>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col min-w-0 bg-bg-subtle/20">
                        
                        {/* Search Bar & View Switcher */}
                        <div className="p-4 border-b border-border-default bg-bg-card sticky top-0 z-10 flex gap-3">
                             <div className="relative flex-grow">
                                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="חיפוש חופשי בקטגוריות הפתוחות..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-shadow shadow-sm"
                                    autoFocus
                                />
                                {searchTerm && (
                                     <button 
                                        onClick={handleQuickAdd}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold bg-primary-100 text-primary-700 px-2 py-1 rounded-md hover:bg-primary-200 transition-colors"
                                     >
                                         <PlusIcon className="w-3 h-3 inline mr-1"/>
                                         הוסף
                                     </button>
                                )}
                            </div>
                            
                            {/* View Switcher Buttons */}
                            <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default flex-shrink-0">
                                <button 
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת כרטיסיות"
                                >
                                    <Squares2X2Icon className="w-5 h-5"/>
                                </button>
                                <button 
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                    title="תצוגת רשימה (מידע מלא)"
                                >
                                    <TableCellsIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            {filteredTags.length > 0 ? (
                                viewMode === 'grid' ? (
                                    // GRID VIEW
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {filteredTags.map(tag => {
                                            const isSelected = selectedTags.some((item) => item.nameHe === tag.nameHe);
                                            return (
                                                <div 
                                                    key={tag.id}
                                                    onClick={() => handleToggleTag(tag)}
                                                    className={`group relative flex items-center justify-between p-3 rounded-xl border text-right transition-all cursor-pointer ${
                                                        isSelected 
                                                        ? 'bg-primary-50 border-primary-300 shadow-sm ring-1 ring-primary-200' 
                                                        : 'bg-bg-card border-border-default hover:border-primary-300 hover:shadow-md'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 pr-1">
                                                        <div 
                                                            className={`relative p-1.5 rounded-lg shrink-0 transition-colors cursor-help ${isSelected ? 'bg-white text-primary-600' : 'bg-bg-subtle text-text-muted group-hover:bg-primary-50 group-hover:text-primary-600'}`}
                                                            onMouseEnter={(e) => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top });
                                                                setHoveredTag(tag);
                                                            }}
                                                            onMouseLeave={() => {
                                                                setHoveredTag(null);
                                                                setTooltipPos(null);
                                                            }}
                                                        >
                                                            {categoryConfig[tag.category]?.icon || categoryConfig['role'].icon}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className={`font-bold text-sm truncate ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>{tag.nameHe}</div>
                                                            <div className="text-xs text-text-muted truncate">{tag.nameEn}</div>
                                                        </div>
                                                    </div>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-border-default bg-white'}`}>
                                                        {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    // LIST VIEW (Detailed)
                                    <div className="bg-bg-card rounded-xl border border-border-default overflow-hidden">
                                        <div className="divide-y divide-border-default">
                                            {filteredTags.map(tag => {
                                                const isSelected = selectedTags.some((item) => item.nameHe === tag.nameHe);
                                                return (
                                                    <div 
                                                        key={tag.id}
                                                        onClick={() => handleToggleTag(tag)}
                                                        className={`flex items-start gap-4 p-4 cursor-pointer transition-colors ${isSelected ? 'bg-primary-50/60' : 'hover:bg-bg-hover'}`}
                                                    >
                                                        <div className="pt-1">
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary-600 border-primary-600' : 'border-border-default bg-white'}`}>
                                                                {isSelected && <CheckCircleIcon className="w-4 h-4 text-white" />}
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`font-bold text-base ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>{tag.nameHe}</span>
                                                                    <span className="text-xs text-text-muted font-mono bg-bg-subtle px-1.5 py-0.5 rounded border border-border-default">{tag.nameEn}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-xs">
                                                                     <span className="flex items-center gap-1 text-text-subtle bg-bg-subtle/50 px-2 py-0.5 rounded">
                                                                         {categoryConfig[tag.category]?.icon || categoryConfig['role'].icon}
                                                                         {categoryConfig[tag.category]?.label || categoryConfig['role'].label}
                                                                     </span>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="text-sm text-text-muted leading-relaxed">
                                                                <p className="mb-1">{tag.description || <span className="italic text-text-subtle">אין תיאור זמין</span>}</p>
                                                                {tag.synonyms && tag.synonyms.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                                        {tag.synonyms.map(syn => (
                                                                            <span key={syn} className="text-[10px] text-text-subtle bg-white border border-border-default px-1.5 py-0.5 rounded-md">
                                                                                {syn}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center text-text-muted">
                                    <MagnifyingGlassIcon className="w-12 h-12 mb-3 opacity-20"/>
                                    <p className="font-semibold">לא נמצאו תגיות</p>
                                    <p className="text-sm mt-1">נסה חיפוש אחר או לחץ "הוסף" ליצירת תגית חדשה</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Portal Tooltip */}
                {hoveredTag && tooltipPos && (
                    <div 
                        className="fixed z-[9999] w-56 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl pointer-events-none animate-fade-in"
                        style={{ 
                            left: tooltipPos.x, 
                            top: tooltipPos.y - 8,
                            transform: 'translate(-50%, -100%)'
                        }}
                    >
                        <div className="font-bold mb-1 text-white/90 border-b border-white/20 pb-1">{hoveredTag.nameEn}</div>
                        <p className="mb-2 text-gray-300 leading-tight">{hoveredTag.description || 'ללא תיאור'}</p>
                        {hoveredTag.synonyms && hoveredTag.synonyms.length > 0 && (
                            <div className="text-gray-400 text-[10px]">
                                <span className="font-semibold text-gray-300">נרדפים:</span> {hoveredTag.synonyms.join(', ')}
                            </div>
                        )}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                )}

                {/* Footer */}
                <footer className="p-4 bg-bg-card border-t border-border-default flex justify-between items-center flex-shrink-0">
                     <div className="text-sm text-text-muted">
                         <span className="font-bold text-primary-700">{selectedTags.length}</span> תגיות נבחרו
                     </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-subtle transition-colors text-sm">ביטול</button>
                        <button onClick={handleSave} className="px-8 py-2.5 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 shadow-md hover:shadow-lg transition-all text-sm flex items-center gap-2">
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
