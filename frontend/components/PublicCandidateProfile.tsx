
import React from 'react';
import { 
    MapPinIcon, BriefcaseIcon, EnvelopeIcon, PhoneIcon, ArrowDownTrayIcon, 
    CheckCircleIcon, CalendarDaysIcon, ShareIcon, BuildingOffice2Icon,
    AcademicCapIcon, LanguageIcon, SparklesIcon, HiroLogotype
} from './Icons';

// Mock Data for Public View
const candidateData = {
    name: "גדעון שפירא",
    title: "מנהל שיווק דיגיטלי",
    location: "תל אביב",
    summary: "מנהל שיווק דיגיטלי מנוסה עם למעלה מ-5 שנות ניסיון בהובלת אסטרטגיות צמיחה וקמפיינים מרובי ערוצים. בעל מומחיות עמוקה ב-PPC, SEO, ואנליטיקה. מחפש את האתגר הבא בעולמות ה-B2B Tech.",
    email: "gidon.shap@email.com",
    phone: "054-1234567",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    tags: ['שיווק דיגיטלי', 'ניהול צוות', 'PPC', 'SEO', 'Data Analysis', 'B2B Marketing', 'HubSpot'],
    experience: [
        { 
            role: 'מנהל שיווק', 
            company: 'בזק', 
            period: '2020 - 2023', 
            description: 'ניהול צוות של 5 עובדים, אחריות על קמפיינים דיגיטליים ותקציב שנתי של 2 מיליון ש"ח. הובלת מהלכי מיתוג מחדש והטמעת מערכות אוטומציה.' 
        },
        { 
            role: 'מנהל קמפיינים PPC', 
            company: 'Wix', 
            period: '2018 - 2019', 
            description: 'ניהול קמפיינים בגוגל ופייסבוק בשווקים בינלאומיים. אופטימיזציה יומיומית והפקת דוחות ביצועים להנהלה.' 
        },
        { 
            role: 'מתמחה בשיווק', 
            company: 'AllJobs', 
            period: '2017 - 2018', 
            description: 'סיוע לצוות השיווק במשימות השוטפות, כתיבת תכנים לרשתות חברתיות וניהול קהילות.' 
        }
    ],
    education: [
        { degree: 'תואר ראשון בתקשורת', institution: 'אוניברסיטת תל אביב', year: '2017' }
    ],
    languages: [
        { lang: 'עברית', level: 'שפת אם' },
        { lang: 'אנגלית', level: 'רמה גבוהה מאוד' }
    ],
    verified: true
};

const ExperienceItem: React.FC<{ role: string; company: string; period: string; description: string }> = ({ role, company, period, description }) => (
    <div className="relative pl-8 pb-8 border-r border-border-default last:border-0 last:pb-0">
        <div className="absolute -right-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-bg-card"></div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
            <h4 className="text-lg font-bold text-text-default">{role}</h4>
            <span className="text-sm font-medium text-text-muted bg-bg-subtle px-2 py-0.5 rounded">{period}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-primary-700 font-medium mb-3">
            <BuildingOffice2Icon className="w-4 h-4" />
            <span>{company}</span>
        </div>
        <p className="text-text-muted text-sm leading-relaxed">{description}</p>
    </div>
);

