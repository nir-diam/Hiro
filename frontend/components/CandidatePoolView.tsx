
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, Squares2X2Icon, TableCellsIcon, ChevronDownIcon,
    MapPinIcon, UserIcon, AcademicCapIcon, XMarkIcon,
    BookmarkIcon, CheckCircleIcon, ClockIcon, AdjustmentsHorizontalIcon,
    BriefcaseIcon, BuildingOffice2Icon, BookmarkIconSolid,
    PlusIcon, FolderIcon, EnvelopeIcon, TrashIcon, LanguageIcon, EyeIcon
} from './Icons';
import CandidateRow from './CandidateRow';
import CandidatePoolProfileDrawer from './CandidatePoolProfileDrawer';
import { useSavedSearches } from '../context/SavedSearchesContext';
import PurchaseCandidateModal from './PurchaseCandidateModal';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import CompanyFilterPopover from './CompanyFilterPopover';

// --- HELPER FOR ANONYMIZATION ---
const anonymizeCandidate = (candidate: any, isPurchased: boolean) => {
    if (isPurchased) {
        return {
            ...candidate,
            isAnonymized: false
        };
    }

    // 1. Mask Name: "Gideon Shapira" -> "Gideon S."
    const nameParts = candidate.name.split(' ');
    const maskedName = nameParts.length > 1 
        ? `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}.` 
        : candidate.name;

    return {
        ...candidate,
        name: maskedName,
        isAnonymized: true
    };
};

