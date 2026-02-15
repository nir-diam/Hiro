
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
    MagnifyingGlassIcon, PlusIcon, SparklesIcon, GlobeAmericasIcon, 
    MapPinIcon, Squares2X2Icon, TableCellsIcon, 
    TrashIcon, XMarkIcon, LinkedInIcon, BriefcaseIcon,
    ChartBarIcon, BoltIcon, ShieldCheckIcon, Cog6ToothIcon, ChatBubbleBottomCenterTextIcon,
    BuildingOffice2Icon, ExclamationTriangleIcon, CheckCircleIcon, AdjustmentsHorizontalIcon, FunnelIcon, TagIcon
} from './Icons';
import { GoogleGenAI, Chat, FunctionDeclaration, Type } from '@google/genai';
import HiroAIChat from './HiroAIChat';

// --- Types ---
type BusinessModel = 'B2B' | 'B2C' | 'B2G' | 'Mixed' | 'Unknown';
type ProductType = 'Product' | 'Service' | 'Platform' | 'Project' | 'Unknown';
type GrowthIndicator = 'Growing' | 'Stable' | 'Shrinking' | 'Unknown';
type DataConfidence = 'חדש' | 'ממתין לסקירה' | 'הושלם'; 
type CorporateStructure = 'Independent' | 'Parent' | 'Subsidiary';

interface Company {
    id: string;
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
    secondaryField: string;
    history: HistoryEntry[];
    businessModel: BusinessModel;
    productType: ProductType;
    type: string;      // Organization Type (High-tech, Industry...)
    classification: string; // Public/Private
    comments?: string;
    
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

interface TagSuggestion {
    companyId: string;
    companyName: string;
    tags: string[];
    techTags: string[];
    enriched?: Record<string, string>;
}

interface SuggestionSelection {
    tags: boolean;
    techTags: boolean;
    enriched: Record<string, boolean>;
}

interface HistoryEntry {
    id: string;
    timestamp: string;
    action: string;
    details: string;
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

const suggestTagsTool: FunctionDeclaration = {
    name: 'suggestTagsForCompanies',
    description: 'Recommend general business tags and tech stack tags for the selected companies.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            companyIds: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING,
                    description: 'Company id (local)'
                }
            }
        },
        required: ['companyIds']
    }
};

