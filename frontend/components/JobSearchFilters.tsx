
import React, { useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon, ChevronDownIcon, CalendarDaysIcon, BriefcaseIcon, MapPinIcon } from './Icons';
import LocationSelector, { LocationItem } from './LocationSelector';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';

interface JobSearchFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filters: {
        location: string;
        type: string;
        date: string;
    };
    setFilters: (filters: any) => void;
    onClear: () => void;
    resultsCount: number;
}

const JobSearchFilters: React.FC<JobSearchFiltersProps> = ({ searchTerm, setSearchTerm, filters, setFilters, onClear, resultsCount }) => {
    // State for managing complex selectors
    const [selectedLocations, setSelectedLocations] = useState<LocationItem[]>([]);
    const [isJobFieldOpen, setIsJobFieldOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState('');

    const handleLocationChange = (locs: LocationItem[]) => {
        setSelectedLocations(locs);
        // Map back to string for the simple filter prop, or extend filter object in parent
        // For now, we simulate filter string update to keep props compatible
        const locString = locs.map(l => l.value).join(', ');
        setFilters({ ...filters, location: locString });
    };

    const handleJobFieldChange = (field: SelectedJobField | null) => {
        if (field) {
            setSelectedRole(field.role);
            // In a real app, you might want to filter by both category and role
            // Here we just put the role in the search term or a specific filter
            setSearchTerm(field.role); 
        }
        setIsJobFieldOpen(false);
    };

    const handleDateChange = () => {
        const options = ['', 'היום', 'השבוע', 'החודש'];
        const currentIndex = options.indexOf(filters.date);
        const nextIndex = (currentIndex + 1) % options.length;
        setFilters({ ...filters, date: options[nextIndex] });
    };

    const handleTypeChange = () => {
        const options = ['', 'משרה מלאה', 'חלקית', 'משמרות', 'היברידי'];
        const currentIndex = options.indexOf(filters.type);
        const nextIndex = (currentIndex + 1) % options.length;
        setFilters({ ...filters, type: options[nextIndex] });
    };
    
    const handleClearAll = () => {
        onClear();
        setSelectedLocations([]);
        setSelectedRole('');
    };

    return (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-border-default p-4 mb-6">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                
                {/* Right Side - Search Input */}
                <div className="relative w-full lg:w-[350px] order-1">
                    <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-subtle" />
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="חיפוש משרה, חברה או מילות מפתח..." 
                        className="w-full bg-bg-subtle/50 border border-border-default rounded-xl py-3 pl-4 pr-10 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
                    />
                     {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-bg-hover text-text-subtle"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Center - Filters */}
                <div className="flex items-center gap-2 w-full lg:w-auto overflow-visible order-2 flex-wrap lg:flex-nowrap">
                    
                    {/* Role Selector */}
                    <button 
                        onClick={() => setIsJobFieldOpen(true)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 min-w-[140px] justify-between ${
                            selectedRole ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                        }`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <BriefcaseIcon className="w-4 h-4 flex-shrink-0"/>
                            <span className="truncate">{selectedRole || 'תחום משרה'}</span>
                        </div>
                        <ChevronDownIcon className="w-4 h-4 opacity-50 flex-shrink-0" />
                    </button>

                    {/* Location Selector (Smart Component) */}
                    <div className="w-full lg:w-64 z-20">
                         <LocationSelector 
                            selectedLocations={selectedLocations}
                            onChange={handleLocationChange}
                            placeholder="מיקום"
                        />
                    </div>

                    {/* Simple Filters */}
                    <button 
                        onClick={handleTypeChange}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                            filters.type ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                        }`}
                    >
                        <span>{filters.type || 'היקף משרה'}</span>
                        <ChevronDownIcon className="w-4 h-4 opacity-50" />
                    </button>
                    
                    <button 
                        onClick={handleDateChange}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                            filters.date ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                        }`}
                    >
                        <CalendarDaysIcon className="w-4 h-4"/>
                        <span>{filters.date || 'תאריך'}</span>
                    </button>
                </div>

                 {/* Left Side - Actions */}
                <div className="flex items-center gap-3 order-3 lg:w-auto w-full justify-end">
                     <button 
                        onClick={handleClearAll}
                        className="text-text-muted hover:text-red-500 text-sm font-medium whitespace-nowrap px-2"
                    >
                        נקה הכל
                    </button>
                    <button className="bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm transition-colors whitespace-nowrap">
                        חפש ({resultsCount})
                    </button>
                </div>
            </div>
            
            <JobFieldSelector 
                onChange={handleJobFieldChange}
                isModalOpen={isJobFieldOpen}
                setIsModalOpen={setIsJobFieldOpen}
            />
        </div>
    );
};

export default JobSearchFilters;
