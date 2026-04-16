
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon, ChevronLeftIcon, BriefcaseIcon, TagIcon } from './Icons';

export interface SelectedJobField {
    category: string;
    fieldType: string;
    role: string;
}

type JobRoleTag = {
    id: string | number;
    tagKey: string;
    displayNameHe?: string | null;
    displayNameEn?: string | null;
};

type JobRole = { id: string | number; value: string; synonyms?: string[]; tags?: JobRoleTag[] };
type JobFieldType = { id: string | number; name: string; roles: JobRole[] };
type JobCategory = { id: string | number; name: string; fieldTypes: JobFieldType[] };

interface JobFieldSelectorProps {
    value?: SelectedJobField | null;
    onChange: (value: SelectedJobField | null) => void;
    isModalOpen: boolean;
    setIsModalOpen: (isOpen: boolean) => void;
}

const JobFieldSelector: React.FC<JobFieldSelectorProps> = ({ value, onChange, isModalOpen, setIsModalOpen }) => {
    const [selectedCategory, setSelectedCategory] = useState<JobCategory | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categories, setCategories] = useState<JobCategory[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    useEffect(() => {
        const fetchJobFields = async () => {
            if (!isModalOpen) return;
            setIsLoading(true);
            setError(null);
            try {
                const apiBase = import.meta.env.VITE_API_BASE || '';
                const res = await fetch(`${apiBase}/api/job-fields`, { headers: { ...authHeaders() } });
                if (!res.ok) throw new Error('Failed to load job fields');
                const data = await res.json();
                if (Array.isArray(data)) {
                    setCategories(data);
                    if (!selectedCategory && data.length) setSelectedCategory(data[0]);
                } else {
                    setCategories([]);
                }
            } catch (err: any) {
                setError(err.message || 'שגיאה בטעינת תחומים');
                setCategories([]);
            } finally {
                setIsLoading(false);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
        };
        fetchJobFields();
    }, [isModalOpen]);

    useEffect(() => {
        if (!isModalOpen || !categories.length) return;
        const name = String(value?.category || '').trim();
        if (!name) return;
        const match = categories.find(
            (c) => c.name === name || String(c.name).toLowerCase() === name.toLowerCase(),
        );
        if (match) setSelectedCategory(match);
    }, [isModalOpen, value?.category, categories]);

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [setIsModalOpen]);

    const handleSelectCategory = (category: JobCategory) => {
        setSelectedCategory(category);
    };
    
    const resetState = () => {
        setSearchTerm('');
        if (!selectedCategory && categories.length) setSelectedCategory(categories[0]);
    };

    const handleSelectRole = (role: JobRole, fieldType: JobFieldType, categoryName?: string) => {
        const catName = categoryName || selectedCategory?.name;
        if (catName) {
            onChange({
                category: catName,
                fieldType: fieldType.name,
                role: role.value,
            });
            setIsModalOpen(false);
            resetState();
        }
    };
    
    const handleCloseModal = () => {
        setIsModalOpen(false);
        resetState();
    }

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const results: { category: JobCategory; fieldType: JobFieldType; role: JobRole }[] = [];
        const lowerCaseSearch = searchTerm.toLowerCase();

        categories.forEach(category => {
            category.fieldTypes.forEach(fieldType => {
                fieldType.roles.forEach(role => {
                    const tagTexts =
                        role.tags?.flatMap(t => [
                            t.tagKey,
                            t.displayNameHe || '',
                            t.displayNameEn || '',
                        ]) || [];

                    const searchableText = [
                        category.name,
                        fieldType.name,
                        role.value,
                        ...(role.synonyms || []),
                        ...tagTexts,
                    ]
                        .join(' ')
                        .toLowerCase();

                    if (searchableText.includes(lowerCaseSearch)) {
                        results.push({ category, fieldType, role });
                    }
                });
            });
        });
        return results;
    }, [searchTerm, categories]);

    const searchResultsByCategory = useMemo(() => {
        const map = new Map<string, { category: JobCategory; fieldType: JobFieldType; role: JobRole }[]>();
        searchResults.forEach((item) => {
            const key = item.category.name;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(item);
        });
        return Array.from(map.entries());
    }, [searchResults]);

    if (!isModalOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-opacity" onClick={handleCloseModal}>
            <div 
                ref={modalRef}
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden text-text-default animate-fade-in border border-border-default" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header & Search - More compact */}
                <header className="flex flex-col border-b border-border-default bg-bg-card z-10 shrink-0">
                    <div className="flex items-center justify-between px-5 py-3">
                        <h2 className="text-lg font-bold text-text-default">בחר תחום משרה</h2>
                        <button onClick={handleCloseModal} className="p-1.5 rounded-full text-text-muted hover:bg-bg-subtle hover:text-text-default transition-colors"><XMarkIcon className="w-5 h-5" /></button>
                    </div>
                    <div className="px-5 pb-4">
                        <div className="relative group">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 group-focus-within:text-primary-500 transition-colors" />
                            <input 
                                ref={searchInputRef}
                                type="text" 
                                placeholder="הקלד תפקיד לחיפוש מהיר..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-subtle/50 border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none" 
                            />
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-hidden flex bg-bg-card">
                    {searchTerm.trim() ? (
                        // Search Results View
                        <div className="w-full overflow-y-auto p-2 custom-scrollbar">
                            {searchResults.length > 0 ? (
                                <div className="space-y-6">
                                    <p className="text-xs font-semibold text-text-muted px-1">תוצאות חיפוש ({searchResults.length}):</p>
                                    {searchResultsByCategory.map(([categoryName, items]) => (
                                        <div key={categoryName} className="animate-fade-in">
                                            <h3 className="text-sm font-bold text-primary-700 bg-primary-50/60 px-3 py-1.5 rounded-lg mb-3 inline-block border border-primary-100/50">
                                                {categoryName}
                                            </h3>
                                            <div className="grid grid-cols-1 gap-2">
                                                {items.map(({ category, fieldType, role }) => (
                                                    <button
                                                        key={`${role.id}-${fieldType.id}`}
                                                        type="button"
                                            onClick={() => handleSelectRole(role, fieldType, category.name)}
                                            className="w-full text-right p-3 rounded-lg hover:bg-white hover:shadow-sm hover:border-primary-200 border border-transparent bg-bg-subtle/30 transition-all flex items-center gap-3 group"
                                        >
                                            <div className="p-2 bg-white rounded-full text-text-subtle group-hover:text-primary-600 shadow-sm transition-colors border border-border-subtle">
                                                <BriefcaseIcon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0 text-right">
                                                <p className="font-bold text-sm text-text-default group-hover:text-primary-900 truncate">{role.value}</p>
                                                {role.tags && role.tags.length > 0 && (
                                                                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                                                                    <div className="flex items-center gap-1 text-xs text-text-subtle/80 ml-1">
                                                                        <TagIcon className="w-3 h-3" />
                                                                        <span className="font-medium">תגיות:</span>
                                                                    </div>
                                                                    {role.tags.map((t) => (
                                                                        <span
                                                                            key={t.id}
                                                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-primary-50 text-primary-700 border border-primary-100/50"
                                                                        >
                                                                            {t.displayNameHe || t.displayNameEn || t.tagKey}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-xs text-text-muted mt-1 flex items-center gap-1 truncate opacity-80">
                                                                <span className="text-primary-600/80 font-medium">{fieldType.name}</span>
                                                            </p>
                                            </div>
                                        </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-text-muted pb-10">
                                    <div className="w-16 h-16 bg-bg-subtle rounded-full flex items-center justify-center mb-3">
                                        <MagnifyingGlassIcon className="w-8 h-8 opacity-40" />
                                    </div>
                                    <p className="text-sm font-medium">לא נמצאו תוצאות עבור "{searchTerm}"</p>
                                    <p className="text-xs mt-1 text-text-subtle">נסה לחפש מונח כללי יותר</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        // Split View: Categories (Sidebar) + Roles (Content)
                        <>
                            {/* Sidebar: Categories */}
                            <div className="w-[35%] bg-bg-subtle/40 border-l border-border-default overflow-y-auto custom-scrollbar py-3 px-2 flex flex-col gap-1">
                                <p className="px-3 py-1 text-[11px] font-bold text-text-subtle uppercase tracking-wider mb-1">קטגוריות</p>
                                {isLoading ? (
                                    <div className="text-center text-text-muted py-4">טוען...</div>
                                ) : error ? (
                                    <div className="text-center text-red-500 text-sm py-4">{error}</div>
                                ) : categories.length ? categories.map(category => (
                                    <button 
                                        key={category.name} 
                                        onClick={() => handleSelectCategory(category)} 
                                        className={`w-full text-right px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex justify-between items-center group ${
                                            selectedCategory?.name === category.name 
                                                ? 'bg-white text-primary-700 shadow-sm border border-border-subtle' 
                                                : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'
                                        }`}
                                    >
                                        <span className="truncate">{category.name}</span>
                                        {selectedCategory?.name === category.name && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary-500 shadow-sm"></div>
                                        )}
                                    </button>
                                )) : (
                                    <div className="text-center text-text-muted py-4">אין קטגוריות</div>
                                )}
                            </div>
                            
                            {/* Main Content: Roles */}
                            <div className="w-[65%] overflow-y-auto custom-scrollbar bg-bg-card flex flex-col">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                                        <span>טוען תפקידים...</span>
                                    </div>
                                ) : error ? (
                                    <div className="flex flex-col items-center justify-center h-full text-red-500 text-sm">
                                        {error}
                                    </div>
                                ) : selectedCategory ? (
                                    <div className="p-5 pb-8 space-y-6">
                                        <div className="flex items-baseline justify-between border-b border-border-subtle pb-3 sticky top-0 bg-bg-card/95 backdrop-blur-sm z-10">
                                                <h3 className="font-bold text-text-default text-lg leading-tight">{selectedCategory.name}</h3>
                                                <span className="text-xs font-medium text-text-muted bg-bg-subtle px-2 py-0.5 rounded-full whitespace-nowrap">
                                                {selectedCategory.fieldTypes.reduce((acc, ft) => acc + ft.roles.length, 0)} תפקידים
                                                </span>
                                        </div>
                                        
                                        {selectedCategory.fieldTypes.map(fieldType => {
                                            // Redundancy Logic: If only 1 role and name matches sub-category, hide sub-header
                                            const isRedundant = fieldType.roles.length === 1 && fieldType.name === fieldType.roles[0].value;
                                            
                                            return (
                                                <div key={fieldType.name} className="animate-fade-in">
                                                    {!isRedundant && (
                                                        <h4 className="text-[11px] font-bold text-primary-600/80 uppercase tracking-wide mb-2 flex items-center gap-2">
                                                            {fieldType.name}
                                                            <div className="h-px bg-primary-50 flex-grow"></div>
                                                        </h4>
                                                    )}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        {fieldType.roles.map(role => (
                                                            <button 
                                                                key={role.value} 
                                                                onClick={() => handleSelectRole(role, fieldType)} 
                                                                className="text-right px-3 py-2.5 rounded-lg text-sm text-text-default hover:bg-primary-50 hover:text-primary-700 transition-all border border-border-subtle hover:border-primary-200 hover:shadow-sm truncate bg-white"
                                                                title={role.value}
                                                            >
                                                                {role.value}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-text-muted">
                                        <BriefcaseIcon className="w-12 h-12 opacity-20 mb-2" />
                                        <span>בחר קטגוריה לצפייה בתפקידים</span>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </main>
                
                {/* Footer Hint */}
                {!searchTerm && (
                    <footer className="py-2.5 px-4 bg-bg-subtle/30 border-t border-border-default text-xs text-text-subtle text-center">
                        טיפ: ניתן להשתמש בחיפוש למעלה כדי למצוא תפקיד ספציפי במהירות
                    </footer>
                )}
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.99); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
        </div>,
        document.body
    );
};

export default JobFieldSelector;
