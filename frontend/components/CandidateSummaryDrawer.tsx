
import React, { useState, useEffect, useId } from 'react';
import { 
    XMarkIcon, PhoneIcon, EnvelopeIcon, LinkedInIcon, CheckBadgeIcon, ArrowLeftIcon, UserIcon,
    BriefcaseIcon, CalendarDaysIcon, DocumentTextIcon,
    CheckCircleIcon, CalendarIcon, NoSymbolIcon, ArrowUturnLeftIcon, ArchiveBoxIcon,
    DocumentIcon, PhotoIcon, UserGroupIcon, BellIcon, Cog6ToothIcon, WhatsappIcon, ChatBubbleBottomCenterTextIcon, PlusIcon, BookmarkIcon, BookmarkIconSolid,
    PaperAirplaneIcon
} from './Icons';
import type { Candidate } from './CandidatesListView';
import ResumeViewer from './ResumeViewer';
import { MessageModalConfig } from '../hooks/useUIState';
import { TagInput } from './TagInput';

// --- TYPES for mock data ---
type EventType = 'ראיון' | 'פגישה' | 'תזכורת' | 'משימת מערכת';
interface MockEvent {
  id: number;
  type: EventType;
  title: string;
  date: string;
}

type JobStatus = 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון' | 'הועבר ללקוח' | 'התקבל';
interface MockJob {
  id: number;
  jobTitle: string;
  company: string;
  status: JobStatus;
  updatedAt: string;
}

type DocumentType = 'קורות חיים' | 'תעודה' | 'מסמך זיהוי' | 'אחר';
interface MockDocument {
  id: number;
  name: string;
  type: DocumentType;
  uploadDate: string;
}

// --- MOCK DATA ---
const mockEvents: MockEvent[] = [
  { id: 1, type: 'ראיון', title: 'ראיון טכני למשרת Fullstack', date: '2025-08-15T10:00:00' },
  { id: 2, type: 'תזכורת', title: 'Follow-up לגבי המועמד', date: '2025-08-16T09:00:00' },
  { id: 3, type: 'פגישה', title: 'שיחת היכרות טלפונית', date: '2025-08-12T14:30:00' },
];

const mockJobs: MockJob[] = [
  { id: 1, jobTitle: 'דרוש/ה מחסנאי/ת למפעל מוביל', company: 'תנובה', status: 'הועבר ללקוח', updatedAt: '14/07/2025' },
  { id: 2, jobTitle: 'מנהל/ת קמפיינים PPC', company: 'בזק', status: 'הוזמן לראיון', updatedAt: '10/07/2025' },
  { id: 3, jobTitle: 'מנהל/ת מוצר', company: 'Wix', status: 'לא רלוונטי', updatedAt: '01/07/2025' },
];

const mockDocuments: MockDocument[] = [
  { id: 1, name: 'Gideon_Shapira_CV.pdf', type: 'קורות חיים', uploadDate: '2025-07-28T14:32:00' },
  { id: 2, name: 'תעודת_תואר_ראשון.pdf', type: 'תעודה', uploadDate: '2025-07-29T09:15:00' },
  { id: 3, name: 'צילום_תעודת_זהות.jpg', type: 'מסמך זיהוי', uploadDate: '2025-07-29T09:16:00' },
];

const mockResumeDataForDrawer = {
    name: 'גדעון שפירא',
    contact: 'gidon.shap@email.com 054-4910468',
    summary: `מנהל שיווק דיגיטלי מנוסה עם למעלה מ-5 שנות ניסיון בהובלת אסטרטגיות צמיחה וקמפיינים מרובי ערוצים. בעל מומחיות עמוקה ב-PPC, SEO, ואנליטיקה, עם יכולת מוכחת בניהול תקציבים, אופטימיזציה של משפכי המרה והובלת צוותים להישגים עסקיים משמעותיים.`,
    experience: [
      `2020-2023 מנהל שיווק בבזק. ניהול צוות של 5 עובדים, אחריות על קמפיינים דיגיטליים ותקציב שנתי של 2 מיליון ש"ח.`,
      `2018-2019 מנהל קמפיינים PPC ב-Wix. ניהול קמפיינים בגוגל ופייסבוק, אופטימיזציה והפקת דוחות.`,
    ]
};