const PublicCandidateProfile: React.FC = () => {
    const handleShare = () => {
        if (navigator.share) {
            navigator.share({
                title: `${candidateData.name} - ${candidateData.title}`,
                url: window.location.href
            }).catch(console.error);
        } else {
            navigator.clipboard.writeText(window.location.href);
            alert('הקישור הועתק ללוח!');
        }
    };

    return (
        <div className="min-h-screen bg-bg-default font-sans" dir="rtl">
            {/* Top Branding Bar */}
            <div className="bg-bg-card border-b border-border-default sticky top-0 z-20 shadow-sm">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-2 opacity-80 hover:opacity-100 transition-opacity cursor-pointer">
                        <HiroLogotype className="h-6" />
                        <span className="text-xs font-medium text-text-muted border-r border-text-subtle pr-2 mr-2">פרופיל מקצועי</span>
                    </div>
                    <button 
                        onClick={handleShare}
                        className="text-sm font-medium text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <ShareIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">שתף פרופיל</span>
                    </button>
                </div>
            </div>

            {/* Hero Section - Compact on Mobile */}
            <div className="relative bg-gradient-to-b from-primary-600 to-primary-800 pb-16 pt-8 sm:pb-24 sm:pt-20 px-4">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="max-w-5xl mx-auto text-center relative z-10 flex flex-col sm:block items-center">
                     <div className="relative inline-block mb-3 sm:mb-0">
                        <img 
                            src={candidateData.avatar} 
                            alt={candidateData.name} 
                            className="w-24 h-24 sm:w-40 sm:h-40 rounded-full border-4 border-white shadow-xl object-cover"
                        />
                        {candidateData.verified && (
                            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-white rounded-full p-1 sm:p-1.5 shadow-md" title="פרופיל מאומת">
                                <CheckCircleIcon className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500" />
                            </div>
                        )}
                    </div>
                    <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-2 sm:mt-4 mb-1 sm:mb-2">{candidateData.name}</h1>
                    <p className="text-lg sm:text-xl text-primary-100 font-medium mb-4 sm:mb-6">{candidateData.title}</p>
                    
                    <div className="flex flex-wrap justify-center gap-2 sm:gap-3 text-xs sm:text-sm text-white/90 font-medium">
                        <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                            <MapPinIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            {candidateData.location}
                        </div>
                        <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-sm">
                            <BriefcaseIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            זמינות מיידית
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Container */}
            <main className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 sm:-mt-16 pb-16 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Left Sidebar (Desktop) / Top (Mobile) */}
                    <div className="lg:col-span-1 space-y-6">
                        
                        {/* Contact Card */}
                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4">פרטי התקשרות</h3>
                            <div className="space-y-4">
                                <a href={`mailto:${candidateData.email}`} className="flex items-center gap-3 text-sm text-text-muted hover:text-primary-600 transition-colors p-2 hover:bg-bg-subtle rounded-lg -mx-2">
                                    <div className="bg-primary-50 p-2 rounded-full text-primary-600">
                                        <EnvelopeIcon className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium truncate">{candidateData.email}</span>
                                </a>
                                <a href={`tel:${candidateData.phone}`} className="flex items-center gap-3 text-sm text-text-muted hover:text-primary-600 transition-colors p-2 hover:bg-bg-subtle rounded-lg -mx-2">
                                    <div className="bg-primary-50 p-2 rounded-full text-primary-600">
                                        <PhoneIcon className="w-5 h-5" />
                                    </div>
                                    <span className="font-medium">{candidateData.phone}</span>
                                </a>
                            </div>
                            <button className="w-full mt-6 bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2">
                                <ArrowDownTrayIcon className="w-5 h-5" />
                                הורד קורות חיים
                            </button>
                        </div>

                         {/* Skills */}
                         <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4 flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-primary-500" />
                                מיומנויות וכישורים
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {candidateData.tags.map(tag => (
                                    <span key={tag} className="bg-bg-subtle text-text-default text-sm font-medium px-3 py-1.5 rounded-lg border border-border-default">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                         {/* Education & Langs */}
                         <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6">
                            <h3 className="font-bold text-text-default mb-4">השכלה ושפות</h3>
                            
                            <div className="mb-6">
                                <div className="flex items-center gap-2 text-sm font-semibold text-text-muted mb-3">
                                    <AcademicCapIcon className="w-4 h-4" />
                                    השכלה
                                </div>
                                {candidateData.education.map((edu, i) => (
                                    <div key={i} className="mb-3 last:mb-0">
                                        <p className="font-bold text-text-default text-sm">{edu.degree}</p>
                                        <p className="text-xs text-text-muted">{edu.institution}, {edu.year}</p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-text-muted mb-3">
                                    <LanguageIcon className="w-4 h-4" />
                                    שפות
                                </div>
                                <div className="space-y-2">
                                    {candidateData.languages.map((lang, i) => (
                                        <div key={i} className="flex justify-between text-sm">
                                            <span className="text-text-default">{lang.lang}</span>
                                            <span className="text-text-muted">{lang.level}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Content (Main) */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* Summary */}
                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 sm:p-8">
                            <h3 className="text-xl font-bold text-text-default mb-4">אודות</h3>
                            <p className="text-text-muted leading-relaxed text-base">
                                {candidateData.summary}
                            </p>
                        </div>

                        {/* Experience */}
                        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 sm:p-8">
                            <h3 className="text-xl font-bold text-text-default mb-6 flex items-center gap-2">
                                <BriefcaseIcon className="w-6 h-6 text-primary-500" />
                                ניסיון תעסוקתי
                            </h3>
                            <div className="space-y-8">
                                {candidateData.experience.map((job, index) => (
                                    <ExperienceItem key={index} {...job} />
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </main>

            <footer className="bg-bg-card border-t border-border-default py-8 text-center text-text-muted text-sm">
                <p>Powered by <strong>Hiro</strong> - מערכת גיוס חכמה</p>
                <p className="mt-2">&copy; {new Date().getFullYear()} כל הזכויות שמורות</p>
            </footer>
        </div>
    );
};

export default PublicCandidateProfile;
