import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, CheckIcon, MinusIcon, MapPinIcon, EyeIcon, XMarkIcon } from './Icons';
import {
    buildCityToRegionMap,
    compressLocationItems,
    fetchAllCityGroups,
    filterLocationGroups,
    groupCityNamesByRegion,
    rowsToLocationGroups,
    type CitySearchRow,
} from '../utils/citySearchApi';

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

// Full hierarchy loaded from GET /api/cities (see LocationSelector)
export const locationHierarchy: LocationGroup[] = [];

const REGION_PREVIEW_LIMIT = 10;

type AreaCityGroupsPanelProps = {
    groups: LocationGroup[];
    expandedRegions: Set<string>;
    onToggleRegionExpand: (region: string) => void;
    regionShowAll: Set<string>;
    onToggleRegionShowAll: (region: string) => void;
    isCitySelected: (city: string) => boolean;
    toggleCity: (city: string) => void;
    isRegionFullySelected: (region: string, cities: string[]) => boolean;
    isRegionPartiallySelected: (region: string, cities: string[]) => boolean;
    toggleRegion: (region: string, cities: string[]) => void;
    emptyMessage?: string;
    loading?: boolean;
    className?: string;
    showRegionSelect?: boolean;
};

const AreaCityGroupsPanel: React.FC<AreaCityGroupsPanelProps> = ({
    groups,
    expandedRegions,
    onToggleRegionExpand,
    regionShowAll,
    onToggleRegionShowAll,
    isCitySelected,
    toggleCity,
    isRegionFullySelected,
    isRegionPartiallySelected,
    toggleRegion,
    emptyMessage = 'לא נמצאו תוצאות',
    loading = false,
    className = '',
    showRegionSelect = true,
}) => {
    if (loading) {
        return <div className="p-4 text-center text-text-muted text-sm">טוען...</div>;
    }
    if (!groups.length) {
        return <div className="p-4 text-center text-text-muted text-sm">{emptyMessage}</div>;
    }
    return (
        <div className={`overflow-y-auto custom-scrollbar p-1 ${className}`}>
            {groups.map((group) => {
                const isExpanded = expandedRegions.has(group.region);
                const showAll = regionShowAll.has(group.region);
                const visibleCities = showAll ? group.cities : group.cities.slice(0, REGION_PREVIEW_LIMIT);
                const hiddenCount = Math.max(0, group.cities.length - visibleCities.length);
                const fullySelected = isRegionFullySelected(group.region, group.cities);
                const partiallySelected = isRegionPartiallySelected(group.region, group.cities);

                return (
                    <div key={group.region} className="mb-1">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => onToggleRegionExpand(group.region)}
                                className="flex-1 flex items-center justify-between p-2 hover:bg-bg-hover rounded-lg transition-colors text-right min-w-0"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                                        <ChevronDownIcon className="w-3 h-3 text-text-muted" />
                                    </div>
                                    <span className="text-xs font-bold text-text-default truncate">{group.region}</span>
                                </div>
                                <span className="text-[10px] text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded flex-shrink-0">
                                    {group.cities.length}
                                </span>
                            </button>
                            {showRegionSelect && (
                                <div
                                    className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors flex-shrink-0 ${
                                        fullySelected
                                            ? 'bg-primary-600 border-primary-600'
                                            : partiallySelected
                                              ? 'bg-primary-100 border-primary-600'
                                              : 'border-border-default bg-white hover:border-primary-400'
                                    }`}
                                    onClick={() => toggleRegion(group.region, group.cities)}
                                    title="בחר/בטל את כל האזור"
                                >
                                    {fullySelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                                    {partiallySelected && <MinusIcon className="w-3.5 h-3.5 text-primary-600" />}
                                </div>
                            )}
                        </div>
                        {isExpanded && (
                            <div className="mr-6 pt-1 pb-2">
                                <div className="flex flex-wrap gap-1.5">
                                    {visibleCities.map((name) => {
                                        const selected = isCitySelected(name);
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => toggleCity(name)}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] shadow-sm border transition-colors ${
                                                    selected
                                                        ? 'bg-primary-600 border-primary-600 text-white'
                                                        : 'bg-white border-border-default text-text-default hover:border-primary-400 hover:bg-primary-50'
                                                }`}
                                                title={selected ? 'הסר מהבחירה' : 'הוסף לבחירה'}
                                            >
                                                {selected && <CheckIcon className="w-3 h-3" />}
                                                {name}
                                            </button>
                                        );
                                    })}
                                </div>
                                {hiddenCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onToggleRegionShowAll(group.region)}
                                        className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                                    >
                                        + עוד {hiddenCount} יישובים
                                        <ChevronDownIcon className="w-3 h-3" />
                                    </button>
                                )}
                                {showAll && group.cities.length > REGION_PREVIEW_LIMIT && (
                                    <button
                                        type="button"
                                        onClick={() => onToggleRegionShowAll(group.region)}
                                        className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                                    >
                                        הצג פחות
                                        <ChevronDownIcon className="w-3 h-3 rotate-180" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

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

    // Full cities hierarchy from GET /api/cities (grouped by area)
    const [allCityGroups, setAllCityGroups] = useState<LocationGroup[]>([]);
    const [allCitiesLoading, setAllCitiesLoading] = useState(false);
    const [regionShowAll, setRegionShowAll] = useState<Set<string>>(new Set());

    // Radius tab – separate from regions tab (search API, flat chips in radius)
    const [radiusCity, setRadiusCity] = useState('');
    const [radiusDist, setRadiusDist] = useState(20);
    const [radiusCityOptionsLoading, setRadiusCityOptionsLoading] = useState(false);
    const [radiusCityGroups, setRadiusCityGroups] = useState<LocationGroup[]>([]);
    const [expandedRadiusRegions, setExpandedRadiusRegions] = useState<Set<string>>(new Set());
    const [radiusRegionShowAll, setRadiusRegionShowAll] = useState<Set<string>>(new Set());
    const [radiusAreaGroups, setRadiusAreaGroups] = useState<LocationGroup[]>([]);
    const [selectedRadiusAreaCities, setSelectedRadiusAreaCities] = useState<string[]>([]);
    const [radiusAreaLoading, setRadiusAreaLoading] = useState(false);
    const [expandedRadiusAreaRegions, setExpandedRadiusAreaRegions] = useState<Set<string>>(new Set());
    const [radiusAreaRegionShowAll, setRadiusAreaRegionShowAll] = useState<Set<string>>(new Set());
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

    const cityToRegion = useMemo(() => buildCityToRegionMap(allCityGroups), [allCityGroups]);

    // Helpers
    const isRegionSelected = (regionName: string) =>
        selectedLocations.some((l) => l.type === 'region' && l.value === regionName);

    const isCitySelected = (city: string) => {
        if (selectedLocations.some((l) => l.type === 'city' && l.value === city)) return true;
        const region = cityToRegion.get(city);
        return region != null && isRegionSelected(region);
    };

    const isRegionFullySelected = (regionName: string, cities: string[]) => {
        if (isRegionSelected(regionName)) return true;
        return cities.length > 0 && cities.every((city) => isCitySelected(city));
    };

    const isRegionPartiallySelected = (regionName: string, cities: string[]) => {
        if (isRegionSelected(regionName)) return false;
        const selectedCount = cities.filter((city) => isCitySelected(city)).length;
        return selectedCount > 0 && selectedCount < cities.length;
    };

    const toggleRegion = (regionName: string, cities: string[]) => {
        let newSelection = selectedLocations.filter((l) => l.type !== 'radius');

        if (isRegionSelected(regionName) || isRegionFullySelected(regionName, cities)) {
            newSelection = newSelection.filter(
                (l) =>
                    !(l.type === 'region' && l.value === regionName) &&
                    !(l.type === 'city' && cities.includes(l.value)),
            );
        } else {
            newSelection = newSelection.filter(
                (l) => !(l.type === 'city' && cities.includes(l.value)),
            );
            newSelection.push({ type: 'region', value: regionName });
        }
        onChange(newSelection);
    };

    const toggleCity = (city: string) => {
        let newSelection = selectedLocations.filter((l) => l.type !== 'radius');
        const region = cityToRegion.get(city);
        const group = region ? allCityGroups.find((g) => g.region === region) : undefined;

        if (isCitySelected(city)) {
            if (region && isRegionSelected(region) && group) {
                newSelection = newSelection.filter(
                    (l) => !(l.type === 'region' && l.value === region),
                );
                const toAdd = group.cities
                    .filter((c) => c !== city)
                    .map((c) => ({ type: 'city' as const, value: c }));
                newSelection = [
                    ...newSelection.filter(
                        (l) => !(l.type === 'city' && group.cities.includes(l.value)),
                    ),
                    ...toAdd,
                ];
            } else {
                newSelection = newSelection.filter((l) => !(l.type === 'city' && l.value === city));
            }
        } else {
            newSelection = newSelection.filter((l) => !(l.type === 'city' && l.value === city));
            newSelection.push({ type: 'city', value: city });
            if (group && group.cities.every((c) => isCitySelected(c) || c === city)) {
                newSelection = newSelection.filter(
                    (l) => !(l.type === 'city' && group.cities.includes(l.value)),
                );
                newSelection.push({ type: 'region', value: group.region });
            }
        }
        onChange(newSelection);
    };

    const confirmSelection = () => {
        const compressed = compressLocationItems(selectedLocations, allCityGroups);
        if (JSON.stringify(compressed) !== JSON.stringify(selectedLocations)) {
            onChange(compressed);
        }
        setIsOpen(false);
    };

    const toggleExpand = (regionName: string) => {
        setExpandedRegions((prev) => {
            const next = new Set(prev);
            if (next.has(regionName)) next.delete(regionName);
            else next.add(regionName);
            return next;
        });
    };

    const toggleRegionShowAll = (regionName: string) => {
        setRegionShowAll((prev) => {
            const next = new Set(prev);
            if (next.has(regionName)) next.delete(regionName);
            else next.add(regionName);
            return next;
        });
    };

    const isRadiusAreaCitySelected = (city: string) => selectedRadiusAreaCities.includes(city);

    const toggleRadiusAreaCity = (city: string) => {
        setSelectedRadiusAreaCities((prev) =>
            prev.includes(city) ? prev.filter((n) => n !== city) : [...prev, city],
        );
    };

    const isRadiusAreaRegionFullySelected = (_region: string, cities: string[]) =>
        cities.length > 0 && cities.every((c) => isRadiusAreaCitySelected(c));

    const isRadiusAreaRegionPartiallySelected = (_region: string, cities: string[]) => {
        const count = cities.filter((c) => isRadiusAreaCitySelected(c)).length;
        return count > 0 && count < cities.length;
    };

    const toggleRadiusAreaRegionSelection = (_region: string, cities: string[]) => {
        const allSelected = isRadiusAreaRegionFullySelected(_region, cities);
        setSelectedRadiusAreaCities((prev) => {
            if (allSelected) {
                const remove = new Set(cities);
                return prev.filter((n) => !remove.has(n));
            }
            const next = new Set(prev);
            cities.forEach((c) => next.add(c));
            return Array.from(next);
        });
    };

    const toggleRadiusAreaRegionExpand = (region: string) => {
        setExpandedRadiusAreaRegions((prev) => {
            const next = new Set(prev);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
        });
    };

    const toggleRadiusAreaRegionShowAll = (region: string) => {
        setRadiusAreaRegionShowAll((prev) => {
            const next = new Set(prev);
            if (next.has(region)) next.delete(region);
            else next.add(region);
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

    // Load full cities hierarchy when dropdown opens
    useEffect(() => {
        if (!isOpen || allCityGroups.length > 0) return;
        let cancelled = false;
        setAllCitiesLoading(true);
        fetchAllCityGroups()
            .then((groups) => {
                if (!cancelled) setAllCityGroups(groups);
            })
            .catch(() => {
                if (!cancelled) setAllCityGroups([]);
            })
            .finally(() => {
                if (!cancelled) setAllCitiesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, allCityGroups.length]);

    // Radius tab: fetch central-city options when user types 2+ characters
    useEffect(() => {
        const q = radiusCity.trim();
        if (q.length < 2) {
            setRadiusCityGroups([]);
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
                    setRadiusCityGroups(rowsToLocationGroups(data as CitySearchRow[]));
                })
                .catch(() => {
                    if (!cancelled) setRadiusCityGroups([]);
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

    useEffect(() => {
        if (radiusCityGroups.length > 0) {
            setExpandedRadiusRegions(new Set(radiusCityGroups.map((g) => g.region)));
            setRadiusRegionShowAll(new Set());
        }
    }, [radiusCityGroups]);

    const toggleRadiusRegion = (region: string) => {
        setExpandedRadiusRegions((prev) => {
            const next = new Set(prev);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
        });
    };

    const toggleRadiusRegionShowAll = (region: string) => {
        setRadiusRegionShowAll((prev) => {
            const next = new Set(prev);
            if (next.has(region)) next.delete(region);
            else next.add(region);
            return next;
        });
    };

    const filteredHierarchy = useMemo(
        () => filterLocationGroups(allCityGroups, searchTerm),
        [allCityGroups, searchTerm],
    );

    const summaryGroups = useMemo(() => {
        const regionItems = selectedLocations.filter((l) => l.type === 'region');
        const names = selectedLocations
            .filter((l) => l.type === 'city')
            .map((l) => l.value);
        const fromRegions = regionItems.flatMap((r) => {
            const group = allCityGroups.find((g) => g.region === r.value);
            return group ? group.cities : [r.value];
        });
        return groupCityNamesByRegion([...names, ...fromRegions], cityToRegion);
    }, [selectedLocations, cityToRegion, allCityGroups]);

    const filteredRadiusAreaGroups = useMemo(
        () => filterLocationGroups(radiusAreaGroups, radiusCitiesFilter),
        [radiusAreaGroups, radiusCitiesFilter],
    );

    const radiusAreaCityCount = useMemo(
        () => radiusAreaGroups.reduce((sum, g) => sum + g.cities.length, 0),
        [radiusAreaGroups],
    );

    // Radius tab: fetch cities inside radius when center city or distance changes
    useEffect(() => {
        const center = radiusCity.trim();
        if (center.length < 2) {
            setRadiusAreaGroups([]);
            setSelectedRadiusAreaCities([]);
            setExpandedRadiusAreaRegions(new Set());
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
                    const groups = rowsToLocationGroups(data as CitySearchRow[]);
                    const names = groups.flatMap((g) => g.cities);
                    setRadiusAreaGroups(groups);
                    setSelectedRadiusAreaCities(names);
                    setExpandedRadiusAreaRegions(new Set(groups.map((g) => g.region)));
                    setRadiusAreaRegionShowAll(new Set());
                })
                .catch(() => {
                    if (!cancelled) {
                        setRadiusAreaGroups([]);
                        setSelectedRadiusAreaCities([]);
                    }
                })
                .finally(() => {
                    if (!cancelled) setRadiusAreaLoading(false);
                });
        }, 200);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [radiusCity, radiusDist]);

    // Expand matching areas only while user is searching (default: collapsed)
    useEffect(() => {
        const q = searchTerm.trim();
        if (!q || filteredHierarchy.length === 0) return;
        setExpandedRegions(new Set(filteredHierarchy.map((g) => g.region)));
        setRegionShowAll(new Set());
    }, [searchTerm, filteredHierarchy]);

    // Display Logic
    const radiusSelection = selectedLocations.find(l => l.type === 'radius');
    const selectedCityNames = useMemo(() => {
        const names: string[] = [];
        for (const loc of selectedLocations) {
            if (loc.type === 'city') names.push(loc.value);
            else if (loc.type === 'region') {
                const group = allCityGroups.find((g) => g.region === loc.value);
                if (group) names.push(...group.cities);
                else names.push(loc.value);
            }
        }
        return names;
    }, [selectedLocations, allCityGroups]);
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
                {selectedCityNames.length > 0 && (
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
                                <AreaCityGroupsPanel
                                    groups={filteredHierarchy}
                                    expandedRegions={expandedRegions}
                                    onToggleRegionExpand={toggleExpand}
                                    regionShowAll={regionShowAll}
                                    onToggleRegionShowAll={toggleRegionShowAll}
                                    isCitySelected={isCitySelected}
                                    toggleCity={toggleCity}
                                    isRegionFullySelected={isRegionFullySelected}
                                    isRegionPartiallySelected={isRegionPartiallySelected}
                                    toggleRegion={toggleRegion}
                                    loading={allCitiesLoading}
                                    emptyMessage={
                                        allCityGroups.length === 0 && !allCitiesLoading
                                            ? 'לא ניתן לטעון ערים'
                                            : 'לא נמצאו תוצאות'
                                    }
                                    className="max-h-[320px]"
                                />
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
                                    <div className="overflow-y-auto custom-scrollbar p-1 max-h-48">
                                        {radiusCity.trim().length < 2 && (
                                            <div className="p-4 text-center text-text-muted text-sm">הקלד לפחות 2 תווים לחיפוש ערים ואזורים</div>
                                        )}
                                        {radiusCity.trim().length >= 2 && radiusCityOptionsLoading && (
                                            <div className="p-4 text-center text-text-muted text-sm">טוען...</div>
                                        )}
                                        {radiusCity.trim().length >= 2 && !radiusCityOptionsLoading && radiusCityGroups.length === 0 && (
                                            <div className="p-4 text-center text-text-muted text-sm">לא נמצאו תוצאות</div>
                                        )}
                                        {radiusCity.trim().length >= 2 && !radiusCityOptionsLoading && radiusCityGroups.map((group) => {
                                            const isExpanded = expandedRadiusRegions.has(group.region);
                                            const showAll = radiusRegionShowAll.has(group.region);
                                            const PREVIEW_LIMIT = 10;
                                            const visibleCities = showAll ? group.cities : group.cities.slice(0, PREVIEW_LIMIT);
                                            const hiddenCount = Math.max(0, group.cities.length - visibleCities.length);

                                            return (
                                                <div key={group.region} className="mb-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleRadiusRegion(group.region)}
                                                        className="w-full flex items-center justify-between p-2 hover:bg-bg-hover rounded-lg transition-colors text-right"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                <ChevronDownIcon className="w-3 h-3 text-text-muted" />
                                                            </div>
                                                            <span className="text-xs font-bold text-text-default">{group.region}</span>
                                                        </div>
                                                        <span className="text-[10px] text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded">
                                                            {group.cities.length}
                                                        </span>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="mr-6 pt-1 pb-2">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {visibleCities.map((name) => {
                                                                    const isSelected = radiusCity === name;
                                                                    return (
                                                                        <button
                                                                            key={name}
                                                                            type="button"
                                                                            onClick={() => setRadiusCity(name)}
                                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] shadow-sm border transition-colors ${
                                                                                isSelected
                                                                                    ? 'bg-primary-600 border-primary-600 text-white'
                                                                                    : 'bg-white border-border-default text-text-default hover:border-primary-400 hover:bg-primary-50'
                                                                            }`}
                                                                            title="בחר כעיר מרכזית"
                                                                        >
                                                                            {isSelected && <CheckIcon className="w-3 h-3" />}
                                                                            {name}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            {hiddenCount > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleRadiusRegionShowAll(group.region)}
                                                                    className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                                                                >
                                                                    + עוד {hiddenCount} יישובים
                                                                    <ChevronDownIcon className="w-3 h-3" />
                                                                </button>
                                                            )}
                                                            {showAll && group.cities.length > PREVIEW_LIMIT && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleRadiusRegionShowAll(group.region)}
                                                                    className="mt-1.5 text-xs font-bold text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                                                                >
                                                                    הצג פחות
                                                                    <ChevronDownIcon className="w-3 h-3 rotate-180" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
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
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-bold text-text-default">
                                            3. יישובים בטווח ({radiusDist} ק&quot;מ)
                                        </label>
                                        {!radiusAreaLoading && radiusAreaCityCount > 0 && (
                                            <span className="text-[10px] text-text-muted bg-bg-subtle px-1.5 py-0.5 rounded">
                                                {selectedRadiusAreaCities.length} / {radiusAreaCityCount}
                                            </span>
                                        )}
                                    </div>
                                    {radiusCity.trim().length < 2 && (
                                        <p className="text-xs text-text-muted">בחר עיר מרכזית כדי לראות יישובים בטווח</p>
                                    )}
                                    {radiusCity.trim().length >= 2 && (
                                        <>
                                            {!radiusAreaLoading && radiusAreaGroups.length > 0 && (
                                                <div className="relative mb-2 max-w-md">
                                                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2.5 top-1/2 -translate-y-1/2" />
                                                    <input
                                                        type="text"
                                                        placeholder="סנן רשימה..."
                                                        value={radiusCitiesFilter}
                                                        onChange={(e) => setRadiusCitiesFilter(e.target.value)}
                                                        className="w-full bg-bg-subtle/30 border border-border-default rounded-md py-1.5 pl-2 pr-8 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                                                    />
                                                </div>
                                            )}
                                            <AreaCityGroupsPanel
                                                groups={filteredRadiusAreaGroups}
                                                expandedRegions={expandedRadiusAreaRegions}
                                                onToggleRegionExpand={toggleRadiusAreaRegionExpand}
                                                regionShowAll={radiusAreaRegionShowAll}
                                                onToggleRegionShowAll={toggleRadiusAreaRegionShowAll}
                                                isCitySelected={isRadiusAreaCitySelected}
                                                toggleCity={toggleRadiusAreaCity}
                                                isRegionFullySelected={isRadiusAreaRegionFullySelected}
                                                isRegionPartiallySelected={isRadiusAreaRegionPartiallySelected}
                                                toggleRegion={toggleRadiusAreaRegionSelection}
                                                loading={radiusAreaLoading}
                                                emptyMessage={
                                                    radiusAreaLoading
                                                        ? 'טוען יישובים בטווח...'
                                                        : 'אין יישובים בטווח זה'
                                                }
                                                className="max-h-52"
                                            />
                                        </>
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

                    <div className="p-3 border-t border-border-default flex justify-between items-center bg-bg-subtle/30 rounded-b-xl">
                        <button onClick={() => onChange([])} className="text-xs font-bold text-text-muted hover:text-red-500 transition-colors">
                            נקה בחירה
                        </button>
                        <button onClick={confirmSelection} className="bg-primary-600 text-white text-xs font-bold py-2 px-5 rounded-lg hover:bg-primary-700 transition shadow-sm">
                            אישור ({selectedLocations.length})
                        </button>
                    </div>
                </div>
            )}
            
            {/* Summary Bubble Popover */}
            {isSummaryOpen && selectedCityNames.length > 0 && (
                 <div className="absolute top-full left-0 mt-1 bg-white border border-border-default rounded-xl shadow-2xl z-50 w-72 p-3 animate-fade-in">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-border-default">
                        <span className="text-sm font-bold text-text-default">ערים ואזורים שנבחרו</span>
                        <button type="button" onClick={() => setIsSummaryOpen(false)}><XMarkIcon className="w-4 h-4 text-text-muted hover:text-text-default"/></button>
                    </div>
                    {radiusSelection && (
                        <p className="text-xs text-text-muted mb-2 pb-2 border-b border-border-subtle">
                            רדיוס: {radiusSelection.value} · {radiusSelection.radius} ק&quot;מ
                        </p>
                    )}
                    <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-3">
                        {summaryGroups.length > 0 ? (
                            summaryGroups.map((group) => (
                                <div key={group.region}>
                                    <p className="text-xs font-bold text-text-default mb-1.5">{group.region}</p>
                                    <div className="flex flex-wrap gap-1.5 mr-1">
                                        {group.cities.map((city) => (
                                            <span
                                                key={city}
                                                className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-md border border-primary-100"
                                            >
                                                {city}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newLocs = selectedLocations.filter(
                                                            (l) => !(l.type === 'city' && l.value === city),
                                                        );
                                                        onChange(newLocs);
                                                        if (newLocs.length === 0) setIsSummaryOpen(false);
                                                    }}
                                                    className="hover:text-primary-900"
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {selectedLocations.map((loc, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded-md border border-primary-100">
                                        {loc.value}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocationSelector;
