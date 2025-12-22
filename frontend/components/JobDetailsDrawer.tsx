
import React, { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    XMarkIcon, BriefcaseIcon, CalendarDaysIcon, UserGroupIcon, MapPinIcon, 
    WalletIcon, ClockIcon, ArrowLeftIcon, UserIcon, PencilIcon
} from './Icons';
import { candidatesData as mockCandidates } from './CandidatesListView';

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
  requirements: string[];
  salaryMin: number;
  salaryMax: number;
}

const mockJobEvents = [
    { id: 1, type: 'candidate_status', user: 'דנה כהן', description: 'שינתה סטטוס מועמד "שפירא גדעון" ל-"נדחה".', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    { id: 2, type: 'job_edit', user: 'מערכת', description: 'דרישות המשרה עודכנו על ידי הלקוח.', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    { id: 3, type: 'note', user: 'אביב לוי', description: 'הוסיף הערה: "הלקוח מבקש להאיץ את תהליך הגיוס".', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
];

const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; icon: React.ReactNode }> = ({ title, isActive, onClick, icon }) => (
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

const DetailsContent: React.FC<{ job: Job }> = ({ job }) => (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-primary-100 rounded-lg">
                <BriefcaseIcon className="w-8 h-8 text-primary-600"/>
            </div>
            <div>
                <h3 className="text-xl font-extrabold text-text-default">{job.title}</h3>
                <p className="text-sm font-semibold text-text-muted">{job.client}</p>
            </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-text-muted"><MapPinIcon className="w-5 h-5 text-primary-500"/> <span>{job.location}</span></div>
            <div className="flex items-center gap-2 text-text-muted"><BriefcaseIcon className="w-5 h-5 text-primary-500"/> <span>{Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType}</span></div>
            <div className="flex items-center gap-2 text-text-muted"><WalletIcon className="w-5 h-5 text-primary-500"/> <span>{job.salaryMin/1000}k-{job.salaryMax/1000}k ₪</span></div>
            <div className="flex items-center gap-2 text-text-muted"><ClockIcon className="w-5 h-5 text-primary-500"/> <span>נפתחה ב-{new Date(job.openDate).toLocaleDateString('he-IL')}</span></div>
        </div>

        <div className="pt-4 border-t border-border-default">
            <h4 className="font-bold text-text-default mb-2">תיאור המשרה</h4>
            <p className="text-sm text-text-muted leading-relaxed whitespace-pre-line">{job.description}</p>
        </div>

        <div>
            <h4 className="font-bold text-text-default mb-2">דרישות</h4>
            <ul className="space-y-2">
                {job.requirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-muted">
                        <span className="text-primary-500 mt-1">●</span>
                        <span>{req}</span>
                    </li>
                ))}
            </ul>
        </div>
    </div>
);

const EventsContent: React.FC<{ job: Job }> = ({ job }) => (
    <div className="space-y-4">
        {mockJobEvents.map(event => (
            <div key={event.id} className="flex items-start gap-3">
                <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-bg-subtle rounded-full mt-1">
                    <PencilIcon className="w-5 h-5 text-text-muted" />
                </div>
                <div>
                    <p className="text-sm text-text-default">{event.description}</p>
                    <p className="text-xs text-text-subtle">{event.user} &bull; {new Date(event.timestamp).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
            </div>
        ))}
    </div>
);

const CandidatesContent: React.FC<{ job: Job }> = ({ job }) => (
    <div className="space-y-3">
        {mockCandidates.slice(0, job.associatedCandidates).map(candidate => (
             <div key={candidate.id} className="flex items-center gap-3 bg-bg-subtle/70 p-3 rounded-lg">
                <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full font-bold text-sm">
                    {candidate.avatar}
                </div>
                <div>
                    <p className="font-semibold text-text-default text-sm">{candidate.name}</p>
                    <p className="text-xs text-text-muted">{candidate.title}</p>
                </div>
            </div>
        ))}
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
      className="fixed inset-0 bg-black bg-opacity-30 z-[60] transition-opacity"
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 left-0 h-full w-full max-w-md bg-bg-card shadow-2xl flex flex-col transform transition-transform text-text-default"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'slideInFromLeft 0.3s forwards' }}
      >
        <header className="p-4 border-b border-border-default flex items-center justify-between flex-shrink-0">
          <h2 id={titleId} className="text-lg font-bold text-text-default truncate">{job.title}</h2>
          <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>
        
        <nav className="flex items-center border-b border-border-default flex-shrink-0">
            <TabButton title="פרטי משרה" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} icon={<BriefcaseIcon className="w-5 h-5"/>} />
            <TabButton title="אירועי משרה" isActive={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<CalendarDaysIcon className="w-5 h-5"/>} />
            <TabButton title="מועמדים" isActive={activeTab === 'candidates'} onClick={() => setActiveTab('candidates')} icon={<UserGroupIcon className="w-5 h-5"/>} />
        </nav>

        <main className="flex-1 overflow-y-auto p-6">
          {renderContent()}
        </main>

        <footer className="p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
            <button 
                onClick={() => handleViewFullProfile(job.id)} 
                className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm"
            >
                <span>צפה במשרה המלאה</span>
                <ArrowLeftIcon className="w-5 h-5" />
            </button>
        </footer>
        <style>{`
            @keyframes slideInFromLeft {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
        `}</style>
      </div>
    </div>
  );
};

export default JobDetailsDrawer;
