
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Cog6ToothIcon, AvatarIcon, TableCellsIcon, Squares2X2Icon, BuildingOffice2Icon, MapPinIcon, CalendarIcon, BriefcaseIcon } from './Icons';

type ExperienceInput = string | {
  id?: string | number;
  title?: string;
  company?: string;
  industry?: string;
  field?: string;
  yearsOfExperience?: number;
  yearsAgo?: number;
  tags?: string[];
  type?: string;
  size?: string;
  startDate?: string;
  endDate?: string;
  companyField?: string;
  description?: string;
  location?: string;
};

type ExperienceItem = {
  id: string;
  company: string;
  industry: string;
  field: string;
  yearsOfExperience: number;
  yearsAgo: number;
  tags: string[];
  type: string;
  size: string;
  description: string;
};

const allColumns = [
  { id: 'company', header: 'חברה' },
  { id: 'industry', header: 'תעשייה' },
  { id: 'yearsOfExperience', header: 'מס׳ שנים' },
  { id: 'yearsAgo', header: 'לפני כמה שנים' },
  { id: 'tags', header: 'תגיות ניסיון' },
  { id: 'field', header: 'תחום עיסוק' },
  { id: 'type', header: 'סוג חברה' },
  { id: 'size', header: 'גודל' },
];

const defaultVisibleColumns = ['company', 'industry', 'yearsOfExperience', 'yearsAgo', 'tags'];

const ExperienceTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="bg-primary-50 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-md border border-primary-100">
    {children}
  </span>
);

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

const ExperienceCard: React.FC<{ item: ExperienceItem }> = ({ item }) => (
    <div className="bg-bg-card rounded-xl border border-border-default shadow-sm p-4 hover:shadow-md transition-all duration-200">
        <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm">
                     <AvatarIcon initials={getInitials(item.company)} size={40} fontSize={16} bgClassName="fill-secondary-100" textClassName="fill-secondary-800 font-bold" />
                </div>
                <div>
                    <h3 className="font-bold text-text-default">{item.company}</h3>
                    <p className="text-xs text-text-muted">{item.industry} &bull; {item.field}</p>
                </div>
            </div>
            <span className="bg-bg-subtle text-text-default text-xs font-semibold px-2 py-1 rounded-full border border-border-default">
                {item.yearsOfExperience} שנים
            </span>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm text-text-muted mb-3">
             <div className="flex items-center gap-1.5">
                 <MapPinIcon className="w-4 h-4 text-text-subtle"/>
                 <span>{item.field || 'לא צוין'}</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <BriefcaseIcon className="w-4 h-4 text-text-subtle"/>
                 <span>{item.type || '—'}</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <BuildingOffice2Icon className="w-4 h-4 text-text-subtle"/>
                 <span>{item.size ? `${item.size} עובדים` : '—'}</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <CalendarIcon className="w-4 h-4 text-text-subtle"/>
                 <span>לפני {item.yearsAgo} שנים</span>
             </div>
        </div>

        {item.description && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
                <p className="text-sm text-text-muted leading-relaxed">{item.description}</p>
        </div>
        )}
    </div>
);

