
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { jobFieldsData, JobCategory, JobFieldType, JobRole } from '../data/jobFieldsData';
import { 
    PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon, MagnifyingGlassIcon, 
    SparklesIcon, ListBulletIcon, FolderIcon, TagIcon, NoSymbolIcon, Squares2X2Icon, XMarkIcon
} from './Icons';
import { GoogleGenAI, FunctionDeclaration, Type, Chat } from '@google/genai';
import HiroAIChat from './HiroAIChat';

// --- AI TOOLS DEFINITIONS ---

const addCategoryTool: FunctionDeclaration = {
    name: 'addCategory',
    parameters: {
        type: Type.OBJECT,
        description: 'Add a new main category to the taxonomy.',
        properties: {
            name: { type: Type.STRING, description: 'The name of the new category (e.g., "Cyber Security").' }
        },
        required: ['name']
    }
};

const addClusterTool: FunctionDeclaration = {
    name: 'addCluster',
    parameters: {
        type: Type.OBJECT,
        description: 'Add a new cluster (sub-domain) to an existing category.',
        properties: {
            categoryName: { type: Type.STRING, description: 'The exact name of the parent category.' },
            clusterName: { type: Type.STRING, description: 'The name of the new cluster.' }
        },
        required: ['categoryName', 'clusterName']
    }
};

const addRoleTool: FunctionDeclaration = {
    name: 'addRole',
    parameters: {
        type: Type.OBJECT,
        description: 'Add a new job role to a specific cluster.',
        properties: {
            categoryName: { type: Type.STRING, description: 'The exact name of the parent category.' },
            clusterName: { type: Type.STRING, description: 'The exact name of the parent cluster.' },
            roleName: { type: Type.STRING, description: 'The name of the role (e.g., "Junior Pentester").' },
            synonyms: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                description: 'List of synonyms for this role.' 
            }
        },
        required: ['categoryName', 'clusterName', 'roleName']
    }
};

// Helper types for UI state
type Status = 'active' | 'draft' | 'deprecated';
type ModalMode = 'add' | 'edit';
type EntityType = 'category' | 'cluster' | 'role';

interface TagOption {
    id: string;
    tagKey: string;
    label: string;
}

interface AdminColumnProps {
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    onAdd: () => void;
    searchTerm: string;
    onSearchChange: (val: string) => void;
    count: number;
    aiAction?: () => void;
    aiTooltip?: string;
    emptyStateText: string;
    isActive?: boolean;
}

const AdminColumn: React.FC<AdminColumnProps> = ({ 
    title, subtitle, icon, children, onAdd, searchTerm, onSearchChange, count, aiAction, aiTooltip, emptyStateText, isActive = true 
}) => (
    <div className={`flex-1 flex flex-col min-w-0 bg-white border-l border-border-default first:border-l-0 last:rounded-l-xl first:rounded-r-xl h-full shadow-sm transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
        {/* Header */}
        <header className="p-4 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-text-default">
                    {icon}
                    <div>
                        <h3 className="font-extrabold text-sm uppercase tracking-wider">{title}</h3>
                        {subtitle && <p className="text-[10px] text-text-muted font-normal">{subtitle}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <span className="bg-bg-subtle text-text-muted text-xs font-bold px-2 py-0.5 rounded-full border border-border-default ml-2">
                        {count}
                    </span>
                    {aiAction && isActive && (
                        <button 
                            onClick={aiAction} 
                            title={aiTooltip}
                            className="p-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors border border-purple-100"
                        >
                            <SparklesIcon className="w-4 h-4" />
                        </button>
                    )}
                    <button 
                        onClick={isActive ? onAdd : undefined} 
                        className={`p-1.5 rounded-lg transition-colors ${isActive ? 'text-primary-600 bg-primary-50 hover:bg-primary-100' : 'text-gray-400 bg-gray-50'}`}
                        title="הוסף חדש"
                    >
                        <PlusIcon className="w-4 h-4"/>
                    </button>
                </div>
            </div>
            
            <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder="סינון..." 
                    value={searchTerm}
                    disabled={!isActive}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-xs focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-all disabled:bg-gray-50"
                />
            </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-bg-subtle/10">
            {count > 0 ? children : (
                <div className="h-full flex flex-col items-center justify-center text-text-muted text-center p-4">
                    <div className="mb-2 p-3 bg-bg-subtle rounded-full opacity-50">{icon}</div>
                    <p className="text-sm font-medium opacity-70">{emptyStateText}</p>
                </div>
            )}
        </div>
    </div>
);

const ListItem: React.FC<{ 
    title: string; 
    subtitle?: string; 
    isSelected: boolean; 
    onClick: () => void; 
    onEdit: () => void; 
    onDelete: () => void;
    status?: Status;
    badgeCount?: number;
    isNew?: boolean; 
}> = ({ title, subtitle, isSelected, onClick, onEdit, onDelete, status = 'active', badgeCount, isNew }) => {
    
    const statusColor = status === 'active' ? 'bg-green-500' : status === 'draft' ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div 
            onClick={onClick}
            className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all duration-200 relative overflow-hidden
                ${isSelected 
                    ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-100 z-10' 
                    : 'bg-white border-transparent hover:border-border-default hover:bg-bg-subtle hover:shadow-sm'
                }
                ${isNew ? 'animate-pulse ring-1 ring-purple-300 bg-purple-50' : ''}
            `}
        >
            {isNew && <div className="absolute top-0 right-0 w-2 h-2 bg-purple-500 rounded-bl-full"></div>}
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {/* Status Dot */}
                    <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} title={status}></div>
                    
                    <span className={`font-semibold text-sm truncate ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>
                        {title}
                    </span>
                    
                    {badgeCount !== undefined && (
                        <span className="text-[10px] bg-bg-subtle text-text-subtle px-1.5 py-0.5 rounded border border-border-default">
                            {badgeCount}
                        </span>
                    )}
                </div>
                {subtitle && (
                    <p className="text-xs text-text-muted mt-1 truncate pr-3.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        {subtitle}
                    </p>
                )}
            </div>

            {/* Actions (Visible on Hover / Selected) */}
            <div className={`flex items-center gap-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <button 
                    onClick={(e) => { e.stopPropagation(); onEdit(); }} 
                    className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-white rounded-lg transition-colors"
                    title="ערוך"
                >
                    <PencilIcon className="w-3.5 h-3.5"/>
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); onDelete(); }} 
                    className="p-1.5 text-text-subtle hover:text-red-600 hover:bg-white rounded-lg transition-colors"
                    title="מחק"
                >
                    <TrashIcon className="w-3.5 h-3.5"/>
                </button>
                <div className="w-px h-4 bg-border-default mx-1"></div>
                <ChevronLeftIcon className={`w-3.5 h-3.5 text-text-muted transition-transform ${isSelected ? 'opacity-100' : 'opacity-30'}`}/>
            </div>
        </div>
    );
};

