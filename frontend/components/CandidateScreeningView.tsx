
import React, { useState, useMemo } from 'react';
import { ChevronDownIcon, NoSymbolIcon, CheckCircleIcon, MapPinIcon, SparklesIcon, PaperAirplaneIcon, AvatarIcon, ArrowLeftIcon } from './Icons';
import ResumeViewer from './ResumeViewer';

interface ScreeningJob {
  id: number;
  company: string;
  title: string;
  location: string;
  salary: string;
  aiMatchScore: number;
  description: string;
  requirements: string[];
  screeningQuestions: { question: string; answer: string }[];
}

export const screeningJobsData: ScreeningJob[] = [
  { 
    id: 1, 
    company: 'Wix', 
    title: 'מפתח/ת Fullstack', 
    location: 'תל אביב', 
    salary: '28-32k ₪',
    aiMatchScore: 88,
    description: 'דרוש/ה מפתח/ת Fullstack מנוסה להצטרפות לצוות הליבה שלנו. העבודה כוללת פיתוח פיצ\'רים חדשים מקצה לקצה, תוך שימוש בטכנולוגיות המתקדמות ביותר.',
    requirements: ['5+ שנות ניסיון בפיתוח Web', 'שליטה מעולה ב-React ו-Node.js', 'ניסיון עם TypeScript - יתרון משמעותי', 'ניסיון בעבודה עם Microservices'],
    screeningQuestions: [
        { question: 'מה הניסיון שלך עם מסדי נתונים NoSQL?', answer: '' },
        { question: 'האם עבדת בסביבת CI/CD? אם כן, תאר/י.', answer: '' },
    ]
  },
  { 
    id: 2, 
    company: 'בזק', 
    title: 'מנהל/ת שיווק דיגיטלי', 
    location: 'תל אביב', 
    salary: '18-22k ₪',
    aiMatchScore: 92,
    description: 'ניהול כלל הפעילות הדיגיטלית של החברה, כולל קמפיינים ממומנים, SEO, וניהול נכסים דיגיטליים.',
    requirements: ['4+ שנות ניסיון בניהול שיווק דיגיטלי', 'ניסיון מוכח בניהול תקציבים גדולים', 'שליטה מלאה ב-Google Analytics ו-Google Ads'],
    screeningQuestions: [
      { question: 'מה התקציב הגדול ביותר שניהלת בחודש?', answer: '' },
      { question: 'תאר קמפיין מוצלח במיוחד שהובלת.', answer: '' },
    ]
  },
  { 
    id: 3, 
    company: 'אל-על', 
    title: 'ראש/ת צוות BI', 
    location: 'לוד', 
    salary: '25-28k ₪',
    aiMatchScore: 75,
    description: 'ניהול צוות של 4 אנליסטים, אחריות על פיתוח דשבורדים, ניתוח נתונים עסקיים והצגת תובנות להנהלה.',
    requirements: ['3+ שנות ניסיון בניהול צוות BI', 'שליטה מעולה ב-SQL', 'ניסיון עם כלי ויזואליזציה (Tableau/Power BI)', 'רקע בתחום התעופה - יתרון'],
    screeningQuestions: [
      { question: 'באיזה כלי ויזואליזציה יש לך הכי הרבה ניסיון?', answer: '' },
      { question: 'איך אתה מתמודד עם דרישות אד-הוק מההנהלה?', answer: '' },
    ]
  },
];

const AIMatchScore: React.FC<{ score: number }> = ({ score }) => {
    const scoreColor = score > 85 ? 'text-accent-600' : score > 70 ? 'text-primary-600' : 'text-red-600';
    const bgColor = score > 85 ? 'bg-accent-100/70' : score > 70 ? 'bg-primary-100/70' : 'bg-red-100/70';

    return (
        <div className={`flex items-center justify-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-full ${bgColor} ${scoreColor}`}>
            <SparklesIcon className="w-4 h-4" />
            <span>{score}%</span>
        </div>
    );
};

// Mock Resume Data for the split view
const mockResumeData = {
    name: 'גדעון שפירא',
    contact: 'gidon.shap@email.com | 054-1234567',
    summary: 'מנהל שיווק דיגיטלי עם ניסיון של 5 שנים. מומחה ב-PPC, SEO ואנליטיקה.',
    experience: [
        '<b>מנהל שיווק דיגיטלי, בזק</b><br/>ניהול קמפיינים ותקציבים גדולים.',
        '<b>מנהל PPC, Wix</b><br/>אופטימיזציה לקמפיינים בגוגל ופייסבוק.'
    ]
};

