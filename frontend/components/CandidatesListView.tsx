
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, Cog6ToothIcon, AvatarIcon, ChevronDownIcon, ArrowPathIcon,
    TargetIcon, CalendarIcon, BriefcaseIcon, PencilIcon, WalletIcon, GenderMaleIcon, GenderFemaleIcon, UserIcon,
    AcademicCapIcon, LanguageIcon, XMarkIcon, MapPinIcon, TableCellsIcon, Squares2X2Icon, ExclamationTriangleIcon,
    ChevronUpIcon, BookmarkIcon, CheckCircleIcon, DocumentTextIcon, ArrowTopRightOnSquareIcon, FolderIcon, ArchiveBoxIcon, ChatBubbleBottomCenterTextIcon, EnvelopeIcon, WhatsappIcon,
    BookmarkIconSolid, CheckIcon, AdjustmentsHorizontalIcon, BuildingOffice2Icon, MinusIcon, SparklesIcon, FunnelIcon,
    DocumentArrowDownIcon
} from './Icons';
import { SavedSearch, useSavedSearches } from '../context/SavedSearchesContext';
import CompanyFilterPopover from './CompanyFilterPopover';
import CandidateCard from './CandidateCard';
import CandidateRow from './CandidateRow';
import DevAnnotation from './DevAnnotation';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import LocationSelector, { LocationItem } from './LocationSelector';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import TagSelectorModal, { type TagOption } from './TagSelectorModal';
import BulkAddToFilterModal from './BulkAddToFilterModal';
import ScreeningCollisionWarningModal, { type ScreeningWarningAgg } from './ScreeningCollisionWarningModal';
import BulkReferModal, { type BulkReferSuccessSummary } from './BulkReferModal';
import BulkChangeStatusModal from './BulkChangeStatusModal';
import BulkAddToSavedSearchModal from './BulkAddToSavedSearchModal';
import ChangeSourceModal from './ChangeSourceModal';
import EventFormModal, { type Event as BulkCandidateEventFormData } from './EventFormModal';
import { WorkingHoursInput } from './WorkingHoursInput';
import type { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import { useScreenTablePreferences } from '../hooks/useScreenTablePreferences';
import { useAuth } from '../context/AuthContext';
import { deriveLocalCandidateId } from '../utils/candidateId';
import { formatCandidatePoolLastActive } from '../utils/formatCandidatePoolLastActive';
import {
    CANDIDATES_EXPORT_FIELD_ORDER,
    type CandidatesExportFieldKey,
    buildCandidatesExportCsv,
    exportRowFromCandidate,
    triggerCsvDownload,
} from '../utils/candidatesExportCsv';
import {
    MatchScoreBreakdownPanel,
    type MatchScoreBreakdownData,
    type ParameterMatchesMap,
} from './MatchScoreBreakdownPanel';
import { candidateToSonarRecord } from '../utils/sonarMatchBreakdown';
import { clampCenteredPopoverX } from '../utils/clampPopoverPosition';
import { ComplexQueryBuilder } from './ComplexQueryComponents';
import { complexRulesHaveValue, serializeComplexRulesForApi, type ComplexFilterRule } from '../utils/complexQuery';
import { fetchCandidatesListResponse } from '../utils/candidatesListApi';
import { fetchSavedSearchBlacklist, type EnrichedBlacklistEntry } from '../services/savedSearchesApi';

const MATCH_POPUP_WIDTH = 288;

/** Match API max page size for candidate list export. */
const CANDIDATES_EXPORT_PAGE_SIZE = 500;

const eventApiHeaders = (withJson: boolean): Record<string, string> => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (withJson) h['Content-Type'] = 'application/json';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
};

/** List scoring uses the logged-in user's client preset — requires Bearer token. */
const candidatesListFetchInit = (): RequestInit => ({
    headers: eventApiHeaders(false),
    cache: 'no-store',
});

/** Blue ring when an advanced filter differs from its default. */
const advFieldModifiedClass = 'ring-2 ring-primary-500 rounded-xl';

/** Snapshot sent to GET /api/candidates?adv=… when user applies advanced search */
interface AppliedAdvancedSearchPayload {
    gender: 'any' | 'male' | 'female';
    statusFilter: string;
    tags: string[];
    locations: { type: LocationItem['type']; value: string }[];
    jobScopes: string[];
    jobScopeAll: boolean;
    lastUpdated: DateRange | null;
    /** Job-field category from JobFieldSelector (תחום עליון) */
    interestField: string;
    interestRole: string;
    interestDate: DateRange | null;
    ageMin: number;
    ageMax: number;
    salaryMin: number;
    salaryMax: number;
    /** כלול גיל לא ידוע — when true, candidates with no parseable age are also returned. */
    includeUnknownAge: boolean;
    /** כלול ציפיות שכר לא ידועות — when true, candidates with no salary fields are also returned. */
    includeUnknownSalary: boolean;
    hasDegree: boolean;
    languages: { language: string; level: string }[];
    complexRules: Record<string, unknown>[];
    /** Matches `candidates.preferredWorkingHours` (fallback: legacy `availability`). Ignored when גמיש / empty. */
    workingHours: string;
    /** Company background filters — sent to backend for JSONB cross-experience search */
    companyFilters?: {
        industries: string[];
        fields: string[];
        roles: string[];
        sizes: string[];
        sectors: string[];
    };
}

export interface Candidate {
  id: number; // local numeric id for UI
  backendId?: string; // actual id from backend
  name: string;
  avatar: string;
  title: string;
  status: string;
  lastActivity: string;
  source: string;
  tags: string[];
  internalTags: string[];
  matchScore: number;
  /** True when list API (or client hydrate) provided an engine score — not the 0 default. */
  listMatchScoreFromApi?: boolean;
  /** Filled via simulate when list API omitted scores (older backend). */
  matchScoreHydrated?: boolean;
  matchAnalysis?: {
      jobTitle: string;
      reason: string;
  };
  scoreBreakdown?: MatchScoreBreakdownData | null;
  parameterMatches?: ParameterMatchesMap | null;
  address?: string;
  phone: string;
  industry?: string;
  field?: string;
  sector?: string;
  companySize?: string;
  /** Denormalized array of all company experiences for +N tooltip */
  companyExperiences?: { company: string; industry: string; sector: string; companySize: string; isCurrent: boolean }[];
  // Enhanced fields for display
  professionalSummary?: string;
  industryAnalysis?: {
      industries: { label: string; percentage: number; color: string }[];
      smartTags?: {
          domains: string[];
          orgDNA: {
              label: string;
              subLabel: string;
              icon?: any;
          }
      };
  };
  resumeUrl?: string;
  /** רשימת תחומי עיסוק / היקף (מסונכרן עם חיפוש מתקדם) */
  jobScopes?: string[];
  /** שפות מובנה מה-API (JSONB): name / level / levelText (+ legacy language) */
  languages?: { name?: string; language?: string; level?: string | number; levelText?: string }[];
  gender?: string;
  age?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** מיקום / כתובת לתצוגה בטבלה */
  location?: string;
  /** תאריך קליטה — מסונכרן מ-createdAt ב-API */
  createDate?: string;
  email?: string;
  /** Recruitment timeline (emoji options), maps to API `availability`. */
  availability?: string;
  /** Preferred daily hours (`WorkingHoursInput`), maps to API `preferredWorkingHours`. */
  preferredWorkingHours?: string;
  /** Latest explicit job_candidates row (by activity); enriched by list API for grid. */
  lastJobSubmission?: {
    jobId: string;
    jobCandidateId: string;
    jobTitle: string;
    matchScore: number;
    linkedAt?: string;
    scoreBreakdown?: MatchScoreBreakdownData | null;
    parameterMatches?: ParameterMatchesMap | null;
  } | null;
  /** From complex-query free-text search (API). */
  matchedTerms?: string[];
  matchReasons?: { field: string; term: string; source?: string; snippet?: string }[];
}

export const candidatesData: Candidate[] = [
  { 
      id: 1, 
      name: 'שפירא גדעון', 
      avatar: 'שג', 
      title: 'מנהל שיווק', 
      status: 'עבר בדיקה ראשונית', 
      lastActivity: '14:01 28/05/2025', 
      source: 'AllJobs', 
      tags: ['ניהול', 'שיווק דיגיטלי', 'PPC'], 
      internalTags: ['מתאים גם לניהול מוצר'], 
      matchScore: 92,
      matchAnalysis: {
          jobTitle: 'מנהל/ת שיווק דיגיטלי',
          reason: 'התאמה גבוהה מאוד. למועמד ניסיון ניהולי מוכח ורקע חזק ב-PPC, התואם את דרישות הליבה של המשרה.'
      },
      address: 'תל אביב', 
      phone: '054-1234567',
      industry: 'תעשייה וייצור',
      field: 'ייצור מזון ומשקאות',
      sector: 'פרטי',
      companySize: '200-1000',
      professionalSummary: 'מנהל שיווק מנוסה עם התמחות בטרנספורמציה דיגיטלית והובלת צוותים גלובליים.',
      industryAnalysis: {
          industries: [
              { label: 'קמעונאות', percentage: 60, color: 'bg-primary-500' },
              { label: 'טכנולוגיה', percentage: 40, color: 'bg-secondary-400' },
          ],
          smartTags: {
              domains: ['שיווק', 'אסטרטגיה'],
              orgDNA: { label: 'Enterprise', subLabel: 'ארגון גדול' }
          }
      }
  },
  { 
      id: 2, 
      name: 'כהן מאיה', 
      avatar: 'כמ', 
      title: 'מפתחת Fullstack', 
      status: 'חדש', 
      lastActivity: '11:23 27/05/2025', 
      source: 'LinkedIn', 
      tags: ['React', 'Node.js', 'TypeScript'], 
      internalTags: [], 
      matchScore: 85, 
      matchAnalysis: {
          jobTitle: 'מפתח/ת Fullstack',
          reason: 'התאמה טובה. שולטת בטכנולוגיות הנדרשות (React, Node), אך חסר ניסיון בניהול צוות.'
      },
      address: 'חיפה', 
      phone: '052-2345678', 
      industry: 'תעשייה וייצור', 
      field: 'ייצור שבבים', 
      sector: 'ציבורי', 
      companySize: '1000+',
      professionalSummary: 'מפתחת מוכשרת עם 5 שנות ניסיון בבניית מערכות SaaS מורכבות בסביבת ענן.',
      industryAnalysis: {
          industries: [
              { label: 'הייטק (SaaS)', percentage: 80, color: 'bg-purple-500' },
              { label: 'פינטק', percentage: 20, color: 'bg-indigo-400' },
          ]
      }
  },
  { 
      id: 3, 
      name: 'לוי דוד', 
      avatar: 'לד', 
      title: 'מעצב UX/UI', 
      status: 'חדש', 
      lastActivity: '09:05 27/05/2025', 
      source: 'חבר מביא חבר', 
      tags: ['Figma', 'UX', 'Mobile Design'], 
      internalTags: [], 
      matchScore: 65,
      matchAnalysis: {
          jobTitle: 'מעצב/ת מוצר',
          reason: 'התאמה בינונית. תיק העבודות מרשים אך חסר ניסיון במערכות מורכבות (B2B).'
      },
      phone: '053-3456789', 
      industry: 'הייטק', 
      field: 'עיצוב', 
      sector: 'פרטי', 
      companySize: '51-200',
      professionalSummary: 'מעצב מוצר יצירתי המתמחה בחווית משתמש למובייל ועיצוב ממשקים נקיים.',
      industryAnalysis: {
          industries: [
              { label: 'דיגיטל', percentage: 50, color: 'bg-orange-500' },
              { label: 'פרסום', percentage: 30, color: 'bg-yellow-400' },
              { label: 'הייטק', percentage: 20, color: 'bg-red-400' },
          ]
      }
  }, 
  { 
      id: 4, 
      name: 'ישראלי יעל', 
      avatar: 'יי', 
      title: '', 
      status: 'בבדיקה', 
      lastActivity: '18:45 26/05/2025', 
      source: 'Ethosia', 
      tags: ['QA', 'Automation', 'Selenium'], 
      internalTags: [], 
      matchScore: 45, 
      matchAnalysis: {
          jobTitle: 'ראש צוות QA',
          reason: 'התאמה נמוכה. חסר ניסיון ניהולי וניסיון בפיתוח תשתיות אוטומציה מאפס.'
      },
      address: 'ירושלים', 
      phone: '050-4567890', 
      industry: 'הייטק', 
      field: 'QA', 
      sector: 'ציבורי', 
      companySize: '1000+',
      professionalSummary: 'בודקת תוכנה יסודית עם רקע חזק במתודולוגיות בדיקה ומערכות מידע.',
      industryAnalysis: {
          industries: [
              { label: 'ביטחוני', percentage: 70, color: 'bg-slate-600' },
              { label: 'בנקאות', percentage: 30, color: 'bg-slate-400' },
          ]
      }
  }, 
  { id: 5, name: 'מזרחי אבי', avatar: 'מא', title: 'מנהל מוצר', status: 'ראיון HR', lastActivity: '16:30 25/05/2025', source: 'GotFriends', tags: [], internalTags: [], matchScore: 25, address: 'באר שבע', phone: '058-5678901', industry: 'הייטק', field: 'ניהול מוצר', sector: 'פרטי', companySize: '51-200', professionalSummary: 'מנהל מוצר מנוסה בהובלת מוצרי B2B משלב הרעיון ועד להשקה.', industryAnalysis: { industries: [{ label: 'הייטק', percentage: 100, color: 'bg-blue-500' }] } }, 
  { id: 6, name: 'יוסי לוי', avatar: 'יל', title: 'אנליסט נתונים', status: 'חדש', lastActivity: '10:15 24/05/2025', source: 'JobMaster', tags: ['SQL', 'Excel', 'ניתוח נתונים'], internalTags: [], matchScore: 78, address: 'רמת גן', phone: '054-6789012', industry: 'פיננסים', field: 'Data', sector: 'פרטי', companySize: '200-1000', professionalSummary: 'אנליסט נתונים עם יכולות אנליטיות גבוהות ושליטה בכלי BI מתקדמים.', industryAnalysis: { industries: [{ label: 'פיננסים', percentage: 60, color: 'bg-green-600' }, { label: 'ביטוח', percentage: 40, color: 'bg-green-400' }] } },
  { id: 7, name: 'רינה כהן', avatar: 'רכ', title: 'מנהלת פרויקטים', status: 'ראיון HR', lastActivity: '09:00 23/05/2025', source: 'חבר מביא חבר', tags: ['Agile', 'Jira', 'ניהול פרויקטים'], internalTags: [], matchScore: 88, address: 'הרצליה', phone: '052-7890123', industry: 'הייטק', field: 'פרויקטים', sector: 'פרטי', companySize: '51-200', professionalSummary: 'מנהלת פרויקטים מוסמכת PMP עם ניסיון בהובלת פרויקטים חוצי ארגון.', industryAnalysis: { industries: [{ label: 'הייטק', percentage: 80, color: 'bg-purple-500' }, { label: 'טלקום', percentage: 20, color: 'bg-pink-400' }] } },
  { id: 8, name: 'משה פרץ', avatar: 'מפ', title: 'מהנדס QA', status: 'עבר בדיקה ראשונית', lastActivity: '15:45 22/05/2025', source: 'Ethosia', tags: ['Automation', 'Java', 'Selenium'], internalTags: [], matchScore: 95, address: 'פתח תקווה', phone: '053-8901234', industry: 'תעשייה וייצור', field: 'אלקטרוניקה', sector: 'ציבורי', companySize: '1000+', professionalSummary: 'מהנדס בדיקות מנוסה המתמחה באוטומציה ובדיקות עומסים למערכות מורכבות.', industryAnalysis: { industries: [{ label: 'אלקטרוניקה', percentage: 100, color: 'bg-blue-600' }] } },
  { id: 9, name: 'שרה כץ', avatar: 'שכ', title: 'מעבת גרפית', status: 'חדש', lastActivity: '12:10 21/05/2025', source: 'LinkedIn', tags: ['Photoshop', 'Illustrator', 'Branding'], internalTags: [], matchScore: 72, address: 'גבעתיים', phone: '050-9012345', industry: 'פרסום ומדיה', field: 'עיצוב גרפי', sector: 'פרטי', companySize: '1-50', professionalSummary: 'מעצבת גרפית יצירתית עם תשוקה למיתוג ועיצוב פרינט ודיגיטל.', industryAnalysis: { industries: [{ label: 'פרסום', percentage: 50, color: 'bg-yellow-500' }, { label: 'דפוס', percentage: 50, color: 'bg-orange-500' }] } },
  { id: 10, name: 'אבי שביט', avatar: 'אש', title: 'מנהל מכירות', status: 'בבדיקה', lastActivity: '11:05 20/05/2025', source: 'GotFriends', tags: ['מכירות B2B', 'ניהול מו"מ', 'Salesforce'], internalTags: [], matchScore: 81, address: 'ראשון לציון', phone: '058-0123456', industry: 'תחבורה ולוגיסטיקה', field: 'לוגיסטיקה ושינוע', sector: 'פרטי', companySize: '200-1000', professionalSummary: 'מנהל מכירות כריזמטי עם רקורד מוכח בהגדלת מכירות ופתיחת שווקים חדשים.', industryAnalysis: { industries: [{ label: 'לוגיסטיקה', percentage: 70, color: 'bg-indigo-500' }, { label: 'סחר', percentage: 30, color: 'bg-blue-400' }] } },
  { id: 11, name: 'תמר דהן', avatar: 'תד', title: 'רכזת גיוס', status: 'חדש', lastActivity: '17:30 19/05/2025', source: 'AllJobs', tags: ['גיוס טכנולוגי', 'Sourcing', 'ראיונות'], internalTags: [], matchScore: 68, address: 'חולון', phone: '054-1234568', industry: 'משאבי אנוש', field: 'גיוס', sector: 'פרטי', companySize: '51-200', professionalSummary: 'רכזת גיוס אנרגטית עם ניסיון בגיוס למגוון תפקידים טכנולוגיים ומטה.', industryAnalysis: { industries: [{ label: 'השמה', percentage: 100, color: 'bg-pink-500' }] } },
  { id: 12, name: 'דוד ביטון', avatar: 'דב', title: 'מהנדס DevOps', status: 'עבר בדיקה ראשונית', lastActivity: '14:20 18/05/2025', source: 'חבר מביא חבר', tags: ['AWS', 'Kubernetes', 'CI/CD'], internalTags: [], matchScore: 93, address: 'נס ציונה', phone: '052-2345679', industry: 'תעשייה וייצור', field: 'ייצור שבבים', sector: 'ציבורי', companySize: '1000+', professionalSummary: 'מומחה DevOps עם ניסיון רב בבניית תהליכי CI/CD וניהול תשתיות ענן.', industryAnalysis: { industries: [{ label: 'ענן', percentage: 60, color: 'bg-sky-500' }, { label: 'סייבר', percentage: 40, color: 'bg-slate-700' }] } },
  { id: 13, name: 'נועה פרידמן', avatar: 'נפ', title: 'מנהלת מוצר', status: 'חדש', lastActivity: '10:00 17/05/2025', source: 'JobMaster', tags: ['Product Strategy', 'UX', 'Agile'], internalTags: [], matchScore: 86, address: 'כפר סבא', phone: '053-3456780', industry: 'הייטק', field: 'ניהול מוצר', sector: 'פרטי', companySize: '200-1000', professionalSummary: 'מנהלת מוצר מוכוונת משתמש עם ניסיון בהובלת מוצרים משלב הרעיון ועד לשוק.', industryAnalysis: { industries: [{ label: 'B2C', percentage: 50, color: 'bg-teal-500' }, { label: 'B2B', percentage: 50, color: 'bg-cyan-600' }] } },
  { id: 14, name: 'איתי גולן', avatar: 'אג', title: 'נציג תמיכה טכנית', status: 'ראיון HR', lastActivity: '08:45 16/05/2025', source: 'LinkedIn', tags: ['Support', 'Zendesk', 'Customer Service'], internalTags: [], matchScore: 79, address: 'רעננה', phone: '050-4567891', industry: 'שירותים', field: 'תמיכה טכנית', sector: 'פרטי', companySize: '1-50', professionalSummary: 'נציג תמיכה טכנית שירותי וסבלני עם יכולת פתרון בעיות טכניות מורכבות.', industryAnalysis: { industries: [{ label: 'תמיכה', percentage: 100, color: 'bg-emerald-500' }] } },
  { id: 15, name: 'הילה אזולאי', avatar: 'הא', title: 'מנהלת חשבונות', status: 'עבר בדיקה ראשונית', lastActivity: '16:00 15/05/2025', source: 'AllJobs', tags: ['סוג 3', 'Priority', 'דוחות כספיים'], internalTags: [], matchScore: 90, address: 'בת ים', phone: '058-5678902', industry: 'פיננסים', field: 'הנהלת חשבונות', sector: 'פרטי', companySize: '51-200', professionalSummary: 'מנהלת חשבונות סוג 3 מנוסה, דייקנית ואחראית עם שליטה מלאה בתוכנות פיננסיות.', industryAnalysis: { industries: [{ label: 'חשבונאות', percentage: 80, color: 'bg-lime-600' }, { label: 'נדל"ן', percentage: 20, color: 'bg-yellow-600' }] } },
  { id: 16, name: 'יונתן כהן', avatar: 'יכ', title: 'מנהל פרויקטים', status: 'חדש', lastActivity: '14/05/2025', source: 'AllJobs', tags: ['Project Management', 'Agile'], internalTags: [], matchScore: 82, address: 'אשדוד', phone: '054-9876543', industry: 'תשתיות', field: 'בנייה', sector: 'ממשלתי', companySize: '1000+', professionalSummary: 'מנהל פרויקטים מנוסה בתחום התשתיות, בעל יכולת ניהול תקציבים ולוחות זמנים מורכבים.', industryAnalysis: { industries: [{ label: 'תשתיות', percentage: 70, color: 'bg-orange-600' }, { label: 'בנייה', percentage: 30, color: 'bg-amber-500' }] } },
  { id: 17, name: 'מיכל לוי', avatar: 'מל', title: 'אנליסטית BI', status: 'בבדיקה', lastActivity: '13/05/2025', source: 'LinkedIn', tags: ['BI', 'SQL', 'Tableau'], internalTags: [], matchScore: 89, address: 'נתניה', phone: '052-8765432', industry: 'הייטק', field: 'Data', sector: 'פרטי', companySize: '200-1000', professionalSummary: 'אנליסטית BI עם תשוקה לנתונים ויכולת להפוך מידע לתובנות עסקיות משמעותיות.', industryAnalysis: { industries: [{ label: 'Data', percentage: 100, color: 'bg-violet-600' }] } },
  { id: 18, name: 'אמיר חדד', avatar: 'אח', title: 'איש מכירות', status: 'חדש', lastActivity: '12:05/2025', source: 'חבר מביא חבר', tags: ['מכירות', 'שירות לקוחות'], internalTags: [], matchScore: 70, address: 'רחובות', phone: '053-7654321', industry: 'תחבורה ולוגיסטיקה', field: 'הפצה ושרשרת אספקה', sector: 'פרטי', companySize: '200-1000', professionalSummary: 'איש מכירות נמרץ עם ניסיון במכירות שטח וניהול תיקי לקוחות.', industryAnalysis: { industries: [{ label: 'קמעונאות', percentage: 60, color: 'bg-red-500' }, { label: 'רכב', percentage: 40, color: 'bg-gray-500' }] } },
  { id: 19, name: 'רוני פרץ', avatar: 'רפ', title: 'מפתחת Frontend', status: 'ראיון HR', lastActivity: '11/05/2025', source: 'JobMaster', tags: ['React', 'CSS', 'HTML'], internalTags: [], matchScore: 91, address: 'תל אביב', phone: '050-6543210', industry: 'הייטק', field: 'פיתוח תוכנה', sector: 'פרטי', companySize: '51-200', professionalSummary: 'מפתחת Frontend יצירתית עם עין חדה לעיצוב וחווית משתמש.', industryAnalysis: { industries: [{ label: 'Web', percentage: 90, color: 'bg-sky-500' }, { label: 'Design', percentage: 10, color: 'bg-pink-400' }] } },
  { id: 20, name: 'דניאל ישראלי', avatar: 'די', title: 'מנהל רשת', status: 'עבר בדיקה ראשונית', lastActivity: '10:05/2025', source: 'Ethosia', tags: ['Windows Server', 'Networking'], internalTags: [], matchScore: 85, address: 'באר שבע', phone: '058-5432109', industry: 'הייטק', field: 'IT', sector: 'ציבורי', companySize: '1000+', professionalSummary: 'מנהל רשת מוסמך עם ניסיון בתחזוקת שרתים ותמיכה במשתמשים בארגונים גדולים.', industryAnalysis: { industries: [{ label: 'IT', percentage: 100, color: 'bg-blue-800' }] } },
];


