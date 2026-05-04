import React, { useState, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, FolderIcon } from './Icons';
import { useSavedSearches } from '../context/SavedSearchesContext';

interface BulkAddToSavedSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (searchId: number) => void;
    selectedCount: number;
}

export default function BulkAddToSavedSearchModal({ isOpen, onClose, onSave, selectedCount }: BulkAddToSavedSearchModalProps) {
    const { savedSearches } = useSavedSearches();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSearch, setSelectedSearch] = useState<number | null>(null);

    const filteredSearches = useMemo(() => {
        return savedSearches.filter(s => 
            s.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, savedSearches]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/10 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in" onClick={onClose} dir="rtl">
            <div className="bg-bg-card flex flex-col max-h-[90vh] md:max-h-[85vh] rounded-3xl shadow-xl border border-border-subtle w-full max-w-[500px] animate-scale-in relative overflow-hidden" onClick={e => e.stopPropagation()}>
                
                <div className="relative p-4 md:p-6 border-b border-border-subtle flex items-center justify-between bg-bg-subtle/30">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="bg-primary-100 text-primary-700 w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-bold text-lg md:text-xl ring-4 ring-primary-50 shrink-0">
                            {selectedCount}
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-bold text-text-default leading-tight">הוספה לחיפוש שמור</h2>
                            <p className="text-xs md:text-sm text-text-subtle mt-1 text-primary-600/80 font-medium bg-primary-50 inline-block px-2 py-0.5 rounded-md leading-tight">בחר חיפוש כדי להוסיף אליו את המועמדים</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-text-muted hover:bg-bg-hover hover:text-text-default rounded-full transition-colors shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex flex-col h-full flex-1 overflow-hidden">
                    <div className="p-4 md:p-6 flex flex-col gap-4 overflow-hidden h-full">
                        <div className="relative shrink-0">
                            <MagnifyingGlassIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                            <input 
                                type="text"
                                placeholder="חפש חיפוש שמור..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-border-default rounded-xl py-3 pr-10 pl-4 text-sm focus:ring-2 focus:border-primary-500 focus:outline-none shadow-sm transition-shadow"
                            />
                        </div>
                        
                        <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-3 pb-4">
                            {filteredSearches.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm bg-bg-subtle/50 rounded-2xl border border-dashed border-border-default">לא נמצאו חיפושים שמורים</div>
                            ) : (
                                filteredSearches.map(search => {
                                    const isSelected = selectedSearch === search.id;
                                    
                                    return (
                                        <div 
                                            key={search.id}
                                            onClick={() => setSelectedSearch(search.id)}
                                            className={`p-4 cursor-pointer transition-all rounded-2xl border flex items-center gap-4 ${
                                                isSelected 
                                                ? 'bg-primary-50/80 border-primary-300 shadow-sm ring-1 ring-primary-100' 
                                                : 'bg-white border-border-subtle hover:border-primary-200 hover:bg-primary-50/30 hover:shadow-sm'
                                            }`}
                                        >
                                            <div className="shrink-0">
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                    isSelected ? 'border-primary-600 bg-primary-600' : 'border-border-strong bg-white'
                                                }`}>
                                                    {isSelected && (
                                                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <h4 className={`font-bold text-sm truncate mb-0.5 ${isSelected ? 'text-primary-900' : 'text-text-default'}`}>
                                                    {search.name}
                                                </h4>
                                                
                                                <div className="flex items-center gap-2 text-xs font-medium mt-1.5 flex-wrap">
                                                    <span className="flex items-center gap-1 bg-bg-subtle px-2 py-0.5 rounded text-text-subtle whitespace-nowrap">
                                                        <FolderIcon className="w-3.5 h-3.5" />
                                                        {search.isPublic ? 'ציבורי' : 'פרטי'}
                                                    </span>
                                                    <span className="flex items-center gap-1 bg-bg-subtle px-2 py-0.5 rounded text-text-subtle whitespace-nowrap overflow-hidden">
                                                        <span className="truncate">נוצר ע"י {search.creator || 'Gilad Benhaim'}</span>
                                                    </span>
                                                    <span className="flex items-center gap-1 bg-bg-subtle px-2 py-0.5 rounded text-text-subtle whitespace-nowrap">
                                                        {new Date(search.createdAt || Date.now()).toLocaleDateString('he-IL')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="p-4 md:p-6 pt-0 mt-auto border-t border-border-subtle shrink-0">
                        <div className="flex gap-3 pt-4">
                            <button 
                                onClick={() => {
                                    if (selectedSearch !== null) {
                                        onSave(selectedSearch);
                                        onClose();
                                    }
                                }}
                                disabled={selectedSearch === null}
                                className="px-4 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 text-center"
                            >
                                הוסף לחיפוש
                            </button>
                            <button onClick={onClose} className="px-4 py-3 rounded-xl font-semibold text-text-default hover:bg-border-subtle transition-colors w-1/3 text-center border border-border-default">
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