// --- MODAL FOR ADD/EDIT ---
interface TaxonomyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (value: string, tags?: TagOption[]) => void;
    initialValue: string;
    type: EntityType;
    mode: ModalMode;
    targetId?: string;
    apiBase: string;
    availableTags: TagOption[];
    initialTags?: TagOption[];
    onTagCreated?: (tag: TagOption) => void;
}

const TaxonomyModal: React.FC<TaxonomyModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialValue,
    type,
    mode,
    apiBase,
    availableTags,
    initialTags = [],
    onTagCreated,
}) => {
    const [value, setValue] = useState(initialValue);
    const [selectedTags, setSelectedTags] = useState<TagOption[]>(initialTags);
    const [tagInput, setTagInput] = useState('');
    const [isSavingTag, setIsSavingTag] = useState(false);
    const [tagError, setTagError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            setSelectedTags(initialTags || []);
            setTagInput('');
            setTagError(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, initialValue, initialTags]);

    const matchingTags = useMemo(() => {
        const query = tagInput.trim().toLowerCase();
        if (!query) return availableTags;
        return availableTags
            .filter((tag) => (tag.label || tag.tagKey || '').toLowerCase().includes(query))
            .slice(0, 50);
    }, [availableTags, tagInput]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSave(value.trim(), selectedTags);
        onClose();
    };

    const datalistId = `${type}-tag-options`;

    const handleAddTag = async () => {
        const trimmed = tagInput.trim();
        if (!trimmed || isSavingTag) return;

        const lowerTrim = trimmed.toLowerCase();
        if (selectedTags.some((tag) => (tag.tagKey || tag.label || '').toLowerCase() === lowerTrim)) {
            setTagError('תגית זו כבר מסומנת');
            return;
        }

        const existing = availableTags.find(
            (tag) =>
                (tag.tagKey || '').toLowerCase() === lowerTrim ||
                (tag.label || '').toLowerCase() === lowerTrim,
        );

        if (existing) {
            setSelectedTags((prev) => [...prev, existing]);
            setTagInput('');
            setTagError(null);
            return;
        }

        setIsSavingTag(true);
        setTagError(null);
        try {
            const response = await fetch(`${apiBase}/api/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagKey: trimmed, displayNameHe: trimmed }),
            });
            if (!response.ok) {
                const payload = await response.text();
                throw new Error(payload || 'הוספת תגית נכשלה');
            }
            const created = await response.json();
            const newTag: TagOption = {
                id: created.id,
                tagKey: created.tagKey,
                label: created.displayNameHe || created.displayNameEn || created.tagKey || trimmed,
            };
            onTagCreated?.(newTag);
            setSelectedTags((prev) => [...prev, newTag]);
            setTagInput('');
        } catch (error: any) {
            setTagError(error?.message || 'שגיאה ביצירת תגית');
        } finally {
            setIsSavingTag(false);
        }
    };

    const handleKeyDownTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTag();
        }
    };

    const removeTag = (id: string) => {
        setSelectedTags((prev) => prev.filter((tag) => tag.id !== id));
    };

    const handleSelectTagOption = (tag: TagOption) => {
        if (selectedTags.some((existing) => existing.id === tag.id)) {
            setTagError('תגית זו כבר מסומנת');
            return;
        }
        setSelectedTags((prev) => [...prev, tag]);
        setTagInput('');
        setTagError(null);
    };

    const titles = {
        category: { add: 'הוספת קטגוריה', edit: 'עריכת קטגוריה' },
        cluster: { add: 'הוספת קלאסטר', edit: 'עריכת קלאסטר' },
        role: { add: 'הוספת תפקיד', edit: 'עריכת תפקיד' },
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-xl border border-border-default w-full max-w-lg overflow-hidden animate-fade-in" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                    <h3 className="font-bold text-lg text-text-default">{titles[type][mode]}</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-4">
                        <label className="block text-sm font-semibold text-text-muted mb-2">
                            {type === 'role' ? 'שם התפקיד (ראשי)' : type === 'cluster' ? 'שם הקלאסטר' : 'שם הקטגוריה'}
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                            placeholder="הקלד שם..."
                        />
                    </div>

                    {type === 'role' && (
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-semibold text-text-muted">תגיות</label>
                                <button
                                    type="button"
                                    disabled
                                    className="flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-full border border-border-default bg-gray-100 text-gray-400 cursor-not-allowed"
                                    title="העשרה אוטומטית לא זמינה זמנית"
                                >
                                    <SparklesIcon className="w-3 h-3" />
                                    מושבתת
                                </button>
                            </div>

                            <div className="flex gap-2 mb-2 flex-wrap">
                                <input
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyDown={handleKeyDownTag}
                                    className="flex-1 min-w-[220px] bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                    placeholder="הקלד או בחר תגית..."
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTag}
                                    disabled={!tagInput.trim() || isSavingTag}
                                    className="text-sm font-semibold bg-primary-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isSavingTag ? 'שומר...' : 'הוסף'}
                                </button>
                            </div>
                            {tagError && <p className="text-[11px] text-red-600 mb-2">{tagError}</p>}

                            <div
                                className="bg-white border border-border-default rounded-xl shadow-inner overflow-hidden mb-2 transition-all"
                                style={{
                                    maxHeight: tagInput.trim() ? '180px' : '320px',
                                }}
                            >
                                <div className="max-h-[320px] overflow-y-auto custom-scrollbar">
                                    {matchingTags.length === 0 ? (
                                        <div className="p-3 text-xs text-text-muted">לא נמצאו תגיות תואמות</div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2 text-xs">
                                            {matchingTags.map((tag) => (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => handleSelectTagOption(tag)}
                                                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-bg-hover transition-colors text-text-default flex justify-between items-center"
                                                >
                                                    <span>{tag.label}</span>
                                                    <span className="text-[10px] text-text-muted">{tag.tagKey}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-2 min-h-[60px] p-3 bg-bg-subtle/30 rounded-xl border border-border-default/50 max-h-[140px] overflow-y-auto custom-scrollbar">
                                {selectedTags.length === 0 ? (
                                    <span className="text-xs text-text-muted italic">אין תגיות שנבחרו</span>
                                ) : (
                                    selectedTags.map((tag) => (
                                        <span
                                            key={tag.id}
                                            className="flex items-center gap-2 bg-white border border-border-default px-3 py-1 rounded-full text-xs font-medium text-text-default shadow-sm"
                                        >
                                            {tag.label}
                                            <button
                                                type="button"
                                                onClick={() => removeTag(tag.id)}
                                                className="text-text-subtle hover:text-red-500"
                                            >
                                                <XMarkIcon className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2 border-t border-border-default mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all"
                        >
                            {mode === 'add' ? 'הוסף' : 'שמור שינויים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

interface Message {
    role: 'user' | 'model';
    text: string;
}

const AdminJobFieldsView: React.FC = () => {
    // --- STATE ---
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [data, setData] = useState<JobCategory[]>(jobFieldsData);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Selection
    const [selectedCategory, setSelectedCategory] = useState<JobCategory | null>(null);
    const [selectedCluster, setSelectedCluster] = useState<JobFieldType | null>(null); 
    
    // Search
    const [searchCategory, setSearchCategory] = useState('');
    const [searchCluster, setSearchCluster] = useState('');
    const [searchRole, setSearchRole] = useState('');
    
    // UI Feedback
    const [aiLoading, setAiLoading] = useState<string | null>(null);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    // Modal State
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        type: EntityType;
        mode: ModalMode;
        initialValue: string;
        initialSynonyms?: string[];
        initialTags?: TagOption[];
        targetId?: string; 
    }>({
        isOpen: false,
        type: 'category',
        mode: 'add',
        initialValue: ''
    });

    const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
    const handleTagCreated = (tag: TagOption) => {
        setAvailableTags((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]));
    };

    // --- HELPERS ---
const normalizeRole = (role: any): JobRole => ({
    id: role.id,
    value: role.value,
    synonyms: Array.isArray(role.synonyms) ? role.synonyms : [],
    tags: Array.isArray(role.tags)
        ? role.tags.map((tag: any) => ({
              id: tag.id,
              tagKey: tag.tagKey,
              label: tag.displayNameHe || tag.displayNameEn || tag.tagKey,
          }))
        : [],
});

const normalizeTagOption = (tag: any): TagOption => ({
    id: tag.id,
    tagKey: tag.tagKey,
    label: tag.displayNameHe || tag.displayNameEn || tag.tagKey || 'תגית',
});

    const normalizeCluster = (cluster: any): JobFieldType => ({
        id: cluster.id,
        name: cluster.name,
        roles: (cluster.roles || []).map(normalizeRole),
    });

    const normalizeCategory = (category: any): JobCategory => ({
        id: category.id,
        name: category.name,
        fieldTypes: (category.fieldTypes || category.clusters || []).map(normalizeCluster),
    });

    const loadJobFields = async () => {
        setIsLoading(true);
        setFetchError(null);
        try {
            const response = await fetch(`${apiBase}/api/job-fields`);
            if (!response.ok) {
                throw new Error('נכשל בשאילתא לקטגוריות');
            }
            const payload = await response.json();
            if (Array.isArray(payload)) {
                const normalized = payload.map(normalizeCategory);
                setData(normalized);
            }
        } catch (err: any) {
            setFetchError(err.message || 'אירעה שגיאה בטעינת הנתונים');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadJobFields();
    }, []);

    useEffect(() => {
        let canceled = false;
        const fetchTags = async () => {
            try {
                const response = await fetch(`${apiBase}/api/tags`);
                if (!response.ok) throw new Error('לא ניתן לטעון תגיות');
                const payload = await response.json();
                if (Array.isArray(payload) && !canceled) {
                    const filtered = payload.filter((tag) => tag.status !== 'deprecated' && tag.status !== 'archived');
                    setAvailableTags(filtered.map(normalizeTagOption));
                }
            } catch (err) {
                console.error('Failed to load tags', err);
            }
        };
        fetchTags();
        return () => {
            canceled = true;
        };
    }, [apiBase]);

    const jobFieldsContext = useMemo(() => ({
        categories: data.map((category) => ({
            id: category.id,
            name: category.name,
            fieldTypes: (category.fieldTypes || []).map(cluster => ({
                id: cluster.id,
                name: cluster.name,
                roles: (cluster.roles || []).map(role => ({
                    id: role.id,
                    value: role.value,
                    synonyms: role.synonyms || [],
                })),
            })),
        })),
    }), [data]);

    // --- CHAT LOGIC ---

    const applyJobFieldSuggestions = useCallback(
        async (_patch: any, meta: { suggestions?: any[] } = {}) => {
            const suggestions = Array.isArray(meta.suggestions) ? meta.suggestions : [];
            if (!suggestions.length) return;
            setIsLoading(true);
            let mutated = false;
            const findCategoryByName = (name?: string) => {
                if (!name) return null;
                const normalized = name.toLowerCase();
                return data.find((cat) => cat.name.toLowerCase() === normalized);
            };
            const ensureStringArray = (value: any) => {
                if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
                if (typeof value === 'string') return [value.trim()].filter(Boolean);
                return [];
            };
            try {
                for (const suggestion of suggestions) {
                    if (!suggestion.field) continue;
                    const field = suggestion.field;
                    const proposed = suggestion.proposedValue ?? suggestion.value;
                    if (!proposed) continue;
                    const target = suggestion.currentValue || suggestion.categoryName || suggestion.clusterName;
                    if (field === 'category') {
                        await fetch(`${apiBase}/api/job-fields/categories`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: String(proposed).trim() }),
                        });
                        mutated = true;
                    } else if (field === 'cluster') {
                        const category = findCategoryByName(target) || selectedCategory;
                        if (!category?.id) continue;
                        await fetch(`${apiBase}/api/job-fields/clusters`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ categoryId: category.id, name: String(proposed).trim() }),
                        });
                        mutated = true;
                    } else if (field === 'role') {
                        const clusterName = target || selectedCluster?.name;
                        const category =
                            findCategoryByName(suggestion.categoryName) ||
                            (selectedCategory && selectedCategory.name === suggestion.categoryName ? selectedCategory : null);
                        const cluster =
                            category?.fieldTypes?.find((cl) => cl.name.toLowerCase() === (clusterName || '').toLowerCase()) ||
                            selectedCluster;
                        if (!cluster?.id) continue;
                        const synonyms = ensureStringArray(suggestion.synonyms || suggestion.proposedSynonyms);
                        await fetch(`${apiBase}/api/job-fields/roles`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                clusterId: cluster.id,
                                value: String(proposed).trim(),
                                synonyms,
                            }),
                        });
                        mutated = true;
                    } else if (field === 'synonym') {
                        const roleName = (target || suggestion.roleName || '').trim();
                        if (!roleName) continue;
                        const cluster =
                            selectedCluster ||
                            (selectedCategory?.fieldTypes || []).find((cl) =>
                                cl.roles.some((r) => r.value.toLowerCase() === roleName.toLowerCase()),
                            );
                        const role =
                            cluster?.roles?.find((r) => r.value.toLowerCase() === roleName.toLowerCase()) || null;
                        if (!cluster?.id || !role?.id) continue;
                        const newSyns = Array.from(new Set([...ensureStringArray(role.synonyms), ...ensureStringArray(proposed)]));
                        await fetch(`${apiBase}/api/job-fields/roles/${role.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                value: role.value,
                                synonyms: newSyns,
                            }),
                        });
                        mutated = true;
                    }
                }
                if (mutated) {
                    await loadJobFields();
                }
            } catch (err: any) {
                alert(err.message || 'החלת ההצעות נכשלה');
            } finally {
                setIsLoading(false);
            }
        },
        [apiBase, data, selectedCategory, selectedCluster, loadJobFields],
    );

    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const categoriesSnapshot = data.map(c => c.name).join(', ');
        
        const systemInstruction = `You are a taxonomy expert assistant for the "Hiro" recruitment system.
        You can help the user organize job fields, categories, and roles.
        You have WRITE access to the taxonomy tree via function calls.
        
        Current Categories: ${categoriesSnapshot}
        
        If the user asks to add something, verify where it should go, then use the appropriate tool.
        If they ask for advice, provide it.
        Be professional and concise. Answer in Hebrew.`;

        const session = ai.chats.create({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction,
                tools: [{ functionDeclarations: [addCategoryTool, addClusterTool, addRoleTool] }]
            }
        });

        setChatSession(session);
        setChatMessages([{ role: 'model', text: 'היי, אני עוזר הטקסונומיה שלך. אני יכול לעזור לך להוסיף קטגוריות, קלאסטרים ותפקידים באופן אוטומטי. מה תרצה לעשות?' }]);
    };

    const handleOpenChat = () => {
        initializeChat();
        setIsChatOpen(true);
    };

    const handleSendMessage = async (input: string) => {
        if (!input.trim() || isChatLoading || !chatSession) return;
        setChatMessages(prev => [...prev, { role: 'user', text: input }]);
        setIsChatLoading(true);
        setChatError(null);

        try {
            const response = await chatSession.sendMessage({ message: input });
            
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    
                    if (fc.name === 'addCategory') {
                        const { name } = fc.args as any;
                        if (!data.some(c => c.name === name)) {
                            const newCategory: JobCategory = { name, fieldTypes: [] };
                            setData(prev => [...prev, newCategory]);
                            // Set as selected to show the user
                            setSelectedCategory(newCategory);
                            setSelectedCluster(null);
                            
                            const toolRes = await chatSession.sendMessage({ message: `Success: Category "${name}" added.` });
                            setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `הוספתי את הקטגוריה "${name}".` }]);
                        } else {
                             const toolRes = await chatSession.sendMessage({ message: `Error: Category "${name}" already exists.` });
                             setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `הקטגוריה "${name}" כבר קיימת.` }]);
                        }
                    }

                    if (fc.name === 'addCluster') {
                        const { categoryName, clusterName } = fc.args as any;
                        const categoryIndex = data.findIndex(c => c.name === categoryName);
                        
                        if (categoryIndex !== -1) {
                            const category = data[categoryIndex];
                            if (!category.fieldTypes.some(cl => cl.name === clusterName)) {
                                const newCluster: JobFieldType = { name: clusterName, roles: [] };
                                const updatedCategory = { ...category, fieldTypes: [...category.fieldTypes, newCluster] };
                                
                                setData(prev => {
                                    const newData = [...prev];
                                    newData[categoryIndex] = updatedCategory;
                                    return newData;
                                });
                                setSelectedCategory(updatedCategory);
                                setSelectedCluster(newCluster);

                                const toolRes = await chatSession.sendMessage({ message: `Success: Cluster "${clusterName}" added to "${categoryName}".` });
                                setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `הוספתי את הקלאסטר "${clusterName}" תחת "${categoryName}".` }]);
                            } else {
                                 const toolRes = await chatSession.sendMessage({ message: `Error: Cluster "${clusterName}" already exists in "${categoryName}".` });
                                 setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `הקלאסטר כבר קיים.` }]);
                            }
                        } else {
                             const toolRes = await chatSession.sendMessage({ message: `Error: Category "${categoryName}" not found.` });
                             setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `לא מצאתי את הקטגוריה "${categoryName}".` }]);
                        }
                    }

                    if (fc.name === 'addRole') {
                        const { categoryName, clusterName, roleName, synonyms } = fc.args as any;
                        
                        // Find indexes
                        const catIdx = data.findIndex(c => c.name === categoryName);
                        if (catIdx !== -1) {
                            const cat = data[catIdx];
                            const clustIdx = cat.fieldTypes.findIndex(c => c.name === clusterName);
                            
                            if (clustIdx !== -1) {
                                const cluster = cat.fieldTypes[clustIdx];
                                if (!cluster.roles.some(r => r.value === roleName)) {
                                    const newRole: JobRole = { value: roleName, synonyms: synonyms || [] };
                                    const updatedCluster = { ...cluster, roles: [...cluster.roles, newRole] };
                                    
                                    const updatedCategory = {
                                        ...cat,
                                        fieldTypes: cat.fieldTypes.map((cl, i) => i === clustIdx ? updatedCluster : cl)
                                    };

                                    setData(prev => {
                                        const newData = [...prev];
                                        newData[catIdx] = updatedCategory;
                                        return newData;
                                    });
                                    setSelectedCategory(updatedCategory);
                                    setSelectedCluster(updatedCluster);

                                    const toolRes = await chatSession.sendMessage({ message: `Success: Role "${roleName}" added.` });
                                    setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `הוספתי את התפקיד "${roleName}".` }]);
                                } else {
                                     const toolRes = await chatSession.sendMessage({ message: `Error: Role exists.` });
                                     setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `התפקיד כבר קיים.` }]);
                                }
                            } else {
                                 const toolRes = await chatSession.sendMessage({ message: `Error: Cluster not found.` });
                                 setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `לא מצאתי את הקלאסטר.` }]);
                            }
                        } else {
                             const toolRes = await chatSession.sendMessage({ message: `Error: Category not found.` });
                             setChatMessages(prev => [...prev, { role: 'model', text: toolRes.text || `לא מצאתי את הקטגוריה.` }]);
                        }
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: response.text || "סליחה, לא הבנתי." }]);
            }
        } catch (e) {
            console.error(e);
            setChatError("אירעה שגיאה בתקשורת עם השרת.");
        } finally {
            setIsChatLoading(false);
        }
    };


    // --- HANDLERS ---
    const handleSelectCategory = (category: JobCategory) => {
        if (selectedCategory?.name === category.name) return;
        setSelectedCategory(category);
        setSelectedCluster(null); // Reset lower levels
    };

    const handleSelectCluster = (cluster: JobFieldType) => {
        setSelectedCluster(cluster);
    };

    // --- MODAL TRIGGERS ---
    const openAddModal = (type: EntityType) => {
        setModalState({ isOpen: true, type, mode: 'add', initialValue: '', initialSynonyms: [], initialTags: [] });
    };

    const openEditModal = (
        type: EntityType,
        targetId: string | undefined,
        currentName: string,
        currentSynonyms?: string[],
        currentTags: TagOption[] = [],
    ) => {
        setModalState({
            isOpen: true,
            type,
            mode: 'edit',
            initialValue: currentName,
            initialSynonyms: currentSynonyms || [],
            initialTags: currentTags,
            targetId,
        });
    };

    // --- CRUD OPERATIONS ---
    const handleModalSave = async (value: string, tags: TagOption[] = []) => {
        const { type, mode, targetId, initialSynonyms } = modalState;
        if (!value.trim()) return;
        const headers = { 'Content-Type': 'application/json' };
        const tagIds = tags.map((tag) => tag.id).filter(Boolean);
        const synonyms = initialSynonyms || [];

        try {
            if (mode === 'add') {
                if (type === 'category') {
                    const response = await fetch(`${apiBase}/api/job-fields/categories`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ name: value }),
                    });
                    if (!response.ok) throw new Error('הוספת הקטגוריה נכשלה');
                    const created = normalizeCategory(await response.json());
                    setData(prev => [...prev, created]);
                    setSelectedCategory(created);
                    setSelectedCluster(null);
                } else if (type === 'cluster') {
                    if (!selectedCategory?.id) throw new Error('בחר קטגוריה ראשית קודם');
                    const response = await fetch(`${apiBase}/api/job-fields/clusters`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ categoryId: selectedCategory.id, name: value }),
                    });
                    if (!response.ok) throw new Error('הוספת הקלאסטר נכשלה');
                    const created = normalizeCluster(await response.json());
                    setData(prev => prev.map(cat => cat.id === selectedCategory.id ? { ...cat, fieldTypes: [...cat.fieldTypes, created] } : cat));
                    setSelectedCategory(prev => prev ? { ...prev, fieldTypes: [...prev.fieldTypes, created] } : prev);
                    setSelectedCluster(created);
                } else if (type === 'role') {
                    if (!selectedCluster?.id || !selectedCategory) throw new Error('בחר קלאסטר קודם');
                    const response = await fetch(`${apiBase}/api/job-fields/roles`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ clusterId: selectedCluster.id, value, synonyms, tagIds }),
                    });
                    if (!response.ok) throw new Error('הוספת התפקיד נכשלה');
                    const created = normalizeRole(await response.json());
                    const updatedCluster = { ...selectedCluster, roles: [...selectedCluster.roles, created] };
                    const updatedCategory = {
                        ...selectedCategory,
                        fieldTypes: selectedCategory.fieldTypes.map(ft => ft.id === selectedCluster.id ? updatedCluster : ft),
                    };
                    setData(prev => prev.map(cat => cat.id === selectedCategory.id ? updatedCategory : cat));
                    setSelectedCategory(updatedCategory);
                    setSelectedCluster(updatedCluster);
                }
            } else if (mode === 'edit' && targetId) {
                if (type === 'category') {
                    const response = await fetch(`${apiBase}/api/job-fields/categories/${targetId}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ name: value }),
                    });
                    if (!response.ok) throw new Error('שינוי הקטגוריה נכשל');
                    const updated = normalizeCategory(await response.json());
                    setData(prev => prev.map(cat => cat.id === targetId ? { ...cat, name: updated.name } : cat));
                    if (selectedCategory?.id === targetId) {
                        setSelectedCategory(prev => prev ? { ...prev, name: updated.name } : prev);
                    }
                } else if (type === 'cluster') {
                    const response = await fetch(`${apiBase}/api/job-fields/clusters/${targetId}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ name: value }),
                    });
                    if (!response.ok) throw new Error('שינוי הקלאסטר נכשל');
                    const updated = normalizeCluster(await response.json());
                    setData(prev => prev.map(cat => ({
                        ...cat,
                        fieldTypes: cat.fieldTypes.map(ft => ft.id === targetId ? { ...ft, name: updated.name } : ft),
                    })));
                    if (selectedCategory) {
                        const updatedCategory = {
                            ...selectedCategory,
                            fieldTypes: selectedCategory.fieldTypes.map(ft => ft.id === targetId ? { ...ft, name: updated.name } : ft),
                        };
                        setSelectedCategory(updatedCategory);
                        if (selectedCluster?.id === targetId) {
                            setSelectedCluster(prev => prev ? { ...prev, name: updated.name } : prev);
                        }
                    }
                } else if (type === 'role') {
                    const response = await fetch(`${apiBase}/api/job-fields/roles/${targetId}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ value, synonyms, tagIds }),
                    });
                    if (!response.ok) throw new Error('שינוי התפקיד נכשל');
                    const updated = normalizeRole(await response.json());
                    setData(prev => prev.map(cat => ({
                        ...cat,
                        fieldTypes: cat.fieldTypes.map(ft => ({
                            ...ft,
                            roles: ft.roles.map(r => r.id === targetId ? updated : r),
                        })),
                    })));
                    if (selectedCategory && selectedCluster) {
                        const updatedCluster = {
                            ...selectedCluster,
                            roles: selectedCluster.roles.map(r => r.id === targetId ? updated : r),
                        };
                        const updatedCategory = {
                            ...selectedCategory,
                            fieldTypes: selectedCategory.fieldTypes.map(ft => ft.id === selectedCluster.id ? updatedCluster : ft),
                        };
                        setSelectedCategory(updatedCategory);
                        setSelectedCluster(updatedCluster);
                    }
                }
            }
        } catch (err: any) {
            window.alert(err.message || 'הפעולה נכשלה');
        }
    };

    const handleDelete = async (type: EntityType, id?: string, name?: string) => {
        if (!id) {
            window.alert('נדרש מזהה למחיקה');
            return;
        }
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את "${name || 'הפריט'}"?`)) return;
        try {
            const endpoint = type === 'category' ? 'categories' : type === 'cluster' ? 'clusters' : 'roles';
            const response = await fetch(`${apiBase}/api/job-fields/${endpoint}/${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('המחיקה נכשלה');

            if (type === 'category') {
                setData(prev => prev.filter(cat => cat.id !== id));
                if (selectedCategory?.id === id) {
                    setSelectedCategory(null);
                    setSelectedCluster(null);
                }
            } else if (type === 'cluster') {
                const categoryWithCluster = data.find(cat => cat.fieldTypes.some(ft => ft.id === id));
                setData(prev => prev.map(cat => ({
                    ...cat,
                    fieldTypes: cat.fieldTypes.filter(ft => ft.id !== id),
                })));
                if (selectedCluster?.id === id) {
                    setSelectedCluster(null);
                }
                if (categoryWithCluster && selectedCategory?.id === categoryWithCluster.id) {
                    setSelectedCategory(prev => prev ? {
                        ...prev,
                        fieldTypes: prev.fieldTypes.filter(ft => ft.id !== id),
                    } : prev);
                }
            } else if (type === 'role') {
                const categoryWithRole = data.find(cat => cat.fieldTypes.some(ft => ft.roles.some(r => r.id === id)));
                const clusterWithRole = categoryWithRole?.fieldTypes.find(ft => ft.roles.some(r => r.id === id));
                setData(prev => prev.map(cat => ({
                    ...cat,
                    fieldTypes: cat.fieldTypes.map(ft => ({
                        ...ft,
                        roles: ft.id === clusterWithRole?.id ? ft.roles.filter(r => r.id !== id) : ft.roles,
                    })),
                })));
                if (selectedCluster?.id === clusterWithRole?.id) {
                    setSelectedCluster(prev => prev ? {
                        ...prev,
                        roles: prev.roles.filter(r => r.id !== id),
                    } : prev);
                }
                if (selectedCategory?.id === categoryWithRole?.id && selectedCluster?.id === clusterWithRole?.id) {
                    setSelectedCategory(prev => prev ? {
                        ...prev,
                        fieldTypes: prev.fieldTypes.map(ft => ft.id === clusterWithRole?.id ? {
                            ...ft,
                            roles: ft.roles.filter(r => r.id !== id),
                        } : ft),
                    } : prev);
                }
            }
        } catch (err: any) {
            window.alert(err.message || 'המחיקה נכשלה');
        }
    };

    const handleAiSuggestClusters = async () => {
        if (!selectedCategory?.id) return;
        setAiLoading('cluster');
        try {
            const response = await fetch(`${apiBase}/api/job-fields/ai/suggest-clusters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: selectedCategory.id, previewOnly: false }),
            });
            if (!response.ok) throw new Error('הצעת קלאסטרים נכשלה');
            const payload = await response.json();
            const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
            if (!suggestions.length) {
                window.alert('לא נמצאו קלאסטרים חדשים');
                return;
            }
            const normalized = suggestions.map(normalizeCluster);
            const updatedCategory = {
                ...selectedCategory,
                fieldTypes: [...selectedCategory.fieldTypes, ...normalized],
            };
            setData(prev => prev.map(cat => cat.id === selectedCategory.id ? updatedCategory : cat));
            setSelectedCategory(updatedCategory);
            setSelectedCluster(normalized[0] ?? null);
        } catch (err: any) {
            window.alert(err.message || 'הצעת קלאסטרים נכשלה');
        } finally {
            setAiLoading(null);
        }
    };

    const handleAiSuggestRoles = async () => {
        if (!selectedCategory?.id || !selectedCluster?.id) return;
        setAiLoading('role');
        try {
            const response = await fetch(`${apiBase}/api/job-fields/ai/suggest-roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clusterId: selectedCluster.id, previewOnly: false }),
            });
            if (!response.ok) throw new Error('הצעת תפקידים נכשלה');
            const payload = await response.json();
            const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
            if (!suggestions.length) {
                window.alert('לא נמצאו תפקידים חדשים');
                return;
            }
            const normalized = suggestions.map(normalizeRole);
            const updatedCluster = { ...selectedCluster, roles: [...selectedCluster.roles, ...normalized] };
            const updatedCategory = selectedCategory ? {
                ...selectedCategory,
                fieldTypes: selectedCategory.fieldTypes.map(ft => ft.id === selectedCluster.id ? updatedCluster : ft),
            } : null;
            if (updatedCategory) {
                setData(prev => prev.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat));
                setSelectedCategory(updatedCategory);
            }
            setSelectedCluster(updatedCluster);
        } catch (err: any) {
            window.alert(err.message || 'הצעת תפקידים נכשלה');
        } finally {
            setAiLoading(null);
        }
    };

    // --- FILTERED DATA ---
    const filteredCategories = useMemo(() => 
        data.filter(c => c.name.toLowerCase().includes(searchCategory.toLowerCase())),
    [data, searchCategory]);

    const filteredClusters = useMemo(() => {
        if (!selectedCategory) return [];
        return selectedCategory.fieldTypes.filter(c => c.name.toLowerCase().includes(searchCluster.toLowerCase()));
    }, [selectedCategory, searchCluster]);

    const filteredRoles = useMemo(() => {
        if (!selectedCluster) return [];
        return selectedCluster.roles.filter(r => 
            r.value.toLowerCase().includes(searchRole.toLowerCase()) ||
            r.synonyms.some(s => s.toLowerCase().includes(searchRole.toLowerCase()))
        );
    }, [selectedCluster, searchRole]);

    const clusterDisplayCount = filteredClusters.length || (aiLoading === 'cluster' ? 1 : 0);
    const roleDisplayCount = filteredRoles.length || (aiLoading === 'role' ? 1 : 0);


    // --- RENDER ---
    return (
        <div className="flex flex-col h-full bg-bg-subtle/30 -m-6 p-6 relative">
            
            {/* Header */}
            {fetchError && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm">
                    {fetchError}
                </div>
            )}
            {isLoading && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-primary-50 border border-primary-100 text-primary-700 text-sm">
                    טוען קטגוריות מהשרת...
                </div>
            )}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-text-default flex items-center gap-3">
                        <Squares2X2Icon className="w-8 h-8 text-primary-500" />
                        ניהול טקסונומיה (תחומי משרה)
                    </h1>
                    <p className="text-text-muted mt-2 max-w-3xl leading-relaxed">
                        מבנה היררכי 3-שכבתי: 
                        <span className="font-bold text-primary-700 mx-1">קטגוריה</span> &gt; 
                        <span className="font-bold text-primary-700 mx-1">קלאסטר (תת-תחום)</span> &gt; 
                        <span className="font-bold text-primary-700 mx-1">תפקיד</span>.
                        <br/>
                        <span className="text-xs">
                        * המערכת משתמשת בקלאסטרים לחיפוש סמנטי והרחבת תוצאות ("Matching חכם"). לדוגמה: חיפוש "מזכירה" ימצא גם "פקידת קבלה" כי הן באותו קלאסטר.
                        </span>
                    </p>
                </div>
                <div className="flex gap-3">
                     <button 
                        className="flex items-center gap-2 bg-white border border-border-default text-text-default font-bold py-2 px-4 rounded-xl shadow-sm hover:bg-bg-subtle transition"
                        title="מחיקת תפקידים כפולים וסידור ההיררכיה באופן אוטומטי (סימולציה)"
                     >
                        <NoSymbolIcon className="w-4 h-4 text-red-500"/>
                        נקה זבל
                    </button>
                    <button 
                        className="flex items-center gap-2 bg-purple-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-purple-700 shadow-md transition"
                        title="עדכון רשימת התפקידים והמילים הנרדפות על בסיס מגמות שוק (סימולציה)"
                    >
                        <SparklesIcon className="w-4 h-4"/>
                        סנכרן עם AI
                    </button>
                </div>
            </div>

            {/* Main Columns Container */}
            <div className="flex-grow flex gap-0 h-[65vh] rounded-2xl shadow-lg border border-border-default bg-white overflow-hidden">
                
                {/* COLUMN 1: CATEGORIES */}
                <div className="w-1/3 min-w-[300px]">
                    <AdminColumn
                        title="1. קטגוריות (Categories)"
                        subtitle="תחום על (למשל: הייטק, כספים)"
                        icon={<FolderIcon className="w-5 h-5 text-blue-500"/>}
                        onAdd={() => openAddModal('category')}
                        searchTerm={searchCategory}
                        onSearchChange={setSearchCategory}
                        count={filteredCategories.length}
                        emptyStateText="לא נמצאו קטגוריות"
                    >
                        {filteredCategories.map(cat => (
                            <ListItem 
                                key={cat.id || cat.name}
                                title={cat.name}
                                subtitle={`${cat.fieldTypes.length} קלאסטרים`}
                                isSelected={selectedCategory?.id === cat.id}
                                onClick={() => handleSelectCategory(cat)}
                                onEdit={() => openEditModal('category', cat.id, cat.name)}
                                onDelete={() => handleDelete('category', cat.id, cat.name)}
                                status="active"
                            />
                        ))}
                    </AdminColumn>
                </div>

                {/* COLUMN 2: CLUSTERS (DOMAINS) */}
                <div className="w-1/3 min-w-[300px]">
                    <AdminColumn
                        title={`2. קלאסטרים (Clusters)`}
                        subtitle="קבוצות תפקידים סמנטיות"
                        icon={<ListBulletIcon className="w-5 h-5 text-orange-500"/>}
                        onAdd={() => openAddModal('cluster')}
                        searchTerm={searchCluster}
                        onSearchChange={setSearchCluster}
                        count={clusterDisplayCount}
                        aiAction={handleAiSuggestClusters}
                        aiTooltip={aiLoading === 'cluster' ? 'חושב...' : 'הצע קלאסטרים חסרים (AI)'}
                        emptyStateText={selectedCategory ? "אין קלאסטרים בקטגוריה זו. צור חדש או השתמש ב-AI." : "בחר קטגוריה לצפייה"}
                        isActive={!!selectedCategory}
                    >
                        {aiLoading === 'cluster' && <div className="p-4 text-center text-xs text-purple-600 animate-pulse">🤖 AI מנתח את הקטגוריה ובונה קלאסטרים...</div>}
                        {filteredClusters.map(cluster => (
                            <ListItem 
                                key={cluster.id || cluster.name}
                                title={cluster.name}
                                subtitle={`${cluster.roles.length} תפקידים`}
                                isSelected={selectedCluster?.id === cluster.id}
                                onClick={() => handleSelectCluster(cluster)}
                                onEdit={() => openEditModal('cluster', cluster.id, cluster.name)}
                                onDelete={() => handleDelete('cluster', cluster.id, cluster.name)}
                                status="active"
                            />
                        ))}
                    </AdminColumn>
                </div>

                {/* COLUMN 3: ROLES (TAGS) */}
                <div className="w-1/3 min-w-[300px]">
                    <AdminColumn
                        title={`3. תפקידים (Roles)`}
                        subtitle="טייטלים ספציפיים לחיפוש"
                        icon={<TagIcon className="w-5 h-5 text-green-500"/>}
                        onAdd={() => openAddModal('role')}
                        searchTerm={searchRole}
                        onSearchChange={setSearchRole}
                        count={roleDisplayCount}
                        aiAction={handleAiSuggestRoles}
                        aiTooltip={aiLoading === 'role' ? 'חושב...' : 'השלם תפקידים חסרים לקלאסטר (AI)'}
                        emptyStateText={selectedCluster ? "אין תפקידים בקלאסטר זה. צור ידנית או השתמש ב-AI." : "בחר קלאסטר לצפייה"}
                        isActive={!!selectedCluster}
                    >
                        {aiLoading === 'role' && <div className="p-4 text-center text-xs text-purple-600 animate-pulse">🤖 AI סורק את השוק ומוסיף תפקידים רלוונטיים...</div>}
                        {filteredRoles.map(role => (
                        <ListItem 
                            key={role.id || role.value}
                            title={role.value}
                            subtitle={
                                role.tags && role.tags.length > 0
                                    ? role.tags.map(tag => tag.label).join(', ')
                                    : role.synonyms.length > 0
                                        ? role.synonyms.join(', ')
                                        : 'ללא תגיות'
                            }
                            isSelected={false}
                            onClick={() => {}}
                            onEdit={() => openEditModal('role', role.id, role.value, role.synonyms, role.tags)}
                            onDelete={() => handleDelete('role', role.id, role.value)}
                            status="active"
                            badgeCount={role.tags && role.tags.length > 0 ? role.tags.length : undefined}
                        />
                        ))}
                    </AdminColumn>
                </div>

            </div>

             {/* Footer Info */}
             <div className="mt-4 flex items-center justify-between text-xs text-text-muted px-2">
                <div className="flex gap-4">
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500"></div> פעיל (Active)</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> טיוטה (Draft)</span>
                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> לא בשימוש (Deprecated)</span>
                </div>
                <div className="font-mono">
                    System Taxonomy v2.4.2 (Live Mock)
                </div>
             </div>
             
             {/* Edit/Add Modal */}
            <TaxonomyModal 
               isOpen={modalState.isOpen}
               onClose={() => setModalState(prev => ({...prev, isOpen: false}))}
               onSave={handleModalSave}
               type={modalState.type}
               mode={modalState.mode}
               initialValue={modalState.initialValue}
               initialTags={modalState.initialTags}
               availableTags={availableTags}
               onTagCreated={handleTagCreated}
               targetId={modalState.targetId}
               apiBase={apiBase}
             />

             {/* Hiro AI Floating Button */}
             <div className="fixed bottom-8 left-8 z-40">
                <button
                    onClick={handleOpenChat}
                    className="w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-primary-700 transition-all transform hover:scale-110 hover:rotate-3 group"
                    title="התייעץ עם Hiro AI על מבנה הטקסונומיה"
                >
                    <SparklesIcon className="w-7 h-7 group-hover:animate-pulse" />
                </button>
            </div>
            
            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                isLoading={isChatLoading}
                error={chatError}
                onSendMessage={handleSendMessage}
                onReset={() => { setChatSession(null); setChatMessages([]); initializeChat(); }}
                chatType="job-fields"
                onProfileUpdate={applyJobFieldSuggestions}
                contextData={jobFieldsContext}
            />
        </div>
    );
};

export default AdminJobFieldsView;
