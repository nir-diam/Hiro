
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, ArrowUpTrayIcon, BuildingOffice2Icon, LinkIcon, 
    Cog6ToothIcon, PencilIcon, TrashIcon, XMarkIcon, DocumentArrowDownIcon, FunnelIcon
} from './Icons';

// --- TYPES ---
interface Company {
    id: number;
    name: string;
    mainField: string;
    subField: string;
    tags: string[];
    employeeCount: string;
    type: string;
    website: string;
    location: string;
    classification: string;
    relation: string; // Parent/Child/Independent
    description: string;
    candidateCount: number;
}

// --- MOCK DATA ---
const initialCompanies: Company[] = [
    {
        id: 1,
        name: 'גטר גרופ',
        mainField: 'תעשייה',
        subField: 'יבוא וסחר סיטונאי',
        tags: ['ציוד מחשוב', 'תקשורת', 'דפוס', 'רפואה'],
        employeeCount: '501-1000',
        type: 'מסחר וקמעונאות',
        website: 'https://www.getter.co.il/',
        location: 'פתח תקווה',
        classification: 'פרטית',
        relation: 'עצמאית',
        description: 'קבוצה ותיקה המתמחה בייבוא והפצת ציוד טכנולוגי, כולל מחשוב, תקשורת, דפוס וציוד רפואי.',
        candidateCount: 142
    },
    {
        id: 2,
        name: 'בזק',
        mainField: 'תקשורת',
        subField: 'תשתיות אינטרנט',
        tags: ['סיבים אופטיים', 'טלפוניה', 'שירות לקוחות'],
        employeeCount: '1000+',
        type: 'שירותים',
        website: 'https://www.bezeq.co.il/',
        location: 'חולון',
        classification: 'ציבורית',
        relation: 'חברת אם',
        description: 'חברת התקשורת הגדולה בישראל, מספקת שירותי טלפוניה ואינטרנט.',
        candidateCount: 850
    },
    {
        id: 3,
        name: 'אלביט מערכות',
        mainField: 'תעשייה ביטחונית',
        subField: 'אלקטרוניקה',
        tags: ['מל"טים', 'סייבר', 'תעופה'],
        employeeCount: '10000+',
        type: 'טכנולוגיה',
        website: 'https://elbitsystems.com/',
        location: 'חיפה',
        classification: 'ציבורית',
        relation: 'עצמאית',
        description: 'חברה ביטחונית בינלאומית העוסקת בפיתוח וייצור מערכות אלקטרוניות.',
        candidateCount: 1205
    },
    {
        id: 4,
        name: 'Wix',
        mainField: 'הייטק',
        subField: 'תוכנה',
        tags: ['Web', 'SaaS', 'B2C'],
        employeeCount: '1000-5000',
        type: 'טכנולוגיה',
        website: 'https://www.wix.com/',
        location: 'תל אביב',
        classification: 'ציבורית',
        relation: 'עצמאית',
        description: 'פלטפורמה לבניית אתרים המשרתת מיליוני משתמשים ברחבי העולם.',
        candidateCount: 620
    }
];

const allColumns = [
    { id: 'name', label: 'שם חברה' },
    { id: 'candidateCount', label: 'מועמדים' },
    { id: 'mainField', label: 'תחום עיקרי' },
    { id: 'subField', label: 'תחום משני' },
    { id: 'tags', label: 'תגיות' },
    { id: 'employeeCount', label: 'מס\' עובדים' },
    { id: 'type', label: 'סוג חברה' },
    { id: 'website', label: 'אתר' },
    { id: 'location', label: 'עיר/כתובת' },
    { id: 'classification', label: 'סיווג' },
    { id: 'relation', label: 'קשר' },
    { id: 'description', label: 'תיאור' },
];

const defaultVisibleColumns = ['name', 'candidateCount', 'mainField', 'subField', 'tags', 'employeeCount', 'location', 'website'];

