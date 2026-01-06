
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
    PencilIcon, BriefcaseIcon, MapPinIcon, ArrowUpTrayIcon, ShareIcon, UserIcon, 
    CheckCircleIcon, SparklesIcon, DocumentTextIcon, ArrowDownTrayIcon, XMarkIcon, 
    ChevronDownIcon, ChevronUpIcon, BookmarkIcon, BellIcon, TrashIcon, PlusIcon, 
    BuildingOffice2Icon, ClockIcon, CalendarDaysIcon, EnvelopeIcon, PhoneIcon, 
    LanguageIcon, AcademicCapIcon, HiroLogotype, ArrowLeftIcon, 
    UserCircleIcon, BookmarkIconSolid, PaperAirplaneIcon, InboxIcon, VideoCameraIcon,
    ExclamationTriangleIcon
} from './Icons';
import MainContent from './MainContent'; 
import AccordionSection from './AccordionSection';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { JobAlertModalConfig } from './CreateJobAlertModal';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import TagSelectorModal from './TagSelectorModal';
import { useLocation } from 'react-router-dom'; 
import ShareProfileModal from './ShareProfileModal';
import HiroAIChat from './HiroAIChat'; 
import { GoogleGenAI, Type, FunctionDeclaration, Chat } from '@google/genai'; 
import ApplyModal from './ApplyModal';
import CandidateApplicationsView from './CandidateApplicationsView';
import JobSearchFilters from './JobSearchFilters';
import CandidateScreeningWizard, { ScreeningQuestion } from './CandidateScreeningWizard'; // New Import

// --- AI TOOLS DEFINITIONS ---
const updateCandidateFieldFunctionDeclaration: FunctionDeclaration = {
  name: 'updateCandidateField',
  parameters: {
    type: Type.OBJECT,
    description: 'Update a specific field in the candidate profile data.',
    properties: {
      fieldName: { type: Type.STRING, description: 'The field name to update (e.g., fullName, title, location, professionalSummary, phone, email).' },
      newValue: { type: Type.STRING, description: 'The new value for the field.' },
    },
    required: ['fieldName', 'newValue'],
  },
};

const upsertWorkExperienceFunctionDeclaration: FunctionDeclaration = {
  name: 'upsertWorkExperience',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new work experience or update an existing one.',
    properties: {
      id: { type: Type.NUMBER, description: 'Optional. Use ONLY if updating an existing record ID provided in context.' },
      title: { type: Type.STRING, description: 'Job title.' },
      company: { type: Type.STRING, description: 'Company name.' },
      startDate: { type: Type.STRING, description: 'Start date (YYYY-MM).' },
      endDate: { type: Type.STRING, description: 'End date (YYYY-MM or Present).' },
      description: { type: Type.STRING, description: 'Description of the role.' },
    },
    required: ['title', 'company'],
  },
};

const initialData = {
    id: 0,
    profileName: "פרופיל חדש",
    fullName: "",
    title: "",
    location: "",
    professionalSummary: "",
    phone: "",
    email: "",
    profilePicture: "https://via.placeholder.com/150",
    tags: [],
    desiredRoles: [],
    workExperience: [],
    education: [],
    languages: [],
    softSkills: [],
    techSkills: [],
    salaryMin: 0, salaryMax: 0,
    status: "מחפש עבודה", address: "", idNumber: "", maritalStatus: "-", gender: "-", drivingLicense: "-", mobility: "-", birthYear: "", birthMonth: "", birthDay: "", age: "", employmentType: 'מלאה', jobScope: 'מלאה', availability: '', physicalWork: '', recruiterNotes: '', candidateNotes: ''
};

interface Message {
    role: 'user' | 'model';
    text: string;
}

// --- COMPONENTS ---

