
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Cog6ToothIcon, AvatarIcon, TableCellsIcon, Squares2X2Icon, BuildingOffice2Icon, MapPinIcon, CalendarIcon, BriefcaseIcon } from './Icons';

export const experienceData = [
  {
    id: 1,
    company: 'תנובה',
    industry: 'תעשייה וייצור',
    field: 'מזון',
    yearsOfExperience: 5,
    yearsAgo: 1,
    tags: ['ייצור', 'לוגיסטיקה', 'בקרת איכות'],
    type: 'פרטית',
    size: '5000+',
    location: 'רחובות',
  },
  {
    id: 2,
    company: 'נתיבי הגז הטבעי',
    industry: 'אנרגיה וסביבה',
    field: 'תשתיות גז',
    yearsOfExperience: 3,
    yearsAgo: 6,
    tags: ['גז טבעי', 'תשתיות', 'הולכה'],
    type: 'ממשלתית',
    size: '11–50',
    location: 'קיסריה',
  },
  {
    id: 3,
    company: 'אלביט מערכות',
    industry: 'תעשייה וייצור',
    field: 'ביטחוני',
    yearsOfExperience: 8,
    yearsAgo: 2,
    tags: ['פיתוח', 'בקרת איכות', 'אלקטרוניקה'],
    type: 'ציבורית',
    size: '10000+',
    location: 'חיפה',
  },
  {
    id: 4,
    company: 'בנק הפועלים',
    industry: 'פיננסים',
    field: 'בנקאות',
    yearsOfExperience: 10,
    yearsAgo: 0,
    tags: ['שירות לקוחות', 'השקעות', 'אשראי'],
    type: 'ציבורית',
    size: '5000+',
    location: 'תל אביב',
  },
  {
    id: 5,
    company: 'Wix',
    industry: 'טכנולוגיה',
    field: 'פיתוח web',
    yearsOfExperience: 4,
    yearsAgo: 3,
    tags: ['React', 'Node.js', 'UI/UX'],
    type: 'ציבורית',
    size: '1001-5000',
    location: 'תל אביב',
  },
  {
    id: 6,
    company: 'שופרסל',
    industry: 'קמעונאות',
    field: 'סופרמרקטים',
    yearsOfExperience: 2,
    yearsAgo: 1,
    tags: ['מכירות', 'ניהול מלאי', 'שירות'],
    type: 'ציבורית',
    size: '10000+',
    location: 'ראשון לציון',
  },
  {
    id: 7,
    company: 'משרד החינוך',
    industry: 'מגזר ציבורי',
    field: 'חינוך',
    yearsOfExperience: 7,
    yearsAgo: 4,
    tags: ['הוראה', 'ניהול', 'פדגוגיה'],
    type: 'ממשלתית',
    size: '10000+',
    location: 'ירושלים',
  },
  {
    id: 8,
    company: 'טבע תעשיות פרמצבטיות',
    industry: 'תעשייה וייצור',
    field: 'פארמה',
    yearsOfExperience: 6,
    yearsAgo: 5,
    tags: ['מחקר ופיתוח', 'ייצור', 'רגולציה'],
    type: 'ציבורית',
    size: '10000+',
    location: 'פתח תקווה',
  },
  {
    id: 9,
    company: 'צים',
    industry: 'תחבורה ולוגיסטיקה',
    field: 'ספנות',
    yearsOfExperience: 3,
    yearsAgo: 8,
    tags: ['שינוע ימי', 'לוגיסטיקה', 'סחר בינלאומי'],
    type: 'ציבורית',
    size: '1001-5000',
    location: 'חיפה',
  },
  {
    id: 10,
    company: 'אמדוקס',
    industry: 'טכנולוגיה',
    field: 'תקשורת',
    yearsOfExperience: 9,
    yearsAgo: 1,
    tags: ['בילינג', 'CRM', 'טלקום'],
    type: 'ציבורית',
    size: '10000+',
    location: 'רעננה',
  },
];

const allColumns = [
  { id: 'company', header: 'חברה' },
  { id: 'industry', header: 'תעשייה' },
  { id: 'yearsOfExperience', header: 'מס׳ שנים' },
  { id: 'yearsAgo', header: 'לפני כמה שנים' },
  { id: 'tags', header: 'תגיות ניסיון' },
  { id: 'location', header: 'מיקום' },
  { id: 'field', header: 'תחום עיסוק' },
  { id: 'type', header: 'סוג חברה' },
  { id: 'size', header: 'גודל' },
];

const defaultVisibleColumns = ['company', 'industry', 'yearsOfExperience', 'yearsAgo', 'tags', 'location'];

const ExperienceTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="bg-primary-50 text-primary-700 text-xs font-medium px-2 py-0.5 rounded-md border border-primary-100">
    {children}
  </span>
);

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

const ExperienceCard: React.FC<{ item: typeof experienceData[0] }> = ({ item }) => (
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
                 <span>{item.location}</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <BriefcaseIcon className="w-4 h-4 text-text-subtle"/>
                 <span>{item.type}</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <BuildingOffice2Icon className="w-4 h-4 text-text-subtle"/>
                 <span>{item.size} עובדים</span>
             </div>
             <div className="flex items-center gap-1.5">
                 <CalendarIcon className="w-4 h-4 text-text-subtle"/>
                 <span>לפני {item.yearsAgo} שנים</span>
             </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border-subtle">
            {item.tags.map(tag => <ExperienceTag key={tag}>{tag}</ExperienceTag>)}
        </div>
    </div>
);

const IndustryExperienceTable: React.FC = () => {
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

  const sortedData = useMemo(() => {
    let sortableItems = [...experienceData];
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
  }, [sortConfig]);

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

  const renderCellContent = (item: typeof experienceData[0], columnId: string) => {
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
                  <div className="flex flex-wrap gap-1 max-w-xs">
                      {item.tags.map(tag => <ExperienceTag key={tag}>{tag}</ExperienceTag>)}
                  </div>
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
                נמצאו <span className="font-bold text-text-default">{experienceData.length}</span> רשומות
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
