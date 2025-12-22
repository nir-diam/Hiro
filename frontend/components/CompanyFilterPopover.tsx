import React, { useRef, useEffect, useMemo, useState } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';
import { jobFieldsData } from '../data/jobFieldsData';

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
}

const companySizeOptions = ['1-50', '51-200', '200-1000', '1000+'];
const companySectorOptions = ['פרטי', 'ציבורי', 'ממשלתי', 'מלכ"ר'];


const CompanyFilterPopover: React.FC<CompanyFilterPopoverProps> = ({ onClose, filters, setFilters }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [industrySearchTerm, setIndustrySearchTerm] = useState('');
    const [fieldSearchTerm, setFieldSearchTerm] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        setTimeout(() => {
             document.addEventListener('mousedown', handleClickOutside);
        }, 0);
       
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
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

    const filteredIndustries = useMemo(() => 
        jobFieldsData.filter(cat => cat.name.toLowerCase().includes(industrySearchTerm.toLowerCase())),
        [industrySearchTerm]
    );

    const availableFields = useMemo(() => {
        if (!filters.industry) return [];
        const category = jobFieldsData.find(cat => cat.name === filters.industry);
        if (!category) return [];
        return category.fieldTypes.filter(field => field.name.toLowerCase().includes(fieldSearchTerm.toLowerCase()));
    }, [filters.industry, fieldSearchTerm]);

    return (
        <>
            <div className="md:hidden fixed inset-0 bg-black bg-opacity-40 z-20" onClick={onClose} />
            <div
                ref={popoverRef}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-md z-30
                           md:absolute md:top-full md:left-0 md:mt-2 md:w-[40rem] md:max-w-[90vw] md:translate-x-0 md:translate-y-0
                           bg-bg-card rounded-xl shadow-2xl border border-border-default flex flex-col max-h-[80vh] animate-fade-in"
                style={{'--tw-shadow': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'} as React.CSSProperties}
            >
                <header className="flex justify-between items-center p-4 border-b border-border-default flex-shrink-0">
                    <h3 className="font-bold text-text-default">סינון לפי רקע תעסוקתי</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-bg-hover"><XMarkIcon className="w-5 h-5 text-text-muted" /></button>
                </header>

                <main className="flex-grow overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border-default">
                        {/* Left side: Industry & Field */}
                        <div className="flex flex-col border-b md:border-b-0">
                            <h4 className="text-sm font-bold text-text-muted px-4 py-2 bg-bg-subtle border-b border-border-default">תעשייה ותחום</h4>
                            <div className="flex-grow flex flex-col md:flex-row md:h-[24rem]">
                                <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-l border-border-default flex flex-col h-56 md:h-auto">
                                    <div className="p-2 border-b border-border-default flex-shrink-0">
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-2 top-1/2 -translate-y-1/2" />
                                            <input type="text" placeholder="חיפוש תעשייה..." value={industrySearchTerm} onChange={e => setIndustrySearchTerm(e.target.value)} className="w-full bg-bg-input border-border-default rounded-md p-1.5 pr-8 text-sm" />
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto flex-grow custom-scrollbar">
                                        {filteredIndustries.map(industry => (
                                            <button key={industry.name} onClick={() => handleIndustrySelect(industry.name)} className={`w-full text-right p-2 text-sm font-medium ${filters.industry === industry.name ? 'bg-primary-100 text-primary-700' : 'hover:bg-bg-hover'}`}>{industry.name}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="w-full md:w-1/2 flex flex-col h-56 md:h-auto">
                                    <div className="p-2 border-b border-border-default flex-shrink-0">
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-2 top-1/2 -translate-y-1/2" />
                                            <input type="text" placeholder="חיפוש תחום..." value={fieldSearchTerm} onChange={e => setFieldSearchTerm(e.target.value)} disabled={!filters.industry} className="w-full bg-bg-input border-border-default rounded-md p-1.5 pr-8 text-sm disabled:bg-bg-subtle" />
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto flex-grow custom-scrollbar md:max-h-[20.5rem]">
                                        {availableFields.map(field => (
                                            <button key={field.name} onClick={() => handleFieldSelect(field.name)} className={`w-full text-right p-2 text-sm font-medium ${filters.field === field.name ? 'bg-primary-100 text-primary-700' : 'hover:bg-bg-hover'}`}>{field.name}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Right side: Company Size, Sector */}
                        <div className="p-4 space-y-4">
                            <div className="md:h-[13.5rem] overflow-y-auto">
                                <label className="block text-sm font-semibold text-text-muted mb-2">גודל חברה</label>
                                <div className="flex flex-wrap gap-2">
                                    {companySizeOptions.map(size => (
                                        <button
                                            key={size}
                                            onClick={() => handleSizeToggle(size)}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                                                filters.sizes.includes(size)
                                                    ? 'bg-primary-600 text-white border-primary-600'
                                                    : 'bg-bg-card border-border-default text-text-default hover:bg-primary-50 hover:border-primary-200'
                                            }`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="md:h-[10.5rem] overflow-y-auto">
                                <label className="block text-sm font-semibold text-text-muted mb-2">סקטור</label>
                                <select name="sectors" value={filters.sectors[0] || ''} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                    <option value="">בחר סקטור</option>
                                    {companySectorOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="flex justify-between items-center p-3 border-t border-border-default flex-shrink-0">
                    <button onClick={handleClear} className="text-sm font-semibold text-text-muted hover:text-primary-600">נקה הכל</button>
                    <button onClick={onClose} className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg text-sm">החל</button>
                </footer>
                <style>{`
                    @keyframes fade-in {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    .animate-fade-in { 
                        animation: fade-in 0.2s ease-out forwards;
                    }
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: rgb(var(--color-bg-subtle)); }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgb(var(--color-border-default)); border-radius: 3px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgb(var(--color-text-subtle)); }
                `}</style>
            </div>
        </>
    );
};

export default CompanyFilterPopover;