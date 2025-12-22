
import React, { useState, useRef, useId, useEffect, useMemo } from 'react';
import { PencilIcon, BriefcaseIcon, MapPinIcon, ArrowUpTrayIcon, ShareIcon, UserIcon, CheckCircleIcon, SparklesIcon, DocumentTextIcon, ArrowDownTrayIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon, BookmarkIcon, BellIcon, TrashIcon, PlusIcon } from './Icons';
import MainContent from './MainContent'; // Re-using the main content component
import AccordionSection from './AccordionSection';
import { jobsData as allJobsData, Job } from './JobsView';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { JobAlertModalConfig } from './CreateJobAlertModal';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import TagSelectorModal from './TagSelectorModal';
import { useLocation } from 'react-router-dom'; // Import useLocation
import ShareProfileModal from './ShareProfileModal';


const initialData = {
    fullName: "גדעון שפירא",
    title: "מנהל שיווק דיגיטלי",
    location: "תל אביב",
    professionalSummary: 'מנהל שיווק דיגיטלי מנוסה עם למעלה מ-5 שנות ניסיון בהובלת אסטרטגיות צמיחה וקמפיינים מרובי ערוצים. בעל מומחיות עמוקה ב-PPC, SEO, ואנליטיקה, עם יכולת מוכחת בניהול תקציבים, אופטימיזציה של משפכי המרה והובלת צוותים להישגים עסקיים משמעותיים.',
    phone: "054-1234567",
    email: "gidon.shap@email.com",
    profilePicture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    tags: ['ניהול', 'שיווק דיגיטלי', 'PPC', 'אסטרטגיה', 'ניהול צוות'],
    desiredRoles: [
        { value: 'מנהל שיווק', owner: 'candidate' as const },
        { value: 'מנהל מוצר', owner: 'recruiter' as const },
    ],
    // Fields for MainContent
    status: "מחפש עבודה",
    address: "תל אביב - יפו",
    idNumber: "123456789",
    maritalStatus: "רווק/ה",
    gender: "זכר",
    drivingLicense: "יש",
    mobility: "נייד/ת",
    birthYear: "1989",
    birthMonth: "יוני",
    birthDay: "15",
    age: "35",
    employmentType: 'מלאה',
    jobScope: 'מלאה',
    availability: 'מיידי (עד חודש)',
    physicalWork: 'לא רלוונטי',
    salaryMin: 18000,
    salaryMax: 20000,
    recruiterNotes: '', // Not shown to candidate
    candidateNotes: 'אני מאוד מתעניין בתפקידי ניהול מוצר ופתוח להצעות גם מתחום ה-Fintech.',
    workExperience: [
        { id: 1, title: 'מנהל שיווק', company: 'בזק', companyField: 'תקשורת', startDate: '2020-01', endDate: '2023-05', description: 'ניהול צוות של 5 עובדים, אחריות על קמפיינים דיגיטליים ותקציב שנתי של 2 מיליון ש"ח.' },
        { id: 2, title: 'מנהל קמפיינים PPC', company: 'Wix', companyField: 'הייטק', startDate: '2018-06', endDate: '2019-12', description: 'ניהול קמפיינים בגוגל ופייסבוק, אופטימיזציה והפקת דוחות.' },
    ],
    languages: [
        { id: 1, name: 'עברית', level: 100, levelText: 'שפת אם' },
        { id: 2, name: 'אנגלית', level: 90, levelText: 'שפת אם / מעולה' },
    ],
    education: [
        { id: 1, value: 'תואר ראשון בתקשורת, אוניברסיטת תל אביב' },
    ],
    softSkills: ['עבודת צוות', 'ניהול זמן', 'פתרון בעיות'],
    techSkills: [
        { id: 1, name: 'Google Ads', level: 95, levelText: 'שפת אם / מעולה' },
        { id: 2, name: 'Facebook Ads', level: 90, levelText: 'שפת אם / מעולה' },
        { id: 3, name: 'Google Analytics', level: 80, levelText: 'טוב מאוד' },
    ],
};

