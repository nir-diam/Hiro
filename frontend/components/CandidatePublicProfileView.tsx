
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
    PencilIcon, BriefcaseIcon, MapPinIcon, ArrowUpTrayIcon, ShareIcon, UserIcon, 
    CheckCircleIcon, SparklesIcon, DocumentTextIcon, ArrowDownTrayIcon, XMarkIcon, 
    ChevronDownIcon, ChevronUpIcon, BookmarkIcon, BellIcon, TrashIcon, PlusIcon, 
    BuildingOffice2Icon, ClockIcon, CalendarDaysIcon, EnvelopeIcon, PhoneIcon, 
    LanguageIcon, AcademicCapIcon, HiroLogotype, ArrowLeftIcon, 
    UserCircleIcon, BookmarkIconSolid, PaperAirplaneIcon, InboxIcon, VideoCameraIcon,
    ExclamationTriangleIcon, TagIcon, FlagIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon
} from './Icons';
import MainContent from './MainContent'; 
import AccordionSection from './AccordionSection';
import { useSavedSearches } from '../context/SavedSearchesContext';
import { JobAlertModalConfig } from './CreateJobAlertModal';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import { useLocation, useNavigate } from 'react-router-dom'; 
import ShareProfileModal from './ShareProfileModal';
import HiroAIChat from './HiroAIChat'; 
import { GoogleGenAI, Type, FunctionDeclaration, Chat } from '@google/genai'; 
import ApplyModal from './ApplyModal';
import CandidateApplicationsView from './CandidateApplicationsView';
import JobSearchFilters from './JobSearchFilters';
import CandidateScreeningWizard, { ScreeningQuestion } from './CandidateScreeningWizard'; // New Import
import { generateExperienceSummaryForCandidate } from '../services/experienceSummaryService';
import { useLanguage } from '../context/LanguageContext';
import TagSelectorModal, { TagCategory, TagOption } from './TagSelectorModal';
import { SmartTagType, SmartTagData } from './SmartTagTypes';
import TagRowGroup from './TagRowGroup';
import { buildCandidateGroupedSmartTags } from '../utils/candidateGroupedSmartTags';
import {
    ApprovedTagRecord,
    fetchApprovedTagsCatalog,
    ValidatedSuggestionItem,
} from '../services/profileSuggestionValidation';
import { buildCandidateFullName, syncCandidateNameFields } from '../utils/candidateName';
import { educationEntryToDisplayLine, normalizeDrivingLicensesForPrint, normalizeLanguagesForPrintRows, splitWorkExperienceForPrint } from '../utils/printableResumeFormatting';
import CityEditableField from './CityEditableField';
import { candidateCityDisplay, candidateCityPatch } from '../utils/citySearchApi';
import CandidateProfileVideoModal from './CandidateProfileVideoModal';
import CandidateApprovedByCandidateBadge from './CandidateApprovedByCandidateBadge';
import { startCandidatePortalRecording, stopCandidatePortalRecording } from '../utils/candidatePortalPosthog';
import { fetchJobMatches, type JobMatchResult } from '../utils/candidateJobMatchingApi';
import {
    computeCandidateProfileCompleteness,
    PROFILE_COMPLETENESS_LABELS,
    scrollToProfileCompletenessTarget,
    type ProfileCompletenessFieldId,
} from '../utils/candidateProfileCompleteness';

// --- AI TOOLS DEFINITIONS ---
const updateCandidateFieldFunctionDeclaration: FunctionDeclaration = {
  name: 'updateCandidateField',
  parameters: {
    type: Type.OBJECT,
    description: 'Update a specific field in the candidate profile data.',
    properties: {
      fieldName: { type: Type.STRING, description: 'The field name to update (e.g., fullName, title, location, professionalSummary, phone, email).' },
      newValue: { type: Type.STRING, description: 'The new value for the field.' },
    },
    required: ['fieldName', 'newValue'],
  },
};

const upsertWorkExperienceFunctionDeclaration: FunctionDeclaration = {
  name: 'upsertWorkExperience',
  parameters: {
    type: Type.OBJECT,
    description: 'Add a new work experience or update an existing one.',
    properties: {
      id: { type: Type.NUMBER, description: 'Optional. Use ONLY if updating an existing record ID provided in context.' },
      title: { type: Type.STRING, description: 'Job title.' },
      company: { type: Type.STRING, description: 'Company name.' },
      startDate: { type: Type.STRING, description: 'Start date (YYYY-MM).' },
      endDate: { type: Type.STRING, description: 'End date (YYYY-MM or Present).' },
      description: { type: Type.STRING, description: 'Description of the role.' },
    },
    required: ['title', 'company'],
  },
};

const CONTEXT_LABELS: Record<string, string> = {
    Core: 'עיקרי',
    Tool: 'כלי/טכנולוגיה',
    Degree: 'השכלה',
    Certification: 'הסמכה',
    Industry: 'ענף',
};

const RAW_TYPE_LABELS: Record<string, string> = {
    Role: 'תפקיד',
    Skill: 'מיומנות',
    Tool: 'כלי',
    Certification: 'הסמכה',
    Degree: 'השכלה',
    Language: 'שפה',
    Industry: 'ענף',
};

const SMART_TAG_RAW_TYPE_MAP: Record<SmartTagType, string> = {
    role: 'Role',
    seniority: 'Seniority',
    skill: 'Skill',
    tool: 'Tool',
    soft: 'Skill',
    industry: 'Industry',
    certification: 'Certification',
    language: 'Language',
};

const formatConfidenceLabel = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    if (value >= 0.95) return 'בביטחון גבוה';
    if (value >= 0.8) return 'בביטחון בינוני';
    if (value >= 0.6) return 'בביטחון נמוך';
    return 'בביטחון מוגבל';
};

const MAX_VISIBLE_TAGS = 5;
const TAG_LINE_CONFIG: Array<{ type: SmartTagType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { type: 'role', label: 'תפקיד', icon: TagIcon },
    { type: 'seniority', label: 'בכירות', icon: FlagIcon },
    { type: 'skill', label: 'מיומנויות', icon: SparklesIcon },
    { type: 'industry', label: 'תעשייה', icon: BuildingOffice2Icon },
    { type: 'certification', label: 'השכלה/הסמכה', icon: AcademicCapIcon },
    { type: 'language', label: 'שפה', icon: LanguageIcon },
];

const ensureArray = (val: any) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) return parsed;
            return [val];
        } catch {
            return [val];
        }
    }
    return [];
};

const normalizeCandidateData = (data: any) => {
    const copy = { ...data };
    copy.tags = ensureArray(copy.tags).map((t: any) => (typeof t === 'string' ? t : String(t?.value || t || ''))).filter(Boolean);
    copy.desiredRoles = ensureArray(copy.desiredRoles)
        .map((r: any) => {
            if (typeof r === 'string') return { value: r };
            if (r && typeof r === 'object' && r.value) return r;
            return null;
        })
        .filter(Boolean);
    copy.workExperience = Array.isArray(copy.workExperience) ? copy.workExperience : [];
    const soft = ensureArray(copy.softSkills || copy.skills?.soft);

    const deriveLevelText = (level: number) => {
        if (level >= 80) return 'מומחה';
        if (level >= 60) return 'מתקדם';
        if (level >= 40) return 'טוב';
        return 'בסיסי';
    };

    const normalizeTechSkill = (item: any) => {
        if (!item) return null;
        if (typeof item === 'string') {
            const level = 50;
            return {
                id: Date.now() + Math.random(),
                name: item,
                level,
                levelText: deriveLevelText(level),
            };
        }
        if (typeof item === 'object') {
            if (item.name) {
                const level = typeof item.level === 'number' ? item.level : 50;
                return {
                    ...item,
                    level,
                    levelText: item.levelText || deriveLevelText(level),
                };
            }
            const charKeys = Object.keys(item).filter((k) => !isNaN(Number(k)));
            if (charKeys.length) {
                const name = charKeys
                    .sort((a, b) => Number(a) - Number(b))
                    .map((k) => item[k])
                    .join('')
                    .trim();
                const level = typeof item.level === 'number' ? item.level : 50;
                return {
                    id: Date.now() + Math.random(),
                    name: name || 'מיומנות',
                    level,
                    levelText: item.levelText || deriveLevelText(level),
                };
            }
        }
        return null;
    };

    const rawTech = ensureArray(copy.techSkills || copy.skills?.technical);
    const tech = rawTech.map(normalizeTechSkill).filter(Boolean);

    copy.softSkills = soft;
    copy.techSkills = tech;
    copy.skills = { soft, technical: tech };
    copy.candidateNotes = copy.candidateNotes ?? copy.internalNotes ?? '';
    copy.languages = ensureArray(copy.languages);
    copy.preferredWorkModels = ensureArray(copy.preferredWorkModels)
        .map((x: any) => String(x || '').trim())
        .filter(Boolean);
    const drivingLicensesNorm = ensureArray(copy.drivingLicenses)
        .map((x: any) => String(x || '').trim())
        .filter(Boolean);
    copy.drivingLicenses =
        drivingLicensesNorm.length > 0
            ? drivingLicensesNorm
            : copy.drivingLicense && String(copy.drivingLicense).trim() !== '' && String(copy.drivingLicense) !== '-'
              ? [String(copy.drivingLicense).trim()]
              : [];
    const employmentTypesNorm = ensureArray(copy.employmentTypes)
        .map((x: any) => String(x || '').trim())
        .filter(Boolean);
    copy.employmentTypes =
        employmentTypesNorm.length > 0
            ? employmentTypesNorm
            : copy.employmentType
              ? [String(copy.employmentType).trim()]
              : ['שכיר'];
    const jobScopesNorm = ensureArray(copy.jobScopes)
        .map((x: any) => String(x || '').trim())
        .filter(Boolean);
    copy.jobScopes =
        jobScopesNorm.length > 0
            ? jobScopesNorm
            : copy.jobScope
              ? [String(copy.jobScope).trim()]
              : [];
    if (copy.drivingLicenses?.length) {
        copy.drivingLicense = copy.drivingLicenses[0];
    }
    if (copy.employmentTypes?.length) {
        copy.employmentType = copy.employmentTypes[0];
    }
    if (copy.jobScopes?.length) {
        copy.jobScope = copy.jobScopes[0];
    }
    copy.preferences = ensureArray(copy.preferences);
    copy.interests = ensureArray(copy.interests);
    copy.candidateNotes = copy.candidateNotes || '';
    if (copy.salaryMin !== undefined && copy.salaryMin !== null) copy.salaryMin = Number(copy.salaryMin) || 0;
    if (copy.salaryMax !== undefined && copy.salaryMax !== null) copy.salaryMax = Number(copy.salaryMax) || 0;
    if (!copy.profileName) copy.profileName = copy.title || 'פרופיל';
    copy.approveByCandidate = Boolean(copy.approveByCandidate);
    copy.consentToJobOffers = Boolean(copy.consentToJobOffers);

    const rawAvail = String(copy.availability ?? '').trim();
    const pwIncoming =
        copy.preferredWorkingHours != null ? String(copy.preferredWorkingHours).trim() : '';
    const isRecruitmentEmoji = /^[🟢🟡🟠🔴]/.test(rawAvail);
    const looksLikeDailyHours =
        rawAvail === 'גמיש' ||
        rawAvail === 'ללא אילוצי שעות' ||
        /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(rawAvail);

    if (isRecruitmentEmoji) {
        copy.availability = rawAvail;
    } else if (looksLikeDailyHours && rawAvail !== '') {
        copy.availability = '';
    } else {
        copy.availability = rawAvail;
    }

    if (pwIncoming !== '') {
        copy.preferredWorkingHours = pwIncoming;
    } else if (looksLikeDailyHours && rawAvail !== '') {
        copy.preferredWorkingHours = rawAvail;
    } else {
        copy.preferredWorkingHours = 'גמיש';
    }

    syncCandidateNameFields(copy);
    const city = candidateCityDisplay(copy);
    if (city) {
        copy.address = city;
        copy.location = city;
    }
    return copy;
};

type CandidateTagDetail = {
    tagKey?: string;
    displayNameHe?: string;
    displayNameEn?: string;
    rawType?: string;
    context?: string;
    isCurrent?: boolean;
    isInSummary?: boolean;
    confidenceScore?: number;
    finalScore?: number;
};

const getRawTypeLabelHe = (rawType?: string): string | undefined => {
    if (!rawType || typeof rawType !== 'string') return undefined;
    const exact = RAW_TYPE_LABELS[rawType];
    if (exact) return exact;
    const capped = rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
    return RAW_TYPE_LABELS[capped] ?? RAW_TYPE_LABELS[rawType.toLowerCase()] ?? undefined;
};

const formatFinalScoreLabel = (value?: number): string | undefined => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    const v = Math.max(100, Math.min(350, value));
    const level = v >= 250 ? 'גבוהה' : v >= 150 ? 'בינוני' : 'נמוך';
    return `ביטחון: ${level}`;
};

