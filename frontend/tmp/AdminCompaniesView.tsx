
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
    MagnifyingGlassIcon, PlusIcon, SparklesIcon, GlobeAmericasIcon, 
    MapPinIcon, Squares2X2Icon, TableCellsIcon, 
    TrashIcon, XMarkIcon, LinkedInIcon, BriefcaseIcon,
    ChartBarIcon, BoltIcon, ShieldCheckIcon, Cog6ToothIcon, ChatBubbleBottomCenterTextIcon,
    BuildingOffice2Icon, ExclamationTriangleIcon, CheckCircleIcon, AdjustmentsHorizontalIcon, FunnelIcon,
    AvatarIcon, ArrowTopRightOnSquareIcon, UserGroupIcon
} from './Icons';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from '@google/genai';
import HiroAIChat from './HiroAIChat';

// --- Types ---
type BusinessModel = 'B2B' | 'B2C' | 'B2G' | 'Mixed' | 'Unknown';
type ProductType = 'Product' | 'Service' | 'Platform' | 'Project' | 'Unknown';
type GrowthIndicator = 'Growing' | 'Stable' | 'Shrinking' | 'Unknown';
type DataConfidence = 'High' | 'Medium' | 'Low' | 'Pending Review'; 
type CorporateStructure = 'Independent' | 'Parent' | 'Subsidiary';

interface Company {
    id: number;
    // Identity
    name: string; // Hebrew / Common
    nameEn: string;
    legalName: string;
    aliases: string[]; 
    
    // Links
    website: string;
    linkedinUrl: string;    
    
    // Hard Facts
    foundedYear: string;    
    location: string; // HQ City
    hqCountry: string;
    
    // Scale
    employeeCount: string;
    
    // Business Logic
    mainField: string; // Industry Primary
    subField: string;  // Industry Secondary
    businessModel: BusinessModel;
    productType: ProductType;
    type: string;      // Organization Type (High-tech, Industry...)
    classification: string; // Public/Private
    
    // Structure (New)
    structure: CorporateStructure;
    parentCompany?: string;
    subsidiaries?: string[];

    // Insights
    growthIndicator: GrowthIndicator;
    description: string;
    
    // Tags
    tags: string[];         // General tags
    techTags: string[];     // Technology stack specifically

    // Meta
    dataConfidence: DataConfidence;
    lastVerified: string;

    isSelected?: boolean;
}

// --- AI Tools Definitions ---
const addCompaniesTool: FunctionDeclaration = {
    name: 'addCompaniesToDatabase',
    description: 'Add one or more companies to the system database based on the conversation.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            companies: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING, description: "Name of the company" },
                        description: { type: Type.STRING, description: "Short description if available" },
                        mainField: { type: Type.STRING, description: "Industry or Field" }
                    },
                    required: ['name']
                }
            }
        },
        required: ['companies']
    }
};

// --- Initial Data ---
const initialCompanies: Company[] = [
    { 
        id: 1, 
        name: 'Wix', 
        nameEn: 'Wix.com Ltd.',
        legalName: 'Wix.com Ltd.',
        aliases: ['Wix.com', 'ויקס'],
        description: 'פלטפורמה לבניית אתרים המאפשרת למשתמשים ליצור אתרים מקצועיים בקלות.', 
        mainField: 'אינטרנט', 
        subField: 'SaaS', 
        employeeCount: '5000+', 
        website: 'https://www.wix.com', 
        linkedinUrl: 'https://www.linkedin.com/company/wix-com',
        foundedYear: '2006',
        location: 'תל אביב',
        hqCountry: 'Israel',
        type: 'הייטק',
        classification: 'ציבורית',
        businessModel: 'B2C',
        productType: 'Platform',
        growthIndicator: 'Stable',
        structure: 'Independent',
        tags: ['בניית אתרים', 'תוכנה לצרכן'],
        techTags: ['React', 'Node.js', 'Scala'],
        dataConfidence: 'High',
        lastVerified: '2025-05-01'
    },
    { 
        id: 2, 
        name: 'תנובה', 
        nameEn: 'Tnuva',
        legalName: 'Tnuva Food Industries Ltd',
        aliases: ['תנובה שף', 'קבוצת תנובה'],
        description: 'קונצרן המזון הגדול בישראל, העוסק בייצור ושיווק של מוצרי חלב ומזון.', 
        mainField: 'מזון ומשקאות', 
        subField: 'Manufacturing', 
        employeeCount: '5000+', 
        website: 'https://www.tnuva.co.il', 
        linkedinUrl: '',
        foundedYear: '1926',
        location: 'פתח תקווה', // HQ location
        hqCountry: 'Israel',
        type: 'תעשייה',
        classification: 'פרטית',
        businessModel: 'B2C',
        productType: 'Product',
        growthIndicator: 'Stable',
        structure: 'Parent',
        subsidiaries: ['סנפרוסט', 'מעדנות', 'אוליביה'],
        tags: ['מזון', 'מוצרי חלב', 'לוגיסטיקה'],
        techTags: ['SAP', 'Automation'],
        dataConfidence: 'High',
        lastVerified: '2025-04-15'
    },
    { 
        id: 3, 
        name: 'אלביט מערכות', 
        nameEn: 'Elbit Systems',
        legalName: 'Elbit Systems Ltd.',
        aliases: ['Elbit', 'אלביט', 'אלישרא'],
        description: 'חברה ביטחונית טכנולוגית בינלאומית העוסקת בפיתוח מערכות אלקטרוניות.', 
        mainField: 'ביטחוני', 
        subField: 'Electronics', 
        employeeCount: '10000+', 
        website: 'https://elbitsystems.com', 
        linkedinUrl: '',
        foundedYear: '1966',
        location: 'חיפה',
        hqCountry: 'Israel',
        type: 'הייטק',
        classification: 'ציבורית',
        businessModel: 'B2G',
        productType: 'Project',
        growthIndicator: 'Growing',
        structure: 'Parent',
        subsidiaries: ['Elbit Systems of America', 'Elisra', 'Cyclone'],
        tags: ['ביטחוני', 'תעופה', 'מל"טים'],
        techTags: ['C++', 'Embedded', 'Real-time'],
        dataConfidence: 'High',
        lastVerified: '2025-05-10'
    },
    {
        id: 4,
        name: 'Elco',
        nameEn: 'Elco Ltd.',
        legalName: 'Elco Ltd.',
        aliases: ['אלקו', 'קבוצת אלקו'],
        description: 'חברת אחזקות ישראלית הפועלת בתחומי התשתיות, הבנייה, מוצרי הצריכה, והנדל"ן.',
        mainField: 'אחזקות',
        subField: 'Investment',
        employeeCount: '10000+',
        website: 'https://www.elco.co.il',
        linkedinUrl: '',
        foundedYear: '1949',
        location: 'תל אביב',
        hqCountry: 'Israel',
        type: 'אחר',
        classification: 'ציבורית',
        businessModel: 'Mixed',
        productType: 'Unknown',
        growthIndicator: 'Growing',
        structure: 'Parent',
        subsidiaries: ['אלקטרה', 'אלקטרה מוצרי צריכה', 'סופרגז', 'בתי קולנוע לב'],
        tags: ['אחזקות', 'תשתיות', 'נדל"ן'],
        techTags: [],
        dataConfidence: 'Medium',
        lastVerified: '2025-05-12'
    }
];