const employeeCountOptions = ['1-50', '51-200', '201-500', '501-1000', '1000+', '1000-5000', '10000+'];
const classificationOptions = ['פרטית', 'ציבורית', 'ממשלתית', 'מלכ"ר'];
const companyTypeOptions = ['הייטק', 'תעשייה', 'מסחר וקמעונאות', 'שירותים', 'פיננסים', 'נדל"ן', 'אחר'];

// --- EDIT MODAL COMPONENT ---
const EditCompanyModal: React.FC<{
    company: Company;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedCompany: Company) => void;
}> = ({ company, isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState<Company>(company);

    useEffect(() => {
        setFormData(company);
    }, [company, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
        setFormData(prev => ({ ...prev, tags }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold">עריכת חברה: {formData.name}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover"><XMarkIcon className="w-6 h-6" /></button>
                </header>
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">שם החברה</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">אתר אינטרנט</label>
                            <input type="text" name="website" value={formData.website} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">תחום עיקרי</label>
                            <input type="text" name="mainField" value={formData.mainField} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">תחום משני</label>
                            <input type="text" name="subField" value={formData.subField} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">מיקום</label>
                            <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                        </div>
                         <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">מס' עובדים</label>
                            <select name="employeeCount" value={formData.employeeCount} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                                <option value="">בחר...</option>
                                {employeeCountOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">סיווג</label>
                            <select name="classification" value={formData.classification} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                                <option value="">בחר...</option>
                                {classificationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                         <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">סוג חברה</label>
                            <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5">
                                <option value="">בחר...</option>
                                {companyTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">תגיות (מופרד בפסיק)</label>
                        <input type="text" name="tags" value={formData.tags.join(', ')} onChange={handleTagsChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">תיאור החברה</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={4} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5"></textarea>
                    </div>
                    <div className="flex justify-end pt-4 border-t border-border-default">
                        <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover ml-2">ביטול</button>
                        <button type="submit" className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 shadow-sm">שמור שינויים</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const AdminCompaniesView: React.FC = () => {
    const [companies, setCompanies] = useState<Company[]>(initialCompanies);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Filter State
    const [filters, setFilters] = useState({
        name: '',
        mainField: '',
        subField: '',
        tag: '',
        employeeCount: '',
        type: '',
        city: '',
        classification: ''
    });
    
    // Active Filters (applied only on search click)
    const [activeFilters, setActiveFilters] = useState(filters);

    // Column Management
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    
    // Drag & Drop
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const dragItemIndex = useRef<number | null>(null);

    // Edit Modal
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);

    // --- Handlers ---

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const executeSearch = () => {
        setActiveFilters(filters);
    };

    const clearFilters = () => {
        const emptyFilters = {
            name: '', mainField: '', subField: '', tag: '',
            employeeCount: '', type: '', city: '', classification: ''
        };
        setFilters(emptyFilters);
        setActiveFilters(emptyFilters);
    };

    const filteredCompanies = useMemo(() => {
        return companies.filter(c => {
            const f = activeFilters;
            return (
                (!f.name || c.name.toLowerCase().includes(f.name.toLowerCase())) &&
                (!f.mainField || c.mainField.toLowerCase().includes(f.mainField.toLowerCase())) &&
                (!f.subField || c.subField.toLowerCase().includes(f.subField.toLowerCase())) &&
                (!f.tag || c.tags.some(t => t.toLowerCase().includes(f.tag.toLowerCase()))) &&
                (!f.employeeCount || c.employeeCount === f.employeeCount) &&
                (!f.type || c.type === f.type) &&
                (!f.city || c.location.toLowerCase().includes(f.city.toLowerCase())) &&
                (!f.classification || c.classification === f.classification)
            );
        });
    }, [companies, activeFilters]);

    // Click Outside for Settings
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleDownloadTemplate = () => {
        // Create a CSV string
        const headers = ["שם חברה", "תחום עיקרי", "תחום משני", "תגיות (מופרד בפסיק)", "מספר עובדים", "סוג חברה", "אתר אינטרנט", "עיר", "סיווג", "תיאור"];
        const exampleRow = ["דוגמה בע״מ", "הייטק", "סייבר", "Cyber, Security", "51-200", "פרטית", "www.example.com", "תל אביב", "פרטית", "תיאור קצר של החברה"];
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), exampleRow.join(",")].join("\n");
        
        // Trigger download
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "companies_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const fileName = e.target.files[0].name;
            // In a real app, here we would parse the file using XLSX or CSV parser
            // and then show a mapping wizard.
            alert(`קובץ ${fileName} התקבל. במערכת האמיתית, כאן ייפתח אשף מיפוי עמודות כדי להתאים את שדות האקסל לשדות המערכת.`);
            e.target.value = '';
        }
    };

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };

    const handleDragStart = (index: number, colId: string) => { 
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };

    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };

    const handleDragEnd = () => { 
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    const handleEditClick = (company: Company) => {
        setEditingCompany(company);
    };

    const handleSaveCompany = (updatedCompany: Company) => {
        setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
        setEditingCompany(null);
    };
    
    const handleDeleteCompany = (id: number) => {
        if(window.confirm("האם אתה בטוח שברצונך למחוק חברה זו?")) {
            setCompanies(prev => prev.filter(c => c.id !== id));
        }
    }

    // --- Render Cell Logic ---
    const renderCell = (company: Company, columnId: string) => {
        switch (columnId) {
            case 'name': return <span className="font-bold text-primary-700">{company.name}</span>;
            case 'candidateCount': return <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded-full text-xs font-bold">{company.candidateCount}</span>;
            case 'tags': return (
                <div className="flex flex-wrap gap-1">
                    {company.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[10px] bg-bg-subtle border border-border-default px-1.5 py-0.5 rounded text-text-subtle truncate max-w-[80px]">{tag}</span>
                    ))}
                    {company.tags.length > 3 && <span className="text-[10px] text-text-muted">+{company.tags.length - 3}</span>}
                </div>
            );
            case 'website': return company.website ? <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex p-1.5 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors"><LinkIcon className="w-4 h-4" /></a> : null;
            default: return (company as any)[columnId];
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6 flex flex-col h-full">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); cursor: grabbing !important; } th[draggable] { user-select: none; cursor: grab; }`}</style>
            
            <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <BuildingOffice2Icon className="w-6 h-6 text-primary-500" />
                        מאגר חברות
                    </h1>
                    <p className="text-sm text-text-muted">ניהול וצפייה ברשימת החברות המזוהות במערכת.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv, .xlsx" onChange={handleFileChange} />
                    <button onClick={handleDownloadTemplate} className="text-sm font-medium text-primary-600 hover:underline flex items-center gap-1">
                        <DocumentArrowDownIcon className="w-4 h-4" />
                        הורד תבנית
                    </button>
                    <button onClick={handleImportClick} className="flex items-center gap-2 bg-bg-subtle text-text-default border border-border-default font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition shadow-sm">
                        <ArrowUpTrayIcon className="w-5 h-5" />
                        <span>ייבוא</span>
                    </button>
                </div>
            </header>

            {/* Advanced Filter Bar */}
            <div className="bg-bg-subtle/50 border border-border-default rounded-xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-bold text-text-muted">
                    <FunnelIcon className="w-4 h-4" />
                    סינון מתקדם
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <input 
                        type="text" 
                        name="name" 
                        placeholder="שם חברה" 
                        value={filters.name} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    />
                    <input 
                        type="text" 
                        name="mainField" 
                        placeholder="תחום עיקרי" 
                        value={filters.mainField} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    />
                     <input 
                        type="text" 
                        name="subField" 
                        placeholder="תחום משני" 
                        value={filters.subField} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    />
                     <input 
                        type="text" 
                        name="tag" 
                        placeholder="תגיות" 
                        value={filters.tag} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    />
                    <select 
                        name="employeeCount" 
                        value={filters.employeeCount} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    >
                        <option value="">מס' עובדים (הכל)</option>
                        {employeeCountOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <select 
                        name="type" 
                        value={filters.type} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    >
                        <option value="">סוג חברה (הכל)</option>
                        {companyTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    <input 
                        type="text" 
                        name="city" 
                        placeholder="עיר" 
                        value={filters.city} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    />
                     <select 
                        name="classification" 
                        value={filters.classification} 
                        onChange={handleFilterChange} 
                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                    >
                        <option value="">סיווג (הכל)</option>
                        {classificationOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-border-default">
                    <button onClick={clearFilters} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-4 py-2">נקה הכל</button>
                    <button onClick={executeSearch} className="bg-primary-600 text-white font-bold py-2 px-8 rounded-lg hover:bg-primary-700 transition shadow-sm flex items-center gap-2">
                        <MagnifyingGlassIcon className="w-5 h-5" />
                        חפש
                    </button>
                </div>
            </div>

            <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-semibold text-text-muted">נמצאו {filteredCompanies.length} חברות</span>
                <div className="relative" ref={settingsRef}>
                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover border border-border-default transition-colors" title="התאם עמודות">
                        <Cog6ToothIcon className="w-5 h-5" />
                    </button>
                    {isSettingsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4 max-h-96 overflow-y-auto">
                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                            <div className="space-y-2">
                                {allColumns.map(column => (
                                    <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default cursor-pointer hover:bg-bg-subtle p-1 rounded">
                                        <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500" />
                                        {column.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-hidden border border-border-default rounded-lg">
                <div className="overflow-x-auto h-full">
                    <table className="w-full text-sm text-right min-w-[1000px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80 sticky top-0 z-10">
                            <tr>
                                {visibleColumns.map((colId, index) => {
                                    const col = allColumns.find(c => c.id === colId);
                                    if (!col) return null;
                                    return (
                                        <th 
                                            key={col.id} 
                                            draggable
                                            onDragStart={() => handleDragStart(index, col.id)}
                                            onDragEnter={() => handleDragEnter(index)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            className={`p-4 font-bold transition-colors hover:bg-bg-hover ${draggingColumn === col.id ? 'dragging' : ''}`}
                                        >
                                            {col.label}
                                        </th>
                                    );
                                })}
                                <th className="p-4 font-bold text-center w-20 sticky left-0 bg-bg-subtle/80">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {filteredCompanies.map(company => (
                                <tr key={company.id} className="hover:bg-bg-hover transition-colors group">
                                    {visibleColumns.map(colId => (
                                        <td key={colId} className="p-4 align-middle">
                                            {renderCell(company, colId)}
                                        </td>
                                    ))}
                                    <td className="p-4 text-center sticky left-0 bg-bg-card group-hover:bg-bg-hover transition-colors">
                                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEditClick(company)} className="p-1.5 hover:bg-primary-50 rounded-full text-text-subtle hover:text-primary-600 transition-colors" title="ערוך">
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteCompany(company.id)} className="p-1.5 hover:bg-red-50 rounded-full text-text-subtle hover:text-red-600 transition-colors" title="מחק">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredCompanies.length === 0 && (
                                <tr>
                                    <td colSpan={visibleColumns.length + 1} className="p-8 text-center text-text-muted">
                                        לא נמצאו חברות התואמות את החיפוש.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {editingCompany && (
                <EditCompanyModal 
                    company={editingCompany} 
                    isOpen={!!editingCompany} 
                    onClose={() => setEditingCompany(null)} 
                    onSave={handleSaveCompany} 
                />
            )}
        </div>
    );
};

export default AdminCompaniesView;