// --- STYLES & HELPERS ---
const eventTypeStyles: { [key in EventType]: { icon: React.ReactNode; bg: string; text: string; } } = {
  'ראיון': { icon: <CalendarIcon className="w-4 h-4" />, bg: 'bg-secondary-100', text: 'text-secondary-800' },
  'פגישה': { icon: <UserGroupIcon className="w-4 h-4" />, bg: 'bg-primary-100', text: 'text-primary-800' },
  'תזכורת': { icon: <BellIcon className="w-4 h-4" />, bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'משימת מערכת': { icon: <Cog6ToothIcon className="w-5 h-5" />, bg: 'bg-gray-200', text: 'text-gray-800' },
};

const jobStatusStyles: { [key in JobStatus]: { bg: string; text: string; icon: React.ReactElement<{ className?: string }> } } = {
  'פעיל': { bg: 'bg-accent-100', text: 'text-accent-800', icon: <CheckCircleIcon className="w-4 h-4 text-accent-600" /> },
  'הוזמן לראיון': { bg: 'bg-secondary-100', text: 'text-secondary-800', icon: <CalendarIcon className="w-4 h-4 text-secondary-600" /> },
  'הועבר ללקוח': { bg: 'bg-blue-100', text: 'text-blue-800', icon: <PaperAirplaneIcon className="w-4 h-4 text-blue-600" /> },
  'התקבל': { bg: 'bg-green-100', text: 'text-green-800', icon: <CheckBadgeIcon className="w-4 h-4 text-green-600" /> },
  'לא רלוונטי': { bg: 'bg-gray-200', text: 'text-gray-700', icon: <NoSymbolIcon className="w-4 h-4 text-gray-500" /> },
  'מועמד משך עניין': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <ArrowUturnLeftIcon className="w-4 h-4 text-yellow-600" /> },
  'בארכיון': { bg: 'bg-bg-card border border-border-default', text: 'text-text-muted', icon: <ArchiveBoxIcon className="w-4 h-4 text-text-subtle" /> },
};

const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'pdf': return <DocumentIcon className="w-6 h-6 text-red-500"/>;
        case 'doc':
        case 'docx': return <DocumentIcon className="w-6 h-6 text-secondary-500"/>;
        case 'jpg':
        case 'jpeg':
        case 'png': return <PhotoIcon className="w-6 h-6 text-accent-500"/>;
        default: return <DocumentIcon className="w-6 h-6 text-gray-500"/>;
    }
}

