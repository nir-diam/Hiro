
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon, CheckIcon, MinusIcon, MapPinIcon, EyeIcon, XMarkIcon } from './Icons';

export type LocationType = 'region' | 'city' | 'radius';
export interface LocationItem {
    type: LocationType;
    value: string;
    radius?: number;
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

const allCitiesFlat = locationHierarchy.flatMap(r => r.cities).sort();

interface LocationSelectorProps {
    selectedLocations: LocationItem[];
    onChange: (locations: LocationItem[]) => void;
    placeholder?: string;
    className?: string;
}

const LocationSelector: React.FC<LocationSelectorProps> = ({ selectedLocations, onChange, placeholder = 'מיקום', className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'regions' | 'radius'>('regions');
    
    // Search / Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
    
    // Radius Logic
    const [radiusCity, setRadiusCity] = useState('');
    const [radiusDist, setRadiusDist] = useState(20);
    
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
        if (radiusCity) {
            onChange([{ type: 'radius', value: radiusCity, radius: radiusDist }]);
            setIsOpen(false);
        }
    };

    const filteredHierarchy = useMemo(() => {
        if (!searchTerm) return locationHierarchy;
        return locationHierarchy.map(group => {
            const matchesRegion = group.region.includes(searchTerm);
            const matchingCities = group.cities.filter(c => c.includes(searchTerm));
            
            if (matchesRegion) return group; 
            if (matchingCities.length > 0) return { ...group, cities: matchingCities };
            return null;
        }).filter(Boolean) as typeof locationHierarchy;
    }, [searchTerm]);
    
    useEffect(() => {
        if (searchTerm) {
            setExpandedRegions(new Set(filteredHierarchy.map(g => g.region)));
        }
    }, [searchTerm, filteredHierarchy]);

    // Display Logic
    const radiusSelection = selectedLocations.find(l => l.type === 'radius');
    let displayValue = placeholder;
    
    if (radiusSelection) {
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
                <div className="absolute top-full right-0 mt-1 bg-white border border-border-default rounded-xl shadow-2xl z-50 w-[300px] md:w-[350px] flex flex-col max-h-[450px] animate-fade-in overflow-hidden">
                    <div className="flex border-b border-border-default bg-bg-subtle/30">
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
                                    {filteredHierarchy.map(group => {
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
                                    {filteredHierarchy.length === 0 && <div className="p-4 text-center text-text-muted text-sm">לא נמצאו תוצאות</div>}
                                </div>
                            </>
                        )}

                        {activeTab === 'radius' && (
                            <div className="p-4 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-text-default mb-2">1. בחר עיר מרכזית</label>
                                    <div className="relative">
                                        <input 
                                            list="cities-datalist"
                                            type="text"
                                            value={radiusCity}
                                            onChange={(e) => setRadiusCity(e.target.value)}
                                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                                            placeholder="לדוגמה: תל אביב"
                                        />
                                        <datalist id="cities-datalist">
                                            {allCitiesFlat.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-bold text-text-default">2. טווח (רדיוס)</label>
                                        <span className="text-sm font-bold text-primary-600 bg-primary-50 px-2 py-0.5 rounded">{radiusDist} ק"מ</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="5" 
                                        max="100" 
                                        step="5" 
                                        value={radiusDist} 
                                        onChange={(e) => setRadiusDist(Number(e.target.value))}
                                        className="w-full accent-primary-600 h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-xs text-text-muted mt-1">
                                        <span>5 ק"מ</span>
                                        <span>100 ק"מ</span>
                                    </div>
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
