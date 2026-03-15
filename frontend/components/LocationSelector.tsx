import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, CheckIcon, MinusIcon, MapPinIcon, EyeIcon, XMarkIcon } from './Icons';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '';

export type LocationType = 'region' | 'city' | 'radius';
export interface LocationItem {
    type: LocationType;
    value: string;
    radius?: number;
}

export interface LocationGroup {
    region: string;
    cities: string[];
}

// No mock data – regions/cities come from backend /api/cities (search 2+ chars)
export const locationHierarchy: LocationGroup[] = [];

interface LocationSelectorProps {
    selectedLocations: LocationItem[];
    onChange: (locations: LocationItem[]) => void;
    placeholder?: string;
    className?: string;
    /** If true, summary shows city names instead of radius text like "ירושלים +2 ק\"מ" */
    summarizeAsCityNames?: boolean;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({
    selectedLocations,
    onChange,
    placeholder = 'מיקום',
    className = '',
    summarizeAsCityNames = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'regions' | 'radius'>('regions');
    const [isDropdownExpanded, setIsDropdownExpanded] = useState(false);

    // Search / Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());

    // Backend cities API results (אזורים וערים) – fetched when search >= 2 chars
    const [cityResults, setCityResults] = useState<LocationGroup[]>([]);
    const [citiesLoading, setCitiesLoading] = useState(false);

    // Radius Logic – city input options from backend /api/cities
    const [radiusCity, setRadiusCity] = useState('');
    const [radiusDist, setRadiusDist] = useState(20);
    const [radiusCityOptions, setRadiusCityOptions] = useState<string[]>([]);
    const [radiusCityOptionsLoading, setRadiusCityOptionsLoading] = useState(false);
    // Radius Logic – cities inside chosen radius (for chips selection)
    const [radiusAreaCities, setRadiusAreaCities] = useState<string[]>([]);
    const [selectedRadiusAreaCities, setSelectedRadiusAreaCities] = useState<string[]>([]);
    const [radiusAreaLoading, setRadiusAreaLoading] = useState(false);
    const [showAllRadiusArea, setShowAllRadiusArea] = useState(false);
    const [radiusCitiesFilter, setRadiusCitiesFilter] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsSummaryOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Helpers
    const isCitySelected = (city: string) => selectedLocations.some(l => l.type === 'city' && l.value === city);
    const isRegionFullySelected = (regionName: string, cities: string[]) => {
        return cities.every(city => isCitySelected(city));
    };
    const isRegionPartiallySelected = (regionName: string, cities: string[]) => {
        const selectedCount = cities.filter(city => isCitySelected(city)).length;
        return selectedCount > 0 && selectedCount < cities.length;
    };

    const toggleRegion = (regionName: string, cities: string[]) => {
        let newSelection = selectedLocations.filter(l => l.type !== 'radius');
        const allSelected = isRegionFullySelected(regionName, cities);
        
        if (allSelected) {
            newSelection = newSelection.filter(l => !cities.includes(l.value));
        } else {
            const citiesToAdd = cities.filter(city => !isCitySelected(city));
            const newItems = citiesToAdd.map(city => ({ type: 'city', value: city } as LocationItem));
            newSelection = [...newSelection, ...newItems];
        }
        onChange(newSelection);
    };

    const toggleCity = (city: string) => {
        let newSelection = selectedLocations.filter(l => l.type !== 'radius');
        if (isCitySelected(city)) {
            newSelection = newSelection.filter(l => l.value !== city);
        } else {
            newSelection.push({ type: 'city', value: city });
        }
        onChange(newSelection);
    };

    const toggleExpand = (regionName: string) => {
        setExpandedRegions(prev => {
            const next = new Set(prev);
            if (next.has(regionName)) next.delete(regionName);
            else next.add(regionName);
            return next;
        });
    };

    const applyRadius = () => {
        if (!radiusCity) return;

        // Keep existing non-radius selections
        const base = selectedLocations.filter(l => l.type !== 'radius');
        const existingCityValues = new Set(
            base.filter(l => l.type === 'city').map(l => l.value),
        );

        // Add all cities that are currently selected in the radius chips
        const cityItems: LocationItem[] = selectedRadiusAreaCities.length
            ? selectedRadiusAreaCities
                  .filter((name) => !existingCityValues.has(name))
                  .map(
                      (name) =>
                          ({
                              type: 'city',
                              value: name,
                          } as LocationItem),
                  )
            : [];

        const radiusItem: LocationItem = {
            type: 'radius',
            value: radiusCity,
            radius: radiusDist,
        };

        onChange([...base, radiusItem, ...cityItems]);
        setIsOpen(false);
    };

    // Fetch from backend /api/cities when user types 2+ characters
    useEffect(() => {
        const q = searchTerm.trim();
        if (q.length < 2) { 
            setCityResults([]);
            return;
        }
        let cancelled = false;
        setCitiesLoading(true);
        const url = `${API_BASE}/api/cities?search=${encodeURIComponent(q)}`;
        fetch(url)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled || !Array.isArray(data)) {
                    return;
                }
                const byRegion = new Map<string, Set<string>>();
                const records = data as Array<{ cityName?: string; city?: string; column4?: string }>;
                for (const row of records) {
                    const name = (row.cityName || row.city || '').trim();
                    if (!name) continue;
                    const region = (row.column4 || 'ערים').trim() || 'ערים';
                    if (!byRegion.has(region)) byRegion.set(region, new Set());
                    byRegion.get(region)!.add(name);
                }
                const groups: LocationGroup[] = Array.from(byRegion.entries()).map(([region, cities]) => ({
                    region,
                    cities: Array.from(cities).sort((a, b) => a.localeCompare(b)),
                }));
                setCityResults(groups);
            })
            .catch(() => {
                if (!cancelled) setCityResults([]);
            })
            .finally(() => {
                if (!cancelled) setCitiesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [searchTerm]);

    // Radius tab: fetch city options from backend for "עיר מרכזית" datalist (search 2+ chars)
    useEffect(() => {
        const q = radiusCity.trim();
        if (q.length < 2) {
            setRadiusCityOptions([]);
            return;
        }
        let cancelled = false;
        const t = setTimeout(() => {
            setRadiusCityOptionsLoading(true);
            const url = `${API_BASE}/api/cities?search=${encodeURIComponent(q)}`;
            fetch(url)
                .then((res) => res.json())
                .then((data) => {
                    if (cancelled || !Array.isArray(data)) return;
                    const names = new Set<string>();
                    const records = data as Array<{ cityName?: string; city?: string }>;
                    for (const row of records) {
                        const name = (row.cityName || row.city || '').trim();
                        if (name) names.add(name);
                    }
                    setRadiusCityOptions(Array.from(names).sort((a, b) => a.localeCompare(b)));
                })
                .catch(() => {
                    if (!cancelled) setRadiusCityOptions([]);
                })
                .finally(() => {
                    if (!cancelled) setRadiusCityOptionsLoading(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [radiusCity]);

    const filteredHierarchy = useMemo(() => cityResults, [cityResults]);

    // Radius tab: fetch list of cities inside radius from backend when city or radius changes
    useEffect(() => {
        const center = radiusCity.trim();
        if (center.length < 2) {
            setRadiusAreaCities([]);
            setSelectedRadiusAreaCities([]);
            return;
        }
        let cancelled = false;
        const t = setTimeout(() => {
            setRadiusAreaLoading(true);
            const url = `${API_BASE}/api/cities/radius?city=${encodeURIComponent(center)}&radius=${radiusDist}`;
            fetch(url)
                .then((res) => res.json())
                .then((data) => {
                    if (cancelled || !Array.isArray(data)) return;
                    const names = new Set<string>();
                    const records = data as Array<{ cityName?: string; city?: string }>;
                    for (const row of records) {
                        const name = (row.cityName || row.city || '').trim();
                        if (name) names.add(name);
                    }
                    const list = Array.from(names).sort((a, b) => a.localeCompare(b));
                    setRadiusAreaCities(list);
                    setSelectedRadiusAreaCities(list);
                    setShowAllRadiusArea(false);
                })
                .catch(() => {
                    if (!cancelled) {
                        setRadiusAreaCities([]);
                        setSelectedRadiusAreaCities([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) setRadiusAreaLoading(false);
                });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [radiusCity, radiusDist]);

    useEffect(() => {
        if (filteredHierarchy.length > 0) {
            setExpandedRegions(new Set(filteredHierarchy.map((g) => g.region)));
        }
    }, [filteredHierarchy]);

    // Display Logic
    const radiusSelection = selectedLocations.find(l => l.type === 'radius');
    const selectedCityNames = useMemo(
        () => selectedLocations.filter((l) => l.type === 'city').map((l) => l.value),
        [selectedLocations],
    );
    let displayValue = placeholder;
    
    if (summarizeAsCityNames) {
        if (radiusSelection) {
            displayValue = `${radiusSelection.value} + ${radiusSelection.radius} ק"מ`;
        } else if (selectedCityNames.length > 0) {
            displayValue = selectedCityNames.join(', ');
        }
    } else if (radiusSelection) {
        displayValue = `${radiusSelection.value} +${radiusSelection.radius} ק"מ`;
    } else if (selectedLocations.length === 1) {
        displayValue = selectedLocations[0].value;
    } else if (selectedLocations.length > 1) {
        displayValue = `${selectedLocations.length} אזורים/ערים`;
    }

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className={`relative flex items-center bg-white border rounded-xl shadow-sm transition-all ${isOpen ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default hover:border-primary-300'}`}>
                
                {/* Main Trigger */}
                <button 
                    type="button"
                    onClick={() => setIsOpen(!isOpen)} 
                    className="flex-grow flex items-center justify-between py-2.5 pl-2 pr-3 text-sm h-[42px] truncate min-w-0"
                >
                    <div className="flex items-center gap-2 truncate">
                        <MapPinIcon className={`w-4 h-4 flex-shrink-0 ${selectedLocations.length > 0 ? 'text-primary-500' : 'text-text-subtle'}`} />
                        <span className={`truncate ${selectedLocations.length > 0 ? 'text-text-default font-medium' : 'text-text-muted'}`}>
                            {displayValue}
                        </span>
                    </div>
                </button>

                {/* Eye Icon for Summary (Only if multiple items selected) */}
                {selectedLocations.length > 0 && !radiusSelection && (
                    <div className="flex items-center border-r border-border-subtle pr-1 h-6">
                         <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setIsSummaryOpen(!isSummaryOpen); setIsOpen(false); }}
                            className={`p-1.5 rounded-full hover:bg-primary-50 transition-colors ${isSummaryOpen ? 'text-primary-600 bg-primary-50' : 'text-text-subtle'}`}
                            title="צפה בבחירה"
                        >
                            <EyeIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                {/* Chevron */}
                 <div className="pr-2 pl-3 flex items-center pointer-events-none">
                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {/* Selection Dropdown */}
            {isOpen && (
                <div
                    className={`absolute top-full right-0 mt-1 bg-white border border-border-default rounded-xl shadow-2xl z-50 flex flex-col animate-fade-in overflow-hidden transition-all duration-300 ease-in-out ${
                        isDropdownExpanded ? 'w-[640px] md:w-[700px] max-h-[900px]' : 'w-[300px] md:w-[350px] max-h-[450px]'
                    }`}
                >
                    <div className="flex border-b border-border-default bg-bg-subtle/30 relative">
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setIsDropdownExpanded((prev) => !prev); }}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-bg-hover text-text-subtle hover:text-primary-600 transition-colors"
                            title={isDropdownExpanded ? 'כווץ תצוגה' : 'הרחב תצוגה'}
                        >
                            {isDropdownExpanded ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            )}
                        </button>
                        <button 
                            onClick={() => setActiveTab('regions')} 
                            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'regions' ? 'text-primary-600 border-b-2 border-primary-600 bg-white' : 'text-text-muted hover:text-text-default'}`}
                        >
                            אזורים וערים
                        </button>
                        <button 
                            onClick={() => setActiveTab('radius')} 
                            className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'radius' ? 'text-primary-600 border-b-2 border-primary-600 bg-white' : 'text-text-muted hover:text-text-default'}`}
                        >
                            רדיוס מעיר
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 bg-white">
                        {activeTab === 'regions' && (
                            <>
                                <div className="p-3 sticky top-0 bg-white z-10 border-b border-border-subtle">
                                    <div className="relative">
                                        <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                        <input 
                                            type="text" 
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="חפש עיר או אזור..." 
                                            className="w-full bg-bg-subtle/50 border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="p-2 space-y-1">
                                    {searchTerm.trim().length < 2 && (
                                        <div className="p-4 text-center text-text-muted text-sm">הקלד לפחות 2 תווים לחיפוש ערים ואזורים</div>
                                    )}
                                    {searchTerm.trim().length >= 2 && citiesLoading && (
                                        <div className="p-4 text-center text-text-muted text-sm">טוען...</div>
                                    )}
                                    {searchTerm.trim().length >= 2 && !citiesLoading && filteredHierarchy.length > 0 && filteredHierarchy.map(group => {
                                        const isFullySelected = isRegionFullySelected(group.region, group.cities);
                                        const isPartiallySelected = isRegionPartiallySelected(group.region, group.cities);
                                        const isExpanded = expandedRegions.has(group.region);

                                        return (
                                            <div key={group.region} className="rounded-lg overflow-hidden">
                                                <div className={`flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors ${isExpanded ? 'bg-primary-50/50' : ''}`} onClick={() => toggleExpand(group.region)}>
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <ChevronDownIcon className={`w-3.5 h-3.5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        <span className="font-bold text-sm text-text-default">{group.region}</span>
                                                    </div>
                                                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                                        <div 
                                                            className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                                                                isFullySelected ? 'bg-primary-600 border-primary-600' : 
                                                                isPartiallySelected ? 'bg-primary-100 border-primary-600' : 
                                                                'border-border-default bg-white hover:border-primary-400'
                                                            }`}
                                                            onClick={() => toggleRegion(group.region, group.cities)}
                                                        >
                                                            {isFullySelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                                                            {isPartiallySelected && <MinusIcon className="w-3.5 h-3.5 text-primary-600" />}
                                                        </div>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="mr-3 pl-2 border-r-2 border-border-default space-y-0.5 mt-1 mb-2">
                                                        {group.cities.map(city => {
                                                            const selected = isCitySelected(city);
                                                            return (
                                                                <div key={city} className="flex items-center justify-between p-1.5 pr-3 hover:bg-bg-hover rounded-md cursor-pointer group/city" onClick={() => toggleCity(city)}>
                                                                    <span className={`text-sm ${selected ? 'text-primary-700 font-medium' : 'text-text-muted'}`}>{city}</span>
                                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-primary-600 border-primary-600' : 'border-border-default bg-white group-hover/city:border-primary-400'}`}>
                                                                        {selected && <CheckIcon className="w-3 h-3 text-white" />}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {searchTerm.trim().length >= 2 && !citiesLoading && filteredHierarchy.length === 0 && (
                                        <div className="p-4 text-center text-text-muted text-sm">לא נמצאו תוצאות</div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'radius' && (
                            <div className="p-4 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-text-default mb-2">1. בחר עיר מרכזית</label>
                                    <div className="p-3 sticky top-0 bg-white z-10 border-b border-border-subtle">
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={radiusCity}
                                                onChange={(e) => setRadiusCity(e.target.value)}
                                                placeholder="חפש עיר או אזור..."
                                                className="w-full bg-bg-subtle/50 border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-2 space-y-1">
                                        {radiusCity.trim().length < 2 && (
                                            <div className="p-4 text-center text-text-muted text-sm">הקלד לפחות 2 תווים לחיפוש ערים ואזורים</div>
                                        )}
                                        {radiusCity.trim().length >= 2 && radiusCityOptionsLoading && (
                                            <div className="p-4 text-center text-text-muted text-sm">טוען...</div>
                                        )}
                                        {radiusCity.trim().length >= 2 && !radiusCityOptionsLoading && radiusCityOptions.length > 0 && radiusCityOptions.map((c) => (
                                            <div
                                                key={c}
                                                className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors"
                                                onClick={() => setRadiusCity(c)}
                                            >
                                                <span className="text-sm text-text-default">{c}</span>
                                            </div>
                                        ))}
                                        {radiusCity.trim().length >= 2 && !radiusCityOptionsLoading && radiusCityOptions.length === 0 && (
                                            <div className="p-4 text-center text-text-muted text-sm">לא נמצאו תוצאות</div>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-bold text-text-default">2. טווח (רדיוס)</label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRadiusDist((prev) => Math.max(1, prev - 1))}
                                                className="w-7 h-7 flex items-center justify-center rounded-full border border-border-default text-sm font-bold text-text-default hover:bg-bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                                                disabled={radiusDist <= 1}
                                            >
                                                -
                                            </button>
                                            <span className="text-sm font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">
                                                {radiusDist} ק"מ
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setRadiusDist((prev) => Math.min(100, prev + 1))}
                                                className="w-7 h-7 flex items-center justify-center rounded-full border border-border-default text-sm font-bold text-text-default hover:bg-bg-subtle disabled:opacity-40 disabled:cursor-not-allowed"
                                                disabled={radiusDist >= 100}
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="100" 
                                        step="1" 
                                        value={radiusDist} 
                                        onChange={(e) => setRadiusDist(Number(e.target.value))}
                                        className="w-full accent-primary-600 h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-xs text-text-muted mt-1">
                                        <span>5 ק"מ</span>
                                        <span>100 ק"מ</span>
                                    </div>

                                    {/* Free filter for radius cities */}
                                    {!radiusAreaLoading && selectedRadiusAreaCities.length > 0 && (
                                        <div className="mt-3 max-w-md">
                                            <div className="relative">
                                                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2.5 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    placeholder="סנן רשימה..."
                                                    value={radiusCitiesFilter}
                                                    onChange={(e) => setRadiusCitiesFilter(e.target.value)}
                                                    className="w-full bg-bg-subtle/30 border border-border-default rounded-md py-1.5 pl-2 pr-8 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Cities inside radius – selectable chips */}
                                    {radiusAreaLoading && radiusCity.trim().length >= 2 && (
                                        <div className="mt-3 text-xs text-text-muted">טוען יישובים בטווח...</div>
                                    )}
                                    {!radiusAreaLoading && selectedRadiusAreaCities.length > 0 && (
                                        <div className="mr-6 pt-1 pb-2">
                                            <div className="flex flex-wrap gap-1.5">
                                                {(
                                                    radiusCitiesFilter.trim()
                                                        ? selectedRadiusAreaCities.filter((name) =>
                                                              name.toLowerCase().includes(radiusCitiesFilter.toLowerCase()),
                                                          )
                                                        : showAllRadiusArea
                                                        ? selectedRadiusAreaCities
                                                        : selectedRadiusAreaCities.slice(0, 10)
                                                ).map((name) => (
                                                    <span
                                                        key={name}
                                                        className="inline-flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded-md text-[11px] text-text-default shadow-sm group"
                                                    >
                                                        {name}
                                                        <button
                                                            type="button"
                                                            className="text-text-subtle hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="הסר מהרשימה"
                                                            onClick={() =>
                                                                setSelectedRadiusAreaCities((prev) =>
                                                                    prev.filter((n) => n !== name),
                                                                )
                                                            }
                                                        >
                                                            <XMarkIcon className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                            {radiusCitiesFilter.trim().length === 0 &&
                                                selectedRadiusAreaCities.length > 10 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllRadiusArea((prev) => !prev)}
                                                    className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                                                >
                                                    {showAllRadiusArea
                                                        ? 'הצג פחות'
                                                        : `+ עוד ${selectedRadiusAreaCities.length - 10} יישובים`}
                                                    <ChevronDownIcon
                                                        className={`w-3 h-3 ${showAllRadiusArea ? 'rotate-180' : ''}`}
                                                    />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <button 
                                    onClick={applyRadius}
                                    disabled={!radiusCity}
                                    className="w-full bg-primary-600 text-white font-bold py-2.5 rounded-xl hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    החל חיפוש לפי מרחק
                                </button>
                            </div>
                        )}
                    </div>

                    {activeTab === 'regions' && (
                        <div className="p-3 border-t border-border-default flex justify-between items-center bg-bg-subtle/30 rounded-b-xl">
                            <button onClick={() => onChange([])} className="text-xs font-bold text-text-muted hover:text-red-500 transition-colors">
                                נקה בחירה
                            </button>
                            <button onClick={() => setIsOpen(false)} className="bg-primary-600 text-white text-xs font-bold py-2 px-5 rounded-lg hover:bg-primary-700 transition shadow-sm">
                                אישור ({selectedLocations.length})
                            </button>
                        </div>
                    )}
                </div>
            )}
            
            {/* Summary Bubble Popover */}
            {isSummaryOpen && selectedLocations.length > 0 && (
                 <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-xl shadow-2xl z-50 w-64 p-3 animate-fade-in">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-border-default">
                        <span className="text-sm font-bold text-text-default">ערים ואזורים שנבחרו</span>
                        <button onClick={() => setIsSummaryOpen(false)}><XMarkIcon className="w-4 h-4 text-text-muted hover:text-text-default"/></button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                        {selectedLocations.map((loc, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-md border border-primary-100">
                                {loc.value}
                                <button onClick={() => {
                                    const newLocs = selectedLocations.filter(l => l.value !== loc.value);
                                    onChange(newLocs);
                                    if(newLocs.length === 0) setIsSummaryOpen(false);
                                }} className="hover:text-primary-900"><XMarkIcon className="w-3 h-3"/></button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocationSelector;