const IndustryExperienceTable: React.FC<{ experiences?: ExperienceInput[] }> = ({ experiences = [] }) => {
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  
  const settingsRef = useRef<HTMLDivElement>(null);
  const dragItemIndex = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  const normalizedData: ExperienceItem[] = useMemo(() => {
    const nowYear = new Date().getFullYear();
    return experiences.map((exp, idx) => {
      if (typeof exp === 'string') {
        return {
          id: (idx + 1).toString(),
          company: exp.slice(0, 40) || 'חברה',
          industry: 'לא צוין',
          field: '',
          yearsOfExperience: 1,
          yearsAgo: 0,
          tags: [],
          type: '',
          size: '',
          location: '',
        };
      }
      const sy = exp.startDate ? new Date(exp.startDate).getFullYear() : undefined;
      const ey = exp.endDate && exp.endDate !== 'Present' ? new Date(exp.endDate).getFullYear() : nowYear;
      const years = sy && ey ? Math.max(1, ey - sy + 1) : (exp.yearsOfExperience || 1);
      const yearsAgo = ey ? Math.max(0, nowYear - ey) : (exp.yearsAgo || 0);
      return {
        id: (exp.id || idx + 1).toString(),
        company: exp.company || exp.title || 'חברה',
      industry: exp.companyField || exp.industry || 'לא צוין',
        field: exp.field || '',
        yearsOfExperience: years,
        yearsAgo: yearsAgo,
        tags: Array.isArray(exp.tags) ? exp.tags : [],
        type: exp.type || '',
        size: exp.size || '',
      description: exp.description || '',
      };
    });
  }, [experiences]);

  const sortedData = useMemo(() => {
    let sortableItems = [...normalizedData];
    if (sortConfig !== null) {
        sortableItems.sort((a, b) => {
            const aVal = (a as any)[sortConfig.key];
            const bVal = (b as any)[sortConfig.key];
            
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return sortableItems;
  }, [sortConfig, normalizedData]);

  const handleColumnToggle = (columnId: string) => {
    setVisibleColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...allColumns.filter(c => prev.includes(c.id) || c.id === columnId).map(c => c.id)]
    );
  };
  
  const handleDragStart = (index: number, colId: string) => { 
      dragItemIndex.current = index;
      setDraggingColumn(colId);
  };
  
  const handleDragEnter = (index: number) => {
      if (dragItemIndex.current === null || dragItemIndex.current === index) return;
      const newColumns = [...visibleColumns];
      const draggedItem = newColumns.splice(dragItemIndex.current, 1)[0];
      newColumns.splice(index, 0, draggedItem);
      dragItemIndex.current = index;
      setVisibleColumns(newColumns);
  };
  
  const handleDragEnd = () => { 
      dragItemIndex.current = null;
      setDraggingColumn(null);
  };

  const renderCellContent = (item: ExperienceItem, columnId: string) => {
      switch (columnId) {
          case 'company':
              return (
                  <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden shadow-sm border border-border-subtle">
                        <AvatarIcon initials={getInitials(item.company)} size={32} fontSize={12} bgClassName="fill-secondary-50" textClassName="fill-secondary-700 font-bold" />
                      </div>
                      <span className="font-semibold text-text-default">{item.company}</span>
                  </div>
              );
          case 'tags':
              return (
                  <p className="text-sm leading-relaxed text-text-default max-w-[260px] whitespace-pre-line">
                      {item.description || '—'}
                  </p>
              );
          case 'yearsOfExperience':
              return <span className="font-bold text-primary-600">{item.yearsOfExperience}</span>;
          case 'yearsAgo':
              return <span>{item.yearsAgo === 0 ? 'נוכחי' : item.yearsAgo}</span>;
          default:
              // @ts-ignore
              return item[columnId];
      }
  };

  return (
    <div className="flex flex-col h-full">
        <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
        
        <div className="flex justify-between items-center mb-4 px-1">
            <div className="text-sm text-text-muted">
                נמצאו <span className="font-bold text-text-default">{normalizedData.length}</span> רשומות
            </div>
            <div className="flex items-center gap-2">
                 <div className="flex items-center bg-bg-subtle p-1 rounded-lg border border-border-subtle">
                    <button onClick={() => setViewMode('table')} title="תצוגת טבלה" className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                    <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                </div>
                
                <div className="relative" ref={settingsRef}>
                    <button 
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                    className="p-2 text-text-muted hover:text-primary-600 hover:bg-bg-hover rounded-lg border border-transparent hover:border-border-subtle transition-all"
                    title="התאם עמודות"
                    >
                    <Cog6ToothIcon className="w-5 h-5" />
                    </button>
                    {isSettingsOpen && (
                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4 animate-fade-in">
                        <p className="font-bold text-text-default mb-3 text-sm border-b border-border-subtle pb-2">הצג עמודות</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                        {allColumns.map(column => (
                            <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer hover:bg-bg-subtle p-1 rounded">
                            <input
                                type="checkbox"
                                checked={visibleColumns.includes(column.id)}
                                onChange={() => handleColumnToggle(column.id)}
                                className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                            />
                            {column.header}
                            </label>
                        ))}
                        </div>
                    </div>
                    )}
                </div>
            </div>
        </div>

        <div className="flex-1 overflow-hidden">
            {viewMode === 'table' ? (
                 <div className="overflow-x-auto border border-border-default rounded-xl h-full bg-bg-card">
                    <table className="w-full text-sm text-right text-text-muted">
                        <thead className="text-xs text-text-default uppercase bg-bg-subtle/50 sticky top-0 z-10 backdrop-blur-sm">
                        <tr>
                            {visibleColumns.map((colId, index) => {
                                const column = allColumns.find(c => c.id === colId);
                                if (!column) return null;
                                return (
                                    <th 
                                        key={column.id} 
                                        scope="col" 
                                        className={`px-4 py-3 whitespace-nowrap font-bold cursor-pointer hover:bg-bg-subtle transition-colors ${draggingColumn === column.id ? 'dragging' : ''}`}
                                        onClick={() => requestSort(column.id)}
                                        draggable
                                        onDragStart={() => handleDragStart(index, column.id)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDragEnd={handleDragEnd}
                                        onDrop={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                    >
                                        <div className="flex items-center gap-1">
                                            {column.header}
                                            {getSortIndicator(column.id)}
                                        </div>
                                    </th>
                                );
                            })}
                            <th scope="col" className="px-2 py-3 sticky left-0 bg-bg-subtle/50 backdrop-blur-sm w-8"></th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {sortedData.map((item) => (
                            <tr key={item.id} className="bg-bg-card hover:bg-bg-hover/50 transition-colors group">
                            {visibleColumns.map(colId => (
                                <td
                                    key={colId}
                                    className="px-4 py-3 whitespace-nowrap"
                                >
                                    {renderCellContent(item, colId)}
                                </td>
                            ))}
                            <td className="px-2 py-3 sticky left-0 bg-bg-card group-hover:bg-bg-hover/50 transition-colors w-8"></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto h-full pr-2 pb-2 custom-scrollbar">
                    {sortedData.map(item => (
                        <ExperienceCard key={item.id} item={item} />
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};

export default IndustryExperienceTable;
