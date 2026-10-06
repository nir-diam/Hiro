
import React, { useEffect, useRef, useState } from 'react';
import {
    MagnifyingGlassIcon,
    XMarkIcon,
    ChevronDownIcon,
    CalendarDaysIcon,
    BriefcaseIcon,
    CheckIcon,
} from './Icons';
import LocationSelector, { type LocationItem } from './LocationSelector';
import JobFieldSelector, { type SelectedJobField } from './JobFieldSelector';
import {
    cycleDateSort,
    dateSortLabel,
    EMPTY_JOB_SEARCH_FILTERS,
    jobFieldKey,
    PORTAL_JOB_SCOPE_OPTIONS,
    type JobSearchFilterState,
} from '../utils/portalJobFilters';

export type { JobSearchFilterState };
export { EMPTY_JOB_SEARCH_FILTERS };

interface JobSearchFiltersProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    filters: JobSearchFilterState;
    setFilters: React.Dispatch<React.SetStateAction<JobSearchFilterState>>;
    onClear: () => void;
    resultsCount: number;
}

const JobSearchFilters: React.FC<JobSearchFiltersProps> = ({
    searchTerm,
    setSearchTerm,
    filters,
    setFilters,
    onClear,
    resultsCount,
}) => {
    const [isJobFieldOpen, setIsJobFieldOpen] = useState(false);
    const [isScopeOpen, setIsScopeOpen] = useState(false);
    const scopeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isScopeOpen) return;
        const onDocClick = (event: MouseEvent) => {
            if (!scopeRef.current?.contains(event.target as Node)) {
                setIsScopeOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [isScopeOpen]);

    const handleLocationChange = (locations: LocationItem[]) => {
        setFilters({ ...filters, locations });
    };

    const toggleJobField = (field: SelectedJobField) => {
        const key = jobFieldKey(field);
        const exists = filters.jobFields.some((item) => jobFieldKey(item) === key);
        const jobFields = exists
            ? filters.jobFields.filter((item) => jobFieldKey(item) !== key)
            : [...filters.jobFields, field];
        setFilters({ ...filters, jobFields });
    };

    const toggleJobScope = (scope: string) => {
        const jobScopes = filters.jobScopes.includes(scope)
            ? filters.jobScopes.filter((item) => item !== scope)
            : [...filters.jobScopes, scope];
        setFilters({ ...filters, jobScopes });
    };

    const handleDateSortChange = () => {
        setFilters((prev) => ({ ...prev, dateSort: cycleDateSort(prev.dateSort) }));
    };

    const handleClearAll = () => {
        onClear();
    };

    const jobFieldLabel =
        filters.jobFields.length === 0
            ? 'תחום משרה'
            : filters.jobFields.length === 1
              ? filters.jobFields[0].role
              : `${filters.jobFields.length} תחומים`;

    const scopeLabel =
        filters.jobScopes.length === 0
            ? 'היקף משרה'
            : filters.jobScopes.length === 1
              ? filters.jobScopes[0]
              : `${filters.jobScopes.length} היקפים`;

    return (
        <div className="w-full bg-white rounded-2xl shadow-sm border border-border-default p-4 mb-6 space-y-4">
            <div className="relative w-full">
                <MagnifyingGlassIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-subtle pointer-events-none" />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="חיפוש משרה, חברה או מילות מפתח..."
                    className="w-full bg-bg-subtle/50 border border-border-default rounded-xl py-3.5 pl-12 pr-12 text-base focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none"
                />
                {searchTerm ? (
                    <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-bg-hover text-text-subtle"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                ) : null}
            </div>

            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                <div className="flex items-center gap-2 w-full lg:flex-1 overflow-visible flex-wrap lg:flex-nowrap">
                    <button
                        type="button"
                        onClick={() => setIsJobFieldOpen(true)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 min-w-[140px] justify-between ${
                            filters.jobFields.length
                                ? 'bg-primary-50 border-primary-300 text-primary-700'
                                : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                        }`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            <BriefcaseIcon className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{jobFieldLabel}</span>
                        </div>
                        <ChevronDownIcon className="w-4 h-4 opacity-50 flex-shrink-0" />
                    </button>

                    <div className="w-full lg:w-64 z-20">
                        <LocationSelector
                            selectedLocations={filters.locations}
                            onChange={handleLocationChange}
                            placeholder="מיקום"
                        />
                    </div>

                    <div className="relative" ref={scopeRef}>
                        <button
                            type="button"
                            onClick={() => setIsScopeOpen((open) => !open)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                                filters.jobScopes.length
                                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                                    : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                            }`}
                        >
                            <span>{scopeLabel}</span>
                            <ChevronDownIcon className="w-4 h-4 opacity-50" />
                        </button>
                        {isScopeOpen ? (
                            <div className="absolute top-full mt-2 right-0 z-30 min-w-[240px] rounded-xl border border-border-default bg-white shadow-xl p-3">
                                <p className="text-[11px] font-bold text-text-muted uppercase tracking-wide mb-2">
                                    בחר היקפי משרה
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {PORTAL_JOB_SCOPE_OPTIONS.map((scope) => {
                                        const selected = filters.jobScopes.includes(scope);
                                        return (
                                            <button
                                                key={scope}
                                                type="button"
                                                onClick={() => toggleJobScope(scope)}
                                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                                    selected
                                                        ? 'bg-primary-50 text-primary-700 border-primary-200'
                                                        : 'bg-bg-subtle text-text-muted border-transparent hover:border-primary-200'
                                                }`}
                                            >
                                                {selected ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                                                {scope}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        onClick={handleDateSortChange}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                            filters.dateSort
                                ? 'bg-primary-50 border-primary-300 text-primary-700'
                                : 'bg-white border-border-default text-text-muted hover:border-primary-300'
                        }`}
                        title="מיון לפי תאריך עדכון משרה"
                    >
                        <CalendarDaysIcon className="w-4 h-4" />
                        <span>{dateSortLabel(filters.dateSort)}</span>
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full lg:w-auto justify-end shrink-0">
                    <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-text-muted hover:text-red-500 text-sm font-medium whitespace-nowrap px-2"
                    >
                        נקה הכל
                    </button>
                    <div className="bg-primary-600 text-white text-sm font-bold px-6 py-2.5 rounded-xl shadow-sm whitespace-nowrap">
                        {resultsCount} משרות
                    </div>
                </div>
            </div>

            {filters.jobFields.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                    {filters.jobFields.map((field) => (
                        <button
                            key={jobFieldKey(field)}
                            type="button"
                            onClick={() => toggleJobField(field)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-primary-50 text-primary-700 border border-primary-100 hover:bg-primary-100"
                        >
                            {field.role}
                            <XMarkIcon className="w-3 h-3" />
                        </button>
                    ))}
                </div>
            ) : null}

            <JobFieldSelector
                multiSelect
                selectedValues={filters.jobFields}
                onToggleRole={toggleJobField}
                onChange={() => undefined}
                isModalOpen={isJobFieldOpen}
                setIsModalOpen={setIsJobFieldOpen}
            />
        </div>
    );
};

export default JobSearchFilters;