// --- Initial Data ---
const initialCompanies: Company[] = [
    { 
        id: '1', 
        name: 'Wix', 
        nameEn: 'Wix.com Ltd.',
        legalName: 'Wix.com Ltd.',
        aliases: ['Wix.com', 'ויקס'],
        description: 'פלטפורמה לבניית אתרים המאפשרת למשתמשים ליצור אתרים מקצועיים בקלות.', 
        mainField: 'אינטרנט', 
        subField: 'SaaS', 
        secondaryField: '',
        history: [],
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
        dataConfidence: 'הושלם',
        lastVerified: '2025-05-01'
    },
    { 
        id: '2', 
        name: 'תנובה', 
        nameEn: 'Tnuva',
        legalName: 'Tnuva Food Industries Ltd',
        aliases: ['תנובה שף', 'קבוצת תנובה'],
        description: 'קונצרן המזון הגדול בישראל, העוסק בייצור ושיווק של מוצרי חלב ומזון.', 
        mainField: 'מזון ומשקאות', 
        subField: 'Manufacturing', 
        secondaryField: '',
        history: [],
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
        dataConfidence: 'הושלם',
        lastVerified: '2025-04-15'
    },
    { 
        id: '3', 
        name: 'אלביט מערכות', 
        nameEn: 'Elbit Systems',
        legalName: 'Elbit Systems Ltd.',
        aliases: ['Elbit', 'אלביט', 'אלישרא'],
        description: 'חברה ביטחונית טכנולוגית בינלאומית העוסקת בפיתוח מערכות אלקטרוניות.', 
        mainField: 'ביטחוני', 
        subField: 'Electronics', 
        secondaryField: '',
        history: [],
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
        dataConfidence: 'הושלם',
        lastVerified: '2025-05-10'
    },
    {
        id: '4',
        name: 'Elco',
        nameEn: 'Elco Ltd.',
        legalName: 'Elco Ltd.',
        aliases: ['אלקו', 'קבוצת אלקו'],
        description: 'חברת אחזקות ישראלית הפועלת בתחומי התשתיות, הבנייה, מוצרי הצריכה, והנדל"ן.',
        mainField: 'אחזקות',
        subField: 'Investment',
        secondaryField: '',
        history: [],
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
        dataConfidence: 'ממתין לסקירה',
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

// --- Company Modal Component ---
interface PicklistCategory {
    id: string;
    name: string;
    key: string;
    description?: string;
    module: string;
    parentId?: string | null;
}

interface PicklistValue {
    id: string;
    label: string;
    value: string;
    isActive?: boolean;
}

const BUSINESS_FIELD_CATEGORY_ID = '16c81e14-316d-403d-951a-263d02f57f4b';
const SECTOR_CATEGORY_ID = '63e497f1-a763-4cba-944d-5a731e96d433';

const CompanyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (company: Company) => Promise<void> | void;
    company: Company | null;
}> = ({ isOpen, onClose, onSave, company }) => {
    const [formData, setFormData] = useState<Company>({
        id: '',
        name: '', nameEn: '', legalName: '', aliases: [],
        description: '',
        mainField: '', subField: '', secondaryField: '',
        employeeCount: '',
        website: '', linkedinUrl: '',
        foundedYear: '', location: '', hqCountry: 'Israel',
        type: 'הייטק', classification: 'פרטית',
        businessModel: 'B2B', productType: 'Product',
        growthIndicator: 'Unknown',
        structure: 'Independent', parentCompany: '', subsidiaries: [],
        tags: [], techTags: [],
        comments: '',
        dataConfidence: 'ממתין לסקירה', lastVerified: new Date().toISOString().split('T')[0],
        history: [],
    });
    
    const [tagsInput, setTagsInput] = useState('');
    const [techTagsInput, setTechTagsInput] = useState('');
    const [subsidiariesInput, setSubsidiariesInput] = useState('');
    const [aliasesInput, setAliasesInput] = useState('');
    const [activeTab, setActiveTab] = useState<'profile' | 'history'>('profile');

    useEffect(() => {
        if (isOpen) {
            if (company) {
                setFormData({
                    ...company,
                    secondaryField: company.secondaryField || '',
                    history: company.history || [],
                });
                setTagsInput(company.tags.join(', '));
                setTechTagsInput(company.techTags.join(', '));
                setSubsidiariesInput(company.subsidiaries ? company.subsidiaries.join(', ') : '');
                setAliasesInput(company.aliases ? company.aliases.join(', ') : '');
            } else {
                setFormData({
                    id: '',
                    name: '', nameEn: '', legalName: '', aliases: [],
                    description: '',
                    mainField: '', subField: '', secondaryField: '',
                    employeeCount: '',
                    website: '', linkedinUrl: '',
                    foundedYear: '', location: '', hqCountry: 'Israel',
                    type: 'הייטק', classification: 'פרטית',
                    businessModel: 'B2B', productType: 'Product',
                    growthIndicator: 'Unknown',
                    structure: 'Independent', parentCompany: '', subsidiaries: [],
                    tags: [], techTags: [],
                    dataConfidence: 'חדש', lastVerified: new Date().toISOString().split('T')[0],
                    history: [],
                });
                setTagsInput('');
                setTechTagsInput('');
                setSubsidiariesInput('');
                setAliasesInput('');
            }
            setActiveTab('profile');
        }
    }, [isOpen, company]);

    const sortedHistoryEntries = useMemo(() => {
        const list = Array.isArray(formData.history) ? formData.history : [];
        return [...list].sort((a, b) => {
            const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
            return bTime - aTime;
        });
    }, [formData.history]);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [mainFieldOptions, setMainFieldOptions] = useState<PicklistCategory[]>([]);
    const [subFieldValues, setSubFieldValues] = useState<PicklistValue[]>([]);
    const [sectorOptions, setSectorOptions] = useState<PicklistValue[]>([]);
    const [selectedMainFieldId, setSelectedMainFieldId] = useState<string>('');
    const [isLoadingMainFields, setIsLoadingMainFields] = useState(false);
    const [isLoadingSubFieldValues, setIsLoadingSubFieldValues] = useState(false);
    const [isLoadingSectorOptions, setIsLoadingSectorOptions] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    const loadBusinessSubcategories = useCallback(async (initialField: string) => {
        if (!apiBase) return;
        setIsLoadingMainFields(true);
        try {
            const res = await fetch(`${apiBase}/api/picklists/categories/${BUSINESS_FIELD_CATEGORY_ID}/subcategories`);
            if (!res.ok) throw new Error('Failed to load business subcategories');
            const data = await res.json();
            const resolved = Array.isArray(data) ? data : [];
            setMainFieldOptions(resolved);
            if (!resolved.length) {
                setSelectedMainFieldId('');
                setSubFieldValues([]);
                return;
            }
            const match = resolved.find(option => option.key === initialField || option.name === initialField || option.id === initialField);
            const nextId = match?.id || resolved[0].id;
            setSelectedMainFieldId(nextId);
            if (!initialField && (match?.name || resolved[0].name)) {
                setFormData(prev => ({ ...prev, mainField: match?.name || resolved[0].name || '' }));
            }
        } catch (err) {
            console.error('Failed to load business subcategories', err);
            setMainFieldOptions([]);
        } finally {
            setIsLoadingMainFields(false);
        }
    }, [apiBase]);

    const loadSubFieldValues = useCallback(async (categoryId: string, currentSubField: string) => {
        if (!apiBase || !categoryId) {
            setSubFieldValues([]);
            return;
        }
        setIsLoadingSubFieldValues(true);
        try {
            const res = await fetch(`${apiBase}/api/picklists/categories/${categoryId}/values`);
            if (!res.ok) throw new Error('Failed to load subfield values');
            const data = await res.json();
            const resolved = Array.isArray(data) ? data : [];
            setSubFieldValues(resolved);
            if (!currentSubField && resolved.length) {
                const nextValue = resolved[0].label || resolved[0].value || '';
                if (nextValue) {
                    setFormData(prev => ({ ...prev, subField: nextValue }));
                }
            }
        } catch (err) {
            console.error('Failed to load subfield values', err);
            setSubFieldValues([]);
        } finally {
            setIsLoadingSubFieldValues(false);
        }
    }, [apiBase]);

    const loadSectorOptions = useCallback(async () => {
        if (!apiBase) return;
        setIsLoadingSectorOptions(true);
        try {
            const res = await fetch(`${apiBase}/api/picklists/categories/${SECTOR_CATEGORY_ID}/values`);
            if (!res.ok) throw new Error('Failed to load sector options');
            const data = await res.json();
            const resolved = Array.isArray(data) ? data : [];
            setSectorOptions(resolved);
            if (!formData.type && resolved.length) {
                const first = resolved.find(v => v.label || v.value);
                const nextValue = first?.label || first?.value || '';
                if (nextValue) {
                    setFormData(prev => ({ ...prev, type: nextValue }));
                }
            }
        } catch (err) {
            console.error('Failed to load sector options', err);
            setSectorOptions([]);
        } finally {
            setIsLoadingSectorOptions(false);
        }
    }, [apiBase, formData.type]);

    useEffect(() => {
        if (!isOpen) {
            setSelectedMainFieldId('');
            setSubFieldValues([]);
            return;
        }
        loadBusinessSubcategories(company?.mainField || '');
    }, [isOpen, company?.mainField, loadBusinessSubcategories]);

    useEffect(() => {
        if (!isOpen) return;
        loadSectorOptions();
    }, [isOpen, loadSectorOptions]);

    useEffect(() => {
        if (!selectedMainFieldId) {
            setSubFieldValues([]);
            setFormData(prev => ({ ...prev, subField: '' }));
            return;
        }
        loadSubFieldValues(selectedMainFieldId, formData.subField);
    }, [selectedMainFieldId, loadSubFieldValues]);

    if (!isOpen) return null;

    const handleMainFieldSelect = (id: string) => {
        const next = mainFieldOptions.find(option => option.id === id);
        setFormData(prev => ({ ...prev, mainField: next?.name || '', subField: '' }));
        setSelectedMainFieldId(next?.id || '');
    };

    const handleSubFieldSelect = (value: string) => {
        setFormData(prev => ({ ...prev, subField: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const techTags = techTagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const subsidiaries = subsidiariesInput.split(',').map(t => t.trim()).filter(Boolean);
        const aliases = aliasesInput.split(',').map(t => t.trim()).filter(Boolean);
        
        await onSave({ 
            ...formData, 
            tags, 
            techTags, 
            subsidiaries,
            aliases,
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
                        <div className="mt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab('profile')}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${activeTab === 'profile' ? 'bg-primary-600 text-white' : 'bg-bg-input text-text-muted'}`}
                            >
                                פרופיל חברה
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('history')}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${activeTab === 'history' ? 'bg-primary-600 text-white' : 'bg-bg-input text-text-muted'}`}
                            >
                                היסטוריה
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                {activeTab === 'profile' ? (
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
                                <label className="block text-xs font-semibold text-text-muted mb-1">תעשייה</label>
                                <div className="relative">
                                    <select
                                        name="mainField"
                                        value={selectedMainFieldId}
                                        onChange={(e) => handleMainFieldSelect(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                    >
                                        <option value="">בחר תעשייה </option>
                                        {mainFieldOptions.map(option => (
                                            <option key={option.id} value={option.id}>{option.name}</option>
                                        ))}
                                    </select>
                                    {isLoadingMainFields && (
                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted bg-white/70 rounded-lg pointer-events-none">
                                            טוען...
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">תחום עיקרי</label>
                                <div className="relative">
                                    {isLoadingSubFieldValues ? (
                                        <div className="p-2.5 bg-bg-input border border-border-default rounded-lg text-sm text-text-muted">טוען...</div>
                                    ) : (
                                        <select
                                            name="subField"
                                            value={formData.subField || ''}
                                            onChange={(e) => handleSubFieldSelect(e.target.value)}
                                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                            disabled={!subFieldValues.length}
                                        >
                                            <option value="">{subFieldValues.length ? 'בחר תת-תחום' : 'אין נתונים'}</option>
                                            {subFieldValues.map(value => {
                                                const label = value.label || value.value || 'הערך';
                                                return (
                                                    <option key={value.id} value={label}>{label}</option>
                                                );
                                            })}
                                        </select>
                                    )}
                                </div>
                            </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-text-muted mb-1">תחום משני</label>
                        <input
                            type="text"
                            name="secondaryField"
                            value={formData.secondaryField || ''}
                            onChange={handleChange}
                            placeholder="תחום משני"
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">סוג חברה</label>
                                <input
                                    type="text"
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    placeholder="לדוגמה: הייטק, תעשייה, שירותים"
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                />
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
                                    {isLoadingSectorOptions ? (
                                        <option value="">טוען...</option>
                                    ) : (
                                        (sectorOptions.length ? sectorOptions : [
                                            { id: 'fallback-1', label: 'הייטק', value: 'הייטק' },
                                            { id: 'fallback-2', label: 'תעשייה', value: 'תעשייה' },
                                            { id: 'fallback-3', label: 'פיננסים', value: 'פיננסים' },
                                            { id: 'fallback-4', label: 'שירותים', value: 'שירותים' },
                                            { id: 'fallback-5', label: 'אחר', value: 'אחר (אחזקות ועוד)' },
                                        ]).map(option => (
                                            <option key={option.id} value={option.value || option.label}>
                                                {option.label}
                                            </option>
                                        ))
                                    )}
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
                            <div className="md:col-span-4">
                                <label className="block text-xs font-semibold text-text-muted mb-1">הערות פנימיות</label>
                                <textarea
                                    name="comments"
                                    value={formData.comments || ''}
                                    onChange={handleChange}
                                    rows={3}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                                    placeholder="הערות כלליות, תצפיות או משימות פתוחות לגבי החברה..."
                                />
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
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {sortedHistoryEntries.length === 0 ? (
                            <div className="text-text-muted text-sm">לא נרשמו עדיין אירועים ביומן.</div>
                        ) : (
                            <ul className="space-y-3">
                                {sortedHistoryEntries.map((entry, idx) => (
                                    <li
                                        key={entry.id || entry.timestamp || idx}
                                        className="border border-border-default rounded-2xl p-4 bg-bg-card/60"
                                    >
                                        <div className="text-[10px] text-text-muted flex justify-between mb-1">
                                            <span>{formatHistoryTimestamp(entry.timestamp || '')}</span>
                                            <span className="font-semibold text-primary-700">{entry.action}</span>
                                        </div>
                                        <p className="text-sm text-text-default whitespace-pre-line">{entry.details || 'עדכון ללא פירוט'}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <footer className="p-4 border-t border-border-default bg-bg-subtle flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-text-muted">
                            <ShieldCheckIcon className={`w-4 h-4 ${formData.dataConfidence === 'הושלם' ? 'text-green-500' : formData.dataConfidence === 'ממתין לסקירה' ? 'text-amber-500' : 'text-blue-500'}`} />
                            <span>רמת אמינות מידע:</span>
                        </div>
                        <select 
                            name="dataConfidence" 
                            value={formData.dataConfidence} 
                            onChange={handleChange} 
                            className={`text-xs font-bold py-1 px-2 rounded-lg border focus:ring-2 focus:ring-primary-500 outline-none transition-colors ${
                                formData.dataConfidence === 'הושלם' ? 'bg-green-50 text-green-700 border-green-200' :
                                formData.dataConfidence === 'ממתין לסקירה' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                        >
                            <option value="חדש">חדש</option>
                            <option value="ממתין לסקירה">ממתין לסקירה</option>
                            <option value="הושלם">הושלם</option>
                        </select>
                    </div>
                    <div className="flex gap-3">
                         <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">ביטול</button>
                        <button onClick={handleSubmit} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all shadow-md">{company ? 'שמור פרטים' : 'צור חברה'}</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

const createHistoryId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatHistoryTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' });
};


const AdminCompaniesView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    // Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const creationAlertRef = useRef(false);
    const [chatMessages, setChatMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [pendingEnrichment, setPendingEnrichment] = useState<Record<string, any>>({});
    const [isSavingEnrichment, setIsSavingEnrichment] = useState(false);
    const [suggestionSelections, setSuggestionSelections] = useState<Record<string, SuggestionSelection>>({});
    const [activeSection, setActiveSection] = useState<'companies' | 'history'>('companies');
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const logHistoryEntry = useCallback((action: string, details: string) => {
        setHistoryEntries(prev => [
            { id: createHistoryId(), timestamp: new Date().toISOString(), action, details },
            ...prev
        ]);
    }, []);
    const mapOrgToCompany = useCallback((org: any): Company => ({
        id: (org.id || '').toString(),
        name: org.name || '',
        nameEn: org.nameEn || org.name || '',
        legalName: org.legalName || org.name || '',
        aliases: org.aliases || [],
        description: org.description || '',
        mainField: org.mainField || '',
        subField: org.subField || '',
        secondaryField: org.secondaryField || '',
        employeeCount: org.employeeCount || '',
        website: org.website || '',
        linkedinUrl: org.linkedinUrl || '',
        foundedYear: org.foundedYear || '',
        location: org.location || '',
        hqCountry: org.hqCountry || '',
        type: org.type || '',
        classification: org.classification || '',
        businessModel: org.businessModel || 'Unknown',
        productType: org.productType || 'Unknown',
        growthIndicator: org.growthIndicator || 'Unknown',
        structure: org.structure || org.relation || 'Independent',
        tags: org.tags || [],
        techTags: org.techTags || [],
        comments: org.comments || '',
        dataConfidence: (org.dataConfidence as any) || 'חדש',
        lastVerified: org.lastVerified || '',
        parentCompany: org.parentCompany || '',
        subsidiaries: org.subsidiaries || [],
        history: Array.isArray(org.history) ? org.history : [],
        isSelected: false
    }), []);

    const loadCompanies = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/organizations`);
            if (!res.ok) throw new Error('Failed to load companies');
            const data = await res.json();
            setCompanies(Array.isArray(data) ? data.map(mapOrgToCompany) : []);
        } catch (err: any) {
            setError(err.message || 'Load failed');
        } finally {
            setIsLoading(false);
        }
    }, [apiBase, mapOrgToCompany]);

    useEffect(() => {
        loadCompanies();
    }, [loadCompanies]);

    const filteredCompanies = useMemo(() => 
        companies.filter(c => {
            // General Search
            const lowerSearch = searchTerm.trim().toLowerCase();
            const aliasesText = (c.aliases || []).join(' ').toLowerCase();
            const matchesSearch = !lowerSearch ||
                                  c.name.toLowerCase().includes(lowerSearch) ||
                                  c.mainField.toLowerCase().includes(lowerSearch) ||
                                  aliasesText.includes(lowerSearch);
            
            // Quick Filters
            const matchesLocation = !filters.location || c.location.includes(filters.location);
            const matchesType = !filters.type || c.type === filters.type;
            const matchesSize = !filters.size || c.employeeCount === filters.size;
            const matchesField = !filters.field || c.mainField.includes(filters.field);
            const matchesPending = !filters.showPendingOnly || c.dataConfidence === 'ממתין לסקירה';

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

    const findDuplicateCompany = (data: Company) => {
        const normalized = (value?: string) => (value || '').trim().toLowerCase();
        const target = {
            name: normalized(data.name),
            nameEn: normalized(data.nameEn),
            legalName: normalized(data.legalName),
        };
        return companies.find(c => {
            if (editingCompany && c.id === editingCompany.id) return false;
            return (
                target.name && normalized(c.name) === target.name ||
                target.nameEn && normalized(c.nameEn) === target.nameEn ||
                target.legalName && normalized(c.legalName) === target.legalName
            );
        });
    };

    const handleSaveCompany = async (companyData: Company) => {
        const actionLabel = editingCompany ? 'עדכון' : 'יצירה';
        const serializeField = (value: any) => {
            if (Array.isArray(value)) return value.join(', ');
            if (value === undefined || value === null) return '';
            return String(value);
        };

        const trackedFields: { key: keyof Company; label: string }[] = [
            { key: 'name', label: 'שם חברה' },
            { key: 'nameEn', label: 'שם באנגלית' },
            { key: 'legalName', label: 'שם משפטי' },
            { key: 'mainField', label: 'תחום עיקרי' },
            { key: 'subField', label: 'תחום' },
            { key: 'secondaryField', label: 'תחום משני' },
            { key: 'type', label: 'סוג' },
            { key: 'businessModel', label: 'מודל עסקי' },
            { key: 'productType', label: 'סוג מוצר' },
            { key: 'structure', label: 'מבנה ארגוני' },
            { key: 'parentCompany', label: 'חברת אם' },
            { key: 'location', label: 'מיקום' },
            { key: 'description', label: 'תיאור' },
            { key: 'comments', label: 'הערות' },
            { key: 'tags', label: 'תגיות' },
            { key: 'techTags', label: 'טכנולוגיות' },
            { key: 'dataConfidence', label: 'רמת אמינות' },
        ];

        const diffs: string[] = [];
        if (editingCompany) {
            trackedFields.forEach(({ key, label }) => {
                const prev = serializeField(editingCompany[key]);
                const next = serializeField(companyData[key]);
                if (prev !== next) {
                    diffs.push(`${label}: ${prev || '—'} → ${next || '—'}`);
                }
            });
        }

        const historyEntry = {
            id: createHistoryId(),
            timestamp: new Date().toISOString(),
            action: actionLabel,
            details: editingCompany
                ? diffs.length ? diffs.join('\n') : 'אישרת שינויים ללא שינוי בשדות המעקב'
                : 'נוצרה חברה חדשה',
        };
        const payload = {
            name: companyData.name,
            nameEn: companyData.nameEn,
            legalName: companyData.legalName,
            mainField: companyData.mainField,
            subField: companyData.subField,
            secondaryField: companyData.secondaryField || '',
            employeeCount: companyData.employeeCount,
            website: companyData.website,
            linkedinUrl: companyData.linkedinUrl,
            location: companyData.location,
            foundedYear: companyData.foundedYear,
            classification: companyData.classification,
            type: companyData.type,
            businessModel: companyData.businessModel,
            productType: companyData.productType,
            growthIndicator: companyData.growthIndicator,
            structure: companyData.structure,
            parentCompany: companyData.parentCompany,
            subsidiaries: companyData.subsidiaries || [],
            tags: companyData.tags || [],
            techTags: companyData.techTags || [],
            description: companyData.description,
            aliases: companyData.aliases || [],
            comments: companyData.comments || '',
            dataConfidence: companyData.dataConfidence,
            lastVerified: companyData.lastVerified,
            history: [...(companyData.history || []), historyEntry],
        };
        if (!editingCompany) {
            const duplicate = findDuplicateCompany(companyData);
            if (duplicate) {
                alert(`שגיאה: קיים כבר ארגון עם שם בעברית "${duplicate.name || companyData.name}", שם באנגלית "${duplicate.nameEn || companyData.nameEn}" או שם משפטי "${duplicate.legalName || companyData.legalName}".`);
                return;
            }
        }
        try {
            if (editingCompany && editingCompany.id) {
                const res = await fetch(`${apiBase}/api/organizations/${editingCompany.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Update failed');
                const updated = await res.json();
                setCompanies(prev => prev.map(c => c.id === editingCompany.id ? mapOrgToCompany(updated) : c));
                logHistoryEntry(historyEntry.action, historyEntry.details);
            } else {
                const res = await fetch(`${apiBase}/api/organizations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error('Create failed');
                const created = await res.json();
                setCompanies(prev => [mapOrgToCompany(created), ...prev]);
                logHistoryEntry(historyEntry.action, historyEntry.details);
            }
        } catch (err: any) {
            alert(err.message || 'Save failed');
        } finally {
            setIsModalOpen(false);
        }
    };

    const handleDeleteCompany = async (id: string) => {
        if (!window.confirm('האם אתה בטוח שברצונך למחוק חברה זו?')) return;
        const companyName = companies.find(c => c.id === id)?.name || 'חברה';
        try {
            await fetch(`${apiBase}/api/organizations/${id}`, { method: 'DELETE' });
            setCompanies(prev => prev.filter(c => c.id !== id));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            logHistoryEntry('מחיקה', `${companyName}`);
        } catch (err) {
            alert('מחיקה נכשלה');
        }
    };
    
    const handleBulkDelete = async () => {
         if (selectedIds.size === 0) return;
         if (!window.confirm(`האם למחוק ${selectedIds.size} חברות שנבחרו?`)) return;
         for (const id of Array.from(selectedIds)) {
            try {
                await fetch(`${apiBase}/api/organizations/${id}`, { method: 'DELETE' });
            } catch (err) {
                console.error('Failed to delete org', id, err);
            }
         }
            setCompanies(prev => prev.filter(c => !selectedIds.has(c.id)));
            setSelectedIds(new Set());
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredCompanies.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelect = (id: string) => {
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
    const callEnrichmentApi = async (companyIds: string[]) => {
        const response = await fetch(`${apiBase}/api/organizations/enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyIds }),
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            const errorMessage = errorPayload?.message || 'Enrichment failed';
            throw new Error(errorMessage);
        }

        return response.json();
    };

    const persistCompanyUpdates = async (updates: { id: string; payload: Record<string, any> }[]) => {
        if (!updates.length) return;
        setIsSavingEnrichment(true);
        try {
            await Promise.all(
                updates.map((update) =>
                    fetch(`${apiBase}/api/organizations/${update.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(update.payload),
                    }),
                ),
            );
        } catch (error) {
            console.error('Failed to save enrichment updates:', error);
            alert('לא הצלחנו לשמור את הנתונים שנבחרו. אנא נסה שוב.');
        } finally {
            setIsSavingEnrichment(false);
        }
    };

    const handleBulkEnrich = async () => {
        if (selectedIds.size !== 1) {
            alert('יש לבחור חברה אחת בלבד לצורך העשרה עמוקה.');
            return;
        }
        setIsEnriching(true);
        try {
            const { suggestions = [], enrichmentMap = {} } = await callEnrichmentApi(Array.from(selectedIds));

            if (!suggestions.length) {
                alert('לא נמצאו הצעות תגיות מתאימות לחברות הנבחרות.');
                return;
            }

            setPendingEnrichment(enrichmentMap);
            setTagSuggestions(suggestions);
            setIsTagModalOpen(true);
            setSelectedIds(new Set());
        } catch (error: any) {
            console.error('Enrichment failed:', error);
            alert(error.message || 'אירעה שגיאה בתהליך ההעשרה. נסה שנית.');
        } finally {
            setIsEnriching(false);
        }
    };

    useEffect(() => {
        if (tagSuggestions.length === 0) {
            setSuggestionSelections({});
            return;
        }
        const nextSelections: Record<string, SuggestionSelection> = {};
        tagSuggestions.forEach(s => {
            const enrichedKeys = Object.keys(s.enriched || {});
            nextSelections[s.companyId] = {
                tags: Boolean(s.tags.length),
                techTags: Boolean(s.techTags.length),
                enriched: enrichedKeys.reduce((acc, key) => {
                    acc[key] = true;
                    return acc;
                }, {} as Record<string, boolean>)
            };
        });
        setSuggestionSelections(nextSelections);
    }, [tagSuggestions]);

    const handleApplyTagSuggestions = () => {
        if (tagSuggestions.length === 0) return;
        const updates: { id: string; payload: Record<string, any> }[] = [];

        // Build updates array outside of setCompanies to ensure reliability
        const nextCompanies = companies.map(c => {
            const suggestion = tagSuggestions.find(s => s.companyId === c.id);
            const enriched = pendingEnrichment[c.id] || suggestion?.enriched || {};
            if (!suggestion && !Object.keys(enriched).length) return c;
            
            const selection = suggestionSelections[c.id] || { tags: true, techTags: true, enriched: {} };

            const shouldApplyTags = Boolean(selection.tags && suggestion?.tags?.length);
            const shouldApplyTech = Boolean(selection.techTags && suggestion?.techTags?.length);
            const mergedTags = shouldApplyTags && suggestion ? Array.from(new Set([...(c.tags || []), ...suggestion.tags])) : c.tags;
            const mergedTech = shouldApplyTech && suggestion ? Array.from(new Set([...(c.techTags || []), ...suggestion.techTags])) : c.techTags;

            const appliedEnriched: Record<string, any> = {};
            Object.entries(enriched).forEach(([key, value]) => {
                if (selection.enriched?.[key] !== false) { // Default to true if not explicitly false
                    appliedEnriched[key] = value;
                }
            });

            const payload: Record<string, any> = {};
            if (shouldApplyTags && Array.isArray(mergedTags)) payload.tags = mergedTags;
            if (shouldApplyTech && Array.isArray(mergedTech)) payload.techTags = mergedTech;
            if (Object.keys(appliedEnriched).length) {
                Object.assign(payload, appliedEnriched);
                payload.dataConfidence = 'ממתין לסקירה';
                payload.lastVerified = new Date().toISOString().split('T')[0];
            }

            if (Object.keys(payload).length) {
                updates.push({ id: c.id, payload });
                return {
                    ...c,
                    ...payload
                };
            }

            return c;
        });

        setCompanies(nextCompanies);
        setIsTagModalOpen(false);
        setTagSuggestions([]);
        setPendingEnrichment({});
        setSuggestionSelections({});

        if (updates.length > 0) {
            console.log('Persisting company updates', updates);
            persistCompanyUpdates(updates);
        } else {
            console.log('No updates to persist');
        }
    };

    // --- AI Chat Logic ---
    const getActiveCompanyForChat = () => {
        if (selectedIds.size === 1) {
            const [id] = Array.from(selectedIds);
            return companies.find(c => c.id === id) || null;
        }
        return companies[0] || null;
    };

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
                    tools: [{ functionDeclarations: [addCompaniesTool, suggestTagsTool] }]
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
                            dataConfidence: 'חדש', // Mark as new initially
                            lastVerified: new Date().toISOString().split('T')[0]
                        }));

                        setCompanies(prev => [...addedCompanies, ...prev]);
                        
                        const toolResponse = await chatSession.sendMessage({ 
                            message: `Successfully added ${addedCompanies.length} companies: ${addedCompanies.map(c => c.name).join(', ')}. Inform the user.` 
                        });
                        
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || `הוספתי ${addedCompanies.length} חברות למאגר בהצלחה.` }]);
                    }
                    if (call.name === 'suggestTagsForCompanies') {
                        try {
                            const { companyIds } = call.args as any;
                            const ids = Array.isArray(companyIds) && companyIds.length ? companyIds : Array.from(selectedIds);
                            const { suggestions = [], enrichmentMap = {} } = await callEnrichmentApi(ids);

                            if (!suggestions.length) {
                                setChatMessages(prev => [...prev, { role: 'model', text: 'אין הצעות תגיות זמינות כרגע.' }]);
                                return;
                            }

                            setPendingEnrichment(enrichmentMap);
                            setTagSuggestions(suggestions);
                            setIsTagModalOpen(true);
                            setChatMessages(prev => [...prev, { role: 'model', text: 'הצעות תגיות מוכנות. האם תרצה להחיל אותן?' }]);
                        } catch (error) {
                            console.error('suggestTagsForCompanies failed:', error);
                            setChatMessages(prev => [...prev, { role: 'model', text: 'לא הצלחתי להציע תגיות כרגע.' }]);
                        }
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
                if (company.dataConfidence === 'ממתין לסקירה') {
                    return (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-200">
                             <ExclamationTriangleIcon className="w-3 h-3" /> ממתין לסקירה
                        </span>
                    );
                }
                if (company.dataConfidence === 'חדש') {
                    return (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full border border-blue-100">
                             חדש
                        </span>
                    );
                }
                return (
                     <div className="flex items-center gap-1.5" title={`רמת אמינות: ${company.dataConfidence}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${company.dataConfidence === 'הושלם' ? 'bg-green-500' : 'bg-red-500'}`}></div>
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
                    <div className="flex gap-2 mb-5">
                        <button
                            onClick={() => setActiveSection('companies')}
                            className={`px-4 py-2 rounded-2xl text-sm font-bold transition ${activeSection === 'companies' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-border-default text-text-default hover:bg-bg-subtle'}`}
                        >
                            מאגר חברות
                        </button>
                        <button
                            onClick={() => setActiveSection('history')}
                            className={`px-4 py-2 rounded-2xl text-sm font-bold transition ${activeSection === 'history' ? 'bg-primary-600 text-white shadow-sm' : 'bg-white border border-border-default text-text-default hover:bg-bg-subtle'}`}
                        >
                            יומן היסטוריה
                        </button>
                    </div>
                    <div className="space-y-4">
                        <div className={`${activeSection === 'companies' ? 'block' : 'hidden'} space-y-4`}>
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
                            onClick={() => {
                                if (selectedIds.size === 1) {
                                    handleBulkEnrich();
                                }
                            }} 
                            disabled={isEnriching || selectedIds.size !== 1}
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
                        <div className={`${activeSection === 'history' ? 'block' : 'hidden'} bg-white border border-border-default rounded-2xl p-6 shadow-sm space-y-3`}>
                            {historyEntries.length === 0 ? (
                                <p className="text-text-muted text-sm">לא בוצעו שינויים עדיין.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {historyEntries.map(entry => (
                                        <li key={entry.id} className="border border-border-subtle rounded-xl p-3 bg-bg-card/50">
                                            <div className="text-[10px] text-text-muted flex justify-between mb-1">
                                                <span>{formatHistoryTimestamp(entry.timestamp)}</span>
                                                <span className="font-semibold text-primary-700">{entry.action}</span>
                                            </div>
                                            <p className="text-sm font-medium text-text-default">{entry.details}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <CompanyModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveCompany}
                company={editingCompany}
            />

            {isTagModalOpen && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[190] flex items-center justify-center p-4">
                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-2xl w-full max-w-3xl overflow-hidden">
                        <header className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/30">
                            <div>
                                <div className="flex items-center gap-2 text-lg font-bold text-text-default">
                                    <TagIcon className="w-5 h-5 text-primary-600"/>
                                    <span>הצעות מותאמות</span>
                                </div>
                                <p className="text-xs text-text-muted mt-0.5">בחר אילו שדות ותגיות להחיל על כל חברה</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsTagModalOpen(false);
                                    setTagSuggestions([]);
                                    setPendingEnrichment({});
                                    setSuggestionSelections({});
                                }}
                                className="text-text-muted hover:text-text-default"
                            >
                                <XMarkIcon className="w-5 h-5"/>
                            </button>
                        </header>
                        <div className="p-6 space-y-4 max-h-[420px] overflow-y-auto">
                            {tagSuggestions.map(s => {
                                const selection = suggestionSelections[s.companyId] || { tags: true, techTags: true, enriched: {} };
                                const enrichedFields = s.enriched ? Object.entries(s.enriched) : [];
                                return (
                                    <div key={s.companyId} className="rounded-xl border border-border-default p-4 bg-bg-subtle/50 space-y-3">
                                        <div className="text-sm font-semibold text-text-default">{s.companyName}</div>
                                        {s.tags.length > 0 && (
                                            <div className="flex flex-col gap-2 text-xs">
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selection.tags}
                                                        onChange={() => setSuggestionSelections(prev => ({
                                                            ...prev,
                                                            [s.companyId]: {
                                                                ...(prev[s.companyId] || { tags: true, techTags: true, enriched: {} }),
                                                                tags: !selection.tags
                                                            }
                                                        }))}
                                                        className="h-4 w-4 text-primary-600"
                                                    />
                                                    <span>החלת תגיות כלליות</span>
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {s.tags.map((tag, idx) => (
                                                        <span key={`${s.companyId}-tag-${idx}`} className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full border border-primary-100">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {s.techTags.length > 0 && (
                                            <div className="flex flex-col gap-2 text-[11px] text-text-muted" dir="ltr">
                                                <label className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selection.techTags}
                                                        onChange={() => setSuggestionSelections(prev => ({
                                                            ...prev,
                                                            [s.companyId]: {
                                                                ...(prev[s.companyId] || { tags: true, techTags: true, enriched: {} }),
                                                                techTags: !selection.techTags
                                                            }
                                                        }))}
                                                        className="h-4 w-4 text-primary-600"
                                                    />
                                                    <span>החלת תגיות טכנולוגיות</span>
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {s.techTags.map((tag, idx) => (
                                                        <span key={`${s.companyId}-tech-${idx}`} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">{tag}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {enrichedFields.length > 0 && (
                                            <div className="space-y-2 pt-3 border-t border-border-default/60">
                                                <p className="text-[11px] text-text-muted uppercase tracking-wide">שדות מועשרים</p>
                                                {enrichedFields.map(([field, value]) => {
                                                    const checked = selection.enriched[field] ?? true;
                                                    return (
                                                        <label key={`${s.companyId}-enriched-${field}`} className="flex flex-col gap-1 text-xs">
                                                            <span className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={checked}
                                                                    onChange={() => setSuggestionSelections(prev => ({
                                                                        ...prev,
                                                                        [s.companyId]: {
                                                                            ...(prev[s.companyId] || { tags: true, techTags: true, enriched: {} }),
                                                                            enriched: {
                                                                                ...(prev[s.companyId]?.enriched || {}),
                                                                                [field]: !checked
                                                                            }
                                                                        }
                                                                    }))}
                                                                    className="h-4 w-4 text-primary-600"
                                                                />
                                                                <span className="font-semibold">{field}</span>
                                                            </span>
                                                            <span className="text-text-muted">{value}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {tagSuggestions.length === 0 && (
                                <div className="text-center text-text-muted">אין הצעות זמינות כרגע.</div>
                            )}
                        </div>
                        <footer className="flex justify-end gap-3 p-4 border-t border-border-default bg-bg-card">
                            <button
                                onClick={() => {
                                    setIsTagModalOpen(false);
                                    setTagSuggestions([]);
                                    setPendingEnrichment({});
                                    setSuggestionSelections({});
                                }}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition"
                            >
                                סגור
                            </button>
                            <button
                                onClick={handleApplyTagSuggestions}
                                disabled={isSavingEnrichment}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition shadow-sm disabled:opacity-60"
                            >
                                {isSavingEnrichment ? 'שומר/ת...' : 'שמור'}
                            </button>
                        </footer>
                    </div>
                </div>
            )}



            {/* AI Assistant Chat (Floating Button is in Header, Chat logic here) */}
            <HiroAIChat
               isOpen={isChatOpen}
               onClose={() => {
                   creationAlertRef.current = false;
                   setIsChatOpen(false);
               }}
               messages={chatMessages}
               isLoading={isChatLoading}
               error={null}
               onSendMessage={handleSendMessage}
               onReset={() => { setChatSession(null); setChatMessages([]); }}
               chatType="company-profile"
               allowTagCreation={false}
               contextData={getActiveCompanyForChat()}
                onProfileUpdate={async (patch) => {
                    if (patch.tool === 'createOrganization') {
                        try {
                            const res = await fetch(`${apiBase}/api/organizations`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(patch.value),
                            });
                            if (!res.ok) throw new Error('יצירת חברה נכשלה');
                            const created = await res.json();
                            setCompanies(prev => [mapOrgToCompany(created), ...prev]);
                            await loadCompanies();
                            if (!creationAlertRef.current) {
                                alert('החברה נוצרה בהצלחה.');
                                creationAlertRef.current = true;
                            }
                            return;
                        } catch (err: any) {
                            alert(err.message || 'הוספת החברה נכשל.');
                            return;
                        }
                    }
                    const target = getActiveCompanyForChat();
                    if (!target) {
                        alert('בחר חברה אחת לחיבור עם הסוכן לפני שמירה.');
                        return;
                    }
                    try {
                        const res = await fetch(`${apiBase}/api/organizations/${target.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(patch),
                        });
                        if (!res.ok) throw new Error('שמירה נכשלה');
                        const updated = await res.json();
                        setCompanies(prev => prev.map(c => (c.id === updated.id ? mapOrgToCompany(updated) : c)));
                        alert('החברה עודכנה בהצלחה.');
                    } catch (err: any) {
                        alert(err.message || 'עדכון החברה נכשל.');
                    }
                }}
           />
        </div>
    );
};

export default AdminCompaniesView;