const CandidateScreeningView: React.FC<{ onBack: () => void; }> = ({ onBack }) => {
    const [jobs, setJobs] = useState<ScreeningJob[]>(screeningJobsData);
    const [selectedJobs, setSelectedJobs] = useState<number[]>([]);
    const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

    const handleSelectJob = (jobId: number) => {
        setSelectedJobs(prev => 
            prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedJobs(jobs.map(j => j.id));
        } else {
            setSelectedJobs([]);
        }
    };
    
    const handleRejectSelected = () => {
        if (selectedJobs.length === 0) return;
        if (window.confirm(`האם אתה בטוח שברצונך לשלול את המועמד מ-${selectedJobs.length} המשרות שנבחרו?`)) {
            setJobs(prevJobs => prevJobs.filter(job => !selectedJobs.includes(job.id)));
            setSelectedJobs([]);
            setExpandedJobId(null);
        }
    };

    const allSelected = useMemo(() => jobs.length > 0 && selectedJobs.length === jobs.length, [jobs, selectedJobs]);

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

    return (
        <div className="bg-bg-default h-full flex flex-col -m-6 overflow-hidden relative">
            {/* Header */}
            <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-card flex-shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-4">
                     <button onClick={onBack} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                        <ArrowLeftIcon className="w-6 h-6 transform rotate-180" />
                    </button>
                    <h3 className="text-xl font-bold text-text-default">סינון מועמד</h3>
                </div>
                 {/* Desktop Actions */}
                 <div className="hidden md:flex items-center gap-3">
                    <button
                        onClick={handleRejectSelected}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-lg hover:bg-red-100 transition shadow-sm disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                    >
                        <NoSymbolIcon className="w-5 h-5" />
                        <span>שלול ({selectedJobs.length})</span>
                    </button>
                    
                    <button
                        onClick={() => alert('Sending CV for selected jobs and moving to the next candidate... (simulation)')}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm disabled:bg-primary-300 disabled:cursor-not-allowed"
                    >
                         <span>שלח קו"ח ללקוח ({selectedJobs.length})</span>
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                 </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative flex-row">
                 {/* Right Pane - Jobs List */}
                 {/* RTL: First child is Right. We want Jobs on Right. */}
                 {/* Mobile: Full width (CV hidden). Desktop: Half width. */}
                <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-bg-subtle/30 md:border-l border-border-default">
                     <div className="p-3 border-b border-border-default flex items-center justify-between bg-bg-subtle/50">
                         <h4 className="font-bold text-text-muted text-sm">משרות לבדיקה ({jobs.length})</h4>
                         <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                checked={allSelected}
                                onChange={handleSelectAll}
                                id="select-all-jobs"
                            />
                            <label htmlFor="select-all-jobs" className="text-sm text-text-muted cursor-pointer">בחר הכל</label>
                        </div>
                     </div>
                     
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 md:pb-4">
                        {jobs.map(job => (
                            <div key={job.id} className={`border rounded-lg bg-bg-card transition-all ${expandedJobId === job.id ? 'border-primary-300 shadow-md' : 'border-border-default hover:border-primary-200'}`}>
                                {/* Job Summary */}
                                <div
                                    className="flex items-start gap-3 p-3 cursor-pointer"
                                    onClick={() => setExpandedJobId(prevId => prevId === job.id ? null : job.id)}
                                >
                                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="h-5 w-5 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                            checked={selectedJobs.includes(job.id)}
                                            onChange={() => handleSelectJob(job.id)}
                                        />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                             <div>
                                                <p className="font-bold text-text-default text-base leading-tight">{job.title}</p>
                                                <p className="text-sm text-text-muted">{job.company}</p>
                                             </div>
                                             <AIMatchScore score={job.aiMatchScore} />
                                        </div>
                                        
                                        <div className="flex items-center gap-3 text-xs text-text-subtle mt-2">
                                             <span className="flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> {job.location}</span>
                                             <span>•</span>
                                             <span className="font-medium text-text-default">{job.salary}</span>
                                        </div>
                                    </div>
                                     <div className="self-center pl-1">
                                        <ChevronDownIcon className={`w-5 h-5 text-text-muted transition-transform ${expandedJobId === job.id ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>
                                
                                {/* Expanded Details */}
                                {expandedJobId === job.id && (
                                    <div className="p-4 border-t border-border-default bg-bg-subtle/30 text-sm">
                                        <div className="space-y-4">
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">תיאור המשרה</h5>
                                                <p className="text-text-default leading-relaxed">{job.description}</p>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">דרישות</h5>
                                                <ul className="space-y-1">
                                                    {job.requirements.map((req, i) => (
                                                        <li key={i} className="flex items-start gap-2">
                                                            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                                            <span>{req}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-primary-50/50 p-3 rounded-lg border border-primary-100">
                                                <h5 className="font-bold text-primary-800 mb-2 text-xs uppercase">שאלות סינון</h5>
                                                <div className="space-y-3">
                                                    {job.screeningQuestions.map((sq, i) => (
                                                        <div key={i}>
                                                            <label className="block font-semibold text-text-default mb-1">{sq.question}</label>
                                                            <input type="text" placeholder="תשובת המועמד..." className="w-full bg-white border border-primary-200 rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500"/>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">חוות דעת</h5>
                                                <textarea rows={2} placeholder="רשום הערה פנימית..." className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"></textarea>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Left Pane - CV */}
                {/* Visually LEFT in RTL. Hidden on mobile. */}
                <div className="hidden md:flex w-1/2 bg-bg-card overflow-hidden flex-col">
                     <ResumeViewer resumeData={mockResumeData} className="h-full border-none shadow-none rounded-none" />
                </div>
            </div>

            {/* Mobile Bottom Actions Bar - Only visible on mobile */}
            <div className="md:hidden absolute bottom-0 left-0 right-0 p-4 bg-bg-card border-t border-border-default flex items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                 <button
                    onClick={handleRejectSelected}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl transition active:bg-red-100 disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                >
                    <NoSymbolIcon className="w-5 h-5" />
                    <span>שלול ({selectedJobs.length})</span>
                </button>
                
                <button
                    onClick={() => alert('Sending CV for selected jobs...')}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-xl transition active:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                >
                     <span>שלח ללקוח ({selectedJobs.length})</span>
                    <PaperAirplaneIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default CandidateScreeningView;