// --- TAB CONTENT COMPONENTS ---
const DetailsContent: React.FC<{ candidate: Candidate }> = ({ candidate }) => {
    const [tags, setTags] = useState<string[]>(candidate.tags);

    useEffect(() => {
        setTags(candidate.tags);
    }, [candidate]);

    return (
        <div className="space-y-8">
            {/* Part 1: Summary & Personal Details */}
            <div>
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-20 h-20 flex-shrink-0 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full font-bold text-3xl">
                    {candidate.avatar}
                    </div>
                    <div>
                    <h3 className="text-2xl font-extrabold text-text-default flex items-center">{candidate.name} <CheckBadgeIcon className="w-6 h-6 text-secondary-500 mr-2" /></h3>
                    <p className="text-text-muted">{candidate.title}</p>
                    </div>
                </div>

                <div className="mt-6 bg-bg-subtle p-4 rounded-lg border border-border-default">
                    <h4 className="font-bold text-text-muted mb-2 text-sm">תקציר אחרון (מראיון טלפוני / קו"ח)</h4>
                    <p className="text-sm text-text-default leading-relaxed">
                        מועמד בעל ניסיון של 5 שנים בניהול שיווק בחברת AllJobs. הראה יכולות מרשימות בניהול קמפיינים והובלת צוות. מתאים מאוד למשרת מנהל/ת שיווק בבזק.
                    </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
                    <div>
                        <p className="font-semibold text-text-muted">גיל</p>
                        <p className="font-bold text-text-default">35</p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">כתובת</p>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(candidate.address || '')}`} target="_blank" rel="noopener noreferrer" className="font-bold text-primary-600 hover:underline">
                            {candidate.address || 'לא צוין'}
                        </a>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">ציפיות שכר</p>
                        <p className="font-bold text-text-default">12,000 ₪</p>
                    </div>
                    <div>
                        <p className="font-semibold text-text-muted">לינקדאין</p>
                        <a href="#" className="font-bold text-primary-600 hover:underline flex items-center gap-1">
                            <LinkedInIcon className="w-4 h-4" />
                            <span>פרופיל</span>
                        </a>
                    </div>
                </div>
        
                <div className="mt-6 pt-6 border-t border-border-default space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">סטטוס נוכחי:</span>
                        <span className="font-bold text-text-default">{candidate.status}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">פעילות אחרונה:</span>
                        <span className="font-bold text-text-default">{candidate.lastActivity}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-text-muted font-semibold">מקור גיוס:</span>
                        <span className="font-bold text-text-default">{candidate.source}</span>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-border-default space-y-4">
                    <div>
                        <p className="font-semibold text-text-muted text-sm mb-2">תגיות מועמד</p>
                        <TagInput tags={tags} setTags={setTags} placeholder="הוסף תגית..." />
                    </div>
                </div>
            </div>
            
            {/* Part 2: Resume Viewer */}
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-text-default">קורות חיים</h3>
                <ResumeViewer resumeData={mockResumeDataForDrawer} className="h-[600px]" />
            </div>
        </div>
    );
};


const EventsContent: React.FC = () => (
    <div className="space-y-3">
        {mockEvents.map(event => (
            <div key={event.id} className="flex items-center gap-3 bg-bg-subtle/70 p-3 rounded-lg">
                <div className={`w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full ${eventTypeStyles[event.type].bg} ${eventTypeStyles[event.type].text}`}>
                    {eventTypeStyles[event.type].icon}
                </div>
                <div>
                    <p className="font-semibold text-text-default text-sm">{event.title}</p>
                    <p className="text-xs text-text-muted">{new Date(event.date).toLocaleString('he-IL', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            </div>
        ))}
    </div>
);

const JobsContent: React.FC = () => (
    <div className="space-y-4">
        <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-text-default">תהליכים פעילים והפניות</h3>
            <span className="text-xs text-text-muted">{mockJobs.length} משרות</span>
        </div>
        {mockJobs.map(job => {
            const { bg, text, icon } = jobStatusStyles[job.status] || jobStatusStyles['לא רלוונטי'];
            return (
                <div key={job.id} className="bg-bg-card border border-border-default shadow-sm p-4 rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="font-bold text-primary-700 text-base hover:underline cursor-pointer">{job.jobTitle}</p>
                            <p className="text-sm text-text-muted font-semibold">{job.company}</p>
                        </div>
                         <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${bg} ${text} border-transparent`}>
                            {React.cloneElement(icon, { className: 'w-3.5 h-3.5' })}
                            <span>{job.status}</span>
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-text-muted mt-3 pt-3 border-t border-border-subtle">
                        <span>עודכן: {job.updatedAt}</span>
                        <button className="text-primary-600 hover:underline font-semibold">פרטים נוספים</button>
                    </div>
                </div>
            )
        })}
    </div>
);

const DocumentsContent: React.FC = () => (
    <div className="space-y-3">
        {mockDocuments.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 bg-bg-subtle/70 p-3 rounded-lg hover:bg-bg-hover cursor-pointer border border-border-default">
                <div className="flex-shrink-0">{getFileIcon(doc.name)}</div>
                <div className="flex-1">
                    <p className="font-semibold text-text-default text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-text-muted">{doc.type} &bull; {new Date(doc.uploadDate).toLocaleDateString('he-IL')}</p>
                </div>
                <button className="text-text-subtle hover:text-primary-600">
                    <ArrowLeftIcon className="w-4 h-4 transform rotate-180" />
                </button>
            </div>
        ))}
        <button className="w-full py-2.5 border-2 border-dashed border-border-default rounded-lg text-text-muted hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all text-sm font-semibold flex items-center justify-center gap-2">
            <PlusIcon className="w-4 h-4" />
            העלאת מסמך חדש
        </button>
    </div>
);


const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold border-b-2 transition-colors duration-200 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-hover/50'
        }`}
    >
        {icon}
        <span>{title}</span>
    </button>
);

const ActionButton: React.FC<{ icon: React.ReactNode; tooltip: string; onClick?: () => void; href?: string }> = ({ icon, tooltip, onClick, href }) => {
    const content = (
         <>
            {icon}
         </>
    );
    
    const className = "w-12 h-12 flex items-center justify-center bg-bg-card rounded-full shadow-md border border-border-default text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-all duration-200";

    if (href) {
        return <a href={href} title={tooltip} className={className}>{content}</a>
    }

    return (
        <button onClick={onClick} title={tooltip} className={className}>
            {content}
        </button>
    );
};

// --- MAIN COMPONENT ---
interface CandidateSummaryDrawerProps {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
  onViewFullProfile?: (candidateId: number) => void;
  onOpenMessageModal?: (config: MessageModalConfig) => void;
  viewMode?: 'recruiter' | 'manager';
  isFavorite: boolean;
  onToggleFavorite: (id: number) => void;
}

const CandidateSummaryDrawer: React.FC<CandidateSummaryDrawerProps> = ({ candidate, isOpen, onClose, onViewFullProfile, onOpenMessageModal, viewMode = 'recruiter', isFavorite, onToggleFavorite }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'events' | 'jobs' | 'documents'>('details');
  const titleId = useId();

  useEffect(() => {
    if (isOpen) {
      setActiveTab('details');
    }
  }, [isOpen]);

  if (!isOpen || !candidate) return null;

  const handleOpenModal = (mode: 'whatsapp' | 'sms' | 'email') => {
    if (candidate && onOpenMessageModal) {
        onOpenMessageModal({
            mode,
            candidateName: candidate.name,
            candidatePhone: candidate.phone,
        });
    }
  };

  const renderContent = () => {
    switch(activeTab) {
      case 'details': return <DetailsContent candidate={candidate} />;
      case 'events': return <EventsContent />;
      case 'jobs': return <JobsContent />;
      case 'documents': return <DocumentsContent />;
      default: return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-30 z-[60] transition-opacity"
      onClick={onClose}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-card shadow-2xl flex flex-col transform transition-transform text-text-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideIn 0.3s forwards' }}
      >
        <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-card z-10">
          <div className="flex items-center gap-2">
             <button 
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(candidate.id); }} 
                className="p-2 rounded-full text-text-subtle hover:text-primary-500 hover:bg-bg-hover transition-colors"
                title={isFavorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            >
                {isFavorite ? <BookmarkIconSolid className="w-5 h-5 text-primary-500" /> : <BookmarkIcon className="w-5 h-5" />}
            </button>
            <h2 id={titleId} className="text-lg font-bold text-text-default">סיכום מועמד</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>
        
        <nav className="flex items-center border-b border-border-default bg-bg-card z-10">
            <TabButton title="פרטים אישיים" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} icon={<UserIcon className="w-5 h-5"/>} />
            {viewMode === 'recruiter' && (
              <TabButton title="אירועים" isActive={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<CalendarDaysIcon className="w-5 h-5"/>} />
            )}
            <TabButton title="תהליכים" isActive={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon={<BriefcaseIcon className="w-5 h-5"/>} />
            <TabButton title="מסמכים" isActive={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<DocumentTextIcon className="w-5 h-5"/>} />
        </nav>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {renderContent()}
        </div>

        <footer className="p-4 bg-bg-subtle border-t border-border-default space-y-4 z-10">
            <div className="flex items-center justify-around">
                <ActionButton href={`tel:${candidate.phone}`} tooltip="התקשר" icon={<PhoneIcon className="w-6 h-6" />} />
                <ActionButton icon={<EnvelopeIcon className="w-6 h-6" />} tooltip="שלח מייל" onClick={() => handleOpenModal('email')} />
                <ActionButton icon={<ChatBubbleBottomCenterTextIcon className="w-6 h-6" />} tooltip="שלח SMS" onClick={() => handleOpenModal('sms')} />
                <ActionButton icon={<WhatsappIcon className="w-6 h-6" />} tooltip="שלח Whatsapp" onClick={() => handleOpenModal('whatsapp')} />
            </div>
            {onViewFullProfile && (
                <button onClick={() => candidate && onViewFullProfile(candidate.id)} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm">
                    <span>צפה בפרופיל המלא</span>
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
            )}
        </footer>
        <style>{`
            @keyframes slideIn {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
        `}</style>
      </div>
    </div>
  );
};

export default CandidateSummaryDrawer;