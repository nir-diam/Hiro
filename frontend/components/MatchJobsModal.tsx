import React, { useState, useMemo, useEffect } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, ChevronDownIcon, TargetIcon, PlusIcon, PaperAirplaneIcon, ArrowLeftIcon, CheckCircleIcon } from './Icons';

// --- TYPES ---
type JobStatus = 'פתוחה' | 'מוקפאת';
type JobType = 'מלאה' | 'חלקית' | 'משמרות';
interface JobMatch {
  id: number;
  title: string;
  client: string;
  status: JobStatus;
  location: string;
  jobType: JobType;
  salaryRange: string;
  matchScore: number;
  reasons: string[];
  requirementsMet: boolean;
  matchType: 'application' | 'ai';
}

// --- MOCK DATA ---
const jobMatchesData: JobMatch[] = [
  { id: 1, title: 'מנהל/ת שיווק דיגיטלי', client: 'בזק', status: 'פתוחה', location: 'תל אביב', jobType: 'מלאה', salaryRange: '18-22k ₪', matchScore: 92, reasons: ['5 שנות ניסיון בשיווק דיגיטלי', 'ניסיון מוכח בניהול צוות', 'מגורים במרחק 15 ק"מ'], requirementsMet: true, matchType: 'application' },
  { id: 2, title: 'ראש/ת צוות שיווק', client: 'אל-על', status: 'פתוחה', location: 'לוד', jobType: 'מלאה', salaryRange: '20-25k ₪', matchScore: 85, reasons: ['ניסיון ניהולי מוכח', 'רקע בתחום התעופה - יתרון', 'שליטה באנגלית ברמת שפת אם'], requirementsMet: true, matchType: 'ai' },
  { id: 3, title: 'מנהל/ת קמפיינים PPC', client: 'Wix', status: 'פתוחה', location: 'הרצליה', jobType: 'מלאה', salaryRange: '16-19k ₪', matchScore: 78, reasons: ['ניסיון מעמיק בגוגל אדס', 'היכרות עם שווקים בינלאומיים', 'יכולות אנליטיות גבוהות'], requirementsMet: true, matchType: 'application' },
  { id: 4, title: 'מנהל/ת מותג', client: 'תנובה', status: 'מוקפאת', location: 'רחובות', jobType: 'מלאה', salaryRange: '17-20k ₪', matchScore: 65, reasons: ['ניסיון בתחום ה-FMCG', 'יכולת עבודה תחת לחץ'], requirementsMet: true, matchType: 'ai' },
  { id: 5, title: 'מומחה/ית SEO', client: 'Zap Group', status: 'פתוחה', location: 'פתח תקווה', jobType: 'חלקית', salaryRange: '12-15k ₪', matchScore: 45, reasons: ['חסר ניסיון משמעותי ב-SEO טכני', 'ציפיות שכר גבוהות מהטווח'], requirementsMet: false, matchType: 'application' },
];


// --- SUB-COMPONENTS ---
const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void }> = ({ title, isActive, onClick }) => (
    <button onClick={onClick} className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${isActive ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
        {title}
    </button>
);

const MatchProgressBar: React.FC<{ score: number }> = ({ score }) => {
    const color = score > 75 ? 'bg-emerald-500' : score > 50 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="w-full bg-gray-200 rounded-full h-2">
            <div className={`${color} h-2 rounded-full`} style={{ width: `${score}%` }}></div>
        </div>
    );
};

const JobCard: React.FC<{ job: JobMatch }> = ({ job }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start">
            <div>
                <h4 className="font-bold text-gray-800">{job.title}</h4>
                <p className="text-sm text-gray-600">{job.client} <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{job.status}</span></p>
            </div>
            <div className="text-right">
                <div className="font-bold text-lg">{job.matchScore}%</div>
                <p className={`text-xs font-semibold ${job.requirementsMet ? 'text-green-600' : 'text-red-600'}`}>{job.requirementsMet ? 'עבר תנאי סף' : 'לא עומד בדרישות'}</p>
            </div>
        </div>
        <MatchProgressBar score={job.matchScore} />
        <div>
            <p className="text-xs text-gray-500">{job.location} | {job.jobType} | {job.salaryRange}</p>
        </div>
        <div>
            <h5 className="text-xs font-semibold text-gray-500 mb-1">סיבות להתאמה:</h5>
            <ul className="list-none space-y-1 text-xs text-gray-700">
                {job.reasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1.5"><CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />{reason}</li>
                ))}
            </ul>
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button className="text-gray-600 font-semibold py-1 px-3 text-sm rounded-md hover:bg-gray-100 transition">צפה בפרטים</button>
            <button className="bg-purple-500 text-white font-semibold py-1 px-3 text-sm rounded-md hover:bg-purple-600 transition flex items-center gap-1"><PlusIcon className="w-4 h-4" /> שייך למשרה</button>
        </div>
    </div>
);


