
import React, { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    XMarkIcon, BriefcaseIcon, CalendarDaysIcon, UserGroupIcon, MapPinIcon, 
    WalletIcon, ClockIcon, ArrowLeftIcon, UserIcon, PencilIcon, CheckCircleIcon,
    SparklesIcon, EnvelopeIcon, DocumentTextIcon
} from './Icons';
import { candidatesData as mockCandidates } from './CandidatesListView';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה';

interface Job {
  id: number;
  title: string;
  client: string;
  status: JobStatus;
  associatedCandidates: number;
  openDate: string;
  recruiter: string;
  location: string;
  jobType: string | string[];
  description: string;
  requirements: string[]; // Can be empty if everything is in description
  salaryMin: number;
  salaryMax: number;
}

// --- MOCK DATA ---
const mockJobEvents = [
    { id: 1, type: 'status', user: 'דנה כהן', description: 'שינתה סטטוס מועמד "שפירא גדעון" ל-"ראיון מקצועי".', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { id: 2, type: 'note', user: 'אביב לוי', description: 'הוסיף הערה: "הלקוח ביקש להתמקד במועמדים עם ניסיון ב-HubSpot".', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    { id: 3, type: 'system', user: 'מערכת', description: 'קלטה 5 קורות חיים חדשים ממקור AllJobs.', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 4, type: 'job_update', user: 'דנה כהן', description: 'עדכנה את דרישות המשרה (הוספת שנות ניסיון).', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
];

const mockCandidatesEnhanced = mockCandidates.map((c, i) => ({
    ...c,
    matchScore: 95 - (i * 7), // Fake varying scores
    statusColor: i === 0 ? 'bg-purple-100 text-purple-700' : i === 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700',
    statusText: i === 0 ? 'ראיון מתקדם' : i === 1 ? 'סינון טלפוני' : 'חדש'
}));

// --- COMPONENTS ---

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold border-b-2 transition-all duration-200 ${
            isActive ? 'border-primary-500 text-primary-600 bg-primary-50/30' : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-subtle'
        }`}
    >
        {icon}
        <span className="hidden sm:inline">{title}</span>
    </button>
);

const DetailsContent: React.FC<{ job: Job }> = ({ job }) => {
    const { t } = useLanguage();

    // Helper to format salary
    const formatSalary = (min: number, max: number) => {
        if (!min && !max) return 'לא צוין';
        return `${(min/1000)}k - ${(max/1000)}k ₪`;
    };

    // Calculate days open
    const daysOpen = Math.floor((new Date().getTime() - new Date(job.openDate).getTime()) / (1000 * 60 * 60 * 24));

    // Handle "Raw" description safely
    // If description contains HTML tags, we render it as HTML. If it's plain text, we try to format it slightly.
    const createMarkup = (content: string) => {
        // Fallback for incomplete mock data (prevents empty drawer)
        if (!content || content === '...' || content.length < 10) {
             const fallback = `
<strong>תיאור התפקיד:</strong>
הזדמנות להצטרף לצוות מוביל ומשפחתי בחברה בצמיחה. התפקיד כולל עבודה בסביבה דינמית, ניהול משימות שוטפות ואחריות על תהליכים חוצי ארגון.
אנו מחפשים עובד/ת עם מוטיבציה גבוהה, רצון ללמוד ולהתפתח.

<strong>תחומי אחריות:</strong>
• ניהול שוטף של פעילות המחלקה.
• עבודה מול ממשקים פנימיים וחיצוניים.
• הפקת דוחות וניתוח נתונים.
• עמידה בלוחות זמנים ויעדים.

<strong>דרישות (גנרי):</strong>
• ניסיון קודם בתפקיד דומה - יתרון.
• שליטה ביישומי Office.
• יחסי אנוש מעולים ויכולת עבודה בצוות.
             `;
             return { __html: fallback.replace(/\n/g, '<br />') };
        }

        let formatted = content;
        if (!content.includes('<p>') && !content.includes('<ul>')) {
            formatted = content.replace(/\n/g, '<br />');
            // Bold typical headers (lines ending with :)
            formatted = formatted.replace(/^(.+):/gm, '<strong>$1:</strong>');
        }
        return { __html: formatted };
    };

    // Check if we actually have separate requirements to show
    const hasSeparateRequirements = job.requirements && job.requirements.length > 0 && job.requirements[0] !== '...';

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Badges Card */}
            <div className="bg-gradient-to-br from-white to-bg-subtle p-5 rounded-2xl border border-border-default shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-white border border-border-default rounded-2xl shadow-sm text-primary-600">
                            <BriefcaseIcon className="w-7 h-7"/>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-text-default leading-tight line-clamp-2">{job.title}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm font-bold text-primary-700">{job.client}</span>
                                <span className="w-1 h-1 rounded-full bg-border-default"></span>
                                <span className="text-xs text-text-muted flex items-center gap-1">
                                    <MapPinIcon className="w-3 h-3"/> {job.location}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">סוג משרה</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <BriefcaseIcon className="w-4 h-4 text-primary-500"/>
                             <span className="truncate">{Array.isArray(job.jobType) ? job.jobType[0] : job.jobType}</span>
                         </div>
                    </div>
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">טווח שכר</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <WalletIcon className="w-4 h-4 text-green-500"/>
                             <span>{formatSalary(job.salaryMin, job.salaryMax)}</span>
                         </div>
                    </div>
                    <div className="flex flex-col justify-center p-2.5 bg-white rounded-xl border border-border-default shadow-sm col-span-2 sm:col-span-1">
                         <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-0.5">סטטוס</span>
                         <div className="flex items-center gap-1.5 font-semibold text-sm text-text-default">
                             <ClockIcon className="w-4 h-4 text-amber-500"/>
                             <span>פתוחה {daysOpen} ימים</span>
                         </div>
                    </div>
                </div>
            </div>

            {/* Description - Styled Prose */}
            <div className="bg-white p-5 rounded-2xl border border-border-default shadow-sm">
                <h4 className="font-bold text-text-default mb-4 text-sm flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5 text-primary-500"/>
                    פרטי המשרה
                </h4>
                <div 
                    className="prose prose-sm max-w-none text-right text-text-default leading-relaxed whitespace-pre-wrap"
                    style={{ fontSize: '0.925rem' }}
                    dangerouslySetInnerHTML={createMarkup(job.description)} 
                />
            </div>

            {/* Requirements Checklist - ONLY IF DATA EXISTS */}
            {hasSeparateRequirements && (
                <div className="bg-primary-50/50 p-5 rounded-2xl border border-primary-100">
                    <h4 className="font-bold text-primary-900 mb-4 text-sm flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-primary-600" />
                        {t('new_job.section_requirements')}
                    </h4>
                    <div className="space-y-3">
                        {job.requirements.map((req, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <div className="mt-0.5 bg-white rounded-full p-0.5 shadow-sm border border-primary-100 shrink-0">
                                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                                </div>
                                <span className="text-sm text-text-default font-medium leading-snug">{req}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const EventsContent: React.FC<{ job: Job }> = ({ job }) => (
    <div className="relative pb-4 pl-3 pr-2 animate-fade-in">
        {/* Timeline Vertical Line */}
        <div className="absolute top-4 bottom-0 right-[23px] w-0.5 bg-gradient-to-b from-border-default via-border-default to-transparent"></div>

        {mockJobEvents.map((event, index) => {
             let icon = <PencilIcon className="w-3.5 h-3.5"/>;
             let colors = "bg-gray-100 text-gray-600 border-gray-200";
             
             if (event.type === 'status') { icon = <UserIcon className="w-3.5 h-3.5"/>; colors = "bg-blue-50 text-blue-600 border-blue-200"; }
             if (event.type === 'system') { icon = <SparklesIcon className="w-3.5 h-3.5"/>; colors = "bg-purple-50 text-purple-600 border-purple-200"; }
             if (event.type === 'note') { icon = <EnvelopeIcon className="w-3.5 h-3.5"/>; colors = "bg-amber-50 text-amber-600 border-amber-200"; }

             return (
                <div key={event.id} className="relative flex gap-4 mb-6 group">
                    <div className={`relative z-10 w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-2xl border-2 shadow-sm ${colors} transition-transform group-hover:scale-110`}>
                        {icon}
                    </div>
                    
                    <div className="flex-1 bg-white border border-border-default p-3.5 rounded-xl rounded-tr-none shadow-sm group-hover:shadow-md transition-shadow relative top-2">
                         {/* Triangle */}
                         <div className="absolute top-0 right-[-6px] w-3 h-3 bg-white border-t border-r border-border-default transform -rotate-[135deg]"></div>
                         
                         <div className="flex justify-between items-start mb-1.5">
                            <span className="font-bold text-xs text-text-default bg-bg-subtle px-2 py-0.5 rounded-md border border-border-subtle">{event.user}</span>
                            <span className="text-[10px] font-medium text-text-muted">{new Date(event.timestamp).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed font-medium">{event.description}</p>
                    </div>
                </div>
            );
        })}
        
        <div className="flex justify-center mt-4">
             <button className="text-xs font-bold text-primary-600 bg-primary-50 px-4 py-2 rounded-full hover:bg-primary-100 transition-colors">
                 טען אירועים נוספים
             </button>
        </div>
    </div>
);

const CandidatesContent: React.FC<{ job: Job }> = ({ job }) => (
    <div className="space-y-3 animate-fade-in">
        {mockCandidates.slice(0, 6).map((candidate, idx) => {
             const enhanced = mockCandidatesEnhanced[idx % mockCandidatesEnhanced.length];
             return (
                <div key={candidate.id} className="group flex items-center gap-3 bg-white p-3 rounded-xl border border-border-default shadow-sm hover:shadow-md hover:border-primary-300 transition-all cursor-pointer relative overflow-hidden">
                    {/* Hover indicator strip */}
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    
                    <div className="relative shrink-0">
                        <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 text-primary-700 rounded-xl font-extrabold text-sm border border-primary-200 shadow-inner">
                            {candidate.avatar}
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm border border-border-default">
                             <div className={`w-2.5 h-2.5 rounded-full ${idx < 2 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                            <p className="font-bold text-text-default text-sm truncate group-hover:text-primary-700 transition-colors">{candidate.name}</p>
                            <div className="flex items-center gap-1 bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100">
                                <SparklesIcon className="w-3 h-3" />
                                <span className="text-[10px] font-bold">{enhanced.matchScore}%</span>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-text-muted truncate">{candidate.title}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border border-transparent ${enhanced.statusColor}`}>
                                {enhanced.statusText}
                            </span>
                        </div>
                    </div>
                </div>
            )
        })}
        
        <button className="w-full py-3 text-sm font-bold text-primary-600 bg-white border-2 border-dashed border-primary-200 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all flex items-center justify-center gap-2 group">
            <UserGroupIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
            צפה בכל המועמדים ({job.associatedCandidates})
        </button>
    </div>
);


