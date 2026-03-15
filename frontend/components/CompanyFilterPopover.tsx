
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';

interface CompanyFilters {
    sizes: string[];
    sectors: string[];
    industry: string;
    field: string;
}

interface CompanyFilterPopoverProps {
    onClose: () => void;
    filters: CompanyFilters;
    setFilters: React.Dispatch<React.SetStateAction<CompanyFilters>>;
    onApply?: () => void;
}

const companySizeOptions = ['1-50', '51-200', '200-1000', '1000+'];
const companySectorOptions = ['פרטי', 'ציבורי', 'ממשלתי', 'מלכ"ר'];

type IndustryCategory = {
    id: string;
    name: string;
    description?: string;
};

type FieldValue = {
    id: string;
    label: string;
    value: string;
    displayName?: string | null;
};


const CompanyFilterPopover: React.FC<CompanyFilterPopoverProps> = ({ onClose, filters, setFilters, onApply }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [industrySearchTerm, setIndustrySearchTerm] = useState('');
    const [fieldSearchTerm, setFieldSearchTerm] = useState('');
    const [industries, setIndustries] = useState<IndustryCategory[]>([]);
    const [fields, setFields] = useState<FieldValue[]>([]);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const BUSINESS_FIELD_CATEGORY_ID = '16c81e14-316d-403d-951a-263d02f57f4b';

    // Changed click outside logic: Now using a backdrop div with onClick instead of document listener
    // This is safer with createPortal and avoids issues with event bubbling order
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);
    
    const handleSizeToggle = (size: string) => {
        setFilters(prev => ({
            ...prev,
            sizes: prev.sizes.includes(size) ? prev.sizes.filter(s => s !== size) : [...prev.sizes, size]
        }));
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value ? [value] : [] }));
    };

    const handleIndustrySelect = (industryName: string) => {
        const newIndustry = filters.industry === industryName ? '' : industryName;
        setFilters(prev => ({ ...prev, industry: newIndustry, field: '' }));
    };

    const handleFieldSelect = (fieldName: string) => {
        const newField = filters.field === fieldName ? '' : fieldName;
        setFilters(prev => ({ ...prev, field: newField }));
    };

    const handleClear = () => {
        setFilters({ sizes: [], sectors: [], industry: '', field: '' });
    };

    // Load industries (subcategories) from picklists for the BUSINESS_FIELD_CATEGORY_ID
    useEffect(() => {
        if (!apiBase) return;
        const controller = new AbortController();
        (async () => {
            try {
                const res = await fetch(
                    `${apiBase}/api/picklists/categories/${BUSINESS_FIELD_CATEGORY_ID}/subcategories`,
                    { signal: controller.signal },
                );
                if (!res.ok) return;
                const data: IndustryCategory[] = await res.json();
                setIndustries(data || []);
            } catch {
                // silent fail – keep empty industries
            }
        })();
        return () => controller.abort();
    }, [apiBase]);

    // Load fields (values) for the selected industry
    useEffect(() => {
        if (!apiBase || !filters.industry) {
            setFields([]);
            return;
        }
        const selected = industries.find((i) => i.name === filters.industry);
        if (!selected) {
            setFields([]);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const res = await fetch(
                    `${apiBase}/api/picklists/categories/${selected.id}/values`,
                    { signal: controller.signal },
                );
                if (!res.ok) return;
                const data: FieldValue[] = await res.json();
                setFields(data || []);
            } catch {
                // silent fail – keep empty fields
            }
        })();
        return () => controller.abort();
    }, [apiBase, filters.industry, industries]);

    const filteredIndustries = useMemo(
        () =>
            industries.filter((cat) =>
                cat.name.toLowerCase().includes(industrySearchTerm.toLowerCase()),
            ),
        [industries, industrySearchTerm],
    );

    const availableFields = useMemo(() => {
        if (!filters.industry) return [];
        return fields.filter((field) =>
            (field.displayName || field.label)
                .toLowerCase()
                .includes(fieldSearchTerm.toLowerCase()),
        );
    }, [filters.industry, fieldSearchTerm, fields]);

    // Using Portal to break out of any overflow:hidden containers
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
            
            {/* Modal Content */}
            <div
                ref={popoverRef}
                className="relative bg-bg-card rounded-xl shadow-2xl border border-border-default flex flex-col w-full max-w-4xl max-h-[85vh] overflow-hidden animate-fade-in"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex justify-between items-center p-4 border-b border-border-default flex-shrink-0 bg-bg-subtle/30">
                    <div>
                        <h3 className="font-bold text-lg text-text-default">סינון לפי רקע תעסוקתי</h3>
                        <p className="text-xs text-text-muted">בחר תעשייה, גודל חברה וסקטור לסינון מועמדים</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors"><XMarkIcon className="w-5 h-5" /></button>
                </header>

                <main className="flex-grow overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border-default h-full min-h-[400px]">
                        
                        {/* Column 1: Industry List */}
                        <div className="flex flex-col h-full overflow-hidden border-b md:border-b-0">
                            <div className="p-3 border-b border-border-default bg-bg-subtle/20">
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        placeholder="חפש תעשייה..." 
                                        value={industrySearchTerm} 
                                        onChange={e => setIndustrySearchTerm(e.target.value)} 
                                        className="w-full bg-bg-input border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500" 
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-grow custom-scrollbar p-2 space-y-0.5">
                                {filteredIndustries.map(industry => (
                                    <button 
                                        key={industry.id} 
                                        onClick={() => handleIndustrySelect(industry.name)} 
                                        className={`w-full text-right px-3 py-2.5 rounded-lg text-sm transition-all flex justify-between items-center group ${
                                            filters.industry === industry.name 
                                                ? 'bg-primary-50 text-primary-700 font-bold border border-primary-100 shadow-sm' 
                                                : 'text-text-default hover:bg-bg-hover font-medium border border-transparent'
                                        }`}
                                    >
                                        <span className="truncate">{industry.name}</span>
                                        {filters.industry === industry.name && <div className="w-1.5 h-1.5 rounded-full bg-primary-500"></div>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Column 2: Fields List (Dependent on Industry) */}
                        <div className="flex flex-col h-full overflow-hidden border-b md:border-b-0 bg-bg-subtle/10">
                            <div className="p-3 border-b border-border-default bg-bg-subtle/20">
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                    <input 
                                        type="text" 
                                        placeholder="חפש תחום..." 
                                        value={fieldSearchTerm} 
                                        onChange={e => setFieldSearchTerm(e.target.value)} 
                                        disabled={!filters.industry} 
                                        className="w-full bg-bg-input border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500 disabled:bg-bg-subtle disabled:opacity-60" 
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-grow custom-scrollbar p-2 space-y-0.5">
                                {!filters.industry ? (
                                    <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-60 p-4 text-center">
                                        <p className="text-sm">בחר תעשייה מימין כדי לראות תחומים</p>
                                    </div>
                                ) : availableFields.length === 0 ? (
                                     <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-60 p-4 text-center">
                                        <p className="text-sm">לא נמצאו תחומים</p>
                                    </div>
                                ) : (
                                    availableFields.map(field => (
                                        <button 
                                            key={field.id} 
                                            onClick={() => handleFieldSelect(field.displayName || field.label)} 
                                            className={`w-full text-right px-3 py-2.5 rounded-lg text-sm transition-all flex justify-between items-center ${
                                                filters.field === (field.displayName || field.label) 
                                                    ? 'bg-white border-primary-200 text-primary-700 font-bold shadow-sm border' 
                                                    : 'text-text-default hover:bg-white hover:shadow-sm font-medium border border-transparent'
                                            }`}
                                        >
                                            <span className="truncate">{field.displayName || field.label}</span>
                                            {filters.field === (field.displayName || field.label) && <div className="w-1.5 h-1.5 rounded-full bg-primary-500"></div>}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Column 3: Company Properties */}
                        <div className="flex flex-col h-full overflow-hidden p-5 space-y-6 bg-bg-subtle/5">
                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-3 tracking-wide">גודל חברה</label>
                                <div className="flex flex-wrap gap-2">
                                    {companySizeOptions.map(size => (
                                        <button
                                            key={size}
                                            onClick={() => handleSizeToggle(size)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                                filters.sizes.includes(size)
                                                    ? 'bg-primary-600 text-white border-primary-600 shadow-md transform scale-105'
                                                    : 'bg-white text-text-default border-border-default hover:border-primary-300 hover:bg-primary-50'
                                            }`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted uppercase mb-3 tracking-wide">סקטור / מגזר</label>
                                <select 
                                    name="sectors" 
                                    value={filters.sectors[0] || ''} 
                                    onChange={handleFilterChange} 
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl p-3 focus:ring-2 focus:ring-primary-500 cursor-pointer"
                                >
                                    <option value="">כל הסקטורים</option>
                                    {companySectorOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            
                            {/* Selected Summary */}
                            <div className="mt-auto bg-primary-50 border border-primary-100 rounded-xl p-3 text-xs">
                                <span className="block font-bold text-primary-800 mb-1">סיכום בחירה:</span>
                                <div className="space-y-1 text-primary-700">
                                    {filters.industry && <p>• תעשייה: {filters.industry}</p>}
                                    {filters.field && <p>• תחום: {filters.field}</p>}
                                    {filters.sizes.length > 0 && <p>• גודל: {filters.sizes.join(', ')}</p>}
                                    {filters.sectors.length > 0 && <p>• סקטור: {filters.sectors.join(', ')}</p>}
                                    {!filters.industry && !filters.sizes.length && !filters.sectors.length && <p className="italic opacity-70">לא נבחרו מסננים</p>}
                                </div>
                            </div>
                        </div>

                    </div>
                </main>

                <footer className="flex justify-between items-center p-4 border-t border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <button onClick={handleClear} className="text-sm font-bold text-text-muted hover:text-red-500 transition-colors px-2">
                        נקה הכל
                    </button>
                    <div className="flex gap-3">
                         <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">
                            ביטול
                        </button>
                        <button
                            onClick={() => {
                                if (onApply) {
                                    onApply();
                                }
                                onClose();
                            }}
                            className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
                        >
                            החל סינון
                        </button>
                    </div>
                </footer>
                <style>{`
                    @keyframes fade-in {
                        from { opacity: 0; transform: scale(0.98); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    .animate-fade-in { 
                        animation: fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                `}</style>
            </div>
        </div>,
        document.body
    );
};

export default CompanyFilterPopover;
