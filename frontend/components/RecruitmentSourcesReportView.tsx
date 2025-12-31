
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Cog6ToothIcon, DocumentArrowDownIcon, FunnelIcon, UserGroupIcon, CheckBadgeIcon, ChartBarIcon, ArrowPathIcon, TableCellsIcon } from './Icons';

// --- TYPES ---
interface SourceReport {
  id: number;
  sourceName: string;
  initial: number;
  current: number;
  candidates: number;
  placements: number;
  referrals: number;
  accepted: number;
}

// --- MOCK DATA ---
const sourcesList = [
  'AllJobs',
  'LinkedIn',
  'JobMaster',
  'חבר מביא חבר',
  'Facebook',
  'Indeed',
  'פורטל דרושים',
  'Jobhunt',
  'JobNet',
  'mploy',
  'techit',
  'ג\'וב קרוב',
  'הומלס',
  'יבוא',
  'לשכת התעסוקה',
  'מובטל',
  'נגב ג\'ובס',
  'סחבק',
  'ע.יזומה - ווצאפים',
  'ע.יזומה - פייסבוק',
  'Hiro',
  '(לא מוגדר)',
  '(לא מזוהה)',
];

const mockSourceReportData: SourceReport[] = sourcesList.map((source, index) => {
    // Generate somewhat realistic data based on source popularity
    const isPopular = ['AllJobs', 'LinkedIn', 'JobMaster', 'חבר מביא חבר'].includes(source);
    const base = isPopular ? 1000 : 50;
    
    const candidates = Math.floor(Math.random() * base * 2) + base;
    const placements = Math.floor(candidates * (Math.random() * 0.1 + 0.05)); // 5-15% placement rate
    const referrals = Math.floor(candidates * 0.4);
    const accepted = Math.floor(placements * 0.8);
    
    return {
        id: index + 1,
        sourceName: source,
        initial: Math.floor(candidates * 0.9),
        current: Math.floor(candidates * 0.1),
        candidates: candidates,
        placements: placements,
        referrals: referrals,
        accepted: accepted,
    };
});

// Columns configuration
const allColumns: { key: keyof SourceReport; label: string; isNumeric: boolean }[] = [
    { key: 'sourceName', label: 'מקור גיוס', isNumeric: false },
    { key: 'candidates', label: 'סה"כ מועמדים', isNumeric: true },
    { key: 'referrals', label: 'הפניות ללקוח', isNumeric: true },
    { key: 'placements', label: 'קליטות (השמות)', isNumeric: true },
    { key: 'accepted', label: 'התקבלו', isNumeric: true },
    { key: 'current', label: 'פעילים כרגע', isNumeric: true },
    { key: 'initial', label: 'בסינון ראשוני', isNumeric: true },
];

const defaultVisibleColumns = allColumns.map(c => c.key);

// --- COMPONENTS ---

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
    <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
        <div>
            <p className="text-sm font-semibold text-text-muted mb-1">{title}</p>
            <p className="text-2xl font-extrabold text-text-default">{value.toLocaleString()}</p>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

const VisualBar: React.FC<{ value: number; max: number; colorClass?: string }> = ({ value, max, colorClass = "bg-primary-200" }) => {
    const width = Math.max((value / max) * 100, 2); // Minimum 2% width for visibility
    return (
        <div className="flex items-center gap-2 w-full">
            <span className="text-sm font-semibold w-10 text-left tabular-nums">{value.toLocaleString()}</span>
            <div className="flex-1 h-2 bg-bg-subtle rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }}></div>
            </div>
        </div>
    );
};