interface JobDetailsDrawerProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

const JobDetailsDrawer: React.FC<JobDetailsDrawerProps> = ({ job, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'events' | 'candidates'>('details');
  const titleId = useId();
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details'); // Reset to details tab when opened
    }
  }, [isOpen]);
  
  const handleViewFullProfile = (jobId: number) => {
    onClose();
    navigate(`/jobs/edit/${jobId}`);
  };

  if (!isOpen || !job) return null;

  const renderContent = () => {
    switch(activeTab) {
      case 'details': return <DetailsContent job={job} />;
      case 'events': return <EventsContent job={job} />;
      case 'candidates': return <CandidatesContent job={job} />;
      default: return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] transition-opacity duration-300"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-default shadow-2xl flex flex-col transform transition-transform border-r border-border-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideInFromLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        <header className="px-5 py-4 border-b border-border-default flex items-center justify-between flex-shrink-0 bg-white z-10 shadow-sm">
          <div className="flex flex-col">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">מבט מהיר</span>
              <h2 id={titleId} className="text-lg font-black text-text-default truncate max-w-[250px] leading-none">{job.title}</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-default transition-all"
            aria-label="סגור"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>
        
        <nav className="flex items-center border-b border-border-default flex-shrink-0 bg-white px-2">
            <TabButton title={t('job.quick_look')} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} icon={<BriefcaseIcon className="w-4 h-4"/>} />
            <TabButton title={t('job.tab_candidates')} isActive={activeTab === 'candidates'} onClick={() => setActiveTab('candidates')} icon={<UserGroupIcon className="w-4 h-4"/>} />
            <TabButton title={t('job.tab_journal')} isActive={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<CalendarDaysIcon className="w-4 h-4"/>} />
        </nav>

        <main className="flex-1 overflow-y-auto p-5 custom-scrollbar relative bg-bg-subtle/30">
          {renderContent()}
        </main>

        <footer className="p-4 bg-white border-t border-border-default flex-shrink-0 shadow-[0_-4px_20px_-1px_rgba(0,0,0,0.05)] z-10">
            <button 
                onClick={() => handleViewFullProfile(job.id)} 
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/20 active:scale-[0.98] group"
            >
                <span>{t('job.tab_edit')} / ניהול מלא</span>
                <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
        </footer>
        <style>{`
            @keyframes slideInFromLeft {
                from { transform: translateX(-100%); opacity: 0.5; }
                to { transform: translateX(0); opacity: 1; }
            }
            .animate-fade-in {
                animation: fadeIn 0.3s ease-out forwards;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `}</style>
      </div>
    </div>
  );
};

export default JobDetailsDrawer;
