
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon, MagnifyingGlassIcon, 
    SparklesIcon, ListBulletIcon, FolderIcon, TagIcon, NoSymbolIcon, Squares2X2Icon, XMarkIcon
} from './Icons';
import HiroAIChat from './HiroAIChat';

// Helper types for UI state
type Status = 'active' | 'draft' | 'deprecated';
type ModalMode = 'add' | 'edit';
type EntityType = 'category' | 'cluster' | 'role';

type JobRole = { id: string; value: string; synonyms: string[]; };
type JobFieldType = { id: string; name: string; roles: JobRole[]; };
type JobCategory = { id: string; name: string; fieldTypes: JobFieldType[]; };

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
    loadingBanner?: React.ReactNode;
}

const AdminColumn: React.FC<AdminColumnProps> = ({ 
    title, subtitle, icon, children, onAdd, searchTerm, onSearchChange, count, aiAction, aiTooltip, emptyStateText, isActive = true, loadingBanner
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
            {loadingBanner}
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
    onSave: (value: string, synonyms?: string[]) => void;
    initialValue: string;
    initialSynonyms?: string[];
    type: EntityType;
    mode: ModalMode;
}

const TaxonomyModal: React.FC<TaxonomyModalProps> = ({ isOpen, onClose, onSave, initialValue, initialSynonyms = [], type, mode }) => {
    const [value, setValue] = useState(initialValue);
    const [synonyms, setSynonyms] = useState<string[]>(initialSynonyms);
    const [synonymInput, setSynonymInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            setSynonyms(initialSynonyms);
            setSynonymInput('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, initialValue, initialSynonyms]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSave(value, synonyms);
        onClose();
    };

    const handleAddSynonym = () => {
        if (synonymInput.trim() && !synonyms.includes(synonymInput.trim())) {
            setSynonyms([...synonyms, synonymInput.trim()]);
            setSynonymInput('');
        }
    };

    const handleKeyDownSynonym = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddSynonym();
        }
    };

    const removeSynonym = (tag: string) => {
        setSynonyms(synonyms.filter(s => s !== tag));
    };

    const titles = {
        category: { add: 'הוספת קטגוריה', edit: 'עריכת קטגוריה' },
        cluster: { add: 'הוספת קלאסטר', edit: 'עריכת קלאסטר' },
        role: { add: 'הוספת תפקיד', edit: 'עריכת תפקיד' }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-xl border border-border-default w-full max-w-lg overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                    <h3 className="font-bold text-lg text-text-default">{titles[type][mode]}</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover"><XMarkIcon className="w-5 h-5"/></button>
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
                            onChange={e => setValue(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-base focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                            placeholder="הקלד שם..."
                        />
                    </div>

                    {type === 'role' && (
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-text-muted mb-2">
                                טייטלים ספציפיים לחיפוש (מילים נרדפות)
                            </label>
                            <div className="flex gap-2 mb-3">
                                <input 
                                    type="text" 
                                    value={synonymInput}
                                    onChange={e => setSynonymInput(e.target.value)}
                                    onKeyDown={handleKeyDownSynonym}
                                    className="flex-1 bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                    placeholder="הוסף מילה נרדפת ולחץ אנטר..."
                                />
                                <button 
                                    type="button" 
                                    onClick={handleAddSynonym}
                                    className="bg-bg-subtle border border-border-default hover:bg-bg-hover text-text-default px-3 py-2 rounded-lg text-sm font-semibold"
                                >
                                    הוסף
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-bg-subtle/30 rounded-xl border border-border-default/50">
                                {synonyms.length === 0 && <span className="text-xs text-text-subtle italic">אין מילים נרדפות</span>}
                                {synonyms.map(syn => (
                                    <span key={syn} className="flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded-md text-xs font-medium text-text-default shadow-sm animate-fade-in">
                                        {syn}
                                        <button type="button" onClick={() => removeSynonym(syn)} className="hover:text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2 border-t border-border-default mt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                        <button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all">
                            {mode === 'add' ? 'הוסף' : 'שמור שינויים'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AdminJobFieldsView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    // --- STATE ---
    const [data, setData] = useState<JobCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Selection
    const [selectedCategory, setSelectedCategory] = useState<JobCategory | null>(null);
    const [selectedCluster, setSelectedCluster] = useState<JobFieldType | null>(null); 
    
    // Search
    const [searchCategory, setSearchCategory] = useState('');
    const [searchCluster, setSearchCluster] = useState('');
    const [searchRole, setSearchRole] = useState('');
    
    // UI Feedback
    const [aiLoading, setAiLoading] = useState<string | null>(null);

    // Modal State
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        type: EntityType;
        mode: ModalMode;
        initialValue: string;
        initialSynonyms?: string[];
        targetId?: string; // used for identifying what to edit/delete (using name as ID here for simplicity)
    }>({
        isOpen: false,
        type: 'category',
        mode: 'add',
        initialValue: ''
    });

    // AI suggestion modal state (clusters)
    const [clusterSuggestions, setClusterSuggestions] = useState<{ name: string; selected: boolean }[]>([]);
    const [isClusterSuggestModalOpen, setIsClusterSuggestModalOpen] = useState(false);
    // AI suggestion modal state (roles)
    const [roleSuggestions, setRoleSuggestions] = useState<{ value: string; synonyms: string[]; selected: boolean }[]>([]);
    const [isRoleSuggestModalOpen, setIsRoleSuggestModalOpen] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // --- LOAD DATA ---
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/api/job-fields`);
                if (!res.ok) throw new Error('טעינת טקסונומיה נכשלה');
                const json = await res.json();
                setData(json);
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינה');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [apiBase]);

    const refetch = async () => {
        try {
            const res = await fetch(`${apiBase}/api/job-fields`);
            if (res.ok) {
                const json = await res.json();
                setData(json);
                return json as JobCategory[];
            }
        } catch {
            // ignore
        }
        return null;
    };

    const reselectByIds = (categoryId?: string, clusterId?: string, sourceData?: JobCategory[]) => {
        if (!categoryId) return;
        const pool = sourceData || data;
        const cat = pool.find(c => c.id === categoryId);
        if (cat) {
            setSelectedCategory(cat);
            if (clusterId) {
                const cl = cat.fieldTypes.find(cl => cl.id === clusterId);
                if (cl) setSelectedCluster(cl);
            }
        }
    };

    // --- HANDLERS ---
    const handleSelectCategory = (category: JobCategory) => {
        if (selectedCategory?.id === category.id) return;
        setSelectedCategory(category);
        setSelectedCluster(null); // Reset lower levels
    };

    const handleSelectCluster = (cluster: JobFieldType) => {
        setSelectedCluster(cluster);
    };

    // --- MODAL TRIGGERS ---
    const openAddModal = (type: EntityType) => {
        setModalState({ isOpen: true, type, mode: 'add', initialValue: '', initialSynonyms: [] });
    };

    const openEditModal = (type: EntityType, displayName: string, currentSynonyms?: string[], id?: string) => {
        setModalState({ 
            isOpen: true, 
            type, 
            mode: 'edit', 
            initialValue: displayName, 
            initialSynonyms: currentSynonyms || [],
            targetId: id || displayName 
        });
    };

    // --- CRUD OPERATIONS ---
    const handleModalSave = async (value: string, synonyms: string[] = []) => {
        const { type, mode, targetId } = modalState;
        try {
            if (mode === 'add') {
                if (type === 'category') {
                    const res = await fetch(`${apiBase}/api/job-fields/categories`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: value }),
                    });
                    const created = await res.json();
                    if (res.ok) {
                        setData(prev => [...prev, { id: created.id, name: created.name, fieldTypes: [] }]);
                        return;
                    }
                    throw new Error(created.message || 'יצירה נכשלה');
                } else if (type === 'cluster' && selectedCategory) {
                    const res = await fetch(`${apiBase}/api/job-fields/clusters`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ categoryId: selectedCategory.id, name: value }),
                    });
                    const created = await res.json();
                    if (res.ok) {
                        const newCluster = { id: created.id, name: created.name, roles: [] };
                        setData(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, fieldTypes: [...c.fieldTypes, newCluster] } : c));
                        setSelectedCategory(prev => prev ? { ...prev, fieldTypes: [...prev.fieldTypes, newCluster] } : prev);
                        return;
                    }
                    throw new Error(created.message || 'יצירה נכשלה');
                } else if (type === 'role' && selectedCluster && selectedCategory) {
                    const res = await fetch(`${apiBase}/api/job-fields/roles`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clusterId: selectedCluster.id, value, synonyms }),
                    });
                    const created = await res.json();
                    if (res.ok) {
                        const newRole = { id: created.id, value: created.value, synonyms: created.synonyms || [] };
                        setData(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, fieldTypes: c.fieldTypes.map(cl => cl.id === selectedCluster.id ? { ...cl, roles: [...cl.roles, newRole] } : cl) } : c));
                        setSelectedCluster(prev => prev ? { ...prev, roles: [...prev.roles, newRole] } : prev);
                        const fresh = await refetch();
                        if (fresh) reselectByIds(selectedCategory.id, selectedCluster.id, fresh);
                        return;
                    }
                    throw new Error(created.message || 'יצירה נכשלה');
                }
            } else if (mode === 'edit' && targetId) {
                if (type === 'category') {
                    const res = await fetch(`${apiBase}/api/job-fields/categories/${targetId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: value }),
                    });
                    if (res.ok) {
                        setData(prev => prev.map(c => c.id === targetId ? { ...c, name: value } : c));
                        setSelectedCategory(prev => prev && prev.id === targetId ? { ...prev, name: value } : prev);
                        const fresh = await refetch();
                        if (fresh) reselectByIds(targetId, selectedCluster?.id, fresh);
                        return;
                    }
                    throw new Error('עדכון נכשלה');
                } else if (type === 'cluster') {
                    const res = await fetch(`${apiBase}/api/job-fields/clusters/${targetId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: value }),
                    });
                    if (res.ok) {
                        const fresh = await refetch();
                        if (fresh) reselectByIds(selectedCategory?.id, targetId, fresh);
                        return;
                    }
                    throw new Error('עדכון נכשלה');
                } else if (type === 'role') {
                    const res = await fetch(`${apiBase}/api/job-fields/roles/${targetId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ value, synonyms }),
                    });
                    if (res.ok && selectedCategory && selectedCluster) {
                        const fresh = await refetch();
                        if (fresh) reselectByIds(selectedCategory.id, selectedCluster.id, fresh);
                        return;
                    }
                    throw new Error('עדכון נכשלה');
                }
            }
            // Fallback full refresh if no branch matched
            await refetch();
        } catch (e: any) {
            console.error(e);
            alert(e.message || 'שמירה נכשלה');
        }
    };

    const handleDelete = async (type: EntityType, id: string, displayName: string) => {
        if (!window.confirm(`האם אתה בטוח שברצונך למחוק את "${displayName}"?`)) return;
        try {
            if (type === 'category') {
                await fetch(`${apiBase}/api/job-fields/categories/${id}`, { method: 'DELETE' });
                setData(prev => prev.filter(c => c.id !== id));
                if (selectedCategory?.id === id) {
                    setSelectedCategory(null);
                    setSelectedCluster(null);
                }
            } else if (type === 'cluster') {
                await fetch(`${apiBase}/api/job-fields/clusters/${id}`, { method: 'DELETE' });
                setData(prev => prev.map(c => ({
                    ...c,
                    fieldTypes: c.fieldTypes.filter(cl => cl.id !== id),
                })));
                if (selectedCategory) {
                    const updatedCategory = {
                        ...selectedCategory,
                        fieldTypes: selectedCategory.fieldTypes.filter(cl => cl.id !== id),
                    };
                    setSelectedCategory(updatedCategory);
                }
                if (selectedCluster?.id === id) setSelectedCluster(null);
            } else if (type === 'role' && selectedCategory && selectedCluster) {
                await fetch(`${apiBase}/api/job-fields/roles/${id}`, { method: 'DELETE' });
                const updatedCluster = {
                    ...selectedCluster,
                    roles: selectedCluster.roles.filter(r => r.id !== id),
                };
                const updatedCategory = {
                    ...selectedCategory,
                    fieldTypes: selectedCategory.fieldTypes.map(cl => cl.id === selectedCluster.id ? updatedCluster : cl),
                };
                setData(prev => prev.map(c => c.id === selectedCategory.id ? updatedCategory : c));
                setSelectedCluster(updatedCluster);
                setSelectedCategory(updatedCategory);
            }
        } catch (e) {
            console.error(e);
            alert('מחיקה נכשלה');
        }
    };

    // --- AI SIMULATION ---
    const handleAiSuggestClusters = async () => {
        if (!selectedCategory) return;
        setAiLoading('cluster');
        setAiError(null);
        try {
            const res = await fetch(`${apiBase}/api/job-fields/ai/suggest-clusters`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryId: selectedCategory.id }),
            });
            if (!res.ok) throw new Error('הצעה נכשלה');
            const data = await res.json();
            const suggestions = (data.suggestions || []).map((s: any) => ({ name: s.name, selected: true }));
            setClusterSuggestions(suggestions);
            setIsClusterSuggestModalOpen(true);
        } catch (e: any) {
            console.error(e);
            setAiError(e.message || 'הצעה נכשלה');
        } finally {
            setAiLoading(null);
        }
    };

    const handleAiSuggestRoles = async () => {
        if (!selectedCluster || !selectedCategory) return;
        setAiLoading('role');
        setAiError(null);
        try {
            const res = await fetch(`${apiBase}/api/job-fields/ai/suggest-roles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clusterId: selectedCluster.id }),
            });
            if (!res.ok) throw new Error('הצעה נכשלה');
            const data = await res.json();
            const suggestions = (data.suggestions || []).map((s: any) => ({
                value: s.value,
                synonyms: s.synonyms || [],
                selected: true,
            }));
            setRoleSuggestions(suggestions);
            setIsRoleSuggestModalOpen(true);
        } catch (e: any) {
            console.error(e);
            setAiError(e.message || 'הצעה נכשלה');
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


    // --- RENDER ---
    if (loading) {
        return (
            <div className="flex items-center justify-center h-full py-12">
                <div className="text-center text-text-muted">
                    טוען טקסונומיה...
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-bg-subtle/30 -m-6 p-6">
            
            {/* Header */}
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

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
                    {error}
                </div>
            )}

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
                                key={cat.id}
                                title={cat.name}
                                subtitle={`${cat.fieldTypes.length} קלאסטרים`}
                                isSelected={selectedCategory?.id === cat.id}
                                onClick={() => handleSelectCategory(cat)}
                                onEdit={() => openEditModal('category', cat.name, [], cat.id)}
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
                        count={filteredClusters.length}
                        aiAction={handleAiSuggestClusters}
                        aiTooltip={aiLoading === 'cluster' ? 'חושב...' : 'הצע קלאסטרים חסרים (AI)'}
                        emptyStateText={selectedCategory ? "אין קלאסטרים בקטגוריה זו. צור חדש או השתמש ב-AI." : "בחר קטגוריה לצפייה"}
                        isActive={!!selectedCategory}
                        loadingBanner={aiLoading === 'cluster' ? (
                            <div className="p-3 mb-2 rounded-lg border border-purple-100 bg-purple-50 text-xs text-purple-700 flex flex-col gap-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></span>
                                    <span>🤖 AI מנתח את הקטגוריה ובונה קלאסטרים...</span>
                                </div>
                                <div className="text-[11px] text-purple-600 animate-pulse">ממתין לתוצאות...</div>
                            </div>
                        ) : null}
                    >
                        {aiLoading === 'cluster' && (
                            <div className="p-3 mb-2 rounded-lg border border-purple-100 bg-purple-50 text-xs text-purple-700 flex items-center gap-2">
                                <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></span>
                                <span>🤖 AI מנתח את הקטגוריה ובונה קלאסטרים...</span>
                            </div>
                        )}
                        {aiLoading === 'cluster' && <div className="p-4 text-center text-xs text-purple-600 animate-pulse">🤖 AI מנתח את הקטגוריה ובונה קלאסטרים...</div>}
                        {filteredClusters.map(cluster => (
                            <ListItem 
                                key={cluster.id}
                                title={cluster.name}
                                subtitle={`${cluster.roles.length} תפקידים`}
                                isSelected={selectedCluster?.id === cluster.id}
                                onClick={() => handleSelectCluster(cluster)}
                                onEdit={() => openEditModal('cluster', cluster.name, [], cluster.id)}
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
                        count={filteredRoles.length}
                        aiAction={handleAiSuggestRoles}
                        aiTooltip={aiLoading === 'role' ? 'חושב...' : 'השלם תפקידים חסרים לקלאסטר (AI)'}
                        emptyStateText={selectedCluster ? "אין תפקידים בקלאסטר זה. צור ידנית או השתמש ב-AI." : "בחר קלאסטר לצפייה"}
                        isActive={!!selectedCluster}
                        loadingBanner={aiLoading === 'role' ? (
                            <div className="p-3 mb-2 rounded-lg border border-purple-100 bg-purple-50 text-xs text-purple-700 flex flex-col gap-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></span>
                                    <span>🤖 AI סורק את השוק ומוסיף תפקידים רלוונטיים...</span>
                                </div>
                                <div className="text-[11px] text-purple-600 animate-pulse">ממתין לתוצאות...</div>
                            </div>
                        ) : null}
                    >
                        {aiLoading === 'role' && (
                            <div className="p-3 mb-2 rounded-lg border border-purple-100 bg-purple-50 text-xs text-purple-700 flex flex-col gap-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></span>
                                    <span>🤖 AI סורק את השוק ומוסיף תפקידים רלוונטיים...</span>
                                </div>
                                <div className="text-[11px] text-purple-600 animate-pulse">ממתין לתוצאות...</div>
                            </div>
                        )}
                        {filteredRoles.map(role => (
                            <ListItem 
                                key={role.id}
                                title={role.value}
                                subtitle={role.synonyms.length > 0 ? role.synonyms.join(', ') : 'ללא מילים נרדפות'}
                                isSelected={false}
                                onClick={() => {}}
                                onEdit={() => openEditModal('role', role.value, role.synonyms, role.id)}
                                onDelete={() => handleDelete('role', role.id, role.value)}
                                status="active"
                                badgeCount={role.synonyms.length > 0 ? role.synonyms.length : undefined}
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
                initialSynonyms={modalState.initialSynonyms}
             />

            {/* Cluster suggestions modal */}
            {isClusterSuggestModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-border-default w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                            <div>
                                <h3 className="font-bold text-lg text-text-default">הצעות לקלאסטרים חדשים</h3>
                                <p className="text-sm text-text-muted">בחר אילו להוסיף לקטגוריה {selectedCategory?.name}</p>
                            </div>
                            <button onClick={() => setIsClusterSuggestModalOpen(false)} className="p-1 rounded-full text-text-muted hover:bg-bg-hover">
                                <XMarkIcon className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                            {clusterSuggestions.length === 0 && (
                                <div className="text-text-muted text-sm text-center py-6">אין הצעות חדשות</div>
                            )}
                            {clusterSuggestions.map((s, idx) => (
                                <label key={idx} className="flex items-center gap-3 p-3 border border-border-default rounded-lg hover:bg-bg-subtle/40 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={s.selected} 
                                        onChange={(e) => setClusterSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, selected: e.target.checked } : item))}
                                    />
                                    <span className="font-semibold text-text-default">{s.name}</span>
                                </label>
                            ))}
                            {aiError && <div className="text-sm text-red-600">{aiError}</div>}
                        </div>
                        <div className="flex justify-end gap-2 p-4 border-t border-border-default bg-bg-subtle/20">
                            <button 
                                onClick={() => setIsClusterSuggestModalOpen(false)} 
                                className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={async () => {
                                    if (!selectedCategory) return;
                                    const selected = clusterSuggestions.filter(s => s.selected);
                                    for (const s of selected) {
                                        const res = await fetch(`${apiBase}/api/job-fields/clusters`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ categoryId: selectedCategory.id, name: s.name }),
                                        });
                                        if (res.ok) {
                                            const created = await res.json();
                                            const newCluster = { id: created.id, name: created.name, roles: [] };
                                            setData(prev => prev.map(c => c.id === selectedCategory.id ? { ...c, fieldTypes: [...c.fieldTypes, newCluster] } : c));
                                            setSelectedCategory(prev => prev ? { ...prev, fieldTypes: [...prev.fieldTypes, newCluster] } : prev);
                                        }
                                    }
                                    setIsClusterSuggestModalOpen(false);
                                }} 
                                className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all disabled:opacity-60"
                                disabled={clusterSuggestions.every(s => !s.selected)}
                            >
                                הוסף נבחרים
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Role suggestions modal */}
            {isRoleSuggestModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl border border-border-default w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                            <div>
                                <h3 className="font-bold text-lg text-text-default">הצעות לתפקידים חדשים</h3>
                                <p className="text-sm text-text-muted">בחר אילו להוסיף לקלאסטר {selectedCluster?.name}</p>
                            </div>
                            <button onClick={() => setIsRoleSuggestModalOpen(false)} className="p-1 rounded-full text-text-muted hover:bg-bg-hover">
                                <XMarkIcon className="w-5 h-5"/>
                            </button>
                        </div>
                        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                            {roleSuggestions.length === 0 && (
                                <div className="text-text-muted text-sm text-center py-6">אין הצעות חדשות</div>
                            )}
                            {roleSuggestions.map((s, idx) => (
                                <label key={idx} className="flex items-start gap-3 p-3 border border-border-default rounded-lg hover:bg-bg-subtle/40 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={s.selected} 
                                        onChange={(e) => setRoleSuggestions(prev => prev.map((item, i) => i === idx ? { ...item, selected: e.target.checked } : item))}
                                    />
                                    <div className="flex flex-col gap-1">
                                        <span className="font-semibold text-text-default">{s.value}</span>
                                        {s.synonyms?.length > 0 && (
                                            <span className="text-xs text-text-muted">מילים נרדפות: {s.synonyms.join(', ')}</span>
                                        )}
                                    </div>
                                </label>
                            ))}
                            {aiError && <div className="text-sm text-red-600">{aiError}</div>}
                        </div>
                        <div className="flex justify-end gap-2 p-4 border-t border-border-default bg-bg-subtle/20">
                            <button 
                                onClick={() => setIsRoleSuggestModalOpen(false)} 
                                className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={async () => {
                                    if (!selectedCluster || !selectedCategory) return;
                                    const selected = roleSuggestions.filter(s => s.selected);
                                    for (const s of selected) {
                                        const res = await fetch(`${apiBase}/api/job-fields/roles`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ clusterId: selectedCluster.id, value: s.value, synonyms: s.synonyms || [] }),
                                        });
                                        if (res.ok) {
                                            const created = await res.json();
                                            const newRole = { id: created.id, value: created.value, synonyms: created.synonyms || [] };
                                            setData(prev => prev.map(c => c.id === selectedCategory.id ? {
                                                ...c,
                                                fieldTypes: c.fieldTypes.map(cl => cl.id === selectedCluster.id ? { ...cl, roles: [...cl.roles, newRole] } : cl),
                                            } : c));
                                            setSelectedCluster(prev => prev ? { ...prev, roles: [...prev.roles, newRole] } : prev);
                                        }
                                    }
                                    const fresh = await refetch();
                                    if (fresh) reselectByIds(selectedCategory.id, selectedCluster.id, fresh);
                                    setIsRoleSuggestModalOpen(false);
                                }} 
                                className="px-5 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all disabled:opacity-60"
                                disabled={roleSuggestions.every(s => !s.selected)}
                            >
                                הוסף נבחרים
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating AI consult button */}
            <div className="fixed bottom-8 left-8 z-40">
                <button
                    className="w-14 h-14 bg-primary-600 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-primary-700 transition-all transform hover:scale-110 hover:rotate-3 group"
                    title="התייעץ עם Hiro AI על מבנה הטקסונומיה"
                    onClick={() => setIsChatOpen(true)}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-7 h-7 group-hover:animate-pulse">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                </button>
            </div>

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                tagsText={data.map(c => `${c.name} (${c.fieldTypes.length} אשכולים, ${c.fieldTypes.reduce((acc, cl) => acc + (cl.roles?.length || 0), 0)} תפקידים)`).join(', ')}
                skipHistory
                initialMessage={`אני כאן כדי לעזור לך לנהל ולעדכן את עץ המשרות (הטקסונומיה) במסך הזה.\n\nמה אפשר לעשות כאן?\n1. להוסיף קטגוריה (תחום ראשי).\n2. להוסיף אשכול/קלאסטר בתוך קטגוריה.\n3. להוסיף תפקידים עם מילים נרדפות בתוך אשכול.\n4. להתייעץ היכן למקם תפקיד חדש כדי שהגיוס יהיה אפקטיבי.\n\nאיך מתחילים? ספר לי מה תרצה להוסיף. לדוגמה: "אני רוצה להוסיף את התפקיד מומחה SEO תחת שיווק דיגיטלי" או "צריך לפתוח קטגוריה חדשה לבנייה". מה תרצה לעשות עכשיו?`}
            />
        </div>
    );
};

export default AdminJobFieldsView;