const TopSourcesChart: React.FC<{ data: SourceReport[] }> = ({ data }) => {
    const top5 = [...data].sort((a, b) => b.candidates - a.candidates).slice(0, 5);
    const maxVal = Math.max(...top5.map(d => d.candidates));

    return (
        <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm h-full">
            <h3 className="text-lg font-bold text-text-default mb-6">מקורות מובילים (נפח מועמדים)</h3>
            <div className="space-y-4">
                {top5.map((item) => (
                    <div key={item.id} className="group">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-text-default">{item.sourceName}</span>
                            <span className="text-text-muted">{item.candidates}</span>
                        </div>
                        <div className="w-full bg-bg-subtle rounded-full h-2.5 overflow-hidden">
                            <div 
                                className="bg-primary-500 h-full rounded-full transition-all duration-1000 ease-out group-hover:bg-primary-600" 
                                style={{ width: `${(item.candidates / maxVal) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const RecruitmentSourcesReportView: React.FC = () => {
    const today = new Date();
    const defaultEndDate = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    const defaultStartDate = thirtyDaysAgo.toISOString().split('T')[0];

    const [filters, setFilters] = useState({
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        source: 'הכל',
    });
    
    // For highlighting the active preset button
    const [activePreset, setActivePreset] = useState<'month' | 'week' | 'today' | 'quarter' | 'custom'>('month');
    
    const [sortConfig, setSortConfig] = useState<{ key: keyof SourceReport; direction: 'asc' | 'desc' } | null>({ key: 'candidates', direction: 'desc' });
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (e.target.name === 'startDate' || e.target.name === 'endDate') {
            setActivePreset('custom');
        }
    };

    const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        const end = new Date();
        const start = new Date();
        
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);
        
        // For 'today', start remains same as end (roughly, ignoring hours for this simple logic)
        
        setFilters(prev => ({
            ...prev,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
        setActivePreset(preset);
    };

    const sortedData = useMemo(() => {
        let sortableItems = [...mockSourceReportData];
        if (filters.source !== 'הכל') {
            sortableItems = sortableItems.filter(s => s.sourceName === filters.source);
        }

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                     return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [sortConfig, filters]);
    
    const requestSort = (key: keyof SourceReport) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof SourceReport) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
    };
    
    const handleColumnToggle = (columnKey: string) => {
        setVisibleColumns(prev => {
            const isVisible = prev.includes(columnKey);
            if (isVisible) {
                return prev.length > 1 ? prev.filter(key => key !== columnKey) : prev;
            } else {
                const columnToAdd = allColumns.find(c => c.key === columnKey);
                if (columnToAdd) {
                    const newColumns = [...prev, columnKey];
                    // Keep original order logic if needed, or append
                    return newColumns;
                }
                return prev;
            }
        });
    };

    const handleDragStart = (index: number, colKey: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colKey);
    };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newVisibleColumns = [...visibleColumns];
        const draggedItem = newVisibleColumns.splice(dragItemIndex.current, 1)[0];
        newVisibleColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newVisibleColumns);
    };
    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };
    
    // Summary Stats
    const totalCandidates = sortedData.reduce((acc, curr) => acc + curr.candidates, 0);
    const totalPlacements = sortedData.reduce((acc, curr) => acc + curr.placements, 0);
    const totalReferrals = sortedData.reduce((acc, curr) => acc + curr.referrals, 0);
    const maxCandidates = Math.max(...sortedData.map(d => d.candidates));
    const maxPlacements = Math.max(...sortedData.map(d => d.placements));

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-2">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
             
             {/* Header Section */}
             <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
                <div>
                     <h1 className="text-2xl font-extrabold text-text-default">דוח מקורות גיוס</h1>
                     <p className="text-text-muted text-sm mt-1">ניתוח ביצועים לפי מקור הגעה לפרק זמן נבחר</p>
                </div>
                
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3 bg-bg-card p-2 rounded-xl border border-border-default shadow-sm w-full md:w-auto">
                    {/* Date Presets */}
                    <div className="flex bg-bg-subtle p-1 rounded-lg border border-border-default mr-2">
                        <button onClick={() => applyDatePreset('today')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'today' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>היום</button>
                        <button onClick={() => applyDatePreset('week')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'week' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>השבוע</button>
                        <button onClick={() => applyDatePreset('month')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'month' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>החודש</button>
                        <button onClick={() => applyDatePreset('quarter')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activePreset === 'quarter' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>רבעון</button>
                    </div>

                    <div className="relative">
                         <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מתאריך</span>
                         <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"/>
                    </div>
                    <div className="relative">
                         <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">עד תאריך</span>
                         <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"/>
                    </div>
                     <div className="relative">
                         <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מקור ספציפי</span>
                         <select name="source" value={filters.source} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm w-40 focus:ring-1 focus:ring-primary-500 outline-none h-[38px]">
                            <option value="הכל">הצג הכל</option>
                            {sourcesList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <button className="bg-primary-600 text-white p-2 rounded-lg hover:bg-primary-700 transition shadow-sm h-[38px] w-[38px] flex items-center justify-center">
                        <ArrowPathIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="סה״כ מועמדים" 
                    value={totalCandidates} 
                    icon={<UserGroupIcon className="w-6 h-6 text-primary-600" />} 
                    color="bg-primary-100" 
                />
                <StatCard 
                    title="הפניות ללקוחות" 
                    value={totalReferrals} 
                    icon={<ArrowPathIcon className="w-6 h-6 text-blue-600" />} 
                    color="bg-blue-100" 
                />
                <StatCard 
                    title="קליטות (השמות)" 
                    value={totalPlacements} 
                    icon={<CheckBadgeIcon className="w-6 h-6 text-green-600" />} 
                    color="bg-green-100" 
                />
                <StatCard 
                    title="יחס המרה (ממוצע)" 
                    value={`${((totalPlacements / totalCandidates) * 100).toFixed(1)}%`} 
                    icon={<ChartBarIcon className="w-6 h-6 text-orange-600" />} 
                    color="bg-orange-100" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
                {/* Visual Chart */}
                <div className="lg:col-span-1 h-full">
                     <TopSourcesChart data={sortedData} />
                </div>

                {/* Data Table */}
                <div className="lg:col-span-2 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col h-full">
                    <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                        <div className="flex items-center gap-2">
                             <TableCellsIcon className="w-5 h-5 text-text-muted"/>
                             <h3 className="font-bold text-text-default">פירוט נתונים</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><DocumentArrowDownIcon className="w-5 h-5"/></button>
                            <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                        <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {allColumns.map(column => (
                                            <label key={column.key} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={visibleColumns.includes(column.key as string)}
                                                onChange={() => handleColumnToggle(column.key as string)}
                                                className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                                            />
                                            {column.label}
                                            </label>
                                        ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="bg-bg-subtle/80 text-text-muted font-bold sticky top-0 z-10 backdrop-blur-md">
                                <tr>
                                    {visibleColumns.map((colKey, index) => {
                                        const col = allColumns.find(c => c.key === colKey);
                                        if (!col) return null;
                                        return (
                                            <th 
                                                key={col.key} 
                                                className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.key ? 'dragging' : ''}`}
                                                onClick={() => requestSort(col.key)}
                                                draggable
                                                onDragStart={() => handleDragStart(index, col.key as string)}
                                                onDragEnter={() => handleDragEnter(index)}
                                                onDragEnd={handleDragEnd}
                                                onDrop={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>{col.label}</span>
                                                    {getSortIndicator(col.key)}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-default">
                            {sortedData.map(row => (
                                <tr key={row.id} className="hover:bg-bg-hover/50 transition-colors group">
                                    {visibleColumns.map(colKey => {
                                        const col = allColumns.find(c => c.key === colKey);
                                        if (!col) return null;
                                        
                                        // Visual enhancement for specific columns
                                        if (colKey === 'candidates') {
                                            return (
                                                <td key={colKey} className="p-3 pr-4">
                                                    <VisualBar value={row.candidates} max={maxCandidates} colorClass="bg-primary-500" />
                                                </td>
                                            );
                                        }
                                         if (colKey === 'placements') {
                                            return (
                                                <td key={colKey} className="p-3 pr-4">
                                                    <VisualBar value={row.placements} max={maxPlacements} colorClass="bg-green-500" />
                                                </td>
                                            );
                                        }

                                        return (
                                            <td key={col.key} className={`p-4 ${col.key === 'sourceName' ? 'text-text-default font-bold' : 'text-text-default'}`}>
                                                {row[col.key as keyof SourceReport].toLocaleString()}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecruitmentSourcesReportView;
