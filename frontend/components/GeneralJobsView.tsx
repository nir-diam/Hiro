
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, MapPinIcon, BriefcaseIcon, TagIcon, FunnelIcon, BookmarkIcon, BellIcon, XMarkIcon, ClockIcon, CheckCircleIcon, SparklesIcon, ArrowLeftIcon, UserCircleIcon, BuildingOffice2Icon } from './Icons';
import JobDetailsDrawer from './JobDetailsDrawer';
import { Job, jobsData as allJobsData } from './JobsView';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { JobAlertModalConfig } from './CreateJobAlertModal';
import ApplyModal from './ApplyModal';
import CVUploadModal from './CVUploadModal';


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
    const descriptionSnippet = job.description.split('\n').find(line => line.trim() && !line.trim().startsWith('•') && !line.trim().startsWith('**')) || job.description.split('\n')[0];

    return (
        <div onClick={onClick} className={`relative bg-bg-card rounded-xl border-2 transition-all duration-300 cursor-pointer group ${isActive ? 'border-primary-500 shadow-lg' : job.isPromoted ? 'border-amber-300 bg-amber-50/30 hover:border-primary-300 hover:shadow-md' : 'border-border-default hover:border-primary-300 hover:shadow-md'}`}>
            {isNew && <div className="absolute top-3 left-3 text-xs font-bold bg-accent-500 text-white px-2 py-0.5 rounded-full z-10">חדשה</div>}
            {job.isPromoted && !isNew && <div className="absolute top-3 left-3 text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full z-10 flex items-center gap-1"><SparklesIcon className="w-3 h-3"/> מקודמת</div>}
            <div className="p-4">
                <div className="flex items-start gap-4">
                    <img src={job.logo} alt={`${job.client} logo`} className="w-12 h-12 rounded-lg object-contain border border-border-default p-1 flex-shrink-0" />
                    <div className="flex-grow">
                        <p className="text-sm font-semibold text-text-muted">{job.client}</p>
                        <h3 className="font-bold text-base text-text-default leading-tight group-hover:text-primary-600">{job.title}</h3>
                    </div>
                </div>

                <div className="mt-2 text-sm text-text-muted font-medium flex items-center gap-x-3 gap-y-1 flex-wrap">
                    <span>{job.location}</span>
                    <span className="text-text-subtle">&bull;</span>
                    <span>{job.experienceRequired}</span>
                    <span className="text-text-subtle">&bull;</span>
                    <span>{Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType}</span>
                </div>

                <p className="mt-2 text-sm text-text-muted line-clamp-2 leading-relaxed h-10">
                    {descriptionSnippet}
                </p>

                <div className="mt-3 pt-3 border-t border-border-default flex justify-between items-center text-xs text-text-subtle font-medium">
                    <span>{job.postedDate}</span>
                    <div className="flex items-center gap-2">
                        {job.workModel && <span className="bg-bg-subtle text-text-muted px-2 py-1 rounded-md capitalize font-semibold">{job.workModel === 'remote' ? 'מהבית' : job.workModel === 'hybrid' ? 'היברידי' : 'מהמשרד'}</span>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const JobDetailView: React.FC<{ job: EnrichedJob; onClose: () => void; onApplyClick: () => void; }> = ({ job, onClose, onApplyClick }) => {
    const descriptionHtml = useMemo(() => {
        let inList = false;
        const htmlParts = job.description
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .map(line => {
                if (line.startsWith('**') && line.endsWith('**')) {
                    return `<h4 class="font-bold text-text-default text-base mt-4 mb-2">${line.substring(2, line.length - 2)}</h4>`;
                }
                if (line.startsWith('•')) {
                    return `<li>${line.substring(1).trim()}</li>`;
                }
                return `<p class="my-1">${line}</p>`;
            });

        let finalHtml = '';
        for (const part of htmlParts) {
            if (part.startsWith('<li>') && !inList) {
                finalHtml += '<ul>';
                inList = true;
            } else if (!part.startsWith('<li>') && inList) {
                finalHtml += '</ul>';
                inList = false;
            }
            finalHtml += part;
        }
        if (inList) {
            finalHtml += '</ul>';
        }
        return finalHtml;
    }, [job.description]);


    return (
        <div className="p-6 relative h-full flex flex-col">
            <button onClick={onClose} className="absolute top-4 left-4 p-2 text-text-subtle hover:text-text-default hover:bg-bg-hover rounded-full transition-colors z-10 lg:hidden">
                <XMarkIcon className="w-6 h-6"/>
            </button>
            <div className="flex-grow overflow-y-auto pr-2">
                <header className="flex items-start gap-4 pb-6 border-b border-border-default">
                    <img src={job.logo} alt={`${job.client} logo`} className="w-20 h-20 rounded-xl object-contain border border-border-default p-1 flex-shrink-0" />
                    <div>
                        <p className="text-base font-semibold text-text-muted">{job.client}</p>
                        <h2 className="text-2xl font-extrabold text-text-default">{job.title}</h2>
                        <div className="flex items-center gap-4 text-sm text-text-muted mt-2">
                            <span className="flex items-center gap-1.5"><MapPinIcon className="w-4 h-4 text-text-subtle"/> {job.location}</span>
                            <span className="flex items-center gap-1.5"><BriefcaseIcon className="w-4 h-4 text-text-subtle"/> {Array.isArray(job.jobType) ? job.jobType.join(', ') : job.jobType}</span>
                        </div>
                    </div>
                </header>
                <main className="py-6">
                    <div className="prose prose-sm max-w-none text-text-default" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                    <div className="mt-6 flex flex-wrap gap-2">
                        {job.tags.map(tag => (
                            <span key={tag} className="bg-primary-100 text-primary-800 text-sm font-semibold px-2.5 py-1 rounded-full">{tag}</span>
                        ))}
                    </div>
                </main>
            </div>
             <footer className="pt-4 flex-shrink-0">
                <button onClick={onApplyClick} className="w-full bg-primary-600 text-white font-bold py-3 rounded-lg hover:bg-primary-700 transition-transform transform hover:scale-105 shadow-lg shadow-primary-500/30">
                    הגש מועמדות
                </button>
            </footer>
             <style>{`.prose ul { padding-right: 1.5em; list-style-type: disc; } .prose li { margin-top: 0.25em; margin-bottom: 0.25em; } .prose h4 { margin-bottom: 0.5rem; } .prose p { margin-bottom: 0.25rem; margin-top: 0.25rem; }`}</style>
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
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                {companies.map((company, index) => (
                    <div key={index} className="flex-shrink-0 w-24 h-20 bg-bg-card border border-border-default rounded-xl flex items-center justify-center p-3 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer">
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
         <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4">
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
    const [filters, setFilters] = useState({
        location: '',
        jobType: '',
        workModel: 'all' as 'all' | 'office' | 'hybrid' | 'remote',
        minSalary: 0,
    });
    const [savedJobs, setSavedJobs] = useState<Set<number>>(new Set());
    const [selectedJob, setSelectedJob] = useState<EnrichedJob | null>(null);
    
    const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
    const [applyingForJob, setApplyingForJob] = useState<EnrichedJob | null>(null);
    const [applicationSuccess, setApplicationSuccess] = useState<string | null>(null);

    // Upload Modal State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);


    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const handleWorkModelChange = (model: 'all' | 'office' | 'hybrid' | 'remote') => {
        setFilters(prev => ({ ...prev, workModel: model }));
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
        openJobAlertModal({ mode: 'create', currentFilters: { searchTerm, ...filters } });
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
        console.log("Submitting application:", applicationData);
        handleCloseApplyModal();
        setApplicationSuccess(`המועמדות שלך למשרת "${applicationData.jobTitle}" נשלחה בהצלחה!`);
        setTimeout(() => {
            setApplicationSuccess(null);
        }, 5000);
    };

    const handleUploadSuccess = (data: any) => {
        setIsUploadModalOpen(false);
        // Navigate to the profile page with the parsed data
        navigate('/candidate-portal/profile', { state: { candidateData: data } });
    };

    const filteredJobs = useMemo(() => {
        return mockJobsData.filter(job => {
            const matchesSearch = searchTerm.trim() === '' || 
                job.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                job.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                job.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesLocation = filters.location.trim() === '' || job.location.toLowerCase().includes(filters.location.toLowerCase());
            const jobTypesArray = Array.isArray(job.jobType) ? job.jobType : [job.jobType];
            const matchesJobType = filters.jobType.trim() === '' || 
                jobTypesArray.some(t => t.toLowerCase().includes(filters.jobType.toLowerCase()));
            const matchesWorkModel = filters.workModel === 'all' || job.workModel === filters.workModel;
            const matchesSalary = (job.salaryMin || 0) >= filters.minSalary;

            return matchesSearch && matchesLocation && matchesJobType && matchesWorkModel && matchesSalary;
        });
    }, [filters, searchTerm]);
    
    return (
        <div className="flex flex-col h-full max-h-[calc(100vh-20px)]">
             {/* Header Bar with Login/Post Actions */}
             <div className="flex justify-between items-center px-4 py-3 bg-bg-card border-b border-border-default mb-4 rounded-xl shadow-sm">
                 <div className="text-lg font-bold text-text-default flex items-center gap-2">
                     <BriefcaseIcon className="w-6 h-6 text-primary-600"/>
                     <span>לוח משרות</span>
                 </div>
                 <div className="flex items-center gap-3">
                     <button 
                         onClick={() => navigate('/login')}
                         className="text-sm font-semibold text-text-muted hover:text-primary-600 flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-bg-hover transition"
                     >
                         <UserCircleIcon className="w-5 h-5"/>
                         כניסת מועמדים
                     </button>
                     <div className="h-6 w-px bg-border-default mx-1"></div>
                     <button 
                         onClick={() => navigate('/post-job')}
                         className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm text-sm"
                     >
                         <SparklesIcon className="w-4 h-4" />
                         פרסם משרה
                     </button>
                 </div>
             </div>

             {applicationSuccess && (
                <div className="fixed top-24 right-6 bg-accent-500 text-white py-3 px-5 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-fade-in">
                    <CheckCircleIcon className="w-6 h-6" />
                    <span className="font-semibold">{applicationSuccess}</span>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
                {/* Right Pane: List & Filters */}
                <div className={`w-full lg:w-2/5 xl:w-1/3 flex flex-col gap-4 h-full overflow-hidden ${selectedJob ? 'hidden lg:flex' : 'flex'}`}>
                    
                    <div className="flex-shrink-0 space-y-4 pr-2 overflow-y-auto custom-scrollbar" style={{maxHeight: '100%'}}>
                        <FeaturedCompaniesWidget />
                        <PromoBanner onUploadClick={() => setIsUploadModalOpen(true)} />

                        <div className="bg-bg-card rounded-2xl shadow-sm p-4 space-y-4 border border-border-default">
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="relative flex-grow">
                                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="חיפוש לפי תפקיד, חברה או מיומנות..." 
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-3 pl-4 pr-12 text-base focus:ring-primary-500 focus:border-primary-300 transition shadow-sm"
                                    />
                                </div>
                                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="flex items-center justify-center gap-2 font-semibold py-3 px-5 rounded-lg border-2 bg-bg-card text-text-default border-border-default hover:border-primary-300 transition">
                                    <FunnelIcon className="w-5 h-5"/>
                                    <span className="hidden sm:inline">סינון</span>
                                </button>
                            </div>

                            {isFilterOpen && (
                                <div className="pt-4 border-t border-border-default space-y-4 animate-fade-in">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">מיקום</label>
                                            <input name="location" value={filters.location} onChange={handleFilterChange} placeholder="לדוגמה: תל אביב" className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"/>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">היקף משרה</label>
                                            <select name="jobType" value={filters.jobType} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm">
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
                                        <div className="flex items-center gap-1 bg-bg-subtle p-1 rounded-lg">
                                            <button onClick={() => handleWorkModelChange('all')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${filters.workModel === 'all' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}>הכל</button>
                                            <button onClick={() => handleWorkModelChange('office')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${filters.workModel === 'office' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}>מהמשרד</button>
                                            <button onClick={() => handleWorkModelChange('hybrid')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${filters.workModel === 'hybrid' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}>היברידי</button>
                                            <button onClick={() => handleWorkModelChange('remote')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${filters.workModel === 'remote' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}>מהבית</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center px-1">
                            <p className="text-sm font-semibold text-text-muted">מציג {filteredJobs.length} משרות</p>
                            <button onClick={handleCreateAlert} className="flex items-center gap-2 text-sm font-semibold text-primary-600 hover:underline">
                                <BellIcon className="w-4 h-4"/>
                                <span>צור התראת משרות</span>
                            </button>
                        </div>
                        
                        <div className="space-y-4 pb-6">
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

                {/* Left Pane: Details */}
                <div className={`flex-grow bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-hidden relative h-full ${selectedJob ? 'block' : 'hidden lg:block'}`}>
                    {selectedJob ? (
                        <JobDetailView job={selectedJob} onClose={() => setSelectedJob(null)} onApplyClick={handleOpenApplyModal} />
                    ) : (
                        <div className="hidden lg:flex flex-col items-center justify-center h-full text-center text-text-muted p-8 bg-bg-subtle/30">
                            <div className="bg-bg-subtle p-6 rounded-full mb-4">
                                <BriefcaseIcon className="w-16 h-16 text-text-subtle opacity-50" />
                            </div>
                            <h2 className="text-xl font-bold text-text-default">בחר משרה מהרשימה</h2>
                            <p className="mt-2 max-w-xs text-text-muted">לחץ על משרה כדי לראות את הפרטים המלאים, הדרישות ואפשרויות ההגשה.</p>
                        </div>
                    )}
                </div>
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
        </div>
    );
};

export default GeneralJobsView;