const buildTagTooltipText = (tag: string, detail?: CandidateTagDetail) => {
    if (!detail) return undefined;
    const rawTypeLabelHe = getRawTypeLabelHe(detail.rawType);
    const descriptor = rawTypeLabelHe ? `זוהה כ${rawTypeLabelHe}` : undefined;
    const contextLabel = detail.context ? (CONTEXT_LABELS[detail.context] || detail.context) : undefined;
    const temporalLabel = detail.isCurrent ? 'נוכחי' : 'ניסיון עבר';
    const summaryLabel = detail.isInSummary ? 'נכלל בסיכום' : 'לא נכלל בסיכום';
    const confidenceFromScore = formatConfidenceLabel(detail.confidenceScore);
    const finalScoreLabel = formatFinalScoreLabel(detail.finalScore) ?? confidenceFromScore;
    const parts = [
        descriptor,
        contextLabel ? `בהקשר ${contextLabel}` : undefined,
        temporalLabel,
        summaryLabel,
        finalScoreLabel,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
};

const inferSmartTagType = (detail?: CandidateTagDetail): SmartTagType => {
    const raw = (detail?.rawType || '').toLowerCase();
    if (raw.includes('role')) return 'role';
    if (raw.includes('seniority') || raw.includes('level')) return 'seniority';
    if (raw.includes('industry')) return 'industry';
    if (raw.includes('certification') || raw.includes('degree') || raw.includes('education')) return 'certification';
    if (raw.includes('language')) return 'language';
    if (raw.includes('tool')) return 'tool';
    if (raw.includes('soft')) return 'soft';
    if (raw.includes('skill')) return 'skill';
    return 'skill';
};

/** Empty shell only — no placeholder labels/images until API data arrives */
const EMPTY_CANDIDATE_FORM: Record<string, any> = {
    id: null,
    profileName: '',
    fullName: '',
    firstName: '',
    lastName: '',
    title: '',
    location: '',
    professionalSummary: '',
    phone: '',
    email: '',
    profilePicture: '',
    profileVideoUrl: '',
    tags: [],
    desiredRoles: [],
    workExperience: [],
    education: [],
    languages: [],
    softSkills: [],
    techSkills: [],
    salaryMin: 0,
    salaryMax: 0,
    status: '',
    address: '',
    idNumber: '',
    maritalStatus: '',
    gender: '',
    drivingLicense: '',
    drivingLicenses: [] as string[],
    mobility: '',
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    age: '',
    employmentType: '',
    employmentTypes: ['שכיר'] as string[],
    jobScope: '',
    jobScopes: [] as string[],
    availability: '',
    preferredWorkingHours: 'גמיש',
    physicalWork: '',
    preferredWorkModels: [] as string[],
    internalNotes: '',
    candidateNotes: '',
    approveByCandidate: false,
    consentToJobOffers: false,
};

const cloneEmptyCandidateForm = () => JSON.parse(JSON.stringify(EMPTY_CANDIDATE_FORM));

const PROFILE_DUPLICATE_SKIP_KEYS = new Set([
    'id',
    'backendId',
    'createdAt',
    'updatedAt',
    'isDeleted',
    'isArchived',
    'matchScore',
    'matchAnalysis',
    'embedding',
    'searchText',
    'searchTextSavedAt',
    'originalText',
    'events',
    'candidateTags',
    'tagDetails',
    'tags',
    'internalNotes',
    'lastActivity',
    'lastActive',
    'statusExplanation',
    'recruitmentSourceId',
    'recruitmentSourceCreatedAt',
    'recruitmentSourceUpdatedAt',
    'approveByCandidate',
    'consentToJobOffers',
]);

const cloneProfileRows = (rows: unknown, regenIds = false): unknown[] =>
    ensureArray(rows).map((row) => {
        if (!row || typeof row !== 'object') return row;
        const copy = { ...(row as Record<string, unknown>) };
        if (regenIds && 'id' in copy) {
            copy.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }
        return copy;
    });

const buildTagEntriesFromSource = (source: Record<string, unknown>) => {
    const details = ensureArray(source.tagDetails);
    if (details.length) {
        return details
            .map((detail: any) => ({
                tagKey: String(detail.tagKey || detail.displayNameHe || detail.displayNameEn || '').trim(),
                displayNameHe: String(detail.displayNameHe || detail.tagKey || detail.displayNameEn || '').trim(),
                displayNameEn: String(detail.displayNameEn || '').trim(),
                raw_type: detail.rawType || detail.raw_type || 'skill',
                context: detail.context,
                confidence_score: detail.confidenceScore ?? detail.confidence_score,
                calculated_weight: detail.calculatedWeight ?? detail.calculated_weight,
                final_score: detail.finalScore ?? detail.final_score,
            }))
            .filter((entry) => entry.tagKey && entry.displayNameHe);
    }
    return ensureArray(source.tags)
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .map((tag) => ({
            tagKey: tag,
            displayNameHe: tag,
            displayNameEn: tag,
            raw_type: 'skill',
        }));
};

const buildProfileDuplicatePayload = (
    source: Record<string, unknown>,
    profileName: string,
    userId: string,
) => {
    const clone = JSON.parse(JSON.stringify(source || {})) as Record<string, unknown>;
    PROFILE_DUPLICATE_SKIP_KEYS.forEach((key) => {
        delete clone[key];
    });
    clone.userId = userId;
    clone.profileName = profileName;
    clone.title = profileName;
    clone.workExperience = cloneProfileRows(clone.workExperience, true);
    clone.education = cloneProfileRows(clone.education, true);
    clone.experience = cloneProfileRows(clone.experience, true);
    clone.documents = cloneProfileRows(clone.documents, true);
    clone.desiredRoles = cloneProfileRows(clone.desiredRoles, false);
    clone.languages = cloneProfileRows(clone.languages, false);
    clone.softSkills = cloneProfileRows(clone.softSkills, false);
    clone.techSkills = cloneProfileRows(clone.techSkills, false);
    if (clone.skills && typeof clone.skills === 'object') {
        const skills = clone.skills as Record<string, unknown>;
        clone.skills = {
            soft: cloneProfileRows(skills.soft, false),
            technical: cloneProfileRows(skills.technical, false),
        };
    }
    return clone;
};

interface Message {
    role: 'user' | 'model';
    text: string;
}

// --- COMPONENTS ---

// 1. Sidebar Component - UPDATED with Pending Tasks Section
const CandidateSidebar: React.FC<{
    activeView: string;
    onViewChange: (view: string) => void;
    activeProfile: any;
    activeProfileId: string | number | null;
    profiles: any[];
    onSwitchProfile: (id: string | number) => void;
    onAddProfile: () => void;
    isOpenMobile: boolean;
    setIsOpenMobile: (val: boolean) => void;
    favoriteCount: number;
    pendingTasks: any[]; // New Prop
    onTaskClick: (task: any) => void; // New Prop
    pendingTasksCount: number;
    onDeleteProfile: (id: string) => void;
    deletingProfileId: string | null;
}> = ({ activeView, onViewChange, activeProfile, activeProfileId, profiles, onSwitchProfile, onAddProfile, isOpenMobile, setIsOpenMobile, favoriteCount, pendingTasks, onTaskClick, onDeleteProfile, deletingProfileId }) => {
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

    const menuItems = [
        { id: 'profile', label: 'הפרופיל שלי', icon: UserCircleIcon },
        { id: 'jobs', label: 'משרות רלוונטיות', icon: SparklesIcon },
        { id: 'applications', label: 'הגשות שלי', icon: CheckCircleIcon, badge: pendingTasks.length > 0 ? pendingTasks.length : undefined, badgeColor: 'bg-red-500' },
        { id: 'offers', label: 'הצעות שקיבלתי', icon: InboxIcon }, 
        { id: 'favorites', label: `משרות שאהבתי (${favoriteCount})`, icon: BookmarkIcon },
        { id: 'agent', label: 'סוכן חכם', icon: SparklesIcon },
    ];

    const handleLogout = () => {
        try {
            localStorage.clear();
        } catch (e) {
            console.error('Failed clearing localStorage', e);
        }
        window.location.href = '/login';
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpenMobile && (
                <div 
                    className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsOpenMobile(false)}
                />
            )}

            <aside className={`fixed lg:sticky top-0 right-0 h-full w-72 bg-white border-l border-border-default z-50 transition-transform duration-300 ease-in-out ${isOpenMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} flex flex-col shadow-xl lg:shadow-none`}>
                
                {/* Brand Header */}
                <div className="p-6 border-b border-border-default flex items-center justify-between flex-shrink-0">
                    <HiroLogotype className="h-8" />
                    <button onClick={() => setIsOpenMobile(false)} className="lg:hidden p-1 text-text-muted">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Profile Switcher */}
                <div className="p-4 border-b border-border-default flex-shrink-0">
                    <div className="relative">
                        <button 
                            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                            className="w-full flex items-center gap-3 p-3 bg-bg-subtle rounded-xl border border-border-default hover:border-primary-300 transition-all text-right group"
                        >
                            {activeProfile?.profilePicture ? (
                                <img src={activeProfile.profilePicture} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                            ) : (
                                <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm bg-bg-subtle flex items-center justify-center text-text-subtle">
                                    <UserCircleIcon className="w-6 h-6" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-text-muted">פרופיל פעיל:</p>
                                <p className="font-bold text-text-default truncate text-sm">{activeProfile?.profileName?.trim() || '—'}</p>
                            </div>
                            <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProfileMenuOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-border-default z-50 overflow-hidden animate-fade-in">
                                <div className="p-2 space-y-1">
                                    <p className="px-3 py-2 text-xs font-bold text-text-muted uppercase tracking-wider">הפרופילים שלי</p>
                                    {profiles.map(p => {
                                        const isDeleted = Boolean(p.isDeleted);
                                        const isActive = p.id === activeProfileId;
                                        return (
                                        <button 
                                            key={p.id}
                                            onClick={() => {
                                                if (isDeleted) return;
                                                onSwitchProfile(p.id);
                                                setIsProfileMenuOpen(false);
                                            }}
                                            className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors relative overflow-hidden ${isActive ? 'bg-primary-50 text-primary-700' : 'hover:bg-bg-hover text-text-default'} ${isDeleted ? 'bg-red-50 border border-red-100 text-red-600 cursor-not-allowed opacity-80' : ''}`}
                                            disabled={isDeleted}
                                        >
                                            <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-primary-500' : 'bg-gray-300'}`}></div>
                                            <span className="truncate">{p.profileName}</span>
                                            {isDeleted && (
                                                <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                                                    מחוק
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); onDeleteProfile(p.id); }}
                                                disabled={deletingProfileId === p.id}
                                                className="ml-auto p-1 rounded-full text-red-500 hover:text-red-700 transition"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </button>
                                    )})}
                                    <div className="border-t border-border-default my-1"></div>
                                    <button 
                                        onClick={() => { onAddProfile(); setIsProfileMenuOpen(false); }}
                                        className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-primary-600 hover:bg-primary-50 font-medium"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        יצירת פרופיל חדש
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Navigation (Scrollable Part) */}
                <div className="flex-1 overflow-y-auto">
                    <nav className="p-4 space-y-1">
                        {menuItems.map(item => {
                            const Icon = item.icon;
                            const isActive = activeView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => { onViewChange(item.id); setIsOpenMobile(false); }}
                                    className={`w-full flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                                        isActive 
                                        ? 'bg-primary-600 text-white shadow-md shadow-primary-500/20' 
                                        : 'text-text-muted hover:bg-bg-hover hover:text-text-default'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : item.id === 'agent' ? 'text-purple-500' : 'text-text-subtle'}`} />
                                        {item.label}
                                    </div>
                                    {item.badge && (
                                        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${item.badgeColor || 'bg-red-500'}`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Pending Tasks Section - MOVED HERE */}
                    {pendingTasks.length > 0 && (
                        <div className="px-4 pb-4">
                            <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                                <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <BellIcon className="w-4 h-4" />
                                    משימות דחופות
                                </h4>
                                <div className="space-y-3">
                                    {pendingTasks.map(task => (
                                        <div key={task.id} className="bg-white p-3 rounded-xl shadow-sm border border-red-100/50">
                                            <div className="flex items-start gap-2 mb-2">
                                                 <div className="mt-0.5 min-w-[16px]"><ExclamationTriangleIcon className="w-4 h-4 text-red-500" /></div>
                                                 <div>
                                                    <p className="text-xs font-bold text-gray-800 leading-tight">שאלון סינון</p>
                                                    <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{task.jobTitle}</p>
                                                 </div>
                                            </div>
                                            <button 
                                                onClick={() => { onTaskClick(task); setIsOpenMobile(false); }}
                                                className="w-full bg-red-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-1.5"
                                            >
                                                <VideoCameraIcon className="w-3 h-3" />
                                                בצע כעת
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border-default flex-shrink-0">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 p-3 text-text-muted hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors text-sm font-medium"
                    >
                        <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                        התנתקות
                    </button>
                </div>
            </aside>
        </>
    );
};

// ... (Other helpers: ProfileLoadingSkeleton, JobCard, PrintableResume, etc. remain the same) ...
const ProfileLoadingSkeleton = () => (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-8 animate-pulse">
        <div className="flex items-center gap-6">
            <div className="w-28 h-28 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-3">
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
        </div>
        <div className="flex gap-2 mt-4">
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
             <div className="h-8 w-20 bg-gray-200 rounded-full"></div>
        </div>
        <div className="h-32 bg-gray-200 rounded-xl mt-6"></div>
    </div>
);

const AVAILABILITY_OPTIONS = [
    { value: '', label: 'בחר זמינות למשרה' },
    { value: '🟢 מיידי (זמין לעבודה מיד).', label: '🟢 מיידי — זמין/ה לעבודה מיד' },
    { value: '🟡 חודש הודעה (עובד, מחפש אקטיבית).', label: '🟡 חודש הודעה — מחפש/ת אקטיבית' },
    { value: '🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).', label: '🟠 פסיבי — פתוח/ה להצעות' },
    { value: '🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).', label: '🔴 לא רלוונטי כרגע' },
] as const;

const CANDIDATE_MATCH_PARAM_LABELS: Partial<Record<keyof JobMatchResult['parameterMatches'], string>> = {
    mandatory_skill: 'כישורי חובה',
    license: 'רישיון נהיגה',
    mobility: 'ניידות',
    scope: 'היקף משרה',
    work_hours: 'שעות עבודה',
    availability: 'זמינות',
    mandatory_language: 'שפות נדרשות',
    salary: 'התאמת שכר',
    age: 'טווח גיל',
};

function buildCandidateMatchTooltip(job: JobMatchResult): string {
    const matched: string[] = [];
    const pm = job.parameterMatches;
    if (pm) {
        for (const [key, label] of Object.entries(CANDIDATE_MATCH_PARAM_LABELS)) {
            if (pm[key as keyof typeof pm] === 'match' && label) matched.push(label);
        }
    }
    const bd = job.scoreBreakdown;
    const layer = (score: unknown, text: string) => {
        if (typeof score === 'number' && Number.isFinite(score) && score >= 70) matched.push(text);
    };
    layer(bd?.semanticScore ?? bd?.vector, 'התאמה מקצועית לתיאור המשרה');
    layer(bd?.tagsScore ?? bd?.tags, 'התאמת כישורים מקצועיים');
    layer(bd?.geoScore ?? bd?.geo, 'מיקום גיאוגרפי');
    layer(bd?.intentScore ?? bd?.intent, 'התאמת העדפות עבודה');
    layer(bd?.experienceScore ?? bd?.experience, 'התאמת ניסיון תעסוקתי');
    const unique = [...new Set(matched)];
    if (!unique.length) return 'התאמה גבוהה לפרופיל שלך ביחס לדרישות המשרה';
    return `עמדת ב: ${unique.join(' · ')}`;
}

function mapJobMatchToPortalCard(job: JobMatchResult) {
    const jobTypes = Array.isArray(job.jobType) ? job.jobType.filter(Boolean) : [];
    const analyzed = job.lastAnalyzed ? new Date(job.lastAnalyzed) : null;
    return {
        id: job.id,
        title: job.title || '—',
        company: job.client || '—',
        location: job.city || '—',
        type: jobTypes.length ? jobTypes.join(', ') : 'משרה',
        date:
            analyzed && !Number.isNaN(analyzed.getTime())
                ? analyzed.toLocaleDateString('he-IL')
                : '—',
        description: typeof job.description === 'string' ? job.description : '',
        logo: null as string | null,
        matchTooltip: buildCandidateMatchTooltip(job),
    };
}

const JobCard: React.FC<{
    job: {
        id: string;
        title: string;
        company: string;
        location: string;
        type: string;
        date: string;
        description: string;
        logo?: string | null;
        matchTooltip?: string;
    };
    onApply: () => void;
    isFavorite: boolean;
    toggleFavorite: () => void;
}> = ({ job, onApply, isFavorite, toggleFavorite }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="bg-bg-card rounded-xl border border-border-default hover:border-primary-300 hover:shadow-md transition-all group relative overflow-hidden flex flex-col h-full">
             <div className="absolute top-4 left-4 z-10">
                 <button 
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(); }}
                    className="text-text-subtle hover:text-primary-500 transition-colors p-1.5 rounded-full hover:bg-white/80"
                    title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                >
                    {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
                </button>
             </div>
            <div 
                className="p-5 cursor-pointer flex-grow flex flex-col"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex justify-between items-start mb-3">
                     <div className="w-12 h-12 rounded-lg bg-white border border-border-default flex items-center justify-center p-1 shadow-sm">
                        {job.logo ? <img src={job.logo} alt={job.company} className="max-w-full max-h-full object-contain" /> : <BriefcaseIcon className="w-6 h-6 text-gray-400" />}
                    </div>
                </div>
                
                <h3 className="font-bold text-text-default text-lg mb-1 group-hover:text-primary-700 transition-colors leading-tight">{job.title}</h3>
                <p className="text-sm text-text-muted mb-2 font-medium">{job.company}</p>
                {job.matchTooltip ? (
                    <div
                        className="inline-flex items-center gap-1.5 mb-3 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full cursor-help"
                        title={job.matchTooltip}
                    >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        התאמה גבוהה
                    </div>
                ) : null}
                
                <div className="flex flex-wrap gap-2 mb-4 mt-auto">
                    <span className="text-xs bg-bg-subtle text-text-muted px-2.5 py-1 rounded-md border border-border-default flex items-center gap-1">
                        <MapPinIcon className="w-3 h-3" /> {job.location}
                    </span>
                    <span className="text-xs bg-bg-subtle text-text-muted px-2.5 py-1 rounded-md border border-border-default">
                        {job.type}
                    </span>
                </div>
                
                <div className="flex items-center justify-between text-xs text-text-subtle border-t border-border-subtle pt-3">
                    <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5"/> {job.date}</span>
                    <div className="flex items-center gap-1 text-primary-600 font-semibold group-hover:underline">
                         <span>{isExpanded ? 'סגור פרטים' : 'פרטים והגשה'}</span>
                         <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>
            
            {isExpanded && (
                <div className="p-5 bg-bg-subtle/30 border-t border-border-default animate-fade-in">
                     <div 
                        className="text-sm text-text-default mb-5 leading-relaxed prose prose-sm max-w-none [&>ul]:list-disc [&>ul]:pr-5 [&>strong]:text-primary-800"
                        dangerouslySetInnerHTML={{ __html: job.description }} 
                     />
                     <button 
                        onClick={(e) => { e.stopPropagation(); onApply(); }} 
                        className="w-full bg-primary-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 flex items-center justify-center gap-2"
                    >
                        <PaperAirplaneIcon className="w-5 h-5 transform rotate-180" />
                        הגש מועמדות
                    </button>
                </div>
            )}
        </div>
    );
};

const EditableField: React.FC<{
    value: string;
    placeholder: string;
    onSave: (newValue: string) => void;
    className?: string;
    icon?: React.ReactNode;
    multiline?: boolean;
    truncate?: boolean;
}> = ({ value, placeholder, onSave, className = "", icon, multiline = false, truncate = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
        }
    }, [isEditing]);

    const handleSave = () => {
        onSave(localValue);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !multiline) {
            handleSave();
        } else if (e.key === 'Escape') {
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    return (
        <div className={`relative group flex items-start gap-2 ${className}`}>
            {icon && <span className="mt-1 text-text-subtle shrink-0">{icon}</span>}
            <div className="flex-grow min-w-0">
                {isEditing ? (
                    multiline ? (
                         <textarea
                            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border border-primary-500 rounded p-1 text-inherit focus:ring-2 focus:ring-primary-200 outline-none resize-none"
                            placeholder={placeholder}
                            rows={3}
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border-b-2 border-primary-500 outline-none text-inherit"
                            placeholder={placeholder}
                        />
                    )
                ) : (
                    <div className="relative pr-6">
                         <div 
                            onClick={() => setIsEditing(true)}
                            className="cursor-pointer hover:bg-bg-hover/50 rounded-md py-0.5 px-1 min-h-[1.5em]"
                        >
                            <p className={`whitespace-pre-line break-words leading-relaxed ${truncate ? 'line-clamp-3' : ''}`}>
                                {value || <span className="text-text-subtle opacity-60 italic">{placeholder}</span>}
                            </p>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

function formatCvPrintDate(d?: string | null): string {
    if (d == null || !String(d).trim()) return '';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).split('-').reverse().join('/');
    return s;
}

export const PrintableResume: React.FC<{
    data: any;
    className?: string;
    hideCompanyLogo?: boolean;
    /** Tighter typography for PDF capture (off-screen clone). On-screen ResumeViewer uses default + hidden compact for export. */
    density?: 'default' | 'compact';
}> = ({ data, className = '', hideCompanyLogo = false, density = 'default' }) => {
    const displayName = buildCandidateFullName(data.firstName, data.lastName) || data.fullName || '';
    const printLanguages = normalizeLanguagesForPrintRows(data.languages);
    const printDrivingLicenses = normalizeDrivingLicensesForPrint(data);
    const explicitMilitary = Array.isArray(data.militaryExperience) ? data.militaryExperience : [];
    const { civilianWorkExperience, militaryExperience } = splitWorkExperienceForPrint(
        Array.isArray(data.workExperience) ? data.workExperience : [],
        explicitMilitary,
    );
    const compact = density === 'compact';

    const rootPad = compact ? 'p-3' : 'p-10';
    const headerBar = compact ? 'pb-1.5 mb-3' : 'pb-4 mb-6';
    const h1Cls = compact ? 'text-xl font-extrabold text-gray-900 mb-0.5 break-words leading-tight' : 'text-4xl font-extrabold text-gray-900 mb-1 break-words';
    const titleCls = compact ? 'text-sm text-primary-600 font-semibold leading-tight' : 'text-xl text-primary-600 font-semibold';
    const brandCls = compact ? 'text-sm font-bold tracking-tight text-gray-800 mb-0.5 flex items-center gap-1' : 'text-xl font-bold tracking-tight text-gray-800 mb-1 flex items-center gap-2';
    const brandMark = compact ? 'w-5 h-5 text-xs' : 'w-8 h-8';
    const hiroCls = compact ? 'text-[8px] text-gray-400 font-medium tracking-wide' : 'text-[10px] text-gray-400 font-medium tracking-wide';
    const contactBar = compact
        ? 'flex flex-wrap gap-1.5 text-[11px] leading-tight text-gray-600 mb-3 items-center bg-gray-50 px-2 py-1.5 rounded [&_svg]:w-3 [&_svg]:h-3'
        : 'flex flex-wrap gap-4 text-sm text-gray-600 mb-8 items-center bg-gray-50 p-3 rounded';
    const secTitle = compact
        ? 'text-xs font-bold text-gray-800 uppercase border-b border-gray-200 mb-1.5 pb-0.5 leading-tight'
        : 'text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-3 pb-1';
    /** תמצית מנהלים stays default-sized even in compact (PDF) so it stays readable. */
    const executiveSummaryHeadingCls =
        'text-lg font-bold text-gray-800 uppercase border-b border-gray-200 mb-3 pb-1 flex items-center justify-between';
    const executiveSummaryBodyCls =
        'text-sm leading-relaxed text-gray-700 whitespace-pre-line text-justify';
    const expSectionMb = compact ? 'mb-4' : 'mb-8';
    const expStack = compact ? 'space-y-3' : 'space-y-6';
    const expH4 = compact ? 'text-xs font-bold text-gray-900 leading-tight' : 'text-base font-bold text-gray-900';
    const expDate = compact ? 'text-[9px] font-medium text-gray-500 bg-gray-100 px-1 py-0.5 rounded shrink-0' : 'text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0';
    const expCompany = compact ? 'text-[11px] font-semibold text-primary-700 mb-0.5 leading-tight' : 'text-sm font-semibold text-primary-700 mb-2';
    const expDesc = compact ? 'text-[11px] text-gray-700 leading-tight whitespace-pre-line' : 'text-sm text-gray-700 leading-relaxed whitespace-pre-line';
    const eduSec = compact ? 'mb-4 break-inside-avoid' : 'mb-8 break-inside-avoid';
    const eduUl = compact ? 'space-y-1.5' : 'space-y-3';
    const eduLi = compact ? 'text-[11px] leading-tight' : 'text-sm';
    const grid2 = compact ? 'grid grid-cols-2 gap-4 break-inside-avoid' : 'grid grid-cols-2 gap-8 break-inside-avoid';
    const skillTag = compact
        ? 'bg-gray-100 text-gray-800 text-[9px] font-medium px-1 py-0.5 rounded border border-gray-200 leading-tight'
        : 'bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-1 rounded border border-gray-200';
    const langUl = compact ? 'space-y-0.5 text-[11px] leading-tight' : 'space-y-2 text-sm';

    const renderExperienceSection = (
        items: any[],
        heading: string,
        headingMb: string,
    ) => (
        <section className={`printable-resume-section ${expSectionMb}`}>
            <h3 className={`printable-resume-section-title ${secTitle} ${headingMb}`}>{heading}</h3>
            <div className={expStack}>
                {items.map((exp: any, index: number) => {
                    const start = formatCvPrintDate(exp.startDate);
                    const end = formatCvPrintDate(exp.endDate);
                    const dateLabel =
                        (typeof exp.dateRangeLabel === 'string' && exp.dateRangeLabel.trim()) ||
                        [start, end].filter(Boolean).join(' — ');
                    return (
                        <div key={`${heading}-${index}`} className="printable-resume-entry">
                            <div className="printable-resume-entry-head break-inside-avoid">
                                <div className="flex flex-wrap justify-between items-baseline gap-x-2 gap-y-0.5 mb-0.5">
                                    <h4 className={`${expH4} min-w-0 flex-1`}>{exp.title}</h4>
                                    {dateLabel ? (
                                        <span dir="ltr" className={expDate}>
                                            {dateLabel}
                                        </span>
                                    ) : null}
                                </div>
                                {exp.company ? <div className={expCompany}>{exp.company}</div> : null}
                            </div>
                            {exp.description ? (
                                <p className={`printable-resume-entry-desc ${expDesc}`}>{exp.description}</p>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </section>
    );

    return (
        <div
            className={`printable-resume-root bg-white text-gray-900 font-sans ${rootPad} max-w-[210mm] mx-auto shadow-none print:shadow-none ${className}`}
        >
            <style>{`
                @media print {
                    @page { margin: 12mm; size: A4; }
                    html, body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .printable-resume-root {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 12mm !important;
                        overflow: visible !important;
                    }
                    .printable-resume-root * {
                        overflow: visible !important;
                    }
                    .printable-resume-section-title {
                        break-after: avoid-page;
                        page-break-after: avoid;
                    }
                    .printable-resume-entry-head {
                        break-inside: avoid-page;
                        page-break-inside: avoid;
                    }
                    .printable-resume-entry-desc {
                        break-inside: auto;
                        page-break-inside: auto;
                    }
                    .printable-resume-root p,
                    .printable-resume-root li {
                        orphans: 3;
                        widows: 3;
                    }
                }
            `}</style>

            {/* Header */}
            <div
                className={`printable-resume-header border-b-2 border-gray-800 ${headerBar} flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 break-inside-avoid`}
            >
                <div className="min-w-0 flex-1 order-2 sm:order-1">
                    <h1 className={h1Cls}>{displayName}</h1>
                    {data.title ? <h2 className={titleCls}>{data.title}</h2> : null}
                </div>
                {!hideCompanyLogo ? (
                    <div className="flex flex-col items-start text-right shrink-0 order-1 sm:order-2">
                        <div className={brandCls}>
                            <div
                                className={`${brandMark} bg-primary-100 rounded flex items-center justify-center text-primary-700 font-serif`}
                            >
                                מ&quot;א
                            </div>
                            מימד אנושי
                        </div>
                        <div className={hiroCls}>
                            נוצר באמצעות <span className="font-bold text-gray-500">HIRO</span>
                        </div>
                    </div>
                ) : (
                    <div className={`${hiroCls} shrink-0 order-1 sm:order-2`}>
                        נוצר באמצעות <span className="font-bold text-gray-500">HIRO</span>
                    </div>
                )}
            </div>

            {/* Contact Info */}
            <div className={contactBar}>
                {data.phone && (
                    <div className="flex items-center gap-1">
                        <PhoneIcon className="w-4 h-4" />
                        <span>{data.phone}</span>
                    </div>
                )}
                {data.email && (
                    <div className="flex items-center gap-1">
                        <EnvelopeIcon className="w-4 h-4" />
                        <span>{data.email}</span>
                    </div>
                )}
                {data.location && (
                    <div className="flex items-center gap-1">
                        <MapPinIcon className="w-4 h-4" />
                        <span>{data.location}</span>
                    </div>
                )}
            </div>

            {/* Summary — always default typography */}
            {data.professionalSummary && (
                <section className="printable-resume-section mb-6">
                    <h3 className={`printable-resume-section-title ${executiveSummaryHeadingCls}`}>תמצית מנהלים</h3>
                    <p className={`printable-resume-entry-desc ${executiveSummaryBodyCls}`}>{data.professionalSummary}</p>
                </section>
            )}

            {/* Experience */}
            {civilianWorkExperience.length > 0 &&
                renderExperienceSection(
                    civilianWorkExperience,
                    'ניסיון תעסוקתי',
                    compact ? 'mb-2' : 'mb-4',
                )}

            {/* Military service */}
            {militaryExperience.length > 0 &&
                renderExperienceSection(
                    militaryExperience,
                    'ניסיון צבאי',
                    compact ? 'mb-2' : 'mb-4',
                )}

            {/* Education */}
            {data.education && data.education.length > 0 && (
                <section className={`printable-resume-section ${eduSec}`}>
                    <h3 className={`printable-resume-section-title ${secTitle} ${compact ? 'mb-2' : 'mb-4'}`}>השכלה</h3>
                    <ul className={eduUl}>
                        {data.education.map((edu: any, index: number) => {
                            const line = educationEntryToDisplayLine(edu);
                            if (!line) return null;
                            return (
                                <li key={index} className={eduLi}>
                                    <span className="font-semibold block text-gray-900">{line}</span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {/* Driving licenses */}
            {printDrivingLicenses.length > 0 && (
                <section className={`printable-resume-section ${compact ? 'mb-4 break-inside-avoid' : 'mb-8 break-inside-avoid'}`}>
                    <h3 className={`printable-resume-section-title ${secTitle} ${compact ? 'mb-2' : 'mb-3'}`}>רישיונות נהיגה</h3>
                    <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
                        {printDrivingLicenses.map((license) => (
                            <span key={license} className={skillTag}>
                                {license}
                            </span>
                        ))}
                    </div>
                </section>
            )}

            {/* Skills & Languages Grid */}
            {(printLanguages.length > 0 || (data.tagDetails?.length ?? 0) > 0) && (
                <div className={compact ? 'space-y-4' : 'space-y-6'}>
                    {(data.tagDetails?.length ?? 0) > 0 && (
                        <section className="printable-resume-section">
                            <h3 className={`printable-resume-section-title ${secTitle} ${compact ? 'mb-2' : 'mb-3'}`}>מיומנויות</h3>
                            <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
                                {(Array.isArray(data.tagDetails) ? data.tagDetails : []).map((tag: any, index: number) => {
                                    const label =
                                        typeof tag === 'string'
                                            ? tag
                                            : tag?.displayNameHe ?? tag?.nameHe ?? tag?.value ?? tag?.name ?? tag?.label ?? tag?.tagKey ?? '';
                                    if (!label) return null;
                                    return (
                                        <span key={index} className={skillTag}>
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {printLanguages.length > 0 && (
                        <section className="printable-resume-section">
                            <h3 className={`printable-resume-section-title ${secTitle} ${compact ? 'mb-2' : 'mb-3'}`}>שפות</h3>
                            <ul className={langUl}>
                                {printLanguages.map((row, index: number) => (
                                    <li
                                        key={index}
                                        className="flex justify-between border-b border-gray-100 pb-1 last:border-0 gap-2"
                                    >
                                        <span className="font-medium">{row.name}</span>
                                        <span className="text-gray-500 shrink-0">{row.levelText}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
};

const CvFilesManagementModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    resumeUrl?: string;
    candidateName?: string;
}> = ({ isOpen, onClose, resumeUrl, candidateName }) => {
    if (!isOpen) return null;

    const url = String(resumeUrl ?? '').trim();
    const isDocx = /\.(doc|docx)$/i.test(url);
    const docxViewerUrl = isDocx ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : '';
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);

    return (
        <div
            className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-bg-card w-full max-w-4xl h-[min(90vh,52rem)] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/50 shrink-0">
                    <h2 className="font-bold text-lg text-text-default">צפייה בקורות חיים</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-4">
                    {url ? (
                        <div className="flex flex-col gap-3 h-full min-h-[50vh]">
                            <p className="text-xs text-text-muted text-right">
                                {candidateName ? `קובץ מקורי — ${candidateName}` : 'קובץ מקורי'}
                            </p>
                            <div className="flex-1 min-h-[50vh] border border-border-default rounded-2xl overflow-auto bg-black/5">
                                {isImage ? (
                                    <img
                                        src={url}
                                        alt="קורות חיים מקוריים"
                                        className="object-contain w-full h-full min-h-[50vh]"
                                    />
                                ) : (
                                    <iframe
                                        style={{ width: '100%', minWidth: '200px', height: '100%', minHeight: '50vh' }}
                                        src={isDocx ? docxViewerUrl : url}
                                        title="מסמך מקורי"
                                        className="w-full"
                                    />
                                )}
                            </div>
                            <p className="text-center text-xs text-text-muted">
                                לא נטען?{' '}
                                <a
                                    className="text-primary-600 font-bold underline"
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    פתח / הורד את הקובץ
                                </a>
                            </p>
                        </div>
                    ) : (
                        <p className="text-sm text-text-muted text-center py-16">לא הועלה קובץ מקורי.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const RESUME_PRINT_CONTAINER_ID = 'resume-print-only-container';

const ResumePreviewModal: React.FC<{ isOpen: boolean; onClose: () => void; data: any }> = ({ isOpen, onClose, data }) => {
    if (!isOpen) return null;

    const handlePrint = () => {
        const source = document.getElementById('resume-preview-print-root');
        if (!source) return;

        document.getElementById(RESUME_PRINT_CONTAINER_ID)?.remove();

        const printContainer = document.createElement('div');
        printContainer.id = RESUME_PRINT_CONTAINER_ID;
        printContainer.setAttribute('dir', 'rtl');
        printContainer.innerHTML = source.innerHTML;

        document.body.appendChild(printContainer);
        document.body.classList.add('resume-print-mode');
        document.documentElement.classList.add('resume-print-mode');

        const cleanup = () => {
            document.body.classList.remove('resume-print-mode');
            document.documentElement.classList.remove('resume-print-mode');
            printContainer.remove();
        };
        window.addEventListener('afterprint', cleanup, { once: true });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                window.print();
            });
        });
    };

    return (
        <>
            <style>{`
                #${RESUME_PRINT_CONTAINER_ID} {
                    position: fixed;
                    left: -10000px;
                    top: 0;
                    width: 210mm;
                    visibility: hidden;
                    pointer-events: none;
                }
                @media print {
                    html.resume-print-mode,
                    html.resume-print-mode body {
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    html.resume-print-mode body > *:not(#${RESUME_PRINT_CONTAINER_ID}) {
                        display: none !important;
                    }
                    html.resume-print-mode #${RESUME_PRINT_CONTAINER_ID} {
                        display: block !important;
                        position: static !important;
                        left: auto !important;
                        top: auto !important;
                        width: 100% !important;
                        max-width: none !important;
                        min-height: 0 !important;
                        height: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                        overflow: visible !important;
                    }
                    html.resume-print-mode #${RESUME_PRINT_CONTAINER_ID} * {
                        overflow: visible !important;
                    }
                    html.resume-print-mode #${RESUME_PRINT_CONTAINER_ID} .printable-resume-root {
                        width: 100% !important;
                        max-width: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                }
            `}</style>
            <div
                className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm print:static print:inset-auto print:bg-white print:p-0 print:backdrop-blur-none print:block print:h-auto print:overflow-visible"
                onClick={onClose}
            >
                <div
                    className="bg-bg-card w-full max-w-4xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fade-in print:h-auto print:max-w-none print:rounded-none print:shadow-none print:overflow-visible print:block print:min-h-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/50 print:hidden">
                        <h2 className="font-bold text-lg text-text-default">תצוגת AI חכמה</h2>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handlePrint}
                                className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition font-medium text-sm shadow-sm"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4" />
                                הדפס / שמור כ-PDF
                            </button>
                            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-gray-100 p-8 custom-scrollbar print:p-0 print:bg-white print:overflow-visible print:h-auto print:max-h-none print:block">
                        <div
                            id="resume-preview-print-root"
                            className="bg-white shadow-lg mx-auto max-w-[210mm] print:shadow-none print:mx-0 print:max-w-none print:min-h-0 print:h-auto"
                        >
                            <PrintableResume data={data} className="block" hideCompanyLogo density="compact" />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

// 4. Main View Component
const CandidatePublicProfileView: React.FC<{ openJobAlertModal: (config: JobAlertModalConfig) => void }> = ({ openJobAlertModal }) => {
    const locationState = useLocation();
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const { t } = useLanguage();
    
    // State
    const [profiles, setProfiles] = useState<any[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string | number | null>(null);
    const [candidateId, setCandidateId] = useState<string | null>(null);
    const [activeView, setActiveView] = useState('profile');
    const [isSwitching, setIsSwitching] = useState(false);
    const [isDeletingProfileId, setIsDeletingProfileId] = useState<string | null>(null);
    const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
    const [isResumePreviewOpen, setIsResumePreviewOpen] = useState(false);
    const [isCvViewerOpen, setIsCvViewerOpen] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const resumeInputRef = useRef<HTMLInputElement>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [uploadState, setUploadState] = useState<{ inProgress: boolean; type?: 'profile' | 'resume' | 'profile-video'; message?: string }>({ inProgress: false });
    const [isProfileVideoModalOpen, setIsProfileVideoModalOpen] = useState(false);
    const [completenessBannerDismissed, setCompletenessBannerDismissed] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    
    // --- State for Pending Tasks (Screening) ---
    const [isScreeningWizardOpen, setIsScreeningWizardOpen] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<any[]>([]);

    const filterVisibleProfiles = (items: any[]) => items.filter((item) => !item.isDeleted);

    // Derived Active Profile
    const activeProfile = useMemo(() => {
        if (!profiles.length) return undefined;
        return profiles.find((p) => p.id === activeProfileId) || profiles[0];
    }, [activeProfileId, profiles]);

    /** Profile versions for the logged-in user only (same userId as active profile). */
    const userProfiles = useMemo(() => {
        const anchorUserId = activeProfile?.userId ?? profiles[0]?.userId;
        if (!anchorUserId) return profiles;
        return profiles.filter((p) => String(p.userId) === String(anchorUserId));
    }, [profiles, activeProfile?.userId]);

    const navigableProfiles = useMemo(
        () => filterVisibleProfiles(userProfiles),
        [userProfiles],
    );

    const currentProfileIndex = useMemo(
        () => navigableProfiles.findIndex((p) => String(p.id) === String(activeProfileId ?? '')),
        [navigableProfiles, activeProfileId],
    );

    // Data for forms (synced with active profile)
    const [formData, setFormData] = useState<any>(() => cloneEmptyCandidateForm());
    
    // UI State for Header Interactions
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [joinCandidatePool, setJoinCandidatePool] = useState(false);
    const [matchedJobs, setMatchedJobs] = useState<JobMatchResult[]>([]);
    const [matchedJobsLoading, setMatchedJobsLoading] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<SmartTagType>>(new Set());
    const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    const [tagSelectorCategory, setTagSelectorCategory] = useState<TagCategory>('role');
    const [localTagDetails, setLocalTagDetails] = useState<CandidateTagDetail[]>([]);
    const [approvedTagsCatalog, setApprovedTagsCatalog] = useState<ApprovedTagRecord[]>([]);
    const ROW_CATEGORY_MAP: Record<string, TagCategory> = {
        roles: 'role',
        qualifications: 'role',
        tools: 'tool',
        soft: 'soft_skill',
    };
    const loadCandidateRef = useRef<(() => Promise<void>) | null>(null);
    const initialPortalLoadFiredRef = useRef(false);

    const mapCategoryToRawType = (category: TagCategory): string => {
        if (category === 'soft_skill') return 'soft_skill';
        if (category === 'tool') return 'tool';
        return category;
    };
    const authHeaders = useCallback(() => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, []);

    const persistCandidateTag = async (tag: TagOption) => {
        if (!candidateId) return;
        try {
            await fetch(`${apiBase}/api/admin/candidate-tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({
                    candidate_id: candidateId,
                    tagKey: tag.nameHe,
                    displayNameHe: tag.nameHe,
                    raw_type: mapCategoryToRawType(tag.category),
                }),
            });
        } catch (err) {
            console.error('Failed to persist tag', err);
        }
    };

    const persistCandidateTagsBatch = async (tags: TagOption[]) => {
        if (!candidateId || !tags.length) return;
        try {
            const payload = tags.map((tag) => ({
                tagKey: getTagLabel(tag),
                displayNameHe: tag.nameHe || getTagLabel(tag),
                displayNameEn: tag.nameEn || tag.nameHe || getTagLabel(tag),
                raw_type: mapCategoryToRawType(tag.category),
            }));
            await fetch(`${apiBase}/api/admin/candidate-tags/bulk-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ candidate_id: candidateId, tags: payload }),
            });
        } catch (err) {
            console.error('Failed to persist tags batch', err);
        }
    };

    const persistTagEntriesToCandidate = async (
        entries: Array<{
            tagKey: string;
            displayNameHe: string;
            displayNameEn?: string;
            raw_type?: string;
            context?: string | null;
            confidence_score?: number;
            calculated_weight?: number;
            final_score?: number;
        }>,
        candidateRecordId: string,
    ) => {
        if (!candidateRecordId || !entries.length) return;
        try {
            await fetch(`${apiBase}/api/admin/candidate-tags/bulk-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ candidate_id: candidateRecordId, tags: entries }),
            });
        } catch (err) {
            console.error('Failed to persist tag entries', err);
            throw err;
        }
    };

    const persistTagNamesToCandidate = async (tagNames: string[], candidateRecordId: string, rawType = 'skill') => {
        if (!candidateRecordId || !tagNames.length) return;
        await persistTagEntriesToCandidate(
            tagNames.map((name) => ({
                tagKey: name,
                displayNameHe: name,
                displayNameEn: name,
                raw_type: rawType,
            })),
            candidateRecordId,
        );
    };

    const collectExistingTagLabels = (data: any) => {
        const labels = new Set<string>();
        ensureArray(data?.tags).forEach((tag: any) => {
            const value = String(typeof tag === 'string' ? tag : tag?.value || tag || '').trim();
            if (value) labels.add(value);
        });
        ensureArray(data?.tagDetails).forEach((detail: any) => {
            [detail.displayNameHe, detail.displayNameEn, detail.tagKey].forEach((key) => {
                if (typeof key === 'string' && key.trim()) labels.add(key.trim());
            });
        });
        return labels;
    };

    const tagDetailLookup = useMemo(() => {
        const map = new Map<string, any>();
        const details = Array.isArray(formData.tagDetails) ? formData.tagDetails : [];
        details.forEach((detail: any) => {
            [detail.tagKey, detail.displayNameHe, detail.displayNameEn].forEach((key) => {
                if (typeof key === 'string' && key.trim()) {
                    map.set(key.trim(), detail);
                }
            });
        });
        return map;
    }, [formData.tagDetails]);

    useEffect(() => {
        let cancelled = false;
        void fetchApprovedTagsCatalog(apiBase || '')
            .then((approvedTags) => {
                if (!cancelled) setApprovedTagsCatalog(Array.isArray(approvedTags) ? approvedTags : []);
            })
            .catch(() => {
                if (!cancelled) setApprovedTagsCatalog([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    const groupedSmartTags = useMemo(
        () =>
            buildCandidateGroupedSmartTags(
                {
                    tags: formData.tags,
                    tagDetails: [...ensureArray(formData.tagDetails), ...localTagDetails],
                    languages: formData.languages,
                    skills: formData.skills,
                    workExperience: formData.workExperience,
                },
                { approvedTags: approvedTagsCatalog },
            ),
        [
            formData.tagDetails,
            formData.tags,
            formData.languages,
            formData.skills,
            formData.workExperience,
            localTagDetails,
            approvedTagsCatalog,
        ],
    );

    const chatContextData = useMemo(
        () => ({
            ...formData,
            tagDetails: [...ensureArray(formData.tagDetails), ...localTagDetails],
        }),
        [formData, localTagDetails],
    );

    const openTagSelectorForRow = (rowId: string) => {
        const category = ROW_CATEGORY_MAP[rowId] || 'role';
        setTagSelectorCategory(category);
        setIsTagSelectorOpen(true);
    };

    const getTagLabel = (tag: TagOption): string => tag.nameHe || tag.nameEn || tag.id || '';

    const deleteCandidateTag = async (candidateTagId?: string) => {
        if (!candidateTagId) return;
        try {
            await fetch(`${apiBase}/api/admin/candidate-tags/${candidateTagId}`, {
                method: 'DELETE',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            });
        } catch (err) {
            console.error('Failed to delete candidate tag', err);
        }
    };

    const handleTagSelectorSave = async (selected: TagOption[]) => {
        if (!selected.length) {
            setIsTagSelectorOpen(false);
            return;
        }
        const existingTags = Array.isArray(formData.tags) ? formData.tags : [];
        const existingSet = new Set(existingTags);
        const newTags = selected
            .map((tag) => getTagLabel(tag))
            .filter((label) => label && !existingSet.has(label));
        if (newTags.length) {
            const merged = Array.from(new Set([...existingTags, ...newTags]));
            const existingDetails = ensureArray(formData.tagDetails);
            const addedDetails = selected
                .filter((tag) => newTags.includes(getTagLabel(tag)))
                .map((tag) => ({
                    id: `local-${Date.now()}-${tag.id || tag.nameHe}`,
                    tagKey: getTagLabel(tag),
                    displayNameHe: tag.nameHe || getTagLabel(tag),
                    displayNameEn: tag.nameEn || tag.nameHe || getTagLabel(tag),
                    rawType: mapCategoryToRawType(tag.category),
                    context: null,
                    isCurrent: true,
                    isInSummary: true,
                    confidenceScore: undefined,
                }));
            handleUpdateProfileData({
                tags: merged,
                tagDetails: [...existingDetails, ...addedDetails],
            });
            setLocalTagDetails((prev) => [...prev, ...addedDetails]);
            await persistCandidateTagsBatch(selected.filter((tag) => newTags.includes(getTagLabel(tag))));
        }
        setIsTagSelectorOpen(false);
        await loadCandidateRef.current?.();
    };

    const handleTagRemove = (label: string) => {
        if (!label) return;
        const existingTags = Array.isArray(formData.tags) ? formData.tags : [];
        const filtered = existingTags.filter((tag: string) => tag !== label);
        if (filtered.length === existingTags.length) return;
        const detail = tagDetailLookup.get(label.trim());
        if (detail?.id) {
            deleteCandidateTag(detail.id);
        }
        handleUpdateProfileData({ tags: filtered });
        setLocalTagDetails((prev) =>
            prev.filter(
                (local) =>
                    (local.displayNameHe || local.tagKey || '').trim() !== label &&
                    (local.displayNameEn || local.tagKey || '').trim() !== label,
            ),
        );
    };

    const toggleSectionExpansion = useCallback((type: SmartTagType) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    }, []);

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [generateSummaryError, setGenerateSummaryError] = useState<string | null>(null);

    // --- Job Search & Favorites State ---
    const [jobSearchTerm, setJobSearchTerm] = useState('');
    const [jobFilters, setJobFilters] = useState({ location: '', type: '', date: '' });
    const [favoriteJobIds, setFavoriteJobIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        setJoinCandidatePool(Boolean(formData.consentToJobOffers));
    }, [formData.consentToJobOffers, formData.id]);

    useEffect(() => {
        setCompletenessBannerDismissed(false);
    }, [candidateId]);

    useEffect(() => {
        if (!formData.consentToJobOffers || !candidateId) {
            setMatchedJobs([]);
            return;
        }
        let cancelled = false;
        setMatchedJobsLoading(true);
        void fetchJobMatches(String(candidateId), { minScore: 70, limit: 100 })
            .then((rows) => {
                if (!cancelled) setMatchedJobs(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (!cancelled) setMatchedJobs([]);
            })
            .finally(() => {
                if (!cancelled) setMatchedJobsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [formData.consentToJobOffers, candidateId]);

    const portalJobs = useMemo(
        () => matchedJobs.map(mapJobMatchToPortalCard),
        [matchedJobs],
    );

    // Toggle Favorite
    const toggleFavoriteJob = (jobId: string) => {
        setFavoriteJobIds(prev => {
            const next = new Set(prev);
            if (next.has(jobId)) next.delete(jobId);
            else next.add(jobId);
            return next;
        });
    };

    // Filtered Jobs Logic
    const filteredJobs = useMemo(() => {
        const term = jobSearchTerm.trim().toLowerCase();
        return portalJobs.filter((job) => {
            if (term) {
                const hay = `${job.title} ${job.company} ${job.location}`.toLowerCase();
                if (!hay.includes(term)) return false;
            }
            if (jobFilters.location && job.location !== jobFilters.location) return false;
            if (jobFilters.type && job.type !== jobFilters.type) return false;
            return true;
        });
    }, [portalJobs, jobSearchTerm, jobFilters]);

    // Favorite Jobs Logic
    const favoriteJobsList = useMemo(
        () => portalJobs.filter((job) => favoriteJobIds.has(job.id)),
        [portalJobs, favoriteJobIds],
    );

    const sanitizePayload = (data: any) => {
        const copy = normalizeCandidateData(data);
        delete copy.id;
        delete copy.createdAt;
        delete copy.updatedAt;
        copy.skills = {
            soft: copy.softSkills,
            technical: copy.techSkills,
        };
        copy.workExperience = Array.isArray(copy.workExperience) ? copy.workExperience : [];

        return copy;
    };

    const decodeJwt = (token: string) => {
        try {
            const parts = token.split('.');
            if (parts.length < 2) return null;
        const segment = parts[1];
        if (!segment) return null;
        const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64 + '==='.slice((base64.length + 3) % 4);
            const json = atob(padded);
            return JSON.parse(json);
        } catch {
            return null;
        }
    };

    const getUser = () => {
        // Prefer stored user object if present
        try {
            const raw = localStorage.getItem('herodata') || localStorage.getItem('herouser') || localStorage.getItem('user');
            if (raw) return JSON.parse(raw);
        } catch {
            // fall through to JWT fallback
        }
        // Fallback: derive from JWT if localStorage user is missing/bad
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) return null;
        const decoded = decodeJwt(token);
        if (!decoded?.sub) return null;
        return { id: decoded.sub, email: decoded.email, role: decoded.role };
    };

    const loadCandidate = async () => {
        setLoadError(null);
        let user = getUser();
        const base = apiBase || '';
        if (!user || (!user.id && !user.userId)) {
            // Try to fetch /auth/me using the token (so refresh works even if user isn't stored)
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const resMe = await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
                    if (resMe.ok) {
                        const me = await resMe.json();
                        user = me;
                        try {
                            localStorage.setItem('herouser', JSON.stringify(me));
                            localStorage.setItem('user', JSON.stringify(me));
                        } catch {}
                    }
                }
            } catch {}
        }
        // apiBase can be empty string (meaning same-origin `/api/...`), that's valid.
        if (!user || (!user.id && !user.userId)) {
            const hasToken = !!localStorage.getItem('token');
            setLoadError(hasToken ? 'לא הצלחנו לזהות משתמש מחובר. נסה להתחבר מחדש.' : 'לא מחובר/ת. התחבר/י כדי לראות את הפרופיל.');
            return;
        }
        const idFromUser = user.userId || user.id;
        setIsSwitching(true);
        try {
            const base = apiBase || '';
            const res = await fetch(`${base}/api/candidates/by-user/${idFromUser}`, {
                headers: { ...authHeaders() },
            });
            let payload: any = null;
            if (res.ok) {
                payload = await res.json();
            if (Array.isArray(payload) && payload.length > 0) {
                const normalizedList = payload.map(normalizeCandidateData);
                const sorted = normalizedList.slice().sort((a, b) => {
                    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
                    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
                    return aTime - bTime;
                });
                const visible = filterVisibleProfiles(sorted);
                const primary = visible[0] || sorted[0];
                if (sorted.length) {
                    const display = primary || sorted[0];
                    setCandidateId(display?.id || null);
                    setProfiles(sorted);
                    setActiveProfileId(display?.id ?? null);
                    setFormData(display || cloneEmptyCandidateForm());
                } else {
                    setProfiles([]);
                    setActiveProfileId(null);
                    setFormData(cloneEmptyCandidateForm());
                    setCandidateId(null);
                }
                return;
            }
                if (!Array.isArray(payload) && payload?.id) {
                    const normalized = normalizeCandidateData(payload);
                if (normalized.isDeleted) {
                    setProfiles([]);
                    return;
                }
                    setCandidateId(normalized.id);
                    setProfiles([normalized]);
                    setActiveProfileId(normalized.id);
                    setFormData(normalized);
                    return;
                }
            }
            if (res.status === 404 || (Array.isArray(payload) && payload.length === 0)) {
                // IMPORTANT: do not send a numeric placeholder id — backend expects UUID.
                const payload = sanitizePayload({
                    ...cloneEmptyCandidateForm(),
                    fullName: user.email?.split('@')[0] || '',
                    email: user.email || '',
                    profileName: '',
                    userId: idFromUser,
                });
                const base = apiBase || '';
                const createRes = await fetch(`${base}/api/candidates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(payload),
                });
                if (createRes.ok) {
                    const created = await createRes.json();
                    setCandidateId(created.id);
                    const normalizedCreated = normalizeCandidateData(created);
                    setProfiles([normalizedCreated]);
                    setActiveProfileId(created.id);
                    setFormData(normalizedCreated);
                } else {
                    const body = await createRes.json().catch(() => ({}));
                    console.error('Candidate create failed', createRes.status, body);
                    setLoadError(body?.message || 'יצירת פרופיל נכשלה.');
                }
            }
        } catch (err) {
            console.error('Failed to load candidate', err);
            setLoadError('טעינת הפרופיל נכשלה. בדוק חיבור לשרת ונסה שוב.');
        } finally {
            setIsSwitching(false);
        }
    };
        loadCandidateRef.current = loadCandidate;

    const ensureCandidateRecord = async (payloadOverride?: any) => {
        // apiBase can be empty string (same-origin)
        if (candidateId) return candidateId;
        try {
            const payload = sanitizePayload(payloadOverride || formData);
            const user = getUser();
            if (user && (user.userId || user.id)) {
                payload.userId = user.userId || user.id;
            }
            if (!payload.fullName) payload.fullName = 'מועמד חדש';
            const base = apiBase || '';
            const res = await fetch(`${base}/api/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg = body?.message || 'Failed to create candidate';
                throw new Error(msg);
            }
            const created = await res.json();
            const normalizedCreated = normalizeCandidateData(created);
            setCandidateId(normalizedCreated.id);
            setProfiles([normalizedCreated]);
            setActiveProfileId(normalizedCreated.id);
            setFormData(normalizedCreated);
            return normalizedCreated.id;
        } catch (err) {
            console.error('Failed to ensure candidate record', err);
            return null;
        }
    };

    // Minimal CRC32 for S3 checksum (browser-side)
    const crc32base64 = async (file: File) => {
        const table = new Uint32Array(256).map((_, n) => {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            return c >>> 0;
        });
        const buf = new Uint8Array(await file.arrayBuffer());
        let crc = 0 ^ -1;
        for (let i = 0; i < buf.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
        }
        crc = (crc ^ -1) >>> 0;
        const bytes = new Uint8Array(4);
        const view = new DataView(bytes.buffer);
        view.setUint32(0, crc);
        // AWS expects base64 big-endian
        return btoa(String.fromCharCode(...bytes));
    };

    const uploadToS3 = async (file: File, type: 'profile' | 'resume' | 'profile-video') => {
        // apiBase can be empty string (same-origin), don't block uploads.
        const id = await ensureCandidateRecord();
        if (!id) return;

        try {
            const uploadMessages: Record<'profile' | 'resume' | 'profile-video', string> = {
                resume: 'מעלה קורות חיים...',
                profile: 'מעלה תמונת פרופיל...',
                'profile-video': 'מעלה וידאו תדמיתי...',
            };
            setUploadState({
                inProgress: true,
                type,
                message: uploadMessages[type],
            });
            const folder =
                type === 'resume'
                    ? 'resumes'
                    : type === 'profile-video'
                        ? 'profile-videos'
                        : 'profile-pictures';
            setUploadState((s) => ({ ...s, message: 'מכין העלאה...' }));
            const base = apiBase || '';
            const presignRes = await fetch(`${base}/api/candidates/${id}/upload-url`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
            });
            if (!presignRes.ok) throw new Error('Failed to get upload URL');
            const { uploadUrl, key } = await presignRes.json();
            const urlObj = new URL(uploadUrl);
            const checksum = urlObj.searchParams.get('x-amz-checksum-crc32');
            const checksumAlgo = urlObj.searchParams.get('x-amz-sdk-checksum-algorithm');
            const headers: Record<string, string> = {};
            if (file.type) headers['Content-Type'] = file.type;
            if (checksum && checksumAlgo === 'CRC32') {
                headers['x-amz-checksum-crc32'] = await crc32base64(file);
                headers['x-amz-sdk-checksum-algorithm'] = 'CRC32';
            }
            setUploadState((s) => ({ ...s, message: 'מעלה קובץ...' }));
            const putRes = await fetch(uploadUrl, {
                method: 'PUT',
                headers: Object.keys(headers).length ? headers : undefined,
                body: file,
            });
            if (!putRes.ok) throw new Error('Upload to S3 failed');

            setUploadState((s) => ({ ...s, message: type === 'resume' ? 'מעבד קורות חיים...' : 'שומר...' }));
            const attachType = type === 'profile-video' ? 'profile-video' : type;
            const attachRes = await fetch(`${base}/api/candidates/${id}/media`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ key, type: attachType, fileName: file.name }),
            });
            if (!attachRes.ok) throw new Error('Failed to attach media');
            const updated = await attachRes.json();
            handleUpdateProfileData(updated);
            setCandidateId(updated.id || id);
        } catch (err) {
            console.error(err);
            alert('העלאה נכשלה, נסה שוב.');
        } finally {
            setUploadState({ inProgress: false });
        }
    };

    const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await uploadToS3(file, 'profile');
            e.target.value = '';
        }
    };

    const handleProfileVideoSave = async (blob: Blob) => {
        const file = new File([blob], `profile-video-${Date.now()}.webm`, {
            type: blob.type || 'video/webm',
        });
        await uploadToS3(file, 'profile-video');
    };

    const handleProfileVideoDelete = async () => {
        const merged = { ...formData, profileVideoUrl: '' };
        const normalized = normalizeCandidateData(merged);
        setFormData(normalized);
        setProfiles((prev) => prev.map((p) => (p.id === activeProfileId ? normalized : p)));
        await persistProfile(normalized);
    };

    const handleResumeSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await uploadToS3(file, 'resume');
            e.target.value = '';
        }
    };


    // Sync formData when profile changes
    useEffect(() => {
        if (!activeProfile) return;
        setFormData(activeProfile);
        setCandidateId(activeProfile.id || null);
    }, [activeProfile]);

    useEffect(() => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setLoadError('לא מחובר/ת. התחבר/י כדי לראות את הפרופיל.');
            navigate('/candidate-portal/login');
            return;
        }
        if (initialPortalLoadFiredRef.current) return;
        initialPortalLoadFiredRef.current = true;
        loadCandidate();
    }, []);

    useEffect(() => {
        const user = getUser();
        startCandidatePortalRecording({
            candidateId: candidateId || formData.id?.toString() || null,
            userId: user?.id ? String(user.id) : null,
            email: user?.email ? String(user.email) : formData.email || null,
        });
        return () => {
            stopCandidatePortalRecording();
        };
    }, [candidateId, formData.id, formData.email]);

    // Handlers
    const handleSwitchProfile = (id: string | number) => {
        if (id === activeProfileId) return;
        setIsSwitching(true);
        setTimeout(() => {
            setActiveProfileId(id);
            setActiveView('profile'); 
            setIsSwitching(false);
        }, 800);
    };

    const moveProfile = useCallback((offset: number) => {
        const idx = currentProfileIndex;
        if (idx === -1) return;
        const target = navigableProfiles[idx + offset];
        if (!target?.id) return;
        handleSwitchProfile(target.id);
    }, [currentProfileIndex, navigableProfiles]);

    const handleAddProfile = async () => {
        const name = prompt("הכנס שם לפרופיל החדש (למשל: 'משרות ניהול'):");
        if (!name?.trim()) return;
        const profileName = name.trim();
        const user = getUser();
        const userId = user?.userId || user?.id;
        if (!userId) {
            alert('צריך להיות מחובר/ת כדי ליצור פרופיל נוסף.');
            return;
        }

        const source = (activeProfile ?? formData) as Record<string, unknown>;
        const shouldDuplicate = profiles.length > 0 || Boolean(source?.id);

        try {
            const base = apiBase || '';
            const payload = shouldDuplicate
                ? sanitizePayload(buildProfileDuplicatePayload(source, profileName, String(userId)))
                : sanitizePayload({
                    ...cloneEmptyCandidateForm(),
                    fullName: profiles[0]?.fullName || formData.fullName || user?.email?.split('@')[0] || 'מועמד חדש',
                    email: formData.email || user?.email || '',
                    profileName,
                    title: profileName,
                    userId,
                });

            const res = await fetch(`${base}/api/candidates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'יצירת פרופיל נכשלה.');
            }
            const created = await res.json();
            const newId = created.id;

            if (shouldDuplicate && newId) {
                const tagEntries = buildTagEntriesFromSource(source);
                if (tagEntries.length) {
                    await persistTagEntriesToCandidate(tagEntries, newId);
                }
            }

            let normalized = normalizeCandidateData(created);
            if (newId) {
                try {
                    const fullRes = await fetch(`${base}/api/candidates/${newId}`, {
                        headers: { ...authHeaders() },
                    });
                    if (fullRes.ok) {
                        normalized = normalizeCandidateData(await fullRes.json());
                    }
                } catch (reloadErr) {
                    console.warn('Created profile reload failed', reloadErr);
                }
            }
            normalized.profileName = profileName;
            normalized.title = profileName;

            setProfiles((prev) => [...prev, normalized]);
            setCandidateId(normalized.id);
            setLocalTagDetails([]);
            setFormData(normalized);
            handleSwitchProfile(normalized.id);
        } catch (err: unknown) {
            console.error('Failed to create profile', err);
            const message = err instanceof Error ? err.message : 'שגיאה ביצירת פרופיל.';
            alert(message);
        }
    };

    const handleDeleteProfile = async (id: string) => {
        if (!id) return;
        if (!window.confirm('האם למחוק את הפרופיל הזה? פעולה זו לא ניתנת לביטול.')) return;
        if (!apiBase) {
            alert('אין חיבור לשרת.');
            return;
        }
        setIsDeletingProfileId(id);
        try {
            const response = await fetch(`${apiBase}/api/candidates/${id}`, {
                method: 'DELETE',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(body || 'המחיקה נכשלה.');
            }
            setProfiles((prev) => {
                const updated = prev.map((p) => (
                    p.id === id ? { ...p, isDeleted: true } : p
                ));
                if (activeProfileId === id) {
                    const remaining = filterVisibleProfiles(updated);
                    const next = remaining[0];
                    if (next) {
                        setActiveProfileId(next.id);
                        setFormData(next);
                        setCandidateId(next.id);
                    } else {
                        setActiveProfileId(null);
                        setFormData(cloneEmptyCandidateForm());
                        setCandidateId(null);
                    }
                }
                return updated;
            });
        } catch (err: any) {
            console.error('Failed to delete profile', err);
            alert(err?.message || 'המחיקה נכשלה.');
        } finally {
            setIsDeletingProfileId(null);
        }
    };



    const handleUpdateProfileData = (newData: any) => {
        const merged = { ...formData, ...newData };
        if (merged.id && !candidateId) {
            setCandidateId(merged.id);
            setActiveProfileId(merged.id);
        }
        const normalized = normalizeCandidateData(merged);
        setFormData(normalized);
        setProfiles(prev => prev.map(p => p.id === activeProfileId ? normalized : p));
        queueSave(normalized);
    };

    const saveNow = async (patch: any, meta?: { suggestions?: any[] }) => {
        const id = await ensureCandidateRecord({ ...formData, ...patch });
        if (!id) return;

        if (Array.isArray(patch.tags)) {
            const existingLabels = collectExistingTagLabels(formData);
            const incomingTags = patch.tags
                .map((tag: any) => (typeof tag === 'string' ? tag : String(tag?.value || tag || '')).trim())
                .filter(Boolean);
            const tagSuggestion = meta?.suggestions?.find((s) => s?.field === 'tags');
            const validatedItems = Array.isArray(tagSuggestion?.validatedItems)
                ? (tagSuggestion.validatedItems as ValidatedSuggestionItem[])
                : [];

            const newEntries = incomingTags
                .filter((name: string) => !existingLabels.has(name))
                .map((name: string) => {
                    const item = validatedItems.find((v) => v.label === name);
                    const metaTag = item?.meta || {};
                    const tagKey = String(metaTag.tagKey || name).trim();
                    const displayNameHe = String(metaTag.displayNameHe || name).trim();
                    const displayNameEn = String(metaTag.displayNameEn || metaTag.displayNameHe || name).trim();
                    return {
                        tagKey,
                        displayNameHe,
                        displayNameEn,
                        raw_type: 'skill',
                    };
                });

            if (newEntries.length) {
                try {
                    await persistTagEntriesToCandidate(newEntries, id);
                } catch (err: any) {
                    setSaveError(err?.message || 'שמירת תגיות נכשלה');
                    alert('שמירת התגיות נכשלה. נסה שוב.');
                    return;
                }
            }

            if (validatedItems.length) {
                const existingDetails = ensureArray(formData.tagDetails);
                const addedDetails = validatedItems
                    .filter((item) => incomingTags.includes(item.label))
                    .map((item) => ({
                        id: `local-${Date.now()}-${item.meta?.tagKey || item.label}`,
                        tagKey: String(item.meta?.tagKey || item.label),
                        displayNameHe: String(item.meta?.displayNameHe || item.label),
                        displayNameEn: String(item.meta?.displayNameEn || ''),
                        rawType: 'skill',
                        isCurrent: true,
                        isInSummary: true,
                    }));
                if (addedDetails.length) {
                    patch.tagDetails = [...existingDetails, ...addedDetails];
                    setLocalTagDetails((prev) => [...prev, ...addedDetails]);
                }
            }
        }

        const merged = { ...formData, ...patch };
        const normalized = normalizeCandidateData(merged);
        setFormData(normalized);
        setProfiles(prev => prev.map(p => p.id === activeProfileId ? normalized : p));
        await persistProfile(normalized);
        await loadCandidateRef.current?.();
    };

    const persistProfile = async (data: any) => {
        // apiBase can be empty string (same-origin)
        const id = await ensureCandidateRecord(data);
        if (!id) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const payload = sanitizePayload(data);
            const base = apiBase || '';
            const res = await fetch(`${base}/api/candidates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('שמירה נכשלה');
            const updated = await res.json();
            const normalizedUpdated = normalizeCandidateData({
                ...updated,
                desiredRoles: updated.desiredRoles ?? data.desiredRoles,
                profileVideoUrl: updated.profileVideoUrl ?? data.profileVideoUrl,
            });
            setFormData(normalizedUpdated);
            setProfiles(prev => prev.map(p => p.id === id ? normalizedUpdated : p));
            setCandidateId(updated.id || id);
        } catch (err: any) {
            setSaveError(err.message || 'שמירה נכשלה');
            console.error('Save profile failed', err);
        } finally {
            setIsSaving(false);
        }
    };

    const queueSave = (data: any) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            persistProfile(data);
        }, 800);
    };

    const handleSelectRole = (selected: SelectedJobField | null) => {
        if (selected) {
            const existing = Array.isArray(formData.desiredRoles) ? formData.desiredRoles : [];
            const alreadyHas = existing.some(
                (r: { value?: string } | string) =>
                    (typeof r === 'string' ? r : r?.value) === selected.role,
            );
            if (!alreadyHas) {
                handleUpdateProfileData({
                    desiredRoles: [...existing, { value: selected.role, owner: 'candidate' }],
                });
            }
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleRemoveRole = (roleValue: string) => {
        const existing = Array.isArray(formData.desiredRoles) ? formData.desiredRoles : [];
        handleUpdateProfileData({
            desiredRoles: existing.filter(
                (r: { value?: string } | string) =>
                    (typeof r === 'string' ? r : r?.value) !== roleValue,
            ),
        });
    };

    const getOrCreateCandidateId = async () => {
        if (candidateId) return candidateId;
        const createdId = await ensureCandidateRecord();
        return createdId;
    };

    const handleApproveProfile = async () => {
        if (formData.approveByCandidate) return;
        await saveNow({ approveByCandidate: true });
    };

    const handleToggleJobOffersConsent = async (checked: boolean) => {
        setJoinCandidatePool(checked);
        let id = candidateId || formData.id;
        if (!id) {
            id = await ensureCandidateRecord({ ...formData, consentToJobOffers: checked });
        }
        if (!id) {
            setJoinCandidatePool(!checked);
            setSaveError('לא ניתן לשמור — חסר מזהה מועמד');
            return;
        }
        setIsSaving(true);
        setSaveError(null);
        try {
            const base = apiBase || '';
            const res = await fetch(`${base}/api/candidates/${encodeURIComponent(String(id))}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ consentToJobOffers: checked }),
            });
            if (!res.ok) throw new Error('שמירת ההצטרפות למאגר נכשלה');
            const updated = await res.json();
            const normalized = normalizeCandidateData({
                ...formData,
                ...updated,
                consentToJobOffers: Boolean(updated.consentToJobOffers ?? checked),
            });
            setFormData(normalized);
            setProfiles((prev) => prev.map((p) => (String(p.id) === String(id) ? normalized : p)));
            setCandidateId(String(id));
        } catch (err: unknown) {
            setJoinCandidatePool(!checked);
            setSaveError(err instanceof Error ? err.message : 'שמירה נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGenerateExperienceSummary = async () => {
        console.log('handleGenerateExperienceSummary (PublicProfile) invoked', {
            candidateId,
            formDataId: formData.id,
            workExperienceSample: formData.workExperience?.[0],
        });
        
        if (isGeneratingSummary) return;

        // Ensure we have a valid backend UUID
        let targetId = candidateId;
        
        // If candidateId is not set, or it looks like a numeric ID (temporary), get/create record
        if (!targetId || !isNaN(Number(targetId))) {
            targetId = await getOrCreateCandidateId();
        }

        if (!targetId) {
            console.warn('generateExperienceSummary skipped: missing candidate ID', { candidateId, formDataId: formData.id });
            setGenerateSummaryError('שמור את הפרופיל לפני הפעלת הכתיבה.');
            return;
        }

        const experienceEntry = Array.isArray(formData.workExperience) && formData.workExperience.length
            ? formData.workExperience[0]
            : null;

        const payload = {
            title: experienceEntry?.title || formData.title || '',
            company: experienceEntry?.company || '',
            companyField: experienceEntry?.companyField || '',
            description: experienceEntry?.description || '',
        };

        if (!payload.title && !payload.company && !payload.companyField) {
            setGenerateSummaryError('הוסף תפקיד או חברה לפני שמפעילים את הכתיבה.');
            return;
        }

        setIsGeneratingSummary(true);
        setGenerateSummaryError(null);
        console.log('generating experience summary', { targetId, payload });

        try {
            const summary = await generateExperienceSummaryForCandidate(targetId, payload);
            if (summary) {
                handleUpdateProfileData({ professionalSummary: summary });
            } else {
                throw new Error('המודל לא החזיר תיאור.');
            }
        } catch (err: any) {
            console.error('generateExperienceSummary failed', err);
            setGenerateSummaryError(err.message || 'שגיאה ביצירת תיאור ניסיון.');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleViewChange = (view: string) => {
        if (view === 'agent') {
            setIsChatOpen(true);
        } else {
            setActiveView(view);
        }
    };
    
    // Task Handlers
    const handleTaskClick = (task: any) => {
        if (task.type === 'screening') {
            setIsScreeningWizardOpen(true);
        }
    };

    const handleScreeningSubmit = (answers: Record<number, any>) => {
        console.log('Submitted Answers:', answers);
        setIsScreeningWizardOpen(false);
        // Remove task from list to simulate completion
        setPendingTasks(prev => prev.slice(1));
    };


    // --- PENDING TASKS SECTION (New) ---

    const getAvailabilityMeta = (availability?: string | null) => {
        switch (availability) {
            case "🟢 מיידי (זמין לעבודה מיד).":
                return { badgeClass: "bg-green-50 text-green-700", display: availability };
            case "🟡 חודש הודעה (עובד, מחפש אקטיבית).":
                return { badgeClass: "bg-yellow-50 text-yellow-700", display: availability };
            case "🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).":
                return { badgeClass: "bg-orange-50 text-orange-700", display: availability };
            case "🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).":
                return { badgeClass: "bg-red-50 text-red-700", display: availability };
            default:
                return null;
        }
    };

    const renderHeader = () => {
        const availabilityMeta = getAvailabilityMeta(formData.availability);
        return (
        <div id="profile-header-card" className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-6 mb-6">
            <div className="flex flex-row items-start gap-4">
                <div className="relative shrink-0">
                        {formData.profilePicture ? (
                            <img src={formData.profilePicture} alt="" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-4 ring-bg-subtle" />
                        ) : (
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full ring-4 ring-bg-subtle bg-bg-subtle flex items-center justify-center text-text-subtle">
                                <UserCircleIcon className="w-12 h-12 sm:w-14 sm:h-14" />
                            </div>
                        )}
                        <button
                            className="absolute bottom-0 left-0 bg-bg-card p-1.5 rounded-full shadow-md border border-border-default hover:bg-bg-hover"
                            onClick={() => avatarInputRef.current?.click()}
                            disabled={uploadState.inProgress}
                            title={uploadState.inProgress ? 'מעלה...' : 'העלה תמונה'}
                        >
                        <ArrowUpTrayIcon className="w-4 h-4 text-text-muted" />
                    </button>
                        {uploadState.inProgress && uploadState.type === 'profile' && (
                            <div className="absolute inset-0 rounded-full bg-white/70 backdrop-blur-sm flex items-center justify-center">
                                <div className="w-6 h-6 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                            </div>
                        )}
                </div>
                <div className="flex-1 min-w-0 text-right w-full">
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
                        <EditableField
                            value={formData.firstName || ''}
                            onSave={(val) => handleUpdateProfileData({ firstName: val })}
                            className="text-2xl sm:text-3xl font-extrabold text-text-default inline-block"
                            placeholder="שם פרטי"
                        />
                        <EditableField
                            value={formData.lastName || ''}
                            onSave={(val) => handleUpdateProfileData({ lastName: val })}
                            className="text-2xl sm:text-3xl font-extrabold text-text-default inline-block"
                            placeholder="שם משפחה"
                        />
                        <CandidateApprovedByCandidateBadge
                            approved={Boolean(formData.consentToJobOffers)}
                            title="הצטרפת למאגר המועמדים והסכמת לקבל הצעות עבודה"
                            className="w-6 h-6 shrink-0 self-center"
                        />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {isSaving && <span className="text-xs text-primary-600 font-semibold">שומר...</span>}
                                {saveError && <span className="text-xs text-red-500 font-semibold">{saveError}</span>}
                                {!formData.approveByCandidate ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleApproveProfile()}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg transition font-medium text-sm shadow-sm border bg-primary-600 text-white border-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" />
                                        <span className="hidden sm:inline">אישור פרופיל</span>
                                    </button>
                                ) : null}
                                <button
                                    onClick={() => setIsResumePreviewOpen(true)}
                                    className="text-text-muted hover:text-primary-600 p-2 rounded-lg hover:bg-bg-subtle transition-colors border border-transparent hover:border-border-default"
                                    title={`הורד קו"ח${activeProfile?.profileName ? ` (${activeProfile.profileName})` : ''}`}
                                    aria-label="הורד קורות חיים"
                                >
                                    <ArrowDownTrayIcon className="w-5 h-5" />
                                </button>
                            </div>
                    </div>

                    <div id="job-availability" className="mb-4 rounded-xl border border-border-default bg-gradient-to-l from-bg-subtle/80 to-white p-3 shadow-sm">
                        <label className="block text-xs font-bold text-text-muted mb-1.5">זמינות למשרה</label>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={formData.availability || ''}
                                disabled={isSaving}
                                onChange={(e) => void saveNow({ availability: e.target.value })}
                                className="flex-1 min-w-[220px] rounded-lg border border-border-default bg-white px-3 py-2.5 text-sm font-semibold text-text-default focus:outline-none focus:ring-2 focus:ring-primary-300"
                            >
                                {AVAILABILITY_OPTIONS.map((opt) => (
                                    <option key={opt.value || 'empty'} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            {availabilityMeta ? (
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${availabilityMeta.badgeClass}`}>
                                    {availabilityMeta.display.split('(')[0]?.trim()}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 mb-3 text-lg text-text-muted">
                        <EditableField 
                            value={formData.title} 
                            onSave={(val) => handleUpdateProfileData({ title: val })}
                                icon={<BriefcaseIcon className="w-5 h-5" />}
                            placeholder="כותרת מקצועית"
                            className="font-medium"
                        />
                        <span className="hidden sm:inline text-text-subtle">•</span>
                        <CityEditableField
                            value={candidateCityDisplay(formData)}
                            onSave={(val) => handleUpdateProfileData(candidateCityPatch(val))}
                            icon={<MapPinIcon className="w-5 h-5" />}
                            placeholder="עיר מגורים"
                            validateOnMount={false}
                        />
                        <span className="hidden sm:inline text-text-subtle">•</span>
                        <EditableField
                            value={formData.age || ''}
                            onSave={(val) => handleUpdateProfileData({ age: val })}
                            placeholder="גיל"
                            className="w-24"
                        />
                    </div>

                    <div className="mb-4">
                        <EditableField 
                            value={formData.professionalSummary} 
                            onSave={(val) => handleUpdateProfileData({ professionalSummary: val })}
                            multiline
                            truncate={true}
                            placeholder="כתוב תקציר מקצועי קצר..."
                            className="text-sm text-text-muted leading-relaxed"
                        />
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex items-center flex-wrap gap-2">
                                <button
                                    onClick={handleGenerateExperienceSummary}
                                    disabled={isGeneratingSummary}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-full border ${
                                        isGeneratingSummary
                                            ? 'border-border-default text-text-muted cursor-not-allowed bg-bg-subtle'
                                            : 'border-primary-500 text-primary-700 hover:bg-primary-50'
                                    } transition`}
                                >
                                    {isGeneratingSummary ? 'מייצר/ת...' : 'כתוב/שכתב ניסיון עם AI'}
                                </button>
                            </div>
                            {generateSummaryError && (
                                <p className="text-xs text-red-500">{generateSummaryError}</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-4">
                        <p className="text-sm font-semibold text-text-muted mb-2 text-right">תפקידים מבוקשים</p>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                            <button
                                type="button"
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-bold rounded-full hover:bg-primary-100 transition-colors"
                            >
                                <PlusIcon className="w-4 h-4" />
                                <span>הוסף תפקיד</span>
                            </button>

                            {(Array.isArray(formData.desiredRoles) ? formData.desiredRoles : []).map(
                                (role: { value?: string } | string, idx: number) => {
                                    const label = typeof role === 'string' ? role : role?.value;
                                    if (!label) return null;
                                    return (
                                        <span
                                            key={`${label}-${idx}`}
                                            className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full text-xs font-medium"
                                        >
                                            {label}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveRole(label)}
                                                className="hover:text-purple-900 rounded-full"
                                                aria-label={`הסר ${label}`}
                                            >
                                                <XMarkIcon className="w-3 h-3" />
                                            </button>
                                        </span>
                                    );
                                },
                            )}
                        </div>
                    </div>

                    <div className="mt-6 border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all bg-white border-border-default">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-full shadow-sm bg-primary-100 text-primary-700">
                                <VideoCameraIcon className="w-6 h-6" />
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-bold text-text-default">
                                    {formData.profileVideoUrl ? 'וידאו תדמיתי הועלה בהצלחה' : 'הוסף וידאו תדמיתי אישי'}
                                </p>
                                <p className="text-xs text-text-muted mt-1 leading-relaxed max-w-sm">
                                    {formData.profileVideoUrl
                                        ? 'זמין לצפייה עבור מגייסים שאליהם הגשת קורות חיים.'
                                        : 'הקליט היכרות קצרה — הוידאו יוצג רק למגייסים אליהם הגשת מועמדות.'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsProfileVideoModalOpen(true)}
                            disabled={uploadState.inProgress && uploadState.type === 'profile-video'}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-colors bg-white text-primary-600 border border-primary-200 hover:bg-primary-50 disabled:opacity-60"
                        >
                            {uploadState.inProgress && uploadState.type === 'profile-video'
                                ? 'מעלה...'
                                : formData.profileVideoUrl
                                    ? 'צפה / ערוך'
                                    : 'הקליט וידאו'}
                        </button>
                    </div>

                     <div className="mt-6 bg-gradient-to-r from-bg-subtle to-white border border-border-default rounded-xl p-4 flex items-center justify-between shadow-sm gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="bg-white p-2 rounded-full shadow-sm text-primary-600 shrink-0">
                                <SparklesIcon className="w-5 h-5" />
                            </div>
                            <div className="text-right min-w-0">
                                <p className="text-sm font-bold text-primary-800 inline-flex items-center gap-1.5 flex-wrap">
                                    הצטרפ/י למאגר המועמדים שלנו
                                    <CandidateApprovedByCandidateBadge
                                        approved={Boolean(formData.consentToJobOffers)}
                                        title="הצטרפת למאגר המועמדים והסכמת לקבל הצעות עבודה"
                                        className="w-4 h-4"
                                    />
                                </p>
                                <p className="text-xs text-text-muted leading-relaxed mt-0.5">
                                    אני רוצה להתחבר להירו ולקבל הצעות עבודה מותאמות אישית ממעסיקים בפלטפורמה, ומוכן/ה לקבל מיילים והצעות עבודה.
                                </p>
                            </div>
                        </div>
                        <label className={`relative inline-flex items-center cursor-pointer shrink-0 ${isSaving ? 'opacity-60 pointer-events-none' : ''}`}>
                            <input
                                type="checkbox"
                                checked={joinCandidatePool}
                                disabled={isSaving}
                                onChange={(e) => void handleToggleJobOffersConsent(e.target.checked)}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
    };
    
    // --- PENDING TASKS SECTION (New) ---
    const renderPendingTasks = () => {
        if (pendingTasks.length === 0) return null;
        
        return (
            <div className="mb-6 animate-fade-in">
                 <h3 className="text-lg font-bold text-text-default mb-3 flex items-center gap-2">
                    <BellIcon className="w-5 h-5 text-red-500" />
                    משימות ממתינות
                </h3>
                <div className="space-y-3">
                    {pendingTasks.map((task) => (
                        <div key={task.id} className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                            <div>
                                <h4 className="font-bold text-red-800 text-sm">שאלון סינון למשרה</h4>
                                <p className="text-xs text-red-600 font-medium">{task.jobTitle}</p>
                            </div>
                            <button 
                                onClick={() => handleTaskClick(task)}
                                className="bg-red-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition flex items-center gap-2"
                            >
                                <VideoCameraIcon className="w-3.5 h-3.5" />
                                התחל שאלון
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const profileCompleteness = useMemo(
        () =>
            computeCandidateProfileCompleteness({
                firstName: formData.firstName,
                lastName: formData.lastName,
                fullName: formData.fullName,
                title: formData.title,
                professionalSummary: formData.professionalSummary,
                phone: formData.phone,
                email: formData.email,
                profilePicture: formData.profilePicture,
                cityDisplay: candidateCityDisplay(formData),
                availability: formData.availability,
                desiredRoles: formData.desiredRoles,
                workExperience: formData.workExperience,
            }),
        [formData],
    );

    const showProfileCompletenessBanner = !completenessBannerDismissed;

    const handleDismissCompletenessBanner = () => {
        setCompletenessBannerDismissed(true);
    };

    const handleCompleteProfileNow = () => {
        if (profileCompleteness.percent >= 100) {
            if (formData.approveByCandidate) {
                handleDismissCompletenessBanner();
                return;
            }
            void handleApproveProfile();
            return;
        }
        const target = profileCompleteness.firstMissing;
        if (target) scrollToProfileCompletenessTarget(target);
    };

    const handleApproveProfileAsIs = async () => {
        setCompletenessBannerDismissed(true);
        if (!formData.approveByCandidate) {
            await handleApproveProfile();
        }
    };

    const scrollToCompletenessField = (fieldId: ProfileCompletenessFieldId) => {
        scrollToProfileCompletenessTarget(fieldId);
    };

    const renderProfileCompletenessBanner = () => {
        if (!showProfileCompletenessBanner) return null;

        const { percent, missing } = profileCompleteness;
        const isComplete = percent >= 100;
        const isApproved = Boolean(formData.approveByCandidate);

        return (
            <div id="profile-completeness-banner" className="animate-fade-in mb-6">
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200 rounded-full blur-3xl opacity-30 transform translate-x-1/2 -translate-y-1/2" />
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                        <div className="flex-1 w-full">
                            <div className="flex justify-between items-end mb-3 gap-3">
                                <h3 className="text-amber-900 font-extrabold text-xl flex items-center gap-2 tracking-tight">
                                    <SparklesIcon className="w-6 h-6 text-amber-500 shrink-0" />
                                    {isComplete
                                        ? (isApproved ? 'הפרופיל שלך מאושר!' : 'הפרופיל שלך מושלם!')
                                        : 'הפרופיל שלך קרוב לשלמות!'}
                                </h3>
                                <span className="text-amber-700 font-black text-lg bg-amber-100 px-3 py-1 rounded-lg shrink-0">
                                    {percent}% מושלם
                                </span>
                            </div>
                            <div className="w-full bg-amber-200/50 rounded-full h-4 mb-4 shadow-inner overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${isComplete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            {!isComplete && missing.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-amber-800">
                                        מה חסר לך כדי להגיע ל-100%?
                                    </span>
                                    {missing.map((fieldId) => (
                                        <button
                                            key={fieldId}
                                            type="button"
                                            onClick={() => scrollToCompletenessField(fieldId)}
                                            className="text-[11px] px-2.5 py-1 bg-white/80 border border-amber-200 text-amber-700 rounded-md font-bold shadow-sm hover:bg-white transition-colors"
                                        >
                                            {PROFILE_COMPLETENESS_LABELS[fieldId]}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm font-semibold text-emerald-800">
                                    {isApproved
                                        ? 'כל השדות החשובים מולאו והפרופיל מאושר.'
                                        : 'כל השדות החשובים מולאו. אפשר לאשר את הפרופיל ולהמשיך.'}
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col gap-3 w-full md:w-auto shrink-0">
                            {isApproved ? (
                                <button
                                    type="button"
                                    onClick={handleDismissCompletenessBanner}
                                    className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg transform hover:scale-105 active:scale-95"
                                >
                                    סגור
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => void handleCompleteProfileNow()}
                                        disabled={isSaving}
                                        className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-black text-sm transition-all shadow-lg transform hover:scale-105 active:scale-95 disabled:opacity-60"
                                    >
                                        {isComplete ? 'אשר פרופיל' : 'השלם פרטים עכשיו'}
                                    </button>
                                    {!isComplete ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleApproveProfileAsIs()}
                                            disabled={isSaving}
                                            className="text-amber-700 hover:text-amber-900 text-xs font-bold underline text-center opacity-70 hover:opacity-100 transition-opacity disabled:opacity-40"
                                        >
                                            אני מעדיף לאשר ככה
                                        </button>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderProfileContent = () => (
         <>
             {renderHeader()}
             {loadError && (
                 <div className="mb-4 bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-center justify-between gap-3">
                     <div className="text-sm font-semibold">{loadError}</div>
                     <button
                         onClick={() => navigate('/candidate-portal/login')}
                         className="bg-red-600 text-white text-xs font-bold py-2 px-3 rounded-lg hover:bg-red-700 transition"
                     >
                         התחברות
                     </button>
                 </div>
             )}
             
             {/* Pending Tasks Area */}
             {renderPendingTasks()}

             {/* CV & Alerts */}
            <AccordionSection title="קורות חיים" icon={<DocumentTextIcon className="w-5 h-5" />} defaultOpen>
                <div className="flex items-center justify-between p-3 bg-bg-subtle rounded-lg">
                    <div className="font-semibold text-text-default">
                        {formData.fullName ? `CV_${formData.fullName.replace(' ', '_')}.pdf` : 'העלה קובץ'}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={`p-2 ${formData.resumeUrl ? 'text-text-muted hover:text-primary-600' : 'text-text-subtle cursor-not-allowed'}`}
                            onClick={() => formData.resumeUrl && setIsCvViewerOpen(true)}
                            disabled={!formData.resumeUrl}
                            title="צפייה בקורות חיים"
                            aria-label="צפייה בקורות חיים"
                        >
                            <EyeIcon className="w-5 h-5" />
                        </button>
                        <button
                            className={`p-2 ${formData.resumeUrl ? 'text-text-muted hover:text-primary-600' : 'text-text-subtle cursor-not-allowed'}`}
                            onClick={() => formData.resumeUrl && window.open(formData.resumeUrl, '_blank')}
                            disabled={!formData.resumeUrl}
                            title="הורד קורות חיים"
                            aria-label="הורד קורות חיים"
                        >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                        </button>
                        <button
                            className={`p-2 ${uploadState.inProgress ? 'text-text-subtle cursor-not-allowed' : 'text-text-muted hover:text-primary-600 cursor-pointer'}`}
                            onClick={() => !uploadState.inProgress && resumeInputRef.current?.click()}
                            disabled={uploadState.inProgress}
                        >
                            <ArrowUpTrayIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {uploadState.inProgress && uploadState.type === 'resume' && (
                    <div className="mt-3 flex items-center gap-3 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-lg p-3">
                        <div className="w-5 h-5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
                        <span>{uploadState.message || 'מעלה קורות חיים...'}</span>
                    </div>
                )}
            </AccordionSection>
            
            <MainContent 
                formData={formData} 
                onFormChange={handleUpdateProfileData}
                onImmediateSave={(patch) => saveNow(patch)}
                viewMode="candidate"
            />
         </>
    );
    
    // Favorites View (REAL DATA from State)
    const renderFavorites = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-text-default">משרות שאהבתי</h2>
                <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-1 rounded-full">{favoriteJobsList.length} משרות</span>
            </div>
            {favoriteJobsList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {favoriteJobsList.map((job) => (
                         <div key={job.id} className="relative">
                             <JobCard 
                                job={job} 
                                onApply={() => alert(`Applying to ${job.title}...`)} 
                                isFavorite={true}
                                toggleFavorite={() => toggleFavoriteJob(job.id)}
                             />
                         </div>
                     ))}
                </div>
            ) : (
                <div className="text-center py-12 flex flex-col items-center text-text-muted">
                    <BookmarkIcon className="w-16 h-16 opacity-30 mb-4" />
                    <p className="text-lg font-medium">עדיין לא סימנת משרות בלב.</p>
                    <button onClick={() => setActiveView('jobs')} className="text-primary-600 font-bold mt-2 hover:underline">
                        עבור למשרות רלוונטיות
                    </button>
                </div>
            )}
        </div>
    );
    
    // Relevant Jobs View (Real Mock Data with Filters)
    const renderJobs = () => (
        <div className="space-y-6">
            {!formData.consentToJobOffers ? (
                <div className="rounded-2xl border border-dashed border-border-default bg-bg-subtle/40 p-8 text-center">
                    <SparklesIcon className="w-12 h-12 mx-auto mb-3 text-primary-400 opacity-80" />
                    <p className="font-bold text-text-default">הפעל/י את מאגר המועמדים בפרופיל</p>
                    <p className="text-sm text-text-muted mt-2 max-w-md mx-auto">
                        כדי לראות משרות רלוונטיות עם התאמה גבוהה, הפעל/י את המתג &quot;הצטרפ/י למאגר המועמדים&quot; בעמוד הפרופיל.
                    </p>
                    <button
                        type="button"
                        onClick={() => setActiveView('profile')}
                        className="mt-4 text-sm font-bold text-primary-600 hover:underline"
                    >
                        חזרה לפרופיל
                    </button>
                </div>
            ) : (
                <>
            <JobSearchFilters 
                searchTerm={jobSearchTerm} 
                setSearchTerm={setJobSearchTerm}
                filters={jobFilters}
                setFilters={setJobFilters}
                onClear={() => {
                    setJobSearchTerm('');
                    setJobFilters({ location: '', type: '', date: '' });
                }}
                resultsCount={filteredJobs.length}
            />

            <h2 className="text-xl font-bold text-text-default mb-4">
                {matchedJobsLoading
                    ? 'טוען משרות מתאימות...'
                    : filteredJobs.length > 0
                        ? 'משרות רלוונטיות עבורך'
                        : 'לא נמצאו משרות מתאימות'}
            </h2>

            {matchedJobsLoading ? (
                <div className="text-center py-12 text-text-muted">מחפש משרות עם התאמה גבוהה...</div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map((job) => (
                    <JobCard 
                        key={job.id} 
                        job={job} 
                        onApply={() => alert(`Applying to ${job.title}...`)}
                        isFavorite={favoriteJobIds.has(job.id)}
                        toggleFavorite={() => toggleFavoriteJob(job.id)}
                    />
                ))}
            </div>
            )}
                </>
            )}
        </div>
    );

    // Offers (Inquiries) View - Placeholder based on user request
    const renderOffers = () => (
        <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
                <h1 className="text-3xl font-black text-text-default tracking-tight">הצעות ממעסיקים</h1>
                <p className="text-text-muted text-lg">מעסיקים שצפו בפרופיל שלך ורוצים ליצור איתך קשר.</p>
            </div>
            <div className="text-center py-16 text-text-muted border border-dashed border-border-default rounded-2xl bg-bg-subtle/30">
                <InboxIcon className="w-14 h-14 mx-auto mb-4 opacity-40" />
                <p className="font-semibold text-text-default">אין הצעות להצגה כרגע</p>
                <p className="text-sm mt-1 max-w-md mx-auto">כשיתקבלו פניות ממעסיקים, הן יופיעו כאן.</p>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen bg-bg-default font-sans text-text-default">
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fadeIn 0.4s ease-out; }
            `}</style>
            <input ref={avatarInputRef} type="file" accept=".pdf,.doc,.docx,.dox,.png,.jpg" className="hidden" onChange={handleAvatarSelected} />
            <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx,.dox,.png,.jpg" className="hidden" onChange={handleResumeSelected} />

            <CandidateSidebar 
                activeView={activeView} 
                onViewChange={handleViewChange}
                activeProfile={activeProfile ?? formData}
                activeProfileId={activeProfileId}
                profiles={userProfiles}
                onSwitchProfile={handleSwitchProfile}
                onAddProfile={handleAddProfile}
                isOpenMobile={isSidebarOpenMobile}
                setIsOpenMobile={setIsSidebarOpenMobile}
                favoriteCount={favoriteJobIds.size}
                pendingTasks={pendingTasks} // Passing tasks to sidebar
                onTaskClick={handleTaskClick} // Passing handler
                pendingTasksCount={pendingTasks.length}
                onDeleteProfile={handleDeleteProfile}
                deletingProfileId={isDeletingProfileId}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <div className="lg:hidden p-4 bg-white border-b border-border-default flex justify-between items-center sticky top-0 z-30">
                    <HiroLogotype className="h-6" />
                    <button onClick={() => setIsSidebarOpenMobile(true)} className="p-2">
                        <ArrowLeftIcon className="w-6 h-6 transform rotate-180" />
                    </button>
                </div>

            <div className="p-4 sm:p-8 pb-24 max-w-5xl mx-auto w-full">
                    {isSwitching ? (
                        <ProfileLoadingSkeleton />
                    ) : (
                        <div className="animate-fade-in">
                    {activeView === 'profile' && renderProfileCompletenessBanner()}
                    <div className="flex justify-center gap-2 mb-3">
                        <button
                            type="button"
                            onClick={() => moveProfile(-1)}
                            disabled={currentProfileIndex <= 0}
                            className="p-2 rounded-full bg-bg-card border border-border-default text-text-muted hover:text-primary-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeftIcon className="w-4 h-4"/>
                        </button>
                        <button
                            type="button"
                            onClick={() => moveProfile(1)}
                            disabled={currentProfileIndex === -1 || currentProfileIndex >= navigableProfiles.length - 1}
                            className="p-2 rounded-full bg-bg-card border border-border-default text-text-muted hover:text-primary-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronRightIcon className="w-4 h-4"/>
                        </button>
                    </div>
                        {activeView === 'profile' && renderProfileContent()}
                        {activeView === 'jobs' && renderJobs()}
                        {activeView === 'favorites' && renderFavorites()}
                        {activeView === 'applications' && (
                            <CandidateApplicationsView candidateId={candidateId || formData.id?.toString()} />
                        )}
                        {activeView === 'offers' && renderOffers()} 
                        </div>
                    )}
                </div>
            </div>

             {/* PDF Preview Modal */}
            <ResumePreviewModal isOpen={isResumePreviewOpen} onClose={() => setIsResumePreviewOpen(false)} data={formData} />
            <CvFilesManagementModal
                isOpen={isCvViewerOpen}
                onClose={() => setIsCvViewerOpen(false)}
                resumeUrl={formData.resumeUrl}
                candidateName={formData.fullName}
            />
            
            {/* Modals for Tags/Roles */}
            <JobFieldSelector
                onChange={handleSelectRole}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
            <CandidateProfileVideoModal
                isOpen={isProfileVideoModalOpen}
                onClose={() => setIsProfileVideoModalOpen(false)}
                existingVideoUrl={formData.profileVideoUrl || ''}
                onSave={handleProfileVideoSave}
                onDelete={handleProfileVideoDelete}
                isSaving={uploadState.inProgress && uploadState.type === 'profile-video'}
            />
            
             <HiroAIChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                chatType="candidate-profile"
                userId={candidateId || formData.id?.toString()}
                systemPrompt={`You are Hiro, an expert AI Career Coach and Recruitment Assistant for "${formData.fullName}".
                **Goal:** Help the candidate create a "winning profile" to maximize their chances of getting hired.
                **Language:** Respond ONLY in Hebrew. Be proactive, encouraging, and professional.

                **Operational Rule (DYNAMIC UPDATES):** When the user asks to change profile data OR you suggest concrete profile improvements (summary text, skills to add, work experience, salary, preferences), you MUST include a JSON array at the end of your response so the user can approve the change via a popup.

                **When NOT to include JSON:** Pure coaching answers with no profile change — e.g. interview tips, mock interview Q&A, salary market overview, career advice, gap explanations, profile strength analysis. Answer thoroughly in Hebrew without JSON unless you also propose a specific profile edit.

                **Query-type guidelines:**
                1. **Profile/CV upgrade** (summary, CV improvement, skills for management roles, English CV translation): Give actionable advice based on the candidate's current profile context. When you draft or recommend specific text/skills/experience, include JSON proposals.
                2. **Interview prep** (common questions, mock interview, questions for interviewer, employment gap): Provide detailed, role-relevant coaching. Run mock interviews interactively when asked. No JSON unless updating profile.
                3. **Job fit & career** (profile strength for a role, salary ranges in Israeli hi-tech, alternative career paths): Analyze using profile context. Salary: give realistic monthly gross ranges in NIS for Israel hi-tech. If asked about open job listings matching their experience, explain this feature is coming soon (בקרוב) — do not invent job listings.
                4. **Quick data updates** (add work experience, update salary expectations, change work preferences): Confirm briefly in Hebrew, then ALWAYS include JSON with exact updates.
                   - workExperience: add ONLY the new entry as {title, company, description, startDate, endDate}. Infer reasonable dates if user gives duration (e.g. "שנה" = ~12 months ending recently).
                   - salaryMin/salaryMax: parse formats like 25K-27K as 25000-27000 NIS monthly gross. Accept adjustments within ±2000 NIS of stated values.
                   - preferences: array of strings e.g. ["היברידי", "מרכז", "משרות במרכז"] for hybrid/location preferences.

                **JSON Format:**
                \`\`\`json
                [
                  { "field": "fieldName", "value": "newValue", "reason": "brief reason in Hebrew" }
                ]
                \`\`\`

                **Supported Fields:**
                - fullName, title, professionalSummary (Hebrew), location (City), age (Number/String), phone, email
                - tags (Array of strings), softSkills (Array), techSkills (Array of objects: {name, level})
                - workExperience (Array of ONLY the new/updated objects: {title, company, description, startDate, endDate}. Do not repeat existing items unless editing them.)
                - education (Array/string describing degrees, certifications)
                - salaryMin, salaryMax, availability, desiredRoles (Array), preferences (Array of strings), interests (Array)
                - candidateNotes (string for CV English translation drafts or notes)

                If info is missing (like summary or age), ask for it and then suggest the update via JSON when appropriate.`}
                contextData={chatContextData}
                onProfileUpdate={(patch, meta) => void saveNow(patch, meta)}
            />

            {/* Screening Wizard Modal */}
            {isScreeningWizardOpen && pendingTasks.length > 0 && (
                <CandidateScreeningWizard 
                    jobTitle={pendingTasks[0].data.jobTitle}
                    questions={pendingTasks[0].data.questions}
                    onClose={() => setIsScreeningWizardOpen(false)}
                    onSubmit={handleScreeningSubmit}
                />
            )}
        </div>
    );
};

export default CandidatePublicProfileView;