const getMissingFields = (candidate: Candidate): string[] => {
    const missing: string[] = [];
    if (!candidate.name || !candidate.name.includes(' ')) missing.push('שם מלא');
    if (!candidate.title) missing.push('תפקיד');
    if (!candidate.tags || candidate.tags.length === 0) missing.push('תגיות');
    if (!candidate.address) missing.push('עיר');
    return missing;
};

// ... (DoubleRangeSlider Component - Unchanged) ...
const DoubleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    valueMin: number;
    valueMax: number;
    onChange: (name: string, val: number) => void;
    nameMin: string;
    nameMax: string;
    unit?: string;
    colorVar?: string;
    icon?: React.ReactNode;
    includeUnknown?: boolean;
    onIncludeUnknownChange?: (checked: boolean) => void;
    unknownLabel?: string;
    /** Highlight when value differs from default (blue ring). */
    modified?: boolean;
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', colorVar = '--color-primary-500', icon, includeUnknown, onIncludeUnknownChange, unknownLabel, modified = false }) => {
    const minVal = Math.min(valueMin, valueMax);
    const maxVal = Math.max(valueMin, valueMax);
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;
    
    const ticks = useMemo(() => {
        const count = 5;
        const arr = [];
        for(let i=0; i<count; i++) {
           const val = min + ((max-min) * (i / (count-1)));
           arr.push(Math.round(val/step)*step); 
        }
        return arr;
    }, [min, max, step]);

    return (
        <div
            className={`w-full pt-2 pb-6 relative group/slider ${modified ? `${advFieldModifiedClass} px-1 -mx-0.5` : ''}`}
        >
            <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</label>
                </div>
                
                <div className="flex items-center gap-1.5 bg-bg-card border border-border-default shadow-sm px-3 py-1 rounded-full text-sm font-extrabold z-10 tabular-nums" dir="ltr">
                    <input
                        type="number" min={min} max={max} step={step} value={minVal}
                        onChange={(e) => onChange(nameMin, Number(e.target.value))}
                        className="w-16 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    <span className="text-text-subtle text-xs font-normal">-</span>
                    <input
                        type="number" min={min} max={max} step={step} value={maxVal}
                        onChange={(e) => onChange(nameMax, Number(e.target.value))}
                        className="w-16 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    {unit && <span className="text-[10px] text-text-muted font-bold ml-0.5">{unit}</span>}
                </div>
            </div>
            
            <div className="relative h-6 flex items-center px-2" dir="ltr">
                <div className="absolute w-[calc(100%-16px)] h-1 bg-bg-subtle rounded-full overflow-hidden">
                     <div
                        className="absolute h-full rounded-full transition-all duration-300"
                        style={{ 
                            left: `${minPercent}%`, 
                            width: `${maxPercent - minPercent}%`,
                            backgroundColor: `rgb(var(${colorVar}))`
                        }}
                    ></div>
                </div>

                <style>{`
                    .range-thumb-custom::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        height: 18px;
                        width: 18px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: 3px solid rgb(var(${colorVar}));
                        cursor: pointer;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                        margin-top: -8.5px;
                        pointer-events: auto;
                        transition: transform 0.15s ease;
                    }
                    .range-thumb-custom:active::-webkit-slider-thumb {
                        transform: scale(1.15);
                    }
                    .range-thumb-custom::-moz-range-thumb {
                        height: 18px;
                        width: 18px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: 3px solid rgb(var(${colorVar}));
                        cursor: pointer;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                        pointer-events: auto;
                    }
                `}</style>

                <input
                    type="range" min={min} max={max} step={step} value={minVal}
                    onChange={(e) => onChange(nameMin, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
                <input
                    type="range" min={min} max={max} step={step} value={maxVal}
                    onChange={(e) => onChange(nameMax, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
            </div>
            
            <div className="flex justify-between px-2 mt-1 w-full" dir="ltr">
                {ticks.map((t, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                        <div className="w-0.5 h-1 bg-border-default"></div>
                        <span className="text-[9px] text-text-subtle tabular-nums font-bold">
                            {t >= 1000 ? (t/1000) + 'k' : t}
                        </span>
                    </div>
                ))}
            </div>

            {onIncludeUnknownChange && (
                <label className="flex items-center gap-2 cursor-pointer mt-3 px-1 justify-center">
                    <input 
                        type="checkbox" 
                        checked={includeUnknown !== false} 
                        onChange={(e) => onIncludeUnknownChange(e.target.checked)} 
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-[11px] font-medium text-text-subtle">{unknownLabel}</span>
                </label>
            )}
        </div>
    );
};


type SavedSearchStatsChipsProps = {
    searchId: string | number;
    resultCount: number;
    blacklistCount: number;
    onRestore: (email: string | null, phone: string | null) => Promise<void>;
    onOpenCandidate?: (candidateId: string) => void;
};

const SavedSearchStatsChips: React.FC<SavedSearchStatsChipsProps> = ({
    searchId,
    resultCount,
    blacklistCount,
    onRestore,
    onOpenCandidate,
}) => {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState<EnrichedBlacklistEntry[]>([]);
    const [restoringKey, setRestoringKey] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const entryKey = (e: EnrichedBlacklistEntry) =>
        `${e.candidateEmail || ''}|${e.candidatePhone || ''}`;

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetchSavedSearchBlacklist(searchId)
            .then((data) => setEntries(data.blacklist))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, [open, searchId, blacklistCount]);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    return (
        <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted whitespace-nowrap px-2 py-0.5 rounded-full bg-white border border-border-default">
                {resultCount} מועמדים
            </span>
            <div className="relative" ref={panelRef}>
                <button
                    type="button"
                    onClick={() => blacklistCount > 0 && setOpen((v) => !v)}
                    className={`text-[11px] whitespace-nowrap px-2 py-0.5 rounded-full border transition-colors ${
                        blacklistCount > 0
                            ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 cursor-pointer'
                            : 'bg-white border-border-default text-text-muted cursor-default'
                    }`}
                    disabled={blacklistCount === 0}
                >
                    {blacklistCount} ברשימה שחורה
                </button>
                {open && blacklistCount > 0 && (
                    <div className="absolute top-full end-0 mt-1 z-30 w-72 max-h-64 overflow-y-auto bg-bg-card border border-border-default rounded-xl shadow-xl p-3 text-start">
                        <p className="text-xs font-bold text-text-default mb-2">מועמדים שהוסרו מהחיפוש</p>
                        {loading ? (
                            <p className="text-xs text-text-muted">טוען…</p>
                        ) : entries.length === 0 ? (
                            <p className="text-xs text-text-muted">אין מועמדים ברשימה</p>
                        ) : (
                            <ul className="space-y-2">
                                {entries.map((entry) => {
                                    const key = entryKey(entry);
                                    return (
                                        <li key={key} className="flex items-start justify-between gap-2 text-xs border-b border-border-subtle pb-2 last:border-0 last:pb-0">
                                            {entry.candidateId && onOpenCandidate ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenCandidate(entry.candidateId!)}
                                                    className="min-w-0 text-start hover:bg-bg-hover rounded-lg px-1 py-0.5 -mx-1 transition-colors group"
                                                    title="פתח פרופיל מועמד"
                                                >
                                                    <p className="font-medium text-text-default truncate group-hover:text-primary-700">
                                                        {entry.candidateName || entry.candidateEmail || entry.candidatePhone || 'מועמד'}
                                                    </p>
                                                    {entry.candidateEmail && (
                                                        <p className="text-text-muted truncate" dir="ltr">{entry.candidateEmail}</p>
                                                    )}
                                                    {entry.candidatePhone && (
                                                        <p className="text-text-muted truncate" dir="ltr">{entry.candidatePhone}</p>
                                                    )}
                                                </button>
                                            ) : (
                                                <div className="min-w-0">
                                                    <p className="font-medium text-text-default truncate">
                                                        {entry.candidateName || entry.candidateEmail || entry.candidatePhone || 'מועמד'}
                                                    </p>
                                                    {entry.candidateEmail && (
                                                        <p className="text-text-muted truncate" dir="ltr">{entry.candidateEmail}</p>
                                                    )}
                                                    {entry.candidatePhone && (
                                                        <p className="text-text-muted truncate" dir="ltr">{entry.candidatePhone}</p>
                                                    )}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                disabled={restoringKey === key}
                                                onClick={async () => {
                                                    setRestoringKey(key);
                                                    try {
                                                        await onRestore(entry.candidateEmail ?? null, entry.candidatePhone ?? null);
                                                        setEntries((prev) => {
                                                            const next = prev.filter((e) => entryKey(e) !== key);
                                                            if (next.length === 0) setOpen(false);
                                                            return next;
                                                        });
                                                    } finally {
                                                        setRestoringKey(null);
                                                    }
                                                }}
                                                className="shrink-0 text-[10px] font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap disabled:opacity-50"
                                            >
                                                החזר לתוצאות
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};


interface TablePaginationControlsProps {
    page: number;
    totalPages: number;
    pageSize: number;
    pageSizeOptions: number[];
    onPageChange: (next: number) => void;
    onPageSizeChange: (size: number) => void;
    prefix?: React.ReactNode;
}

const TablePaginationControls: React.FC<TablePaginationControlsProps> = ({
    page,
    totalPages,
    pageSize,
    pageSizeOptions,
    onPageChange,
    onPageSizeChange,
    prefix,
}) => (
    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {prefix}
        <label className="flex items-center gap-1 whitespace-nowrap">
            <span>דפים</span>
            <select
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                className="bg-white border border-border-default rounded px-2 py-1 text-[11px]"
            >
                {pageSizeOptions.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
        <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
            קודם
        </button>
        <span className="text-xs text-text-default">
            {page} / {totalPages}
        </span>
        <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded-full border border-border-default text-xs text-text-muted bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
            הבא
        </button>
    </div>
);

const jobScopeOptions = ['מלאה', 'חלקית', 'משמרות', 'פרילנס'];

function isJobScopesDefaultSelection(scopes: string[]): boolean {
    return (
        scopes.length === jobScopeOptions.length &&
        jobScopeOptions.every((s) => scopes.includes(s))
    );
}

interface CandidatesListViewProps {
    openSummaryDrawer: (candidate: Candidate | number) => void;
    favorites: Set<number>;
    toggleFavorite: (id: number) => void;
    openMessageModal: (config: MessageModalConfig) => void;
}

const MatchScoreExplanation: React.FC<{
    candidate: Candidate;
    onClose: () => void;
    position: { x: number; y: number };
    matchJobId: string;
    matchJobTitle: string;
    apiBase: string;
}> = ({ candidate, onClose, position, matchJobId, matchJobTitle, apiBase }) => {
    const [fetched, setFetched] = useState<{
        matchScore: number;
        scoreBreakdown: MatchScoreBreakdownData | null;
        parameterMatches: ParameterMatchesMap | null;
        vectorSimilarity?: number | null;
    } | null>(null);
    const [jobRecord, setJobRecord] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const jobId = matchJobId.trim() || candidate.lastJobSubmission?.jobId?.trim() || '';
    const jobTitle =
        matchJobTitle.trim() ||
        candidate.lastJobSubmission?.jobTitle ||
        candidate.matchAnalysis?.jobTitle ||
        '';
    // Always use live simulate API for breakdown layers — list bulk scores are opt-in
    // (`engineScores=1`) and can carry stale/wrong tag % (e.g. 100% when job skills were empty).
    const scoreBreakdown = fetched?.scoreBreakdown ?? null;
    const parameterMatches = fetched?.parameterMatches ?? null;
    const displayScore = fetched?.matchScore ?? candidate.matchScore;
    const sonarCandidate = useMemo(() => candidateToSonarRecord(candidate), [candidate]);

    const popupStyle = useMemo(() => {
        if (typeof window === 'undefined') {
            return { top: position.y, left: position.x, transform: 'translate(-50%, calc(-100% - 12px))' as const };
        }
        const left = clampCenteredPopoverX(position.x, MATCH_POPUP_WIDTH);
        const top = Math.max(12, position.y);
        return { top, left, transform: 'translate(-50%, calc(-100% - 12px))' as const };
    }, [position.x, position.y]);

    useEffect(() => {
        if (!jobId) {
            setJobRecord(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
                const headers: Record<string, string> = { Accept: 'application/json' };
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`, { headers });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;
                const job = (data.job ?? data) as Record<string, unknown>;
                if (job && typeof job === 'object') setJobRecord(job);
            } catch {
                if (!cancelled) setJobRecord(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [jobId, apiBase]);

    useEffect(() => {
        if (!jobId || !candidate.backendId) {
            setFetched(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            setFetched(null);
            try {
                const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
                const headers: Record<string, string> = {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                };
                if (token) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`${apiBase}/api/admin/matching-engine/simulate`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ candidateId: candidate.backendId, jobId }),
                });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;
                const bd = (data.scoreBreakdown ?? data.breakdown) as MatchScoreBreakdownData | undefined;
                setFetched({
                    matchScore:
                        typeof data.matchScore === 'number'
                            ? Math.round(data.matchScore)
                            : typeof data.finalScore === 'number'
                              ? Math.round(data.finalScore)
                              : candidate.matchScore,
                    scoreBreakdown: bd && typeof bd === 'object' ? bd : null,
                    parameterMatches:
                        data.parameterMatches && typeof data.parameterMatches === 'object'
                            ? (data.parameterMatches as ParameterMatchesMap)
                            : null,
                    vectorSimilarity:
                        typeof data.vectorSimilarity === 'number' ? data.vectorSimilarity : null,
                });
            } catch {
                /* keep list data */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [jobId, candidate.backendId, candidate.matchScore, apiBase]);

    return (
        <div
            className="match-score-popup fixed z-[1000] w-72 max-h-[min(75vh,28rem)] text-right pointer-events-auto animate-fade-in"
            style={popupStyle}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="relative overflow-hidden rounded-xl shadow-xl border border-border-default bg-bg-card">
                <div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-b border-r border-border-default rotate-45 pointer-events-none z-10"
                    aria-hidden
                />
                <MatchScoreBreakdownPanel
                    variant="popup"
                    onClose={onClose}
                    matchScore={displayScore}
                    jobTitle={jobTitle || null}
                    scoreBreakdown={scoreBreakdown}
                    parameterMatches={parameterMatches}
                    job={jobRecord}
                    candidate={sonarCandidate}
                    vectorSimilarity={fetched?.vectorSimilarity ?? null}
                    loading={loading}
                    candidateName={candidate.name}
                    candidateTitle={candidate.title}
                    professionalSummary={candidate.professionalSummary ?? candidate.matchAnalysis?.reason ?? null}
                    className="max-h-[min(75vh,28rem)] overflow-y-auto custom-scrollbar"
                />
            </div>
        </div>
    );
};

// --- NEW COMPONENT FOR SMART SEARCH PANEL ---
const SmartSearchPanel: React.FC<{
    isOpen: boolean;
    query: string;
    onQueryChange: (val: string) => void;
    jobs: { id: string; title: string }[];
    jobsLoading: boolean;
    jobsError: string | null;
    selectedJobId: string;
    onJobIdChange: (val: string) => void;
    onSearch: () => void;
    onClose: () => void;
}> = ({ isOpen, query, onQueryChange, jobs, jobsLoading, jobsError, selectedJobId, onJobIdChange, onSearch, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="w-full bg-gradient-to-r from-purple-50 to-blue-50 border-b border-border-default shadow-inner animate-fade-in-down origin-top">
            <div className="p-4 flex flex-col md:flex-row gap-4 items-start md:items-end">
                <div className="flex-grow w-full md:w-auto">
                    <label className="block text-xs font-bold text-purple-700 mb-1.5 flex items-center gap-1">
                        <SparklesIcon className="w-3 h-3" />
                        תיאור חופשי של המועמד האידיאלי
                    </label>
                    <textarea 
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder="לדוגמה: מחפש מנהל פרויקטים עם ניסיון בבנייה ותשתיות, זמין מיידית מאזור המרכז..."
                        className="w-full bg-white border border-purple-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[60px] resize-none shadow-sm"
                    />
                </div>
                
                <div className="w-full md:w-64">
                    <label className="block text-xs font-bold text-purple-700 mb-1.5">השוואה למשרה (אופציונלי)</label>
                        <select
                        value={selectedJobId}
                        onChange={(e) => onJobIdChange(e.target.value)}
                        className="w-full bg-white border border-purple-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-sm"
                    >
                        <option value="">בחר משרה להשוואה...</option>
                        {jobsLoading && <option value="">טוען משרות...</option>}
                        {jobsError && <option value="">{jobsError}</option>}
                        {jobs.map(job => (
                            <option key={job.id} value={job.id}>{job.title}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto mt-2 md:mt-0">
                    <button 
                        onClick={onSearch}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-md transition-all flex-1 md:flex-none flex items-center justify-center gap-2"
                    >
                        <SparklesIcon className="w-4 h-4" />
                        <span>חפש חכם</span>
                    </button>
                    <button 
                        onClick={onClose}
                        className="bg-white border border-purple-200 text-purple-700 p-2.5 rounded-xl hover:bg-purple-50 transition-colors"
                        title="סגור חיפוש חכם"
                    >
                        <ChevronUpIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};


const VIEW_STATE_KEY = 'hiro.candidates.listViewState';

type ListSearchParamsState = {
    mainFieldTags: string[];
    jobScopes: string[];
    locations: LocationItem[];
    status: string;
    statusFilter: '' | 'active' | 'inactive';
    interestField: string;
    interestRole: string;
    interestJob: string;
    ageMin: number;
    ageMax: number;
    salaryMin: number;
    salaryMax: number;
    internalSalaryMin: number;
    internalSalaryMax: number;
    gender: 'any' | 'male' | 'female';
    hasDegree: boolean;
    includeUnknownAge: boolean;
    includeUnknownSalary: boolean;
    industryExperience: string;
    lastUpdated: DateRange | null;
    interestDate: DateRange | null;
    workingHours: string;
};

function createDefaultListSearchParams(): ListSearchParamsState {
    return {
        mainFieldTags: [],
        jobScopes: [...jobScopeOptions],
        locations: [],
        status: '',
        statusFilter: '',
        interestField: '',
        interestRole: '',
        interestJob: '',
        ageMin: 18,
        ageMax: 65,
        salaryMin: 5000,
        salaryMax: 30000,
        internalSalaryMin: 5000,
        internalSalaryMax: 30000,
        gender: 'any',
        hasDegree: false,
        includeUnknownAge: true,
        includeUnknownSalary: true,
        industryExperience: '',
        lastUpdated: null,
        interestDate: null,
        workingHours: 'גמיש',
    };
}

function mergeListSearchParams(saved: Partial<ListSearchParamsState> | null | undefined): ListSearchParamsState {
    const base = createDefaultListSearchParams();
    if (!saved || typeof saved !== 'object') return base;
    return {
        ...base,
        ...saved,
        mainFieldTags: Array.isArray(saved.mainFieldTags) ? saved.mainFieldTags : base.mainFieldTags,
        jobScopes: Array.isArray(saved.jobScopes) && saved.jobScopes.length ? saved.jobScopes : base.jobScopes,
        locations: Array.isArray(saved.locations) ? (saved.locations as LocationItem[]) : base.locations,
        statusFilter:
            saved.statusFilter === 'active' || saved.statusFilter === 'inactive' || saved.statusFilter === ''
                ? saved.statusFilter
                : base.statusFilter,
        gender:
            saved.gender === 'male' || saved.gender === 'female' || saved.gender === 'any'
                ? saved.gender
                : base.gender,
        lastUpdated: saved.lastUpdated ?? base.lastUpdated,
        interestDate: saved.interestDate ?? base.interestDate,
        workingHours: typeof saved.workingHours === 'string' ? saved.workingHours : base.workingHours,
        // Always on when hydrating from saved/session; user can uncheck for the current session only.
        includeUnknownAge: true,
        includeUnknownSalary: true,
    };
}

/** Full `adv` object for GET /api/candidates — always includes age/salary and include-unknown flags. */
function buildAdvancedPayloadFromPanel(
    searchParams: ListSearchParamsState,
    languageFilters: { language: string; level: string }[],
    complexRules: ComplexFilterRule[],
): AppliedAdvancedSearchPayload {
    const jobScopeAll =
        jobScopeOptions.length > 0 &&
        jobScopeOptions.every((s) => searchParams.jobScopes.includes(s));
    return {
        gender: searchParams.gender,
        statusFilter: searchParams.statusFilter || '',
        tags: [...searchParams.mainFieldTags],
        locations: searchParams.locations.map((l) => ({ type: l.type, value: l.value })),
        jobScopes: [...searchParams.jobScopes],
        jobScopeAll,
        lastUpdated: searchParams.lastUpdated,
        interestField: String(searchParams.interestField || '').trim(),
        interestRole: searchParams.interestRole,
        interestDate: searchParams.interestDate,
        ageMin: Number(searchParams.ageMin),
        ageMax: Number(searchParams.ageMax),
        salaryMin: Number(searchParams.salaryMin),
        salaryMax: Number(searchParams.salaryMax),
        includeUnknownAge: searchParams.includeUnknownAge !== false,
        includeUnknownSalary: searchParams.includeUnknownSalary !== false,
        hasDegree: !!searchParams.hasDegree,
        languages: languageFilters.map((l) => ({ language: l.language, level: l.level })),
        complexRules: serializeComplexRulesForApi(complexRules),
        workingHours: String(searchParams.workingHours || 'גמיש').trim() || 'גמיש',
    };
}

type ListViewSnapshotV1 = {
    listSnapshotVersion: 1 | 2 | 3;
    candidates: Candidate[];
    searchTerm: string;
    debouncedSearchTerm: string;
    page: number;
    pageSize: number;
    totalCandidates: number;
    appliedAdvancedFilters: AppliedAdvancedSearchPayload | null;
    showNeedsAttention: boolean;
    showFavoritesOnly: boolean;
    semanticListActive: boolean;
    /** Full semantic-search row set before client-side advanced narrowing (optional). */
    semanticBaselineCandidates?: Candidate[] | null;
    listSearchParams: ListSearchParamsState;
    languageFilters: { language: string; level: string }[];
    complexRules: ComplexFilterRule[];
    /** Smart / semantic search free-text (purple panel). */
    smartSearchQuery?: string;
    isSmartSearchOpen?: boolean;
};

/** Restore list + advanced search after navigating to a candidate and back. */
function loadListViewSnapshotFromSession(): ListViewSnapshotV1 | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(VIEW_STATE_KEY);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved.candidates)) return null;

        const snapVer = saved.listSnapshotVersion;
        const legacySemantic = saved.semanticListActive === true && saved.candidates.length > 0;
        if (![1, 2, 3].includes(snapVer) && !legacySemantic) return null;

        const debounced =
            typeof saved.debouncedSearchTerm === 'string'
                ? saved.debouncedSearchTerm
                : (() => {
                      const st = String(saved.searchTerm || '').trim();
                      return st.length >= 3 ? st : '';
                  })();

        const listSearchParams = mergeListSearchParams(saved.listSearchParams as Partial<ListSearchParamsState>);
        const languageFilters = Array.isArray(saved.languageFilters) ? saved.languageFilters : [];
        const complexRules = Array.isArray(saved.complexRules) ? (saved.complexRules as ComplexFilterRule[]) : [];

        let applied: AppliedAdvancedSearchPayload | null = null;
        if (saved.appliedAdvancedFilters != null && typeof saved.appliedAdvancedFilters === 'object') {
            applied = buildAdvancedPayloadFromPanel(listSearchParams, languageFilters, complexRules);
        } else if (!legacySemantic) {
            applied = null;
        }

        const total =
            typeof saved.totalCandidates === 'number' && Number.isFinite(saved.totalCandidates)
                ? saved.totalCandidates
                : saved.candidates.length;

        const semanticBaselineCandidates =
            Array.isArray(saved.semanticBaselineCandidates) && saved.semanticBaselineCandidates.length > 0
                ? (saved.semanticBaselineCandidates as Candidate[])
                : null;

        return {
            listSnapshotVersion: 3,
            candidates: saved.candidates as Candidate[],
            searchTerm: String(saved.searchTerm || ''),
            debouncedSearchTerm: debounced,
            page: Math.max(1, Number(saved.page) || 1),
            pageSize: Math.min(500, Math.max(10, Number(saved.pageSize) || 100)),
            totalCandidates: Math.max(0, total),
            appliedAdvancedFilters: applied,
            showNeedsAttention: !!saved.showNeedsAttention,
            showFavoritesOnly: !!saved.showFavoritesOnly,
            semanticListActive: !!saved.semanticListActive,
            semanticBaselineCandidates,
            listSearchParams,
            languageFilters,
            complexRules,
            smartSearchQuery: typeof saved.smartSearchQuery === 'string' ? saved.smartSearchQuery : '',
            isSmartSearchOpen: !!saved.isSmartSearchOpen,
        };
    } catch {
        return null;
    }
}

/** API may send jobScopes[] and/or legacy jobScope string. */
function normalizeJobScopesFromApi(c: any): string[] {
    const fromArr = Array.isArray(c?.jobScopes)
        ? c.jobScopes.map((x: unknown) => String(x || '').trim()).filter(Boolean)
        : [];
    const single = c?.jobScope != null && c.jobScope !== '' ? String(c.jobScope).trim() : '';
    if (!single) return fromArr;
    const set = new Set(fromArr);
    if (!set.has(single)) fromArr.push(single);
    return fromArr;
}

/** Backend stores { name, level, levelText }; some payloads use language / string rows. */
function normalizeLanguagesFromApi(raw: unknown): NonNullable<Candidate['languages']> {
    if (!Array.isArray(raw)) return [];
    const out: NonNullable<Candidate['languages']> = [];
    for (const x of raw) {
        if (x == null) continue;
        if (typeof x === 'string') {
            const name = x.trim();
            if (name) out.push({ name, language: name });
            continue;
        }
        if (typeof x === 'object') {
            const o = x as Record<string, unknown>;
            const name = String(o.name || o.language || '').trim();
            if (!name) continue;
            out.push({
                name,
                language: name,
                level: o.level as string | number | undefined,
                levelText: o.levelText != null ? String(o.levelText) : undefined,
            });
        }
    }
    return out;
}

function languageRowSortText(x: NonNullable<Candidate['languages']>[number]): string {
    const name = x?.name || x?.language || '';
    const lt = x?.levelText != null ? String(x.levelText).trim() : '';
    if (lt) return `${name} ${lt}`.trim();
    const lv = x?.level;
    if (lv != null && lv !== '' && Number(lv) !== 50) return `${name} ${lv}`.trim();
    return name;
}

/** Parse numeric age from list row (matches server: plain integer string). */
function candidateNumericAge(c: Candidate): number | null {
    const t = String(c.age || '').trim();
    if (/^\d+$/.test(t)) {
        const n = parseInt(t, 10);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function candidateHasKnownParseableAge(c: Candidate): boolean {
    return candidateNumericAge(c) != null;
}

/**
 * Narrow the current list using the same dimensions as GET /api/candidates?adv=… (best-effort on list rows).
 * Used when the user views semantic-search results and applies advanced filters without hitting the full DB.
 */
function filterCandidatesByAdvancedClient(
    pool: Candidate[],
    adv: AppliedAdvancedSearchPayload,
    freeSearchTrimmed: string,
    dataIncompleteOnly: boolean,
): Candidate[] {
    const search = freeSearchTrimmed.trim().toLowerCase();
    return pool.filter((c) => {
        if (dataIncompleteOnly && String(c.status || '').trim() !== 'חסר נתונים') {
            return false;
        }
        if (search) {
            const blob = [c.name, c.email, c.professionalSummary, c.title, c.phone]
                .map((x) => String(x || '').toLowerCase())
                .join('\n');
            if (!blob.includes(search)) return false;
        }

        const g = adv.gender;
        if (g === 'male') {
            const ge = String(c.gender || '').toLowerCase();
            if (!ge.includes('זכר') && !ge.includes('male')) return false;
        } else if (g === 'female') {
            const ge = String(c.gender || '').toLowerCase();
            if (!ge.includes('נקב') && !ge.includes('female')) return false;
        }

        if (Array.isArray(adv.tags) && adv.tags.length) {
            for (const tag of adv.tags) {
                const t = String(tag || '').trim();
                if (!t) continue;
                const tagStr = [...c.tags, ...c.internalTags].join(' ').toLowerCase();
                if (!tagStr.includes(t.toLowerCase())) return false;
            }
        }

        if (Array.isArray(adv.locations) && adv.locations.length) {
            const locBlob = `${c.location || ''} ${c.address || ''}`.toLowerCase();
            const anyLoc = adv.locations.some((loc) => {
                const v = String(loc?.value || '').trim().toLowerCase();
                return v && locBlob.includes(v);
            });
            if (!anyLoc) return false;
        }

        if (adv.jobScopeAll === false && Array.isArray(adv.jobScopes) && adv.jobScopes.length) {
            const scopes = new Set((c.jobScopes || []).map((s) => String(s).trim()));
            const hit = adv.jobScopes.some((s) => scopes.has(String(s).trim()));
            if (!hit) return false;
        }

        if (adv.lastUpdated && typeof adv.lastUpdated === 'object') {
            const from = String(adv.lastUpdated.from || '').trim();
            const to = String(adv.lastUpdated.to || '').trim();
            const raw = c.lastActivity || c.createDate || '';
            const d = raw ? new Date(raw) : null;
            const timeOk = d != null && !Number.isNaN(d.getTime());
            if (from) {
                const fd = new Date(from);
                if (timeOk && d! < fd) return false;
            }
            if (to) {
                const td = new Date(`${to}T23:59:59`);
                if (timeOk && d! > td) return false;
            }
        }

        const roleRaw = String(adv.interestRole || '').trim().toLowerCase();
        const fieldRaw = String(adv.interestField || '').trim().toLowerCase();
        if (fieldRaw) {
            const cf = String(c.field || '').trim().toLowerCase();
            if (cf !== fieldRaw && !cf.includes(fieldRaw)) return false;
        }
        if (roleRaw) {
            const hay = [c.title, c.matchAnalysis?.jobTitle, c.professionalSummary]
                .map((x) => String(x || '').toLowerCase())
                .join(' | ');
            if (!hay.includes(roleRaw)) return false;
        }

        const amin = Number(adv.ageMin);
        const amax = Number(adv.ageMax);
        if (Number.isFinite(amin) && Number.isFinite(amax)) {
            const known = candidateHasKnownParseableAge(c);
            const n = candidateNumericAge(c);
            const inR = n != null && n >= amin && n <= amax;
            const includeUnknown = adv.includeUnknownAge !== false;
            if (includeUnknown) {
                if (known && !inR) return false;
            } else if (!known || !inR) {
                return false;
            }
        }

        const smin = Number(adv.salaryMin);
        const smax = Number(adv.salaryMax);
        if (Number.isFinite(smin) && Number.isFinite(smax)) {
            const hasSal = c.salaryMin != null || c.salaryMax != null;
            const overlap =
                hasSal &&
                (c.salaryMin ?? 0) <= smax &&
                (c.salaryMax ?? c.salaryMin ?? Number.MAX_SAFE_INTEGER) >= smin;
            const includeUnknown = adv.includeUnknownSalary !== false;
            if (includeUnknown) {
                if (!overlap && hasSal) return false;
            } else if (!overlap) {
                return false;
            }
        }

        if (adv.hasDegree === true) {
            const tagStr = [...c.tags, ...c.internalTags].join(' ').toLowerCase();
            const blob = `${tagStr} ${String(c.professionalSummary || '').toLowerCase()}`;
            const deg =
                blob.includes('תואר') ||
                blob.includes('בוגר') ||
                blob.includes('מוסמך') ||
                blob.includes('דוקטור') ||
                blob.includes('mba') ||
                blob.includes('מ.א.');
            if (!deg) return false;
        }

        if (Array.isArray(adv.languages) && adv.languages.length) {
            const langs = (c.languages || []).map(languageRowSortText).join(' ').toLowerCase();
            for (const lf of adv.languages) {
                const lang = String(lf?.language || '').trim().toLowerCase();
                if (!lang) continue;
                if (!langs.includes(lang)) return false;
            }
        }

        const whRaw = String(adv.workingHours || '').trim();
        const whFlexible = !whRaw || whRaw === 'גמיש' || whRaw === 'ללא אילוצי שעות';
        if (!whFlexible) {
            const hoursBlob = String(c.preferredWorkingHours || c.availability || '').trim();
            if (hoursBlob !== whRaw && !hoursBlob.includes(whRaw)) return false;
        }

        return true;
    });
}

function candidateSortComparable(
    candidate: Candidate,
    key: keyof Candidate | 'lastSubmissionMatch',
): string | number {
    if (key === 'lastSubmissionMatch') {
        const n = candidate.lastJobSubmission?.matchScore;
        return n != null && Number.isFinite(n) ? n : -1;
    }
    const v = candidate[key as keyof Candidate];
    if (key === 'createDate') {
        const s = v != null ? String(v).trim() : '';
        if (!s) return 0;
        const t = new Date(s).getTime();
        return Number.isFinite(t) ? t : 0;
    }
    if (key === 'matchScore' || key === 'salaryMin' || key === 'salaryMax') {
        const n = Number(v);
        return Number.isFinite(n) ? n : -1;
    }
    if (Array.isArray(v)) {
        if (key === 'languages') {
            return (v as NonNullable<Candidate['languages']>).map(languageRowSortText).join(', ');
        }
        return (v as string[]).join(', ');
    }
    if (v == null) return '';
    return typeof v === 'number' ? v : String(v);
}

function formatIntakeDateCell(raw: string | undefined): string {
    const s = (raw || '').trim();
    if (!s) return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatSalaryExpectationCell(c: Candidate): string {
    const min = c.salaryMin;
    const max = c.salaryMax;
    if ((min == null || !Number.isFinite(min)) && (max == null || !Number.isFinite(max))) return '';
    const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;
    if (min != null && Number.isFinite(min) && max != null && Number.isFinite(max)) {
        if (min === max) return fmt(min);
        return `${fmt(min)}–${fmt(max)}`;
    }
    if (min != null && Number.isFinite(min)) return `${fmt(min)}+`;
    return `≤${fmt(max!)}`;
}

/** 0–100 for list display, or null when the API did not send a usable score. */
function clampListMatchPercent(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    return Math.min(100, Math.max(0, Math.round(v)));
}

/** Same final % as matching engine popup when API sent breakdown but omitted top-level matchScore. */
function engineMatchPercentFromBreakdown(bd: unknown): number | null {
    if (!bd || typeof bd !== 'object') return null;
    const o = bd as Record<string, unknown>;
    const core = o.coreScore;
    if (typeof core !== 'number' || !Number.isFinite(core)) return null;
    const salary = Number(o.salaryPenalty) || 0;
    const age = Number(o.ageGapPenalty) || 0;
    const general = Number(o.generalPenalties) || 0;
    return clampListMatchPercent(Math.max(0, Math.round(core) - salary - age - general));
}

const LIST_MATCH_HYDRATE_CONCURRENCY = 4;

function rawListRowNeedsMatchHydration(raw: Record<string, unknown>): boolean {
    if (clampListMatchPercent(raw.matchScore) != null) return false;
    const lj = raw.lastJobSubmission;
    if (!lj || typeof lj !== 'object') return false;
    const jobId = (lj as Record<string, unknown>).jobId != null ? String((lj as Record<string, unknown>).jobId).trim() : '';
    if (!jobId) return false;
    if (clampListMatchPercent((lj as Record<string, unknown>).matchScore) != null) return false;
    if (engineMatchPercentFromBreakdown(raw.scoreBreakdown) != null) return false;
    if (engineMatchPercentFromBreakdown((lj as Record<string, unknown>).scoreBreakdown) != null) return false;
    return raw.id != null && String(raw.id).trim() !== '';
}

async function fetchSimulateMatchScore(
    apiBase: string,
    candidateId: string,
    jobId: string,
): Promise<{ matchScore: number; scoreBreakdown: MatchScoreBreakdownData | null } | null> {
    try {
        const res = await fetch(`${apiBase}/api/admin/matching-engine/simulate`, {
            method: 'POST',
            headers: eventApiHeaders(true),
            body: JSON.stringify({ candidateId, jobId }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const fromTop =
            typeof data.matchScore === 'number'
                ? Math.round(data.matchScore)
                : typeof data.finalScore === 'number'
                  ? Math.round(data.finalScore)
                  : null;
        const bd = (data.scoreBreakdown ?? data.breakdown) as MatchScoreBreakdownData | undefined;
        const matchScore = fromTop ?? engineMatchPercentFromBreakdown(bd);
        if (matchScore == null) return null;
        return {
            matchScore,
            scoreBreakdown: bd && typeof bd === 'object' ? bd : null,
        };
    } catch {
        return null;
    }
}

async function hydrateMissingListMatchScores(
    apiBase: string,
    rawList: Record<string, unknown>[],
    inFlight: Set<string>,
): Promise<Map<string, { matchScore: number; scoreBreakdown: MatchScoreBreakdownData | null }>> {
    const patches = new Map<string, { matchScore: number; scoreBreakdown: MatchScoreBreakdownData | null }>();
    const tasks: { candidateId: string; jobId: string; key: string }[] = [];
    for (const raw of rawList) {
        if (!rawListRowNeedsMatchHydration(raw)) continue;
        const candidateId = String(raw.id).trim();
        const lj = raw.lastJobSubmission as Record<string, unknown>;
        const jobId = String(lj.jobId).trim();
        const key = `${candidateId}\0${jobId}`;
        if (inFlight.has(key)) continue;
        inFlight.add(key);
        tasks.push({ candidateId, jobId, key });
    }
    let cursor = 0;
    const worker = async () => {
        while (cursor < tasks.length) {
            const task = tasks[cursor++];
            const result = await fetchSimulateMatchScore(apiBase, task.candidateId, task.jobId);
            inFlight.delete(task.key);
            if (result) patches.set(task.candidateId, result);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(LIST_MATCH_HYDRATE_CONCURRENCY, tasks.length) }, () => worker()),
    );
    return patches;
}

function mergeCandidatesPreservingMatchScores(prev: Candidate[], mapped: Candidate[]): Candidate[] {
    const prevByKey = new Map(prev.map((c) => [c.backendId || String(c.id), c]));
    return mapped.map((c) => {
        const old = prevByKey.get(c.backendId || String(c.id));
        if (!old) return c;
        if (c.listMatchScoreFromApi || c.matchScoreHydrated) return c;
        if (!old.listMatchScoreFromApi && !old.matchScoreHydrated) return c;
        return {
            ...c,
            matchScore: old.matchScore,
            listMatchScoreFromApi: old.listMatchScoreFromApi,
            matchScoreHydrated: old.matchScoreHydrated,
            scoreBreakdown: old.scoreBreakdown ?? c.scoreBreakdown,
            parameterMatches: old.parameterMatches ?? c.parameterMatches,
            lastJobSubmission:
                c.lastJobSubmission && old.lastJobSubmission
                    ? {
                          ...c.lastJobSubmission,
                          matchScore: old.lastJobSubmission.matchScore,
                          scoreBreakdown:
                              old.lastJobSubmission.scoreBreakdown ?? c.lastJobSubmission.scoreBreakdown,
                      }
                    : old.lastJobSubmission ?? c.lastJobSubmission,
        };
    });
}

const CandidatesListView: React.FC<CandidatesListViewProps> = ({ openSummaryDrawer, favorites, toggleFavorite, openMessageModal }) => {
    /** Fresh read on each mount so returning from a candidate profile restores session-backed filters. */
    const listViewSnapshot = useMemo(() => loadListViewSnapshotFromSession(), []);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [candidates, setCandidates] = useState<Candidate[]>(() => listViewSnapshot?.candidates ?? []);
    const [isRemoteLoading, setIsRemoteLoading] = useState(() => listViewSnapshot === null);
    const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(() => listViewSnapshot !== null);
    const [suspendListPolling, setSuspendListPolling] = useState(() => listViewSnapshot?.semanticListActive === true);
    const [semanticBaselineCandidates, setSemanticBaselineCandidates] = useState<Candidate[] | null>(() => {
        if (!listViewSnapshot?.semanticListActive) return null;
        const b = listViewSnapshot.semanticBaselineCandidates;
        if (Array.isArray(b) && b.length > 0) return b;
        if (listViewSnapshot.candidates?.length) return [...listViewSnapshot.candidates];
        return null;
    });
    const [jobs, setJobs] = useState<{ id: string; title: string; client?: string; status?: string }[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);
    const [selectedJobId, setSelectedJobId] = useState('');

    const navigate = useNavigate();
    const location = useLocation();
    const [searchParamsFromUrl, setUrlSearchParams] = useSearchParams();
    const { savedSearches, addSearch, updateSearch, blacklistFromSearch, removeFromSearchBlacklist } = useSavedSearches();
    const { t } = useLanguage();
    const { user } = useAuth();

    const [searchTerm, setSearchTerm] = useState(() => listViewSnapshot?.searchTerm ?? '');
    const skipSearchDebounceOnceRef = useRef(listViewSnapshot !== null);
    useEffect(() => {
        if (skipSearchDebounceOnceRef.current) {
            skipSearchDebounceOnceRef.current = false;
            return;
        }
        const handler = setTimeout(() => {
            const trimmed = searchTerm.trim();
            setDebouncedSearchTerm(trimmed.length >= 3 ? trimmed : '');
            setPage(1);
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);

    const globalPoolDefaultCols = useMemo(
        () => ['name', 'matchScore', 'title', 'status', 'lastActivity', 'source', 'lastSubmissionMatch'],
        [],
    );
    const globalPoolAllColumnIds = useMemo(
        () => [
            'name', 'matchScore', 'title', 'status', 'lastActivity', 'createDate', 'source', 'tags',
            'location', 'industry', 'field', 'sector', 'companySize', 'jobScopes', 'gender', 'age', 'salaryMin',
            'languages', 'lastSubmissionMatch',
        ],
        [],
    );
    const {
        viewMode,
        setViewMode,
        visibleColumns: visibleColumnIds,
        setVisibleColumns: setVisibleColumnIds,
        handleColumnToggle: toggleColumnPref,
        persistColumnsNow,
    } = useScreenTablePreferences('global_pool', {
        defaultLayoutMode: 'list',
        defaultVisibleColumns: globalPoolDefaultCols,
        allColumnIds: globalPoolAllColumnIds,
    });

    useEffect(() => {
        if (!isSettingsOpen) persistColumnsNow();
    }, [isSettingsOpen, persistColumnsNow]);
    const [page, setPage] = useState(() => listViewSnapshot?.page ?? 1);
    const [pageSize, setPageSize] = useState(() => listViewSnapshot?.pageSize ?? 100);
    const [totalCandidates, setTotalCandidates] = useState(() =>
        listViewSnapshot != null ? listViewSnapshot.totalCandidates : 0,
    );
    const totalPages = Math.max(1, Math.ceil((totalCandidates || 0) / pageSize));
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(() => listViewSnapshot?.debouncedSearchTerm ?? '');
    const pageSizeOptions = useMemo(() => [10, 50, 100, 200, 500], []);
    const dragItemIndex = useRef<number | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    
    const [complexRules, setComplexRules] = useState<ComplexFilterRule[]>(
        () => listViewSnapshot?.complexRules ?? [],
    );
    const [debouncedComplexRules, setDebouncedComplexRules] = useState<ComplexFilterRule[]>(
        () => listViewSnapshot?.complexRules ?? [],
    );
    const skipComplexDebounceOnceRef = useRef(listViewSnapshot !== null);
    const skipComplexFetchOnceRef = useRef(listViewSnapshot !== null);
    useEffect(() => {
        if (skipComplexDebounceOnceRef.current) {
            skipComplexDebounceOnceRef.current = false;
            return;
        }
        const handle = window.setTimeout(() => {
            setDebouncedComplexRules(complexRules);
        }, 1000);
        return () => window.clearTimeout(handle);
    }, [complexRules]);
    const debouncedComplexRulesRef = useRef(debouncedComplexRules);
    useEffect(() => {
        debouncedComplexRulesRef.current = debouncedComplexRules;
    }, [debouncedComplexRules]);

    const [searchParams, setSearchParams] = useState<ListSearchParamsState>(() => {
        const raw =
            listViewSnapshot != null
                ? listViewSnapshot.listSearchParams
                : createDefaultListSearchParams();
        return {
            ...raw,
            includeUnknownAge: raw.includeUnknownAge !== false,
            includeUnknownSalary: raw.includeUnknownSalary !== false,
        };
    });
    
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industries: string[];
        fields: string[];
        roles: string[];
    }>({ sizes: [], sectors: [], industries: [], fields: [], roles: [] });
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);
    
    const [isFilterTagModalOpen, setIsFilterTagModalOpen] = useState(false);
    const [languageFilters, setLanguageFilters] = useState<{ language: string; level: string }[]>(
        () => listViewSnapshot?.languageFilters ?? [],
    );
    const [currentLanguage, setCurrentLanguage] = useState('אנגלית');
    const [currentLevel, setCurrentLevel] = useState('רמה גבוהה');
    
    const [additionalFilters, setAdditionalFilters] = useState<{ id: number; field: string }[]>([]);
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const fieldSelectorRef = useRef<HTMLDivElement>(null);
    
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'save' | 'update'>('save');
    const [searchNameToSave, setSearchNameToSave] = useState('');
    const [isPublicSearch, setIsPublicSearch] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [loadedSearch, setLoadedSearch] = useState<SavedSearch | null>(null);

    // Keep loadedSearch in sync with the context (e.g. after blacklist/update mutations).
    // The main load effect guards on id-change, so this won't re-trigger hydration.
    useEffect(() => {
        if (!loadedSearch) return;
        const updated = savedSearches.find(s => String(s.id) === String(loadedSearch.id));
        if (updated && updated !== loadedSearch) setLoadedSearch(updated);
    }, [savedSearches]); // eslint-disable-line react-hooks/exhaustive-deps

    const [appliedAdvancedFilters, setAppliedAdvancedFilters] = useState<AppliedAdvancedSearchPayload | null>(
        () => listViewSnapshot?.appliedAdvancedFilters ?? null,
    );
    const pendingAdvancedSearchFeedback = useRef(false);
    /** Skip one auto list effect run after an imperative fetch (advanced apply / clear) to avoid duplicate GET. */
    const suppressNextListFetchEffectRef = useRef(false);
    const prevSelectedJobIdRef = useRef(selectedJobId);
    /** Guards against StrictMode double-invoke of the initial mount fetch. */
    const initialFetchFiredRef = useRef(false);
    /** After hydrating from session, skip the first page/dependency-driven fetch so restored rows stay visible. */
    const skipListFetchAfterHydrateRef = useRef(listViewSnapshot !== null);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
    const [isBulkActionsMobileOpen, setIsBulkActionsMobileOpen] = useState(false);
    const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(true);
    const [bulkReferOpen, setBulkReferOpen] = useState(false);
    const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
    const [bulkFilterOpen, setBulkFilterOpen] = useState(false);
    const [screeningCollisionOpen, setScreeningCollisionOpen] = useState(false);
    const [screeningCollisionAgg, setScreeningCollisionAgg] = useState<ScreeningWarningAgg[]>([]);
    const pendingBulkFilterRef = useRef<{ jobId: string; options?: { notes?: string; filterPosition?: string } } | null>(
        null,
    );
    const [bulkSavedSearchOpen, setBulkSavedSearchOpen] = useState(false);
    const [changeSourceOpen, setChangeSourceOpen] = useState(false);
    const [bulkAddEventOpen, setBulkAddEventOpen] = useState(false);
    const [isExportingCandidatesSearch, setIsExportingCandidatesSearch] = useState(false);

    const [activeMatchState, setActiveMatchState] = useState<{ id: number, top: number, left: number } | null>(null);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof Candidate | 'lastSubmissionMatch';
        direction: 'asc' | 'desc';
    } | null>(null);
    
    const [showNeedsAttention, setShowNeedsAttention] = useState(
        () => listViewSnapshot?.showNeedsAttention ?? false,
    );
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(
        () => listViewSnapshot?.showFavoritesOnly ?? false,
    );
    const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

    const skipUrlHydrateOnceRef = useRef(listViewSnapshot !== null);

    const advDefaults = useMemo(() => createDefaultListSearchParams(), []);
    const advFieldModified = useMemo(() => {
        const d = advDefaults;
        return {
            tags: searchParams.mainFieldTags.length > 0,
            locations: searchParams.locations.length > 0,
            status: searchParams.statusFilter !== d.statusFilter,
            lastUpdated: searchParams.lastUpdated != null,
            jobScopes: !isJobScopesDefaultSelection(searchParams.jobScopes),
            interestRole:
                String(searchParams.interestRole || '').trim() !== '' ||
                String(searchParams.interestField || '').trim() !== '',
            interestDate: searchParams.interestDate != null,
            gender: searchParams.gender !== d.gender,
            age:
                searchParams.ageMin !== d.ageMin ||
                searchParams.ageMax !== d.ageMax ||
                searchParams.includeUnknownAge === false,
            hasDegree: searchParams.hasDegree !== d.hasDegree,
            salary:
                searchParams.salaryMin !== d.salaryMin ||
                searchParams.salaryMax !== d.salaryMax ||
                searchParams.includeUnknownSalary === false,
            internalSalary:
                searchParams.internalSalaryMin !== d.internalSalaryMin ||
                searchParams.internalSalaryMax !== d.internalSalaryMax,
            languages: languageFilters.length > 0,
            complexRules: complexRules.length > 0,
            workingHours:
                String(searchParams.workingHours || '').trim() !== String(advDefaults.workingHours || '').trim(),
        };
    }, [advDefaults, searchParams, languageFilters, complexRules]);

    // Initialize basic search/filter state from URL on first mount
    useEffect(() => {
        if (skipUrlHydrateOnceRef.current) {
            skipUrlHydrateOnceRef.current = false;
            return;
        }
        const q = searchParamsFromUrl.get('q') || '';
        if (q && q !== searchTerm) {
            setSearchTerm(q);
        }
        const needs = searchParamsFromUrl.get('needs');
        if (needs !== null) {
            setShowNeedsAttention(needs === '1');
        }
        const fav = searchParamsFromUrl.get('fav');
        if (fav !== null) {
            setShowFavoritesOnly(fav === '1');
        }
        const incomplete = searchParamsFromUrl.get('incomplete');
        if (incomplete !== null) {
            setShowIncompleteOnly(incomplete === '1');
        }
        // Use '|' as separator to avoid splitting industry names that contain commas
        // (e.g. "ביטחון, חירום ואכיפת חוק")
        const SEP = '|';
        const industriesParam = searchParamsFromUrl.get('industries') || searchParamsFromUrl.get('industry') || '';
        const fieldsParam     = searchParamsFromUrl.get('fields')     || searchParamsFromUrl.get('field')    || '';
        const rolesParam      = searchParamsFromUrl.get('roles')      || '';
        const sizesParam      = searchParamsFromUrl.get('sizes')      || '';
        const sectorsParam    = searchParamsFromUrl.get('sectors')    || '';
        // Support old comma-encoded params (backward compat) and new pipe-encoded
        const splitParam = (p: string) => p
            ? (p.includes(SEP) ? p.split(SEP) : p.split(',')).map(s => s.trim()).filter(Boolean)
            : [];
        setCompanyFilters((prev) => ({
            ...prev,
            industries: splitParam(industriesParam),
            fields:     splitParam(fieldsParam),
            roles:      splitParam(rolesParam),
            sizes:      splitParam(sizesParam),
            sectors:    splitParam(sectorsParam),
        }));
    }, [searchParamsFromUrl]);

    // Persist basic search/filter state into URL so it survives navigation back from profile.
    // Merge into existing params so savedSearchId, tag, etc. are not wiped.
    useEffect(() => {
        setUrlSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (searchTerm.trim()) params.set('q', searchTerm.trim());
                else params.delete('q');
                if (showNeedsAttention) params.set('needs', '1');
                else params.delete('needs');
                if (showFavoritesOnly) params.set('fav', '1');
                else params.delete('fav');
                if (showIncompleteOnly) params.set('incomplete', '1');
                else params.delete('incomplete');
                // Use '|' separator — comma appears inside Hebrew industry names
                if (companyFilters.industries?.length) params.set('industries', companyFilters.industries.join('|'));
                else { params.delete('industries'); params.delete('industry'); }
                if (companyFilters.fields?.length) params.set('fields', companyFilters.fields.join('|'));
                else { params.delete('fields'); params.delete('field'); }
                if (companyFilters.roles?.length) params.set('roles', companyFilters.roles.join('|'));
                else params.delete('roles');
                if (companyFilters.sizes?.length) params.set('sizes', companyFilters.sizes.join('|'));
                else params.delete('sizes');
                if (companyFilters.sectors?.length) params.set('sectors', companyFilters.sectors.join('|'));
                else params.delete('sectors');
                return params;
            },
            { replace: true },
        );
    }, [searchTerm, showNeedsAttention, showFavoritesOnly, showIncompleteOnly, companyFilters, setUrlSearchParams]);

    // --- SMART SEARCH STATE ---
    const [isSmartSearchOpen, setIsSmartSearchOpen] = useState(() => !!listViewSnapshot?.isSmartSearchOpen);
    const [smartSearchQuery, setSmartSearchQuery] = useState(
        () => listViewSnapshot?.smartSearchQuery ?? '',
    );
    const [isSmartSearching, setIsSmartSearching] = useState(false);
    const [activeMatchScorePopup, setActiveMatchScorePopup] = useState<{ id: number, x: number, y: number } | null>(null);
    const listMatchHydrationInFlightRef = useRef(new Set<string>());

    const applyListMatchPatches = useCallback(
        (patches: Map<string, { matchScore: number; scoreBreakdown: MatchScoreBreakdownData | null }>) => {
            if (!patches.size) return;
            setCandidates((prev) =>
                prev.map((c) => {
                    const patch = c.backendId ? patches.get(c.backendId) : undefined;
                    if (!patch) return c;
                    return {
                        ...c,
                        matchScore: patch.matchScore,
                        listMatchScoreFromApi: true,
                        matchScoreHydrated: true,
                        scoreBreakdown: patch.scoreBreakdown ?? c.scoreBreakdown,
                        lastJobSubmission: c.lastJobSubmission
                            ? {
                                  ...c.lastJobSubmission,
                                  matchScore: patch.matchScore,
                                  scoreBreakdown: patch.scoreBreakdown ?? c.lastJobSubmission.scoreBreakdown,
                              }
                            : c.lastJobSubmission,
                    };
                }),
            );
        },
        [],
    );

    const mapCandidate = useCallback((c: any, idx: number): Candidate => {
        const sourceId = c.id ?? c.userId;
        const resolvedId = deriveLocalCandidateId(sourceId ?? idx + 1, idx + 1);
        const backendId = sourceId !== undefined && sourceId !== null ? String(sourceId) : undefined;

        const ljCandidate =
            c.lastJobSubmission &&
            typeof c.lastJobSubmission === 'object' &&
            c.lastJobSubmission.jobId != null &&
            String(c.lastJobSubmission.jobId).trim() !== ''
                ? c.lastJobSubmission
                : null;

        const filterJobId = selectedJobId.trim();
        const apiMatch = clampListMatchPercent(c.matchScore);
        const breakdownMatch = engineMatchPercentFromBreakdown(c.scoreBreakdown);
        const lastSubMatch = ljCandidate ? clampListMatchPercent(ljCandidate.matchScore) : null;
        const lastSubBreakdown =
            ljCandidate && filterJobId && String(ljCandidate.jobId) === filterJobId
                ? engineMatchPercentFromBreakdown(ljCandidate.scoreBreakdown)
                : null;
        const listMatchScoreFromApi =
            apiMatch != null ||
            lastSubMatch != null ||
            breakdownMatch != null ||
            (ljCandidate != null && filterJobId !== '' && String(ljCandidate.jobId) === filterJobId && lastSubBreakdown != null);
        const matchScore = listMatchScoreFromApi
            ? filterJobId
                ? apiMatch ?? breakdownMatch ?? lastSubBreakdown ?? 0
                : apiMatch ?? lastSubMatch ?? 0
            : 0;

        return {
            id: resolvedId,
            backendId,
        name: c.fullName || c.name || 'ללא שם',
        avatar: (c.fullName || c.name || '??').slice(0, 2),
        title: c.title || c.professionalSummary || '',
        status: c.status || 'חדש',
        lastActivity: c.updatedAt || c.createdAt || '',
        source: c.source || c.sourceDetail || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        internalTags: Array.isArray(c.internalTags) ? c.internalTags : [],
        matchScore,
        listMatchScoreFromApi,
        scoreBreakdown:
            c.scoreBreakdown && typeof c.scoreBreakdown === 'object'
                ? (c.scoreBreakdown as MatchScoreBreakdownData)
                : ljCandidate?.scoreBreakdown && typeof ljCandidate.scoreBreakdown === 'object'
                  ? (ljCandidate.scoreBreakdown as MatchScoreBreakdownData)
                  : null,
        parameterMatches:
            c.parameterMatches && typeof c.parameterMatches === 'object'
                ? (c.parameterMatches as ParameterMatchesMap)
                : ljCandidate?.parameterMatches && typeof ljCandidate.parameterMatches === 'object'
                  ? (ljCandidate.parameterMatches as ParameterMatchesMap)
                  : null,
        address: c.address || '',
        phone: c.phone || '',
        industry:
            (c.industry && String(c.industry).trim()) || '',
        field: c.field || '',
        sector: c.sector || '',
        companySize: c.companySize || '',
        companyExperiences: Array.isArray(c.companyExperiences) ? c.companyExperiences : [],
        professionalSummary: c.professionalSummary || '',
        industryAnalysis: c.industryAnalysis,
        resumeUrl: c.resumeUrl || '',
        jobScopes: normalizeJobScopesFromApi(c),
        languages: normalizeLanguagesFromApi(c.languages),
        gender: c.gender != null ? String(c.gender) : '',
        age: c.age != null ? String(c.age) : '',
        salaryMin: c.salaryMin != null && c.salaryMin !== '' ? Number(c.salaryMin) : null,
        salaryMax: c.salaryMax != null && c.salaryMax !== '' ? Number(c.salaryMax) : null,
        location: [c.location, c.address].map((x: unknown) => String(x || '').trim()).filter(Boolean).join(' · ') || '',
        createDate: c.createdAt != null && c.createdAt !== '' ? String(c.createdAt) : '',
        email: c.email != null && c.email !== '' ? String(c.email) : '',
        availability: c.availability != null && c.availability !== '' ? String(c.availability) : '',
        preferredWorkingHours:
            c.preferredWorkingHours != null && String(c.preferredWorkingHours).trim() !== ''
                ? String(c.preferredWorkingHours).trim()
                : '',
        matchedTerms: Array.isArray(c.matchedTerms) ? c.matchedTerms.map(String) : undefined,
        matchReasons: Array.isArray(c.matchReasons) ? c.matchReasons : undefined,
        lastJobSubmission: ljCandidate
                ? {
                      jobId: String(ljCandidate.jobId),
                      jobCandidateId: String(ljCandidate.jobCandidateId || ''),
                      jobTitle: String(ljCandidate.jobTitle || '—'),
                      matchScore: lastSubMatch ?? 0,
                      linkedAt:
                          ljCandidate.linkedAt != null && ljCandidate.linkedAt !== ''
                              ? String(ljCandidate.linkedAt)
                              : undefined,
                      scoreBreakdown:
                          ljCandidate.scoreBreakdown && typeof ljCandidate.scoreBreakdown === 'object'
                              ? (ljCandidate.scoreBreakdown as MatchScoreBreakdownData)
                              : undefined,
                      parameterMatches:
                          ljCandidate.parameterMatches &&
                          typeof ljCandidate.parameterMatches === 'object'
                              ? (ljCandidate.parameterMatches as ParameterMatchesMap)
                              : undefined,
                  }
                : null,
        };
    }, [selectedJobId]);

    const fetchCandidatesList = useCallback(
        async (opts: {
            page: number;
            limit: number;
            search: string;
            advanced: AppliedAdvancedSearchPayload | null;
            dataIncomplete?: boolean;
            jobId?: string;
            savedSearchId?: string | number | null;
        }) => {
            if (!apiBase) return;
            setIsRemoteLoading(true);
            try {
                const res = await fetchCandidatesListResponse(
                    apiBase,
                    {
                        page: opts.page,
                        limit: opts.limit,
                        search: opts.search,
                        advanced: opts.advanced,
                        dataIncomplete: opts.dataIncomplete,
                        jobId: opts.jobId,
                        matchLastJobScores: true,
                        savedSearchId: opts.savedSearchId ?? null,
                    },
                    candidatesListFetchInit(),
                );
                if (!res.ok) throw new Error('failed to load');
                const payload = await res.json();
                const list = Array.isArray(payload.data)
                    ? payload.data
                    : Array.isArray(payload.rows)
                        ? payload.rows
                        : [];
                const mapped = list.map(mapCandidate);
                setSemanticBaselineCandidates(null);
                setCandidates(mapped);
                setTotalCandidates(Number(payload?.total || mapped.length || 0));
                const rawRows = list.filter((r): r is Record<string, unknown> => r && typeof r === 'object');
                if (rawRows.some(rawListRowNeedsMatchHydration)) {
                    void hydrateMissingListMatchScores(
                        apiBase,
                        rawRows,
                        listMatchHydrationInFlightRef.current,
                    ).then((patches) => applyListMatchPatches(patches));
                }
            } catch (e) {
                setSemanticBaselineCandidates(null);
                setCandidates([]);
                setTotalCandidates(0);
            } finally {
                setIsRemoteLoading(false);
                setHasInitiallyLoaded(true);
            }
        },
        [apiBase, mapCandidate, applyListMatchPatches],
    );

    // Ref keeps companyFilters readable inside callbacks without adding it to dep arrays.
    // This prevents resolveAdvancedPayloadForFetch (and therefore fetchCandidates) from
    // getting a new reference every time the user applies company filters, which would
    // cascade and cause every useEffect that depends on fetchCandidates to re-fire.
    const companyFiltersRef = useRef(companyFilters);
    companyFiltersRef.current = companyFilters; // always in sync, no extra renders

    // Ref keeps the active saved-search id readable inside fetch callbacks.
    const loadedSearchRef = useRef(loadedSearch);
    loadedSearchRef.current = loadedSearch;

    const hasActiveCompanyFilters = !!(
        companyFilters.industries?.length ||
        companyFilters.fields?.length ||
        companyFilters.roles?.length ||
        companyFilters.sizes?.length ||
        companyFilters.sectors?.length
    );
    // Stable ref so the callback below can read the latest value without depending on it
    const hasActiveCompanyFiltersRef = useRef(hasActiveCompanyFilters);
    hasActiveCompanyFiltersRef.current = hasActiveCompanyFilters;

    const resolveAdvancedPayloadForFetch = useCallback(
        (rules: ComplexFilterRule[]) => {
            // Read companyFilters from ref — does NOT appear in deps so this callback is
            // stable across filter changes and won't cascade into other useEffects.
            const cf = companyFiltersRef.current;
            const hasActiveCF = hasActiveCompanyFiltersRef.current;
            const hasPanel = appliedAdvancedFilters != null || complexRulesHaveValue(rules);
            if (hasPanel) {
                const base = buildAdvancedPayloadFromPanel(searchParams, languageFilters, rules);
                if (hasActiveCF) {
                    base.companyFilters = {
                        industries: cf.industries,
                        fields:     cf.fields,
                        roles:      cf.roles,
                        sizes:      cf.sizes,
                        sectors:    cf.sectors,
                    };
                }
                return base;
            }
            if (hasActiveCF) {
                return {
                    companyFilters: {
                        industries: cf.industries,
                        fields:     cf.fields,
                        roles:      cf.roles,
                        sizes:      cf.sizes,
                        sectors:    cf.sectors,
                    },
                } as AppliedAdvancedSearchPayload;
            }
            return null;
        },
        // companyFilters intentionally omitted — read via ref to keep callback stable
        [appliedAdvancedFilters, searchParams, languageFilters],
    );

    const fetchCandidates = useCallback(() => {
        return fetchCandidatesList({
            page,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRulesRef.current),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    }, [
        page,
        pageSize,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        fetchCandidatesList,
        showIncompleteOnly,
        selectedJobId,
    ]);

    // Refetch when company filters change (triggered by CompanyFilterPopover "Apply")
    const prevCompanyFiltersRef = useRef(companyFilters);
    useEffect(() => {
        if (!hasInitiallyLoaded || suspendListPolling) return;
        if (prevCompanyFiltersRef.current === companyFilters) return;
        prevCompanyFiltersRef.current = companyFilters;
        // Skip — this change was caused by loading a saved search, not by user interaction.
        if (loadedSearchRef.current) return;
        // Suppress the page useEffect from also firing a fetch when setPage(1) is called below
        suppressNextListFetchEffectRef.current = true;
        setPage(1);
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRulesRef.current),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    }, [companyFilters, hasInitiallyLoaded, suspendListPolling, pageSize, debouncedSearchTerm, resolveAdvancedPayloadForFetch, fetchCandidatesList, showIncompleteOnly, selectedJobId]);

    const exportSearchHeaderLabels = useMemo(() => {
        const o = {} as Record<CandidatesExportFieldKey, string>;
        for (const k of CANDIDATES_EXPORT_FIELD_ORDER) {
            o[k] = t(`candidates.export_col.${k}`);
        }
        return o;
    }, [t]);

    const handleExportSearchToExcel = useCallback(async () => {
        if (!apiBase) {
            setFeedbackMessage(t('candidates.export_search_no_api'));
            return;
        }
        if (selectedIds.size === 0) {
            setFeedbackMessage(t('candidates.export_selected_none'));
            return;
        }

        const buildListRequest = (pageNum: number) => ({
            page: pageNum,
            limit: CANDIDATES_EXPORT_PAGE_SIZE,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRulesRef.current),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
        });

        const parseListPayload = (payload: { data?: unknown[]; rows?: unknown[]; total?: number }) => {
            const list = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.rows)
                  ? payload.rows
                  : [];
            const total = Number(payload?.total ?? list.length) || 0;
            return { list, total };
        };

        const resolveFetchRouteId = (localId: number): string => {
            const fromList = candidates.find((c) => c.id === localId);
            if (fromList?.backendId && fromList.backendId.trim()) {
                return fromList.backendId.trim();
            }
            return String(localId);
        };

        setIsExportingCandidatesSearch(true);
        setFeedbackMessage(t('candidates.export_search_in_progress'));
        try {
            const idOrder = Array.from<number>(selectedIds);
            let orderedRows: Record<string, unknown>[] = [];

            if (suspendListPolling) {
                const byId = new Map(candidates.map((c) => [c.id, c]));
                const picked = idOrder.map((id) => byId.get(id)).filter((c): c is Candidate => c != null);
                if (picked.length === 0) {
                    setFeedbackMessage(t('candidates.export_search_empty'));
                    return;
                }
                orderedRows = picked.map((c) => exportRowFromCandidate(c));
            } else {
                const want = new Set<number>(idOrder);
                const byLocalId = new Map<number, Record<string, unknown>>();

                const ingestChunk = (list: unknown[]) => {
                    for (const r of list) {
                        if (!r || typeof r !== 'object') continue;
                        const raw = r as Record<string, unknown>;
                        const c = mapCandidate(raw, 0);
                        if (want.has(c.id)) {
                            byLocalId.set(c.id, raw);
                            want.delete(c.id);
                        }
                    }
                };

                const res1 = await fetchCandidatesListResponse(
                    apiBase,
                    buildListRequest(1),
                    candidatesListFetchInit(),
                );
                if (!res1.ok) throw new Error('failed');
                const p1 = (await res1.json()) as { data?: unknown[]; rows?: unknown[]; total?: number };
                const { list: firstList, total } = parseListPayload(p1);
                if (!total) {
                    setFeedbackMessage(t('candidates.export_search_empty'));
                    return;
                }
                ingestChunk(firstList);
                const pages = Math.ceil(total / CANDIDATES_EXPORT_PAGE_SIZE);
                for (let p = 2; p <= pages && want.size > 0; p++) {
                    const res = await fetchCandidatesListResponse(
                        apiBase,
                        buildListRequest(p),
                        candidatesListFetchInit(),
                    );
                    if (!res.ok) throw new Error('failed');
                    const payload = (await res.json()) as { data?: unknown[]; rows?: unknown[] };
                    const { list } = parseListPayload({ ...payload, total });
                    ingestChunk(list);
                }

                if (want.size > 0) {
                    const stillMissing = idOrder.filter((id) => want.has(id));
                    await Promise.all(
                        stillMissing.map(async (localId) => {
                            const routeId = resolveFetchRouteId(localId);
                            try {
                                const res = await fetch(
                                    `${apiBase}/api/candidates/${encodeURIComponent(routeId)}`,
                                    { cache: 'no-store' },
                                );
                                if (!res.ok) return;
                                const data = await res.json();
                                if (data && typeof data === 'object' && !Array.isArray(data)) {
                                    byLocalId.set(localId, data as Record<string, unknown>);
                                }
                            } catch {
                                /* skip */
                            }
                        }),
                    );
                }

                orderedRows = idOrder
                    .map((id) => byLocalId.get(id))
                    .filter((row): row is Record<string, unknown> => row != null);

                if (orderedRows.length === 0) {
                    setFeedbackMessage(t('candidates.export_search_empty'));
                    return;
                }
            }

            const csv = buildCandidatesExportCsv(orderedRows, exportSearchHeaderLabels);
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            triggerCsvDownload(`candidates-export-${stamp}.csv`, csv);
            setFeedbackMessage(t('candidates.export_search_done', { count: orderedRows.length }));
        } catch {
            setFeedbackMessage(t('candidates.export_search_failed'));
        } finally {
            setIsExportingCandidatesSearch(false);
        }
    }, [
        apiBase,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        showIncompleteOnly,
        exportSearchHeaderLabels,
        mapCandidate,
        t,
        selectedIds,
        suspendListPolling,
        candidates,
        selectedJobId,
    ]);

    // Poll backend for updates every 60s on current page.
    // Disabled when viewing a saved search — the results are already filtered and stable.
    useEffect(() => {
        if (!apiBase || !hasInitiallyLoaded || suspendListPolling) return;
        if (loadedSearchRef.current) return; // no background polling inside a saved search
        let cancelled = false;
        let inFlight = false;

        const poll = async () => {
            if (cancelled || inFlight || document.hidden) return;
            if (loadedSearchRef.current) return; // guard against race if search loaded mid-interval
            inFlight = true;
            try {
                const res = await fetchCandidatesListResponse(
                    apiBase,
                    {
                        page,
                        limit: pageSize,
                        search: debouncedSearchTerm,
                        advanced: resolveAdvancedPayloadForFetch(debouncedComplexRules),
                        dataIncomplete: showIncompleteOnly,
                        jobId: selectedJobId.trim(),
                        matchLastJobScores: true,
                        savedSearchId: loadedSearchRef.current?.id ?? null,
                    },
                    candidatesListFetchInit(),
                );
                if (cancelled) return;
                if (res.status === 304) return;
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                const list = payload && Array.isArray(payload.data)
                    ? payload.data
                    : payload && Array.isArray(payload.rows)
                        ? payload.rows
                        : [];
                const mapped = list.map(mapCandidate);
                setCandidates((prev) => mergeCandidatesPreservingMatchScores(prev, mapped));
                setTotalCandidates(Number(payload?.total || mapped.length || 0));
            } finally {
                inFlight = false;
            }
        };

        // First poll only after 20s so initial load isn’t stacked; then every 10s.
        const t0 = window.setTimeout(poll, 20_000);
        const id = window.setInterval(poll, 60_000);
        return () => {
            cancelled = true;
            window.clearTimeout(t0);
            window.clearInterval(id);
        };
    }, [
        apiBase,
        hasInitiallyLoaded,
        mapCandidate,
        page,
        pageSize,
        suspendListPolling,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        showIncompleteOnly,
        selectedJobId,
    ]);

    const goToPage = useCallback((target: number) => {
        const normalized = Math.max(1, Math.min(totalPages, target));
        setPage(normalized);
    }, [totalPages]);

    const handlePageSizeSelect = useCallback((nextSize: number) => {
        setPageSize(nextSize);
        setPage(1);
    }, []);

    useEffect(() => {
        if (listViewSnapshot !== null) {
            // If smart search panel was open in the restored session, pre-load jobs
            if (listViewSnapshot.isSmartSearchOpen) loadJobs();
            return;
        }
        if (initialFetchFiredRef.current) return;
        initialFetchFiredRef.current = true;
        void fetchCandidates();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Refetch when paging changes only. Do not depend on `hasInitiallyLoaded`; when it flips after the
    // initial mount fetch, deps here stay the same so we avoid a duplicate GET.
    useEffect(() => {
        if (!hasInitiallyLoaded || suspendListPolling) return;
        if (suppressNextListFetchEffectRef.current) {
            suppressNextListFetchEffectRef.current = false;
            return;
        }
        if (skipListFetchAfterHydrateRef.current) {
            skipListFetchAfterHydrateRef.current = false;
            return;
        }
        void fetchCandidates();
    }, [page, pageSize, fetchCandidates]);

    /** Complex-query textarea: wait 1s after typing, then search with `adv` (no per-keystroke GET). */
    useEffect(() => {
        if (!apiBase || suspendListPolling) return;
        if (loadedSearchRef.current) return; // saved-search mode: suppress auto re-fetch from debounce
        if (skipComplexFetchOnceRef.current) {
            skipComplexFetchOnceRef.current = false;
            return;
        }
        if (!complexRulesHaveValue(debouncedComplexRules)) return;
        suppressNextListFetchEffectRef.current = true;
        if (page !== 1) {
            setPage(1);
        }
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRules),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    }, [
        apiBase,
        debouncedComplexRules,
        suspendListPolling,
        pageSize,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        fetchCandidatesList,
        showIncompleteOnly,
        selectedJobId,
    ]);

    /** Refetch with engine scores when the job filter changes (popup already scores via simulate). */
    useEffect(() => {
        if (!hasInitiallyLoaded || suspendListPolling) return;
        if (prevSelectedJobIdRef.current === selectedJobId) return;
        prevSelectedJobIdRef.current = selectedJobId;
        suppressNextListFetchEffectRef.current = true;
        setPage(1);
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRulesRef.current),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    }, [
        selectedJobId,
        hasInitiallyLoaded,
        suspendListPolling,
        pageSize,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        showIncompleteOnly,
        fetchCandidatesList,
    ]);

    useEffect(() => {
        if (!pendingAdvancedSearchFeedback.current || isRemoteLoading || !hasInitiallyLoaded) return;
        pendingAdvancedSearchFeedback.current = false;
        setFeedbackMessage(t('candidates.found_count', { count: totalCandidates }));
    }, [isRemoteLoading, hasInitiallyLoaded, totalCandidates, t]);

    // Persist list + advanced payload so returning from a candidate profile keeps the same results and filters.
    useEffect(() => {
        if (!hasInitiallyLoaded) return;
        const stateToSave = {
            listSnapshotVersion: 3,
            candidates,
            searchTerm,
            debouncedSearchTerm,
            page,
            pageSize,
            totalCandidates,
            appliedAdvancedFilters:
                appliedAdvancedFilters == null
                    ? null
                    : buildAdvancedPayloadFromPanel(searchParams, languageFilters, complexRules),
            listSearchParams: searchParams,
            languageFilters,
            complexRules,
            showNeedsAttention,
            showFavoritesOnly,
            semanticListActive: suspendListPolling,
            semanticBaselineCandidates: suspendListPolling ? semanticBaselineCandidates : null,
            smartSearchQuery,
            isSmartSearchOpen,
        };
        try {
            sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify(stateToSave));
        } catch {
            // ignore storage errors
        }
    }, [
        candidates,
        searchTerm,
        debouncedSearchTerm,
        page,
        pageSize,
        totalCandidates,
        appliedAdvancedFilters,
        searchParams,
        languageFilters,
        complexRules,
        showNeedsAttention,
        showFavoritesOnly,
        hasInitiallyLoaded,
        suspendListPolling,
        semanticBaselineCandidates,
        smartSearchQuery,
        isSmartSearchOpen,
    ]);



    useEffect(() => {
        const maxPage = Math.max(1, Math.ceil((totalCandidates || 0) / pageSize));
        if (page > maxPage) {
            setPage(maxPage);
        }
    }, [page, pageSize, totalCandidates]);

    // Initialize columns state with translations
    const allColumns = useMemo(() => [
        { id: 'name', header: t('col.name') },
        { id: 'matchScore', header: t('col.match') },
        { id: 'title', header: t('col.role') },
        { id: 'status', header: t('col.status') },
        { id: 'lastActivity', header: t('col.last_activity') },
        { id: 'createDate', header: t('col.intake_date') },
        { id: 'source', header: t('col.source') },
        { id: 'tags', header: t('col.tags') },
        { id: 'location', header: t('col.location') },
        { id: 'industry', header: t('col.industry') },
        { id: 'field', header: t('col.field') },
        { id: 'sector', header: t('col.sector') },
        { id: 'companySize', header: 'מס\' עובדים' },
        { id: 'jobScopes', header: t('col.job_scopes') },
        { id: 'gender', header: t('col.gender') },
        { id: 'age', header: t('col.age') },
        { id: 'salaryMin', header: t('col.salary_expectation') },
        { id: 'languages', header: t('col.languages') },
        { id: 'lastSubmissionMatch', header: t('col.last_submission_match') },
    ], [t]);

    const columns = useMemo(
        () =>
            visibleColumnIds
                .map((id) => allColumns.find((c) => c.id === id))
                .filter((c): c is (typeof allColumns)[number] => Boolean(c)),
        [visibleColumnIds, allColumns],
    );

    /** Ensure new columns appear once for sessions that still hold pre-change visibility in React state. */
    const LAST_SUBMISSION_COLUMN_SEEN_KEY = 'hiro.candidates.column.lastSubmissionMatch.v1';
    useEffect(() => {
        if (typeof sessionStorage === 'undefined') return;
        if (sessionStorage.getItem(LAST_SUBMISSION_COLUMN_SEEN_KEY)) return;
        if (visibleColumnIds.includes('lastSubmissionMatch')) {
            sessionStorage.setItem(LAST_SUBMISSION_COLUMN_SEEN_KEY, '1');
            return;
        }
        sessionStorage.setItem(LAST_SUBMISSION_COLUMN_SEEN_KEY, '1');
        const src = visibleColumnIds.indexOf('source');
        const next = [...visibleColumnIds];
        if (src >= 0) next.splice(src + 1, 0, 'lastSubmissionMatch');
        else next.push('lastSubmissionMatch');
        setVisibleColumnIds(next);
    }, [visibleColumnIds, setVisibleColumnIds]);

    // ... (Keep existing sorting/filtering logic and handlers) ...
     const requestSort = (key: keyof Candidate | 'lastSubmissionMatch') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const toggleSelectionMode = () => {
        const next = !selectionMode;
        setSelectionMode(next);
        setSelectedIds(new Set());
        setIsBulkActionsMobileOpen(false);
        setIsMoreActionsOpen(next);
        setBulkReferOpen(false);
        setBulkStatusOpen(false);
        setBulkFilterOpen(false);
        setBulkSavedSearchOpen(false);
        setChangeSourceOpen(false);
        setBulkAddEventOpen(false);
    };

    const getCandidateRouteId = useCallback((candidate: Candidate) => {
        if (candidate.backendId && candidate.backendId.trim()) {
            return candidate.backendId;
        }
        return String(candidate.id);
    }, []);

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const bulkJobPickerOptions = useMemo(
        () =>
            jobs.map((j) => ({
                id: j.id,
                title: j.title,
                subtitle: j.client?.trim() ? j.client : undefined,
                status: j.status,
            })),
        [jobs],
    );

    const bulkSelectedBackendIds = useMemo(() => {
        return candidates
            .filter(c => selectedIds.has(c.id))
            .map(c => getCandidateRouteId(c));
    }, [candidates, selectedIds, getCandidateRouteId]);

    const openBulkRefer = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setBulkReferOpen(true);
    }, []);

    const openBulkChangeStatus = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setBulkStatusOpen(true);
    }, []);

    const openBulkSendSms = useCallback(() => {
        const list = candidates.filter((c) => selectedIds.has(c.id));
        if (list.length === 0) return;
        setIsBulkActionsMobileOpen(false);
        const phones = list.map((c) => String(c.phone || '').trim()).filter(Boolean);
        const label =
            list.length === 1
                ? list[0].name
                : t('candidates.bulk_message_recipients', { count: list.length });
        openMessageModal({
            mode: 'sms',
            candidateName: label,
            candidatePhone: phones.join('; '),
            candidateEmail: list.length === 1 ? list[0].email || null : null,
            candidateId: list.length === 1 ? getCandidateRouteId(list[0]) : null,
        });
    }, [candidates, selectedIds, openMessageModal, getCandidateRouteId, t]);

    const openBulkSendEmail = useCallback(() => {
        const list = candidates.filter((c) => selectedIds.has(c.id));
        if (list.length === 0) return;
        setIsBulkActionsMobileOpen(false);
        const label =
            list.length === 1
                ? list[0].name
                : t('candidates.bulk_message_recipients', { count: list.length });
        const emailField = list
            .map((c) => String(c.email || '').trim())
            .filter(Boolean)
            .join(', ');
        openMessageModal({
            mode: 'email',
            candidateName: label,
            candidatePhone: list.map((c) => String(c.phone || '').trim()).filter(Boolean).join('; '),
            candidateEmail: emailField,
            candidateId: list.length === 1 ? getCandidateRouteId(list[0]) : null,
        });
    }, [candidates, selectedIds, openMessageModal, getCandidateRouteId, t]);

    const openBulkFilter = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setBulkFilterOpen(true);
    }, []);

    const openBulkSavedSearch = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setBulkSavedSearchOpen(true);
    }, []);

    const openChangeSource = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setChangeSourceOpen(true);
    }, []);

    const openBulkAddEvent = useCallback(() => {
        setIsBulkActionsMobileOpen(false);
        setBulkAddEventOpen(true);
    }, []);

    const handleBulkAddEventSave = useCallback(
        async (eventData: Omit<BulkCandidateEventFormData, 'id' | 'status'> & { id?: string | number }) => {
            if (eventData.id != null) return;
            const ids = bulkSelectedBackendIds.map((id) => String(id).trim()).filter(Boolean);
            if (!apiBase || ids.length === 0) {
                setBulkAddEventOpen(false);
                return;
            }

            const actorDisplayName =
                (user?.name && String(user.name).trim()) ||
                (user?.email && String(user.email).trim()) ||
                'משתמש';

            const selectedList = candidates.filter((c) => selectedIds.has(c.id));
            const nameById = new Map(
                selectedList.map((c) => [getCandidateRouteId(c), (c.name && c.name.trim()) || 'מועמד']),
            );

            let ok = 0;
            let fail = 0;
            await Promise.all(
                ids.map(async (cid) => {
                    const candidateName = nameById.get(cid) || 'מועמד';
                    const linkedTo =
                        eventData.linkedTo && eventData.linkedTo.length > 0
                            ? eventData.linkedTo
                            : [{ type: 'מועמד', name: candidateName }];
                    try {
                        const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(cid)}/events`, {
                            method: 'POST',
                            headers: eventApiHeaders(true),
                            body: JSON.stringify({
                                type: eventData.type,
                                date: eventData.date,
                                description: eventData.description || '',
                                status: 'עתידי',
                                linkedTo,
                                history: [
                                    {
                                        user: actorDisplayName,
                                        timestamp: new Date().toISOString(),
                                        summary: 'יצר את האירוע',
                                    },
                                ],
                            }),
                        });
                        if (res.ok) ok += 1;
                        else fail += 1;
                    } catch {
                        fail += 1;
                    }
                }),
            );

            setBulkAddEventOpen(false);
            const total = ids.length;
            if (fail === 0) {
                setFeedbackMessage(t('candidates.bulk_events_recorded', { count: ok }));
            } else {
                setFeedbackMessage(t('candidates.bulk_events_partial', { ok, total, fail }));
            }
            setSelectedIds(new Set());
        },
        [
            apiBase,
            bulkSelectedBackendIds,
            candidates,
            selectedIds,
            getCandidateRouteId,
            t,
            user?.email,
            user?.name,
        ],
    );

    const handleBulkReferSuccess = useCallback(
        (summary: BulkReferSuccessSummary) => {
            const { emailsSent, candidatesSucceeded, candidatesFailed, errors } = summary;
            if (candidatesFailed > 0 || errors.length > 0) {
                const base = t('candidates.bulk_refer_partial', {
                    candidates: candidatesSucceeded,
                    emails: emailsSent,
                    failed: candidatesFailed,
                });
                const errPreview =
                    errors.length > 0 ? ` ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '…' : ''}` : '';
                setFeedbackMessage(base + errPreview);
            } else {
                setFeedbackMessage(
                    t('candidates.bulk_refer_emails_done', {
                        count: emailsSent,
                        candidates: candidatesSucceeded,
                    }),
                );
            }
            setSelectedIds(new Set());
        },
        [t],
    );

    const runBulkFilterPosts = useCallback(
        async (jobId: string, options?: { notes?: string; filterPosition?: string }) => {
            const ids = bulkSelectedBackendIds.map((id) => String(id).trim()).filter(Boolean);
            if (!apiBase || ids.length === 0 || !jobId.trim()) {
                setBulkFilterOpen(false);
                return;
            }
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
            if (token) headers.Authorization = `Bearer ${token}`;
            const body = {
                jobId: jobId.trim(),
                filterNotes: options?.notes?.trim() || '',
                filterPosition: options?.filterPosition?.trim() || '',
            };
            let ok = 0;
            let fail = 0;
            await Promise.all(
                ids.map(async (cid) => {
                    try {
                        const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(body),
                        });
                        if (res.ok) ok += 1;
                        else fail += 1;
                    } catch {
                        fail += 1;
                    }
                }),
            );
            setBulkFilterOpen(false);
            const total = ids.length;
            if (fail === 0) {
                setFeedbackMessage(t('candidates.bulk_filter_recorded', { count: ok }));
            } else if (ok === 0) {
                setFeedbackMessage(t('candidates.bulk_filter_failed', { count: total }));
            } else {
                setFeedbackMessage(t('candidates.bulk_filter_partial', { ok, total, fail }));
            }
            setSelectedIds(new Set());
        },
        [apiBase, bulkSelectedBackendIds, t],
    );

    const handleBulkFilterSave = useCallback(
        async (jobId: string, options?: { notes?: string; filterPosition?: string }) => {
            const ids = bulkSelectedBackendIds.map((id) => String(id).trim()).filter(Boolean);
            if (!apiBase || ids.length === 0 || !jobId.trim()) {
                setBulkFilterOpen(false);
                return;
            }
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
            const headers: Record<string, string> = {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };
            const agg: ScreeningWarningAgg[] = [];
            for (const cid of ids) {
                try {
                    const res = await fetch(
                        `${apiBase}/api/candidates/${encodeURIComponent(cid)}/screening-precheck?jobId=${encodeURIComponent(jobId.trim())}`,
                        { headers, cache: 'no-store' },
                    );
                    if (!res.ok) continue;
                    const j = (await res.json()) as { warnings?: ScreeningWarningAgg['warnings'] };
                    if (Array.isArray(j.warnings) && j.warnings.length) {
                        agg.push({ candidateId: cid, warnings: j.warnings });
                    }
                } catch {
                    /* skip precheck failure — proceed without warning for this id */
                }
            }
            if (agg.length > 0) {
                pendingBulkFilterRef.current = { jobId, options };
                setScreeningCollisionAgg(agg);
                setScreeningCollisionOpen(true);
                return;
            }
            await runBulkFilterPosts(jobId, options);
        },
        [apiBase, bulkSelectedBackendIds, runBulkFilterPosts],
    );

    const handleBulkSavedSearchSave = useCallback(
        (searchId: number) => {
            const search = savedSearches.find(s => s.id === searchId);
            if (!search) return;
            const prevParams =
                search.searchParams && typeof search.searchParams === 'object' && !Array.isArray(search.searchParams)
                    ? { ...search.searchParams }
                    : {};
            const rawPinned = (prevParams as Record<string, unknown>).bulkPinnedCandidateIds;
            const prevPinned = Array.isArray(rawPinned) ? rawPinned.map(String) : [];
            const merged = [...new Set([...prevPinned, ...bulkSelectedBackendIds])];
            const alertConfig =
                search.isAlert === true
                    ? {
                          isAlert: true as const,
                          frequency: (search.frequency === 'weekly' ? 'weekly' : 'daily') as 'daily' | 'weekly',
                          notificationMethods: (search.notificationMethods?.length
                              ? search.notificationMethods
                              : ['system']) as ('email' | 'system')[],
                      }
                    : undefined;
            updateSearch(
                search.id,
                search.name,
                search.isPublic,
                { ...prevParams, bulkPinnedCandidateIds: merged },
                search.additionalFilters,
                search.languageFilters,
                alertConfig,
            );
            setFeedbackMessage(t('candidates.bulk_saved_search_recorded', { count: bulkSelectedBackendIds.length }));
            setSelectedIds(new Set());
        },
        [savedSearches, bulkSelectedBackendIds, updateSearch, t],
    );

    const handleBulkChangeSourceSave = useCallback(
        async (sel: { name: string; id: string | null }) => {
            if (!apiBase || bulkSelectedBackendIds.length === 0) return;
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const body =
                sel.id != null
                    ? { source: sel.name, recruitmentSourceId: sel.id }
                    : { source: sel.name, recruitmentSourceId: null };
            try {
                await Promise.all(
                    bulkSelectedBackendIds.map(async (cid) => {
                        const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(cid)}`, {
                            method: 'PUT',
                            headers,
                            body: JSON.stringify(body),
                        });
                        if (!res.ok) {
                            const errBody = await res.json().catch(() => ({}));
                            throw new Error(typeof errBody?.message === 'string' ? errBody.message : res.statusText);
                        }
                    }),
                );
                setFeedbackMessage(t('candidates.bulk_source_recorded', { count: bulkSelectedBackendIds.length }));
                setSelectedIds(new Set());
                setChangeSourceOpen(false);
                setSuspendListPolling(false);
                void fetchCandidates();
            } catch (e: unknown) {
                setFeedbackMessage(e instanceof Error ? e.message : t('candidates.bulk_source_failed'));
            }
        },
        [apiBase, bulkSelectedBackendIds, fetchCandidates, t],
    );

    const handleBulkStatusSuccess = useCallback(() => {
        const n = bulkSelectedBackendIds.length;
        setFeedbackMessage(t('candidates.bulk_status_done', { count: n }));
        setSelectedIds(new Set());
        setSuspendListPolling(false);
        void fetchCandidates();
    }, [bulkSelectedBackendIds, fetchCandidates, t]);

    useEffect(() => {
        if (feedbackMessage) {
            const timer = setTimeout(() => {
                setFeedbackMessage(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (activeMatchScorePopup !== null && !(event.target as Element).closest('.match-score-popup')) {
            setActiveMatchScorePopup(null);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMatchScorePopup]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (fieldSelectorRef.current && !fieldSelectorRef.current.contains(event.target as Node)) {
            setIsFieldSelectorOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

     useEffect(() => {
        const savedSearchId = searchParamsFromUrl.get('savedSearchId');
        if (savedSearchId) {
            const searchToLoad = savedSearches.find(s => String(s.id) === String(savedSearchId));
            if (searchToLoad) {
                if (loadedSearch?.id !== searchToLoad.id) {
                    const fs = searchToLoad.filterState;

                    // Resolve the new filter values as local variables so we can
                    // pass them directly to fetchCandidatesList — state setters are
                    // async, so we cannot rely on React state being up-to-date yet.
                    let newSearchParams: ListSearchParamsState;
                    let newLangFilters: { language: string; level: string }[];
                    let newComplexRules: ComplexFilterRule[];
                    let newSearchTerm: string;
                    let newCompanyFilters: { sizes: string[]; sectors: string[]; industries: string[]; fields: string[]; roles: string[] };

                    if (fs && Object.keys(fs).length > 0) {
                        newSearchParams  = fs.searchParams ? mergeListSearchParams(fs.searchParams) : mergeListSearchParams({});
                        newComplexRules  = Array.isArray(fs.complexRules)   ? fs.complexRules   : [];
                        newLangFilters   = Array.isArray(fs.languageFilters) ? fs.languageFilters : [];
                        newSearchTerm    = typeof fs.searchTerm === 'string' ? fs.searchTerm     : '';
                        newCompanyFilters = fs.companyFilters ?? { sizes: [], sectors: [], industries: [], fields: [], roles: [] };

                        setSearchParams(newSearchParams);
                        setComplexRules(newComplexRules);
                        setAdditionalFilters(Array.isArray(fs.additionalFilters) ? fs.additionalFilters : []);
                        setLanguageFilters(newLangFilters);
                        setCompanyFilters(newCompanyFilters);
                        setSearchTerm(newSearchTerm);
                        if (typeof fs.smartSearchQuery === 'string') setSmartSearchQuery(fs.smartSearchQuery);
                    } else {
                        // Fallback for searches saved before filterState was introduced.
                        newSearchParams   = mergeListSearchParams(searchToLoad.searchParams);
                        newLangFilters    = searchToLoad.languageFilters ?? [];
                        newComplexRules   = searchToLoad.searchParams?.complexRules ?? [];
                        newSearchTerm     = '';
                        newCompanyFilters = { sizes: [], sectors: [], industries: [], fields: [], roles: [] };

                        setSearchParams(newSearchParams);
                        setAdditionalFilters(searchToLoad.additionalFilters);
                        setLanguageFilters(newLangFilters);
                        setComplexRules(newComplexRules);
                    }

                    setIsAdvancedSearchOpen(true);
                    setLoadedSearch(searchToLoad);

                    // Sync the ref immediately so the fetch below sends the right savedSearchId.
                    loadedSearchRef.current = searchToLoad;

                    // Suppress the page/filter effects from firing a duplicate fetch.
                    suppressNextListFetchEffectRef.current = true;
                    setPage(1);

                    // Build the fetch payload directly from the just-resolved values
                    // (React state is still showing the previous search at this point).
                    const advPayload = buildAdvancedPayloadFromPanel(newSearchParams, newLangFilters, newComplexRules);
                    const hasCF = newCompanyFilters.sizes.length || newCompanyFilters.sectors.length ||
                                  newCompanyFilters.industries.length || newCompanyFilters.fields.length ||
                                  newCompanyFilters.roles.length;
                    if (hasCF) advPayload.companyFilters = newCompanyFilters;

                    void fetchCandidatesList({
                        page: 1,
                        limit: pageSize,
                        search: newSearchTerm,
                        advanced: advPayload,
                        dataIncomplete: showIncompleteOnly,
                        jobId: selectedJobId.trim(),
                        savedSearchId: searchToLoad.id,
                    });
                }
            } else {
                setLoadedSearch(null);
            }
        } else {
             setLoadedSearch(null);
        }
    }, [searchParamsFromUrl, savedSearches, loadedSearch?.id, fetchCandidatesList, pageSize, showIncompleteOnly, selectedJobId]);

    useEffect(() => {
        const tagParam = searchParamsFromUrl.get('tag');
        if (!tagParam) return;
        setSearchParams(prev => {
            if (prev.mainFieldTags.includes(tagParam)) return prev;
            return { ...prev, mainFieldTags: [...prev.mainFieldTags, tagParam] };
        });
    }, [searchParamsFromUrl]);

    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        setSearchParams((prev) => ({
            ...prev,
            interestRole: selectedField?.role?.trim() || '',
            interestField: selectedField?.category?.trim() || '',
        }));
        setIsJobFieldSelectorOpen(false);
    };

    const selectedJobFieldForAdvancedSearch = useMemo((): SelectedJobField | null => {
        const role = String(searchParams.interestRole || '').trim();
        const cat = String(searchParams.interestField || '').trim();
        if (!role || !cat) return null;
        return { category: cat, fieldType: '', role };
    }, [searchParams.interestRole, searchParams.interestField]);

    const loadJobs = useCallback(async () => {
        if (jobs.length > 0) return; // already loaded
        setJobsLoading(true);
        setJobsError(null);
        try {
            const CACHE_KEY = 'candidatesListJobsFilter';
            try {
                const cached = sessionStorage.getItem(CACHE_KEY);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setJobs(parsed);
                        return;
                    }
                }
            } catch { /* ignore */ }

            const base = (apiBase || '').replace(/\/$/, '');
            const url = base ? `${base}/api/jobs` : '/api/jobs';
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error('נכשל בטעינת המשרות');
            const data = await res.json();
            const jobList = Array.isArray(data)
                ? data
                : Array.isArray(data?.rows)
                  ? data.rows
                  : Array.isArray(data?.data)
                    ? data.data
                    : [];
            const mapped = jobList.map((job: any) => ({
                id: job.id,
                title: job.title || job.name || 'ללא שם',
                client: job.client != null ? String(job.client) : '',
                status: job.status != null ? String(job.status) : undefined,
            }));
            setJobs(mapped);
            try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(mapped)); } catch { /* quota */ }
        } catch (err: any) {
            setJobsError(err.message);
        } finally {
            setJobsLoading(false);
        }
    }, [apiBase, jobs.length]);

    // Removed eager useEffect — jobs are loaded lazily when SmartSearchPanel opens (see isSmartSearchOpen toggle)

    const handleSliderChange = (name: string, value: number) => {
        setSearchParams(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenSaveModal = () => {
        setModalMode('save');
        setSearchNameToSave('');
        setIsPublicSearch(false);
        setIsSaveModalOpen(true);
    };

    const handleOpenUpdateModal = () => {
        setModalMode('update');
        setSearchNameToSave(loadedSearch?.name ?? '');
        setIsPublicSearch(loadedSearch?.isPublic ?? false);
        setIsSaveModalOpen(true);
    };
    
    const handleJobComparisonSearch = async () => {
        const job = jobs.find(j => j.id === selectedJobId);
        const hasQuery = smartSearchQuery.trim().length > 0;
        if (!job && !hasQuery) {
            alert('בחר משרה להשוואה מהתפריט או הזן תיאור חכם.');
            return;
        }
        setIsRemoteLoading(true);
        setIsSmartSearching(true);
        setSuspendListPolling(true);
        try {
            const payloadQuery = [smartSearchQuery.trim(), job?.title].filter(Boolean).join(' | ');
            const res = await fetch(`${apiBase}/api/candidates/semantic-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: payloadQuery,
                    ...(selectedJobId.trim() ? { jobId: selectedJobId.trim() } : {}),
                }),
            });
            if (!res.ok) throw new Error('חיפוש חכם נכשל');
            const data = await res.json();
            const list =
                Array.isArray(data) ? data :
                Array.isArray(data?.results) ? data.results :
                Array.isArray(data?.data) ? data.data :
                [];
            const mapped = list.map(mapCandidate);
            setSemanticBaselineCandidates(mapped);
            setCandidates(mapped);
            const label = job ? job.title : smartSearchQuery.trim();
            setFeedbackMessage(`מציג ${list.length} מועמדים דומים ל-${label}`);
        } catch (err: any) {
            setSuspendListPolling(false);
            setSemanticBaselineCandidates(null);
            alert(err.message || 'חיפוש חכם נכשל');
        } finally {
            setIsRemoteLoading(false);
            setIsSmartSearching(false);
        }
    };

    const handleModalSubmit = () => {
        if (!searchNameToSave.trim()) {
            alert('Please enter a name for the search.');
            return;
        }
        const finalSearchParams = { ...searchParams, complexRules };
        const filterState = {
            searchParams,
            complexRules,
            additionalFilters,
            languageFilters,
            companyFilters,
            searchTerm,
            smartSearchQuery,
        };

        if (modalMode === 'update' && loadedSearch) {
            updateSearch(
                loadedSearch.id,
                searchNameToSave,
                isPublicSearch,
                finalSearchParams,
                additionalFilters,
                languageFilters,
                filterState,
            );
            setFeedbackMessage('החיתוך עודכן בהצלחה!');
        } else {
            addSearch(searchNameToSave, isPublicSearch, finalSearchParams, additionalFilters, languageFilters, filterState);
            setFeedbackMessage('החיתוך נשמר בהצלחה!');
        }
        setSearchNameToSave('');
        setIsSaveModalOpen(false);
    };

    const handleJobScopeToggle = (scope: string) => {
        setSearchParams(prev => {
            const newScopes = prev.jobScopes.includes(scope)
                ? prev.jobScopes.filter(s => s !== scope)
                : [...prev.jobScopes, scope];
            return { ...prev, jobScopes: newScopes };
        });
    };
    
    const handleTagFilterModalSave = useCallback((selectedTags: TagOption[]) => {
        const labels = selectedTags
            .map((tag) => (tag.nameHe?.trim() || tag.nameEn?.trim() || tag.tagKey?.trim() || '').trim())
            .filter(Boolean);
        if (!labels.length) return;
        setSearchParams((prev) => ({
            ...prev,
            mainFieldTags: [...new Set([...prev.mainFieldTags, ...labels])],
        }));
    }, []);

    const handleRemoveMainFieldTag = (tagToRemove: string) => {
        setSearchParams(prev => ({
            ...prev,
            mainFieldTags: prev.mainFieldTags.filter(tag => tag !== tagToRemove),
        }));
    };

    const handleAddLanguage = () => {
        if (currentLanguage && currentLevel && !languageFilters.some(f => f.language === currentLanguage)) {
            setLanguageFilters(prev => [...prev, { language: currentLanguage, level: currentLevel }]);
        }
    };

    const handleRemoveLanguage = (languageToRemove: string) => {
        setLanguageFilters(prev => prev.filter(f => f.language !== languageToRemove));
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const processedCandidates = useMemo(() => {
        const base = candidates;
        let filtered = base;

        // Optimistic client-side blacklist filter — server also enforces this by email/phone.
        if (loadedSearch?.blacklist?.length) {
            const blacklistedEmails = new Set(
                loadedSearch.blacklist.map(b => String(b.candidateEmail || '').trim().toLowerCase()).filter(Boolean)
            );
            const blacklistedPhones = new Set(
                loadedSearch.blacklist.map(b => String(b.candidatePhone || '').trim()).filter(Boolean)
            );
            filtered = filtered.filter(c => {
                const email = String(c.email || '').trim().toLowerCase();
                const phone = String(c.phone || '').trim();
                return !(
                    (email && blacklistedEmails.has(email)) ||
                    (phone && blacklistedPhones.has(phone))
                );
            });
        }

        if (showNeedsAttention) {
            filtered = filtered.filter(candidate => getMissingFields(candidate).length > 0);
        }

        if (showFavoritesOnly) {
            filtered = filtered.filter(candidate => favorites.has(candidate.id));
        }

        // Company background filtering is handled server-side via companyFilters in the adv payload

        // Free-text search is applied on the server via ?search= (debounced) when listing from API.
        let sortableItems = filtered;

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = candidateSortComparable(a, sortConfig.key);
                const bValue = candidateSortComparable(b, sortConfig.key);
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return sortableItems;
    }, [candidates, sortConfig, showNeedsAttention, showFavoritesOnly, favorites, loadedSearch]);

    // Server already returns paginated candidates for the selected page.
    const paginatedCandidates = useMemo(() => {
        return processedCandidates;
    }, [processedCandidates]);

    const areAllVisibleSelected = useMemo(() => {
        if (paginatedCandidates.length === 0) return false;
        return paginatedCandidates.every(c => selectedIds.has(c.id));
    }, [selectedIds, paginatedCandidates]);

    useEffect(() => {
        const el = selectAllCheckboxRef.current;
        if (!el) return;
        if (!selectionMode) {
            el.indeterminate = false;
            return;
        }
        const n = paginatedCandidates.length;
        if (n === 0) {
            el.indeterminate = false;
            return;
        }
        const selectedOnPage = paginatedCandidates.filter(c => selectedIds.has(c.id)).length;
        el.indeterminate = selectedOnPage > 0 && selectedOnPage < n;
    }, [selectionMode, paginatedCandidates, selectedIds]);
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(paginatedCandidates.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleColumnToggle = (columnId: string) => {
        if (visibleColumnIds.includes(columnId) && visibleColumnIds.length <= 1) return;
        toggleColumnPref(columnId);
    };
    
    const handleDragStart = (index: number, colId: string) => { 
        dragItemIndex.current = index; 
        setDraggingColumn(colId);
    };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newIds = [...visibleColumnIds];
        const draggedItem = newIds.splice(dragItemIndex.current, 1)[0];
        newIds.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumnIds(newIds);
    };
    const handleDragEnd = () => { 
        dragItemIndex.current = null; 
        setDraggingColumn(null);
    };
    const handleDrop = () => { 
        dragItemIndex.current = null; 
        setDraggingColumn(null);
    };

    const handleShowResults = () => {
        const snapshot = buildAdvancedPayloadFromPanel(searchParams, languageFilters, complexRules);
        skipComplexDebounceOnceRef.current = true;
        setDebouncedComplexRules(complexRules);
        debouncedComplexRulesRef.current = complexRules;
        suppressNextListFetchEffectRef.current = true;
        setAppliedAdvancedFilters(snapshot);
        setPage(1);
        setIsAdvancedSearchOpen(false);
        pendingAdvancedSearchFeedback.current = true;
        setFeedbackMessage(null);

        if (suspendListPolling) {
            const pool =
                semanticBaselineCandidates && semanticBaselineCandidates.length > 0
                    ? semanticBaselineCandidates
                    : candidates;
            const filtered = filterCandidatesByAdvancedClient(
                pool,
                snapshot,
                debouncedSearchTerm,
                showIncompleteOnly,
            );
            setCandidates(filtered);
            setTotalCandidates(filtered.length);
            return;
        }

        setSuspendListPolling(false);
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: snapshot,
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    };

    const handleResetAdvancedToDefaults = useCallback(() => {
        setSearchParams(createDefaultListSearchParams());
        setLanguageFilters([]);
        setComplexRules([]);
        setDebouncedComplexRules([]);
        debouncedComplexRulesRef.current = [];
        setAdditionalFilters([]);
        setLoadedSearch(null);
        setUrlSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            params.delete('savedSearchId');
            return params;
        }, { replace: true });
        setSuspendListPolling(false);
        setSemanticBaselineCandidates(null);
        suppressNextListFetchEffectRef.current = true;
        setAppliedAdvancedFilters(null);
        setPage(1);
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: null,
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    }, [pageSize, debouncedSearchTerm, fetchCandidatesList, setUrlSearchParams, showIncompleteOnly, selectedJobId]);

    const handleExitSavedSearch = () => {
        // Remove savedSearchId from URL
        setUrlSearchParams((params) => {
            const next = new URLSearchParams(params);
            next.delete('savedSearchId');
            return next;
        }, { replace: true });

        // Clear all filters
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setComplexRules([]);
        setDebouncedComplexRules([]);
        debouncedComplexRulesRef.current = [];
        setAdditionalFilters([]);
        setLanguageFilters([]);
        setCompanyFilters({ sizes: [], sectors: [], industries: [], fields: [], roles: [] });
        setSearchParams(mergeListSearchParams({}));
        setAppliedAdvancedFilters(null);
        setLoadedSearch(null);
        loadedSearchRef.current = null;
        setPage(1);
        setSuspendListPolling(false);
        setSemanticBaselineCandidates(null);
        setSmartSearchQuery('');
        try { sessionStorage.removeItem(VIEW_STATE_KEY); } catch { /* ignore */ }

        setHasInitiallyLoaded(false);
        suppressNextListFetchEffectRef.current = true;
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: '',
            advanced: null,
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: null,
        });
    };

    const handleRestoreFromBlacklist = useCallback(async (
        candidateEmail: string | null,
        candidatePhone: string | null,
    ) => {
        const search = loadedSearchRef.current;
        if (!search) return;

        await removeFromSearchBlacklist(search.id, candidateEmail, candidatePhone);

        suppressNextListFetchEffectRef.current = true;
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: debouncedSearchTerm,
            advanced: resolveAdvancedPayloadForFetch(debouncedComplexRulesRef.current),
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: search.id,
        });
        setPage(1);
    }, [
        removeFromSearchBlacklist,
        fetchCandidatesList,
        pageSize,
        debouncedSearchTerm,
        resolveAdvancedPayloadForFetch,
        showIncompleteOnly,
        selectedJobId,
    ]);

    const handleOpenBlacklistedCandidate = useCallback((candidateId: string) => {
        const search = location.search || '';
        navigate(`/candidates/${candidateId}${search}`);
    }, [navigate, location.search]);

    const handleClearSearch = () => {
        // Clear free search
        setSearchTerm('');
        setDebouncedSearchTerm('');
        setComplexRules([]);
        setDebouncedComplexRules([]);
        debouncedComplexRulesRef.current = [];
        setAppliedAdvancedFilters(null);
        setPage(1);
        setSuspendListPolling(false);
        setSemanticBaselineCandidates(null);
        setSmartSearchQuery('');
        setIsSmartSearchOpen(false);

        // Reset saved view (so we don't restore old filters on next mount)
        try {
            sessionStorage.removeItem(VIEW_STATE_KEY);
        } catch {
            // ignore storage errors
        }

        // Show loading buffer again while reloading base list
        setHasInitiallyLoaded(false);

        suppressNextListFetchEffectRef.current = true;
        void fetchCandidatesList({
            page: 1,
            limit: pageSize,
            search: '',
            advanced: null,
            dataIncomplete: showIncompleteOnly,
            jobId: selectedJobId.trim(),
            savedSearchId: loadedSearchRef.current?.id ?? null,
        });
    };

    const handleNameClick = useCallback(
        (e: React.MouseEvent, candidate: Candidate) => {
            e.stopPropagation();
            if (selectionMode) {
                handleSelect(candidate.id);
                return;
            }
            const search = location.search || '';
            navigate(`/candidates/${getCandidateRouteId(candidate)}${search}`, {
                state: {
                    matchedTerms: candidate.matchedTerms?.length ? candidate.matchedTerms : undefined,
                },
            });
        },
        [selectionMode, handleSelect, navigate, getCandidateRouteId, location.search],
    );

    // Helper for score circle colors inside the list view (duplicated logic for consistency)
    const getScoreColorClass = (score: number) => {
        if (score >= 90) return 'text-green-600 border-green-200 bg-green-50';
        if (score >= 75) return 'text-yellow-600 border-yellow-200 bg-yellow-50';
        if (score >= 60) return 'text-orange-600 border-orange-200 bg-orange-50';
        return 'text-red-600 border-red-200 bg-red-50';
    };

    // Updated Handler for Match Score Click
    const handleScoreClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (activeMatchScorePopup?.id === id) {
            setActiveMatchScorePopup(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate position relative to viewport, centered horizontally on button
        setActiveMatchScorePopup({
            id,
            x: rect.left + rect.width / 2,
            y: rect.bottom + 8,
        });
    };

    // Render logic for the popup based on activeMatchState
    const activeCandidateForPopup = activeMatchScorePopup 
        ? processedCandidates.find(c => c.id === activeMatchScorePopup.id)
        : null;

    const renderCell = (candidate: Candidate, columnId: string) => {
        const missingFields = getMissingFields(candidate);
        const hasMissingFields = missingFields.length > 0;
        const isFavorite = favorites.has(candidate.id);
        
        switch (columnId) {
            case 'name':
                return (
                    <div className="flex flex-col">
                         <div className="flex items-center gap-3">
                             <AvatarIcon initials={candidate.avatar} size={36} fontSize={14} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                             <div className="flex flex-col">
                                 <span 
                                    onClick={(e) => handleNameClick(e, candidate)}
                                     className="font-bold text-text-default hover:text-primary-600 cursor-pointer transition-colors text-base"
                                 >
                                     {candidate.name}
                                 </span>
                                 <div className="flex items-center gap-2 mt-0.5">
                                    {hasMissingFields && (
                                        <span title={`חסרים פרטים: ${missingFields.join(', ')}`}>
                                            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
                                        </span>
                                    )}
                                     <button 
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(candidate.id); }} 
                                        className="text-text-subtle hover:text-primary-500 transition-colors"
                                    >
                                        {isFavorite ? <BookmarkIconSolid className="w-4 h-4 text-primary-500" /> : <BookmarkIcon className="w-4 h-4" />}
                                    </button>
                                </div>
                             </div>
                         </div>
                         {/* Enhanced Summary Display */}
                         {candidate.professionalSummary && (
                            <p className="text-xs text-text-muted mt-2 mr-[48px] line-clamp-2 max-w-[400px] leading-relaxed">
                                {candidate.professionalSummary}
                            </p>
                         )}
                         {candidate.matchReasons && candidate.matchReasons.length > 0 && (
                            <p className="text-[11px] text-red-700 mt-1.5 mr-[48px] line-clamp-2 max-w-[420px] font-medium">
                                {candidate.matchReasons.slice(0, 2).map((r) => `«${r.term}»`).join(' · ')}
                            </p>
                         )}
                    </div>
                );
            case 'matchScore': {
                const filterJobId = selectedJobId.trim();
                const lj = candidate.lastJobSubmission;
                const jobFilterMismatch =
                    Boolean(filterJobId) &&
                    Boolean(lj?.jobId) &&
                    String(filterJobId) !== String(lj.jobId);
                const scoreTitle = jobFilterMismatch
                    ? 'הציון מחושב להתאמה למשרה שבחרת במסנן. עמודת ההגשה האחרונה מציגה את המשרה האחרונה אליה הוגש המועמד, ויכולה להיות שונה. לחץ להסבר.'
                    : 'לחץ להסבר';
                const scoreKnown = Boolean(candidate.listMatchScoreFromApi || candidate.matchScoreHydrated);
                const scoreLabel = scoreKnown ? `${candidate.matchScore}%` : '…';
                return (
                    <div className="flex items-center justify-center">
                        <button
                            type="button"
                            onClick={(e) => handleScoreClick(e, candidate.id)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-sm cursor-pointer hover:scale-105 transition-transform ${scoreKnown ? getScoreColorClass(candidate.matchScore) : 'text-text-muted border-border-subtle bg-bg-subtle'}`}
                            title={scoreTitle}
                        >
                            {scoreLabel}
                        </button>
                    </div>
                );
            }
            case 'tags':
                return candidate.tags?.length
                    ? candidate.tags.join(', ')
                    : '';
            case 'location':
                return candidate.location || candidate.address || '';
            case 'jobScopes':
                return candidate.jobScopes?.length ? candidate.jobScopes.join(', ') : '';
            case 'gender':
                return candidate.gender || '';
            case 'age':
                return candidate.age || '';
            case 'salaryMin':
                return formatSalaryExpectationCell(candidate);
            case 'languages': {
                const langs = candidate.languages;
                if (!langs?.length) return '';
                return langs
                    .map((x) => {
                        const name = x?.name || x?.language || '';
                        const lt = x?.levelText != null ? String(x.levelText).trim() : '';
                        if (lt) return `${name}${name && lt ? ' · ' : ''}${lt}`;
                        const lv = x?.level;
                        if (lv != null && lv !== '' && String(lv) !== '50') {
                            return `${name}${name ? ' · ' : ''}${lv}`;
                        }
                        return name;
                    })
                    .filter(Boolean)
                    .join(', ');
            }
            case 'industry': {
                const primaryIndustry = candidate.industry || '';
                const allExps = candidate.companyExperiences || [];
                // Collect extra industries from non-primary experiences
                const extraIndustries = allExps
                    .slice(1)
                    .map((e) => e.industry)
                    .filter((ind): ind is string => Boolean(ind) && ind !== primaryIndustry);
                const uniqueExtra = [...new Set(extraIndustries)];
                if (!primaryIndustry) return '';
                return (
                    <div className="flex items-center gap-1">
                        <span className="truncate">{primaryIndustry}</span>
                        {uniqueExtra.length > 0 && (
                            <span className="relative group/pill flex-shrink-0">
                                <span className="text-[10px] font-bold bg-bg-subtle text-text-muted border border-border-subtle rounded-full px-1.5 py-0.5 cursor-default select-none">
                                    +{uniqueExtra.length}
                                </span>
                                <div className="absolute bottom-full mb-1.5 end-0 w-max max-w-[200px] bg-gray-800 text-white text-xs rounded-lg py-1.5 px-2.5 shadow-xl z-50 opacity-0 group-hover/pill:opacity-100 transition-opacity duration-150 pointer-events-none text-right">
                                    {uniqueExtra.map((ind) => (
                                        <div key={ind} className="py-0.5">• {ind}</div>
                                    ))}
                                </div>
                            </span>
                        )}
                    </div>
                );
            }
            case 'companySize': {
                // Show companySize from the primary (most-recent/current) company experience
                const primaryExp = (candidate.companyExperiences || [])[0];
                const size = primaryExp?.companySize || candidate.companySize || '';
                if (!size) return <span className="text-text-subtle">—</span>;
                return <span className="text-sm">{size}</span>;
            }
            case 'createDate':
                return formatIntakeDateCell(candidate.createDate);
            case 'lastActivity':
                return formatCandidatePoolLastActive(candidate.lastActivity);
            case 'lastSubmissionMatch': {
                const sub = candidate.lastJobSubmission;
                if (!sub?.jobId) {
                    return <span className="text-text-subtle">—</span>;
                }
                return (
                    <button
                        type="button"
                        className="group flex max-w-full cursor-pointer flex-col items-stretch gap-1 rounded-lg px-1 py-0.5 text-start transition-colors hover:bg-primary-50 sm:flex-row sm:items-center sm:gap-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (selectionMode) {
                                handleSelect(candidate.id);
                                return;
                            }
                            navigate(`/jobs/edit/${sub.jobId}`);
                        }}
                        title={sub.jobTitle}
                    >
                        <span className="min-w-0 truncate font-semibold text-primary-700 group-hover:text-primary-800">
                            {sub.jobTitle}
                        </span>
                    </button>
                );
            }
            default:
                return (candidate as any)[columnId];
        }
    };

    return (
        <div className="space-y-6">
            {feedbackMessage && (
                <div className="fixed top-24 right-6 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>{feedbackMessage}</span>
                </div>
            )}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
                 @keyframes slide-up {
                    from { opacity: 0; transform: translateY(100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
                .dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); cursor: grabbing !important; } 
                th[draggable] { user-select: none; }
                @keyframes fade-in-out {
                    0%, 100% { opacity: 0; transform: translateY(-20px); }
                    10%, 90% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-out {
                    animation: fade-in-out 3s ease-in-out forwards;
                }
                @keyframes fade-in-down {
                     from { opacity: 0; transform: translateY(-10px); }
                     to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down { animation: fade-in-down 0.2s ease-out forwards; }
            `}</style>

            <header className="flex flex-col lg:flex-row items-start lg:items-center gap-3 pb-2">
                <div className="w-full lg:flex-grow">
                    <div className="flex gap-2 items-center">
                        <div className="relative flex-grow">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input 
                                type="text" 
                                placeholder={t('candidates.search_placeholder')} 
                                value={searchTerm} 
                                onChange={e => setSearchTerm(e.target.value)} 
                                className="w-full bg-bg-card border border-border-default rounded-xl py-3 ps-10 pe-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition shadow-sm" 
                            />
                        </div>
                        {/* SMART SEARCH TOGGLE BUTTON */}
                        <button 
                            onClick={() => {
                                const opening = !isSmartSearchOpen;
                                setIsSmartSearchOpen(opening);
                                if (opening) loadJobs();
                            }}
                            className={`flex-shrink-0 p-3 rounded-xl border border-border-default transition-all shadow-sm flex items-center justify-center ${isSmartSearchOpen ? 'bg-purple-100 text-purple-700 border-purple-300' : 'bg-bg-card text-text-muted hover:bg-bg-subtle hover:text-purple-600'}`}
                            title="חיפוש חכם"
                        >
                            {isSmartSearching ? (
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                            ) : (
                                <SparklesIcon className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                    <div className="mt-2">
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow-sm border border-primary-600"
                        >
                            נקה חיפוש
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 lg:mt-0">
                    <label className="text-[11px] text-text-muted font-semibold uppercase tracking-wide">גודל עמוד</label>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            const nextSize = Number(e.target.value) || 100;
                            setPageSize(nextSize);
                            setPage(1);
                        }}
                        className="text-sm bg-bg-input border border-border-default rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition shadow-sm"
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Smart Search Panel */}
            <SmartSearchPanel 
                isOpen={isSmartSearchOpen}
                query={smartSearchQuery}
                onQueryChange={setSmartSearchQuery}
                jobs={jobs}
                jobsLoading={jobsLoading}
                jobsError={jobsError}
                selectedJobId={selectedJobId}
                onJobIdChange={setSelectedJobId}
                onSearch={() => { handleJobComparisonSearch(); setIsSmartSearchOpen(false); }}
                onClose={() => setIsSmartSearchOpen(false)}
            />

                <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3 lg:items-center lg:flex-shrink-0">
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto flex-grow sm:flex-grow-0">
                        <button onClick={() => navigate('/candidates/new')} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-sm whitespace-nowrap">
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('candidates.new_candidate_btn')}</span>
                        </button>
                        <button onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl border-2 transition-all whitespace-nowrap ${isAdvancedSearchOpen ? 'bg-primary-600 text-white border-primary-600' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`}>
                             <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            <span>{t('candidates.filter_btn')}</span>
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="relative">
                            <button
                                ref={companyFilterButtonRef}
                                onClick={() => setIsCompanyFilterOpen(prev => !prev)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl border-2 transition-all whitespace-nowrap ${
                                    isCompanyFilterOpen
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'
                                }`}
                            >
                                <BuildingOffice2Icon className="w-5 h-5" />
                                <span>{t('candidates.employment_background_btn')}</span>
                            </button>
                            {isCompanyFilterOpen && (
                                <CompanyFilterPopover
                                    onClose={() => setIsCompanyFilterOpen(false)}
                                    filters={companyFilters}
                                    setFilters={setCompanyFilters}
                                    onApply={fetchCandidates}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 w-full sm:w-auto sm:ms-auto justify-between sm:justify-end lg:justify-start">
                        <div className="flex gap-2">
                             <button onClick={() => setShowNeedsAttention(!showNeedsAttention)} className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${showNeedsAttention ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-bg-card text-text-default border-border-default hover:border-yellow-300'}`} title={t('candidates.needs_attention_tooltip')}>
                                <ExclamationTriangleIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} 
                                className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${showFavoritesOnly ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`}
                                title={t('candidates.favorites_only_tooltip')}
                            >
                                {showFavoritesOnly ? <BookmarkIconSolid className="w-5 h-5" /> : <BookmarkIcon className="w-5 h-5" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowIncompleteOnly((v) => !v);
                                    setPage(1);
                                }}
                                className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${showIncompleteOnly ? 'bg-red-100 text-red-800 border-red-300' : 'bg-bg-card text-text-default border-border-default hover:border-red-300'}`}
                                title="הצג מועמדים עם סטטוס חסר נתונים"
                            >
                                <DocumentTextIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="w-px h-8 bg-border-default mx-1 hidden sm:block flex-shrink-0"></div>

                         <div className="flex items-center bg-bg-subtle p-1.5 rounded-xl border border-border-default flex-shrink-0 ml-2 sm:ms-0">
                            <button onClick={() => setViewMode('grid')} title={t('candidates.view_grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                            <button onClick={() => setViewMode('table')} title={t('candidates.view_list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                </div>
            </header>
            
            {/* ... (Keep the Advanced Search Panel code as is) ... */}
            {isAdvancedSearchOpen && (
                 <div className="bg-bg-card rounded-2xl shadow-sm p-3 space-y-3 border border-border-default transition-all duration-300">
                    {/* ... Same content as before ... */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.tags_skills')}</label>
                            <div
                                className={`w-full bg-bg-input border border-border-default rounded-xl p-1.5 flex items-center flex-wrap gap-2 min-h-[38px] focus-within:ring-2 focus-within:ring-primary-500 transition-shadow ${advFieldModified.tags ? advFieldModifiedClass : ''}`}
                            >
                                {searchParams.mainFieldTags.map((tag, index) => (
                                    <span key={index} className="flex items-center bg-primary-100 text-primary-800 text-xs font-medium pl-2 pr-1.5 py-0.5 rounded-full animate-fade-in">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveMainFieldTag(tag)}
                                            className="me-1 text-primary-500 hover:text-primary-700"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            <XMarkIcon className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setIsFilterTagModalOpen(true)}
                                    className="flex items-center gap-1.5 ms-auto shrink-0 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg px-2.5 py-1.5 transition-colors"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" />
                                    {t('filter.tags_select_catalog')}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.location')}</label>
                             <LocationSelector 
                                selectedLocations={searchParams.locations}
                                onChange={(newLocations) => setSearchParams(prev => ({ ...prev, locations: newLocations }))}
                                className={`w-full ${advFieldModified.locations ? advFieldModifiedClass : ''}`}
                                placeholder={t('filter.location_placeholder')}
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.status')}</label>
                            <select
                                value={searchParams.statusFilter}
                                onChange={(e) =>
                                    setSearchParams((prev) => ({
                                        ...prev,
                                        statusFilter: e.target.value as '' | 'active' | 'inactive',
                                    }))
                                }
                                className={`w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-primary-500 focus:border-primary-500 ${advFieldModified.status ? advFieldModifiedClass : ''}`}
                            >
                                <option value="">{t('filter.status_all')}</option>
                                <option value="active">{t('filter.status_active')}</option>
                                <option value="inactive">{t('filter.status_inactive')}</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.last_updated')}</label>
                            <DateRangeSelector 
                                value={searchParams.lastUpdated} 
                                onChange={(val) => setSearchParams(prev => ({...prev, lastUpdated: val}))} 
                                placeholder={t('filter.status_all')}
                                className={advFieldModified.lastUpdated ? advFieldModifiedClass : ''}
                            />
                        </div>

                         <div className={`lg:col-span-2 ${advFieldModified.jobScopes ? `${advFieldModifiedClass} p-1 -m-0.5` : ''}`}>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.job_scope')}</label>
                            <div className="flex flex-wrap gap-2">
                                {jobScopeOptions.map(scope => (
                                    <button
                                        key={scope}
                                        onClick={() => handleJobScopeToggle(scope)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
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
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.interest_role')}</label>
                             <button 
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className={`w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm flex justify-between items-center text-start hover:border-primary-300 transition-colors h-[38px] ${advFieldModified.interestRole ? advFieldModifiedClass : ''}`}
                            >
                                <span className="truncate">
                                    {searchParams.interestField && searchParams.interestRole
                                        ? `${searchParams.interestField} > ${searchParams.interestRole}`
                                        : searchParams.interestRole || t('filter.interest_role_placeholder')}
                                </span>
                                <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                            </button>
                        </div>
                        
                        <div className={`transition-all duration-300 ease-in-out relative z-30 ${searchParams.interestRole || searchParams.interestField ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.interest_date')}</label>
                             <DateRangeSelector 
                                value={searchParams.interestDate} 
                                onChange={(val) => setSearchParams(prev => ({...prev, interestDate: val}))} 
                                placeholder={t('filter.status_all')}
                                disabled={!searchParams.interestRole && !searchParams.interestField}
                                className={advFieldModified.interestDate ? advFieldModifiedClass : ''}
                            />
                        </div>

                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.gender')}</label>
                            <div className={`flex bg-bg-input border border-border-default rounded-xl p-1 h-[38px] ${advFieldModified.gender ? advFieldModifiedClass : ''}`}>
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'any'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'any' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >{t('filter.gender_all')}</button>
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'female'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'female' ? 'bg-pink-100 text-pink-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >
                                    <span className="flex items-center justify-center gap-1"><GenderFemaleIcon className="w-3 h-3"/> {t('filter.gender_female')}</span>
                                </button>
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'male'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'male' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >
                                     <span className="flex items-center justify-center gap-1"><GenderMaleIcon className="w-3 h-3"/> {t('filter.gender_male')}</span>
                                </button>
                            </div>
                        </div>

                        <div className={`lg:col-span-1 ${advFieldModified.workingHours ? advFieldModifiedClass : ''}`}>
                            <WorkingHoursInput
                                value={searchParams.workingHours || 'גמיש'}
                                onChange={(v) => setSearchParams((prev) => ({ ...prev, workingHours: v }))}
                                label={t('form.working_hours')}
                            />
                        </div>

                        <div className="lg:col-span-1">
                             <DoubleRangeSlider
                                label={t('filter.age_range')} min={18} max={80} step={1}
                                valueMin={Number(searchParams.ageMin)} valueMax={Number(searchParams.ageMax)}
                                onChange={handleSliderChange} nameMin="ageMin" nameMax="ageMax"
                                includeUnknown={searchParams.includeUnknownAge !== false}
                                onIncludeUnknownChange={(checked) => setSearchParams(prev => ({...prev, includeUnknownAge: checked}))}
                                unknownLabel={t('filter.include_unknown_age')}
                                modified={advFieldModified.age}
                            />
                        </div>
                        
                         <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.education')}</label>
                             <button 
                                onClick={() => setSearchParams(p => ({ ...p, hasDegree: !p.hasDegree }))} 
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 transition-all h-[38px] ${searchParams.hasDegree ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' : 'bg-bg-input border-border-default text-text-muted hover:border-primary-300'} ${advFieldModified.hasDegree ? advFieldModifiedClass : ''}`}
                            >
                                <span className="font-semibold text-xs">{t('filter.has_degree')}</span>
                                {searchParams.hasDegree ? <CheckCircleIcon className="w-4 h-4" /> : <AcademicCapIcon className="w-4 h-4 opacity-50"/>}
                            </button>
                        </div>

                        <div className="col-span-full md:col-span-2 lg:col-span-2 grid grid-cols-2 gap-4 p-3 bg-bg-subtle/30 rounded-xl border border-border-default/50 relative overflow-hidden">
                            <DoubleRangeSlider
                                label={t('filter.salary_candidate')} min={5000} max={50000} step={500}
                                valueMin={Number(searchParams.salaryMin)} valueMax={Number(searchParams.salaryMax)}
                                onChange={handleSliderChange} nameMin="salaryMin" nameMax="salaryMax" unit="₪"
                                colorVar="--color-secondary-500"
                                includeUnknown={searchParams.includeUnknownSalary !== false}
                                onIncludeUnknownChange={(checked) => setSearchParams(prev => ({...prev, includeUnknownSalary: checked}))}
                                unknownLabel={t('filter.include_unknown_salary')}
                                icon={<WalletIcon className="w-4 h-4 text-primary-600"/>}
                                modified={advFieldModified.salary}
                            />
                             <DoubleRangeSlider
                                label={t('filter.salary_internal')} min={5000} max={50000} step={500}
                                valueMin={Number(searchParams.internalSalaryMin)} valueMax={Number(searchParams.internalSalaryMax)}
                                onChange={handleSliderChange} nameMin="internalSalaryMin" nameMax="internalSalaryMax" unit="₪"
                                colorVar="--color-primary-600"
                                icon={<SparklesIcon className="w-4 h-4 text-primary-600"/>}
                                modified={advFieldModified.internalSalary}
                            />
                        </div>
                        
                        <div className={`lg:col-span-1 ${advFieldModified.languages ? `${advFieldModifiedClass} p-1 -m-0.5` : ''}`}>
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.languages')}</label>
                             <div className="flex gap-1.5">
                                <select value={currentLanguage} onChange={(e) => setCurrentLanguage(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-1.5 px-2 text-[11px] h-[38px]"><option>עברית</option><option>אנגלית</option><option>רוסית</option></select>
                                <select value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-1.5 px-2 text-[11px] h-[38px]"><option>שפת אם</option><option>גבוהה</option></select>
                                <button onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 p-2 rounded-xl hover:bg-primary-200 transition h-[38px] w-[38px] flex items-center justify-center shrink-0"><PlusIcon className="w-4 h-4"/></button>
                             </div>
                             <div className="flex flex-wrap gap-1 mt-2 min-h-[22px]">
                                {languageFilters.map(filter => (
                                    <span key={filter.language} className="flex items-center bg-sky-50 text-sky-700 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-sky-100">
                                        {filter.language}
                                        <button onClick={() => handleRemoveLanguage(filter.language)} className="me-1 hover:text-red-500"><XMarkIcon className="h-3 w-3" /></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <ComplexQueryBuilder
                        rules={complexRules}
                        onChange={setComplexRules}
                        className={advFieldModified.complexRules ? advFieldModifiedClass : ''}
                        title={t('filter.complex_queries')}
                    />

                    <div className="mt-4 pt-3 border-t border-border-default flex flex-wrap justify-between items-center gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleResetAdvancedToDefaults}
                                className="flex items-center gap-1.5 text-xs font-semibold border-2 border-border-default rounded-xl px-3 py-2 text-text-default hover:border-primary-500 hover:text-primary-700 transition-colors bg-bg-subtle/50"
                            >
                                <ArrowPathIcon className="w-4 h-4 shrink-0" aria-hidden />
                                {t('candidates.clear_selections')}
                            </button>
                            <button onClick={handleOpenSaveModal} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition">
                                <BookmarkIcon className="w-3.5 h-3.5"/>
                                <span>שמור חיפוש חדש</span>
                            </button>
                            {loadedSearch && (
                                <button onClick={handleOpenUpdateModal} className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition">
                                    <BookmarkIcon className="w-3.5 h-3.5"/>
                                    <span>עדכן חיפוש קיים</span>
                                </button>
                            )}
                        </div>
                        <button onClick={handleShowResults} className="bg-primary-600 text-white font-bold py-2 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm">
                            {t('candidates.show_results')}
                        </button>
                    </div>
                 </div>
            )}

            <main className="relative bg-bg-card rounded-2xl shadow-sm overflow-hidden border border-border-default">
                {isRemoteLoading && !hasInitiallyLoaded ? (
                    <div className="flex flex-col items-center justify-center min-h-[320px] gap-4 p-8">
                        <ArrowPathIcon className="w-10 h-10 text-primary-500 animate-spin" aria-hidden />
                        <p className="text-sm font-medium text-text-muted">{ 'טוען מועמדים...'}</p>
                    </div>
                ) : viewMode === 'table' ? (
                    <>
                        <div className="px-4 py-3 border-b border-border-default bg-bg-subtle">
                            <TablePaginationControls
                                page={page}
                                pageSize={pageSize}
                                totalPages={totalPages}
                                pageSizeOptions={pageSizeOptions}
                                onPageChange={goToPage}
                                onPageSizeChange={handlePageSizeSelect}
                                prefix={
                                    <>
                                        <button onClick={toggleSelectionMode} className={`p-1.5 rounded-lg border-2 transition-all flex-shrink-0 ${selectionMode ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`} title={t('candidates.multi_select_tooltip')}>
                                            <CheckCircleIcon className="w-4 h-4" />
                                        </button>
                                        {loadedSearch && (
                                            <>
                                                <span className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-700 text-xs font-medium whitespace-nowrap max-w-[200px]" title={loadedSearch.name}>
                                                    <BookmarkIcon className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{loadedSearch.name}</span>
                                                    <button onClick={handleExitSavedSearch} title="נקה חיפוש שמור" className="shrink-0 ml-0.5 rounded-full hover:bg-primary-200 text-primary-500 hover:text-primary-800 transition-colors p-0.5">
                                                        <XMarkIcon className="w-3 h-3" />
                                                    </button>
                                                </span>
                                                <SavedSearchStatsChips
                                                    searchId={loadedSearch.id}
                                                    resultCount={totalCandidates}
                                                    blacklistCount={loadedSearch.blacklist?.length ?? 0}
                                                    onRestore={handleRestoreFromBlacklist}
                                                    onOpenCandidate={handleOpenBlacklistedCandidate}
                                                />
                                            </>
                                        )}
                                    </>
                                }
                            />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                <tr>
                                    {selectionMode && paginatedCandidates.length > 0 && (
                                        <th className="p-4 w-12 align-middle">
                                            <input
                                                ref={selectAllCheckboxRef}
                                                type="checkbox"
                                                onChange={handleSelectAll}
                                                checked={areAllVisibleSelected}
                                                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                                aria-label={t('actions.select_all_candidates')}
                                            />
                                        </th>
                                    )}
                                    {columns.map((col, index) => (
                                        <th 
                                            key={col.id} 
                                            draggable 
                                            onClick={() => requestSort(col.id as keyof Candidate | 'lastSubmissionMatch')}
                                            onDragStart={() => handleDragStart(index, col.id)} 
                                            onDragEnter={() => handleDragEnter(index)} 
                                            onDragEnd={handleDragEnd} 
                                            onDragOver={(e) => e.preventDefault()} 
                                            onDrop={handleDrop} 
                                            className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''}`}
                                            title="לחץ למיון או גרור לשינוי סדר"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{col.header}</span>
                                                {sortConfig?.key === col.id && (
                                                    <span className="text-text-subtle">
                                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th scope="col" className="px-2 py-3 sticky end-0 bg-bg-subtle w-16">
                                        <div className="relative" ref={settingsRef}>
                                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title={t('candidates.customize_columns')} className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                            {isSettingsOpen && (
                                            <div className="absolute top-full end-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                                <div className="space-y-2">
                                                {allColumns.map(column => (
                                                    <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                                    <input type="checkbox" checked={columns.some(c => c.id === column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                                    {column.header}
                                                    </label>
                                                ))}
                                                </div>
                                            </div>
                                            )}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                            {paginatedCandidates.map(candidate => (
                                <tr key={candidate.id} onClick={() => (selectionMode ? handleSelect(candidate.id) : openSummaryDrawer(candidate))} className={`group transition-colors ${selectionMode ? 'cursor-pointer' : ''} ${selectedIds.has(candidate.id) ? 'bg-primary-50' : 'hover:bg-bg-hover'}`}>
                                    {selectionMode && (
                                        <td className="p-4 align-middle" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(candidate.id)}
                                                onChange={() => handleSelect(candidate.id)}
                                                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                                aria-label={t('actions.select_candidate_row')}
                                            />
                                        </td>
                                    )}
                                    {columns.map(col => (
                                        <td key={col.id} className="p-4 text-text-muted">{renderCell(candidate, col.id)}</td>
                                    ))}
                                    <td className="px-2 py-4 sticky end-0 bg-bg-card group-hover:bg-bg-hover group-[:has(:checked)]:bg-primary-50 transition-colors w-16 relative">
                                        {loadedSearch && (
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    blacklistFromSearch(
                                                        loadedSearch.id,
                                                        String(candidate.email || '').trim() || null,
                                                        String(candidate.phone || '').trim() || null,
                                                    );
                                                }}
                                                title="הסר מחיפוש זה"
                                                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-500 px-2 flex items-center h-7 rounded border border-rose-200 hover:border-rose-600 shadow-sm whitespace-nowrap absolute top-1/2 end-4 -translate-y-1/2 z-10"
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5 inline-block ml-0.5 shrink-0" />
                                                הסר מרשימה זו
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        </div>
                        <div className="px-4 py-3 border-t border-border-default bg-bg-subtle">
                            <TablePaginationControls
                                page={page}
                                pageSize={pageSize}
                                totalPages={totalPages}
                                pageSizeOptions={pageSizeOptions}
                                onPageChange={goToPage}
                                onPageSizeChange={handlePageSizeSelect}
                                prefix={
                                    <>
                                        <button onClick={toggleSelectionMode} className={`p-1.5 rounded-lg border-2 transition-all flex-shrink-0 ${selectionMode ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`} title={t('candidates.multi_select_tooltip')}>
                                            <CheckCircleIcon className="w-4 h-4" />
                                        </button>
                                        {loadedSearch && (
                                            <>
                                                <span className="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-700 text-xs font-medium whitespace-nowrap max-w-[200px]" title={loadedSearch.name}>
                                                    <BookmarkIcon className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{loadedSearch.name}</span>
                                                    <button onClick={handleExitSavedSearch} title="נקה חיפוש שמור" className="shrink-0 ml-0.5 rounded-full hover:bg-primary-200 text-primary-500 hover:text-primary-800 transition-colors p-0.5">
                                                        <XMarkIcon className="w-3 h-3" />
                                                    </button>
                                                </span>
                                                <SavedSearchStatsChips
                                                    searchId={loadedSearch.id}
                                                    resultCount={totalCandidates}
                                                    blacklistCount={loadedSearch.blacklist?.length ?? 0}
                                                    onRestore={handleRestoreFromBlacklist}
                                                    onOpenCandidate={handleOpenBlacklistedCandidate}
                                                />
                                            </>
                                        )}
                                    </>
                                }
                            />
                        </div>
                    </>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                        {paginatedCandidates.map(candidate => {
                            const missingFields = getMissingFields(candidate);
                            const isSelected = selectedIds.has(candidate.id);
                            const isFavorite = favorites.has(candidate.id);
                            return (
                                <div key={candidate.id} onClick={() => selectionMode && handleSelect(candidate.id)} className={`relative rounded-lg transition-all ${selectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-primary-500' : ''}`}>
                                    {selectionMode && (
                                        <div
                                            className="absolute top-3 end-3 z-20 bg-bg-card/90 backdrop-blur-sm p-1 rounded-full shadow-sm border border-border-subtle"
                                            onClick={e => e.stopPropagation()}
                                            onKeyDown={e => e.stopPropagation()}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleSelect(candidate.id)}
                                                className="h-5 w-5 rounded border-2 border-white text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                aria-label={t('actions.select_candidate_row')}
                                            />
                                        </div>
                                    )}
                                    <CandidateCard 
                                        key={candidate.id} 
                                        candidate={candidate} 
                                        onViewProfile={() => {
                                            const search = location.search || '';
                                            navigate(`/candidates/${getCandidateRouteId(candidate)}${search}`);
                                        }}
                                        onOpenSummary={selectionMode ? () => {} : openSummaryDrawer}
                                        missingFields={missingFields}
                                        isFavorite={isFavorite}
                                        onToggleFavorite={toggleFavorite}
                                        onScoreClick={handleScoreClick} // Pass the handler
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
                {isRemoteLoading && hasInitiallyLoaded && (
                    <div className="absolute inset-0 z-20 flex items-start justify-center bg-bg-card/45 backdrop-blur-[1px] pointer-events-none">
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 border border-border-default shadow-sm text-xs font-medium text-text-muted">
                            <ArrowPathIcon className="w-4 h-4 text-primary-500 animate-spin" aria-hidden />
                            <span>טוען נתונים...</span>
                        </div>
                    </div>
                )}
            </main>

            {/* Global Match Score Popup - Rendered outside overflow containers */}
            {activeMatchScorePopup && activeCandidateForPopup && (
                <MatchScoreExplanation
                    candidate={activeCandidateForPopup}
                    onClose={() => setActiveMatchScorePopup(null)}
                    position={{ x: activeMatchScorePopup.x, y: activeMatchScorePopup.y }}
                    matchJobId={
                        selectedJobId.trim() ||
                        activeCandidateForPopup.lastJobSubmission?.jobId ||
                        ''
                    }
                    matchJobTitle={
                        jobs.find(
                            (j) =>
                                j.id ===
                                (selectedJobId.trim() ||
                                    activeCandidateForPopup.lastJobSubmission?.jobId ||
                                    ''),
                        )?.title ||
                        activeCandidateForPopup.lastJobSubmission?.jobTitle ||
                        ''
                    }
                    apiBase={apiBase}
                />
            )}

            <TagSelectorModal
                isOpen={isFilterTagModalOpen}
                onClose={() => setIsFilterTagModalOpen(false)}
                onSave={handleTagFilterModalSave}
                existingTags={searchParams.mainFieldTags}
            />

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-bg-card rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">{modalMode === 'update' ? 'עדכן חיתוך' : 'שמור חיתוך חיפוש'}</h3>
                        <input
                            type="text"
                            value={searchNameToSave}
                            onChange={e => setSearchNameToSave(e.target.value)}
                            placeholder="הזן שם לחיתוך..."
                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 mb-4"
                            autoFocus
                        />
                         <label className="flex items-center gap-2 text-sm text-text-default mb-4 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={isPublicSearch}
                                onChange={e => setIsPublicSearch(e.target.checked)}
                                className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                            />
                            <span>חיתוך ציבורי (גלוי לכלל הרכזים)</span>
                        </label>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsSaveModalOpen(false)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                            <button onClick={handleModalSubmit} className="bg-primary-600 text-white font-bold py-2 px-4 rounded-lg">{modalMode === 'update' ? 'עדכן' : 'שמור'}</button>
                        </div>
                    </div>
                </div>
            )}
             {selectionMode && selectedIds.size > 0 && (
                <div className="fixed bottom-0 start-0 end-0 z-40 p-4 pointer-events-none">
                    <div className="w-full max-w-5xl mx-auto pointer-events-auto">
                        <div className="hidden md:block bg-bg-card rounded-xl shadow-2xl border border-border-default px-4 py-2 animate-slide-up">
                            {isMoreActionsOpen && (
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between py-2 border-b border-border-default mb-2">
                                    <span className="text-sm font-bold text-text-muted shrink-0">{t('actions.more_actions')}:</span>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
                                       
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"
                                            onClick={openBulkSavedSearch}
                                        >
                                            <FolderIcon className="w-5 h-5 shrink-0" />
                                            <span>{t('actions.add_to_saved_search')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"
                                            onClick={openChangeSource}
                                        >
                                            <ArrowPathIcon className="w-5 h-5 shrink-0" />
                                            <span>{t('actions.change_source')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"
                                            onClick={openBulkSendSms}
                                        >
                                            <ChatBubbleBottomCenterTextIcon className="w-5 h-5 shrink-0" />
                                            <span>{t('profile.send_sms')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"
                                            onClick={openBulkSendEmail}
                                        >
                                            <EnvelopeIcon className="w-5 h-5 shrink-0" />
                                            <span>{t('actions.bulk_send_email')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600 disabled:opacity-50 disabled:pointer-events-none"
                                            disabled={isExportingCandidatesSearch}
                                            onClick={() => void handleExportSearchToExcel()}
                                        >
                                            <DocumentArrowDownIcon className="w-5 h-5 shrink-0" />
                                            <span>{t('actions.bulk_download_candidates')}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold">{t('actions.selected_count', { count: selectedIds.size })}</span>
                                        <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm font-semibold text-primary-600 hover:underline">{t('actions.clear_selection')}</button>
                                    </div>
                                    <div className="hidden sm:block w-px h-6 bg-border-default" />
                                    <button type="button" onClick={() => setIsMoreActionsOpen(!isMoreActionsOpen)} className="text-sm font-semibold text-primary-600 flex items-center gap-1">
                                        <span>{t('actions.more_actions')}</span>
                                        {isMoreActionsOpen ? <ChevronUpIcon className="w-4 h-4 shrink-0" /> : <ChevronDownIcon className="w-4 h-4 shrink-0" />}
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 font-semibold text-sm">
                                    <span className="text-text-default whitespace-nowrap">{t('actions.bulk_label')}</span>
                                    <button type="button" className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover whitespace-nowrap" onClick={openBulkRefer}>{t('actions.refer')}</button>
                                    <button type="button" className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover whitespace-nowrap" onClick={openBulkFilter}>{t('actions.add_to_filter')}</button>
                                    <button type="button" className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover whitespace-nowrap" onClick={openBulkChangeStatus}>{t('actions.change_status')}</button>
                                    <button type="button" className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover whitespace-nowrap" onClick={openBulkAddEvent}>{t('actions.add_event')}</button>
                                </div>
                            </div>
                        </div>
                         <div className="md:hidden">
                            <button onClick={() => setIsBulkActionsMobileOpen(true)} className="fixed bottom-6 end-6 bg-primary-600 text-white rounded-full shadow-lg h-16 w-16 flex flex-col items-center justify-center animate-fade-in">
                                <span className="font-bold text-lg">{selectedIds.size}</span>
                                <span className="text-xs">פעולות</span>
                            </button>
                            {isBulkActionsMobileOpen && (
                                <div className="fixed inset-0 bg-black/40" onClick={() => setIsBulkActionsMobileOpen(false)}>
                                    <div className="absolute bottom-0 start-0 end-0 bg-bg-card rounded-t-2xl p-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-bold text-lg">{t('actions.selected_count', { count: selectedIds.size })}</h3>
                                            <button onClick={() => setIsBulkActionsMobileOpen(false)}><XMarkIcon className="w-6 h-6"/></button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-center font-semibold">
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover" onClick={openBulkRefer}>{t('actions.refer')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover" onClick={openBulkFilter}>{t('actions.add_to_filter')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5" onClick={openBulkSavedSearch}><FolderIcon className="w-4 h-4 shrink-0" />{t('actions.add_to_saved_search')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5" onClick={openChangeSource}><ArrowPathIcon className="w-4 h-4 shrink-0"/>{t('actions.change_source')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover" onClick={openBulkChangeStatus}>{t('actions.change_status')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover" onClick={openBulkAddEvent}>{t('actions.add_event')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5" onClick={openBulkSendEmail}><EnvelopeIcon className="w-5 h-5"/>{t('actions.bulk_send_email')}</button>
                                            <button type="button" className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5" onClick={openBulkSendSms}><ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>{t('profile.send_sms')}</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><WhatsappIcon className="w-5 h-5"/>שלח Whatsapp</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><ArchiveBoxIcon className="w-5 h-5"/>ארכיון</button>
                                            {/* MOBILE DOWNLOAD ACTION */}
                                            <button
                                                type="button"
                                                className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                disabled={isExportingCandidatesSearch}
                                                onClick={() => void handleExportSearchToExcel()}
                                            >
                                                <DocumentArrowDownIcon className="w-5 h-5"/>
                                                {t('actions.bulk_download_candidates')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            )}

            <BulkReferModal
                isOpen={bulkReferOpen}
                onClose={() => setBulkReferOpen(false)}
                candidateBackendIds={bulkSelectedBackendIds}
                selectedCount={selectedIds.size}
                jobs={bulkJobPickerOptions}
                onSuccess={handleBulkReferSuccess}
            />
            <BulkChangeStatusModal
                isOpen={bulkStatusOpen}
                onClose={() => setBulkStatusOpen(false)}
                candidateIds={bulkSelectedBackendIds}
                selectedCount={selectedIds.size}
                onSuccess={handleBulkStatusSuccess}
            />
            <ScreeningCollisionWarningModal
                isOpen={screeningCollisionOpen}
                onClose={() => {
                    setScreeningCollisionOpen(false);
                    pendingBulkFilterRef.current = null;
                }}
                aggregate={screeningCollisionAgg}
                onConfirm={() => {
                    const p = pendingBulkFilterRef.current;
                    pendingBulkFilterRef.current = null;
                    setScreeningCollisionOpen(false);
                    if (p) void runBulkFilterPosts(p.jobId, p.options);
                }}
            />
            <BulkAddToFilterModal
                isOpen={bulkFilterOpen}
                onClose={() => setBulkFilterOpen(false)}
                onSave={handleBulkFilterSave}
                selectedCount={selectedIds.size}
                jobs={bulkJobPickerOptions}
                candidateBackendIds={bulkSelectedBackendIds}
            />
            <BulkAddToSavedSearchModal
                isOpen={bulkSavedSearchOpen}
                onClose={() => setBulkSavedSearchOpen(false)}
                onSave={handleBulkSavedSearchSave}
                selectedCount={selectedIds.size}
            />
            <ChangeSourceModal
                clientId={user?.clientId ?? null}
                isOpen={changeSourceOpen}
                onClose={() => setChangeSourceOpen(false)}
                onSave={handleBulkChangeSourceSave}
                selectedCount={selectedIds.size}
            />

            <EventFormModal
                isOpen={bulkAddEventOpen}
                onClose={() => setBulkAddEventOpen(false)}
                onSave={(ev) => {
                    void handleBulkAddEventSave(ev);
                }}
                event={null}
                context="candidate"
            />

            <JobFieldSelector
                value={selectedJobFieldForAdvancedSearch}
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
        </div>
    );
}

export default CandidatesListView;
