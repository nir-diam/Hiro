
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { jobFieldsData, JobCategory, JobFieldType, JobRole } from '../data/jobFieldsData';
import { XMarkIcon, MagnifyingGlassIcon, ChevronLeftIcon, BriefcaseIcon } from './Icons';

export interface SelectedJobField {
    category: string;
    fieldType: string;
    role: string;
}

interface JobFieldSelectorProps {
    value?: SelectedJobField | null;
    onChange: (value: SelectedJobField | null) => void;
    isModalOpen: boolean;
    setIsModalOpen: (isOpen: boolean) => void;
}

const JobFieldSelector: React.FC<JobFieldSelectorProps> = ({ onChange, isModalOpen, setIsModalOpen }) => {
    const [selectedCategory, setSelectedCategory] = useState<JobCategory | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const modalRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Set initial category if not set
    useEffect(() => {
        if (isModalOpen && !selectedCategory && !searchTerm) {
             setSelectedCategory(jobFieldsData[0]);
        }
        if (isModalOpen) {
            // Focus search on open
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isModalOpen]);

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
        if (!selectedCategory) setSelectedCategory(jobFieldsData[0]);
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

        jobFieldsData.forEach(category => {
            category.fieldTypes.forEach(fieldType => {
                fieldType.roles.forEach(role => {
                    const searchableText = [
                        category.name,
                        fieldType.name,
                        role.value,
                        ...role.synonyms,
                    ].join(' ').toLowerCase();

                    if (searchableText.includes(lowerCaseSearch)) {
                        results.push({ category, fieldType, role });
                    }
                });
            });
        });
        return results;
    }, [searchTerm]);

    return (
        <>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 transition-opacity" onClick={handleCloseModal}>
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
                                        <div className="space-y-1">
                                            <p className="text-xs font-semibold text-text-muted px-2 py-1 mb-1">תוצאות חיפוש ({searchResults.length}):</p>
                                            {searchResults.map(({ category, fieldType, role }, index) => (
                                                <button 
                                                    key={index}
                                                    onClick={() => handleSelectRole(role, fieldType, category.name)}
                                                    className="w-full text-right p-3 rounded-lg hover:bg-primary-50 hover:border-primary-100 border border-transparent transition-all flex items-center gap-3 group"
                                                >
                                                    <div className="p-2 bg-bg-subtle rounded-full text-text-subtle group-hover:bg-white group-hover:text-primary-600 transition-colors">
                                                        <BriefcaseIcon className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-sm text-text-default group-hover:text-primary-900 truncate">{role.value}</p>
                                                        <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1 truncate">
                                                            <span>{category.name}</span>
                                                            <ChevronLeftIcon className="w-3 h-3 text-text-subtle" />
                                                            <span>{fieldType.name}</span>
                                                        </p>
                                                    </div>
                                                </button>
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
                                        {jobFieldsData.map(category => (
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
                                        ))}
                                    </div>
                                    
                                    {/* Main Content: Roles */}
                                    <div className="w-[65%] overflow-y-auto custom-scrollbar bg-bg-card flex flex-col">
                                        {selectedCategory ? (
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
                </div>
            )}
        </>
    );
};

export default JobFieldSelector;