// --- Column Definition ---
const allColumnsDef = [
    { id: 'name', label: 'שם החברה' },
    { id: 'mainField', label: 'תחום' },
    { id: 'structure', label: 'מבנה' }, 
    { id: 'businessModel', label: 'מודל עסקי' },
    { id: 'type', label: 'סוג' },
    { id: 'linkedinUrl', label: 'לינקדאין' },
    { id: 'foundedYear', label: 'שנת הקמה' },
    { id: 'employeeCount', label: 'גודל' },
    { id: 'location', label: 'מיקום' },
    { id: 'dataConfidence', label: 'אמינות' },
    { id: 'techTags', label: 'טכנולוגיות' },
    { id: 'lastVerified', label: 'עודכן' },
];

const defaultVisibleColumns = ['name', 'structure', 'mainField', 'businessModel', 'linkedinUrl', 'foundedYear', 'employeeCount', 'dataConfidence', 'techTags', 'location'];

// --- Company Users Tab Component ---
interface CompanyUser {
    id: number;
    name: string;
    role: string;
    yearsOfExperience: number;
    isCurrent: boolean;
    yearsSinceLeft: number | null;
}

const mockCompanyUsers: CompanyUser[] = [
    { id: 1, name: 'ישראל ישראלי', role: 'Full Stack Developer', yearsOfExperience: 3.5, isCurrent: true, yearsSinceLeft: null },
    { id: 2, name: 'שירה כהן', role: 'Product Manager', yearsOfExperience: 5, isCurrent: false, yearsSinceLeft: 2 },
    { id: 3, name: 'דוד לוי', role: 'Frontend Developer', yearsOfExperience: 1.5, isCurrent: true, yearsSinceLeft: null },
    { id: 4, name: 'מיכל אברהם', role: 'UX/UI Designer', yearsOfExperience: 4, isCurrent: false, yearsSinceLeft: 1 },
    { id: 5, name: 'רון גולן', role: 'Backend Developer', yearsOfExperience: 2, isCurrent: false, yearsSinceLeft: 5 },
];

