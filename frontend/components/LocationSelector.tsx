
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, CheckIcon, MinusIcon, XMarkIcon, EyeIcon, MapPinIcon } from './Icons';

export type LocationType = 'region' | 'city';
export interface LocationItem {
    type: LocationType;
    value: string;
}

// --- DATA ---
export const locationHierarchy = [
  { 
      region: "גוש דן", 
      cities: ["תל אביב-יפו", "רמת גן", "גבעתיים", "בני ברק", "חולון", "בת ים", "פתח תקווה", "קריית אונו", "אור יהודה"] 
  },
  { 
      region: "אזור השרון", 
      cities: ["נתניה", "הרצליה", "כפר סבא", "רעננה", "הוד השרון", "רמת השרון", "חדרה", "קיסריה", "פרדס חנה-כרכור"] 
  },
  { 
      region: "שפלה", 
      cities: ["ראשון לציון", "רחובות", "נס ציונה", "לוד", "רמלה", "מודיעין", "יבנה", "גדרה"] 
  },
  { 
      region: "דרום", 
      cities: ["אשדוד", "אשקלון", "באר שבע", "דימונה", "אילת", "קריית גת", "שדרות", "נתיבות"] 
  },
  { 
      region: "ירושלים והסביבה", 
      cities: ["ירושלים", "בית שמש", "מבשרת ציון", "מעלה אדומים", "מודיעין עילית"] 
  },
  { 
      region: "צפון", 
      cities: ["חיפה", "קריות", "עכו", "נהריה", "כרמיאל", "טבריה", "עפולה", "נצרת", "צפת", "קריית שמונה"] 
  },
];

