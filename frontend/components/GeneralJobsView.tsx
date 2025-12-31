
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, MapPinIcon, BriefcaseIcon, TagIcon, FunnelIcon, BookmarkIcon, BellIcon, XMarkIcon, ClockIcon, CheckCircleIcon, SparklesIcon, ArrowLeftIcon, UserCircleIcon, BuildingOffice2Icon, CalendarDaysIcon, WalletIcon, PaperAirplaneIcon, ChevronDownIcon } from './Icons';
import JobDetailsDrawer from './JobDetailsDrawer';
import { Job, jobsData as allJobsData } from './JobsView';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { JobAlertModalConfig } from './CreateJobAlertModal';
import ApplyModal from './ApplyModal';
import CVUploadModal from './CVUploadModal';
import LocationSelector, { LocationItem } from './LocationSelector';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';


// --- MOCK DATA --- (Enriched for new filters)
interface EnrichedJob extends Job {
    tags: string[];
    postedDate: string;
    logo: string;
    workModel?: 'office' | 'hybrid' | 'remote';
    experienceRequired: string;
    isPromoted?: boolean;
}

const mockJobsData: EnrichedJob[] = [
    { ...allJobsData[0], workModel: 'hybrid', isPromoted: true } as EnrichedJob, 
    { ...allJobsData[1], workModel: 'office', isPromoted: false } as EnrichedJob, 
    { ...allJobsData[2], workModel: 'remote', isPromoted: true } as EnrichedJob,
    { ...allJobsData[3], workModel: 'hybrid', isPromoted: false } as EnrichedJob,
    { ...allJobsData[5], workModel: 'office', isPromoted: false } as EnrichedJob, // Data Analyst
    { ...allJobsData[4], workModel: 'hybrid', isPromoted: false } as EnrichedJob, // QA
].map((job, index) => {
    // Correcting data to match screenshots
    switch(index) {
        case 0: 
            job.client = 'Google'; 
            job.title = 'מפתח/ת Frontend בכיר/ה'; 
            job.description = `**תיאור המשרה**
בוא/י להצטרף לצוות שלנו ולעבוד על טכנולוגיות ווב מהשורה הראשונה. אנחנו מחפשים מפתח/ת עם ניסיון שיעזור/תעזור לנו לבנות את הדור הבא של המוצרים של Google.

**תחומי אחריות**
• פיתוח פיצ'רים מורכבים ב-React.
• הובלת תהליכי Code Review ושיפור ארכיטקטורה.
• עבודה צמודה עם מעצבים ומנהלי מוצר.

**דרישות**
• ניסיון של 5 שנים לפחות עם React, Redux, ו-JavaScript מודרני (ES6+).
• ידע מעמיק ב-TypeScript וארכיטקטורה מבוססת קומפוננטות.
• ניסיון עם GraphQL, Next.js, ו-Server-Side Rendering - יתרון.
• היכרות עם ספריות בדיקה כמו Jest ו-React Testing Library.`;
            job.tags = ['React', 'TypeScript', 'GraphQL'];
            job.postedDate = 'לפני יומיים';
            job.logo = 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg';
            job.experienceRequired = '5+ שנים';
            job.jobType = 'משרה מלאה';
            job.location = 'תל אביב';
            break;
        case 1: 
            job.client = 'Facebook';
            job.title = 'מנהל/ת שיווק';
            job.description = `**תיאור המשרה**
בוא/י להוביל את קמפייני השיווק שלנו ולהצמיח את בסיס המשתמשים במגוון פלטפורמות. התפקיד כולל אחריות על אסטרטגיה, ניהול תקציב והובלת צוות.

**דרישות**
• ניסיון של 3-5 שנים בשיווק ברשתות חברתיות ואסטרטגיית תוכן.
• יכולות אנליטיות חזקות ושליטה בכלי אנליטיקה.
• רקורד מוכח של קמפיינים מוצלחים וגיוס משתמשים.
• ניסיון בניהול תקציב שיווק וצוות קטן.`;
            job.tags = ['Social Media', 'Marketing', 'PPC'];
            job.postedDate = 'לפני 5 ימים';
            job.logo = 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg';
            job.experienceRequired = '3-5 שנים';
            job.jobType = 'משרה מלאה';
            job.location = 'תל אביב';
            break;
        case 2: 
            job.client = 'Wix';
            job.title = 'מעצב/ת UX/UI';
            job.description = `**תיאור המשרה**
בוא/י לעצב ממשקי משתמש יפים ואינטואיטיביים עבור מיליוני המשתמשים שלנו ברחבי העולם. הצטרפ/י לצוות דינמי של מעצבים שמעצבים את עתיד הרשת.

**דרישות**
• תיק עבודות מרשים המציג את הכישורים שלך.
• שליטה ב-Figma, Sketch וכלי עיצוב נוספים.
• ניסיון במחקר משתמשים, Wireframing ו-Prototyping.
• יכולת ליצור ולתחזק Design System.`;
            job.tags = ['UI', 'UX', 'Figma'];
            job.postedDate = 'לפני שבוע';
            job.logo = 'https://cdn-assets-cloud.frontify.com/s3/frontify-cloud-files-us/eyJwYXRoIjoiZnJvbnRpZnlcL2FjY291bnRzXC8xZlwvMTk0MjMzXC9wcm9qZWN0c1wvMjc5NTgxXC9hc3NldHNcL2I2XC8zNzg4MjM0XC82YjE5YjEwMjgyYWQ2ZmFkYjYwZTdjMjg0Mjg2MTE0ZC0xNTg0MDMyMTE1LnN2ZyJ9:frontify:L6d-5I852K4sZqtg1fBnCEa-2wQ6aQo0432p5Lut0o4?width=256';
            job.experienceRequired = '2+ שנים';
            job.jobType = 'משרה חלקית';
            job.location = 'חיפה';
            break;
        case 3: 
            job.client = 'Playtika';
            job.title = 'אנליסט/ית נתונים';
            job.location = 'הרצליה';
            job.description = `**תיאור המשרה**
ניתוח מאגרי נתונים גדולים ומורכבים כדי לספק תובנות עסקיות שיניעו החלטות בסטודיו המשחקים שלנו.

**דרישות**
• ניסיון של 3 שנים לפחות כאנליסט/ית נתונים, עדיפות לתעשיית הגיימינג או המובייל.
• שליטה מעולה ב-SQL וניסיון עם מחסני נתונים גדולים (BigQuery, Redshift וכו').
• ניסיון עם כלי ויזואליזציה BI כמו Tableau או Looker.
• ידע סטטיסטי וניסיון עם Python או R - יתרון משמעותי.`;
            job.tags = ['SQL', 'Tableau', 'Python'];
            job.postedDate = 'לפני 3 שעות';
            job.logo = 'https://playtika.com/wp-content/uploads/2021/01/logo.svg';
            job.experienceRequired = '3+ שנים';
            job.jobType = 'משרה מלאה';
            break;
        case 4:
            job.client = 'תמנב';
            job.title = 'נציג/ת מכירות שטח';
            job.location = 'אזור המרכז';
            job.description = `**תיאור המשרה**
אנחנו מחפשים נציג/ת מכירות שטח עם אנרגיה ורעב להצלחה, שיצטרף/תצטרף לצוות הצומח שלנו וינהל/תנהל את פעילות המכירות באזור המרכז.

**דרישות**
• ניסיון מוכח של 1-2 שנים במכירות שטח (עדיפות ל-B2B).
• יכולות תקשורת, ניהול משא ומתן ויחסי אנוש מעולים.
• יכולת עבודה עצמאית ועמידה ביעדי מכירות.
• רישיון נהיגה בתוקף - חובה.`;
            job.tags = ['מכירות שטח', 'B2B'];
            job.postedDate = 'היום';
            job.logo = 'https://www.tmnv.co.il/images/logo_tmnv.png';
            job.experienceRequired = '1-2 שנים';
            job.jobType = 'משרה מלאה';
            break;
        case 5:
            job.client = 'אלביט מערכות';
            job.title = 'בודק/ת תוכנה QA';
            job.location = 'חיפה';
            job.description = `**תיאור המשרה**
הצטרפ/י לצוות ה-QA שלנו כדי להבטיח את האיכות והאמינות של המערכות הביטחוניות המתקדמות שלנו. התפקיד כולל בדיקות ידניות, כתיבת מסמכי בדיקה ועבודה צמודה עם צוותי הפיתוח.

**דרישות**
• ניסיון של שנתיים לפחות בבדיקות תוכנה ידניות.
• ניסיון בכתיבת מסמכי STD, STP, ו-STR.
• היכרות עם מתודולוגיות בדיקה ומחזור חיים של באגים.
• ניסיון עם מערכות ניהול באגים כמו Jira - יתרון.`;
            job.tags = ['QA', 'Manual Testing', 'Jira'];
            job.postedDate = 'אתמול';
            job.logo = 'https://elbitsystems.com/media/Elbit-Systems-Logo_5-29.jpg';
            job.experienceRequired = '2+ שנים';
            job.jobType = 'משרה מלאה';
            break;
    }
    return job;
});