const CompanyUsersTab: React.FC<{ companyName: string }> = ({ companyName }) => {
    const [filters, setFilters] = useState({
        minYears: '',
        isCurrent: 'all', // 'all', 'yes', 'no'
        role: '',
        yearsSinceLeft: ''
    });

    const filteredUsers = mockCompanyUsers.filter(user => {
        if (filters.minYears && user.yearsOfExperience < Number(filters.minYears)) return false;
        if (filters.isCurrent !== 'all') {
            const isCurrentBool = filters.isCurrent === 'yes';
            if (user.isCurrent !== isCurrentBool) return false;
        }
        if (filters.role && !user.role.toLowerCase().includes(filters.role.toLowerCase())) return false;
        if (filters.yearsSinceLeft && user.yearsSinceLeft !== null && user.yearsSinceLeft > Number(filters.yearsSinceLeft)) return false;
        return true;
    });

    const hasActiveFilters = filters.minYears || filters.isCurrent !== 'all' || filters.role || filters.yearsSinceLeft;

    const clearFilters = () => {
        setFilters({
            minYears: '',
            isCurrent: 'all',
            role: '',
            yearsSinceLeft: ''
        });
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="bg-bg-subtle p-4 rounded-xl border border-border-default flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs font-semibold text-text-muted mb-1">תפקיד</label>
                    <input 
                        type="text" 
                        value={filters.role} 
                        onChange={e => setFilters(prev => ({ ...prev, role: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                        placeholder="חפש תפקיד..."
                    />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-semibold text-text-muted mb-1">מס׳ שנות ניסיון</label>
                    <input 
                        type="number" 
                        value={filters.minYears} 
                        onChange={e => setFilters(prev => ({ ...prev, minYears: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                        placeholder="לדוגמה: 2"
                    />
                </div>
                <div className="w-40">
                    <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס העסקה</label>
                    <select 
                        value={filters.isCurrent} 
                        onChange={e => setFilters(prev => ({ ...prev, isCurrent: e.target.value }))}
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                    >
                        <option value="all">הכל</option>
                        <option value="yes">עובד/ת נוכחי/ת</option>
                        <option value="no">עובד/ת עבר</option>
                    </select>
                </div>
                {filters.isCurrent !== 'yes' && (
                    <div className="w-40">
                        <label className="block text-xs font-semibold text-text-muted mb-1">עזב/ה לפני מס׳ שנים</label>
                        <input 
                            type="number" 
                            value={filters.yearsSinceLeft} 
                            onChange={e => setFilters(prev => ({ ...prev, yearsSinceLeft: e.target.value }))}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500" 
                            placeholder="לדוגמה: 3"
                        />
                    </div>
                )}
                {hasActiveFilters && (
                    <button 
                        onClick={clearFilters}
                        className="px-3 py-2 text-sm font-medium text-text-muted hover:text-text-default hover:bg-bg-hover rounded-lg transition-colors flex items-center gap-1"
                    >
                        <XMarkIcon className="w-4 h-4" />
                        נקה סינון
                    </button>
                )}
            </div>

            <div className="border border-border-default rounded-xl overflow-hidden bg-bg-card">
                <table className="w-full text-right">
                    <thead className="bg-bg-subtle border-b border-border-default text-xs font-bold text-text-muted">
                        <tr>
                            <th className="p-4">שם מועמד/ת</th>
                            <th className="p-4">תפקיד ב-{companyName}</th>
                            <th className="p-4">שנות ניסיון בחברה</th>
                            <th className="p-4">סטטוס</th>
                            <th className="p-4 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                        {filteredUsers.length > 0 ? filteredUsers.map(user => (
                            <tr key={user.id} className="hover:bg-bg-hover transition-colors group">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <AvatarIcon initials={user.name.split(' ').map(n => n[0]).join('').substring(0, 2)} size={32} fontSize={12} />
                                        <span className="font-semibold text-text-default">{user.name}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-text-muted">{user.role}</td>
                                <td className="p-4 text-text-muted">{user.yearsOfExperience} שנים</td>
                                <td className="p-4">
                                    {user.isCurrent ? (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-600 text-white shadow-sm">
                                            נוכחי
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-600 text-white shadow-sm">
                                            עבר (לפני {user.yearsSinceLeft} שנים)
                                        </span>
                                    )}
                                </td>
                                <td className="p-4 text-left">
                                    <button className="p-1.5 text-text-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" title="צפה בפרופיל">
                                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center text-text-muted">
                                        <UserGroupIcon className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="text-sm font-medium">לא נמצאו מועמדים התואמים לחיפוש</p>
                                        {hasActiveFilters && (
                                            <button onClick={clearFilters} className="mt-2 text-xs text-primary-600 hover:underline">
                                                נקה את כל המסננים
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Company Modal Component ---
const CompanyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (company: Company) => void;
    company: Company | null;
}> = ({ isOpen, onClose, onSave, company }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'users'>('details');
    const [formData, setFormData] = useState<Company>({
        id: 0,
        name: '', nameEn: '', legalName: '', aliases: [],
        description: '',
        mainField: '', subField: '',
        employeeCount: '',
        website: '', linkedinUrl: '',
        foundedYear: '', location: '', hqCountry: 'Israel',
        type: 'הייטק', classification: 'פרטית',
        businessModel: 'B2B', productType: 'Product',
        growthIndicator: 'Unknown',
        structure: 'Independent', parentCompany: '', subsidiaries: [],
        tags: [], techTags: [],
        dataConfidence: 'Medium', lastVerified: new Date().toISOString().split('T')[0]
    });
    
    const [tagsInput, setTagsInput] = useState('');
    const [techTagsInput, setTechTagsInput] = useState('');
    const [subsidiariesInput, setSubsidiariesInput] = useState('');
    const [aliasesInput, setAliasesInput] = useState('');

    useEffect(() => {
        if (isOpen) {
            setActiveTab('details');
            if (company) {
                setFormData(company);
                setTagsInput(company.tags.join(', '));
                setTechTagsInput(company.techTags.join(', '));
                setSubsidiariesInput(company.subsidiaries ? company.subsidiaries.join(', ') : '');
                setAliasesInput(company.aliases ? company.aliases.join(', ') : '');
            } else {
                setFormData({
                    id: Date.now(),
                    name: '', nameEn: '', legalName: '', aliases: [],
                    description: '',
                    mainField: '', subField: '',
                    employeeCount: '',
                    website: '', linkedinUrl: '',
                    foundedYear: '', location: '', hqCountry: 'Israel',
                    type: 'הייטק', classification: 'פרטית',
                    businessModel: 'B2B', productType: 'Product',
                    growthIndicator: 'Unknown',
                    structure: 'Independent', parentCompany: '', subsidiaries: [],
                    tags: [], techTags: [],
                    dataConfidence: 'Low', lastVerified: new Date().toISOString().split('T')[0]
                });
                setTagsInput('');
                setTechTagsInput('');
                setSubsidiariesInput('');
                setAliasesInput('');
            }
        }
    }, [isOpen, company]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const techTags = techTagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const subsidiaries = subsidiariesInput.split(',').map(t => t.trim()).filter(Boolean);
        const aliases = aliasesInput.split(',').map(t => t.trim()).filter(Boolean);
        
        const verifiedConfidence: DataConfidence = 'High';
        
        onSave({ 
            ...formData, 
            tags, 
            techTags, 
            subsidiaries,
            aliases,
            dataConfidence: verifiedConfidence,
            lastVerified: new Date().toISOString().split('T')[0]
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden border border-border-default animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-6 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-black text-text-default">
                            {company ? 'עריכת פרופיל חברה' : 'הקמת חברה חדשה'}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                             <p className="text-xs text-text-muted">Intelligence & Data Enrichment</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                {company && (
                    <div className="flex border-b border-border-default bg-bg-subtle/30 px-6 pt-2">
                        <button 
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'details' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'}`}
                            onClick={() => setActiveTab('details')}
                        >
                            פרטי חברה
                        </button>
                        <button 
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'users' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'}`}
                            onClick={() => setActiveTab('users')}
                        >
                            משתמשים
                        </button>
                    </div>
                )}
                
                {activeTab === 'details' ? (
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
                     {/* Full form content here - Same as before */}
                     {/* Identity */}
                    <section>
                        <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <GlobeAmericasIcon className="w-4 h-4"/> זהות ופרטים ראשיים
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם החברה (עברית)</label>
                                <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 font-bold" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם באנגלית</label>
                                <input type="text" name="nameEn" value={formData.nameEn} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שם משפטי מלא</label>
                                <input type="text" name="legalName" value={formData.legalName} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 text-text-muted" placeholder="Ltd / Inc..." dir="ltr" />
                            </div>
                            
                            <div className="md:col-span-3">
                                <label className="block text-xs font-semibold text-text-muted mb-1">שמות נוספים לזיהוי (מופרד בפסיק)</label>
                                <input type="text" value={aliasesInput} onChange={(e) => setAliasesInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="לדוגמה: ניסקו פרויקטים, קבוצת ניסקו..." />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">אתר אינטרנט</label>
                                <div className="relative">
                                    <GlobeAmericasIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="https://..." dir="ltr" />
                                </div>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">עמוד לינקדאין</label>
                                <div className="relative">
                                    <LinkedInIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input type="url" name="linkedinUrl" value={formData.linkedinUrl} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 pl-9 text-sm focus:ring-2 focus:ring-primary-500" placeholder="linkedin.com/company/..." dir="ltr" />
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    {/* Other sections preserved from your original code */}
                    <div className="w-full h-px bg-border-subtle"></div>

                     {/* SECTION 2: BUSINESS PROFILE */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BriefcaseIcon className="w-4 h-4"/> פרופיל עסקי
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">תעשייה ראשית</label>
                                <input type="text" name="mainField" value={formData.mainField} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="SaaS, Cyber, FoodTech..." />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מודל עסקי</label>
                                <select name="businessModel" value={formData.businessModel} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="B2B">B2B</option>
                                    <option value="B2C">B2C</option>
                                    <option value="B2G">B2G</option>
                                    <option value="Mixed">משולב</option>
                                    <option value="Unknown">לא ידוע</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סוג מוצר</label>
                                <select name="productType" value={formData.productType} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="Product">מוצר (Product)</option>
                                    <option value="Service">שירותים (Services)</option>
                                    <option value="Platform">פלטפורמה</option>
                                    <option value="Project">פרויקטים</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מגזר</label>
                                <select name="type" value={formData.type} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="הייטק">הייטק</option>
                                    <option value="תעשייה">תעשייה</option>
                                    <option value="פיננסים">פיננסים</option>
                                    <option value="שירותים">שירותים</option>
                                    <option value="אחר">אחר (אחזקות ועוד)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סיווג משפטי</label>
                                <select name="classification" value={formData.classification} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="פרטית">פרטית</option>
                                    <option value="ציבורית">ציבורית (בורסאית)</option>
                                    <option value="ממשלתית">ממשלתית</option>
                                    <option value='מלכ"ר'>מלכ"ר</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <div className="w-full h-px bg-border-subtle"></div>
                    
                    {/* SECTION 2.5: CORPORATE STRUCTURE (NEW) */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BuildingOffice2Icon className="w-4 h-4"/> מבנה ארגוני
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סוג מבנה</label>
                                <select name="structure" value={formData.structure} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="Independent">חברה עצמאית (ללא שיוך)</option>
                                    <option value="Parent">חברת אם (Parent/Holding)</option>
                                    <option value="Subsidiary">חברת בת (Subsidiary)</option>
                                </select>
                            </div>
                            
                            {formData.structure === 'Subsidiary' && (
                                <div>
                                    <label className="block text-xs font-semibold text-text-muted mb-1">שייכת ל (חברת האם)</label>
                                    <input type="text" name="parentCompany" value={formData.parentCompany} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="שם חברת האם..." />
                                </div>
                            )}

                             {formData.structure === 'Parent' && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-text-muted mb-1">חברות בנות / מותגים (מופרד בפסיק)</label>
                                    <input type="text" value={subsidiariesInput} onChange={(e) => setSubsidiariesInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="לדוגמה: אלקטרה, אלקטרה מוצרי צריכה..." />
                                    <p className="text-[10px] text-text-muted mt-1">* עובדי החברות הבנות נכללים בספירת העובדים הכוללת.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="w-full h-px bg-border-subtle"></div>

                    {/* SECTION 3: SCALE & LOCATION */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ChartBarIcon className="w-4 h-4"/> סקייל וצמיחה
                        </h3>
                         <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">עובדים (כולל חברות בנות)</label>
                                <select name="employeeCount" value={formData.employeeCount} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="1-10">1-10 (Seed)</option>
                                    <option value="11-50">11-50 (Startup)</option>
                                    <option value="51-200">51-200 (Growth)</option>
                                    <option value="201-1000">201-1000 (Scale)</option>
                                    <option value="1000+">1000+ (Enterprise)</option>
                                    <option value="10000+">10000+ (Mega Enterprise)</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מגמת צמיחה</label>
                                <select name="growthIndicator" value={formData.growthIndicator} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500">
                                    <option value="Growing">צמיחה (Growing)</option>
                                    <option value="Stable">יציב (Stable)</option>
                                    <option value="Shrinking">הצטמצמות</option>
                                    <option value="Unknown">לא ידוע</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">שנת הקמה</label>
                                <input type="text" name="foundedYear" value={formData.foundedYear} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="YYYY" />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מטה (עיר)</label>
                                <input type="text" name="location" value={formData.location} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="עיר, רחוב" />
                            </div>
                         </div>
                    </section>

                     <div className="w-full h-px bg-border-subtle"></div>

                     {/* SECTION 4: TECH & TAGS */}
                    <section>
                         <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <BoltIcon className="w-4 h-4"/> טכנולוגיה ותיוג
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">Tech Stack (מופרד בפסיק - אנגלית)</label>
                                <input type="text" value={techTagsInput} onChange={(e) => setTechTagsInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="React, Python, AWS, Kubernetes..." dir="ltr"/>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">תגיות כלליות (עברית)</label>
                                <input type="text" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500" placeholder="שיווק דיגיטלי, סייבר, מסחר..." />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">תיאור קצר</label>
                                <textarea name="description" value={formData.description} onChange={handleChange} rows={2} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none"></textarea>
                            </div>
                        </div>
                    </section>
                </form>
                ) : (
                    <CompanyUsersTab companyName={formData.name} />
                )}

                <footer className="p-4 border-t border-border-default bg-bg-subtle flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
                        <ShieldCheckIcon className={`w-4 h-4 ${formData.dataConfidence === 'High' ? 'text-green-500' : formData.dataConfidence === 'Medium' ? 'text-yellow-500' : formData.dataConfidence === 'Pending Review' ? 'text-amber-500' : 'text-red-500'}`} />
                        <span>רמת אמינות מידע: {formData.dataConfidence === 'Pending Review' ? 'ממתין לסקירה' : formData.dataConfidence}</span>
                    </div>
                    <div className="flex gap-3">
                         <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">ביטול</button>
                        <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all shadow-md">{company ? 'שמור ועדכן אמינות' : 'צור חברה'}</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};


const AdminCompaniesView: React.FC = () => {
    const [companies, setCompanies] = useState<Company[]>(initialCompanies);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isEnriching, setIsEnriching] = useState(false);
    
    // Filters State - Expanded for Advanced Search
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [filters, setFilters] = useState({
        location: '',
        type: '',
        size: '',
        field: '',
        showPendingOnly: false,
        // Advanced Fields
        name: '',
        nameEn: '',
        legalName: '',
        website: '',
        linkedin: '',
        subField: '',
        businessModel: '',
        productType: '',
        classification: '',
        structure: '',
        parent: '',
        founded: '',
        tags: '',
        tech: '',
    });

    // Column Management State
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    
    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);

    const filteredCompanies = useMemo(() => 
        companies.filter(c => {
            // General Search
            const matchesSearch = searchTerm === '' || 
                                  c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  c.mainField.toLowerCase().includes(searchTerm.toLowerCase());
            
            // Quick Filters
            const matchesLocation = !filters.location || c.location.includes(filters.location);
            const matchesType = !filters.type || c.type === filters.type;
            const matchesSize = !filters.size || c.employeeCount === filters.size;
            const matchesField = !filters.field || c.mainField.includes(filters.field);
            const matchesPending = !filters.showPendingOnly || c.dataConfidence === 'Pending Review';

            // Advanced Filters
            const matchesName = !filters.name || c.name.includes(filters.name);
            const matchesNameEn = !filters.nameEn || c.nameEn.toLowerCase().includes(filters.nameEn.toLowerCase());
            const matchesLegal = !filters.legalName || c.legalName.toLowerCase().includes(filters.legalName.toLowerCase());
            const matchesWeb = !filters.website || c.website.includes(filters.website);
            const matchesLinked = !filters.linkedin || c.linkedinUrl.includes(filters.linkedin);
            
            const matchesSub = !filters.subField || c.subField.includes(filters.subField);
            const matchesBiz = !filters.businessModel || c.businessModel === filters.businessModel;
            const matchesProd = !filters.productType || c.productType === filters.productType;
            const matchesClass = !filters.classification || c.classification === filters.classification;
            
            const matchesStruct = !filters.structure || c.structure === filters.structure;
            const matchesParent = !filters.parent || (c.parentCompany && c.parentCompany.includes(filters.parent));
            const matchesFounded = !filters.founded || c.foundedYear.includes(filters.founded);
            
            const matchesTags = !filters.tags || c.tags.some(t => t.includes(filters.tags));
            const matchesTech = !filters.tech || c.techTags.some(t => t.toLowerCase().includes(filters.tech.toLowerCase()));

            return matchesSearch && matchesLocation && matchesType && matchesSize && matchesField && matchesPending &&
                   matchesName && matchesNameEn && matchesLegal && matchesWeb && matchesLinked &&
                   matchesSub && matchesBiz && matchesProd && matchesClass &&
                   matchesStruct && matchesParent && matchesFounded && matchesTags && matchesTech;
        }),
    [companies, searchTerm, filters]);

    // ... (Keep existing handler functions: Actions, Column Management, AI Enrichment, AI Chat - they are correct)

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    // --- Actions Handlers ---
    const handleEditCompany = (company: Company) => {
        setEditingCompany(company);
        setIsModalOpen(true);
    };

    const handleCreateCompany = () => {
        setEditingCompany(null);
        setIsModalOpen(true);
    };

    const handleSaveCompany = (companyData: Company) => {
        if (editingCompany) {
            setCompanies(prev => prev.map(c => c.id === companyData.id ? companyData : c));
        } else {
            setCompanies(prev => [companyData, ...prev]);
        }
    };

    const handleDeleteCompany = (id: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק חברה זו?')) {
            setCompanies(prev => prev.filter(c => c.id !== id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };
    
    const handleBulkDelete = () => {
         if (window.confirm(`האם למחוק ${selectedIds.size} חברות שנבחרו?`)) {
            setCompanies(prev => prev.filter(c => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
        }
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredCompanies.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const handleClearFilters = () => {
        setFilters({
            location: '', type: '', size: '', field: '', showPendingOnly: false,
            name: '', nameEn: '', legalName: '', website: '', linkedin: '',
            subField: '', businessModel: '', productType: '', classification: '',
            structure: '', parent: '', founded: '', tags: '', tech: ''
        });
        setSearchTerm('');
    };
    
    // --- Column Management Handlers ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allColumnsDef.findIndex(c => c.id === a) - allColumnsDef.findIndex(c => c.id === b));
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
    
     // --- AI Enrichment Logic ---
    const handleBulkEnrich = async () => {
        if (selectedIds.size === 0) return;
        setIsEnriching(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const selectedCompanies = companies.filter(c => selectedIds.has(c.id));
            const companyNames = selectedCompanies.map(c => c.name);

            // Updated Prompt for Deep Intelligence and Language Enforcment
            const prompt = `
            You are a Corporate Intelligence Extraction Agent for an Israeli database.
            I have a list of Israeli companies: ${JSON.stringify(companyNames)}.

            **MANDATORY INSTRUCTIONS:**
            1. **LANGUAGE RULES:** 
               - 'description', 'location', 'mainField', 'subField' MUST be in **HEBREW**.
               - 'techTags' MUST be in **ENGLISH** (e.g. React, Python, AWS).
               - 'tags' (general tags) MUST be in **HEBREW** (e.g. שיווק דיגיטלי, ניהול).
            2. **LOCATION ACCURACY:**
               - Provide the specific City name in Hebrew (e.g., 'פתח תקווה', 'הרצליה', 'קיסריה', 'איירפורט סיטי').
               - For "Nisko", use "איירפורט סיטי" or "רמת גן" based on the main entity. Do NOT use "Petah Tikva" unless verified for a specific branch.
            3. **DATA ENRICHMENT:**
               - Use the **Google Search tool** to find real data.
               - Infer 'Business Model', 'Growth Indicator'.
               - Identify 'Corporate Structure' (Parent/Subsidiary).
            4. **ALIASES:**
               - Provide known 'aliases' or variations of the name in Hebrew and English.

            Return a valid JSON array matching this structure:
            [
              {
                "name": "Common Name",
                "nameEn": "English Name",
                "legalName": "Full Legal Name",
                "aliases": ["Alias 1", "Alias 2"],
                "description": "Hebrew description (2 sentences)",
                "mainField": "Industry Primary in Hebrew",
                "subField": "Industry Secondary in Hebrew",
                "employeeCount": "estimate range",
                "website": "url",
                "linkedinUrl": "url", 
                "foundedYear": "YYYY",
                "location": "City Name (Hebrew)",
                "hqCountry": "Country (English)",
                "type": "one of ['הייטק', 'תעשייה', 'מסחר וקמעונאות', 'שירותים', 'פיננסים', 'נדל\"ן', 'אחר']",
                "classification": "one of ['פרטית', 'ציבורית', 'ממשלתית', 'מלכ\"ר']",
                "businessModel": "one of ['B2B', 'B2C', 'B2G', 'Mixed', 'Unknown']",
                "productType": "one of ['Product', 'Service', 'Platform', 'Project', 'Unknown']",
                "growthIndicator": "one of ['Growing', 'Stable', 'Shrinking', 'Unknown']",
                "structure": "one of ['Independent', 'Parent', 'Subsidiary']",
                "parentCompany": "Name of parent if Subsidiary",
                "subsidiaries": ["Name1", "Name2"] (if Parent),
                "tags": ["Tag1 (Hebrew)", "Tag2 (Hebrew)"],
                "techTags": ["Tech1 (English)", "Tech2 (English)"],
                "dataConfidence": "one of ['High', 'Medium', 'Low']"
              }
            ]
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview', // Strongest model for reasoning
                contents: prompt,
                config: { 
                    tools: [{ googleSearch: {} }] 
                }
            });

            // Robust JSON extraction
            const rawText = response.text || "[]";
            const jsonMatch = rawText.match(/\[[\s\S]*\]/);
            const jsonStr = jsonMatch ? jsonMatch[0] : "[]";

            let enrichedData = [];
            try {
                 enrichedData = JSON.parse(jsonStr);
            } catch (e) {
                console.error("JSON Parse Error:", e);
                console.log("Raw Text:", rawText);
            }

            if (Array.isArray(enrichedData) && enrichedData.length > 0) {
                setCompanies(prev => prev.map(c => {
                    if (selectedIds.has(c.id)) {
                        // Fuzzy match by name
                        const enriched = enrichedData.find((e: any) => 
                            e.name === c.name || 
                            c.name.toLowerCase().includes(e.name.toLowerCase()) || 
                            e.name.toLowerCase().includes(c.name.toLowerCase())
                        );
                        
                        if (enriched) {
                            return {
                                ...c,
                                nameEn: enriched.nameEn || c.nameEn,
                                legalName: enriched.legalName || c.legalName,
                                aliases: enriched.aliases && Array.isArray(enriched.aliases) ? enriched.aliases : c.aliases,
                                description: enriched.description || c.description,
                                mainField: enriched.mainField || c.mainField,
                                subField: enriched.subField || c.subField,
                                employeeCount: enriched.employeeCount || c.employeeCount,
                                website: enriched.website || c.website,
                                linkedinUrl: enriched.linkedinUrl || c.linkedinUrl,
                                foundedYear: enriched.foundedYear || c.foundedYear,
                                location: enriched.location || c.location,
                                hqCountry: enriched.hqCountry || c.hqCountry,
                                type: enriched.type || c.type,
                                classification: enriched.classification || c.classification,
                                businessModel: enriched.businessModel || c.businessModel,
                                productType: enriched.productType || c.productType,
                                growthIndicator: enriched.growthIndicator || c.growthIndicator,
                                structure: enriched.structure || 'Independent',
                                parentCompany: enriched.parentCompany || '',
                                subsidiaries: enriched.subsidiaries || [],
                                tags: enriched.tags && Array.isArray(enriched.tags) ? enriched.tags : c.tags,
                                techTags: enriched.techTags && Array.isArray(enriched.techTags) ? enriched.techTags : c.techTags,
                                dataConfidence: 'Pending Review', // Set to pending review after AI enrichment
                                lastVerified: new Date().toISOString().split('T')[0]
                            };
                        }
                    }
                    return c;
                }));
            }

            // Clear selection after success
            setSelectedIds(new Set());

        } catch (error) {
            console.error("Enrichment failed:", error);
            // DO NOT ALERT THE USER if it's just a temporary network glitch or XHR error. 
            // In a real app we might retry or log. For this demo, we'll log to console.
             alert("אירעה שגיאה בתהליך ההעשרה. ייתכן והרשת אינה יציבה. אנא נסה שנית.");
        } finally {
            setIsEnriching(false);
        }
    };
    
    // --- AI Chat Logic ---
    const handleOpenChat = () => {
        setIsChatOpen(true);
        if (!chatSession) {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             
             const systemInstruction = `You are a Company Research Assistant.
             Your goal is to help the user find information about companies, competitors, key contacts, and market trends.
             You have access to a tool 'addCompaniesToDatabase' to add companies.
             
             GUIDELINES:
             1. **Market Research**: Provide detailed analysis of companies, industries, and trends.
             2. **Competitor Analysis**: Identify direct and indirect competitors for a given company.
             3. **News & Updates**: Summarize recent news, acquisitions, or funding rounds.
             4. **Structure Analysis**: Always identify if a company is part of a larger group or holds subsidiaries.
             5. **Contact Finding**: Suggest relevant job titles or departments to contact for recruitment (do not invent personal emails unless public).
             6. **Language**: Always converse in Hebrew.
             
             Context: You are embedded in a "Global Company Database" for a recruitment system.`;
             
             const session = ai.chats.create({
                 model: 'gemini-3-flash-preview',
                 config: { 
                     systemInstruction,
                     tools: [{ functionDeclarations: [addCompaniesTool] }]
                 }
             });
             setChatSession(session);
             setChatMessages([{ role: 'model', text: 'היי, אני עוזר המחקר שלך. איך אני יכול לעזור לך עם מידע על חברות, מבנה ארגוני או מתחרים?' }]);
        }
    };
    
    const handleSendMessage = async (text: string) => {
        if (!text.trim() || !chatSession) return;
        setChatMessages(prev => [...prev, { role: 'user', text }]);
        setIsChatLoading(true);
        try {
            const result = await chatSession.sendMessage({ message: text });
            
            // Handle Function Calls
            if (result.functionCalls) {
                for (const call of result.functionCalls) {
                    if (call.name === 'addCompaniesToDatabase') {
                        const { companies: newCompaniesList } = call.args as any;
                        const addedCompanies: Company[] = newCompaniesList.map((c: any) => ({
                            id: Date.now() + Math.random(),
                            name: c.name,
                            nameEn: '',
                            legalName: '',
                            aliases: [],
                            description: c.description || 'Added by AI',
                            mainField: c.mainField || 'General',
                            subField: '',
                            employeeCount: 'Unknown',
                            website: '',
                            linkedinUrl: '',
                            foundedYear: '',
                            location: 'Unknown',
                            hqCountry: 'Israel',
                            type: 'Unknown',
                            classification: 'פרטית',
                            businessModel: 'Unknown',
                            productType: 'Unknown',
                            growthIndicator: 'Unknown',
                            structure: 'Independent',
                            tags: [],
                            techTags: [],
                            dataConfidence: 'Pending Review', // Mark as pending review initially
                            lastVerified: new Date().toISOString().split('T')[0]
                        }));

                        setCompanies(prev => [...addedCompanies, ...prev]);
                        
                        const toolResponse = await chatSession.sendMessage({ 
                            message: `Successfully added ${addedCompanies.length} companies: ${addedCompanies.map(c => c.name).join(', ')}. Inform the user.` 
                        });
                        
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || `הוספתי ${addedCompanies.length} חברות למאגר בהצלחה.` }]);
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: result.text || '' }]);
            }
        } catch (e) {
            console.error(e);
            setChatMessages(prev => [...prev, { role: 'model', text: 'שגיאה בתקשורת.' }]);
        } finally {
            setIsChatLoading(false);
        }
    };
    
    // ... (Keep renderCell function)
    const renderCell = (company: Company, columnId: string) => {
         // ... existing implementation
         switch (columnId) {
             case 'name':
                 return (
                     <>
                        <div className="font-bold text-text-default text-base">{company.name}</div>
                        <div className="text-xs text-text-muted truncate max-w-[200px]" title={company.description}>{company.description}</div>
                     </>
                 );
             case 'mainField':
                 return (
                     <>
                        {company.mainField}
                        {company.subField && <span className="text-text-muted text-xs block">{company.subField}</span>}
                     </>
                 );
             case 'structure':
                 return (
                     <div className="flex flex-col gap-1">
                         {company.structure === 'Parent' && (
                             <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold w-fit">
                                 <BuildingOffice2Icon className="w-3 h-3"/> חברת אם
                             </span>
                         )}
                         {company.structure === 'Subsidiary' && (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium w-fit border border-blue-100">
                                 חברת בת
                             </span>
                         )}
                         {company.structure === 'Independent' && <span className="text-xs text-text-muted">עצמאית</span>}
                         
                         {company.subsidiaries && company.subsidiaries.length > 0 && (
                             <span className="text-[10px] text-text-subtle truncate max-w-[150px]" title={company.subsidiaries.join(', ')}>
                                 בנות: {company.subsidiaries.length}
                             </span>
                         )}
                     </div>
                 );
             case 'businessModel':
                  return company.businessModel !== 'Unknown' ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${company.businessModel === 'B2B' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                            {company.businessModel}
                        </span>
                    ) : '-';
             case 'linkedinUrl':
                 return company.linkedinUrl ? (
                    <a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#0077b5] hover:text-[#005582]" onClick={e => e.stopPropagation()}>
                        <LinkedInIcon className="w-5 h-5 inline"/>
                    </a>
                ) : <span className="text-text-subtle text-xs">-</span>;
            case 'foundedYear': return <span className="text-text-muted font-mono">{company.foundedYear || '-'}</span>;
            case 'employeeCount': return <span className="font-mono text-text-default font-semibold">{company.employeeCount}</span>;
            case 'dataConfidence':
                if (company.dataConfidence === 'Pending Review') {
                    return (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">
                             <ExclamationTriangleIcon className="w-3 h-3" /> ממתין לסקירה
                        </span>
                    );
                }
                return (
                     <div className="flex items-center gap-1.5" title={`רמת אמינות: ${company.dataConfidence}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${company.dataConfidence === 'High' ? 'bg-green-500' : company.dataConfidence === 'Medium' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                        <span className="text-xs text-text-muted">{company.dataConfidence}</span>
                    </div>
                );
            case 'techTags':
                return (
                     <div className="flex flex-wrap gap-1" dir="ltr">
                        {company.techTags?.slice(0, 2).map((tag, i) => (
                            <span key={i} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                {tag}
                            </span>
                        ))}
                        {company.techTags?.length > 2 && <span className="text-[10px] text-text-muted font-medium">+{company.techTags.length - 2}</span>}
                    </div>
                );
            case 'location': 
                 return (
                    <div className="flex items-center gap-1 text-text-muted">
                         <MapPinIcon className="w-3.5 h-3.5"/> {company.location}
                    </div>
                 );
            case 'lastVerified': return <span className="text-xs text-text-muted">{company.lastVerified}</span>;
            default: return (company as any)[columnId];
         }
    };


    return (
        <div className="flex flex-col h-full bg-bg-default relative">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            
            {/* 1. Header (Fixed at top) */}
            <div className="p-6 pb-0 flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                            <GlobeAmericasIcon className="w-8 h-8 text-primary-500"/>
                            מאגר חברות גלובאלי
                        </h1>
                        <p className="text-text-muted mt-1">ניהול מידע עסקי על חברות, מועשר ע"י AI</p>
                    </div>
                    <div className="flex gap-3">
                         <button 
                            onClick={() => setFilters(prev => ({ ...prev, showPendingOnly: !prev.showPendingOnly }))}
                            className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-xl transition shadow-sm border ${filters.showPendingOnly ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'}`}
                        >
                            <ExclamationTriangleIcon className="w-5 h-5"/>
                            <span>ממתינים לסקירה</span>
                        </button>
                        <button 
                             onClick={handleOpenChat}
                             className="flex items-center gap-2 bg-white border border-border-default text-primary-700 font-bold py-2.5 px-4 rounded-xl hover:bg-primary-50 transition shadow-sm"
                         >
                             <ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>
                             <span>התייעץ עם AI</span>
                         </button>
                        <button 
                            onClick={handleCreateCompany}
                            className="flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-primary-700 transition shadow-md whitespace-nowrap"
                        >
                            <PlusIcon className="w-5 h-5"/>
                            <span>חברה חדשה</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto">
                <div className="p-6">
                    
                    {/* Filters Container */}
                    <div className="bg-bg-card border border-border-default rounded-2xl p-4 shadow-sm flex flex-col gap-4 mb-6">
                         <div className="flex flex-col md:flex-row gap-4">
                             {/* Search Bar */}
                             <div className="relative flex-grow">
                                <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    placeholder="חפש לפי שם חברה, טכנולוגיות או מילות מפתח..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-10 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                                />
                            </div>
                            
                            {/* Advanced Search Toggle */}
                            <button 
                                onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                                className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-xl transition border ${isAdvancedSearchOpen ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                            >
                                <AdjustmentsHorizontalIcon className="w-5 h-5" />
                                <span>חיפוש מתקדם</span>
                            </button>
                         </div>

                        {/* Standard Filters Row */}
                        {!isAdvancedSearchOpen && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex-1 min-w-[150px]">
                                     <input type="text" name="field" placeholder="תחום עיסוק" value={filters.field} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <input type="text" name="location" placeholder="מיקום" value={filters.location} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <select name="type" value={filters.type} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                                         <option value="">סוג חברה (הכל)</option>
                                         <option value="הייטק">הייטק</option>
                                         <option value="תעשייה">תעשייה</option>
                                         <option value="מסחר וקמעונאות">מסחר וקמעונאות</option>
                                         <option value="שירותים">שירותים</option>
                                         <option value="פיננסים">פיננסים</option>
                                     </select>
                                </div>
                                 <div className="flex-1 min-w-[150px]">
                                     <select name="size" value={filters.size} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                                         <option value="">גודל (הכל)</option>
                                         <option value="1-10">1-10</option>
                                         <option value="11-50">11-50</option>
                                         <option value="51-200">51-200</option>
                                         <option value="201-1000">201-1000</option>
                                         <option value="1000+">1000+</option>
                                         <option value="10000+">10000+</option>
                                     </select>
                                </div>
                                 <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default ml-auto">
                                    <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                                    <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                                </div>
                            </div>
                        )}

                        {/* Advanced Filters Grid */}
                        {isAdvancedSearchOpen && (
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-2 border-t border-border-default animate-fade-in">
                                {/* Identity */}
                                <input type="text" name="name" placeholder="שם חברה (עברית)" value={filters.name} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="nameEn" placeholder="שם באנגלית" value={filters.nameEn} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                <input type="text" name="legalName" placeholder="שם משפטי" value={filters.legalName} onChange={handleFilterChange} className="input-field" />
                                
                                {/* Digital */}
                                <input type="text" name="website" placeholder="אתר אינטרנט" value={filters.website} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                <input type="text" name="linkedin" placeholder="לינקדאין" value={filters.linkedin} onChange={handleFilterChange} className="input-field" dir="ltr" />
                                
                                {/* Business */}
                                <input type="text" name="mainField" placeholder="תעשייה ראשית" value={filters.field} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="subField" placeholder="תת-תחום" value={filters.subField} onChange={handleFilterChange} className="input-field" />
                                <select name="businessModel" value={filters.businessModel} onChange={handleFilterChange} className="input-field">
                                    <option value="">מודל עסקי (הכל)</option>
                                    <option value="B2B">B2B</option>
                                    <option value="B2C">B2C</option>
                                    <option value="B2G">B2G</option>
                                </select>
                                <select name="productType" value={filters.productType} onChange={handleFilterChange} className="input-field">
                                    <option value="">סוג מוצר (הכל)</option>
                                    <option value="Product">מוצר</option>
                                    <option value="Service">שירות</option>
                                    <option value="Platform">פלטפורמה</option>
                                </select>

                                {/* Structure */}
                                <select name="classification" value={filters.classification} onChange={handleFilterChange} className="input-field">
                                    <option value="">סיווג משפטי (הכל)</option>
                                    <option value="פרטית">פרטית</option>
                                    <option value="ציבורית">ציבורית</option>
                                    <option value="ממשלתית">ממשלתית</option>
                                </select>
                                <select name="structure" value={filters.structure} onChange={handleFilterChange} className="input-field">
                                    <option value="">מבנה ארגוני (הכל)</option>
                                    <option value="Independent">עצמאית</option>
                                    <option value="Parent">חברת אם</option>
                                    <option value="Subsidiary">חברת בת</option>
                                </select>
                                <input type="text" name="parent" placeholder="חברת אם" value={filters.parent} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="founded" placeholder="שנת הקמה" value={filters.founded} onChange={handleFilterChange} className="input-field" />
                                
                                {/* Tech & Tags */}
                                <input type="text" name="tags" placeholder="תגיות כלליות" value={filters.tags} onChange={handleFilterChange} className="input-field" />
                                <input type="text" name="tech" placeholder="Tech Stack" value={filters.tech} onChange={handleFilterChange} className="input-field" dir="ltr" />

                                <div className="col-span-full flex justify-end gap-2 mt-2">
                                     <button onClick={handleClearFilters} className="text-text-muted hover:text-red-500 font-bold text-sm px-4 py-2">נקה הכל</button>
                                     <button onClick={() => setIsAdvancedSearchOpen(false)} className="bg-bg-subtle text-text-default font-bold text-sm px-4 py-2 rounded-lg hover:bg-bg-hover">סגור</button>
                                </div>
                            </div>
                        )}
                        <style>{`.input-field { @apply w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none; }`}</style>
                    </div>

                    {/* Bulk Action Bar */}
                    {selectedIds.size > 0 && (
                        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex items-center justify-between animate-fade-in flex-shrink-0 mb-4">
                            <div className="flex items-center gap-4">
                                <span className="font-bold text-primary-900 text-sm px-2">{selectedIds.size} נבחרו</span>
                                <div className="h-6 w-px bg-primary-200"></div>
                                <button 
                                    onClick={handleBulkEnrich} 
                                    disabled={isEnriching}
                                    className="flex items-center gap-2 bg-white text-primary-700 font-bold py-1.5 px-4 rounded-lg shadow-sm border border-primary-100 hover:bg-primary-50 transition disabled:opacity-50"
                                >
                                    {isEnriching ? (
                                        <span className="flex items-center gap-2">
                                            <SparklesIcon className="w-4 h-4 animate-spin text-purple-500" />
                                            מעשיר נתונים...
                                        </span>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-4 h-4 text-purple-500" />
                                            <span>העשרה עמוקה (Deep Dive)</span>
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={handleBulkDelete}
                                    className="flex items-center gap-2 bg-white text-red-600 font-bold py-1.5 px-4 rounded-lg shadow-sm border border-red-100 hover:bg-red-50 transition"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    <span>מחק נבחרים</span>
                                </button>
                            </div>
                            <button onClick={() => setSelectedIds(new Set())} className="text-text-muted hover:text-primary-600 text-sm font-medium">ביטול בחירה</button>
                        </div>
                    )}

                    {/* Table View */}
                    {viewMode === 'table' ? (
                        <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm text-right min-w-[1000px]">
                                {/* Sticky Header */}
                                <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="p-4 w-12 text-center bg-bg-subtle">
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={filteredCompanies.length > 0 && selectedIds.size === filteredCompanies.length}
                                                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                            />
                                        </th>
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumnsDef.find(c => c.id === colId);
                                            if(!col) return null;
                                            return (
                                                <th 
                                                    key={col.id}
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover bg-bg-subtle ${draggingColumn === col.id ? 'dragging' : ''}`}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id)} 
                                                    onDragEnter={() => handleDragEnter(index)} 
                                                    onDragEnd={handleDragEnd} 
                                                    onDragOver={(e) => e.preventDefault()}
                                                >
                                                    {col.label}
                                                </th>
                                            )
                                        })}
                                        <th className="p-4 w-20 bg-bg-subtle">
                                            <div className="relative" ref={settingsRef}>
                                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                                {isSettingsOpen && (
                                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                        <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                                        {allColumnsDef.map(column => (
                                                            <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                                            <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                                            {column.label}
                                                            </label>
                                                        ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredCompanies.map(company => (
                                        <tr 
                                            key={company.id} 
                                            className={`hover:bg-bg-hover transition-colors group cursor-pointer ${selectedIds.has(company.id) ? 'bg-primary-50/50' : ''}`}
                                            onClick={() => handleEditCompany(company)}
                                        >
                                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(company.id)}
                                                    onChange={() => handleSelect(company.id)}
                                                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                                />
                                            </td>
                                            
                                            {visibleColumns.map(colId => (
                                                <td key={colId} className="p-4">
                                                    {renderCell(company, colId)}
                                                </td>
                                            ))}

                                            <td className="p-4 text-center">
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center gap-1">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id); }}
                                                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                                                        title="מחק"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredCompanies.map(company => (
                                <div 
                                    key={company.id} 
                                    className={`bg-bg-card border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group flex flex-col relative cursor-pointer ${selectedIds.has(company.id) ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-border-default'}`}
                                    onClick={() => handleEditCompany(company)}
                                >
                                    <div className="absolute top-4 left-4 z-10" onClick={e => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(company.id)}
                                            onChange={() => handleSelect(company.id)}
                                            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 cursor-pointer"
                                        />
                                    </div>
                                    
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="w-12 h-12 bg-white border border-border-default rounded-xl flex items-center justify-center font-bold text-xl text-primary-600 uppercase shadow-sm">
                                            {company.name.charAt(0)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-bold text-lg text-text-default leading-tight truncate" title={company.name}>{company.name}</h3>
                                            <p className="text-xs text-text-muted mt-1 font-medium">{company.mainField}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 mb-4 text-xs">
                                        {company.linkedinUrl && (
                                            <a href={company.linkedinUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-[#0077b5] hover:underline bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                <LinkedInIcon className="w-3 h-3"/> לינקדאין
                                            </a>
                                        )}
                                        {company.website && (
                                            <a href={company.website} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 text-text-muted hover:text-primary-600 hover:underline">
                                                <GlobeAmericasIcon className="w-3 h-3"/> אתר
                                            </a>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {company.businessModel && company.businessModel !== 'Unknown' && <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 font-bold">{company.businessModel}</span>}
                                        {company.foundedYear && <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">הוקמה ב-{company.foundedYear}</span>}
                                        <span className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-200">{company.employeeCount} עובדים</span>
                                    </div>

                                    <div className="mt-auto pt-4 border-t border-border-subtle flex justify-between items-center text-xs text-text-subtle font-medium">
                                        <span className="flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5"/> {company.location}</span>
                                        
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCompany(company.id); }}
                                            className="hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <CompanyModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveCompany}
                company={editingCompany}
            />

            {/* AI Assistant Chat (Floating Button is in Header, Chat logic here) */}
             <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                isLoading={isChatLoading}
                error={null}
                onSendMessage={handleSendMessage}
                onReset={() => { setChatSession(null); setChatMessages([]); }}
            />
        </div>
    );
};

export default AdminCompaniesView;