interface LocationSelectorProps {
    selectedLocations: LocationItem[];
    onChange: (locations: LocationItem[]) => void;
    placeholder?: string;
    className?: string;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({ selectedLocations, onChange, placeholder = 'בחר אזור או עיר...', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isViewSelectedOpen, setIsViewSelectedOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
    
    const containerRef = useRef<HTMLDivElement>(null);
    const viewSelectedRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
            if (viewSelectedRef.current && !viewSelectedRef.current.contains(event.target as Node)) {
                setIsViewSelectedOpen(false);
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
        const allSelected = isRegionFullySelected(regionName, cities);
        let newSelection = [...selectedLocations];
        
        if (allSelected) {
            // Deselect all cities in this region
            newSelection = newSelection.filter(l => !cities.includes(l.value));
        } else {
            // Select all cities in this region (avoid duplicates)
            const citiesToAdd = cities.filter(city => !isCitySelected(city));
            const newItems = citiesToAdd.map(city => ({ type: 'city', value: city } as LocationItem));
            newSelection = [...newSelection, ...newItems];
        }
        onChange(newSelection);
    };

    const toggleCity = (city: string) => {
        let newSelection = [...selectedLocations];
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

    const removeLocation = (value: string) => {
        onChange(selectedLocations.filter(l => l.value !== value));
    };

    // Filter logic
    const filteredHierarchy = useMemo(() => {
        if (!searchTerm) return locationHierarchy;
        return locationHierarchy.map(group => {
            const matchesRegion = group.region.includes(searchTerm);
            const matchingCities = group.cities.filter(c => c.includes(searchTerm));
            
            if (matchesRegion) return group; // Return full group if region matches
            if (matchingCities.length > 0) return { ...group, cities: matchingCities }; // Return subset if cities match
            return null;
        }).filter(Boolean) as typeof locationHierarchy;
    }, [searchTerm]);
    
    // Auto-expand on search
    useEffect(() => {
        if (searchTerm) {
            setExpandedRegions(new Set(filteredHierarchy.map(g => g.region)));
        }
    }, [searchTerm, filteredHierarchy]);

    const displayValue = selectedLocations.length > 0 
        ? `${selectedLocations.length} מיקומים נבחרו` 
        : placeholder;

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {/* Input Trigger */}
            <div className="relative group">
                <button 
                    type="button"
                    onClick={() => setIsOpen(!isOpen)} 
                    className={`w-full bg-bg-input border ${isOpen ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'} rounded-xl py-2.5 pl-3 pr-3 text-sm flex justify-between items-center text-right hover:border-primary-300 transition-colors h-[42px]`}
                >
                    <span className={`truncate ${selectedLocations.length > 0 ? 'text-text-default font-medium' : 'text-text-muted'}`}>
                        {displayValue}
                    </span>
                    <div className="flex items-center gap-2">
                        {/* Eye Icon to view selection */}
                        {selectedLocations.length > 0 && (
                            <div 
                                className="p-1 rounded-full hover:bg-primary-100 text-primary-600 transition-colors cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsViewSelectedOpen(!isViewSelectedOpen);
                                    setIsOpen(false); // Close main dropdown if opening view
                                }}
                                title="צפה ברשימה המלאה"
                            >
                                <EyeIcon className="w-4 h-4" />
                            </div>
                        )}
                        <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </button>
            </div>

            {/* Main Hierarchy Popover */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-1 bg-bg-card border border-border-default rounded-xl shadow-2xl z-50 w-80 flex flex-col max-h-[400px] animate-fade-in">
                    <div className="p-3 border-b border-border-default bg-bg-subtle/30 rounded-t-xl sticky top-0 z-10 backdrop-blur-sm">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="חפש עיר או אזור..." 
                                className="w-full bg-bg-input border border-border-default rounded-lg py-1.5 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                        {filteredHierarchy.map(group => {
                            const isFullySelected = isRegionFullySelected(group.region, group.cities);
                            const isPartiallySelected = isRegionPartiallySelected(group.region, group.cities);
                            const isExpanded = expandedRegions.has(group.region);

                            return (
                                <div key={group.region} className="rounded-lg overflow-hidden">
                                    {/* Region Row */}
                                    <div className={`flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors ${isExpanded ? 'bg-bg-subtle/50' : ''}`} onClick={() => toggleExpand(group.region)}>
                                        <div className="flex items-center gap-2 flex-1">
                                            <ChevronDownIcon className={`w-3.5 h-3.5 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            <span className="font-bold text-sm text-text-default">{group.region}</span>
                                        </div>
                                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                            <div 
                                                className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                                                    isFullySelected ? 'bg-primary-600 border-primary-600' : 
                                                    isPartiallySelected ? 'bg-primary-100 border-primary-600' : 
                                                    'border-border-default bg-bg-card hover:border-primary-400'
                                                }`}
                                                onClick={() => toggleRegion(group.region, group.cities)}
                                            >
                                                {isFullySelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                                                {isPartiallySelected && <MinusIcon className="w-3.5 h-3.5 text-primary-600" />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Cities List */}
                                    {isExpanded && (
                                        <div className="mr-3 pl-2 border-r-2 border-border-default space-y-0.5 mt-1 mb-2">
                                            {group.cities.map(city => {
                                                const selected = isCitySelected(city);
                                                return (
                                                    <div key={city} className="flex items-center justify-between p-1.5 pr-3 hover:bg-bg-hover rounded-md cursor-pointer group/city" onClick={() => toggleCity(city)}>
                                                        <span className={`text-sm ${selected ? 'text-primary-700 font-medium' : 'text-text-muted'}`}>{city}</span>
                                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-primary-600 border-primary-600' : 'border-border-default bg-bg-card group-hover/city:border-primary-400'}`}>
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
                        {filteredHierarchy.length === 0 && <div className="p-4 text-center text-text-muted text-sm">לא נמצאו תוצאות</div>}
                    </div>

                    <div className="p-3 border-t border-border-default flex justify-between items-center bg-bg-subtle/30 rounded-b-xl">
                        <button onClick={() => onChange([])} className="text-xs font-bold text-text-muted hover:text-red-500 transition-colors">
                            נקה הכל
                        </button>
                        <button onClick={() => setIsOpen(false)} className="bg-primary-600 text-white text-xs font-bold py-1.5 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm">
                            סגור
                        </button>
                    </div>
                </div>
            )}

            {/* "View Selected" Popover */}
            {isViewSelectedOpen && (
                <div ref={viewSelectedRef} className="absolute top-full right-0 mt-1 bg-bg-card border border-border-default rounded-xl shadow-2xl z-50 w-72 p-3 animate-fade-in">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-border-subtle">
                         <h4 className="text-sm font-bold text-text-default flex items-center gap-1.5">
                            <MapPinIcon className="w-4 h-4 text-primary-500" />
                            רשימת מיקומים
                        </h4>
                        <button onClick={() => setIsViewSelectedOpen(false)}><XMarkIcon className="w-4 h-4 text-text-muted hover:text-text-default"/></button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                        {selectedLocations.map(loc => (
                            <span key={loc.value} className="inline-flex items-center gap-1 bg-primary-50 text-primary-800 text-xs font-medium px-2 py-1 rounded-md border border-primary-100">
                                {loc.value}
                                <button onClick={() => removeLocation(loc.value)} className="hover:text-red-500 focus:outline-none">
                                    <XMarkIcon className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                    {selectedLocations.length === 0 && <p className="text-xs text-text-muted text-center py-2">לא נבחרו מיקומים</p>}
                </div>
            )}
        </div>
    );
};

export default LocationSelector;