const JobListItem: React.FC<{ job: EnrichedJob; onClick: () => void; isActive: boolean; isSaved: boolean; onSave: (e: React.MouseEvent) => void }> = ({ job, onClick, isActive, isSaved, onSave }) => {
    const isNew = job.postedDate === 'היום' || job.postedDate.includes('שעות') || job.postedDate === 'אתמול' || job.postedDate === 'לפני יומיים';
    
    return (
        <div onClick={onClick} className={`relative bg-bg-card rounded-2xl border transition-all duration-300 cursor-pointer group 
            ${isActive 
                ? 'border-primary-500 shadow-md ring-1 ring-primary-500 bg-primary-50/10' 
                : job.isPromoted 
                    ? 'border-amber-200 bg-amber-50/20 hover:border-primary-300 hover:shadow-md' 
                    : 'border-border-default hover:border-primary-300 hover:shadow-md'
            }
        `}>
            {/* Badges */}
            <div className="absolute top-4 left-4 flex flex-col items-end gap-1.5 z-10">
                 {isNew && <div className="text-[10px] font-bold bg-accent-500 text-white px-2 py-0.5 rounded-full shadow-sm">חדשה</div>}
                 {job.isPromoted && !isNew && <div className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200"><SparklesIcon className="w-3 h-3"/> מקודמת</div>}
            </div>

            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-border-default p-1 flex-shrink-0 bg-white shadow-sm flex items-center justify-center">
                         <img src={job.logo} alt={`${job.client} logo`} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-grow min-w-0 pt-0.5">
                        <div className="flex justify-between items-start">
                             <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1">{job.client}</p>
                        </div>
                        <h3 className="font-bold text-base sm:text-lg text-text-default leading-snug group-hover:text-primary-700 transition-colors truncate mb-1">{job.title}</h3>
                        
                         <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-subtle">
                            <span className="flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5"/> {job.location}</span>
                            <span className="flex items-center gap-1"><BriefcaseIcon className="w-3.5 h-3.5"/> {Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType}</span>
                             {job.salaryMin > 0 && <span className="flex items-center gap-1 hidden sm:flex"><WalletIcon className="w-3.5 h-3.5"/> {Math.floor(job.salaryMin/1000)}k - {Math.floor(job.salaryMax/1000)}k</span>}
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {job.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[11px] font-medium bg-bg-subtle text-text-muted px-2 py-1 rounded-md border border-border-default">{tag}</span>
                    ))}
                </div>
            </div>
            
            <div className="px-4 pb-3 flex justify-between items-center text-xs text-text-subtle border-t border-border-subtle/50 pt-2 mx-1">
                 <span className="flex items-center gap-1">
                     <ClockIcon className="w-3.5 h-3.5" />
                     {job.postedDate}
                 </span>
                 <button 
                    onClick={onSave} 
                    className={`p-1.5 rounded-full transition-colors ${isSaved ? 'text-primary-600 bg-primary-50' : 'text-text-subtle hover:text-primary-600 hover:bg-bg-subtle'}`}
                    title={isSaved ? "הסר שמירה" : "שמור משרה"}
                >
                    {isSaved ? <BookmarkIcon className="w-4 h-4 fill-current"/> : <BookmarkIcon className="w-4 h-4"/>}
                </button>
            </div>
        </div>
    );
};