// --- DEDICATED CARD COMPONENT FOR POOL ---
const PoolCandidateCard: React.FC<{
    candidate: any;
    onViewProfile: (candidate: any) => void;
    isFavorite: boolean;
    onToggleFavorite: (id: number) => void;
    isSelected?: boolean;
    onSelect?: (id: number) => void;
    selectionMode?: boolean;
    isPurchased: boolean;
}> = ({ candidate, onViewProfile, isFavorite, onToggleFavorite, isSelected, onSelect, selectionMode, isPurchased }) => {
    
    const displayCandidate = anonymizeCandidate(candidate, isPurchased);

    // Calculate total years for display
    const totalYears = candidate.experience.reduce((acc: number, curr: any) => acc + curr.years, 0);

    // Theme-aware colors for the experience bar
    const barColors = ['bg-primary-500', 'bg-secondary-500', 'bg-accent-500'];

    // Limit to top 3 industries
    const displayedExperience = candidate.experience.slice(0, 3);
    
    // Calculate percentages for the bar
    const totalDisplayedYears = displayedExperience.reduce((acc: number, curr: any) => acc + curr.years, 0);

    return (
        <div 
            className={`bg-bg-card rounded-3xl border border-border-default shadow-sm p-6 flex flex-col items-center text-center relative hover:shadow-lg transition-all duration-300 h-full group ${isSelected ? 'ring-2 ring-primary-500 border-primary-500' : ''}`}
            onClick={() => selectionMode && onSelect ? onSelect(candidate.id) : onViewProfile(candidate)}
        >
            {/* Selection / Favorite Absolute Positioned Items */}
            <div className="absolute top-4 left-4 z-10">
                 {selectionMode ? (
                    <input 
                        type="checkbox" 
                        checked={isSelected} 
                        readOnly 
                        className="h-5 w-5 rounded-md border-2 border-border-default text-primary-600 focus:ring-primary-500 pointer-events-none" 
                    />
                ) : (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(candidate.id); }} 
                        className="text-text-subtle hover:text-primary-500 transition-colors"
                    >
                        {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
                    </button>
                )}
            </div>

            {/* Avatar - LIGHTER BLUR */}
            <div className="relative mb-4">
                <div className="w-24 h-24 rounded-full p-1 border-2 border-primary-100 overflow-hidden relative">
                    <img 
                        src={candidate.avatarUrl} 
                        alt="Candidate" 
                        className={`w-full h-full rounded-full object-cover scale-110 transition-all duration-700 group-hover:scale-125 ${isPurchased ? '' : 'filter blur-sm'}`}
                    />
                </div>
            </div>

            {/* Name & Title */}
            <h3 className="text-xl font-extrabold text-text-default mb-1">{displayCandidate.name}</h3>
            <p className="text-primary-600 font-bold text-sm mb-1">{candidate.title}</p>
            <p className="text-xs text-text-muted mb-6">לפני {candidate.lastActive}</p>

            {/* Experience Section (The Theme-Aware Bar) */}
            <div className="w-full mb-4 text-right">
                <div className="flex justify-between text-xs font-bold text-text-default mb-2">
                    <span>ניסיון בתעשיות</span>
                    <span>סה"כ {totalYears} שנים</span>
                </div>
                {/* Progress Bar */}
                <div className="w-full h-2.5 bg-bg-subtle rounded-full overflow-hidden flex mb-2">
                    {displayedExperience.map((exp: any, i: number) => (
                        <div 
                            key={i} 
                            className={`h-full ${barColors[i % barColors.length]}`} 
                            style={{ width: `${(exp.years / totalDisplayedYears) * 100}%` }}
                        ></div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-muted justify-start">
                    {displayedExperience.map((exp: any, i: number) => (
                        <span key={i} className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${barColors[i % barColors.length]}`}></span>
                            {exp.field}
                        </span>
                    ))}
                </div>
            </div>

            {/* Highlights / Education / Specific Tags */}
            <div className="w-full text-right mb-6 space-y-2">
                <div className="flex items-center justify-between text-xs text-text-default bg-bg-subtle p-2 rounded-lg border border-border-subtle">
                    <span className="font-bold">דגשים</span>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                     {/* Standard Highlights */}
                     {candidate.highlights.map((tag: string, i: number) => (
                         <span key={i} className="bg-bg-card border border-border-default text-text-default px-3 py-1 rounded-full text-xs shadow-sm">
                             {tag}
                         </span>
                     ))}
                     
                     {/* English Level Badge */}
                     <span className="bg-bg-card border border-border-default text-text-default px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-sm">
                        <LanguageIcon className="w-3 h-3 text-primary-500" /> אנגלית ברמה גבוהה
                     </span>
                     
                     {/* Degree Badge */}
                     <span className="bg-bg-card border border-border-default text-text-default px-3 py-1 rounded-full text-xs flex items-center gap-1 shadow-sm">
                        <AcademicCapIcon className="w-3 h-3 text-primary-500" /> תואר אקדמי
                     </span>
                </div>
            </div>
            
            <div className="flex-grow"></div>

            {/* Bottom Details */}
            <div className="w-full flex justify-between items-center text-xs text-text-muted mb-4 px-2 pt-4 border-t border-border-subtle">
                <span className="font-medium">היקף משרה</span>
                <span className="font-bold text-text-default">{candidate.jobScopes[0]}</span>
            </div>

            {/* Action Button - Subtle View Profile */}
            <button 
                onClick={() => onViewProfile(candidate)}
                className="w-full py-2.5 rounded-xl transition-all border-2 border-primary-600 text-primary-600 font-bold hover:bg-primary-50 active:scale-95 flex items-center justify-center gap-2"
            >
                <EyeIcon className="w-5 h-5" />
                <span>צפייה בפרופיל</span>
            </button>
        </div>
    );
};

// Mock Data for the Candidate Pool
const candidatePoolData = [
  {
    id: 101,
    name: 'עידו נוימן',
    title: 'קופירייטר',
    lastActive: '3 ימים', 
    location: 'רמת גן',
    avatarUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
      { industry: 'תעשייה וייצור', field: 'דפוס', years: 5, size: '200-1000', sector: 'פרטי' },
      { industry: 'תעשייה וייצור', field: 'ייצור נייר ואריזות', years: 3, size: '51-200', sector: 'פרטי' }
    ],
    highlights: [],
    level: 'בכיר',
    contact: { phone: '054-1234567', email: 'ido.neuman@email.com' },
    salaryExpectation: '14,000₪ - 16,000₪',
    languages: ['עברית - שפת אם', 'אנגלית - רמה גבוהה'],
    interests: ['קופירייטינג', 'ניהול קריאייטיב', 'כתיבת תוכן'],
    skills: ['Figma', 'Photoshop', 'Google Analytics', 'כתיבה שיווקית', 'אסטרטגיה'],
    detailedExperience: [
      { title: 'קופירייטר בכיר', field: 'משרד פרסום', duration: '2020 - הווה' },
      { title: 'מורה לעיצוב', field: 'השכלה גבוהה', duration: '2018 - 2020' },
      { title: 'קופירייטר ג\'וניור', field: 'משרד פרסום', duration: '2016 - 2018' },
    ],
    education: [
      { title: 'תואר שני בעיצוב תעשייתי', institution: 'בצלאל', duration: '2016 - 2018' },
    ],
    jobScopes: ['משרה מלאה', 'פרילנס'],
  },
  {
    id: 102,
    name: 'שירה סמוחה',
    title: 'מורה למחול',
    lastActive: '3 ימים',
    location: 'חולון',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
      { industry: 'תחבורה ולוגיסטיקה', field: 'תחבורה ציבורית', years: 6, size: '1000+', sector: 'ממשלתי' },
      { industry: 'תעשייה וייצור', field: 'תעשיית האופנה', years: 2, size: '51-200', sector: 'פרטי' },
    ],
    highlights: [],
    level: 'מנוסה',
    contact: { phone: '052-2345678', email: 'shira.s@email.com' },
    salaryExpectation: '9,000₪ - 11,000₪',
    languages: ['עברית - שפת אם', 'צרפתית - בסיסית'],
    interests: ['הוראה', 'כוריאוגרפיה', 'הפקת אירועים'],
    skills: ['כוריאוגרפיה', 'הוראת בלט', 'הפקה'],
     detailedExperience: [
      { title: 'מורה למחול', field: 'סטודיו למחול', duration: '2018 - הווה' },
      { title: 'רקדנית', field: 'להקת מחול', duration: '2014 - 2018' },
    ],
    education: [
      { title: 'תואר ראשון במחול', institution: 'האקדמיה למוסיקה ולמחול בירושלים', duration: '2011 - 2014' },
    ],
    jobScopes: ['משמרות', 'משרה חלקית'],
  },
  {
    id: 103,
    name: 'דניאל כהן',
    title: 'מעצב גרפי',
    lastActive: 'יומיים',
    location: 'תל אביב',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
      { industry: 'תעשייה וייצור', field: 'ייצור שבבים', years: 4, size: '1000+', sector: 'ציבורי' },
      { industry: 'תעשייה וייצור', field: 'אלקטרוניקה', years: 2, size: '200-1000', sector: 'פרטי' },
    ],
    highlights: [],
    level: 'ראש צוות',
    contact: { phone: '053-3456789', email: 'daniel.c@email.com' },
    salaryExpectation: '18,000₪ - 22,000₪',
    languages: ['עברית - שפת אם', 'אנגלית - שפת אם'],
    interests: ['עיצוב מוצר', 'UI/UX', 'מיתוג'],
    skills: ['Figma', 'Adobe XD', 'Photoshop', 'Illustrator'],
     detailedExperience: [
      { title: 'ראש צוות עיצוב', field: 'חברת הייטק', duration: '2020 - הווה' },
      { title: 'מעצב גרפי', field: 'סטודיו למיתוג', duration: '2018 - 2020' },
    ],
    education: [
      { title: 'תואר ראשון בתקשורת חזותית', institution: 'שנקר', duration: '2014 - 2018' },
    ],
    jobScopes: ['משרה מלאה', 'היברידי'],
  },
  {
    id: 104,
    name: 'יותם לוי',
    title: 'מהנדס תוכנה',
    lastActive: '5 ימים',
    location: 'הרצליה',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
       { industry: 'תעשייה וייצור', field: 'תעשייה ביטחונית', years: 8, size: '1000+', sector: 'ציבורי' },
       { industry: 'תעשייה וייצור', field: 'ייצור שבבים', years: 3, size: '1000+', sector: 'ציבורי' },
       { industry: 'תחבורה ולוגיסטיקה', field: 'תעופה', years: 1, size: '200-1000', sector: 'ציבורי' }
    ],
    highlights: [],
    level: 'בכיר',
    contact: { phone: '050-4567890', email: 'yotam.l@email.com' },
    salaryExpectation: '35,000₪ - 40,000₪',
    languages: ['עברית - שפת אם', 'אנגלית - רמה גבוהה'],
    interests: ['פיתוח Backend', 'DevOps', 'Cloud'],
    skills: ['Python', 'AWS', 'Kubernetes', 'Docker', 'Node.js'],
     detailedExperience: [
      { title: 'מהנדס תוכנה בכיר', field: 'חברת סייבר', duration: '2019 - הווה' },
      { title: 'מפתח Fullstack', field: 'סטארטאפ', duration: '2016 - 2019' },
    ],
    education: [
      { title: 'תואר ראשון במדעי המחשב', institution: 'אוניברסיטת תל אביב', duration: '2013 - 2016' },
    ],
    jobScopes: ['משרה מלאה'],
  },
  {
    id: 105,
    name: 'נועה ברק',
    title: 'מנהלת מוצר',
    lastActive: 'היום',
    location: 'גבעתיים',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
      { industry: 'תעשייה וייצור', field: 'אלקטרוניקה', years: 8, size: '1000+', sector: 'ציבורי' },
      { industry: 'בנייה ותשתיות', field: 'הנדסה אזרחית', years: 6, size: '200-1000', sector: 'פרטי' },
      { industry: 'תחבורה ולוגיסטיקה', field: 'ספנות', years: 4, size: '1001-5000', sector: 'ציבורי' },
    ],
    highlights: [],
    level: 'מנהלת מוצר',
    contact: { phone: '058-5678901', email: 'noa.barak@email.com' },
    salaryExpectation: '28,000₪ - 32,000₪',
    languages: ['עברית - שפת אם', 'אנגלית - שפת אם'],
    interests: ['ניהול מוצר', 'Fintech', 'אסטרטגיית מוצר'],
    skills: ['Product Management', 'Agile', 'Jira', 'Data Analysis'],
     detailedExperience: [
      { title: 'מנהלת מוצר', field: 'חברת פינטק', duration: '2019 - הווה' },
      { title: 'אנליסטית עסקית', field: 'בנק', duration: '2017 - 2019' },
    ],
    education: [
      { title: 'תואר שני במנהל עסקים', institution: 'אוניברסיטת תל אביב', duration: '2015 - 2017' },
      { title: 'תואר ראשון בכלכלה', institution: 'האוניברסיטה העברית', duration: '2012 - 2015' },
    ],
    jobScopes: ['משרה מלאה', 'היברידי', 'משרת אם'],
  },
  {
    id: 106,
    name: 'איתי שגב',
    title: 'אנליסט נתונים',
    lastActive: 'שבוע',
    location: 'רחובות',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
      { industry: 'תעשייה וייצור', field: 'אלקטרוניקה', years: 5, size: '1000+', sector: 'ציבורי' },
      { industry: 'תחבורה ולוגיסטיקה', field: 'חברות שילוח', years: 4, size: '51-200', sector: 'פרטי' },
      { industry: 'בנייה ותשתיות', field: 'ייצור מלט ובטון', years: 3, size: '200-1000', sector: 'פרטי' },
      { industry: 'תעשייה וייצור', field: 'ייצור מתכת', years: 2, size: '51-200', sector: 'פרטי' },
      { industry: 'תחבורה ולוגיסטיקה', field: 'תעופה', years: 1, size: '200-1000', sector: 'ציבורי' },
    ],
    highlights: [],
    level: 'אנליסט נתונים',
    contact: { phone: '054-6789012', email: 'itay.segev@email.com' },
    salaryExpectation: '15,000₪ - 18,000₪',
    languages: ['עברית - שפת אם', 'אנגלית - רמה גבוהה'],
    interests: ['Data Analysis', 'BI', 'Machine Learning'],
    skills: ['SQL', 'Python', 'Tableau', 'Excel'],
     detailedExperience: [
      { title: 'אנליסט נתונים', field: 'חברת גיימינג', duration: '2021 - הווה' },
      { title: 'אנליסט', field: 'חברת ביטוח', duration: '2019 - 2021' },
    ],
    education: [
      { title: 'תואר ראשון בסטטיסטיקה', institution: 'אוניברסיטת חיפה', duration: '2016 - 2019' },
    ],
    jobScopes: ['משרה מלאה'],
  },
   {
    id: 107, name: 'רונית לוי', title: 'מנהלת פרויקטים בבנייה', lastActive: 'היום', location: 'חיפה',
    avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'בנייה ותשתיות', field: 'ניהול פרויקטים בבנייה', years: 10, size: '200-1000', sector: 'פרטי' },
        { industry: 'בנייה ותשתיות', field: 'הנדסה אזרחית', years: 4, size: '200-1000', sector: 'פרטי' }
    ],
    highlights: [], level: 'בכירה', contact: { phone: '052-1112222', email: 'ronit.l@email.com' },
    salaryExpectation: '25,000₪ - 30,000₪', languages: ['עברית - שפת אם', 'אנגלית - טובה'], interests: ['ניהול פרויקטים', 'נדל"ן'],
    skills: ['MS Project', 'AutoCAD', 'ניהול תקציב'],
    detailedExperience: [{ title: 'מנהלת פרויקטים', field: 'חברת בנייה', duration: '2014 - הווה' }],
    education: [{ title: 'תואר ראשון בהנדסה אזרחית', institution: 'הטכניון', duration: '2010 - 2014' }],
    jobScopes: ['משרה מלאה'],
  },
  {
    id: 108, name: 'בן כהן', title: 'רכז לוגיסטיקה', lastActive: 'יומיים', location: 'אשדוד',
    avatarUrl: 'https://images.unsplash.com/photo-1547425260-76bc4ddd942e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'תחבורה ולוגיסטיקה', field: 'לוגיסטיקה ושינוע', years: 5, size: '51-200', sector: 'פרטי' },
        { industry: 'תחבורה ולוגיסטיקה', field: 'מחסנים וניהול מלאי', years: 2, size: '51-200', sector: 'פרטי' },
        { industry: 'תעשייה וייצור', field: 'ייצור מזון ומשקאות', years: 1, size: '200-1000', sector: 'פרטי' }
    ],
    highlights: [], level: 'מנוסה', contact: { phone: '053-2223333', email: 'ben.c@email.com' },
    salaryExpectation: '9,000₪ - 11,000₪', languages: ['עברית - שפת אם'], interests: ['ניהול מלאי', 'שרשרת אספקה'],
    skills: ['WMS', 'Excel', 'ניהול מחסן'],
    detailedExperience: [{ title: 'רכז לוגיסטיקה', field: 'חברת שילוח', duration: '2019 - הווה' }],
    education: [{ title: 'הנדסאי תעשייה וניהול', institution: 'מכללת ספיר', duration: '2017 - 2019' }],
    jobScopes: ['משרה מלאה', 'משמרות'],
  },
  {
    id: 109, name: 'ליאור מזרחי', title: 'מהנדס מכונות', lastActive: '4 ימים', location: 'יקנעם',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'תעשייה וייצור', field: 'ייצור מתכת', years: 7, size: '1000+', sector: 'ציבורי' },
        { industry: 'תעשייה וייצור', field: 'תעשיית הרובוטיקה', years: 3, size: '51-200', sector: 'פרטי' }
    ],
    highlights: [], level: 'בכיר', contact: { phone: '054-3334444', email: 'lior.m@email.com' },
    salaryExpectation: '22,000₪ - 26,000₪', languages: ['עברית - שפת אם', 'אנגלית - רמה גבוהה'], interests: ['תכנון מכני', 'רובוטיקה'],
    skills: ['SolidWorks', 'Ansys', 'תכנון 3D'],
    detailedExperience: [{ title: 'מהנדס מכונות', field: 'חברה ביטחונית', duration: '2017 - הווה' }],
    education: [{ title: 'תואר ראשון בהנדסת מכונות', institution: 'אוניברסיטת בן-גוריון', duration: '2013 - 2017' }],
    jobScopes: ['משרה מלאה'],
  },
  {
    id: 110, name: 'עדי כץ', title: 'אדריכלית', lastActive: 'שבוע', location: 'תל אביב',
    avatarUrl: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'בנייה ותשתיות', field: 'אדריכלות ועיצוב פנים', years: 6, size: '1-50', sector: 'פרטי' },
        { industry: 'בנייה ותשתיות', field: 'בנייה ירוקה', years: 2, size: '1-50', sector: 'פרטי' }
    ],
    highlights: [], level: 'מנוסה', contact: { phone: '050-4445555', email: 'adi.k@email.com' },
    salaryExpectation: '15,000₪ - 18,000₪', languages: ['עברית - שפת אם', 'אנגלית - טובה'], interests: ['בנייה ירוקה', 'עיצוב פנים'],
    skills: ['Revit', 'AutoCAD', 'SketchUp'],
    detailedExperience: [{ title: 'אדריכלית', field: 'משרד אדריכלים', duration: '2018 - הווה' }],
    education: [{ title: 'תואר באדריכלות', institution: 'בצלאל', duration: '2013 - 2018' }],
    jobScopes: ['משרה מלאה', 'היברידי'],
  },
  {
    id: 111, name: 'טל פרידמן', title: 'מנהל שרשרת אספקה', lastActive: 'היום', location: 'מודיעין',
    avatarUrl: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'תחבורה ולוגיסטיקה', field: 'הפצה ושרשרת אספקה', years: 12, size: '1000+', sector: 'ציבורי' },
        { industry: 'תחבורה ולוגיסטיקה', field: 'חברות שילוח', years: 5, size: '1000+', sector: 'פרטי' },
        { industry: 'תעשייה וייצור', field: 'ייצור מזון ומשקאות', years: 2, size: '1000+', sector: 'פרטי' }
    ],
    highlights: [], level: 'בכיר', contact: { phone: '058-5556666', email: 'tal.f@email.com' },
    salaryExpectation: '28,000₪ - 33,000₪', languages: ['עברית - שפת אם', 'אנגלית - רמה גבוהה'], interests: ['רכש', 'לוגיסטיקה בינלאומית'],
    skills: ['SAP', 'ניהול מלאי', 'רכש אסטרטגי'],
    detailedExperience: [{ title: 'מנהל שרשרת אספקה', field: 'חברת קמעונאות', duration: '2012 - הווה' }],
    education: [{ title: 'תואר שני בלוגיסטיקה', institution: 'אוניברסיטת בר-אילן', duration: '2015 - 2017' }],
    jobScopes: ['משרה מלאה'],
  },
  {
    id: 112, name: 'נועם דהן', title: 'טכנאי רובוטיקה', lastActive: 'יומיים', location: 'כרמיאל',
    avatarUrl: 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80',
    experience: [
        { industry: 'תעשייה וייצור', field: 'תעשיית הרובוטיקה', years: 4, size: '51-200', sector: 'פרטי' },
        { industry: 'תעשייה וייצור', field: 'ייצור מכשור ומוצרים משלימים', years: 2, size: '51-200', sector: 'פרטי' }
    ],
    highlights: [], level: 'מנוסה', contact: { phone: '052-6667777', email: 'noam.d@email.com' },
    salaryExpectation: '12,000₪ - 14,000₪', languages: ['עברית - שפת אם'], interests: ['אוטומציה', 'מכטרוניקה'],
    skills: ['PLC', 'Fanuc', 'Kuka', 'תחזוקה מונעת'],
    detailedExperience: [{ title: 'טכנאי רובוטיקה', field: 'מפעל תעשייתי', duration: '2020 - הווה' }],
    education: [{ title: 'הנדסאי מכטרוניקה', institution: 'מכללת אורט בראודה', duration: '2018 - 2020' }],
    jobScopes: ['משרה מלאה', 'משמרות'],
  }
];

const jobScopeOptions = ['משרה מלאה', 'משרה חלקית', 'משמרות', 'פרילנס', 'היברידי', 'משרת אם'];
const allRegions = ['צפון', 'דרום', 'מרכז', 'שרון', 'ירושלים והסביבה', 'יהודה ושומרון'];
const allCities = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'ראשון לציון', 'פתח תקווה', 'נתניה', 'אשדוד', 'חולון', 'רמת גן', 'הרצליה', 'גבעתיים', 'רחובות'];

type Location = { type: 'region' | 'city'; value: string };

// NEW LocationPopover component (Local definition for CandidatePoolView)
const LocationPopover: React.FC<{
    selectedLocations: Location[];
    onApply: (locations: Location[]) => void;
    onClose: () => void;
}> = ({ selectedLocations, onApply, onClose }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'cities' | 'regions'>('cities');
    const [internalSelection, setInternalSelection] = useState<Location[]>(selectedLocations);
    const [citySearch, setCitySearch] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose(); // Close on outside click without applying (user must click Apply)
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const handleToggle = (item: Location) => {
        setInternalSelection(prev => 
            prev.some(loc => loc.type === item.type && loc.value === item.value)
                ? prev.filter(loc => !(loc.type === item.type && loc.value === item.value))
                : [...prev, item]
        );
    };

    const filteredCities = allCities.filter(city => city.toLowerCase().includes(citySearch.toLowerCase()));

    return (
        <div ref={popoverRef} className="absolute top-full right-0 mt-2 bg-bg-card border border-border-default rounded-lg shadow-lg z-20 w-96">
            <div className="flex border-b border-border-default">
                <button onClick={() => setActiveTab('cities')} className={`flex-1 p-3 font-semibold text-sm ${activeTab === 'cities' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-muted'}`}>ערים</button>
                <button onClick={() => setActiveTab('regions')} className={`flex-1 p-3 font-semibold text-sm ${activeTab === 'regions' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-text-muted'}`}>אזורים</button>
            </div>
            <div className="p-2 space-y-2">
                {internalSelection.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-bg-subtle rounded-md">
                        {internalSelection.map(loc => (
                             <span key={`${loc.type}-${loc.value}`} className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
                                {loc.value}
                                <button onClick={() => handleToggle(loc)} className="mr-1.5 text-primary-500 hover:text-primary-700">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {activeTab === 'cities' && (
                    <div className="p-2">
                        <input type="text" value={citySearch} onChange={(e) => setCitySearch(e.target.value)} placeholder="חפש עיר..." className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                        <div className="max-h-40 overflow-y-auto mt-2 space-y-1">
                            {filteredCities.map(city => (
                                <label key={city} className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-hover cursor-pointer">
                                  <input type="checkbox" checked={internalSelection.some(loc => loc.type === 'city' && loc.value === city)} onChange={() => handleToggle({type: 'city', value: city})} className="w-4 h-4 text-primary-600 rounded" />
                                  <span className="text-sm">{city}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                {activeTab === 'regions' && (
                    <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
                        {allRegions.map(region => (
                            <label key={region} className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-hover cursor-pointer">
                                <input type="checkbox" checked={internalSelection.some(loc => loc.type === 'region' && loc.value === region)} onChange={() => handleToggle({type: 'region', value: region})} className="w-4 h-4 text-primary-600 rounded" />
                                <span className="text-sm">{region}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex justify-between items-center p-2 border-t border-border-default">
                <button onClick={() => setInternalSelection([])} className="text-sm font-semibold text-text-muted hover:text-primary-600">נקה הכל</button>
                <button onClick={() => onApply(internalSelection)} className="bg-primary-600 text-white font-semibold py-1.5 px-4 rounded-md">החל</button>
            </div>
        </div>
    );
};

const CandidatePoolView: React.FC = () => {
    const navigate = useNavigate();
    const { savedSearches, addSearch, deleteSearch } = useSavedSearches();
    const [searchParamsFromUrl] = useSearchParams();

    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedCandidate, setSelectedCandidate] = useState<any | null>(null);
    const [favorites, setFavorites] = useState<Set<number>>(new Set());
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    
    // --- Purchase State ---
    const [purchasedCandidates, setPurchasedCandidates] = useState<Set<number>>(new Set());
    const [purchaseModalInfo, setPurchaseModalInfo] = useState<{ isOpen: boolean, candidate: any | null }>({ isOpen: false, candidate: null });
    
    // Toast Feedback State
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

    // Advanced search states
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false); 
    const [isLocationPopoverOpen, setIsLocationPopoverOpen] = useState(false);
    const [isSavedSearchesOpen, setIsSavedSearchesOpen] = useState(false);
    const savedSearchesRef = useRef<HTMLDivElement>(null);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    
    // Saving search states
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [searchNameToSave, setSearchNameToSave] = useState('');

    const [searchParams, setSearchParams] = useState({
        mainFieldTags: [] as string[],
        jobScopes: jobScopeOptions, // Enabled by default
        locations: [] as Location[],
        interestRole: '', // Stores role from job field selector
        interestCategory: '', // Stores category from job field selector
        hasDegree: false,
        industryExperience: '',
    });
    
    const [mainFieldInput, setMainFieldInput] = useState('');
    const [languageFilters, setLanguageFilters] = useState<{ language: string; level: string }[]>([]);
    const [currentLanguage, setCurrentLanguage] = useState('אנגלית');
    const [currentLevel, setCurrentLevel] = useState('רמה גבוהה');
    
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    
    // Company Filter state
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industry: string;
        field: string;
    }>({ sizes: [], sectors: [], industry: '', field: '' });
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (savedSearchesRef.current && !savedSearchesRef.current.contains(event.target as Node)) {
                setIsSavedSearchesOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-dismiss toast effect
    useEffect(() => {
        if (feedbackMessage) {
            const timer = setTimeout(() => setFeedbackMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);

    const toggleFavorite = (candidateId: number) => {
        setFavorites(prev => {
            const newSet = new Set(prev);
            if (newSet.has(candidateId)) {
                newSet.delete(candidateId);
            } else {
                newSet.add(candidateId);
            }
            return newSet;
        });
    };

    const handlePurchase = (candidate: any) => {
        setPurchasedCandidates(prev => new Set(prev).add(candidate.id));
        setPurchaseModalInfo({ isOpen: true, candidate });
        // After purchase, the card should refresh.
    };

    const handleClosePurchaseModal = () => {
        setPurchaseModalInfo({ isOpen: false, candidate: null });
    };

    const handleViewProfile = (candidate: any) => {
        setSelectedCandidate(candidate);
    };

    const handleCloseDrawer = () => {
        setSelectedCandidate(null);
    };

    const filteredCandidates = useMemo(() => {
        return candidatePoolData.filter(c => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSimpleSearch = !searchLower ||
                c.name.toLowerCase().includes(searchLower) ||
                c.title.toLowerCase().includes(searchLower) ||
                c.skills.some(skill => skill.toLowerCase().includes(searchLower));

            const matchesMainTags = searchParams.mainFieldTags.length === 0 || 
                searchParams.mainFieldTags.some(tag => {
                    const tagLower = tag.toLowerCase();
                    return c.name.toLowerCase().includes(tagLower) ||
                           c.title.toLowerCase().includes(tagLower) ||
                           c.skills.some(skill => skill.toLowerCase().includes(tagLower)) ||
                           c.highlights.some(h => h.toLowerCase().includes(tagLower)) ||
                           c.interests.some(i => i.toLowerCase().includes(tagLower));
                });

            const matchesLocation = searchParams.locations.length === 0 ||
                searchParams.locations.some(loc => 
                    (loc.type === 'city' && c.location === loc.value) ||
                    (loc.type === 'region' && 
                        ((loc.value === 'מרכז' && ['תל אביב', 'רמת גן', 'גבעתיים', 'חולון'].includes(c.location)) ||
                         (loc.value === 'שרון' && ['הרצליה'].includes(c.location)) ||
                         (loc.value === 'דרום' && ['רחובות'].includes(c.location))
                        )
                    )
                );
            
            const matchesInterest = !searchParams.interestRole ||
                c.interests.some(interest => interest.toLowerCase().includes(searchParams.interestRole.toLowerCase())) ||
                c.title.toLowerCase().includes(searchParams.interestRole.toLowerCase());

            const matchesDegree = !searchParams.hasDegree || 
                c.highlights.some(h => h.includes('תואר'));
            
            const matchesLanguage = languageFilters.length === 0 ||
                languageFilters.every(filter => 
                    c.languages.some(lang => lang.toLowerCase().includes(filter.language.toLowerCase()))
                );

            const matchesJobScope = searchParams.jobScopes.length === 0 ||
                searchParams.jobScopes.some(scope => c.jobScopes.includes(scope));
            
            const matchesIndustryFilter = !searchParams.industryExperience ||
                c.experience.some(exp => exp.industry === searchParams.industryExperience);
            
            const matchesFavorites = !showFavoritesOnly || favorites.has(c.id);

            const matchesCompanyFilters = () => {
                const { industry, field, sizes, sectors } = companyFilters;
                if (!industry && !field && sizes.length === 0 && sectors.length === 0) {
                    return true;
                }
                return c.experience.some(exp => {
                    const industryMatch = !industry || exp.industry === industry;
                    const fieldMatch = !field || exp.field === field;
                    const sizeMatch = sizes.length === 0 || (exp.size && sizes.includes(exp.size));
                    const sectorMatch = sectors.length === 0 || (exp.sector && sectors.includes(exp.sector));
                    return industryMatch && fieldMatch && sizeMatch && sectorMatch;
                });
            };

            return matchesSimpleSearch && matchesMainTags && matchesLocation && matchesInterest && matchesDegree && matchesLanguage && matchesFavorites && matchesJobScope && matchesIndustryFilter && matchesCompanyFilters();
        });
    }, [searchTerm, searchParams, languageFilters, showFavoritesOnly, favorites, companyFilters]);

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        setSelectedIds(new Set());
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const areAllVisibleSelected = useMemo(() => {
        if (filteredCandidates.length === 0) return false;
        return filteredCandidates.every(c => selectedIds.has(c.id));
    }, [selectedIds, filteredCandidates]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredCandidates.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };
    
    const handleMainFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && mainFieldInput.trim()) {
            e.preventDefault();
            const newTags = mainFieldInput.split(',').map(tag => tag.trim()).filter(tag => tag);
            const uniqueNewTags = newTags.filter(tag => !searchParams.mainFieldTags.includes(tag));
            if (uniqueNewTags.length > 0) {
                setSearchParams(prev => ({ ...prev, mainFieldTags: [...prev.mainFieldTags, ...uniqueNewTags] }));
            }
            setMainFieldInput('');
        }
    };
    
    const handleRemoveMainFieldTag = (tagToRemove: string) => {
        setSearchParams(prev => ({ ...prev, mainFieldTags: prev.mainFieldTags.filter(tag => tag !== tagToRemove) }));
    };

    const handleJobScopeToggle = (scope: string) => {
        setSearchParams(prev => {
            const newScopes = prev.jobScopes.includes(scope)
                ? prev.jobScopes.filter(s => s !== scope)
                : [...prev.jobScopes, scope];
            return { ...prev, jobScopes: newScopes };
        });
    };

    const handleAddLanguage = () => {
        if (currentLanguage && currentLevel && !languageFilters.some(f => f.language === currentLanguage)) {
            setLanguageFilters(prev => [...prev, { language: currentLanguage, level: currentLevel }]);
        }
    };

    const handleRemoveLanguage = (languageToRemove: string) => {
        setLanguageFilters(prev => prev.filter(f => f.language !== languageToRemove));
    };

    const handleInterestSelect = (value: SelectedJobField | null) => {
        if (value) {
            setSearchParams(prev => ({
                ...prev,
                interestRole: value.role,
                interestCategory: value.category
            }));
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleIndustryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSearchParams(prev => ({ ...prev, industryExperience: e.target.value }));
    };

    const handleShowResults = () => {
        setIsAdvancedSearchOpen(false);
        setFeedbackMessage(`נמצאו ${filteredCandidates.length} מועמדים תואמים`);
        // Optional: Scroll to top of results if needed
        const mainContainer = document.querySelector('main');
        if (mainContainer) mainContainer.scrollTop = 0;
    };

    // --- Save Search Logic ---
    const handleOpenSaveModal = () => {
        setSearchNameToSave('');
        setIsSaveModalOpen(true);
    };

    const handleSaveSearch = () => {
        if (!searchNameToSave.trim()) return;
        
        // Bundle the state into a single object
        const currentFilters = {
            searchTerm,
            params: searchParams,
            languages: languageFilters
        };

        addSearch(searchNameToSave, false, currentFilters, [], []); // simplified for this view
        setIsSaveModalOpen(false);
    };

    const handleLoadSearch = (searchId: number) => {
        const search = savedSearches.find(s => s.id === searchId);
        if (search) {
            setSearchTerm(search.searchParams.searchTerm || '');
            setSearchParams(search.searchParams.params);
            setLanguageFilters(search.searchParams.languages || []);
            setIsSavedSearchesOpen(false);
        }
    };
    
    const handleDeleteSearch = (e: React.MouseEvent, searchId: number) => {
        e.stopPropagation();
        if (window.confirm("האם למחוק את החיפוש השמור?")) {
             deleteSearch(searchId);
        }
    };
    
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
    };


    return (
        <div className="flex flex-col gap-6 h-full">
            <style>{`
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; } 
                @keyframes slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fade-in-out {
                    0%, 100% { opacity: 0; transform: translateY(-20px); }
                    10%, 90% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-out {
                    animation: fade-in-out 3s ease-in-out forwards;
                }
            `}</style>
            
            {feedbackMessage && (
                <div className="fixed top-24 right-6 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>{feedbackMessage}</span>
                </div>
            )}

            {/* Main Search Bar */}
            <header className="flex flex-col md:flex-row items-center gap-3 bg-bg-card p-3 rounded-2xl shadow-sm border border-border-default sticky top-0 z-20">
                 <div className="relative flex-grow w-full">
                     <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder="חיפוש מועמד לפי שם, תפקיד או כישורים..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-12 text-base focus:ring-primary-500 focus:border-primary-300 transition shadow-sm" 
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                    {/* Saved Searches (Clock Icon) - Now handling Saved Searches */}
                    <div className="relative" ref={savedSearchesRef}>
                        <button
                            onClick={() => setIsSavedSearchesOpen(!isSavedSearchesOpen)}
                            className={`p-3 border rounded-xl transition-colors ${isSavedSearchesOpen ? 'bg-primary-100 border-primary-300 text-primary-700' : 'bg-bg-subtle border-border-default text-text-muted hover:text-primary-600 hover:border-primary-300'}`}
                            title="חיפושים שמורים"
                        >
                            <ClockIcon className="w-5 h-5" />
                        </button>
                        {isSavedSearchesOpen && (
                            <div className="absolute top-full left-0 mt-2 w-72 bg-bg-card rounded-xl shadow-xl border border-border-default z-30 p-2">
                                <h4 className="text-xs font-bold text-text-muted px-2 py-1 border-b border-border-default mb-1">חיפושים שמורים</h4>
                                {savedSearches.length === 0 ? (
                                    <div className="p-2 text-sm text-text-subtle text-center">אין חיפושים שמורים</div>
                                ) : (
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                        {savedSearches.map(search => (
                                            <div key={search.id} onClick={() => handleLoadSearch(search.id)} className="flex justify-between items-center w-full text-right text-sm p-2 hover:bg-bg-hover rounded-lg text-text-default transition-colors cursor-pointer group">
                                                <div className="flex flex-col overflow-hidden">
                                                    <span className="truncate font-medium">{search.name}</span>
                                                    <span className="text-xs text-text-subtle">{formatDate(search.id)}</span>
                                                </div>
                                                <button 
                                                    onClick={(e) => handleDeleteSearch(e, search.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-text-subtle hover:text-red-500 transition-opacity bg-bg-subtle rounded-md ml-2"
                                                    title="מחק חיפוש"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                        className={`p-3 rounded-xl border-2 transition-all ${showFavoritesOnly ? 'border-primary-500 bg-primary-50 text-primary-700' : 'bg-bg-subtle border-border-default text-text-muted hover:border-primary-300 hover:text-primary-600'}`}
                        title="המועדפים שלי"
                    >
                        {showFavoritesOnly ? <BookmarkIconSolid className="w-5 h-5" /> : <BookmarkIcon className="w-5 h-5" />}
                    </button>

                    <button onClick={toggleSelectionMode} className={`p-3 rounded-xl border-2 transition-all ${selectionMode ? 'border-primary-500 bg-primary-50 text-primary-700' : 'bg-bg-subtle border-border-default text-text-muted hover:border-primary-300 hover:text-primary-600'}`} title="בחירה מרובה">
                         <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    
                     <button
                        ref={companyFilterButtonRef}
                        onClick={() => setIsCompanyFilterOpen(prev => !prev)}
                        className={`flex items-center gap-2 font-semibold py-3 px-4 rounded-xl border-2 transition-all whitespace-nowrap ${
                            isCompanyFilterOpen
                                ? 'bg-primary-100 text-primary-700 border-primary-300'
                                : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'
                        }`}
                    >
                        <BuildingOffice2Icon className="w-5 h-5" />
                        <span className="hidden sm:inline">רקע תעסוקתי</span>
                    </button>
                     {isCompanyFilterOpen && (
                        <CompanyFilterPopover
                        onClose={() => setIsCompanyFilterOpen(false)}
                        filters={companyFilters}
                        setFilters={setCompanyFilters}
                        />
                    )}

                    <button 
                        onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} 
                        className={`flex items-center gap-2 font-semibold py-3 px-4 rounded-xl border-2 transition-all ${isAdvancedSearchOpen ? 'bg-primary-600 text-white border-primary-600' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`}
                    >
                        <AdjustmentsHorizontalIcon className="w-5 h-5" />
                        <span className="hidden sm:inline">סינון</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`}/>
                    </button>

                     <div className="flex items-center bg-bg-subtle p-1.5 rounded-xl border border-border-default">
                        <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('list')} title="תצוגת רשימה" className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                    </div>
                </div>
            </header>
            
            {/* Advanced Search Panel */}
            {isAdvancedSearchOpen && (
                 <div className="bg-bg-card rounded-2xl shadow-sm p-6 border border-border-default animate-slide-up">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {/* Row 1 */}
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">תגיות וכישורים</label>
                            <div className="w-full bg-bg-input border border-border-default rounded-xl p-2 flex items-center flex-wrap gap-2 min-h-[46px] focus-within:ring-2 focus-within:ring-primary-500 transition-shadow">
                                {searchParams.mainFieldTags.map((tag, index) => (
                                    <span key={index} className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full animate-fade-in">
                                        {tag}
                                        <button onClick={() => handleRemoveMainFieldTag(tag)} className="mr-1 text-primary-500 hover:text-primary-700"><XMarkIcon className="h-3 w-3" /></button>
                                    </span>
                                ))}
                                <input 
                                    type="text" 
                                    value={mainFieldInput} 
                                    onChange={(e) => setMainFieldInput(e.target.value)} 
                                    onKeyDown={handleMainFieldKeyDown} 
                                    placeholder="הקלד תגית ולחץ Enter..." 
                                    className="flex-grow bg-transparent outline-none text-sm min-w-[120px]" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">מיקום</label>
                             <div className="relative">
                                <button onClick={() => setIsLocationPopoverOpen(!isLocationPopoverOpen)} className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-3 text-sm flex justify-between items-center text-right hover:border-primary-300 transition-colors">
                                    <span className="truncate">{searchParams.locations.length > 0 ? `${searchParams.locations.length} מיקומים נבחרו` : 'בחר אזור או עיר'}</span>
                                    <ChevronDownIcon className="w-4 h-4 text-text-subtle" />
                                </button>
                                 {isLocationPopoverOpen && (
                                    <LocationPopover
                                        selectedLocations={searchParams.locations}
                                        onApply={(newLocations) => { setSearchParams(prev => ({ ...prev, locations: newLocations })); setIsLocationPopoverOpen(false); }}
                                        onClose={() => setIsLocationPopoverOpen(false)}
                                    />
                                )}
                            </div>
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">סטטוס</label>
                            <select className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-3 text-sm focus:ring-primary-500 focus:border-primary-500">
                                <option>הכל</option>
                                <option>פעיל</option>
                                <option>לא פעיל</option>
                            </select>
                        </div>

                        {/* Row 2 */}
                         <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">היקף משרה</label>
                            <div className="flex flex-wrap gap-2">
                                {jobScopeOptions.map(scope => (
                                    <button
                                        key={scope}
                                        onClick={() => handleJobScopeToggle(scope)}
                                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                            searchParams.jobScopes.includes(scope)
                                                ? 'bg-primary-100 text-primary-700 border border-primary-200 shadow-sm'
                                                : 'bg-bg-subtle text-text-muted border border-transparent hover:bg-bg-hover'
                                        }`}
                                    >
                                        {scope}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">תחום עניין / תפקיד</label>
                             <button 
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-3 text-sm flex justify-between items-center text-right hover:border-primary-300 transition-colors"
                            >
                                <span className="truncate">{searchParams.interestRole || 'בחר תחום או תפקיד...'}</span>
                                <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">ניסיון בתעשייה</label>
                             <select 
                                value={searchParams.industryExperience} 
                                onChange={handleIndustryChange} 
                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 px-3 text-sm focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="">כל התעשיות</option>
                                {/* We need to define `allIndustries` or import it. 
                                    Assuming it might be derived from data or constant. 
                                    For now, hardcoding a few based on mock data context. */}
                                <option value="תעשייה וייצור">תעשייה וייצור</option>
                                <option value="תחבורה ולוגיסטיקה">תחבורה ולוגיסטיקה</option>
                                <option value="הייטק">הייטק</option>
                            </select>
                        </div>

                        {/* Row 3 */}
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">השכלה</label>
                             <button 
                                onClick={() => setSearchParams(p => ({ ...p, hasDegree: !p.hasDegree }))} 
                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${searchParams.hasDegree ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' : 'bg-bg-input border-border-default text-text-muted hover:border-primary-300'}`}
                            >
                                <span className="font-semibold text-sm">בעל תואר אקדמי</span>
                                {searchParams.hasDegree ? <CheckCircleIcon className="w-5 h-5" /> : <AcademicCapIcon className="w-5 h-5 opacity-50"/>}
                            </button>
                        </div>
                        <div className="lg:col-span-2">
                             <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">שפות</label>
                             <div className="flex gap-2">
                                <select value={currentLanguage} onChange={(e) => setCurrentLanguage(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm"><option>עברית</option><option>אנגלית</option><option>רוסית</option></select>
                                <select value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm"><option>רמת שפת אם</option><option>רמה גבוהה</option></select>
                                <button onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 p-2 rounded-xl hover:bg-primary-200 transition"><PlusIcon className="w-5 h-5"/></button>
                             </div>
                             <div className="flex flex-wrap gap-2 mt-2 min-h-[28px]">
                                {languageFilters.map(filter => (
                                    <span key={filter.language} className="flex items-center bg-sky-50 text-sky-700 text-xs font-semibold px-2 py-1 rounded-lg border border-sky-100">
                                        {filter.language}: {filter.level}
                                        <button onClick={() => handleRemoveLanguage(filter.language)} className="mr-1 hover:text-red-500"><XMarkIcon className="h-3 w-3" /></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border-default flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <button onClick={() => {setSearchParams(prev => ({...prev, mainFieldTags: [], locations: [], interestRole: '', industryExperience: '', hasDegree: false, jobScopes: jobScopeOptions})); setLanguageFilters([]); setMainFieldInput('');}} className="text-sm font-semibold text-text-muted hover:text-red-500 transition-colors">
                                נקה הכל
                            </button>
                            <button onClick={handleOpenSaveModal} className="flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-2 rounded-lg hover:bg-primary-100 transition">
                                <BookmarkIcon className="w-4 h-4"/>
                                <span>שמור חיפוש</span>
                            </button>
                        </div>
                        <button onClick={handleShowResults} className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20">
                            הצג תוצאות
                        </button>
                    </div>
                 </div>
            )}

            <main className="flex-1 overflow-y-auto">
                {filteredCandidates.length > 0 ? (
                     viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {filteredCandidates.map(candidate => (
                                <div key={candidate.id} className={`relative`}>
                                    <PoolCandidateCard 
                                        candidate={candidate}
                                        onViewProfile={() => handleViewProfile(candidate)}
                                        isFavorite={favorites.has(candidate.id)}
                                        onToggleFavorite={toggleFavorite}
                                        isSelected={selectedIds.has(candidate.id)}
                                        onSelect={handleSelect}
                                        selectionMode={selectionMode}
                                        isPurchased={purchasedCandidates.has(candidate.id)} // Pass purchase state
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm">
                            <div className="divide-y divide-border-default">
                                <div className={`hidden lg:grid ${selectionMode ? 'grid-cols-[auto_auto_2fr_1.5fr_1fr_1fr]' : 'grid-cols-[auto_2fr_1.5fr_1fr_1fr]'} gap-4 px-4 py-3 text-xs font-bold text-text-subtle uppercase bg-bg-subtle`}>
                                     {selectionMode && <div className="w-5 flex items-center"><input type="checkbox" onChange={handleSelectAll} checked={areAllVisibleSelected} className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500" /></div>}
                                    <span>מועמד</span>
                                    <span>דגשים</span>
                                    <span>פעילות אחרונה</span>
                                    <span></span>
                                </div>
                                {filteredCandidates.map(candidate => (
                                    <CandidateRow 
                                        key={candidate.id} 
                                        candidate={candidate as any} 
                                        onViewProfile={() => handleViewProfile(candidate)} 
                                        selectionMode={selectionMode} 
                                        isSelected={selectedIds.has(candidate.id)} 
                                        onSelect={handleSelect} 
                                    />
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                     <div className="flex flex-col items-center justify-center h-64 text-center text-text-muted">
                        <MagnifyingGlassIcon className="w-16 h-16 text-text-subtle mb-4 opacity-20" />
                        <h3 className="text-xl font-bold text-text-default">לא נמצאו מועמדים</h3>
                        <p>נסה לשנות את הגדרות החיפוש או נקה את הפילטרים.</p>
                    </div>
                )}
            </main>
            
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
                    <div className="bg-bg-card text-text-default rounded-full shadow-2xl border border-border-default px-6 py-3 flex items-center gap-6 animate-slide-up">
                        <span className="font-bold text-primary-600">{selectedIds.size} נבחרו</span>
                        <div className="h-6 w-px bg-border-default"></div>
                        <button className="font-semibold hover:text-primary-600 transition-colors flex items-center gap-2">
                            <FolderIcon className="w-5 h-5"/> הוסף למאגר שלי
                        </button>
                        <button className="font-semibold hover:text-primary-600 transition-colors flex items-center gap-2">
                            <EnvelopeIcon className="w-5 h-5"/> שלח הודעה
                        </button>
                        <button onClick={() => setSelectedIds(new Set())} className="p-1 bg-bg-subtle rounded-full hover:bg-bg-hover ml-2">
                            <XMarkIcon className="w-4 h-4 text-text-muted"/>
                        </button>
                    </div>
                </div>
            )}

            {/* Save Search Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-bg-card rounded-xl shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">שמור חיפוש</h3>
                        <input
                            type="text"
                            value={searchNameToSave}
                            onChange={e => setSearchNameToSave(e.target.value)}
                            placeholder="תן שם לחיפוש (לדוגמה: מפתחי ריאקט בתל אביב)"
                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 mb-4 focus:ring-primary-500 focus:border-primary-500"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsSaveModalOpen(false)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                            <button onClick={handleSaveSearch} className="bg-primary-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-700">שמור</button>
                        </div>
                    </div>
                </div>
            )}

            <CandidatePoolProfileDrawer 
                candidate={selectedCandidate} 
                isOpen={!!selectedCandidate} 
                onClose={handleCloseDrawer}
                onPurchase={handlePurchase}
                isFavorite={selectedCandidate ? favorites.has(selectedCandidate.id) : false}
                onToggleFavorite={toggleFavorite}
                isPurchased={selectedCandidate ? purchasedCandidates.has(selectedCandidate.id) : false} // Pass status
             />
             <PurchaseCandidateModal
                isOpen={purchaseModalInfo.isOpen}
                onClose={handleClosePurchaseModal}
                candidate={purchaseModalInfo.candidate}
            />
             <JobFieldSelector
                onChange={handleInterestSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
        </div>
    );
};

export default CandidatePoolView;