// 1. Sidebar Component - UPDATED with Pending Tasks Section
const CandidateSidebar: React.FC<{
    activeView: string;
    onViewChange: (view: string) => void;
    activeProfile: any;
    profiles: any[];
    onSwitchProfile: (id: number) => void;
    onAddProfile: () => void;
    isOpenMobile: boolean;
    setIsOpenMobile: (val: boolean) => void;
    favoriteCount: number;
    pendingTasks: any[]; // New Prop
    onTaskClick: (task: any) => void; // New Prop
    pendingTasksCount: number;
}> = ({ activeView, onViewChange, activeProfile, profiles, onSwitchProfile, onAddProfile, isOpenMobile, setIsOpenMobile, favoriteCount, pendingTasks, onTaskClick }) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    const menuItems = [
        { id: 'profile', label: 'הפרופיל שלי', icon: UserCircleIcon },
        { id: 'jobs', label: 'משרות רלוונטיות', icon: SparklesIcon },
        { id: 'applications', label: 'הגשות שלי', icon: CheckCircleIcon, badge: pendingTasks.length > 0 ? pendingTasks.length : undefined, badgeColor: 'bg-red-500' },
        { id: 'offers', label: 'הצעות שקיבלתי', icon: InboxIcon }, 
        { id: 'favorites', label: `משרות שאהבתי (${favoriteCount})`, icon: BookmarkIcon },
        { id: 'agent', label: 'סוכן חכם', icon: SparklesIcon },
    ];

    const handleLogout = () => {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('Failed clearing localStorage', e);
        }
        window.location.href = '/login';
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpenMobile && (
                <div 
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsOpenMobile(false)}
                />
            )}

            <aside className={`fixed lg:sticky top-0 right-0 h-full w-72 bg-white border-l border-border-default z-50 transition-transform duration-300 ease-in-out ${isOpenMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} flex flex-col shadow-xl lg:shadow-none`}>
                
                {/* Brand Header */}
                <div className="p-6 border-b border-border-default flex items-center justify-between flex-shrink-0">
                    <HiroLogotype className="h-8" />
                    <button onClick={() => setIsOpenMobile(false)} className="lg:hidden p-1 text-text-muted">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Profile Switcher */}
                <div className="p-4 border-b border-border-default flex-shrink-0">
                    <div className="relative">
                        <button 
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className="w-full flex items-center gap-3 p-3 bg-bg-subtle rounded-xl border border-border-default hover:border-primary-300 transition-all text-right group"
                        >
                            <img src={activeProfile.profilePicture} alt="Profile" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-text-muted">פרופיל פעיל:</p>
                                <p className="font-bold text-text-default truncate text-sm">{activeProfile.profileName}</p>
                            </div>
                            <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProfileMenuOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-border-default z-50 overflow-hidden animate-fade-in">
                                <div className="p-2 space-y-1">
                                    <p className="px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider">הפרופילים שלי</p>
                                    {profiles.map(p => (
                                        <button 
                                            key={p.id}
                                            onClick={() => { onSwitchProfile(p.id); setIsProfileMenuOpen(false); }}
                                            className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors ${p.id === activeProfile.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-bg-hover text-text-default'}`}
                                        >
                                            <div className={`w-2 h-2 rounded-full ${p.id === activeProfile.id ? 'bg-primary-500' : 'bg-gray-300'}`}></div>
                                            <span className="truncate">{p.profileName}</span>
                                        </button>
                                    ))}
                                    <div className="border-t border-border-default my-1"></div>
                                    <button 
                                        onClick={() => { onAddProfile(); setIsProfileMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-primary-600 hover:bg-primary-50 font-medium"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        יצירת פרופיל חדש
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Navigation (Scrollable Part) */}
                <div className="flex-1 overflow-y-auto">
                    <nav className="p-4 space-y-1">
                        {menuItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => { onViewChange(item.id); setIsOpenMobile(false); }}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                                        isActive 
                                        ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20' 
                                        : 'text-text-muted hover:bg-bg-hover hover:text-text-default'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.id === 'agent' ? 'text-purple-500' : 'text-text-subtle'}`} />
                                        {item.label}
                                    </div>
                                    {item.badge && (
                                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-red-500'}`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Pending Tasks Section - MOVED HERE */}
                    {pendingTasks.length > 0 && (
                        <div className="px-4 pb-4">
                            <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                                <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <BellIcon className="w-4 h-4" />
                                    משימות דחופות
                                </h4>
                                <div className="space-y-3">
                                    {pendingTasks.map(task => (
                                        <div key={task.id} className="bg-white p-3 rounded-xl shadow-sm border border-red-100/50">
                                            <div className="flex items-start gap-2 mb-2">
                                                 <div className="mt-0.5 min-w-[16px]"><ExclamationTriangleIcon className="w-4 h-4 text-red-500" /></div>
                                                 <div>
                                                    <p className="text-xs font-bold text-gray-800 leading-tight">שאלון סינון</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{task.jobTitle}</p>
                                                 </div>
                                            </div>
                                            <button 
                                                onClick={() => { onTaskClick(task); setIsOpenMobile(false); }}
                                                className="w-full bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-1.5"
                                            >
                                                <VideoCameraIcon className="w-3 h-3" />
                                                בצע כעת
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border-default flex-shrink-0">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 p-3 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
                    >
                        <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                        התנתקות
                    </button>
                </div>
            </aside>
        </>
    );
};

// ... (Other helpers: ProfileLoadingSkeleton, JobCard, PrintableResume, etc. remain the same) ...
const ProfileLoadingSkeleton = () => (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8 animate-pulse">
        <div className="flex items-center gap-6">
            <div className="w-28 h-28 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-3">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
        </div>
        <div className="flex gap-2 mt-4">
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
        </div>
        <div className="h-32 bg-gray-200 rounded-xl mt-6"></div>
    </div>
);

const JobCard: React.FC<{ job: any; onApply: () => void; isFavorite: boolean; toggleFavorite: () => void }> = ({ job, onApply, isFavorite, toggleFavorite }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-bg-card rounded-xl border border-border-default hover:border-primary-300 hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
             <div className="absolute top-4 left-4 z-10">
                 <button 
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(); }}
                    className="text-text-subtle hover:text-primary-500 transition-colors p-1.5 rounded-full hover:bg-white/80"
                    title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                >
                    {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
                </button>
             </div>
            <div 
                className="p-5 cursor-pointer flex-grow flex flex-col"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex justify-between items-start mb-3">
                     <div className="w-12 h-12 rounded-lg bg-white border border-border-default flex items-center justify-center p-1 shadow-sm">
                        {job.logo ? <img src={job.logo} alt={job.company} className="max-w-full max-h-full object-contain" /> : <BriefcaseIcon className="w-6 h-6 text-gray-400" />}
                    </div>
                </div>
                
                <h3 className="font-bold text-text-default text-lg mb-1 group-hover:text-primary-700 transition-colors leading-tight">{job.title}</h3>
                <p className="text-sm text-text-muted mb-4 font-medium">{job.company}</p>
                
                <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                    <span className="text-xs bg-bg-subtle text-text-muted px-2.5 py-1 rounded-md border border-border-default flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" /> {job.location}
                    </span>
                    <span className="text-xs bg-bg-subtle text-text-muted px-2.5 py-1 rounded-md border border-border-default">
                        {job.type}
                    </span>
                </div>
                
                <div className="flex items-center justify-between text-xs text-text-subtle border-t border-border-subtle pt-3">
                    <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5"/> {job.date}</span>
                    <div className="flex items-center gap-1 text-primary-600 font-semibold group-hover:underline">
                         <span>{isExpanded ? 'סגור פרטים' : 'פרטים והגשה'}</span>
                         <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>
            
            {isExpanded && (
                <div className="p-5 bg-bg-subtle/30 border-t border-border-default animate-fade-in">
                     <div 
                        className="text-sm text-text-default mb-5 leading-relaxed prose prose-sm max-w-none [&>ul]:list-disc [&>ul]:pr-5 [&>strong]:text-primary-800"
                        dangerouslySetInnerHTML={{ __html: job.description }} 
                     />
                     <button 
                        onClick={(e) => { e.stopPropagation(); onApply(); }} 
                        className="w-full bg-primary-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
                    >
                        <PaperAirplaneIcon className="w-5 h-5 transform rotate-180" />
                        הגש מועמדות
                    </button>
                </div>
            )}
        </div>
    );
};

const EditableField: React.FC<{
    value: string;
    placeholder: string;
    onSave: (newValue: string) => void;
    className?: string;
    icon?: React.ReactNode;
    multiline?: boolean;
    truncate?: boolean;
}> = ({ value, placeholder, onSave, className = "", icon, multiline = false, truncate = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
        }
    }, [isEditing]);

    const handleSave = () => {
        onSave(localValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) {
            handleSave();
        } else if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    return (
        <div className={`relative group flex items-start gap-2 ${className}`}>
            {icon && <span className="mt-1 text-text-subtle shrink-0">{icon}</span>}
            <div className="flex-grow min-w-0">
                {isEditing ? (
                    multiline ? (
                         <textarea
                            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border border-primary-500 rounded p-1 text-inherit focus:ring-2 focus:ring-primary-200 outline-none resize-none"
                            placeholder={placeholder}
                            rows={3}
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border-b-2 border-primary-500 outline-none text-inherit"
                            placeholder={placeholder}
                        />
                    )
                ) : (
                    <div className="relative pr-6">
                         <div 
                            onClick={() => setIsEditing(true)}
                            className="cursor-pointer hover:bg-bg-hover/50 rounded-md py-0.5 px-1 min-h-[1.5em]"
                        >
                            <p className={`whitespace-pre-line break-words leading-relaxed ${truncate ? 'line-clamp-3' : ''}`}>
                                {value || <span className="text-text-subtle opacity-60 italic">{placeholder}</span>}
                            </p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const PrintableResume: React.FC<{ data: any; className?: string }> = ({ data, className }) => {
    return (
        <div className={`bg-white text-gray-900 font-sans p-10 max-w-[210mm] mx-auto shadow-none print:shadow-none ${className}`}>
             <style>{`
                @media print {
                    @page { margin: 1cm; size: A4; }
                    body { -webkit-print-color-adjust: exact; }
                }
            `}</style>
            
            {/* Header */}
            <div className="border-b-2 border-gray-800 pb-4 mb-6">
                <h1 className="text-4xl font-extrabold text-gray-900 mb-1">{data.fullName}</h1>
                <h2 className="text-xl text-primary-600 font-semibold">{data.title}</h2>
            </div>

            {/* Contact Info */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-8 items-center bg-gray-50 p-3 rounded">
                {data.phone && <div className="flex items-center gap-1"><PhoneIcon className="w-4 h-4"/><span>{data.phone}</span></div>}
                {data.email && <div className="flex items-center gap-1"><EnvelopeIcon className="w-4 h-4"/><span>{data.email}</span></div>}
                {data.location && <div className="flex items-center gap-1"><MapPinIcon className="w-4 h-4"/><span>{data.location}</span></div>}
            </div>

            {/* Summary */}
            {data.professionalSummary && (
                <section className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-3 pb-1">תמצית מנהלים</h3>
                    <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line text-justify">
                        {data.professionalSummary}
                    </p>
                </section>
            )}

            {/* Experience */}
            {data.workExperience && data.workExperience.length > 0 && (
                <section className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-4 pb-1">ניסיון תעסוקתי</h3>
                    <div className="space-y-6">
                        {data.workExperience.map((exp: any, index: number) => (
                            <div key={index} className="break-inside-avoid">
                                <div className="flex justify-between items-baseline mb-1">
                                    <h4 className="text-base font-bold text-gray-900">{exp.title}</h4>
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                        {exp.startDate} - {exp.endDate}
                                    </span>
                                </div>
                                <div className="text-sm font-semibold text-primary-700 mb-2">{exp.company}</div>
                                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                    {exp.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Education */}
            {data.education && data.education.length > 0 && (
                <section className="mb-8 break-inside-avoid">
                    <h3 className="text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-4 pb-1">השכלה</h3>
                    <ul className="space-y-3">
                        {data.education.map((edu: any, index: number) => (
                            <li key={index} className="text-sm">
                                <span className="font-semibold block text-gray-900">{edu.value}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

             {/* Skills & Languages Grid */}
            <div className="grid grid-cols-2 gap-8 break-inside-avoid">
                 {/* Skills */}
                {data.tags && data.tags.length > 0 && (
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-3 pb-1">מיומנויות</h3>
                        <div className="flex flex-wrap gap-2">
                            {data.tags.map((tag: string, index: number) => (
                                <span key={index} className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded border border-gray-200">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </section>
                )}

                {/* Languages */}
                {data.languages && data.languages.length > 0 && (
                    <section>
                        <h3 className="text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-3 pb-1">שפות</h3>
                        <ul className="space-y-2 text-sm">
                            {data.languages.map((lang: any, index: number) => (
                                <li key={index} className="flex justify-between border-b border-gray-100 pb-1 last:border-0">
                                    <span className="font-medium">{lang.name}</span>
                                    <span className="text-gray-500">{lang.levelText || lang.level}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
};

const ResumePreviewModal: React.FC<{ isOpen: boolean; onClose: () => void; data: any }> = ({ isOpen, onClose, data }) => {
    if (!isOpen) return null;
    
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:hidden" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in" onClick={e => e.stopPropagation()}>
                 <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/50">
                    <h2 className="font-bold text-lg text-text-default">תצוגה מקדימה - קורות חיים</h2>
                    <div className="flex gap-2">
                        <button 
                            onClick={handlePrint}
                            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium text-sm shadow-sm"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                            הדפס / שמור כ-PDF
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                            <XMarkIcon className="w-6 h-6"/>
                        </button>
                    </div>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto bg-gray-100 p-8 custom-scrollbar">
                     <div className="bg-white shadow-lg mx-auto max-w-[210mm] min-h-[297mm]">
                        <PrintableResume data={data} className="block" />
                     </div>
                 </div>
            </div>
        </div>
    )
}

// 4. Main View Component
const CandidatePublicProfileView: React.FC<{ openJobAlertModal: (config: JobAlertModalConfig) => void }> = ({ openJobAlertModal }) => {
    const locationState = useLocation();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    
    // State
    const [profiles, setProfiles] = useState([initialData]);
    const [activeProfileId, setActiveProfileId] = useState(initialData.id);
    const [candidateId, setCandidateId] = useState<string | null>(null);
    const [activeView, setActiveView] = useState('profile');
    const [isSwitching, setIsSwitching] = useState(false);
    const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
    const [isResumePreviewOpen, setIsResumePreviewOpen] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const resumeInputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    
    // --- State for Pending Tasks (Screening) ---
    const [isScreeningWizardOpen, setIsScreeningWizardOpen] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);

    // Derived Active Profile
    const activeProfile = useMemo(() => 
        profiles.find(p => p.id === activeProfileId) || profiles[0]
    , [activeProfileId, profiles]);

    // Data for forms (synced with active profile)
    const [formData, setFormData] = useState(activeProfile);
    
    // UI State for Header Interactions
    const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [joinCandidatePool, setJoinCandidatePool] = useState(true);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);

    // --- Job Search & Favorites State ---
    const [jobSearchTerm, setJobSearchTerm] = useState('');
    const [jobFilters, setJobFilters] = useState({ location: '', type: '', date: '' });
    const [favoriteJobIds, setFavoriteJobIds] = useState<Set<number>>(new Set());

    // Toggle Favorite
    const toggleFavoriteJob = (jobId: number) => {
        setFavoriteJobIds(prev => {
            const next = new Set(prev);
            if (next.has(jobId)) next.delete(jobId);
            else next.add(jobId);
            return next;
        });
    };

    // Filtered Jobs Logic
    const filteredJobs = useMemo(() => [], [jobSearchTerm, jobFilters]);

    // Favorite Jobs Logic
    const favoriteJobsList = useMemo(() => [], [favoriteJobIds]);

    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const ensureArray = (val: any) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) return parsed;
                return [val];
            } catch {
                return [val];
            }
        }
        return [];
    };

    const normalizeCandidateData = (data: any) => {
        const copy = { ...data };
        copy.tags = ensureArray(copy.tags).map((t: any) => (typeof t === 'string' ? t : String(t?.value || t || ''))).filter(Boolean);
        copy.desiredRoles = ensureArray(copy.desiredRoles)
            .map((r: any) => {
                if (typeof r === 'string') return { value: r };
                if (r && typeof r === 'object' && r.value) return r;
                return null;
            })
            .filter(Boolean);
        copy.workExperience = Array.isArray(copy.workExperience) ? copy.workExperience : [];
        const soft = ensureArray(copy.softSkills || copy.skills?.soft);

        const deriveLevelText = (level: number) => {
            if (level >= 80) return 'מומחה';
            if (level >= 60) return 'מתקדם';
            if (level >= 40) return 'טוב';
            return 'בסיסי';
        };

        const normalizeTechSkill = (item: any) => {
            if (!item) return null;
            if (typeof item === 'string') {
                const level = 50;
                return {
                    id: Date.now() + Math.random(),
                    name: item,
                    level,
                    levelText: deriveLevelText(level),
                };
            }
            if (typeof item === 'object') {
                if (item.name) {
                    const level = typeof item.level === 'number' ? item.level : 50;
                    return {
                        ...item,
                        level,
                        levelText: item.levelText || deriveLevelText(level),
                    };
                }
                const charKeys = Object.keys(item).filter(k => !isNaN(Number(k)));
                if (charKeys.length) {
                    const name = charKeys.sort((a, b) => Number(a) - Number(b)).map(k => item[k]).join('').trim();
                    const level = typeof item.level === 'number' ? item.level : 50;
                    return {
                        id: Date.now() + Math.random(),
                        name: name || 'מיומנות',
                        level,
                        levelText: item.levelText || deriveLevelText(level),
                    };
                }
            }
            return null;
        };

        const rawTech = ensureArray(copy.techSkills || copy.skills?.technical);
        const tech = rawTech
            .map(normalizeTechSkill)
            .filter(Boolean);

        copy.softSkills = soft;
        copy.techSkills = tech;
        copy.skills = { soft, technical: tech };
        copy.candidateNotes = copy.candidateNotes ?? copy.internalNotes ?? '';
        copy.languages = ensureArray(copy.languages);
        copy.preferences = ensureArray(copy.preferences);
        copy.interests = ensureArray(copy.interests);
        copy.candidateNotes = copy.candidateNotes || '';
        if (copy.salaryMin !== undefined && copy.salaryMin !== null) copy.salaryMin = Number(copy.salaryMin) || 0;
        if (copy.salaryMax !== undefined && copy.salaryMax !== null) copy.salaryMax = Number(copy.salaryMax) || 0;
        return copy;
    };

    const sanitizePayload = (data: any) => {
        const copy = normalizeCandidateData(data);
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        copy.skills = {
            soft: copy.softSkills,
            technical: copy.techSkills,
        };
        copy.workExperience = Array.isArray(copy.workExperience) ? copy.workExperience : [];

        return copy;
    };

    const getUser = () => {
        try {
            const raw = localStorage.getItem('herodata') || localStorage.getItem('herouser') || localStorage.getItem('user');
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    };

    const loadCandidate = async () => {
        const user = getUser();
        if (!user || (!user.id && !user.userId) || !apiBase) return;
        const idFromUser = user.userId || user.id;
        setIsSwitching(true);
        try {
            const res = await fetch(`${apiBase}/api/candidates/by-user/${idFromUser}`, {
                headers: { ...authHeaders() },
            });
            if (res.ok) {
                const data = await res.json();
                setCandidateId(data.id);
                const normalized = normalizeCandidateData(data);
                setProfiles([normalized]);
                setActiveProfileId(data.id);
                setFormData(normalized);
                return;
            }
            if (res.status === 404) {
                const payload = {
                    ...initialData,
                    fullName: user.email?.split('@')[0] || '',
                    email: user.email || '',
                    profileName: initialData.profileName,
                    userId: idFromUser,
                };
                const createRes = await fetch(`${apiBase}/api/candidates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(payload),
                });
                if (createRes.ok) {
                    const created = await createRes.json();
                    setCandidateId(created.id);
                    const normalizedCreated = normalizeCandidateData(created);
                    setProfiles([normalizedCreated]);
                    setActiveProfileId(created.id);
                    setFormData(normalizedCreated);
                }
            }
        } catch (err) {
            console.error('Failed to load candidate', err);
        } finally {
            setIsSwitching(false);
        }
    };

    const ensureCandidateRecord = async (payloadOverride?: any) => {
        if (!apiBase) return null;
        if (candidateId) return candidateId;
        try {
            const payload = sanitizePayload(payloadOverride || formData);
            const user = getUser();
            if (user && (user.userId || user.id)) {
                payload.userId = user.userId || user.id;
            }
            if (!payload.fullName) payload.fullName = 'מועמד חדש';
            const res = await fetch(`${apiBase}/api/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Failed to create candidate');
            const created = await res.json();
            setCandidateId(created.id);
            setProfiles([created]);
            setActiveProfileId(created.id);
            setFormData(created);
            return created.id;
        } catch (err) {
            console.error('Failed to ensure candidate record', err);
            return null;
        }
    };

    // Minimal CRC32 for S3 checksum (browser-side)
    const crc32base64 = async (file: File) => {
        const table = new Uint32Array(256).map((_, n) => {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            return c >>> 0;
        });
        const buf = new Uint8Array(await file.arrayBuffer());
        let crc = 0 ^ -1;
        for (let i = 0; i < buf.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
        }
        crc = (crc ^ -1) >>> 0;
        const bytes = new Uint8Array(4);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, crc);
        // AWS expects base64 big-endian
        return btoa(String.fromCharCode(...bytes));
    };

    const uploadToS3 = async (file: File, type: 'profile' | 'resume') => {
        if (!apiBase) {
            alert('API base URL is not configured');
            return;
        }
        const id = await ensureCandidateRecord();
        if (!id) return;

        try {
            const folder = type === 'resume' ? 'resumes' : 'profile-pictures';
            const presignRes = await fetch(`${apiBase}/api/candidates/${id}/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
            });
            if (!presignRes.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, key } = await presignRes.json();
            const urlObj = new URL(uploadUrl);
            const checksum = urlObj.searchParams.get('x-amz-checksum-crc32');
            const checksumAlgo = urlObj.searchParams.get('x-amz-sdk-checksum-algorithm');
            const headers: Record<string, string> = {};
            if (file.type) headers['Content-Type'] = file.type;
            if (checksum && checksumAlgo === 'CRC32') {
                headers['x-amz-checksum-crc32'] = await crc32base64(file);
                headers['x-amz-sdk-checksum-algorithm'] = 'CRC32';
            }
            const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: Object.keys(headers).length ? headers : undefined,
                body: file,
            });
            if (!putRes.ok) throw new Error('Upload to S3 failed');

            const attachRes = await fetch(`${apiBase}/api/candidates/${id}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ key, type }),
            });
            if (!attachRes.ok) throw new Error('Failed to attach media');
            const updated = await attachRes.json();
            handleUpdateProfileData(updated);
            setCandidateId(updated.id || id);
        } catch (err) {
            console.error(err);
            alert('העלאה נכשלה, נסה שוב.');
        }
    };

    const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await uploadToS3(file, 'profile');
            e.target.value = '';
        }
    };

    const handleResumeSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await uploadToS3(file, 'resume');
            e.target.value = '';
        }
    };


    // Sync formData when profile changes
    useEffect(() => {
        setFormData(activeProfile);
    }, [activeProfile]);

    useEffect(() => {
        loadCandidate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handlers
    const handleSwitchProfile = (id: number) => {
        if (id === activeProfileId) return;
        setIsSwitching(true);
        setTimeout(() => {
            setActiveProfileId(id);
            setActiveView('profile'); 
            setIsSwitching(false);
        }, 800);
    };

    const handleAddProfile = () => {
        const name = prompt("הכנס שם לפרופיל החדש (למשל: 'משרות ניהול'):");
        if (name) {
            const newId = Date.now();
            const newProfile = {
                ...initialData,
                id: newId,
                profileName: name,
                fullName: activeProfile.fullName,
                phone: activeProfile.phone,
                email: activeProfile.email
            };
            setProfiles(prev => [...prev, newProfile]);
            handleSwitchProfile(newId);
            setCandidateId(null);
        }
    };

    const handleUpdateProfileData = (newData: any) => {
        const merged = { ...formData, ...newData };
        if (merged.id && !candidateId) {
            setCandidateId(merged.id);
            setActiveProfileId(merged.id);
        }
        const normalized = normalizeCandidateData(merged);
        setFormData(normalized);
        setProfiles(prev => prev.map(p => p.id === activeProfileId ? normalized : p));
        queueSave(normalized);
    };

    const saveNow = (patch: any) => {
        const merged = { ...formData, ...patch };
        const normalized = normalizeCandidateData(merged);
        setFormData(normalized);
        setProfiles(prev => prev.map(p => p.id === activeProfileId ? normalized : p));
        persistProfile(normalized);
    };

    const persistProfile = async (data: any) => {
        if (!apiBase) return;
        const id = await ensureCandidateRecord(data);
        if (!id) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const payload = sanitizePayload(data);
            const res = await fetch(`${apiBase}/api/candidates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('שמירה נכשלה');
            const updated = await res.json();
            const normalizedUpdated = normalizeCandidateData(updated);
            setFormData(normalizedUpdated);
            setProfiles(prev => prev.map(p => p.id === id ? normalizedUpdated : p));
            setCandidateId(updated.id || id);
        } catch (err: any) {
            setSaveError(err.message || 'שמירה נכשלה');
            console.error('Save profile failed', err);
        } finally {
            setIsSaving(false);
        }
    };

    const queueSave = (data: any) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            persistProfile(data);
        }, 800);
    };

    const handleAddTags = (newTags: string[]) => {
        const unique = newTags.filter(t => !formData.tags.includes(t));
        handleUpdateProfileData({ tags: [...formData.tags, ...unique] });
        setIsTagSelectorOpen(false);
    };
    
    const handleRemoveTag = (tag: string) => {
        handleUpdateProfileData({ tags: formData.tags.filter((t: string) => t !== tag) });
    };

    const handleSelectRole = (selected: SelectedJobField | null) => {
        if (selected) {
            handleUpdateProfileData({ 
                desiredRoles: [...formData.desiredRoles, { value: selected.role, owner: 'candidate' }] 
            });
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleRemoveRole = (roleValue: string) => {
        handleUpdateProfileData({ 
            desiredRoles: formData.desiredRoles.filter((r: any) => r.value !== roleValue) 
        });
    };

    const handleViewChange = (view: string) => {
        if (view === 'agent') {
            initializeChat();
            setIsChatOpen(true);
        } else {
            setActiveView(view);
        }
    };
    
    // Task Handlers
    const handleTaskClick = (task: any) => {
        if (task.type === 'screening') {
            setIsScreeningWizardOpen(true);
        }
    };

    const handleScreeningSubmit = (answers: Record<number, any>) => {
        console.log('Submitted Answers:', answers);
        setIsScreeningWizardOpen(false);
        // Remove task from list to simulate completion
        setPendingTasks(prev => prev.slice(1));
    };


    // --- AI CHAT LOGIC ---
    const initializeChat = () => {
        if (chatSession) return;
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const contextData = { candidate: formData };
        const systemInstruction = `You are Hiro, a helpful career assistant for the candidate "${formData.fullName}". 
        You have access to their profile data and can help them update it using tools.
        Answer in Hebrew. Be professional, encouraging, and concise.
        Context: ${JSON.stringify(contextData)}`;
        
        const newChatSession = ai.chats.create({ 
            model: 'gemini-3-flash-preview', 
            config: { 
                systemInstruction,
                tools: [{ functionDeclarations: [updateCandidateFieldFunctionDeclaration, upsertWorkExperienceFunctionDeclaration] }]
            } 
        });
        setChatSession(newChatSession);
        
        if (chatMessages.length === 0) {
             setChatMessages([{ role: 'model', text: `היי ${formData.fullName.split(' ')[0]}, אני הירו, הסוכן האישי שלך. איך אני יכול לעזור לך לשדרג את הפרופיל היום?` }]);
        }
    };

    const handleSendMessage = async (input: string) => {
        if (!input.trim() || isChatLoading || !chatSession) return;
        const userMessage: Message = { role: 'user', text: input };
        setChatMessages(prev => [...prev, userMessage]);
        setIsChatLoading(true);
        setChatError(null);

        try {
            const response = await chatSession.sendMessage({ message: input });
            
            if (response.functionCalls) {
                for (const fc of response.functionCalls) {
                    if (fc.name === 'updateCandidateField') {
                        const { fieldName, newValue } = fc.args as any;
                        handleUpdateProfileData({ [fieldName]: newValue });
                        const toolResponse = await chatSession.sendMessage({ message: `Field ${fieldName} updated to ${newValue}.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || "עודכן בהצלחה." }]);
                    }
                    
                    if (fc.name === 'upsertWorkExperience') {
                        const newExp = fc.args as any;
                        const currentExp = formData.workExperience || [];
                        let updatedExp;
                        if (newExp.id) {
                            updatedExp = currentExp.map((e: any) => e.id === newExp.id ? { ...e, ...newExp } : e);
                        } else {
                            updatedExp = [{ ...newExp, id: Date.now() }, ...currentExp];
                        }
                        handleUpdateProfileData({ workExperience: updatedExp });
                        
                        const toolResponse = await chatSession.sendMessage({ message: `Work experience at ${newExp.company} has been added/updated.` });
                        setChatMessages(prev => [...prev, { role: 'model', text: toolResponse.text || "הניסיון התעסוקתי עודכן בהצלחה." }]);
                    }
                }
            } else {
                setChatMessages(prev => [...prev, { role: 'model', text: response.text || "" }]);
            }
        } catch (e) {
            console.error("Gemini API error:", e);
            setChatError("אירעה שגיאה בתקשורת עם השרת.");
        } finally {
            setIsChatLoading(false);
        }
    };


    // --- RENDERERS ---

    const getAvailabilityMeta = (availability?: string | null) => {
        switch (availability) {
            case "🟢 מיידי (זמין לעבודה מיד).":
                return { badgeClass: "bg-green-50 text-green-700", display: availability };
            case "🟡 חודש הודעה (עובד, מחפש אקטיבית).":
                return { badgeClass: "bg-yellow-50 text-yellow-700", display: availability };
            case "🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).":
                return { badgeClass: "bg-orange-50 text-orange-700", display: availability };
            case "🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).":
                return { badgeClass: "bg-red-50 text-red-700", display: availability };
            default:
                return null;
        }
    };

    const renderHeader = () => {
        const availabilityMeta = getAvailabilityMeta(formData.availability);
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 mb-6">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="relative">
                        <img src={formData.profilePicture} alt="Profile" className="w-28 h-28 rounded-full object-cover ring-4 ring-bg-subtle" />
                        <button
                            className="absolute bottom-0 left-0 bg-bg-card p-2 rounded-full shadow-md border border-border-default hover:bg-bg-hover"
                            onClick={() => avatarInputRef.current?.click()}
                        >
                            <ArrowUpTrayIcon className="w-5 h-5 text-text-muted" />
                        </button>
                    </div>
                    <div className="flex-1 text-center sm:text-right w-full">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <EditableField
                                    value={formData.fullName}
                                    onSave={(val) => handleUpdateProfileData({ fullName: val })}
                                    className="text-3xl font-extrabold text-text-default inline-block"
                                    placeholder="שם מלא"
                                />
                                {availabilityMeta && (
                                    <span
                                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${availabilityMeta.badgeClass}`}
                                    >
                                        {availabilityMeta.display}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {isSaving && <span className="text-xs text-primary-600 font-semibold">שומר...</span>}
                                {saveError && <span className="text-xs text-red-500 font-semibold">{saveError}</span>}
                                <button
                                    onClick={() => setIsResumePreviewOpen(true)}
                                    className="text-text-muted hover:text-primary-600 p-2 rounded-full hover:bg-bg-subtle transition-colors flex items-center gap-2 border border-transparent hover:border-border-default"
                                    title="הורד קורות חיים"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5" />
                                    <span className="text-xs font-semibold hidden sm:inline">הורד קו"ח ({activeProfile.profileName})</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 mb-3 text-lg text-text-muted">
                            <EditableField
                                value={formData.title}
                                onSave={(val) => handleUpdateProfileData({ title: val })}
                                icon={<BriefcaseIcon className="w-5 h-5" />}
                                placeholder="כותרת מקצועית"
                                className="font-medium"
                            />
                            <span className="hidden sm:inline text-text-subtle">•</span>
                            <EditableField
                                value={formData.location}
                                onSave={(val) => handleUpdateProfileData({ location: val })}
                                icon={<MapPinIcon className="w-5 h-5" />}
                                placeholder="עיר מגורים"
                            />
                        </div>

                        <div className="mb-4">
                            <EditableField
                                value={formData.professionalSummary}
                                onSave={(val) => handleUpdateProfileData({ professionalSummary: val })}
                                multiline
                                truncate={true}
                                placeholder="כתוב תקציר מקצועי קצר..."
                                className="text-sm text-text-muted leading-relaxed"
                            />
                        </div>

                        {/* RESTORED: Tags */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4 mb-3">
                            {(Array.isArray(formData.tags) ? formData.tags : []).map((tag: string) => (
                                <span key={tag} className="flex items-center bg-blue-50 text-blue-700 border border-blue-100 text-xs font-medium px-2 py-1 rounded-full">
                                    {tag}
                                    <button onClick={() => handleRemoveTag(tag)} className="mr-1 text-blue-500 hover:text-blue-900">
                                        <XMarkIcon className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                            <button
                                onClick={() => setIsTagSelectorOpen(true)}
                                className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:bg-primary-50 px-2 py-1 rounded-full transition-colors"
                            >
                                <PlusIcon className="w-3 h-3" />
                                הוסף תגית
                            </button>
                        </div>

                        {/* RESTORED: Desired Roles */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
                            <button
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-bold rounded-full hover:bg-primary-100 transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" />
                                <span>הוסף תפקיד</span>
                            </button>

                            {(Array.isArray(formData.desiredRoles) ? formData.desiredRoles : []).map((role: any, idx: number) => (
                                <span key={idx} className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full text-xs font-medium">
                                    {role.value}
                                    <button onClick={() => handleRemoveRole(role.value)} className="hover:text-purple-900 rounded-full">
                                        <XMarkIcon className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>

                        {/* RESTORED: Join Pool Toggle */}
                        <div className="mt-6 bg-gradient-to-r from-bg-subtle to-white border border-border-default rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-2 rounded-full shadow-sm text-primary-600">
                                    <SparklesIcon className="w-5 h-5" />
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-primary-800">הצטרף למאגר המועמדים שלנו</p>
                                    <p className="text-xs text-text-muted">וקבל הצעות עבודה רלוונטיות ישירות למייל.</p>
                                </div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={joinCandidatePool} onChange={(e) => setJoinCandidatePool(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // --- PENDING TASKS SECTION (New) ---
    const renderPendingTasks = () => {
        if (pendingTasks.length === 0) return null;

        return (
            <div className="mb-6 animate-fade-in">
                <h3 className="text-lg font-bold text-text-default mb-3 flex items-center gap-2">
                    <BellIcon className="w-5 h-5 text-red-500" />
                    משימות ממתינות
                </h3>
                <div className="space-y-3">
                    {pendingTasks.map((task) => (
                        <div key={task.id} className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                            <div>
                                <h4 className="font-bold text-red-800 text-sm">שאלון סינון למשרה</h4>
                                <p className="text-xs text-red-600 font-medium">{task.jobTitle}</p>
                            </div>
                            <button
                                onClick={() => handleTaskClick(task)}
                                className="bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition flex items-center gap-2"
                            >
                                <VideoCameraIcon className="w-3.5 h-3.5" />
                                התחל שאלון
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderProfileContent = () => (
        <>
            {renderHeader()}

            {/* Pending Tasks Area */}
            {renderPendingTasks()}

            {/* CV & Alerts */}
            <AccordionSection title="קורות חיים" icon={<DocumentTextIcon className="w-5 h-5" />} defaultOpen>
                <div className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg">
                    <div className="font-semibold text-text-default">
                        {formData.fullName ? `CV_${formData.fullName.replace(' ', '_')}.pdf` : 'העלה קובץ'}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            className={`p-2 ${formData.resumeUrl ? 'text-text-muted hover:text-primary-600' : 'text-text-subtle cursor-not-allowed'}`}
                            onClick={() => formData.resumeUrl && window.open(formData.resumeUrl, '_blank')}
                            disabled={!formData.resumeUrl}
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                        </button>
                        <button
                            className="p-2 text-text-muted hover:text-primary-600 cursor-pointer"
                            onClick={() => resumeInputRef.current?.click()}
                        >
                            <ArrowUpTrayIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </AccordionSection>

            <MainContent
                formData={formData}
                onFormChange={handleUpdateProfileData}
                onImmediateSave={(patch) => saveNow(patch)}
                viewMode="candidate"
            />
        </>
    );

    // Favorites View (REAL DATA from State)
    const renderFavorites = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-text-default">משרות שאהבתי</h2>
                <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-1 rounded-full">{favoriteJobsList.length} משרות</span>
            </div>
            {favoriteJobsList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {favoriteJobsList.map((job) => (
                        <div key={job.id} className="relative">
                            <JobCard
                                job={job}
                                onApply={() => alert(`Applying to ${job.title}...`)}
                                isFavorite={true}
                                toggleFavorite={() => toggleFavoriteJob(job.id)}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 flex flex-col items-center text-text-muted">
                    <BookmarkIcon className="w-16 h-16 opacity-30 mb-4" />
                    <p className="text-lg font-medium">עדיין לא סימנת משרות בלב.</p>
                    <button onClick={() => setActiveView('jobs')} className="text-primary-600 font-bold mt-2 hover:underline">
                        עבור למשרות רלוונטיות
                    </button>
                </div>
            )}
        </div>
    );

    // Relevant Jobs View (Real Mock Data with Filters)
    const renderJobs = () => (
        <div className="space-y-6">
            <JobSearchFilters
                searchTerm={jobSearchTerm}
                setSearchTerm={setJobSearchTerm}
                filters={jobFilters}
                setFilters={setJobFilters}
                onClear={() => {
                    setJobSearchTerm('');
                    setJobFilters({ location: '', type: '', date: '' });
                }}
                resultsCount={filteredJobs.length}
            />

            <h2 className="text-xl font-bold text-text-default mb-4">
                {filteredJobs.length > 0 ? 'משרות רלוונטיות עבורך' : 'לא נמצאו משרות מתאימות'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map((job) => (
                    <JobCard
                        key={job.id}
                        job={job}
                        onApply={() => alert(`Applying to ${job.title}...`)}
                        isFavorite={favoriteJobIds.has(job.id)}
                        toggleFavorite={() => toggleFavoriteJob(job.id)}
                    />
                ))}
            </div>
        </div>
    );

    // Offers (Inquiries) View - Placeholder based on user request
    const renderOffers = () => (
        <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
                <h1 className="text-3xl font-black text-text-default tracking-tight">הצעות ממעסיקים</h1>
                <p className="text-text-muted text-lg">מעסיקים שצפו בפרופיל שלך ורוצים ליצור איתך קשר.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Mock Offer 1 */}
                <div className="bg-white border border-border-default rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center font-bold text-lg">B</div>
                            <div>
                                <h3 className="font-bold text-lg text-text-default">מנהל/ת שיווק</h3>
                                <p className="text-sm text-text-muted">בזק בינלאומי</p>
                            </div>
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">חדש</span>
                    </div>
                    <p className="text-sm text-text-default mb-4">
                        שלום גדעון, ראינו את הפרופיל שלך במאגר והתרשמנו מאוד מהניסיון ב-PPC. נשמח לבדוק התאמה למשרה פתוחה אצלנו.
                    </p>
                    <div className="flex gap-3">
                        <button className="flex-1 bg-primary-600 text-white font-bold py-2 rounded-lg hover:bg-primary-700 transition">אני מעוניין/ת</button>
                        <button className="flex-1 bg-bg-subtle text-text-muted font-bold py-2 rounded-lg hover:bg-bg-hover transition">לא תודה</button>
                    </div>
                </div>

                {/* Mock Offer 2 */}
                <div className="bg-white border border-border-default rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center font-bold text-lg">W</div>
                            <div>
                                <h3 className="font-bold text-lg text-text-default">PPC Specialist</h3>
                                <p className="text-sm text-text-muted">Wix</p>
                            </div>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-bold">לפני יומיים</span>
                    </div>
                    <p className="text-sm text-text-default mb-4">
                        היי, אנחנו מגייסים לצוות ה-Growth ומחפשים אנשים עם רקע כמו שלך. האם רלוונטי?
                    </p>
                    <div className="flex gap-3">
                        <button className="flex-1 bg-green-100 text-green-700 border border-green-200 font-bold py-2 rounded-lg cursor-default">אישרת התעניינות</button>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-bg-default font-sans text-text-default">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelected} />
            <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={handleResumeSelected} />

            <CandidateSidebar
                activeView={activeView}
                onViewChange={handleViewChange}
                activeProfile={activeProfile}
                profiles={profiles}
                onSwitchProfile={handleSwitchProfile}
                onAddProfile={handleAddProfile}
                isOpenMobile={isSidebarOpenMobile}
                setIsOpenMobile={setIsSidebarOpenMobile}
                favoriteCount={favoriteJobIds.size}
                pendingTasks={pendingTasks} // Passing tasks to sidebar
                onTaskClick={handleTaskClick} // Passing handler
                pendingTasksCount={pendingTasks.length}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <div className="lg:hidden p-4 bg-white border-b border-border-default flex justify-between items-center sticky top-0 z-30">
                    <HiroLogotype className="h-6" />
                    <button onClick={() => setIsSidebarOpenMobile(true)} className="p-2">
                        <ArrowLeftIcon className="w-6 h-6 transform rotate-180" />
                    </button>
                </div>

                <div className="p-4 sm:p-8 pb-24 max-w-5xl mx-auto w-full">
                    {isSwitching ? (
                        <ProfileLoadingSkeleton />
                    ) : (
                        <div className="animate-fade-in">
                            {activeView === 'profile' && renderProfileContent()}
                            {activeView === 'jobs' && renderJobs()}
                            {activeView === 'favorites' && renderFavorites()}
                            {activeView === 'applications' && <CandidateApplicationsView />}
                            {activeView === 'offers' && renderOffers()}
                        </div>
                    )}
                </div>
            </div>

            {/* Hidden Print Component */}
            <PrintableResume data={formData || initialData} className="hidden print:block" />

            {/* PDF Preview Modal */}
            <ResumePreviewModal isOpen={isResumePreviewOpen} onClose={() => setIsResumePreviewOpen(false)} data={formData} />

            {/* Modals for Tags/Roles */}
            <JobFieldSelector onChange={handleSelectRole} isModalOpen={isJobFieldSelectorOpen} setIsModalOpen={setIsJobFieldSelectorOpen} />
            <TagSelectorModal isOpen={isTagSelectorOpen} onClose={() => setIsTagSelectorOpen(false)} onSave={handleAddTags} existingTags={formData.tags} />

            <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                chatType="candidate-profile"
                userId={candidateId || formData.id?.toString()}
                systemPrompt={`You are Hiro, an expert AI Career Coach and Recruitment Assistant dedicated to helping the candidate "${formData.fullName}".  **Your Goal:** Help the candidate create a "winning profile" to maximize their chances of getting hired. You have direct write-access to their profile data via tools.  **Your Personality:** 1.  **Professional & Encouraging:** Be polite, empathetic, but focus on professional growth. 2.  **Proactive:** Don't just wait for commands. If you see missing fields (like a missing summary or skill), suggest adding them. 3.  **Concise:** Keep your responses short, natural, and action-oriented. 4.  **Language:** Always converse in Hebrew (he-IL).  **Operational Guidelines:** 1.  **Context Awareness:** Use the provided profile JSON to understand their current status. 2.  **Tool Usage:**     - Use \\updateCandidateField\\ for simple text fields (Name, Title, Summary, Phone, Email, Location).     - Use \\upsertWorkExperience\\ to add or fix job history.     - INFER information: If the user says "I worked at Wix as a Dev", map it correctly to the tool arguments without asking unnecessary questions. 3.  **Validation:** If the user provides vague info (e.g., "I do marketing"), ask for specifics ("What kind of marketing? Digital? Content?") before saving.  **Current Profile Context:** ${JSON.stringify(formData || {})};`}
                contextData={formData}
                onProfileUpdate={(patch) => saveNow(patch)}
            />

            {/* Screening Wizard Modal */}
            {isScreeningWizardOpen && pendingTasks.length > 0 && (
                <CandidateScreeningWizard
                    jobTitle={pendingTasks[0].data.jobTitle}
                    questions={pendingTasks[0].data.questions}
                    onClose={() => setIsScreeningWizardOpen(false)}
                    onSubmit={handleScreeningSubmit}
                />
            )}
        </div>
    );
};

export default CandidatePublicProfileView;