const JobDetailView: React.FC<{ job: EnrichedJob; onClose: () => void; onApplyClick: () => void; }> = ({ job, onClose, onApplyClick }) => {
    
    // Parse description to structured data if possible, otherwise use heuristic splitting
    const sections = useMemo(() => {
        const parts = job.description.split('**');
        const content = [];
        
        if (parts.length === 1) {
            return [{ title: 'תיאור המשרה', content: job.description }];
        }

        for (let i = 1; i < parts.length; i += 2) {
            if (parts[i+1]) {
                content.push({
                    title: parts[i].trim(),
                    content: parts[i+1].trim()
                });
            }
        }
        return content;
    }, [job.description]);

    return (
        <div className="relative h-full flex flex-col bg-bg-default md:bg-white overflow-hidden">
            {/* Desktop Header Overlay (Gradient) */}
            <div className="relative h-24 sm:h-32 bg-gradient-to-r from-primary-600 to-primary-800 flex-shrink-0">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 text-white rounded-full transition-colors z-20 lg:hidden backdrop-blur-md">
                    <XMarkIcon className="w-5 h-5"/>
                </button>
            </div>

            {/* Content Container - Overlaps header */}
            {/* Added pt-14 (mobile) to ensure logo isn't clipped by overflow-y-auto when using negative margins */}
            <div className="flex-grow flex flex-col relative -mt-12 sm:-mt-16 px-4 sm:px-6 pb-20 sm:pb-6 overflow-y-auto custom-scrollbar pt-14 sm:pt-6">
                
                {/* Job Header Card */}
                <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-5 sm:p-6 pt-12 sm:pt-6 mb-6 relative flex flex-col sm:block items-center sm:items-start text-center sm:text-right mt-0">
                    
                    {/* Logo - Centered on Mobile, Top Right on Desktop */}
                    {/* Positioned absolutely relative to the card. 
                        Because we added padding-top to the scroll container, this negative top margin won't be clipped. */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-6">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-4 border-bg-card shadow-md bg-white flex items-center justify-center p-2">
                             <img src={job.logo} alt={job.client} className="max-w-full max-h-full object-contain" />
                        </div>
                    </div>
                    
                    <div className="mt-8 sm:mt-12">
                        <h1 className="text-xl sm:text-2xl font-extrabold text-text-default leading-tight">{job.title}</h1>
                        <p className="text-base text-text-muted font-semibold mt-1 mb-4">{job.client}</p>
                        
                        <div className="flex flex-wrap gap-3 text-sm justify-center sm:justify-start">
                            <div className="flex items-center gap-1.5 text-text-default bg-bg-subtle px-3 py-1.5 rounded-lg border border-border-default">
                                <MapPinIcon className="w-4 h-4 text-text-subtle" />
                                <span>{job.location}</span>
                            </div>
                             <div className="flex items-center gap-1.5 text-text-default bg-bg-subtle px-3 py-1.5 rounded-lg border border-border-default">
                                <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                                <span>{Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType}</span>
                            </div>
                             <div className="flex items-center gap-1.5 text-text-default bg-bg-subtle px-3 py-1.5 rounded-lg border border-border-default">
                                <WalletIcon className="w-4 h-4 text-text-subtle" />
                                <span>{job.salaryMin ? `${(job.salaryMin/1000)}k - ${(job.salaryMax/1000)}k` : 'לא צוין'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Job Description Sections */}
                 <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-5 sm:p-8 space-y-8 mb-24 lg:mb-0">
                    {sections.map((section, idx) => (
                        <div key={idx} className="animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                            <h3 className="text-lg font-bold text-text-default mb-3 flex items-center gap-2">
                                <div className="w-1 h-6 bg-primary-500 rounded-full"></div>
                                {section.title}
                            </h3>
                            <div className="text-text-default leading-relaxed whitespace-pre-line text-sm md:text-base pl-0 md:pl-3 md:border-r-2 md:border-border-subtle md:mr-1">
                                {section.content}
                            </div>
                        </div>
                    ))}

                    <div className="pt-6 border-t border-border-default">
                        <h3 className="text-lg font-bold text-text-default mb-3">תגיות וכישורים</h3>
                         <div className="flex flex-wrap gap-2">
                            {job.tags.map(tag => (
                                <span key={tag} className="bg-primary-50 text-primary-700 border border-primary-100 text-sm font-semibold px-3 py-1.5 rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                 </div>
            </div>

            {/* Sticky Bottom Action Bar (Mobile & Desktop) */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-border-default z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex items-center gap-3">
                 <button className="p-3 rounded-xl border border-border-default hover:bg-bg-subtle text-text-muted transition-colors hidden sm:block">
                    <BookmarkIcon className="w-6 h-6" />
                 </button>
                <button 
                    onClick={onApplyClick} 
                    className="flex-grow bg-primary-600 text-white font-bold py-3.5 rounded-xl hover:bg-primary-700 transition-all transform active:scale-[0.98] shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 text-base"
                >
                    <PaperAirplaneIcon className="w-5 h-5 transform rotate-180" />
                    הגש מועמדות למשרה
                </button>
            </div>
        </div>
    )
};

const FeaturedCompaniesWidget: React.FC = () => {
    const companies = [
        { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg' },
        { name: 'Facebook', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg' },
        { name: 'Wix', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Wix.com_website_logo.svg' },
        { name: 'Microsoft', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg' },
        { name: 'Monday', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3a/Monday_logo.svg' },
        { name: 'Intel', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Intel-logo.svg' },
        { name: 'Nvidia', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/21/Nvidia_logo.svg' },
    ];

    return (
        <div className="mb-6 overflow-hidden">
            <h3 className="text-sm font-bold text-text-muted mb-3 px-1">חברות מובילות שמגייסות עכשיו</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 px-1">
                {companies.map((company, index) => (
                    <div key={index} className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-20 bg-bg-card border border-border-default rounded-xl flex items-center justify-center p-3 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer">
                         <img src={company.logo} alt={company.name} className="max-w-full max-h-full object-contain filter grayscale hover:grayscale-0 transition-all" />
                    </div>
                ))}
            </div>
        </div>
    );
};

const PromoBanner: React.FC<{ onUploadClick: () => void }> = ({ onUploadClick }) => (
    <div className="relative bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl p-6 mb-6 text-white shadow-lg overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
         <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
            <div>
                <h3 className="text-xl font-extrabold mb-1 text-white">מחפש את האתגר הבא?</h3>
                <p className="text-primary-100 text-sm">הצטרף למאגר המועמדים שלנו ותן למגייסים למצוא אותך.</p>
            </div>
            <button 
                onClick={onUploadClick}
                className="bg-white text-primary-700 font-bold py-2.5 px-6 rounded-lg shadow-md hover:bg-primary-50 transition-colors whitespace-nowrap"
            >
                העלה קורות חיים
            </button>
         </div>
    </div>
);

interface GeneralJobsViewProps {
    openJobAlertModal: (config: JobAlertModalConfig) => void;
}

const GeneralJobsView: React.FC<GeneralJobsViewProps> = ({ openJobAlertModal }) => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    
    // --- State for Filters ---
    const [locations, setLocations] = useState<LocationItem[]>([]);
    const [jobType, setJobType] = useState('');
    const [workModel, setWorkModel] = useState<'all' | 'office' | 'hybrid' | 'remote'>('all');
    const [selectedRole, setSelectedRole] = useState('');
    const [isJobFieldOpen, setIsJobFieldOpen] = useState(false);

    const [savedJobs, setSavedJobs] = useState<Set<number>>(new Set());
    const [selectedJob, setSelectedJob] = useState<EnrichedJob | null>(null);
    
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [applyingForJob, setApplyingForJob] = useState<EnrichedJob | null>(null);
    const [applicationSuccess, setApplicationSuccess] = useState<string | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    const handleWorkModelChange = (model: 'all' | 'office' | 'hybrid' | 'remote') => {
        setWorkModel(model);
    };

    const handleJobFieldChange = (field: SelectedJobField | null) => {
        if (field) {
            setSelectedRole(field.role);
            // Optionally auto-search based on role
            setSearchTerm(field.role);
        }
        setIsJobFieldOpen(false);
    };

    const handleSaveJob = (e: React.MouseEvent, jobId: number) => {
        e.stopPropagation();
        setSavedJobs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(jobId)) {
                newSet.delete(jobId);
            } else {
                newSet.add(jobId);
            }
            return newSet;
        });
    };

    const handleCreateAlert = () => {
        const currentFilters = { 
            searchTerm, 
            location: locations.map(l => l.value).join(', '),
            jobType,
            workModel
        };
        openJobAlertModal({ mode: 'create', currentFilters });
    };

    const handleOpenApplyModal = () => {
        if (selectedJob) {
            setApplyingForJob(selectedJob);
            setIsApplyModalOpen(true);
        }
    };
    
    const handleCloseApplyModal = () => {
        setIsApplyModalOpen(false);
        setApplyingForJob(null);
    };

    const handleApplySubmit = (applicationData: { jobTitle: string; }) => {
        handleCloseApplyModal();
        setApplicationSuccess(`המועמדות שלך למשרת "${applicationData.jobTitle}" נשלחה בהצלחה!`);
        setTimeout(() => {
            setApplicationSuccess(null);
        }, 5000);
    };

    const handleUploadSuccess = (data: any) => {
        setIsUploadModalOpen(false);
        navigate('/candidate-portal/profile', { state: { candidateData: data } });
    };

    const filteredJobs = useMemo(() => {
        return mockJobsData.filter(job => {
            const matchesSearch = searchTerm.trim() === '' || 
                job.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                job.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                job.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesLocation = locations.length === 0 || 
                locations.some(loc => {
                    if (loc.type === 'city') return job.location.includes(loc.value);
                    if (loc.type === 'radius') return true; 
                    return true; 
                });

            const jobTypesArray = Array.isArray(job.jobType) ? job.jobType : [job.jobType];
            const matchesJobType = jobType.trim() === '' || 
                jobTypesArray.some(t => t.toLowerCase().includes(jobType.toLowerCase()));
            const matchesWorkModel = workModel === 'all' || job.workModel === workModel;
            const matchesRole = !selectedRole || job.title.toLowerCase().includes(selectedRole.toLowerCase());

            return matchesSearch && matchesLocation && matchesJobType && matchesWorkModel && matchesRole;
        });
    }, [searchTerm, locations, jobType, workModel, selectedRole]);
    
    return (
        <div className="flex flex-col h-full bg-bg-default sm:bg-transparent">
             <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
             `}</style>
             
             {/* Header Bar */}
             <div className="flex justify-between items-center px-4 py-3 bg-bg-card border-b border-border-default mb-0 sm:mb-4 rounded-none sm:rounded-xl shadow-sm flex-shrink-0 sticky top-0 z-20 sm:static">
                 <div className="text-lg font-bold text-text-default flex items-center gap-2">
                     <BriefcaseIcon className="w-6 h-6 text-primary-600"/>
                     <span>לוח משרות</span>
                 </div>
                 <div className="flex items-center gap-3">
                     <button 
                         onClick={() => navigate('/candidate-portal/register')}
                         className="text-sm font-semibold text-text-muted hover:text-primary-600 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-bg-hover transition"
                     >
                         <UserCircleIcon className="w-5 h-5"/>
                         <span className="hidden sm:inline">יצירת פרופיל / כניסה</span>
                     </button>
                     <div className="h-6 w-px bg-border-default mx-1 hidden sm:block"></div>
                     <button 
                         onClick={() => navigate('/post-job')}
                         className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm text-sm"
                     >
                         <SparklesIcon className="w-4 h-4" />
                         <span className="hidden sm:inline">פרסם משרה</span>
                         <span className="sm:hidden">פרסם</span>
                     </button>
                 </div>
             </div>

             {applicationSuccess && (
                <div className="fixed top-24 right-6 bg-accent-500 text-white py-3 px-5 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-fade-in">
                    <CheckCircleIcon className="w-6 h-6" />
                    <span className="font-semibold">{applicationSuccess}</span>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden relative">
                
                {/* Right Pane: List & Filters */}
                <div className="w-full lg:w-2/5 xl:w-1/3 flex flex-col gap-4 h-full overflow-hidden bg-bg-default sm:bg-transparent">
                    
                    <div className="flex-shrink-0 space-y-4 px-4 sm:px-0 sm:pr-2 overflow-y-auto custom-scrollbar" style={{maxHeight: '100%'}}>
                        <div className="hidden sm:block"><FeaturedCompaniesWidget /></div>
                        <div className="hidden sm:block"><PromoBanner onUploadClick={() => setIsUploadModalOpen(true)} /></div>

                        <div className="bg-bg-card rounded-2xl shadow-sm p-4 space-y-4 border border-border-default relative z-10">
                            <div className="flex flex-col gap-3">
                                <div className="relative flex-grow">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="חיפוש משרה, חברה או מילות מפתח..." 
                                        className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-4 pr-12 text-base focus:ring-primary-500 focus:border-primary-300 transition shadow-sm"
                                    />
                                </div>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                    <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="flex items-center justify-center gap-2 font-semibold py-2 px-4 rounded-xl border bg-bg-card text-text-default border-border-default hover:border-primary-300 transition shrink-0 text-sm whitespace-nowrap">
                                        <FunnelIcon className="w-4 h-4"/>
                                        <span>סינון</span>
                                    </button>
                                     {/* Quick Filters for Mobile */}
                                    <button onClick={() => handleWorkModelChange('hybrid')} className={`px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap transition-colors ${workModel === 'hybrid' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted'}`}>היברידי</button>
                                    <button onClick={() => setJobType('משרה מלאה')} className={`px-4 py-2 rounded-xl text-sm font-medium border whitespace-nowrap transition-colors ${jobType === 'משרה מלאה' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-border-default text-text-muted'}`}>משרה מלאה</button>
                                </div>
                            </div>

                            {/* Expanded Filters Section */}
                            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isFilterOpen ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                                <div className="pt-4 border-t border-border-default space-y-4">
                                    <div className="grid grid-cols-1 gap-4">
                                        
                                        {/* Job Field Selector */}
                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">תחום משרה</label>
                                            <button 
                                                onClick={() => setIsJobFieldOpen(true)}
                                                className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm flex justify-between items-center text-right hover:border-primary-300 transition-colors"
                                            >
                                                <span className="truncate">{selectedRole || 'בחר תפקיד/תחום...'}</span>
                                                <BriefcaseIcon className="w-4 h-4 text-text-muted" />
                                            </button>
                                        </div>

                                        {/* Location Selector */}
                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">מיקום</label>
                                            <LocationSelector 
                                                selectedLocations={locations} 
                                                onChange={setLocations} 
                                                placeholder="בחר עיר, אזור או רדיוס..."
                                                className="w-full"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">היקף משרה</label>
                                            <select name="jobType" value={jobType} onChange={(e) => setJobType(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm">
                                                <option value="">הכל</option>
                                                <option value="משרה מלאה">משרה מלאה</option>
                                                <option value="משרה חלקית">משרה חלקית</option>
                                                <option value="סטודנט">משרת סטודנט</option>
                                                <option value="פרילנס">פרילנס</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">מודל עבודה</label>
                                        <div className="flex items-center gap-1 bg-bg-subtle p-1 rounded-lg overflow-x-auto no-scrollbar">
                                            {['all', 'office', 'hybrid', 'remote'].map((model) => (
                                                <button 
                                                    key={model}
                                                    onClick={() => handleWorkModelChange(model as any)} 
                                                    className={`flex-1 py-1.5 px-3 text-sm font-semibold rounded-md transition whitespace-nowrap ${workModel === model ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                                                >
                                                    {{all: 'הכל', office: 'מהמשרד', hybrid: 'היברידי', remote: 'מהבית'}[model]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center px-1">
                            <p className="text-sm font-semibold text-text-muted">מציג {filteredJobs.length} משרות</p>
                            <button onClick={handleCreateAlert} className="flex items-center gap-2 text-sm font-semibold text-primary-600 hover:underline">
                                <BellIcon className="w-4 h-4"/>
                                <span className="hidden sm:inline">צור התראת משרות</span>
                                <span className="sm:hidden">התראה</span>
                            </button>
                        </div>
                        
                        <div className="space-y-4 pb-20 sm:pb-6">
                            {filteredJobs.map(job => (
                            <JobListItem
                                key={job.id}
                                job={job}
                                onClick={() => setSelectedJob(job)}
                                isActive={selectedJob?.id === job.id}
                                isSaved={savedJobs.has(job.id)}
                                onSave={(e) => handleSaveJob(e, job.id)}
                            />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Left Pane: Details Overlay for Mobile / Side Pane for Desktop */}
                {selectedJob && (
                    <div className="fixed inset-0 z-50 lg:static lg:flex-grow lg:z-0 flex flex-col bg-bg-default lg:bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-border-default lg:overflow-hidden animate-slide-up lg:animate-none">
                        <JobDetailView job={selectedJob} onClose={() => setSelectedJob(null)} onApplyClick={handleOpenApplyModal} />
                    </div>
                )}
                
                 {/* Desktop placeholder if no job selected */}
                {!selectedJob && (
                     <div className="hidden lg:flex flex-grow flex-col items-center justify-center h-full text-center text-text-muted p-8 bg-bg-subtle/30 rounded-2xl border border-dashed border-border-default">
                        <div className="bg-bg-subtle p-6 rounded-full mb-4">
                            <BriefcaseIcon className="w-16 h-16 text-text-subtle opacity-50" />
                        </div>
                        <h2 className="text-xl font-bold text-text-default">בחר משרה מהרשימה</h2>
                        <p className="mt-2 max-w-xs text-text-muted">לחץ על משרה כדי לראות את הפרטים המלאים, הדרישות ואפשרויות ההגשה.</p>
                    </div>
                )}
            </div>
            
            <ApplyModal
                isOpen={isApplyModalOpen}
                onClose={handleCloseApplyModal}
                onApply={handleApplySubmit}
                job={applyingForJob}
            />

            <CVUploadModal 
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
                onUploadSuccess={handleUploadSuccess}
            />

            <JobFieldSelector 
                onChange={handleJobFieldChange}
                isModalOpen={isJobFieldOpen}
                setIsModalOpen={setIsJobFieldOpen}
            />
        </div>
    );
};

export default GeneralJobsView;