// --- MAIN MODAL COMPONENT ---
interface MatchJobsModalProps {
  onClose: () => void;
  candidateName: string;
}

const MatchJobsModal: React.FC<MatchJobsModalProps> = ({ onClose, candidateName }) => {
    const [activeTab, setActiveTab] = useState<'application' | 'ai'>('application');
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [scoreFilter, setScoreFilter] = useState(50);
    const [jobTypeFilter, setJobTypeFilter] = useState<JobType | 'הכל'>('הכל');

    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const filteredJobs = useMemo(() => {
        return jobMatchesData
            .filter(job => job.matchType === activeTab)
            .filter(job => job.title.toLowerCase().includes(searchTerm.toLowerCase()) || job.client.toLowerCase().includes(searchTerm.toLowerCase()))
            .filter(job => job.matchScore >= scoreFilter)
            .filter(job => jobTypeFilter === 'הכל' || job.jobType === jobTypeFilter);
    }, [activeTab, searchTerm, scoreFilter, jobTypeFilter]);
    
    const passedCount = filteredJobs.filter(j => j.requirementsMet).length;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <header className="p-4 border-b border-gray-200 bg-white">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">התאמות משרות ל{candidateName}</h2>
                            <p className="text-sm text-gray-500">משרות רלוונטיות לפי תחום הפנייה ופרופיל ה-AI של המועמד.</p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-gray-100" aria-label="סגור"><XMarkIcon className="w-6 h-6" /></button>
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center border-b border-gray-200">
                            <TabButton title="לפי פנייה" isActive={activeTab === 'application'} onClick={() => setActiveTab('application')} />
                            <TabButton title="לפי פרופיל AI" isActive={activeTab === 'ai'} onClick={() => setActiveTab('ai')} />
                        </div>
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                            <input type="text" placeholder="חיפוש משרה או לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-64 bg-white border border-gray-300 rounded-lg py-2 pl-3 pr-10 text-sm" />
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Summary & Filters */}
                    <div className="bg-white p-3 rounded-lg border border-gray-200 sticky top-0 z-10">
                        <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold text-gray-600">
                                נמצאו <span className="text-purple-600">{filteredJobs.length}</span> משרות | <span className="text-green-600">{passedCount}</span> עברו תנאי סף
                            </div>
                            <button onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} className="text-sm font-semibold text-purple-600 flex items-center gap-1">
                                <span>חיפוש מתקדם</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        {isAdvancedSearchOpen && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">ציון התאמה מינימלי: {scoreFilter}%</label>
                                    <input type="range" min="0" max="100" value={scoreFilter} onChange={e => setScoreFilter(Number(e.target.value))} className="w-full accent-purple-500"/>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 mb-1">סוג משרה</label>
                                    <select value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value as any)} className="w-full p-2 border border-gray-300 rounded-md text-sm">
                                        <option value="הכל">הכל</option>
                                        <option value="מלאה">מלאה</option>
                                        <option value="חלקית">חלקית</option>
                                        <option value="משמרות">משמרות</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Job List */}
                    {filteredJobs.length > 0 ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredJobs.map(job => <JobCard key={job.id} job={job} />)}
                        </div>
                    ) : (
                        <div className="text-center py-16 flex flex-col items-center">
                            <TargetIcon className="w-16 h-16 text-gray-300 mb-4"/>
                            <h3 className="text-xl font-bold text-gray-700">לא נמצאו משרות מתאימות</h3>
                            <p className="mt-2 text-gray-500">נסה להרחיב את החיפוש או לשנות את הקריטריונים.</p>
                        </div>
                    )}
                </main>
                
                {/* Footer */}
                <footer className="p-3 bg-white border-t border-gray-200 flex justify-end">
                     <button disabled className="bg-purple-300 text-white font-semibold py-2 px-5 rounded-lg transition shadow-sm cursor-not-allowed">בצע שיוך מרוכז (0)</button>
                </footer>
            </div>
        </div>
    );
};

export default MatchJobsModal;