const appliedJobs = [
    { id: 1, title: 'מנהל/ת שיווק דיגיטלי', company: 'בזק', status: 'הוזמן לראיון', date: '14/07/2025', isActive: true },
    { id: 2, title: 'ראש/ת צוות שיווק', company: 'אל-על', status: 'נשלחו קו"ח', date: '12/07/2025', isActive: true },
    { id: 3, title: 'מנהל/ת מותג', company: 'תנובה', status: 'נדחה', date: '10/07/2025', isActive: false }
];

const relevantJobs: Job[] = allJobsData.slice(0, 3);

const publicStatusMap: { [key: string]: { text: string; style: string; } } = {
  'הוזמן לראיון': { text: 'בתהליך מיון', style: 'bg-secondary-100 text-secondary-800' },
  'נשלחו קו"ח': { text: 'המועמדות הוגשה', style: 'bg-blue-100 text-blue-800' },
  'נדחה': { text: 'התהליך הסתיים', style: 'bg-gray-200 text-gray-700' },
};


const TabButton: React.FC<{ title: string, icon: React.ReactNode, isActive: boolean, onClick: () => void }> = ({ title, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center gap-1.5 py-3 text-sm font-semibold border-b-2 transition-colors duration-200 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'
        }`}
    >
        {icon}
        <span>{title}</span>
    </button>
);

const ApplyModal: React.FC<{ job: Job | null; onClose: () => void }> = ({ job, onClose }) => {
    const [coverLetter, setCoverLetter] = useState('');
    const [cvFile, setCvFile] = useState('My_CV_Gideon_Shapira.pdf');

    if (!job) return null;

    const handleApply = () => {
        console.log(`Applying for ${job.title}`, { cvFile, coverLetter });
        alert(`הגשת מועמדות למשרת "${job.title}" נשלחה!`);
        onClose();
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold">הגשת מועמדות</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover"><XMarkIcon className="w-5 h-5"/></button>
                </header>
                <main className="p-6 space-y-4">
                    <p>אתה מגיש מועמדות למשרת <span className="font-bold">{job.title}</span> ב<span className="font-bold">{job.client}</span>.</p>
                    <div>
                        <h3 className="text-sm font-semibold text-text-muted mb-2">קורות חיים</h3>
                        <div className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg">
                            <span className="font-semibold text-text-default">{cvFile}</span>
                            <label className="text-sm font-semibold text-primary-600 hover:underline cursor-pointer">
                                העלה קובץ אחר
                                <input type="file" className="hidden" onChange={(e) => e.target.files && setCvFile(e.target.files[0].name)} />
                            </label>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-2">מכתב מקדים (אופציונלי)</label>
                        <textarea value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} rows={5} className="w-full bg-bg-input border border-border-default rounded-lg p-2" placeholder="כתוב כאן..."></textarea>
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
                    <button onClick={onClose} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                    <button onClick={handleApply} className="bg-primary-600 text-white font-semibold py-2 px-5 rounded-lg">שלח מועמדות</button>
                </footer>
            </div>
        </div>
    );
};

const ExpandedJobDetails: React.FC<{ job: Job }> = ({ job }) => (
    <div className="p-4 sm:p-6 bg-bg-card border-t border-border-default animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
            <div>
                <p className="font-semibold text-text-muted">תחום</p>
                <p className="font-bold text-text-default">{job.field}</p>
            </div>
            <div>
                <p className="font-semibold text-text-muted">תפקיד</p>
                <p className="font-bold text-text-default">{job.role}</p>
            </div>
        </div>

        <h4 className="font-bold text-text-default mb-2">תיאור המשרה</h4>
        <p className="text-sm text-text-muted leading-relaxed whitespace-pre-line">{job.description}</p>
        
        <h4 className="font-bold text-text-default mt-4 mb-2">דרישות</h4>
        <ul className="space-y-1 list-disc list-inside text-sm text-text-muted pr-4">
            {job.requirements.map((req, i) => <li key={i}>{req}</li>)}
        </ul>

        <div className="mt-6 pt-4 border-t border-border-subtle flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
                <button className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 p-2 rounded-lg hover:bg-primary-50 transition-colors">
                    <BookmarkIcon className="w-5 h-5" />
                    <span>הוספה למועדפים</span>
                </button>
                 <button className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 p-2 rounded-lg hover:bg-primary-50 transition-colors">
                    <ShareIcon className="w-5 h-5" />
                    <span>שתף משרה</span>
                </button>
            </div>
            <a href="#" className="text-sm font-semibold text-primary-600 hover:underline">
                לפרופיל החברה ומשרות נוספות &raquo;
            </a>
        </div>
    </div>
);

interface CandidatePublicProfileViewProps {
    openJobAlertModal: (config: JobAlertModalConfig) => void;
}


const CandidatePublicProfileView: React.FC<CandidatePublicProfileViewProps> = ({ openJobAlertModal }) => {
    const locationState = useLocation(); // Hook to access navigation state
    
    const [activeTab, setActiveTab] = useState<'profile' | 'applications' | 'jobs'>('profile');
    const [formData, setFormData] = useState(initialData);
    
    // Effect to update form data if passed from CV upload
    useEffect(() => {
        if (locationState.state && locationState.state.candidateData) {
            const importedData = locationState.state.candidateData;
            setFormData(prev => ({
                ...prev,
                fullName: importedData.fullName || prev.fullName,
                email: importedData.email || prev.email,
                phone: importedData.phone || prev.phone,
                location: importedData.location || prev.location,
                title: importedData.title || prev.title,
                professionalSummary: importedData.professionalSummary || prev.professionalSummary,
                tags: importedData.skills || prev.tags,
                workExperience: importedData.workExperience ? importedData.workExperience.map((exp: any, index: number) => ({ ...exp, id: index, companyField: '' })) : prev.workExperience,
                 // Ensure languages are mapped correctly if needed, or default to existing structure
                 languages: importedData.languages && importedData.languages.length > 0 ? importedData.languages.map((lang: any, index: number) => ({id: index, name: lang.name, level: lang.level, levelText: lang.levelText})) : prev.languages
            }));
        }
    }, [locationState.state]);

    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
    const summaryInputRef = useRef<HTMLTextAreaElement>(null);

    const [isEditingName, setIsEditingName] = useState(false);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const [joinCandidatePool, setJoinCandidatePool] = useState(false);
    
    const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
    const [applyingForJob, setApplyingForJob] = useState<Job | null>(null);
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    
    const { savedSearches, deleteSearch } = useSavedSearches();
    const jobAlerts = useMemo(() => savedSearches.filter(s => s.isAlert), [savedSearches]);

    const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    
    const [isTagsExpanded, setIsTagsExpanded] = useState(false);
    const VISIBLE_TAGS_COUNT = 10;


    const handleFormChange = (updatedData: any) => {
        setFormData(updatedData);
    };
    
    const handleDesiredRolesChange = (newRoles: { value: string; owner: 'candidate' | 'recruiter' }[]) => {
        setFormData(prev => ({ ...prev, desiredRoles: newRoles }));
    };

    const handleSelectRole = (selectedField: SelectedJobField | null) => {
        if (selectedField) {
            const newRole = { value: selectedField.role, owner: 'candidate' as const };
            if (!formData.desiredRoles.some(r => r.value === newRole.value && r.owner === 'candidate')) {
                handleDesiredRolesChange([...formData.desiredRoles, newRole]);
            }
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleRemoveRole = (roleValue: string) => {
        handleDesiredRolesChange(formData.desiredRoles.filter(r => !(r.value === roleValue && r.owner === 'candidate')));
    };

    const handleAddTags = (newTags: string[]) => {
        setFormData(prev => {
            const uniqueNewTags = newTags.filter(tag => !prev.tags.includes(tag));
            return { ...prev, tags: [...prev.tags, ...uniqueNewTags] };
        });
        setIsTagSelectorOpen(false);
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };
    
    useEffect(() => {
        if (isEditingSummary) {
          summaryInputRef.current?.focus();
        }
    }, [isEditingSummary]);
    
    const handleSummarySave = () => {
        setIsEditingSummary(false);
    };

    const handleSummaryKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSummarySave();
        } else if (e.key === 'Escape') {
            // Revert changes
            setFormData(prev => ({ ...prev, professionalSummary: initialData.professionalSummary }));
            setIsEditingSummary(false);
        }
    };
    
    // Name editing handlers
    useEffect(() => {
        if (isEditingName) {
          nameInputRef.current?.focus();
        }
    }, [isEditingName]);

    const handleNameSave = () => {
        setIsEditingName(false);
    };

    const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleNameSave();
        } else if (e.key === 'Escape') {
            setFormData(prev => ({ ...prev, fullName: initialData.fullName }));
            setIsEditingName(false);
        }
    };

    // Title editing handlers
    useEffect(() => {
        if (isEditingTitle) {
          titleInputRef.current?.focus();
        }
    }, [isEditingTitle]);

    const handleTitleSave = () => {
        setIsEditingTitle(false);
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleTitleSave();
        } else if (e.key === 'Escape') {
            setFormData(prev => ({ ...prev, title: initialData.title }));
            setIsEditingTitle(false);
        }
    };

    const handleOpenApplyModal = (e: React.MouseEvent, job: Job) => {
        e.stopPropagation();
        setApplyingForJob(job);
        setIsApplyModalOpen(true);
    };
    
    const summaryText = formData.professionalSummary || '';
    const isLongSummary = summaryText.length > 100;
    const cutOffPoint = Math.floor(summaryText.length / 2);
    
    const displaySummary = !isEditingSummary && !isSummaryExpanded && isLongSummary
        ? summaryText.slice(0, cutOffPoint) + '...'
        : summaryText;

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <div className="space-y-6">
                        <AccordionSection title="קורות חיים" icon={<DocumentTextIcon className="w-5 h-5"/>} defaultOpen>
                            <div className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg">
                                <div className="font-semibold text-text-default">My_CV_Gideon_Shapira.pdf</div>
                                <div className="flex items-center gap-2">
                                    <button className="p-2 text-text-muted hover:text-primary-600"><ArrowDownTrayIcon className="w-5 h-5"/></button>
                                    <label className="p-2 text-text-muted hover:text-primary-600 cursor-pointer">
                                        <ArrowUpTrayIcon className="w-5 h-5"/>
                                        <input type="file" className="hidden"/>
                                    </label>
                                </div>
                            </div>
                        </AccordionSection>
                        <AccordionSection title="התראות המשרות שלי" icon={<BellIcon className="w-5 h-5"/>}>
                            {jobAlerts.length > 0 ? (
                                <div className="space-y-3">
                                    {jobAlerts.map(alert => (
                                        <div key={alert.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-subtle/70">
                                            <div>
                                                <p className="font-semibold text-text-default">{alert.name}</p>
                                                <p className="text-xs text-text-muted">
                                                    תדירות: {alert.frequency === 'daily' ? 'יומי' : 'שבועי'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => openJobAlertModal({ mode: 'edit', initialData: alert })} className="p-2 text-text-muted hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={() => deleteSearch(alert.id)} className="p-2 text-text-muted hover:text-red-500 rounded-full"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted text-center p-4">
                                    לא יצרת התראות משרות. ניתן ליצור התראה מלוח המשרות לאחר ביצוע חיפוש.
                                </p>
                            )}
                        </AccordionSection>
                        <MainContent 
                            formData={formData} 
                            onFormChange={handleFormChange}
                            viewMode="candidate"
                        />
                    </div>
                );
            case 'applications':
                return (
                     <div className="space-y-3">
                        {appliedJobs.map(job => {
                            const publicStatus = publicStatusMap[job.status] || { text: job.status, style: 'bg-gray-100 text-gray-800' };
                            const fullJobDetails = allJobsData.find(j => j.id === job.id);
                            const isExpanded = expandedJobId === job.id;
                            return (
                                <div key={job.id} className="bg-bg-subtle/70 rounded-lg overflow-hidden transition-shadow hover:shadow-md">
                                    <div onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="p-4 cursor-pointer">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-primary-700 text-base">{job.title}</p>
                                                <p className="text-sm text-text-muted">{job.company}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${publicStatus.style}`}>{publicStatus.text}</span>
                                                <ChevronDownIcon className={`w-5 h-5 text-text-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end mt-2">
                                            <p className="text-xs text-text-subtle">הגשת מועמדות בתאריך: {job.date}</p>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`w-2 h-2 rounded-full ${job.isActive ? 'bg-gray-500' : 'bg-gray-300'}`}></span>
                                                <span className={`text-xs font-semibold ${job.isActive ? 'text-gray-600' : 'text-gray-400 line-through'}`}>
                                                    {job.isActive ? 'משרה פעילה' : 'לא פעילה'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {isExpanded && fullJobDetails && <ExpandedJobDetails job={fullJobDetails} />}
                                </div>
                            );
                        })}
                    </div>
                );
            case 'jobs':
                return (
                    <div className="space-y-3">
                        {relevantJobs.map(job => {
                            const isExpanded = expandedJobId === job.id;
                            const tags = [job.field, job.role, ...(Array.isArray(job.jobType) ? job.jobType : [job.jobType])];
                            return (
                                <div key={job.id} className="bg-bg-subtle/70 rounded-lg overflow-hidden transition-shadow hover:shadow-md">
                                    <div onClick={() => setExpandedJobId(isExpanded ? null : job.id)} className="p-4 cursor-pointer">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-semibold text-primary-700 text-base">{job.title}</p>
                                                <p className="text-sm text-text-muted">{job.client} &bull; {job.location}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={(e) => handleOpenApplyModal(e, job)} className="bg-primary-500 text-white font-semibold py-1.5 px-4 rounded-lg text-sm hover:bg-primary-600">הגש מועמדות</button>
                                                <ChevronDownIcon className={`w-5 h-5 text-text-subtle transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {tags.map(tag => <span key={tag} className="text-xs font-medium bg-bg-card px-2 py-1 rounded-full border border-border-default">{tag}</span>)}
                                        </div>
                                    </div>
                                    {isExpanded && <ExpandedJobDetails job={job} />}
                                </div>
                            )
                        })}
                    </div>
                );
            default: return null;
        }
    };
    
    const displayedTags = isTagsExpanded ? formData.tags : formData.tags.slice(0, VISIBLE_TAGS_COUNT);
    const remainingTagsCount = Math.max(0, formData.tags.length - VISIBLE_TAGS_COUNT);

    return (
        <>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fadeIn 0.3s ease-out; }
            `}</style>
            <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* Profile Header Card */}
                <div className="bg-bg-card rounded-2xl shadow-lg p-6 mb-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="relative">
                            <img src={formData.profilePicture} alt="Profile" className="w-28 h-28 rounded-full object-cover ring-4 ring-bg-subtle"/>
                            <button className="absolute bottom-0 left-0 bg-bg-card p-2 rounded-full shadow-md border border-border-default hover:bg-bg-hover">
                                <ArrowUpTrayIcon className="w-5 h-5 text-text-muted" />
                            </button>
                        </div>
                        <div className="flex-1 text-center sm:text-right">
                            <div className="relative group flex items-center justify-center sm:justify-start gap-2">
                                {isEditingName ? (
                                    <input
                                        ref={nameInputRef}
                                        type="text"
                                        value={formData.fullName}
                                        onChange={(e) => handleFormChange({...formData, fullName: e.target.value})}
                                        onBlur={handleNameSave}
                                        onKeyDown={handleNameKeyDown}
                                        className="text-3xl font-extrabold text-text-default bg-bg-input border-b-2 border-primary-500 outline-none w-64"
                                    />
                                ) : (
                                    <h1 onClick={() => setIsEditingName(true)} className="text-3xl font-extrabold text-text-default cursor-pointer">{formData.fullName}</h1>
                                )}
                                {!isEditingName && (
                                    <button onClick={() => setIsEditingName(true)} className="text-text-subtle hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <PencilIcon className="w-5 h-5"/>
                                    </button>
                                )}
                            </div>
                            <div className="relative group text-lg text-text-muted mt-1 flex items-center justify-center sm:justify-start gap-2">
                                <BriefcaseIcon className="w-5 h-5"/>
                                {isEditingTitle ? (
                                    <input
                                        ref={titleInputRef}
                                        type="text"
                                        value={formData.title}
                                        onChange={(e) => handleFormChange({...formData, title: e.target.value})}
                                        onBlur={handleTitleSave}
                                        onKeyDown={handleTitleKeyDown}
                                        className="text-lg bg-bg-input border-b-2 border-primary-500 outline-none"
                                    />
                                ) : (
                                    <span onClick={() => setIsEditingTitle(true)} className="cursor-pointer">{formData.title}</span>
                                )}
                                {!isEditingTitle && (
                                    <button onClick={() => setIsEditingTitle(true)} className="text-text-subtle hover:text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                )}
                                <span className="text-text-subtle mx-1">&bull;</span>
                                <MapPinIcon className="w-5 h-5"/>
                                <span>{formData.location}</span>
                            </div>
                            <div className="mt-2 text-text-muted relative group min-h-[28px]">
                                {isEditingSummary ? (
                                    <textarea
                                        ref={summaryInputRef}
                                        value={formData.professionalSummary}
                                        onChange={(e) => handleFormChange({...formData, professionalSummary: e.target.value})}
                                        onBlur={handleSummarySave}
                                        onKeyDown={handleSummaryKeyDown}
                                        className="w-full bg-bg-input border-b-2 border-primary-500 outline-none text-sm resize-none"
                                        rows={4}
                                    />
                                ) : (
                                    <div>
                                        <p
                                            onClick={() => setIsEditingSummary(true)}
                                            className="cursor-pointer hover:bg-bg-hover p-1 rounded-md text-sm whitespace-pre-line"
                                        >
                                            {displaySummary}
                                        </p>
                                        {isLongSummary && (
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setIsSummaryExpanded(!isSummaryExpanded); }}
                                                className="text-xs font-bold text-primary-600 hover:text-primary-800 mt-1 flex items-center gap-1 select-none bg-primary-50 px-2 py-0.5 rounded-full w-fit"
                                            >
                                                {isSummaryExpanded ? (
                                                    <>הצג פחות <ChevronUpIcon className="w-3 h-3" /></>
                                                ) : (
                                                    <>המשך לקרוא <ChevronDownIcon className="w-3 h-3" /></>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {!isEditingSummary && (
                                    <button
                                        onClick={() => setIsEditingSummary(true)}
                                        className="absolute -left-6 top-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600"
                                        aria-label="Edit professional summary"
                                    >
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="mt-4">
                                <label className="block text-sm font-semibold text-text-muted mb-2 text-center sm:text-right">תגיות וכישורים:</label>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                    {displayedTags.map(tag => (
                                        <span key={tag} className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
                                            {tag}
                                            <button onClick={() => handleRemoveTag(tag)} className="mr-1.5 text-primary-500 hover:text-primary-700">
                                                <XMarkIcon className="h-4 w-4" />
                                            </button>
                                        </span>
                                    ))}
                                    {!isTagsExpanded && remainingTagsCount > 0 && (
                                        <button 
                                            onClick={() => setIsTagsExpanded(true)}
                                            className="bg-bg-subtle text-text-default text-sm font-semibold px-3 py-1 rounded-full border border-border-default hover:bg-bg-hover transition-colors"
                                        >
                                            +{remainingTagsCount} נוספים
                                        </button>
                                    )}
                                    {isTagsExpanded && formData.tags.length > VISIBLE_TAGS_COUNT && (
                                        <button 
                                            onClick={() => setIsTagsExpanded(false)}
                                            className="text-text-subtle text-sm font-semibold px-2 hover:text-primary-600 transition-colors"
                                        >
                                            הצג פחות
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsTagSelectorOpen(true)}
                                        className="p-1.5 rounded-full text-primary-500 hover:bg-primary-100"
                                        aria-label="הוסף תגית"
                                        title="הוסף תגית"
                                    >
                                        <PlusIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-4">
                                <label className="block text-sm font-semibold text-text-muted mb-2 text-center sm:text-right">תחומי משרה מבוקשים:</label>
                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                    {formData.desiredRoles.filter(r => r.owner === 'candidate').map(role => (
                                        <span key={role.value} className="flex items-center bg-secondary-100 text-secondary-800 text-sm font-medium pl-3 pr-2 py-1.5 rounded-full">
                                            {role.value}
                                            <button onClick={() => handleRemoveRole(role.value)} className="mr-1.5 text-secondary-500 hover:text-secondary-700">
                                                <XMarkIcon className="h-4 w-4" />
                                            </button>
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => setIsJobFieldSelectorOpen(true)}
                                        className="flex items-center gap-1 bg-secondary-100/70 text-secondary-800 font-semibold py-1.5 px-3 rounded-full hover:bg-secondary-200 transition text-sm"
                                        aria-label="הוסף תחום משרה"
                                        title="הוסף תחום משרה"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        <span>הוסף</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <button 
                                onClick={() => setIsShareModalOpen(true)}
                                className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm"
                            >
                                <ShareIcon className="w-5 h-5" />
                                <span>שתף פרופיל</span>
                            </button>
                        </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-border-default">
                        <div className="bg-primary-50/50 p-4 rounded-lg flex flex-col sm:flex-row items-center gap-4">
                            <SparklesIcon className="w-8 h-8 text-primary-500 flex-shrink-0" />
                            <div className="flex-1 text-center sm:text-right">
                                <h4 className="font-bold text-primary-800">הצטרף למאגר המועמדים שלנו</h4>
                                <p className="text-sm text-primary-700/80 mt-1">וקבל הצעות עבודה רלוונטיות ישירות למייל מחברות מובילות.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <input type="checkbox" checked={joinCandidatePool} onChange={(e) => setJoinCandidatePool(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-border-default rounded-full peer peer-focus:ring-2 peer-focus:ring-primary-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                            </label>
                        </div>
                    </div>

                </div>


                {/* Tab Navigation */}
                <div className="bg-bg-card rounded-t-xl border-b border-border-default sticky top-0 z-10">
                    <nav className="flex items-center">
                        <TabButton title="הפרופיל שלי" icon={<UserIcon className="w-5 h-5"/>} isActive={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                        <TabButton title="המשרות שלי" icon={<CheckCircleIcon className="w-5 h-5"/>} isActive={activeTab === 'applications'} onClick={() => setActiveTab('applications')} />
                        <TabButton title="משרות רלוונטיות" icon={<SparklesIcon className="w-5 h-5"/>} isActive={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} />
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="pt-6">
                    {renderContent()}
                </div>
            </div>
             <JobFieldSelector
                onChange={handleSelectRole}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
            {isApplyModalOpen && <ApplyModal job={applyingForJob} onClose={() => setIsApplyModalOpen(false)} />}
            <TagSelectorModal
                isOpen={isTagSelectorOpen}
                onClose={() => setIsTagSelectorOpen(false)}
                onSave={handleAddTags}
                existingTags={formData.tags}
            />
            <ShareProfileModal 
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                candidate={{
                    name: formData.fullName,
                    title: formData.title,
                    image: formData.profilePicture,
                    summary: formData.professionalSummary
                }}
            />
        </>
    );
};

export default CandidatePublicProfileView;
