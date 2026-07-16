
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { 
    BriefcaseIcon, UserGroupIcon, Cog6ToothIcon, PlusIcon, ChevronDownIcon, 
    PencilIcon, SparklesIcon, GenderMaleIcon, GenderFemaleIcon, MapPinIcon, TrashIcon, XMarkIcon,
    BellIcon, ShareIcon, CheckCircleIcon, UserIcon, NoSymbolIcon, TagIcon, InformationCircleIcon,
    MagnifyingGlassIcon, BuildingOffice2Icon, GlobeAmericasIcon, ChevronUpIcon, ExclamationTriangleIcon, CheckIcon,
    PhoneIcon, ComputerDesktopIcon, VideoCameraIcon, DocumentTextIcon, AcademicCapIcon, WrenchScrewdriverIcon
} from './Icons';
import { RichTextArea, normalizeValueForEditor } from './RichTextArea';
import { SmartTagType } from './SmartTagTypes';
import TagSelectorModal, { TagOption as GlobalTagOption } from './TagSelectorModal';
import { GoogleGenAI, Type } from '@google/genai';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import LocationSelector, { LocationItem } from './LocationSelector';
import { WorkingHoursInput } from './WorkingHoursInput';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import { logJobSmartImportModalOpen } from '../services/jobsApi';
import { saveJobPublication, patchJobBoardSources } from '../services/publishingApi';
import type { DuplicatePublicationSeed } from '../utils/duplicateJob';
import type { PicklistValueRow } from '../services/picklistValuesApi';
import {
    AVAILABILITY_FALLBACK,
    AVAILABILITY_PICKLIST_KEY,
    DRIVING_LICENSE_FALLBACK,
    DRIVING_LICENSE_PICKLIST_KEY,
    fetchPicklistValuesByKey,
    JOB_SCOPE_MULTI_FALLBACK,
    JOB_SCOPE_PICKLIST_KEY,
    MOBILITY_FALLBACK,
    MOBILITY_PICKLIST_KEY,
    picklistRowLabel,
    sortDrivingLicensePicklistRows,
} from '../services/picklistValuesApi';
import { fetchClientUsageSettings } from '../services/usageSettingsApi';

// --- TYPES ---
type Priority = 'רגילה' | 'דחופה' | 'קריטית';
type TagMode = 'normal' | 'mandatory' | 'negative';
type TagSource = 'global' | 'company' | 'manual';
type PublicationStatus = 'draft' | 'published';
type QuestionType = 'text' | 'yes_no' | 'multiple_choice' | 'video';

interface JobSkill {
    id: string;
    name: string;
    key?: string; // stable tag key used by backend (tagKey)
    mode: TagMode;
    source: TagSource;
    tagType?: SmartTagType; // for same categories/colors as CandidateProfile
    tag_reason?: string;
    /** Exact verbatim substring of the input description that justified this tag (LLM-extracted). */
    quote?: string;
    relevance_score?: number;
    /** Original LLM mode e.g. advantage */
    aiMode?: string;
}

interface QuestionOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

interface Question {
    id: number;
    text: string;
    type: QuestionType; 
    order: number;
    disqualificationReason?: string; // Only relevant if disqualifyIfWrong is true
    
    // Expanded Props for UI
    options?: QuestionOption[];
    isMandatory: boolean;
    disqualifyIfWrong: boolean; // "Killer Question" Toggle
    isExpanded?: boolean; // UI State
    
    // Additional props for digital
    introText?: string; 
    presentationMode?: 'text' | 'video';
    timeLimit?: number; 
    retriesAllowed?: boolean;
}

interface LanguageRequirement {
  id: number;
  language: string;
  level: string;
}

interface RecruitmentSource {
    id: string;
    name: string;
    selected: boolean;
    status: PublicationStatus;
    alertDays: number | null;
}

// --- CONSTANTS ---
const priorityOptions = ['רגילה', 'דחופה', 'קריטית'] as const;

/** Map legacy job form labels to picklist `value` (PicklistCategory.key = job_scope). */
const LEGACY_JOB_SCOPE_TO_PICKLIST_VALUE: Record<string, string> = {
    'משרה מלאה': 'מלאה',
    'משרה חלקית': 'משמרות',
};

function mapPicklistRowsToJobScopeOptions(
    rows: { id: string; label: string; value: string; displayName: string | null }[],
): { id: string; name: string }[] {
    return rows.map((r) => ({
        id: r.value,
        name: picklistRowLabel(r),
    }));
}

function isNeutralDrivingLicenseValue(v: string, rows: PicklistValueRow[]): boolean {
    return !licenseTypeForJobPayload(v, rows);
}

function licenseTypesFromJob(jobData: { licenseTypes?: unknown; licenseType?: unknown }, rows: PicklistValueRow[]): string[] {
    const raw = Array.isArray(jobData.licenseTypes) ? jobData.licenseTypes : [];
    const mapped = raw.map((v) => remapDrivingLicenseFormValue(String(v), rows));
    const kept = mapped.filter((v) => !isNeutralDrivingLicenseValue(v, rows));
    if (kept.length) return kept;
    if (jobData.licenseType) {
        const one = remapDrivingLicenseFormValue(String(jobData.licenseType), rows);
        if (!isNeutralDrivingLicenseValue(one, rows)) return [one];
    }
    return [];
}

function coerceFormAgeFromAi(v: unknown, fallback: number): number {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(70, Math.max(18, Math.round(n)));
}

function availabilityOptionsFromJob(jobData: { availabilityOptions?: unknown; availability?: unknown }): string[] {
    const raw = Array.isArray(jobData.availabilityOptions) ? jobData.availabilityOptions : [];
    const trimmed = raw.map((v) => String(v).trim()).filter(Boolean);
    if (trimmed.length) return trimmed;
    const single = jobData.availability != null ? String(jobData.availability).trim() : '';
    return single ? [single] : [];
}

function licenseTypesForJobPayload(ids: string[], rows: PicklistValueRow[]): string[] {
    return ids.map((v) => licenseTypeForJobPayload(v, rows)).filter((t) => t);
}

function drivingLicenseMultiOptions(rows: PicklistValueRow[]): { id: string; name: string }[] {
    return rows
        .filter((r) => !isNeutralDrivingLicenseValue(r.value, rows))
        .map((r) => ({ id: r.value, name: picklistRowLabel(r) }));
}

function availabilityMultiOptions(rows: PicklistValueRow[]): { id: string; name: string }[] {
    return rows
        .filter((r) => String(r.value ?? '').trim() !== '')
        .map((r) => ({ id: r.value, name: picklistRowLabel(r) }));
}

/** Map form driving-license picklist `value` → persisted `licenseType` (empty = לא נדרש). */
function licenseTypeForJobPayload(formDrivingLicense: string, rows: PicklistValueRow[]): string {
    const v = String(formDrivingLicense ?? '').trim();
    const row = rows.find((r) => r.value === v);
    const lbl = row != null ? picklistRowLabel(row).trim() : '';
    const neutral =
        v === '' ||
        v === 'לא חשוב' ||
        v === '-' ||
        lbl === 'לא חשוב' ||
        lbl === 'ללא' ||
        (row != null &&
            (row.value === 'לא חשוב' ||
                row.value === '-' ||
                picklistRowLabel(row).trim() === 'לא חשוב'));
    if (neutral) return '';
    return row?.value ?? v;
}

/** Picklist row means “no mobility requirement” for `jobs.mobility` boolean. */
function isMobilityNeutralPicklistRow(row: PicklistValueRow | undefined, rawValue: string): boolean {
    const v = String(rawValue ?? '').trim().toLowerCase();
    if (!v) return true;
    const neutralVals = new Set(['לא חשוב', 'לא', '-', 'not_mobile', 'none', 'no', 'לא_נייד']);
    if (neutralVals.has(v)) return true;
    if (!row) return false;
    const rv = String(row.value ?? '').trim().toLowerCase();
    if (neutralVals.has(rv) || rv === 'not_mobile') return true;
    const lbl = picklistRowLabel(row).toLowerCase();
    if (/\bלא\s*נייד\b/.test(lbl) || /\bלא\s*חשוב\b/.test(lbl)) return true;
    return false;
}

/** Map form mobility picklist `value` → persisted boolean `jobs.mobility` (DB is boolean). */
function mobilityBoolForJobPayload(formMobility: string, rows: PicklistValueRow[]): boolean {
    const v = String(formMobility ?? '').trim();
    if (!v) return false;
    if (v === 'חובה' || v === 'כן' || v === 'בעל/ת רכב') return true;
    if (v === 'לא חשוב' || v === 'לא' || v === '-') return false;
    const row = rows.find((r) => r.value === v);
    if (row) {
        if (isMobilityNeutralPicklistRow(row, v)) return false;
        return true;
    }
    return ['כן', 'חובה', 'בעל/ת רכב'].includes(v);
}

/** Map stored `jobs.mobility` boolean → current picklist `value` (supports Hebrew + API picklists). */
function jobMobilityBooleanToFormValue(mobility: unknown, rows: PicklistValueRow[]): string {
    const require = mobility === true;
    if (!rows.length) return require ? 'חובה' : 'לא חשוב';
    const neutral = (r: PicklistValueRow) => isMobilityNeutralPicklistRow(r, r.value);
    const nonNeutral = rows.find((r) => !neutral(r));
    const neutralRow = rows.find((r) => neutral(r));
    if (require) return nonNeutral?.value ?? rows[0]!.value;
    return neutralRow?.value ?? '';
}

function remapDrivingLicenseFormValue(current: string, rows: PicklistValueRow[]): string {
    if (!rows.length) return current;
    const valid = new Set(rows.map((r) => r.value));
    if (valid.has(current)) return current;
    const lt = current === 'לא חשוב' ? '' : current;
    if (!lt.trim()) {
        const na =
            rows.find((r) => r.value === '-' || picklistRowLabel(r) === 'ללא') ||
            rows.find(
                (r) =>
                    r.value === 'לא חשוב' ||
                    picklistRowLabel(r) === 'לא חשוב',
            );
        return na?.value ?? rows[0]!.value;
    }
    const byLabel = rows.find((r) => picklistRowLabel(r) === lt || r.label === lt);
    return byLabel?.value ?? remapDrivingLicenseFormValue('', rows);
}

function remapMobilityFormValue(current: string, rows: PicklistValueRow[]): string {
    if (current === '' || current == null) return '';
    if (!rows.length) return current;
    const valid = new Set(rows.map((r) => r.value));
    if (valid.has(current)) return current;
    const asBool = current === 'חובה';
    const req =
        rows.find((r) => r.value === 'חובה' || picklistRowLabel(r) === 'חובה') ||
        rows.find((r) => r.value === 'כן') ||
        rows.find((r) => r.value === 'בעל/ת רכב');
    const na =
        rows.find((r) => r.value === 'לא חשוב' || picklistRowLabel(r) === 'לא חשוב') ||
        rows.find((r) => r.value === 'לא') ||
        rows.find((r) => r.value === '-');
    if (asBool) return req?.value ?? rows.find((r) => r.value === 'כן')?.value ?? 'חובה';
    return na?.value ?? rows[0]!.value;
}

function normalizeJobTypeToPicklistValues(
    raw: string[],
    options: { id: string }[],
): string[] {
    if (!options.length) return raw.length ? raw : ['מלאה'];
    const valid = new Set(options.map((o) => o.id));
    const mapped = raw.map((v) => {
        if (valid.has(v)) return v;
        const legacy = LEGACY_JOB_SCOPE_TO_PICKLIST_VALUE[v];
        return legacy && valid.has(legacy) ? legacy : v;
    });
    const kept = mapped.filter((v) => valid.has(v));
    if (kept.length > 0) return kept;
    const first = options[0]?.id;
    return first ? [first] : ['מלאה'];
}
const languageLevels = ['שפת אם', 'רמה גבוהה מאוד', 'טוב מאוד', 'בינוני', 'בסיסי'];

const questionTypeOptions: { id: QuestionType; label: string; icon: any }[] = [
    { id: 'text', label: 'טקסט חופשי', icon: DocumentTextIcon },
    { id: 'yes_no', label: 'כן / לא', icon: CheckCircleIcon },
    { id: 'multiple_choice', label: 'רב-ברירה', icon: UserGroupIcon }, 
    { id: 'video', label: 'וידאו', icon: VideoCameraIcon },
];

const mapJobGenderSelection = (gender?: string): ('male' | 'female')[] => {
    if (gender === 'זכר') return ['male'];
    if (gender === 'נקבה') return ['female'];
    return ['male', 'female'];
};

const stripHtml = (html: string): string => {
    if (!html || typeof html !== 'string') return '';
    const div = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (div) {
        div.innerHTML = html;
        return (div.textContent || div.innerText || '').trim();
    }
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/** Embed preferred daily hours in rich-text `internalNotes` (no separate jobs column). */
function extractWorkingHoursFromNotes(notes: string): { cleaned: string; hours: string } {
    let hours = 'גמיש';
    const raw = String(notes || '');
    const m = raw.match(/\[WORKING_HOURS\]\s*([^\n\r<]*)/i);
    if (m?.[1]) {
        const parsed = String(m[1]).trim();
        if (parsed) hours = parsed;
    }
    const cleaned = raw.replace(/\s*\[WORKING_HOURS\][^\n\r]*/gi, '').trim();
    return { cleaned, hours };
}

function mergeWorkingHoursIntoNotes(notes: string, hours: string): string {
    const { cleaned } = extractWorkingHoursFromNotes(notes);
    const flex = !hours || hours === 'גמיש' || hours === 'ללא אילוצי שעות';
    if (flex) return cleaned;
    const suffix = `\n[WORKING_HOURS] ${hours}`;
    return cleaned ? `${cleaned}${suffix}` : suffix.trim();
}

/** Align AI job-analyze output with WorkingHoursInput / persisted internalNotes marker. */
function coercePreferredWorkingHoursFromJobAi(raw: unknown): string | null {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    if (!s || s === '-') return null;
    if (s === 'גמיש' || s === 'ללא אילוצי שעות') return s;
    const lower = s.toLowerCase();
    if (
        /גמישות|שעות גמישות|משמרות גמישות|ללא התחייבות לשעות|עבודה גמישה/i.test(s) ||
        /\bflexible(\s+hours|\s+schedule)?\b/i.test(lower) ||
        /\bvariable\s+hours\b/i.test(lower)
    ) {
        return 'גמיש';
    }
    const m = s.match(/(\d{1,2})\s*:\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*:\s*(\d{2})/);
    if (m) {
        const hh = (x: string) => String(Math.min(23, parseInt(x, 10))).padStart(2, '0');
        const mm = (x: string) => String(Math.min(59, parseInt(x, 10))).padStart(2, '0');
        return `${hh(m[1])}:${mm(m[2])}-${hh(m[3])}:${mm(m[4])}`;
    }
    return s.slice(0, 255);
}

function pickPreferredWorkingHoursFromExtracted(extracted: Record<string, unknown>): unknown {
    const keys = [
        'preferredWorkingHours',
        'workingHours',
        'workHours',
        'dailyHours',
        'dailyWorkingHours',
        'jobWorkingHours',
        'shiftHours',
        'scheduleHours',
    ];
    for (const k of keys) {
        const v = extracted[k];
        if (v != null && String(v).trim() !== '') return v;
    }
    return null;
}

const LOCATION_SEP = ', ';

const deriveLocationsFromJob = (jobData: any): LocationItem[] => {
    if (Array.isArray(jobData?.locations) && jobData.locations.length) {
        return jobData.locations.map((loc: LocationItem) => ({ ...loc }));
    }
    const locationStr = String(jobData?.location || jobData?.city || '').trim();
    if (!locationStr) return [];
    if (locationStr.includes(LOCATION_SEP)) {
        return locationStr.split(LOCATION_SEP).map((value: string) => ({ type: 'city' as const, value: value.trim() })).filter((loc: LocationItem) => loc.value);
    }
    return [{ type: 'city', value: locationStr }];
};

const disqualificationReasons = [
    "ניסיון",
    "שכר",
    "השכלה / הכשרה",
    "זמינות / שעות עבודה",
    "מיקום / ניידות",
    "התאמה לתפקיד / ארגונית",
    "יציבות תעסוקתית",
    "חוסר תגובה",
    "סיבה אישית של המועמד",
    "אחר"
];

// 1. GLOBAL SYSTEM TAGS
const systemTagsList = [
    { id: 'sys_1', name: 'ניהול', synonyms: ['מנהל', 'ראש צוות', 'VP', 'Director'] },
    { id: 'sys_2', name: 'מכירות', synonyms: ['Sales', 'SDR', 'Account Manager', 'מכירה'] },
    { id: 'sys_3', name: 'שיווק', synonyms: ['Marketing', 'Marcom', 'PPC', 'SEO'] },
    { id: 'sys_4', name: 'React', synonyms: ['ReactJS', 'React.js', 'Frontend'] },
    { id: 'sys_5', name: 'Node.js', synonyms: ['NodeJS', 'Backend', 'Express'] },
    { id: 'sys_6', name: 'Fullstack', synonyms: ['Full Stack', 'Web Developer'] },
];

// 2. COMPANY TAGS
const companyTagsList = [
    { id: 'comp_1', name: 'בוגר טכניון', synonyms: ['Technion', 'מכון טכנולוגי'] },
    { id: 'comp_2', name: 'יוצא 8200', synonyms: ['יחידה 8200', 'מודיעין'] },
    { id: 'comp_3', name: 'Cultural Fit', synonyms: ['התאמה תרבותית'] },
    { id: 'comp_4', name: 'זמינות מיידית', synonyms: ['מיידי', 'מתחיל מחר'] },
];

/** Job distribution: אנשי קשר (ClientContact) + משתמשי פורטל (User) של הלקוח הנבחר */
type JobDistributionOption = {
    key: string;
    kind: 'contact' | 'user';
    id: string;
    name: string;
    subtitle: string;
    email?: string;
};

function jobDistributionKey(kind: 'contact' | 'user', id: string): string {
    return `${kind}:${id}`;
}

/** Extract persisted job.contacts (kind + id) before distribution list is loaded. */
function jobContactsToKeys(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const keys: string[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const kind = o.kind === 'user' ? 'user' : o.kind === 'contact' ? 'contact' : null;
        const id = o.id != null ? String(o.id).trim() : '';
        if (kind && id) keys.push(jobDistributionKey(kind, id));
    }
    return keys.length > 0 ? keys : null;
}

const mockInternalRecruiters = [
  
];

const mockAccountManagers = [
    { id: 'm1', name: 'ישראל ישראלי' },
    { id: 'm2', name: 'שרית בן חיים' },
    { id: 'm3', name: 'גילעד בן חיים' },
];

// Recruitment sources are loaded dynamically per-client from the API (active only).
// See the useEffect that reacts to resolvedClientId inside NewJobView.
const availableSources: RecruitmentSource[] = [];

// --- COMPONENTS ---

// ... (Other components: SectionCard, TechnicalIdentifiers, PriorityToggle, SourceRow, MultiSelect, DoubleRangeSlider, SmartTag remain unchanged)

const SectionCard: React.FC<{ id: string; title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }> = ({ id, title, icon, children, className = '' }) => (
    <div id={id} className={`bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-visible scroll-mt-52 ${className}`}>
        <div className="p-4 border-b border-border-default bg-bg-subtle/30 flex items-center gap-2 rounded-t-2xl">
            <div className="text-primary-500">{icon}</div>
            <h3 className="font-bold text-lg text-text-default">{title}</h3>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

const JobScreeningEligibilityCard: React.FC<{
    validityDays: number;
    reScreeningCooldownMonths: number;
    requireOriginalCv: boolean;
    onValidityDaysChange: (n: number) => void;
    onReScreeningCooldownMonthsChange: (n: number) => void;
    onRequireOriginalCvChange: (v: boolean) => void;
    orgDefaults?: { validityDays: number; cooldownMonths: number; requireOriginalCv: boolean } | null;
}> = ({
    validityDays,
    reScreeningCooldownMonths,
    requireOriginalCv,
    onValidityDaysChange,
    onReScreeningCooldownMonthsChange,
    onRequireOriginalCvChange,
    orgDefaults,
}) => {
    const { t } = useLanguage();
    const tooltipPanel =
        'absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-max max-w-[260px] p-3 bg-bg-card text-text-default text-xs rounded-xl pointer-events-none z-[100] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-border-default flex flex-col items-center gap-1.5 origin-center text-center opacity-0 scale-95 invisible transition-all duration-200 group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:scale-100';

    const parseBoundedInt = (raw: string, min: number, max: number, fallback: number) => {
        if (raw === '') return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, Math.round(n)));
    };

    return (
        <div className="mt-0 grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
            {orgDefaults && (
                <p className="md:col-span-2 text-xs text-text-muted leading-relaxed">
                    {t('new_job.org_defaults_hint', {
                        days: orgDefaults.validityDays,
                        months: orgDefaults.cooldownMonths,
                        cv: orgDefaults.requireOriginalCv
                            ? t('new_job.org_defaults_cv_required')
                            : t('new_job.org_defaults_cv_optional'),
                    })}
                </p>
            )}
            <div className="space-y-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <label className="block text-xs font-semibold text-text-default">{t('new_job.screening_validity_days')}</label>
                        <div className="group/tooltip relative inline-flex">
                            <InformationCircleIcon className="w-4 h-4 text-primary-500 cursor-help shrink-0" aria-hidden />
                            <div className={tooltipPanel} role="tooltip">
                                <div className="font-medium whitespace-pre-wrap text-text-default leading-relaxed">
                                    {t('new_job.screening_validity_days_tooltip')}
                                </div>
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-b border-r border-border-default rotate-45" />
                            </div>
                        </div>
                    </div>
                    <input
                        min={0}
                        max={20000}
                        type="number"
                        value={validityDays}
                        onChange={(e) => onValidityDaysChange(parseBoundedInt(e.target.value, 0, 20000, validityDays))}
                        className="w-full sm:w-32 bg-white border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500"
                    />
                </div>
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <label className="block text-xs font-semibold text-text-default">{t('new_job.screening_cooldown_months')}</label>
                        <div className="group/tooltip relative inline-flex">
                            <InformationCircleIcon className="w-4 h-4 text-primary-500 cursor-help shrink-0" aria-hidden />
                            <div className={tooltipPanel} role="tooltip">
                                <div className="font-medium whitespace-pre-wrap text-text-default leading-relaxed">
                                    {t('new_job.screening_cooldown_tooltip')}
                                </div>
                                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-b border-r border-border-default rotate-45" />
                            </div>
                        </div>
                    </div>
                    <input
                        min={0}
                        max={9999}
                        type="number"
                        value={reScreeningCooldownMonths}
                        onChange={(e) =>
                            onReScreeningCooldownMonthsChange(parseBoundedInt(e.target.value, 0, 9999, reScreeningCooldownMonths))
                        }
                        className="w-full sm:w-32 bg-white border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500"
                    />
                </div>
            </div>
            <div className="space-y-4 flex flex-col justify-center">
                <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={requireOriginalCv}
                        onChange={(e) => onRequireOriginalCvChange(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 transition-colors"
                    />
                    <div>
                        <span className="text-sm font-semibold text-text-default group-hover:text-primary-700 transition">
                            {t('new_job.screening_require_cv_title')}
                        </span>
                        <p className="text-xs text-text-muted mt-0.5">{t('new_job.screening_require_cv_hint')}</p>
                    </div>
                </label>
            </div>
        </div>
    );
};

const TechnicalIdentifiers: React.FC<{
    jobId: string;
    postingCode: string;
    creationDate: string;
    uniqueEmail: string;
    onPostingCodeChange: (value: string) => void;
    validityDays: number;
    reScreeningCooldownMonths: number;
    requireOriginalCv: boolean;
    onValidityDaysChange: (n: number) => void;
    onReScreeningCooldownMonthsChange: (n: number) => void;
    onRequireOriginalCvChange: (v: boolean) => void;
    orgScreeningDefaults?: { validityDays: number; cooldownMonths: number; requireOriginalCv: boolean } | null;
}> = ({
    jobId,
    postingCode,
    creationDate,
    uniqueEmail,
    onPostingCodeChange,
    validityDays,
    reScreeningCooldownMonths,
    requireOriginalCv,
    onValidityDaysChange,
    onReScreeningCooldownMonthsChange,
    onRequireOriginalCvChange,
    orgScreeningDefaults,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { t } = useLanguage();

    return (
        <div className="mt-6 pt-4 border-t border-border-default">
            <button 
                type="button" 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors w-full justify-end sm:justify-start"
            >
                {t('new_job.toggle_tech_ids')}
                {isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="mt-4 space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('new_job.unique_email')}</label>
                            <input 
                                type="text" 
                                value={uniqueEmail} 
                                readOnly 
                                className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('new_job.posting_code')}</label>
                            <input 
                                type="text" 
                                value={postingCode} 
                                onChange={(e) => onPostingCodeChange(e.target.value)}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 text-center transition"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">{t('new_job.job_id')}</label>
                                <input 
                                    type="text" 
                                    value={jobId} 
                                    disabled 
                                    className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed text-center" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">{t('new_job.creation_date')}</label>
                                <input 
                                    type="text" 
                                    value={creationDate} 
                                    disabled 
                                    className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed text-center" 
                                />
                            </div>
                        </div>
                    </div>
                    <JobScreeningEligibilityCard
                        validityDays={validityDays}
                        reScreeningCooldownMonths={reScreeningCooldownMonths}
                        requireOriginalCv={requireOriginalCv}
                        onValidityDaysChange={onValidityDaysChange}
                        onReScreeningCooldownMonthsChange={onReScreeningCooldownMonthsChange}
                        onRequireOriginalCvChange={onRequireOriginalCvChange}
                        orgDefaults={orgScreeningDefaults}
                    />
                </div>
            )}
        </div>
    );
};

const PriorityToggle: React.FC<{
    value: Priority;
    onChange: (value: Priority) => void;
}> = ({ value, onChange }) => {
    const { t } = useLanguage();
    const selectedIndex = priorityOptions.indexOf(value);

    return (
        <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.priority')}</label>
            <div className="relative flex w-full p-1 bg-bg-subtle rounded-lg">
                <div 
                    className="absolute top-1 bottom-1 bg-bg-card rounded-md shadow-sm transition-transform duration-300 ease-in-out"
                    style={{
                        width: 'calc(100% / 3)',
                        transform: `translateX(-${selectedIndex * 100}%)`,
                    }}
                ></div>
                {priorityOptions.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onChange(option); }}
                        className={`relative z-10 flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors duration-200 ${
                            value === option ? 'text-primary-700' : 'text-text-muted hover:text-text-default'
                        }`}
                    >
                        {t(`priority.${option}`)}
                    </button>
                ))}
            </div>
        </div>
    );
};

// ... (SourceRow, MultiSelect, DoubleRangeSlider, SmartTag omitted for brevity, assumed unchanged)

const SourceRow: React.FC<{
    source: RecruitmentSource;
    onToggleSelect: () => void;
    onStatusChange: (newStatus: PublicationStatus) => void;
    onAlertChange: (days: number | null) => void;
}> = ({ source, onToggleSelect, onStatusChange, onAlertChange }) => {
    // ... (Implementation unchanged)
    const [isAlertPopoverOpen, setIsAlertPopoverOpen] = useState(false);
    const [daysInput, setDaysInput] = useState<number>(source.alertDays || 3);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsAlertPopoverOpen(false);
            }
        };
        if (isAlertPopoverOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAlertPopoverOpen]);

    const handleBellClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsAlertPopoverOpen(!isAlertPopoverOpen);
    };

    const handleEnableAlert = () => {
        onAlertChange(daysInput);
        setIsAlertPopoverOpen(false);
    };

    const handleDisableAlert = () => {
        onAlertChange(null);
        setIsAlertPopoverOpen(false);
    };

    const toggleStatus = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextStatus = source.status === 'draft' ? 'published' : 'draft';
        onStatusChange(nextStatus);
    };

    return (
        <div className="flex items-center justify-between p-3 border-b border-border-subtle last:border-0 hover:bg-bg-hover transition-colors rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer flex-grow">
                <input 
                    type="checkbox" 
                    checked={source.selected} 
                    onChange={onToggleSelect}
                    className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 transition-all"
                />
                <span className={`text-sm font-medium ${source.selected ? 'text-text-default' : 'text-text-muted'}`}>{source.name}</span>
            </label>
            
            <div className="flex items-center gap-3">
                {source.selected && (
                    <button 
                        onClick={toggleStatus}
                        className={`text-xs font-bold px-3 py-1 rounded-full border transition-all duration-200 ${
                            source.status === 'published' 
                                ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' 
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                        title={source.status === 'published' ? 'לחץ להעברה לטיוטה' : 'לחץ לפרסום'}
                    >
                        {source.status === 'published' ? 'פורסם' : 'טיוטה'}
                    </button>
                )}

                {source.selected && (
                    <div className="relative">
                        <button 
                            type="button"
                            onClick={handleBellClick}
                            className={`p-1.5 rounded-full transition-colors relative ${
                                source.alertDays !== null 
                                    ? 'text-primary-600 bg-primary-50 ring-1 ring-primary-200' 
                                    : 'text-text-subtle hover:text-text-default hover:bg-bg-subtle'
                            }`}
                            title={source.alertDays !== null ? `התראה ${source.alertDays} ימים לפני סיום` : 'הגדר התראת סיום'}
                        >
                            <BellIcon className="w-4 h-4" />
                            {source.alertDays !== null && (
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500"></span>
                                </span>
                            )}
                        </button>

                        {isAlertPopoverOpen && (
                            <div 
                                ref={popoverRef}
                                className="absolute top-full left-0 mt-2 w-64 bg-bg-card border border-border-default rounded-lg shadow-xl z-50 p-4 animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="absolute -top-2 left-3 w-4 h-4 bg-bg-card border-t border-l border-border-default transform rotate-45"></div>
                                <h4 className="text-sm font-bold text-text-default mb-3">התראת סיום פרסום</h4>
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-text-muted mb-1">התראה לפני (ימים):</label>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="30" 
                                            value={daysInput} 
                                            onChange={(e) => setDaysInput(Number(e.target.value))}
                                            className="w-full bg-bg-input border border-border-default rounded px-2 py-1 text-sm focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </div>
                                    
                                    <div className="flex gap-2 pt-1">
                                        <button 
                                            onClick={handleEnableAlert}
                                            className="flex-1 bg-primary-600 text-white text-xs font-bold py-1.5 rounded hover:bg-primary-700 transition"
                                        >
                                            עדכן
                                        </button>
                                        {source.alertDays !== null && (
                                            <button 
                                                onClick={handleDisableAlert}
                                                className="flex-1 bg-bg-subtle text-text-muted text-xs font-bold py-1.5 rounded hover:text-red-500 transition border border-transparent hover:border-border-default"
                                            >
                                                בטל
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const MultiSelect: React.FC<{
    label: string;
    options: { id: string; name: string }[];
    selectedIds: string[];
    onChange: (selectedIds: string[]) => void;
    placeholder?: string;
}> = ({ label, options, selectedIds, onChange, placeholder = 'בחר...' }) => {
    // ... (Implementation unchanged)
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(item => item !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const removeTag = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onChange(selectedIds.filter(item => item !== id));
    };

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
            <div 
                className="w-full bg-bg-input border border-border-default rounded-lg p-2 min-h-[42px] cursor-pointer flex flex-wrap gap-2 items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedIds.length === 0 && <span className="text-sm text-text-subtle px-1">{placeholder}</span>}
                {selectedIds.map(id => {
                    const option = options.find(o => o.id === id);
                    if (!option) return null;
                    return (
                        <span key={id} className="bg-primary-50 text-primary-700 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 border border-primary-100">
                            {option.name}
                            <button onClick={(e) => removeTag(e, id)} className="hover:text-primary-900 rounded-full p-0.5">
                                <XMarkIcon className="w-3 h-3" />
                            </button>
                        </span>
                    );
                })}
                 <div className="flex-grow flex justify-end">
                     <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                 </div>
            </div>
            
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {options.map(option => (
                        <div 
                            key={option.id} 
                            onClick={() => toggleOption(option.id)}
                            className="px-3 py-2 hover:bg-bg-hover cursor-pointer flex items-center gap-2 text-sm"
                        >
                            <input 
                                type="checkbox" 
                                checked={selectedIds.includes(option.id)} 
                                onChange={() => {}} 
                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                            />
                            <span className={selectedIds.includes(option.id) ? 'font-semibold text-primary-700' : 'text-text-default'}>
                                {option.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const DoubleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    valueMin: number;
    valueMax: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    nameMin: string;
    nameMax: string;
    unit?: string;
    className?: string;
    includeUnknown?: boolean;
    onIncludeUnknownChange?: (checked: boolean) => void;
    unknownLabel?: string;
    highlight?: boolean;
    colorVar?: string;
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', className = '', includeUnknown, onIncludeUnknownChange, unknownLabel, highlight, colorVar = '--color-primary-500' }) => {
    // ... (Implementation unchanged)
    const minVal = Math.min(Number(valueMin), Number(valueMax));
    const maxVal = Math.max(Number(valueMin), Number(valueMax));
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
        <div className={`${className} ${highlight ? 'p-2 -m-2 rounded-lg bg-purple-50/50 border border-purple-100' : ''} max-w-[260px] mx-auto`}>
             <div className="flex flex-col items-center mb-6">
                <label className="text-sm font-semibold text-text-muted flex items-center gap-2 mb-2">
                    {label}
                    {highlight && <SparklesIcon className="w-3 h-3 text-purple-500 animate-pulse" />}
                </label>
                
                <div className="flex items-center gap-1.5 bg-bg-card border border-border-default shadow-sm px-3 py-1 rounded-full text-sm font-extrabold z-10 tabular-nums" dir="ltr">
                    <input
                        type="number" min={min} max={max} step={step} value={minVal} name={nameMin}
                        onChange={onChange}
                        className="w-20 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    <span className="text-text-subtle text-xs font-normal">-</span>
                    <input
                        type="number" min={min} max={max} step={step} value={maxVal} name={nameMax}
                        onChange={onChange}
                        className="w-20 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    {unit && <span className="text-[10px] text-text-muted font-bold ml-0.5">{unit}</span>}
                </div>
            </div>

            <div className="relative h-8 flex items-center mb-2" dir="ltr">
                <div className="absolute w-full h-1.5 bg-bg-subtle rounded-full overflow-hidden">
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
                    type="range" min={min} max={max} step={step} value={minVal} name={nameMin} onChange={onChange}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
                <input
                    type="range" min={min} max={max} step={step} value={maxVal} name={nameMax} onChange={onChange}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
            </div>
             <div className="flex justify-between mt-1 w-full" dir="ltr">
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
                 <label className="flex items-center gap-2 cursor-pointer mt-3 justify-center">
                    <input 
                        type="checkbox" 
                        checked={includeUnknown} 
                        onChange={(e) => onIncludeUnknownChange(e.target.checked)} 
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-xs text-text-subtle">{unknownLabel}</span>
                </label>
            )}
        </div>
    );
};

// Same categories/colors as CandidateProfile - border + text only, no background fill
const SMART_TAG_TYPE_STYLES: Record<SmartTagType, string> = {
    role: "bg-transparent text-primary-600 border-primary-400 font-bold",
    seniority: "bg-transparent text-primary-600 border-primary-300 font-bold",
    skill: "bg-transparent text-sky-700 border-sky-200 font-semibold",
    tool: "bg-transparent text-gray-700 border-gray-300 font-semibold",
    soft: "bg-transparent text-slate-600 border-slate-200 italic font-medium",
    industry: "bg-transparent text-emerald-700 border-emerald-200 font-bold",
    certification: "bg-transparent text-orange-700 border-orange-200 font-bold",
    language: "bg-transparent text-pink-600 border-pink-200 font-medium",
    degree: "bg-transparent text-orange-700 border-orange-200 font-bold",
    education: "bg-transparent text-orange-700 border-orange-200 font-bold",
};

const SMART_TAG_TYPE_LABELS: Record<SmartTagType, string> = {
    role: "תפקיד",
    seniority: "בכירות",
    skill: "מיומנות",
    tool: "כלי עבודה",
    soft: "כישורים רכים",
    industry: "תעשייה",
    certification: "השכלה/הסמכה",
    language: "שפה",
    degree: "השכלה/הסמכה",
    education: "השכלה/הסמכה",
};

// Same category rows as CandidateProfile (TagRowGroup)
const JOB_TAG_ROW_CONFIG: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; iconColor: string; types: SmartTagType[] }> = [
    { id: 'roles', label: 'תפקיד והקשר', icon: BriefcaseIcon, iconColor: 'text-purple-500', types: ['role', 'seniority', 'industry'] },
    { id: 'qualifications', label: 'השכלה ושפות', icon: AcademicCapIcon, iconColor: 'text-orange-500', types: ['certification', 'language'] },
    { id: 'tools', label: 'כלים ומיומנויות', icon: WrenchScrewdriverIcon, iconColor: 'text-blue-600', types: ['skill', 'tool'] },
    { id: 'soft', label: 'כישורים רכים', icon: SparklesIcon, iconColor: 'text-amber-500', types: ['soft'] },
];

const mapLlmModeToTagMode = (m: unknown): TagMode => {
    const s = String(m || '').toLowerCase();
    if (s === 'mandatory' || s === 'required') return 'mandatory';
    if (s === 'negative' || s === 'exclusion') return 'negative';
    return 'normal';
};

const SmartTag: React.FC<{ 
    tag: JobSkill; 
    onToggle: (id: string) => void; 
    onRemove: (id: string) => void; 
}> = ({ tag, onToggle, onRemove }) => {
    const type = tag.tagType ?? 'skill';
    const styleByType = SMART_TAG_TYPE_STYLES[type];
    const titleText = SMART_TAG_TYPE_LABELS[type];

    const modeBorderClass =
        tag.mode === 'mandatory'
            ? 'border-green-500'
            : tag.mode === 'negative'
                ? 'border-red-500'
                : '';

    type TooltipLine =
        | { kind: 'header'; text: string }
        | { kind: 'meta'; text: string }
        | { kind: 'quote'; text: string };

    const tooltipLines: TooltipLine[] = [
        { kind: 'header' as const, text: titleText },
        tag.aiMode ? { kind: 'meta' as const, text: `מצב מקור: ${tag.aiMode}` } : null,
        tag.relevance_score != null && tag.relevance_score !== undefined
            ? { kind: 'meta' as const, text: `ציון רלוונטיות: ${tag.relevance_score}/10` }
            : null,
        tag.tag_reason ? { kind: 'meta' as const, text: `נימוק: ${tag.tag_reason}` } : null,
        tag.quote ? { kind: 'quote' as const, text: tag.quote } : null,
        tag.source ? { kind: 'meta' as const, text: `מקור: ${tag.source}` } : null,
    ].filter((l): l is TooltipLine => Boolean(l));

    const ariaLabel = tooltipLines
        .map((l) => (l.kind === 'quote' ? `ציטוט מהתיאור: "${l.text}"` : l.text))
        .join('. ');

    return (
        <div className="relative inline-flex group">
            <div
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all cursor-pointer select-none border whitespace-nowrap hover:shadow-md ${styleByType} ${modeBorderClass}`}
                onClick={() => onToggle(tag.id)}
                title={tooltipLines.length ? undefined : `${titleText} - לחץ לשינוי מצב`}
                aria-label={tooltipLines.length ? ariaLabel : undefined}
            >
                <span>{tag.name}</span>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
                    className="ml-1 p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
                >
                    <XMarkIcon className="w-3 h-3" />
                </button>
            </div>
            {tooltipLines.length > 0 && (
                <div
                    className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-2 w-max max-w-sm -translate-x-1/2 rounded-lg border border-border-default bg-bg-card px-3 py-2 text-[11px] text-text-default shadow-lg opacity-0 transition-opacity group-hover:opacity-100"
                    dir="rtl"
                >
                    {tooltipLines.map((line, i) => {
                        if (line.kind === 'header') {
                            return (
                                <p key={i} className="font-bold text-text-muted">
                                    {line.text}
                                </p>
                            );
                        }
                        if (line.kind === 'quote') {
                            return (
                                <div
                                    key={i}
                                    className="mt-2 border-r-2 border-primary-400 bg-primary-50/60 px-2 py-1 rounded-sm text-[11px] leading-snug text-text-default"
                                >
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-primary-600 mb-0.5">
                                        ציטוט מהתיאור
                                    </p>
                                    <p className="italic whitespace-pre-wrap break-words">
                                        &ldquo;{line.text}&rdquo;
                                    </p>
                                </div>
                            );
                        }
                        return (
                            <p key={i} className="mt-1 leading-snug">
                                {line.text}
                            </p>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


const EditQuestionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    question: Question;
    onSave: (updatedQ: Question) => void;
}> = ({ isOpen, onClose, question, onSave }) => {
    const [text, setText] = useState(question.text);
    const [reason, setReason] = useState(question.disqualificationReason || 'ללא סיבה');

    useEffect(() => {
        setText(question.text);
        setReason(question.disqualificationReason || 'ללא סיבה');
    }, [question]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-border-default" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold">עריכת שאלה</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">שאלה</label>
                    <input 
                        type="text" 
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500" 
                    />
                </div>
                 {/* Only show rejection reason for Digital (Killer) questions logic context if needed, but for generic Question struct let's allow it */}
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">סיבת פסילה (אם רלוונטי)</label>
                    <select 
                        value={reason} 
                        onChange={e => setReason(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500"
                    >
                         {disqualificationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border-default">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                    <button 
                        type="button" 
                        onClick={() => onSave({ ...question, text: text, disqualificationReason: reason })} 
                        className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all"
                    >
                        שמור שינויים
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- NEW COMPONENT FOR MANUAL SCREENING LIST ---
// Simplified Manual Edit Modal
const EditManualQuestionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (text: string, isKiller: boolean, reason?: string) => void;
    question?: Question | null;
}> = ({ isOpen, onClose, onSave, question }) => {
    const [text, setText] = useState('');
    const [isKiller, setIsKiller] = useState(false);
    const [reason, setReason] = useState('ניסיון'); // Default reason

    useEffect(() => {
        if (question) {
            setText(question.text);
            setIsKiller(question.disqualifyIfWrong);
            setReason(question.disqualificationReason || 'ניסיון');
        } else {
            setText('');
            setIsKiller(false);
            setReason('ניסיון');
        }
    }, [question, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!text.trim()) return;
        onSave(text, isKiller, isKiller ? reason : undefined);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 border border-border-default animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center pb-2 border-b border-border-default">
                    <h3 className="text-lg font-bold text-text-default">{question ? 'עריכת שאלה' : 'הוספת שאלה לתסריט'}</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default">
                        <XMarkIcon className="w-5 h-5"/>
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-1.5">תוכן השאלה</label>
                        <input 
                            type="text" 
                            value={text} 
                            onChange={e => setText(e.target.value)} 
                            placeholder="לדוגמה: מה ציפיות השכר שלך?"
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none" 
                            autoFocus
                        />
                    </div>

                    <div className="bg-red-50/50 p-4 rounded-xl border border-red-100 space-y-3">
                         <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <div className="relative">
                                <input 
                                    type="checkbox" 
                                    checked={isKiller} 
                                    onChange={(e) => setIsKiller(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                            </div>
                            <span className={`text-sm font-bold ${isKiller ? 'text-red-700' : 'text-text-muted'}`}>פסילה אוטומטית (Killer Question)</span>
                        </label>
                        
                        {isKiller && (
                             <div className="animate-fade-in pl-2">
                                <label className="block text-xs font-semibold text-red-800 mb-1">סיבת פסילה (חובה לבחירה)</label>
                                <select 
                                    value={reason} 
                                    onChange={e => setReason(e.target.value)} 
                                    className="w-full bg-white border border-red-200 text-red-900 text-sm rounded-lg p-2.5 focus:ring-red-500 focus:border-red-500"
                                >
                                     {disqualificationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <p className="text-[10px] text-red-600/80 mt-1">
                                    * במידה והתשובה בשיחה לא תהיה מספקת, המועמד ייפסל על סעיף זה.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                    <button 
                        type="button" 
                        onClick={handleSave} 
                        disabled={!text.trim()}
                        className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {question ? 'שמור שינויים' : 'הוסף שאלה'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ... (JOB QUESTION CARD FOR DIGITAL - High Fidelity - Kept as is)
const JobQuestionCard: React.FC<{
    question: Question;
    index: number;
    onUpdate: (id: number, field: keyof Question, value: any) => void;
    onRemove: (id: number) => void;
    onToggleExpand: (id: number) => void;
    isExpanded: boolean;
    onMove: (id: number, direction: 'up'|'down') => void;
    isFirst: boolean;
    isLast: boolean;
}> = ({ question, index, onUpdate, onRemove, onToggleExpand, isExpanded, onMove, isFirst, isLast }) => {

    const handleOptionTextChange = (optId: string, text: string) => {
        const newOptions = question.options?.map(o => o.id === optId ? { ...o, text } : o);
        onUpdate(question.id, 'options', newOptions);
    };

    const toggleCorrectOption = (optId: string) => {
        const newOptions = question.options?.map(o => o.id === optId ? { ...o, isCorrect: !o.isCorrect } : o);
         onUpdate(question.id, 'options', newOptions);
    };

    const addOption = () => {
        const newOption: QuestionOption = { id: Date.now().toString(), text: '', isCorrect: false };
        onUpdate(question.id, 'options', [...(question.options || []), newOption]);
    };

    const removeOption = (optId: string) => {
        const newOptions = question.options?.filter(o => o.id !== optId);
        onUpdate(question.id, 'options', newOptions);
    };

    return (
        <div className={`bg-bg-card border transition-all duration-300 rounded-2xl shadow-sm group ${isExpanded ? 'border-primary-300 ring-2 ring-primary-50' : 'border-border-default hover:border-primary-200'}`}>
            {/* Card Header */}
            <div 
                className="flex items-center gap-4 p-4 cursor-pointer select-none"
                onClick={() => onToggleExpand(question.id)}
            >
                <div className="flex flex-col gap-1 items-center" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => onMove(question.id, 'up')} 
                        disabled={isFirst}
                        className="text-text-subtle hover:text-primary-600 disabled:opacity-20 p-0.5"
                    >
                        <ChevronUpIcon className="w-3.5 h-3.5"/>
                    </button>
                    <div className="w-6 h-6 rounded-full bg-bg-subtle flex items-center justify-center text-xs font-bold text-text-muted">
                        {index + 1}
                    </div>
                     <button 
                        onClick={() => onMove(question.id, 'down')} 
                        disabled={isLast}
                        className="text-text-subtle hover:text-primary-600 disabled:opacity-20 p-0.5"
                    >
                        <ChevronDownIcon className="w-3.5 h-3.5"/>
                    </button>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        {question.type === 'video' && <span title="וידאו"><VideoCameraIcon className="w-3.5 h-3.5 text-red-500" /></span>}
                        {question.type === 'multiple_choice' && <span title="רב-ברירה"><UserGroupIcon className="w-3.5 h-3.5 text-blue-500" /></span>}
                        {question.type === 'yes_no' && <span title="כן/לא"><CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /></span>}
                        {(!question.type || question.type === 'text') && <span title="טקסט"><DocumentTextIcon className="w-3.5 h-3.5 text-gray-500" /></span>}
                        
                        <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                            {questionTypeOptions.find(t => t.id === question.type)?.label}
                        </span>
                        {question.isMandatory && <span className="text-[10px] bg-red-50 text-red-700 px-1.5 rounded font-bold border border-red-100">חובה</span>}
                        {question.disqualifyIfWrong && <span className="text-[10px] bg-gray-800 text-white px-1.5 rounded font-bold flex items-center gap-1"><NoSymbolIcon className="w-3 h-3"/> שאלה פוסלת</span>}
                    </div>
                    <div className="font-semibold text-text-default truncate text-sm">
                        {question.text || <span className="text-text-subtle italic">ללא כותרת...</span>}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onRemove(question.id); }} className="p-2 text-text-subtle hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                        <TrashIcon className="w-4 h-4"/>
                    </button>
                    <div className={`transform transition-transform duration-200 text-text-muted ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDownIcon className="w-5 h-5"/>
                    </div>
                </div>
            </div>

            {/* Card Body (Expanded) */}
            {isExpanded && (
                <div className="p-5 pt-0 border-t border-border-subtle/50 mt-2 animate-fade-in">
                    <div className="space-y-5 pt-4">
                        
                        {/* Question Text Input */}
                         <div>
                            <input 
                                type="text" 
                                value={question.text} 
                                onChange={(e) => onUpdate(question.id, 'text', e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-medium"
                                placeholder="מה תרצה לשאול?"
                                autoFocus
                            />
                        </div>

                         {/* Type Selector */}
                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">סוג שאלה</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {questionTypeOptions.map(typeOpt => (
                                    <button
                                        key={typeOpt.id}
                                        type="button"
                                        onClick={() => onUpdate(question.id, 'type', typeOpt.id)}
                                        className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-semibold transition-all ${
                                            question.type === typeOpt.id 
                                            ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' 
                                            : 'bg-bg-subtle border-transparent text-text-muted hover:bg-bg-hover'
                                        }`}
                                    >
                                        <typeOpt.icon className="w-4 h-4" />
                                        {typeOpt.label}
                                    </button>
                                ))}
                            </div>
                         </div>


                        {/* OPTIONS LOGIC (Multiple Choice) */}
                        {(question.type === 'multiple_choice' || question.type === 'yes_no') && (
                            <div className="bg-bg-subtle/30 p-3 rounded-xl border border-border-subtle/60">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold text-text-muted uppercase">אפשרויות תשובה</label>
                                    <div className="text-[10px] text-text-subtle bg-blue-50 px-2 py-0.5 rounded text-blue-700 font-medium">
                                        סמן <CheckCircleIcon className="w-3 h-3 inline text-green-500 mx-0.5"/> לתשובה נכונה (עבור סינון אוטומטי)
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {question.options?.map((opt, optIdx) => (
                                        <div key={opt.id} className={`flex items-center gap-2 group/opt p-2 rounded-lg border transition-colors ${opt.isCorrect ? 'bg-green-50/50 border-green-200' : 'bg-white border-border-default'}`}>
                                            <button 
                                                type="button"
                                                onClick={() => toggleCorrectOption(opt.id)}
                                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center border transition-all ${opt.isCorrect ? 'bg-green-500 border-green-500 text-white' : 'bg-gray-100 border-gray-300 text-gray-400 hover:border-green-400 hover:text-green-400'}`}
                                                title={opt.isCorrect ? "זו התשובה הנכונה" : "סמן כתשובה נכונה"}
                                            >
                                                <CheckIcon className="w-3.5 h-3.5" />
                                            </button>

                                            <input 
                                                type="text" 
                                                value={opt.text} 
                                                onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                                                className="flex-1 bg-transparent border-none px-2 py-1 text-sm focus:ring-0 placeholder:text-text-subtle/50"
                                                placeholder={`אפשרות ${optIdx + 1}`}
                                                readOnly={question.type === 'yes_no'} // Yes/No usually fixed text
                                            />
                                            
                                            {question.type !== 'yes_no' && (
                                                <button 
                                                    type="button"
                                                    onClick={() => removeOption(opt.id)} 
                                                    className="p-1.5 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover/opt:opacity-100 transition-opacity"
                                                >
                                                    <XMarkIcon className="w-3.5 h-3.5"/>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {question.type !== 'yes_no' && (
                                        <button 
                                            type="button"
                                            onClick={addOption}
                                            className="flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors mt-2"
                                        >
                                            <PlusIcon className="w-3 h-3"/> הוסף אפשרות
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {/* VIDEO SETTINGS */}
                        {question.type === 'video' && (
                            <div className="bg-bg-subtle/30 p-3 rounded-xl border border-border-subtle/60 flex items-center gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">מגבלת זמן (שניות)</label>
                                    <input 
                                        type="number" 
                                        value={question.timeLimit || 60} 
                                        onChange={(e) => onUpdate(question.id, 'timeLimit', parseInt(e.target.value))}
                                        className="w-20 bg-white border border-border-default rounded-lg p-2 text-sm text-center font-bold"
                                    />
                                </div>
                                <div className="h-8 w-px bg-border-subtle"></div>
                                <label className="flex items-center gap-2 cursor-pointer mt-4">
                                    <input 
                                        type="checkbox" 
                                        checked={question.retriesAllowed} 
                                        onChange={(e) => onUpdate(question.id, 'retriesAllowed', e.target.checked)}
                                        className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 border-border-default"
                                    />
                                    <span className="text-xs font-medium text-text-default">אפשר הקלטה מחדש</span>
                                </label>
                            </div>
                        )}

                        {/* Footer Settings: Mandatory & Killer */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-border-subtle">
                             <label className="flex items-center gap-2 cursor-pointer bg-bg-subtle px-3 py-1.5 rounded-lg hover:bg-bg-hover transition-colors w-fit">
                                <input 
                                    type="checkbox" 
                                    checked={question.isMandatory} 
                                    onChange={(e) => onUpdate(question.id, 'isMandatory', e.target.checked)}
                                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm font-semibold text-text-default">שאלת חובה</span>
                            </label>

                            <div className="flex flex-col gap-2">
                                <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg transition-all border ${question.disqualifyIfWrong ? 'bg-red-50 border-red-200' : 'bg-transparent border-transparent hover:bg-bg-subtle'}`}>
                                    <div className="relative">
                                        <input 
                                            type="checkbox" 
                                            checked={question.disqualifyIfWrong} 
                                            onChange={(e) => onUpdate(question.id, 'disqualifyIfWrong', e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600"></div>
                                    </div>
                                    <span className={`text-sm font-bold ${question.disqualifyIfWrong ? 'text-red-700' : 'text-text-muted'}`}>פסילה אוטומטית (Killer Question)</span>
                                </label>

                                {/* CONDITIONAL REASON SELECTOR */}
                                {question.disqualifyIfWrong && (
                                    <div className="animate-fade-in mr-11">
                                        <select 
                                            value={question.disqualificationReason || ''}
                                            onChange={(e) => onUpdate(question.id, 'disqualificationReason', e.target.value)}
                                            className="w-full sm:w-48 bg-white border border-red-200 text-red-800 text-xs rounded-lg p-2 focus:ring-red-500 focus:border-red-500 font-medium"
                                        >
                                            <option value="" disabled>בחר סיבת פסילה...</option>
                                            {disqualificationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/** When תחום/תפקיד come from AI or an existing job row, keep a SelectedJobField so the control is filled. */
const jobFieldFromCategoryRole = (category: string, role: string, fieldType = ''): SelectedJobField | null => {
    const c = String(category ?? '').trim();
    const r = String(role ?? '').trim();
    const ft = String(fieldType ?? '').trim();
    if (!c || !r) return null;
    return { category: c, fieldType: ft, role: r };
};

/** Prefer structured taxonomy path from analyze API (vector + closed-list LLM). */
const jobFieldFromAnalyzeTaxonomy = (raw: Record<string, unknown>): SelectedJobField | null => {
    const jf = raw?.jobField;
    if (jf && typeof jf === 'object' && !Array.isArray(jf)) {
        const o = jf as Record<string, unknown>;
        const category = String(o.category ?? '').trim();
        const role = String(o.role ?? '').trim();
        const fieldType = String(o.fieldType ?? o.cluster ?? '').trim();
        if (category && role) {
            return {
                category,
                fieldType,
                role,
                categoryId: o.categoryId != null ? String(o.categoryId) : undefined,
                clusterId: o.clusterId != null ? String(o.clusterId) : undefined,
                roleId: o.roleId != null ? String(o.roleId) : undefined,
            };
        }
    }
    const field = raw?.field != null ? String(raw.field).trim() : '';
    const role = raw?.role != null ? String(raw.role).trim() : '';
    return jobFieldFromCategoryRole(field, role);
};

const formatJobFieldLabel = (jobField: SelectedJobField | null | undefined): string => {
    if (!jobField?.category?.trim()) return '';
    const parts = [jobField.category.trim()];
    if (jobField.fieldType?.trim()) parts.push(jobField.fieldType.trim());
    if (jobField.role?.trim() && jobField.role.trim() !== jobField.fieldType?.trim()) {
        parts.push(jobField.role.trim());
    }
    return parts.join(' > ');
};

const isJobFieldComplete = (jobField: SelectedJobField | null | undefined): boolean =>
    Boolean(jobField?.category?.trim() && jobField?.role?.trim());

/** DB ENUM + UI label: פעילה in the form maps to פתוחה in the API (see Job model). */
const jobStatusApiToForm = (status: string | undefined | null): string => {
    const s = String(status ?? '').trim();
    if (s === 'פתוחה') return 'פעילה';
    if (s === 'טיוטה' || s === 'מוקפאת' || s === 'מאוישת') return s;
    return 'טיוטה';
};

const jobStatusFormToApi = (status: string | undefined | null): string => {
    const s = String(status ?? '').trim();
    if (s === 'פעילה') return 'פתוחה';
    if (s === 'טיוטה' || s === 'מוקפאת' || s === 'מאוישת' || s === 'פתוחה') return s;
    return 'טיוטה';
};

const sections = [
    { id: 'general-info', titleKey: 'new_job.section_general', icon: <BriefcaseIcon className="w-5 h-5"/> },
    { id: 'description-content', titleKey: 'new_job.section_description', icon: <PencilIcon className="w-5 h-5"/> },
    { id: 'conditions-reqs', titleKey: 'new_job.section_requirements', icon: <UserGroupIcon className="w-5 h-5"/> },
    { id: 'distribution', titleKey: 'new_job.section_distribution', icon: <ShareIcon className="w-5 h-5"/> },
    { id: 'screening', titleKey: 'new_job.section_screening', icon: <Cog6ToothIcon className="w-5 h-5"/> },
];

// --- MAIN COMPONENT ---
interface NewJobViewProps {
  onCancel: () => void;
  onSave: (jobData: any) => void;
  isEditing?: boolean;
  jobData?: any;
  isEmbedded?: boolean;
}

const defaultPostingCode = String(Math.floor(1 + Math.random() * 999999));
const defaultJobId = defaultPostingCode;
const defaultUniqueEmail = `humand+${defaultPostingCode}@app.hiro.co.il`;

const initialJobState = {
    clientName: '',
    /** AI / free-text תחום (when job field selector empty) */
    aiField: '',
    /** AI / free-text תפקיד (when job field selector empty) */
    aiRole: '',
    publicJobTitle: '',
    publicDescription: '',
    regionLabel: '',
    clientTypeLabel: 'כללי',
    openPositions: 1,
    rating: 0,
    jobId: defaultJobId, 
    postingCode: defaultPostingCode, 
    uniqueEmail: defaultUniqueEmail,
    creationDate: new Date().toLocaleDateString('he-IL'),
    /** ISO string for PUT payload; null = use "now" on create */
    openDateIso: null as string | null,
    status: 'טיוטה', 
    priority: 'רגילה' as Priority, 
    healthProfile: 'standard',
    availabilityOptions: [] as string[],
    jobType: ['מלאה'], 
    jobField: null as SelectedJobField | null,
    contacts: [] as string[],
    jobTitle: '', 
    jobDescription: '', 
    internalNotes: '', 
    requirements: '',
    maritalStatus: 'לא חשוב', 
    mobility: '', 
    drivingLicenses: [] as string[],
    gender: ['male', 'female'], 
    ageMin: 20, 
    ageMax: 65, 
    includeUnknownAge: true,
    salaryMin: 8000, 
    salaryMax: 15000, 
    includeUnknownSalary: true,
    preferredWorkingHours: 'גמיש',
    recruitmentSources: availableSources,
    languages: [] as LanguageRequirement[],
    skills: [] as JobSkill[], 
    locations: [] as LocationItem[], 
    
    // Updated Screening State
    enableDigitalScreening: true,
    enableManualScreening: true,
    digitalQuestions: [] as Question[], // Knockout / Auto
    telephoneQuestions: [] as Question[], // Human / Script
    
    assignedRecruiters: [] as string[],
    assignedAccountManagers: [] as string[],
    selectedTemplate: '',
    validityDays: 60,
    reScreeningCooldownMonths: 3,
    requireOriginalCv: false,
};

const NewJobView: React.FC<NewJobViewProps> = ({ onCancel, onSave, isEditing = false, jobData, isEmbedded = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { jobId } = useParams<{ jobId: string }>();
    const { t } = useLanguage();
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const isTenantUser = Boolean(user?.clientId) && !isPlatformAdmin;
    const apiBase = import.meta.env.VITE_API_BASE || '';

    // Capture duplicate navigation state once (Strict Mode / replace must not wipe the seed mid-hydrate).
    const duplicateBootstrapRef = useRef<{
        job?: Record<string, unknown>;
        publication?: DuplicatePublicationSeed | null;
        consumed: boolean;
    } | null>(null);
    if (duplicateBootstrapRef.current === null && !isEditing) {
        const navState = (location.state || {}) as {
            duplicateJob?: Record<string, unknown>;
            duplicatePublication?: DuplicatePublicationSeed | null;
        };
        duplicateBootstrapRef.current = {
            job: navState.duplicateJob,
            publication: navState.duplicatePublication || null,
            consumed: false,
        };
    }
    const duplicateJobSeed = !isEditing ? duplicateBootstrapRef.current?.job : undefined;
    const isDuplicating = Boolean(duplicateJobSeed);
    const duplicatePublicationRef = useRef<DuplicatePublicationSeed | null>(
        duplicateBootstrapRef.current?.publication || null,
    );

    const [formData, setFormData] = useState(initialJobState);
    const [jobScopeOptions, setJobScopeOptions] = useState<{ id: string; name: string }[]>(() =>
        mapPicklistRowsToJobScopeOptions(JOB_SCOPE_MULTI_FALLBACK),
    );
    const [drivingLicensePicklist, setDrivingLicensePicklist] = useState<PicklistValueRow[]>(() =>
        sortDrivingLicensePicklistRows(DRIVING_LICENSE_FALLBACK),
    );
    const [mobilityPicklist, setMobilityPicklist] = useState<PicklistValueRow[]>(MOBILITY_FALLBACK);
    const [availabilityPicklist, setAvailabilityPicklist] = useState<PicklistValueRow[]>(AVAILABILITY_FALLBACK);
    const [activeSection, setActiveSection] = useState('general-info');
    const [isClientConfirmed, setIsClientConfirmed] = useState(false);
    const [activeClients, setActiveClients] = useState<Array<{ id: string; label: string }>>([]);
    const [activeClientsLoading, setActiveClientsLoading] = useState(false);
    
    const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
    const [showParseSummary, setShowParseSummary] = useState(false);
    const [parseSummaryData, setParseSummaryData] = useState<{ filled: string[], missing: string[] }>({ filled: [], missing: [] });

    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [pastedJobText, setPastedJobText] = useState('');
    const aiPasteAnalyzeUsedRef = useRef(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [parseSuccess, setParseSuccess] = useState(false);
  const [isTagSelectorOpen, setIsTagSelectorOpen] = useState(false);
    
    const [newLanguageName, setNewLanguageName] = useState('');
    const [newLanguageLevel, setNewLanguageLevel] = useState('טובה מאוד');

    const [newSkillText, setNewSkillText] = useState('');
    const [suggestions, setSuggestions] = useState<{global: typeof systemTagsList, company: typeof companyTagsList}>({ global: [], company: [] });
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const skillInputRef = useRef<HTMLInputElement>(null);

    // Manual Question Edit State
    const [manualEditState, setManualEditState] = useState<{isOpen: boolean, question: Question | null}>({ isOpen: false, question: null });
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [jobFieldError, setJobFieldError] = useState(false);
    const [publishingSourcesLoading, setPublishingSourcesLoading] = useState(false);

    const navRef = useRef<HTMLDivElement>(null);
    const formDataRef = useRef(formData);
    formDataRef.current = formData;
    const drivingLicensePicklistRef = useRef<PicklistValueRow[]>(
        sortDrivingLicensePicklistRows(DRIVING_LICENSE_FALLBACK),
    );
    const mobilityPicklistRef = useRef<PicklistValueRow[]>(MOBILITY_FALLBACK);
    drivingLicensePicklistRef.current = drivingLicensePicklist;
    mobilityPicklistRef.current = mobilityPicklist;
    const [distributionPeople, setDistributionPeople] = useState<JobDistributionOption[]>([]);
    const [distributionLoading, setDistributionLoading] = useState(false);
    const [distributionFetchError, setDistributionFetchError] = useState<string | null>(null);
    const [orgScreeningDefaults, setOrgScreeningDefaults] = useState<{
        validityDays: number;
        cooldownMonths: number;
        requireOriginalCv: boolean;
    } | null>(null);
    const distributionPeopleRef = useRef<JobDistributionOption[]>([]);
    distributionPeopleRef.current = distributionPeople;

    useEffect(() => {
        if (isJobFieldComplete(formData.jobField)) setJobFieldError(false);
    }, [formData.jobField]);

    useEffect(() => {
        const sourceJob = (isEditing ? jobData : duplicateJobSeed) as any;
        if (!sourceJob) return;
        if (!isEditing && duplicateBootstrapRef.current?.consumed) return;
        if (!isEditing && duplicateBootstrapRef.current) {
            duplicateBootstrapRef.current.consumed = true;
        }
             const candidateLocations = deriveLocationsFromJob(sourceJob);
             const contactsFromJob = jobContactsToKeys(sourceJob.contacts);
            const hydratedSkills: JobSkill[] = Array.isArray(sourceJob.skills)
                ? sourceJob.skills.map((s: any, i: number) => ({
                      id: String(s.id ?? `loaded-${i}`),
                      name: String(s.name ?? ''),
                      key: s.key,
                      mode: ['mandatory', 'negative', 'normal'].includes(s.mode)
                          ? (s.mode as TagMode)
                          : mapLlmModeToTagMode(s.mode),
                      source: (s.source as TagSource) || 'manual',
                      tagType: (() => {
                          const t = String(s.tagType || 'skill');
                          if (t === 'soft_skill') return 'soft';
                          if (t === 'degree' || t === 'education') return 'certification';
                          return t;
                      })() as SmartTagType | undefined,
                      tag_reason: typeof s.tag_reason === 'string' ? s.tag_reason : undefined,
                      quote: typeof s.quote === 'string' && s.quote.trim() ? s.quote : undefined,
                      relevance_score:
                          typeof s.relevance_score === 'number'
                              ? s.relevance_score
                              : s.relevance_score != null
                                ? Number(s.relevance_score)
                                : undefined,
                      aiMode: s.aiMode != null ? String(s.aiMode) : s.mode != null ? String(s.mode) : undefined,
                  }))
                : [];

            const loadedField = sourceJob.field != null ? String(sourceJob.field).trim() : '';
            const loadedRole = sourceJob.role != null ? String(sourceJob.role).trim() : '';
            const loadedJobField = jobFieldFromCategoryRole(loadedField, loadedRole);
            const freshPostingCode = String(Math.floor(1 + Math.random() * 999999));

            setFormData(prev => ({
                ...prev,
                clientName: sourceJob.client || prev.clientName,
                aiField: loadedField || prev.aiField,
                aiRole: loadedRole || prev.aiRole,
                jobField: loadedJobField ?? prev.jobField,
                publicJobTitle: sourceJob.publicJobTitle || prev.publicJobTitle,
                publicDescription: sourceJob.PublicDescription
                    ? normalizeValueForEditor(String(sourceJob.PublicDescription))
                    : sourceJob.publicDescription
                      ? normalizeValueForEditor(String(sourceJob.publicDescription))
                      : prev.publicDescription,
                regionLabel: sourceJob.region || prev.regionLabel,
                clientTypeLabel: sourceJob.clientType || prev.clientTypeLabel,
                openPositions: typeof sourceJob.openPositions === 'number' ? sourceJob.openPositions : prev.openPositions,
                rating: typeof sourceJob.rating === 'number' ? sourceJob.rating : prev.rating,
                jobTitle: sourceJob.title || prev.jobTitle,
                jobDescription: sourceJob.description || prev.jobDescription,
                requirements: Array.isArray(sourceJob.requirements)
                    ? sourceJob.requirements.map((r: string) => String(r).trim()).join('\n')
                    : sourceJob.requirements ?? prev.requirements,
                ...((() => {
                    const notesRaw = sourceJob.internalNotes != null ? String(sourceJob.internalNotes) : '';
                    const { cleaned, hours } = extractWorkingHoursFromNotes(notesRaw);
                    return { internalNotes: cleaned, preferredWorkingHours: hours };
                })()),
                salaryMin: sourceJob.salaryMin || prev.salaryMin,
                salaryMax: sourceJob.salaryMax || prev.salaryMax,
                ageMin: (() => {
                    const n = Number(sourceJob.ageMin);
                    return Number.isFinite(n) ? Math.round(Math.min(70, Math.max(18, n))) : prev.ageMin;
                })(),
                ageMax: (() => {
                    const n = Number(sourceJob.ageMax);
                    return Number.isFinite(n) ? Math.round(Math.min(70, Math.max(18, n))) : prev.ageMax;
                })(),
                status:
                    sourceJob.status != null && String(sourceJob.status).trim() !== ''
                        ? jobStatusApiToForm(String(sourceJob.status))
                        : prev.status,
                openDateIso: isDuplicating
                    ? new Date().toISOString()
                    : sourceJob.openDate
                      ? new Date(String(sourceJob.openDate)).toISOString()
                      : prev.openDateIso,
                priority: sourceJob.priority || prev.priority,
                healthProfile: sourceJob.healthProfile || 'standard',
                availabilityOptions: availabilityOptionsFromJob(sourceJob),
                jobType: Array.isArray(sourceJob.jobType)
                    ? sourceJob.jobType
                    : sourceJob.jobType
                      ? [sourceJob.jobType]
                      : ['מלאה'],
                
                // Hydrate questions if they exist in jobData, otherwise fallback to defaults
                // Ensure defaults for new properties if missing
                telephoneQuestions: (sourceJob.telephoneQuestions || []).map((q: any) => ({...q, type: q.type || 'text'})), 
                digitalQuestions: (sourceJob.digitalQuestions || []).map((q: any) => ({
                    ...q, 
                    type: q.type || 'text',
                    options: q.options || (q.type === 'multiple_choice' ? [{id:'1', text:'', isCorrect:false}] : undefined),
                    isMandatory: q.isMandatory ?? true,
                    disqualifyIfWrong: q.disqualifyIfWrong ?? false
                })),
                enableDigitalScreening: sourceJob.enableDigitalScreening ?? true,
                enableManualScreening: sourceJob.enableManualScreening ?? true,
                
                languages: sourceJob.languages || [],
                skills: hydratedSkills.length ? hydratedSkills : prev.skills,
                locations: candidateLocations.length ? candidateLocations : prev.locations,
                gender: mapJobGenderSelection(sourceJob.gender),
                mobility: jobMobilityBooleanToFormValue(sourceJob.mobility, mobilityPicklistRef.current),
                drivingLicenses: licenseTypesFromJob(sourceJob, drivingLicensePicklistRef.current),
                jobId: isDuplicating ? freshPostingCode : (sourceJob.id || prev.jobId),
                postingCode: isDuplicating
                    ? freshPostingCode
                    : sourceJob.postingCode || prev.postingCode,
                uniqueEmail: isDuplicating
                    ? `humand+${freshPostingCode}@app.hiro.co.il`
                    : sourceJob.postingCode
                      ? `humand+${sourceJob.postingCode}@app.hiro.co.il`
                      : (sourceJob.uniqueEmail || prev.uniqueEmail),
                creationDate: isDuplicating
                    ? new Date().toLocaleDateString('he-IL')
                    : sourceJob.openDate
                      ? new Date(String(sourceJob.openDate)).toLocaleDateString('he-IL')
                      : prev.creationDate,
                validityDays:
                    typeof sourceJob.validityDays === 'number' && Number.isFinite(sourceJob.validityDays)
                        ? sourceJob.validityDays
                        : prev.validityDays,
                reScreeningCooldownMonths:
                    typeof sourceJob.reScreeningCooldownMonths === 'number' && Number.isFinite(sourceJob.reScreeningCooldownMonths)
                        ? sourceJob.reScreeningCooldownMonths
                        : prev.reScreeningCooldownMonths,
                requireOriginalCv:
                    typeof sourceJob.requireOriginalCv === 'boolean' ? sourceJob.requireOriginalCv : prev.requireOriginalCv,
                recruitmentSources: Array.isArray(sourceJob.recruitmentSources)
                    ? sourceJob.recruitmentSources
                    : prev.recruitmentSources,
                ...(contactsFromJob !== null ? { contacts: contactsFromJob } : {}),
             }));
             if (sourceJob.aiRawDescription) {
                 setPastedJobText(String(sourceJob.aiRawDescription));
             }
             if (sourceJob.client) setIsClientConfirmed(true);
             if (isDuplicating && location.state) {
                 navigate(location.pathname, { replace: true, state: {} });
             }
    }, [isEditing, jobData, duplicateJobSeed, isDuplicating, location.pathname, location.state, navigate]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase) return;
        void fetchPicklistValuesByKey(apiBase, JOB_SCOPE_PICKLIST_KEY).then((rows) => {
            if (cancelled) return;
            const source = rows.length > 0 ? rows : JOB_SCOPE_MULTI_FALLBACK;
            setJobScopeOptions(mapPicklistRowsToJobScopeOptions(source));
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase) return;
        void fetchPicklistValuesByKey(apiBase, DRIVING_LICENSE_PICKLIST_KEY).then((rows) => {
            if (cancelled) return;
            setDrivingLicensePicklist(
                sortDrivingLicensePicklistRows(rows.length > 0 ? rows : DRIVING_LICENSE_FALLBACK),
            );
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase) return;
        void fetchPicklistValuesByKey(apiBase, MOBILITY_PICKLIST_KEY).then((rows) => {
            if (cancelled) return;
            setMobilityPicklist(rows.length > 0 ? rows : MOBILITY_FALLBACK);
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase) return;
        void fetchPicklistValuesByKey(apiBase, AVAILABILITY_PICKLIST_KEY).then((rows) => {
            if (cancelled) return;
            setAvailabilityPicklist(rows.length > 0 ? rows : AVAILABILITY_FALLBACK);
        });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        if (drivingLicensePicklist.length === 0) return;
        setFormData((prev) => {
            const next = prev.drivingLicenses
                .map((v) => remapDrivingLicenseFormValue(v, drivingLicensePicklist))
                .filter((v) => !isNeutralDrivingLicenseValue(v, drivingLicensePicklist));
            if (
                next.length === prev.drivingLicenses.length &&
                next.every((v, i) => v === prev.drivingLicenses[i])
            ) {
                return prev;
            }
            return { ...prev, drivingLicenses: next };
        });
    }, [drivingLicensePicklist]);

    useEffect(() => {
        if (mobilityPicklist.length === 0) return;
        setFormData((prev) => {
            const next = remapMobilityFormValue(prev.mobility, mobilityPicklist);
            return next === prev.mobility ? prev : { ...prev, mobility: next };
        });
    }, [mobilityPicklist]);

    /** Map stored jobType entries to picklist `value` strings when options load (create + edit). */
    useEffect(() => {
        if (jobScopeOptions.length === 0) return;
        setFormData((prev) => {
            const next = normalizeJobTypeToPicklistValues(prev.jobType, jobScopeOptions);
            if (
                next.length === prev.jobType.length &&
                next.every((v, i) => v === prev.jobType[i])
            ) {
                return prev;
            }
            return { ...prev, jobType: next };
        });
    }, [jobScopeOptions]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase) {
            setActiveClients([]);
            setActiveClientsLoading(false);
            return;
        }
        setActiveClientsLoading(true);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        fetch(`${apiBase}/api/clients?activeOnly=true`, {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('load clients'))))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                const opts = list
                    .map((c: Record<string, unknown>) => {
                        const label = String(c.displayName || c.name || '').trim();
                        return { id: String(c.id ?? label), label };
                    })
                    .filter((o) => o.label)
                    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
                setActiveClients(opts);
            })
            .catch(() => {
                if (!cancelled) setActiveClients([]);
            })
            .finally(() => {
                if (!cancelled) setActiveClientsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    useEffect(() => {
        if (!isTenantUser || !user?.clientId || isEditing) return;
        const match = activeClients.find((c) => c.id === user.clientId);
        if (!match) return;
        setFormData((prev) => (prev.clientName.trim() ? prev : { ...prev, clientName: match.label }));
        setIsClientConfirmed(true);
    }, [isTenantUser, user?.clientId, activeClients, isEditing]);

    const clientSelectOptions = useMemo(() => {
        const pool = isTenantUser && user?.clientId
            ? activeClients.filter((c) => c.id === user.clientId)
            : activeClients;
        const current = formData.clientName.trim();
        if (!current) return pool;
        if (pool.some((c) => c.label === current)) return pool;
        return [{ id: `legacy:${current}`, label: current }, ...pool];
    }, [activeClients, formData.clientName, isTenantUser, user?.clientId]);

    const isClientLocked = isClientConfirmed || (isTenantUser && Boolean(formData.clientName.trim()));

    /** UUID of Client row — whenever שם הלקוח matches a client from /api/clients (no need to click "אשר"). */
    const resolvedClientId = useMemo(() => {
        const name = formData.clientName.trim();
        if (!name) return null;
        const match = activeClients.find((c) => c.label === name);
        if (!match || match.id.startsWith('legacy:')) return null;
        return match.id;
    }, [formData.clientName, activeClients]);

    useEffect(() => {
        if (!resolvedClientId) {
            setOrgScreeningDefaults(null);
            return;
        }
        let cancelled = false;
        void fetchClientUsageSettings(resolvedClientId)
            .then((u) => {
                if (cancelled) return;
                setOrgScreeningDefaults({
                    validityDays: u.defaultJobValidityDays,
                    cooldownMonths: u.defaultJobReScreeningCooldownMonths,
                    requireOriginalCv: u.defaultRequireOriginalCv,
                });
            })
            .catch(() => {
                if (!cancelled) setOrgScreeningDefaults(null);
            });
        return () => {
            cancelled = true;
        };
    }, [resolvedClientId]);

    // Load active recruitment sources for the selected client
    useEffect(() => {
        if (!resolvedClientId || !apiBase) {
            setFormData(prev => ({ ...prev, recruitmentSources: [] }));
            return;
        }
        let cancelled = false;
        setPublishingSourcesLoading(true);
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetch(`${apiBase}/api/clients/${encodeURIComponent(resolvedClientId)}/recruitment-sources`, {
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : { sources: [] }))
            .then(({ sources }: { sources: Array<{ id: string; name: string; isActive?: boolean }> }) => {
                if (cancelled) return;
                const active = (Array.isArray(sources) ? sources : []).filter(
                    (s) => s.isActive !== false,
                );
                setFormData((prev) => {
                    // Preserve saved selection/status/alertDays for sources the job already has
                    const existing: Record<string, RecruitmentSource> = {};
                    for (const s of prev.recruitmentSources) existing[s.id] = s;
                    const merged: RecruitmentSource[] = active.map((s) => {
                        const saved = existing[s.id];
                        const savedStatus = (saved?.status ?? 'draft') as PublicationStatus;
                        // Derive selected: explicit boolean if present, else true when status is published
                        const savedSelected = saved
                            ? (saved.selected !== undefined ? Boolean(saved.selected) : savedStatus === 'published')
                            : false;
                        return {
                            id: s.id,
                            name: s.name,
                            selected: savedSelected,
                            status: savedStatus,
                            alertDays: saved?.alertDays ?? null,
                        };
                    });
                    return { ...prev, recruitmentSources: merged };
                });
            })
            .catch(() => {
                if (!cancelled) setFormData((prev) => ({ ...prev, recruitmentSources: [] }));
            })
            .finally(() => {
                if (!cancelled) setPublishingSourcesLoading(false);
            });
        return () => { cancelled = true; };
    }, [resolvedClientId, apiBase]);

    const distributionListBlockedReason = useMemo(() => {
        if (!apiBase) return 'אין כתובת API (VITE_API_BASE) — לא ניתן לטעון לקוחות.';
        const name = formData.clientName.trim();
        if (!name) return 'בחר לקוח בשדה "שם הלקוח" בפרטים כלליים.';
        const match = activeClients.find((c) => c.label === name);
        if (!match || match.id.startsWith('legacy:')) {
            return ' טקסט חופשי לא מקושר  ולכן אין רשימת אנשי קשר.';
        }
        return null;
    }, [apiBase, formData.clientName, activeClients]);

    useEffect(() => {
        let cancelled = false;
        if (!apiBase || !resolvedClientId) {
            setDistributionPeople([]);
            setDistributionLoading(false);
            setDistributionFetchError(null);
            return;
        }
        setDistributionLoading(true);
        setDistributionFetchError(null);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        void (async () => {
            try {
                const [cRes, uRes] = await Promise.all([
                    fetch(`${apiBase}/api/clients/${encodeURIComponent(resolvedClientId)}/contacts`, {
                        credentials: 'include',
                        headers,
                    }),
                    fetch(`${apiBase}/api/clients/${encodeURIComponent(resolvedClientId)}/staff-users`, {
                        credentials: 'include',
                        headers,
                    }),
                ]);
                if (!cRes.ok && !uRes.ok) {
                    const msg = `שגיאת שרת (${cRes.status} / ${uRes.status}) — בדוק התחברות והרשאות.`;
                    if (!cancelled) setDistributionFetchError(msg);
                    if (!cancelled) setDistributionPeople([]);
                    return;
                }
                const rawContacts = cRes.ok ? ((await cRes.json()) as Record<string, unknown>[]) : [];
                const rawUsers = uRes.ok ? ((await uRes.json()) as Record<string, unknown>[]) : [];
                const people: JobDistributionOption[] = [];
                for (const row of Array.isArray(rawContacts) ? rawContacts : []) {
                    const id = row?.id != null ? String(row.id) : '';
                    if (!id) continue;
                    const name = String(row.name || '').trim() || 'ללא שם';
                    const role = String(row.role || '').trim();
                    people.push({
                        key: jobDistributionKey('contact', id),
                        kind: 'contact',
                        id,
                        name,
                        subtitle: role || 'איש קשר',
                        email: String(row.email || '').trim() || undefined,
                    });
                }
                for (const row of Array.isArray(rawUsers) ? rawUsers : []) {
                    const id = row?.id != null ? String(row.id) : '';
                    if (!id) continue;
                    const name = String(row.name || '').trim() || String(row.email || '').trim() || 'משתמש';
                    const role = String(row.role || '').trim();
                    const active = row.isActive !== false;
                    people.push({
                        key: jobDistributionKey('user', id),
                        kind: 'user',
                        id,
                        name,
                        subtitle: active ? (role || 'משתמש פורטל') : `${role || 'משתמש'} (לא פעיל)`,
                        email: String(row.email || '').trim() || undefined,
                    });
                }
                if (cancelled) return;
                setDistributionPeople(people);
                const allKeys = people.map((p) => p.key);
                setFormData((prev) => {
                    const valid = (prev.contacts || []).filter((k) => allKeys.includes(k));
                    const nextContacts = valid.length > 0 ? valid : allKeys;
                    return { ...prev, contacts: nextContacts };
                });
            } catch {
                if (!cancelled) {
                    setDistributionPeople([]);
                    setFormData((prev) => ({ ...prev, contacts: [] }));
                    setDistributionFetchError('שגיאת רשת או תגובה לא תקינה.');
                }
            } finally {
                if (!cancelled) setDistributionLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [apiBase, resolvedClientId]);

    useEffect(() => {
        const scrollContainer = document.getElementById('main-scroll-container');
        if (!scrollContainer) return;

        const handleScroll = () => {
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const threshold = isEmbedded ? 140 : 100; // Adjusted for sticky nav heights

            let currentSectionId = sections[0].id;

            for (const section of sections) {
                const element = document.getElementById(section.id);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    // Section is active if its top is above the threshold (nav area)
                    if (rect.top <= containerTop + threshold + 20) {
                        currentSectionId = section.id;
                    } else {
                        break; 
                    }
                }
            }
            
            if (activeSection !== currentSectionId) {
                setActiveSection(currentSectionId);
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [activeSection, isEmbedded]);

    useEffect(() => {
        if (navRef.current && activeSection) {
            const activeButton = navRef.current.querySelector(`[data-section-id="${activeSection}"]`) as HTMLElement;
            if (activeButton) {
                const container = navRef.current;
                const scrollLeft = activeButton.offsetLeft - (container.clientWidth / 2) + (activeButton.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [activeSection]);


    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        const scrollContainer = document.getElementById('main-scroll-container');
        if (element && scrollContainer) {
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            const scrollTop = scrollContainer.scrollTop;
            const offset = isEmbedded ? 135 : 110; // Precision offset for landing just below sticky nav
            scrollContainer.scrollTo({ top: scrollTop + elementTop - containerTop - offset, behavior: 'smooth' });
        }
    };

    const handleParseJob = async () => {
        const textToSend = pastedJobText.trim();
        if (!textToSend || !apiBase) return;
        setIsParsing(true);
        try {
            const res = await fetch(`${apiBase}/api/jobs/ai/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToSend }),
            });

            if (!res.ok) {
                throw new Error('Failed to analyze job description');
            }

            const json = await res.json();
            const raw = json?.data || {};
            // Normalize API field names to form shape (API may return title/description/licenseType; form uses jobTitle/jobDescription/drivingLicense)
            const extractedData = {
                ...raw,
                jobTitle: raw.title ?? raw.jobTitle,
                jobDescription: raw.description ?? raw.jobDescription,
                drivingLicenses: licenseTypesFromJob(raw, drivingLicensePicklistRef.current),
                availabilityOptions: availabilityOptionsFromJob(raw),
                publicJobTitle: raw.publicJobTitle ?? raw.public_job_title,
                publicDescription: raw.PublicDescription ?? raw.publicDescription ?? raw.public_description,
            };

            const pwhFromAi = coercePreferredWorkingHoursFromJobAi(
                pickPreferredWorkingHoursFromExtracted(extractedData as Record<string, unknown>),
            );

            const filled = new Set<string>();
            const filledList: string[] = [];
            const missingList: string[] = [];

            if (extractedData.jobTitle) { filled.add('jobTitle'); filledList.push('כותרת המשרה'); } else missingList.push('כותרת המשרה');
            if (extractedData.jobDescription) { filled.add('jobDescription'); filledList.push('תיאור המשרה'); } else missingList.push('תיאור המשרה');
            if (extractedData.requirements) { filled.add('requirements'); filledList.push('דרישות המשרה'); } else missingList.push('דרישות המשרה');
            if (extractedData.salaryMin || extractedData.salaryMax) { filled.add('salaryMin'); filled.add('salaryMax'); filledList.push('טווח שכר'); } else missingList.push('טווח שכר');
            if (typeof extractedData.ageMin === 'number' || typeof extractedData.ageMax === 'number') {
                filled.add('ageMin');
                filled.add('ageMax');
                filledList.push('טווח גיל');
            } else {
                missingList.push('טווח גיל');
            }
            if (
                (Array.isArray(extractedData.availabilityOptions) && extractedData.availabilityOptions.length > 0) ||
                (extractedData.availability != null && String(extractedData.availability).trim() !== '')
            ) {
                filled.add('availabilityOptions');
                filledList.push(t('form.availability'));
            } else {
                missingList.push(t('form.availability'));
            }
            if (extractedData.city) { filled.add('locations'); filledList.push('מיקום'); } else missingList.push('מיקום');
            const parsedTaxonomyField = jobFieldFromAnalyzeTaxonomy(extractedData as Record<string, unknown>);
            if (parsedTaxonomyField) {
                filled.add('jobField');
                filledList.push('תחום');
            } else {
                missingList.push('תחום');
            }
            if (extractedData.internalNotes) { filled.add('internalNotes'); filledList.push('הערות פנימיות'); } else missingList.push('הערות פנימיות');
            if (pwhFromAi) {
                filled.add('preferredWorkingHours');
                filledList.push(t('form.working_hours'));
            }
            if (Array.isArray(extractedData.languages) && extractedData.languages.length > 0) { filled.add('languages'); filledList.push('שפות'); } else missingList.push('שפות');
            if (
                extractedData.drivingLicense ||
                (Array.isArray(extractedData.drivingLicenses) && extractedData.drivingLicenses.length)
            ) {
                filled.add('drivingLicenses');
                filledList.push('רישיון נהיגה');
            } else missingList.push('רישיון נהיגה');
            if (extractedData.mobility) { filled.add('mobility'); filledList.push('דרישות ניידות'); } else missingList.push('דרישות ניידות');
            if (extractedData.gender) { filled.add('gender'); filledList.push('מין'); } else missingList.push('מין');
            const aiTagsSource = Array.isArray(extractedData.tags) && extractedData.tags.length > 0
                ? extractedData.tags
                : (Array.isArray(extractedData.skills) ? extractedData.skills : []);
            if (aiTagsSource.length > 0) { filled.add('skills'); filledList.push('כישורים ותגיות חכמות'); } else missingList.push('כישורים ותגיות חכמות');

            const screeningOrDigital = extractedData.screeningQuestions ?? extractedData.digitalQuestions ?? [];
            if (screeningOrDigital.length > 0) {
                filledList.push(`${screeningOrDigital.length} שאלות סינון`);
            }

            const aiLanguages: LanguageRequirement[] = Array.isArray(extractedData.languages)
                ? extractedData.languages
                    .filter((l: any) => l && (l.name || l.language))
                    .map((l: any, index: number) => ({
                        id: Date.now() + index,
                        language: l.language || l.name,
                        level: l.level || 'טובה מאוד',
                    }))
                : [];

            const newQuestions = screeningOrDigital.map((q: any, index: number) => ({
                id: Date.now() + index,
                text: q.text ?? q.question,
                type: q.type || 'text',
                order: q.order ?? index + 1,
                disqualificationReason: q.disqualificationReason || 'ניסיון',
                isMandatory: q.isMandatory !== false,
                disqualifyIfWrong: q.disqualifyIfWrong !== false,
                isExpanded: q.isExpanded === true,
            }));

            const apiTelephone = extractedData.telephoneQuestions ?? [];
            const newTelephoneQuestions: Question[] = apiTelephone.map((q: any, index: number) => ({
                id: Date.now() + 1000 + index,
                text: q.text ?? q.question ?? '',
                type: (q.type as QuestionType) || 'text',
                order: q.order ?? index + 1,
                isMandatory: q.required !== false && q.isMandatory !== false,
                disqualifyIfWrong: false,
                isExpanded: false,
                disqualificationReason: q.disqualificationReason,
            }));

            // Keep description, PublicDescription, and requirements separate — never merge requirements into description text.
            const rawDesc = String(extractedData.jobDescription || '').trim();
            const jobDescriptionFromAi = rawDesc ? normalizeValueForEditor(rawDesc) : undefined;

            const rawTypeToSmartTagType = (raw: string): SmartTagType => {
                const r = (raw || '').toLowerCase();
                if (r.includes('role')) return 'role';
                if (r.includes('seniority') || r.includes('level')) return 'seniority';
                if (r.includes('industry')) return 'industry';
                if (r.includes('certification') || r.includes('degree') || r.includes('education')) return 'certification';
                if (r.includes('language')) return 'language';
                if (r.includes('tool')) return 'tool';
                if (r.includes('soft')) return 'soft';
                if (r.includes('skill')) return 'skill';
                return 'skill';
            };
            const apiTagsRaw: any[] = Array.isArray(extractedData.tags) && extractedData.tags.length > 0
                ? (extractedData.tags as any[])
                : (Array.isArray(extractedData.skills) ? (extractedData.skills as any[]) : []);

            const apiTags: JobSkill[] = apiTagsRaw
                .map((t: any, i: number) => {
                    const baseName = String(t.raw_value ?? t.name ?? '').trim();
                    if (!baseName) return null;

                    const namePrefix = String(t.name || '').split(':')[0]?.trim() ?? '';
                    const baseTagType = t.tagType
                        ? (String(t.tagType) as SmartTagType)
                        : rawTypeToSmartTagType(t.raw_type ?? t.rawType ?? namePrefix);

                    // Prefer explicit key from AI, otherwise derive from name
                    const explicitKey = typeof t.key === 'string' && t.key.trim() ? t.key.trim() : undefined;
                    const derivedKey = baseName
                        .toString()
                        .trim()
                        .toLowerCase()
                        .replace(/\s+/g, '_');

                    const mode: TagMode = mapLlmModeToTagMode(t.mode);
                    const relevanceScore =
                        typeof t.relevance_score === 'number'
                            ? t.relevance_score
                            : t.relevance_score != null
                              ? Number(t.relevance_score)
                              : undefined;
                    const tagReason = typeof t.tag_reason === 'string' ? t.tag_reason : undefined;
                    const tagQuote = typeof t.quote === 'string' && t.quote.trim() ? t.quote.trim() : undefined;
                    const aiModeStr = t.mode != null && t.mode !== '' ? String(t.mode) : undefined;

                    return {
                        id: t.id ?? `ai-${Date.now()}-${i}`,
                        name: baseName,
                        key: explicitKey || derivedKey,
                        mode,
                        source: (t.source as TagSource) || 'manual',
                        tagType: baseTagType,
                        tag_reason: tagReason,
                        quote: tagQuote,
                        relevance_score: Number.isFinite(relevanceScore as number) ? (relevanceScore as number) : undefined,
                        aiMode: aiModeStr,
                    } as JobSkill;
                })
                .filter((t): t is JobSkill => Boolean(t));

            const genderSelection = mapJobGenderSelection(extractedData.gender);

            const requirementsForForm = Array.isArray(extractedData.requirements)
                ? (extractedData.requirements as string[]).map((r) => String(r).trim()).join('\n')
                : extractedData.requirements != null
                  ? String(extractedData.requirements)
                  : undefined;

            const mobilityFromAi =
                typeof extractedData.mobility === 'boolean'
                    ? extractedData.mobility
                        ? 'חובה'
                        : 'לא חשוב'
                    : null;

            setFormData(prev => {
                const nextAiField =
                    extractedData.field != null && String(extractedData.field).trim()
                        ? String(extractedData.field).trim()
                        : prev.aiField;
                const nextAiRole =
                    extractedData.role != null && String(extractedData.role).trim()
                        ? String(extractedData.role).trim()
                        : prev.aiRole;
                const fromAiJobField =
                    jobFieldFromAnalyzeTaxonomy(extractedData as Record<string, unknown>) ??
                    jobFieldFromCategoryRole(nextAiField, nextAiRole);

                return {
                ...prev,
                clientName: (extractedData.client || prev.clientName || '').trim() || prev.clientName,
                aiField: nextAiField,
                aiRole: nextAiRole,
                jobField: fromAiJobField ?? prev.jobField,
                regionLabel: (extractedData.region != null && String(extractedData.region).trim())
                    ? String(extractedData.region).trim()
                    : prev.regionLabel,
                clientTypeLabel: (extractedData.clientType != null && String(extractedData.clientType).trim())
                    ? String(extractedData.clientType).trim()
                    : prev.clientTypeLabel,
                publicJobTitle: (extractedData.publicJobTitle != null && String(extractedData.publicJobTitle).trim())
                    ? String(extractedData.publicJobTitle).trim()
                    : prev.publicJobTitle,
                publicDescription: extractedData.publicDescription
                    ? normalizeValueForEditor(String(extractedData.publicDescription))
                    : prev.publicDescription,
                openPositions:
                    typeof extractedData.openPositions === 'number' && extractedData.openPositions > 0
                        ? extractedData.openPositions
                        : prev.openPositions,
                rating: typeof extractedData.rating === 'number' ? extractedData.rating : prev.rating,
                jobTitle: extractedData.jobTitle || prev.jobTitle,
                jobDescription: jobDescriptionFromAi ?? prev.jobDescription,
                requirements: requirementsForForm !== undefined ? requirementsForForm : prev.requirements,
                internalNotes: mergeWorkingHoursIntoNotes(
                    extractedData.internalNotes != null && String(extractedData.internalNotes).trim() !== ''
                        ? String(extractedData.internalNotes)
                        : prev.internalNotes,
                    (pwhFromAi ?? prev.preferredWorkingHours) || 'גמיש',
                ),
                preferredWorkingHours: (pwhFromAi ?? prev.preferredWorkingHours) || 'גמיש',
                salaryMin: typeof extractedData.salaryMin === 'number' ? extractedData.salaryMin : prev.salaryMin,
                salaryMax: typeof extractedData.salaryMax === 'number' ? extractedData.salaryMax : prev.salaryMax,
                ageMin:
                    typeof extractedData.ageMin === 'number'
                        ? coerceFormAgeFromAi(extractedData.ageMin, prev.ageMin)
                        : prev.ageMin,
                ageMax:
                    typeof extractedData.ageMax === 'number'
                        ? coerceFormAgeFromAi(extractedData.ageMax, prev.ageMax)
                        : prev.ageMax,
                locations: extractedData.city
                    ? [...prev.locations, { type: 'city', value: extractedData.city }]
                    : prev.locations,
                languages: aiLanguages.length ? aiLanguages : prev.languages,
                drivingLicenses: (() => {
                    const fromAi = Array.isArray(extractedData.drivingLicenses)
                        ? extractedData.drivingLicenses
                        : extractedData.drivingLicense
                          ? [extractedData.drivingLicense]
                          : [];
                    if (!fromAi.length) return prev.drivingLicenses;
                    const mapped = fromAi
                        .map((v: string) => remapDrivingLicenseFormValue(String(v), drivingLicensePicklistRef.current))
                        .filter((v: string) => !isNeutralDrivingLicenseValue(v, drivingLicensePicklistRef.current));
                    return mapped.length ? mapped : prev.drivingLicenses;
                })(),
                availabilityOptions: (() => {
                    const fromAi = Array.isArray(extractedData.availabilityOptions)
                        ? extractedData.availabilityOptions
                        : extractedData.availability
                          ? [extractedData.availability]
                          : [];
                    const trimmed = fromAi.map((v: string) => String(v).trim()).filter(Boolean);
                    return trimmed.length ? trimmed : prev.availabilityOptions;
                })(),
                mobility: mobilityFromAi ?? prev.mobility,
                gender: genderSelection.length ? genderSelection : prev.gender,
                skills: apiTags.length ? apiTags : prev.skills,
                digitalQuestions: newQuestions,
                enableDigitalScreening: true,
                telephoneQuestions: newTelephoneQuestions.length > 0 ? newTelephoneQuestions : prev.telephoneQuestions,
                enableManualScreening: newTelephoneQuestions.length > 0 ? true : prev.enableManualScreening,
            };
            });

            setAiFilledFields(filled);
            setParseSummaryData({ filled: filledList, missing: missingList });

            aiPasteAnalyzeUsedRef.current = true;
            setParseSuccess(true);
            setTimeout(() => {
                setParseSuccess(false);
                setIsAIModalOpen(false);
                // keep pastedJobText so the original description remains visible
                setShowParseSummary(true);
            }, 1000);
        } catch (error) {
            console.error('Parsing error', error);
        } finally {
            setIsParsing(false);
        }
    };
    
    const getInputClass = (name: string, baseClass: string) => {
        if (aiFilledFields.has(name)) {
            return `${baseClass} ring-2 ring-purple-200 bg-purple-50/30 border-purple-300`;
        }
        return baseClass;
    };
    
    const AIIndicator = ({ name }: { name: string }) => {
        if (aiFilledFields.has(name)) {
            return (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none animate-pulse" title="מולא אוטומטית ע״י AI">
                    <SparklesIcon className="w-4 h-4" />
                </div>
            );
        }
        return null;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        let processedValue: string | number | boolean = value;
        if (type === 'number' || type === 'range') processedValue = Number(value);
        if (checked !== undefined) processedValue = checked;
        
        if (aiFilledFields.has(name)) {
            const newSet = new Set(aiFilledFields);
            newSet.delete(name);
            setAiFilledFields(newSet);
        }
        
        setFormData(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleSliderChange = (name: string, value: number) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGenderChange = (g: 'male'|'female') => { 
        setFormData(prev => { 
            const n = [...prev.gender]; 
            if(n.includes(g) && n.length>1) return {...prev, gender: n.filter(x=>x!==g)}; 
            if(!n.includes(g)) n.push(g); 
            return {...prev, gender: n}; 
        }) 
    };
    
    const handleAddLanguage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (newLanguageName) {
            setFormData(prev => ({
                ...prev,
                languages: [...(prev.languages || []), { id: Date.now(), language: newLanguageName, level: newLanguageLevel }]
            }));
            setNewLanguageName('');
        }
    };
    const handleRemoveLanguage = (id: number) => { setFormData(prev => ({...prev, languages: prev.languages.filter(l => l.id !== id)})) };

    const handleSkillInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewSkillText(val);
        
        if (val.trim()) {
            const matchedGlobal = systemTagsList.filter(t => 
                t.name.toLowerCase().includes(val.toLowerCase()) || 
                t.synonyms.some(s => s.toLowerCase().includes(val.toLowerCase()))
            );
            const matchedCompany = companyTagsList.filter(t => 
                t.name.toLowerCase().includes(val.toLowerCase()) || 
                t.synonyms.some(s => s.toLowerCase().includes(val.toLowerCase()))
            );
            
            setSuggestions({ global: matchedGlobal, company: matchedCompany });
            setIsSuggestionsOpen(true);
        } else {
            setIsSuggestionsOpen(false);
        }
    };

    const handleSelectTag = (tag: {id: string, name: string}, source: TagSource) => {
         const newTag: JobSkill = {
            id: Date.now().toString(),
            name: tag.name,
            key: tag.id || tag.name,
            mode: 'normal',
            source,
            tagType: 'skill',
        };
        setFormData(prev => ({
            ...prev,
            skills: [...(prev.skills || []), newTag]
        }));
        setNewSkillText('');
        setIsSuggestionsOpen(false);
        skillInputRef.current?.focus();
    };

    const handleAddManualTag = () => {
        if (newSkillText.trim()) {
            const newTag: JobSkill = {
                id: Date.now().toString(),
                name: newSkillText.trim(),
                key: newSkillText.trim().toLowerCase().replace(/\s+/g, '_'),
                mode: 'normal',
                source: 'manual',
                tagType: 'skill',
            };
            setFormData(prev => ({
                ...prev,
                skills: [...(prev.skills || []), newTag]
            }));
            setNewSkillText('');
            setIsSuggestionsOpen(false);
        }
    };

    const handleToggleSmartTag = (id: string) => {
        setFormData(prev => ({
            ...prev,
            skills: prev.skills.map(tag => {
                if (tag.id === id) {
                    const nextMode: TagMode = 
                        tag.mode === 'normal' ? 'mandatory' : 
                        tag.mode === 'mandatory' ? 'negative' : 'normal';
                    return { ...tag, mode: nextMode };
                }
                return tag;
            })
        }));
    };

    const handleRemoveSmartTag = (id: string) => {
        setFormData(prev => ({
            ...prev,
            skills: prev.skills.filter(tag => tag.id !== id)
        }));
    };

    const groupedJobTags = useMemo(() => {
        const skills = formData.skills || [];
        return JOB_TAG_ROW_CONFIG.map((row) => ({
            ...row,
            tags: skills.filter((tag) => {
                const raw = tag.tagType ?? 'skill';
                let t = raw === 'soft_skill' ? 'soft' : raw;
                if (t === 'degree' || t === 'education') t = 'certification';
                return row.types.includes(t as SmartTagType);
            }),
        }));
    }, [formData.skills]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (skillInputRef.current && !skillInputRef.current.parentElement?.contains(event.target as Node)) {
                setIsSuggestionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- QUESTION MANAGEMENT HANDLERS (UPDATED for Cards) ---

    const handleAddQuestionCard = (type: 'digital' | 'manual', qType: QuestionType = 'text') => {
        const field = type === 'digital' ? 'digitalQuestions' : 'telephoneQuestions';
        const newQuestion: Question = {
            id: Date.now(),
            text: '',
            type: qType,
            order: (formData[field]?.length || 0) + 1,
            isMandatory: true,
            disqualifyIfWrong: false,
            isExpanded: true,
            // Default options for multiple choice
            options: qType === 'multiple_choice' ? [{id: '1', text: '', isCorrect: false}] : undefined,
            // Default for Yes/No
            ...(qType === 'yes_no' ? {options: [{id: '1', text: 'כן', isCorrect: true}, {id: '2', text: 'לא', isCorrect: false}]} : {}),
            presentationMode: 'text',
            timeLimit: type === 'digital' && qType === 'video' ? 60 : undefined,
            retriesAllowed: type === 'digital' && qType === 'video' ? true : undefined,
            introText: ''
        };

        setFormData(prev => ({
            ...prev,
            [field]: [...(prev[field] || []), newQuestion]
        }));
    };

    const handleUpdateQuestion = (type: 'digital' | 'manual', id: number, fieldName: keyof Question, value: any) => {
        const field = type === 'digital' ? 'digitalQuestions' : 'telephoneQuestions';
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].map(q => q.id === id ? { ...q, [fieldName]: value } : q)
        }));
    };

    const handleRemoveQuestion = (type: 'digital' | 'manual', id: number) => {
        const field = type === 'digital' ? 'digitalQuestions' : 'telephoneQuestions';
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter(q => q.id !== id)
        }));
    };
    
    const handleToggleExpandQuestion = (type: 'digital' | 'manual', id: number) => {
        const field = type === 'digital' ? 'digitalQuestions' : 'telephoneQuestions';
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].map(q => q.id === id ? { ...q, isExpanded: !q.isExpanded } : q)
        }));
    };

    const handleMoveQuestion = (type: 'digital' | 'manual', id: number, direction: 'up' | 'down') => {
        const field = type === 'digital' ? 'digitalQuestions' : 'telephoneQuestions';
        const questions = [...formData[field]];
        const index = questions.findIndex(q => q.id === id);
        
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === questions.length - 1) return;

        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [questions[index], questions[swapIndex]] = [questions[swapIndex], questions[index]];
        
        setFormData(prev => ({ ...prev, [field]: questions }));
    };

    // MANUAL QUESTION HANDLING - NEW LOGIC
    const handleOpenManualEdit = (question?: Question) => {
        setManualEditState({ isOpen: true, question: question || null });
    };

    const handleSaveManualQuestion = (text: string, isKiller: boolean, reason?: string) => {
        const currentQ = manualEditState.question;
        
        if (currentQ) {
            // Update
            const updated: Question = { 
                ...currentQ, 
                text, 
                disqualifyIfWrong: isKiller, 
                disqualificationReason: reason 
            };
            
            setFormData(prev => ({
                ...prev,
                telephoneQuestions: prev.telephoneQuestions.map(q => q.id === updated.id ? updated : q)
            }));
        } else {
            // Add New
            const newQuestion: Question = {
                id: Date.now(),
                text,
                type: 'text',
                order: (formData.telephoneQuestions?.length || 0) + 1,
                isMandatory: true, // Default true for manual? Or based on user choice. Let's assume true for simplicity or add to modal if needed.
                disqualifyIfWrong: isKiller,
                disqualificationReason: reason,
                isExpanded: false
            };
            
             setFormData(prev => ({
                ...prev,
                telephoneQuestions: [...(prev.telephoneQuestions || []), newQuestion]
            }));
        }
    };


    const toggleContact = (contactKey: string) => {
        setFormData((prev) => ({
            ...prev,
            contacts: prev.contacts.includes(contactKey)
                ? prev.contacts.filter((k) => k !== contactKey)
                : [...prev.contacts, contactKey],
        }));
    };

    // Persist board sources to the backend immediately (only when editing an existing job)
    const persistBoardSources = (updatedSources: RecruitmentSource[]) => {
        if (!isEditing || !formData.jobId) return;
        void patchJobBoardSources(formData.jobId, updatedSources).catch((e) => {
            console.warn('[board-sources] auto-save failed:', e?.message);
        });
    };

    const toggleSourceSelection = (sourceId: string) => {
        setFormData(prev => {
            const next = prev.recruitmentSources.map(s =>
                s.id === sourceId
                    ? { ...s, selected: !s.selected, status: !s.selected ? ('published' as PublicationStatus) : ('draft' as PublicationStatus) }
                    : s,
            );
            persistBoardSources(next);
            return { ...prev, recruitmentSources: next };
        });
    };

    const handleSourceStatusChange = (sourceId: string, newStatus: PublicationStatus) => {
        setFormData(prev => {
            const next = prev.recruitmentSources.map(s =>
                s.id === sourceId ? { ...s, status: newStatus } : s,
            );
            persistBoardSources(next);
            return { ...prev, recruitmentSources: next };
        });
    };

    const handleSourceAlertChange = (sourceId: string, days: number | null) => {
        setFormData(prev => {
            const next = prev.recruitmentSources.map(s =>
                s.id === sourceId ? { ...s, alertDays: days } : s,
            );
            persistBoardSources(next);
            return { ...prev, recruitmentSources: next };
        });
    };
    
    const handleLocationsChange = (newLocations: LocationItem[]) => {
        setFormData(prev => ({ ...prev, locations: newLocations }));
    };

    const buildJobPayload = () => {
        const data = formDataRef.current;
        const field = data.jobField;
        const cityValues = (data.locations || []).filter((loc: LocationItem) => loc.type === 'city').map((loc: LocationItem) => loc.value.trim()).filter(Boolean);
        const firstCity = cityValues[0] || 'תל אביב';
        const locationString = cityValues.length ? cityValues.join(LOCATION_SEP) : firstCity;
        const genderValue = (() => {
            const includesMale = data.gender.includes('male');
            const includesFemale = data.gender.includes('female');
            if (includesMale && !includesFemale) return 'זכר';
            if (includesFemale && !includesMale) return 'נקבה';
            return 'לא משנה';
        })();
        const requirements = Array.isArray(data.requirements)
            ? data.requirements.map((r: string) => String(r).trim()).filter(Boolean)
            : (data.requirements || '').split(/\r?\n/).map((line: string) => line.trim()).filter(Boolean);
        const people = distributionPeopleRef.current;
        const contactObjects = (Array.isArray(data.contacts) ? data.contacts : [])
            .map((key: string) => people.find((p) => p.key === key))
            .filter(Boolean)
            .map((p) => {
                const row = p as JobDistributionOption;
                if (row.kind === 'contact') {
                    return {
                        kind: 'contact' as const,
                        id: row.id,
                        name: row.name,
                        role: row.subtitle,
                        email: row.email || null,
                    };
                }
                return {
                    kind: 'user' as const,
                    id: row.id,
                    name: row.name,
                    role: row.subtitle,
                    email: row.email || null,
                };
            });
        const recruiterName = mockInternalRecruiters.find(r => data.assignedRecruiters.includes(r.id))?.name || 'מערכת';
        const accountManagerName = mockAccountManagers.find(m => data.assignedAccountManagers.includes(m.id))?.name || 'מערכת';

        const publicDescRaw = data.publicDescription;
        const publicDescStr = typeof publicDescRaw === 'string' ? publicDescRaw.trim() : '';

        return {
            title: data.jobTitle || 'משרה חדשה',
            publicJobTitle: data.publicJobTitle?.trim() || undefined,
            client: data.clientName || 'לקוח כללי',
            field: field?.category || data.aiField || '',
            role: field?.role || data.aiRole || '',
            priority: data.priority,
            clientType: data.clientTypeLabel || 'כללי',
            city: firstCity,
            region: (data.regionLabel || '').trim(),
            gender: genderValue,
            mobility: mobilityBoolForJobPayload(data.mobility, mobilityPicklistRef.current),
            licenseTypes: licenseTypesForJobPayload(data.drivingLicenses, drivingLicensePicklistRef.current),
            licenseType:
                licenseTypesForJobPayload(data.drivingLicenses, drivingLicensePicklistRef.current)[0] || null,
            availabilityOptions: (data.availabilityOptions || []).map((v: string) => String(v).trim()).filter(Boolean),
            availability:
                (data.availabilityOptions || []).map((v: string) => String(v).trim()).filter(Boolean)[0] || null,
            postingCode: data.postingCode,
            validityDays: (() => {
                const n = Number(data.validityDays);
                if (!Number.isFinite(n)) return 60;
                return Math.min(20000, Math.max(0, Math.round(n)));
            })(),
            reScreeningCooldownMonths: (() => {
                const n = Number(data.reScreeningCooldownMonths);
                if (!Number.isFinite(n)) return 3;
                return Math.min(9999, Math.max(0, Math.round(n)));
            })(),
            requireOriginalCv: Boolean(data.requireOriginalCv),
            recruitingCoordinator: recruiterName,
            accountManager: accountManagerName,
            salaryMin: data.salaryMin,
            salaryMax: data.salaryMax,
            ageMin: data.ageMin,
            ageMax: data.ageMax,
            openPositions: typeof data.openPositions === 'number' ? data.openPositions : 1,
            status: jobStatusFormToApi(data.status),
            associatedCandidates: 0,
            waitingForScreening: 0,
            activeProcess: 0,
            openDate: data.openDateIso || new Date().toISOString(),
            recruiter: recruiterName,
            location: locationString,
            jobType: Array.isArray(data.jobType) ? data.jobType : [data.jobType],
            description: data.jobDescription,
            PublicDescription: publicDescStr || undefined,
            requirements,
            rating: typeof data.rating === 'number' ? data.rating : 0,
            healthProfile: data.healthProfile,
            internalNotes: mergeWorkingHoursIntoNotes(
                data.internalNotes || '',
                String(data.preferredWorkingHours || 'גמיש'),
            ),
            aiRawDescription: pastedJobText || undefined,
            uniqueEmail: data.uniqueEmail,
            /** Server strips this; triggers audit_logs after Job.create with real job id */
            aiPasteAnalyzeUsed: aiPasteAnalyzeUsedRef.current === true,
            contacts: contactObjects,
            recruitmentSources: (data.recruitmentSources || []).map((source: RecruitmentSource) => ({
                id: source.id,
                name: source.name,
                selected: source.selected,
                status: source.status,
                alertDays: source.alertDays,
            })),
            telephoneQuestions: data.telephoneQuestions,
            digitalQuestions: data.digitalQuestions,
            languages: data.languages,
            skills: Array.isArray(data.skills)
                ? data.skills.map((s) => ({
                      ...s,
                      key: s.key || (typeof s.name === 'string' ? s.name.trim() : ''),
                  }))
                : [],
        };
    };

    const persistJob = async () => {
        if (isEditing || !apiBase) {
            return null;
        }
        if (!isJobFieldComplete(formDataRef.current.jobField)) {
            setJobFieldError(true);
            document.getElementById('general-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            alert(t('new_job.job_field_required'));
            return null;
        }
        setSaveMessage(null);
        setIsSaving(true);
        try {
            const res = await fetch(`${apiBase}/api/jobs`, {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify(buildJobPayload()),
            });
            if (!res.ok) {
                const errorBody = await res.json().catch(() => null);
                throw new Error(errorBody?.message || 'Failed to create job');
            }
            const createdJob = await res.json();
            const pubSeed = duplicatePublicationRef.current;
            if (pubSeed && createdJob?.id) {
                try {
                    await saveJobPublication(String(createdJob.id), {
                        publicJobTitle: pubSeed.publicJobTitle ?? null,
                        publicJobDescription: pubSeed.publicJobDescription ?? null,
                        publicJobRequirements: pubSeed.publicJobRequirements ?? null,
                        landingPageFields: pubSeed.landingPageFields,
                        screeningQuestions: pubSeed.screeningQuestions,
                        publishToGeneralBoard: pubSeed.publishToGeneralBoard,
                        heroImageUrl: pubSeed.heroImageUrl ?? null,
                        videoUrl: pubSeed.videoUrl ?? null,
                        landingLayout: pubSeed.landingLayout,
                        landingLayouts: pubSeed.landingLayouts,
                        trackingLinks: pubSeed.trackingLinks || [],
                    });
                } catch (pubErr) {
                    console.warn('[NewJobView] failed to copy publication settings', pubErr);
                } finally {
                    duplicatePublicationRef.current = null;
                }
            }
            setSaveMessage('המשרה נוצרה בהצלחה');
            aiPasteAnalyzeUsedRef.current = false;
            onSave(createdJob);
            return createdJob;
        } catch (err) {
            const message = (err as Error).message || 'Failed to create job';
            console.error('[NewJobView] persistJob', err);
            alert(message);
            setSaveMessage(`שגיאה: ${message}`);
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAndContinue = async () => {
        if (!isJobFieldComplete(formDataRef.current.jobField)) {
            setJobFieldError(true);
            document.getElementById('general-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            alert(t('new_job.job_field_required'));
            return;
        }
        if (isEditing) {
            onSave(buildJobPayload());
            navigate(`/jobs/${formData.jobId}/publish`);
            return;
        }
        const created = await persistJob();
        if (created) {
            navigate(`/jobs/${created.id}/publish`);
        }
    };

    const handleJustSave = async () => {
        if (!isJobFieldComplete(formDataRef.current.jobField)) {
            setJobFieldError(true);
            document.getElementById('general-info')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            alert(t('new_job.job_field_required'));
            return;
        }
        if (isEditing) {
            onSave(buildJobPayload());
            alert('השינויים נשמרו בהצלחה');
            return;
        }
        const created = await persistJob();
        if (created) {
            alert('המשרה נוצרה בהצלחה');
            // After first save of a new job, move to edit mode for this job (PUT on next saves)
            navigate(`/jobs/edit/${created.id}`);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    pointer-events: all;
                    width: 18px; height: 18px;
                    background-color: white;
                    border-radius: 50%;
                    border: 3px solid var(--color-primary-500);
                    cursor: pointer;
                    margin-top: -7px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
            `}</style>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                     <h1 className="text-2xl font-extrabold text-text-default">
                        {isEditing ? t('new_job.title_edit', {title: formData.jobTitle}) : t('new_job.title_new')}
                    </h1>
                    {isPlatformAdmin ? (
                        <p className="text-sm text-text-muted mt-1">
                            {t('new_job.subtitle')}
                        </p>
                    ) : null}
                </div>
                <div className="flex items-center gap-3">
                     <button
                        type="button"
                        onClick={() => {
                            setIsAIModalOpen(true);
                            const persistedUuid =
                                (isEditing &&
                                    jobData &&
                                    (jobData as { id?: string }).id != null &&
                                    String((jobData as { id?: string }).id).trim()) ||
                                (jobId != null && String(jobId).trim()) ||
                                null;
                            void logJobSmartImportModalOpen({
                                jobId: persistedUuid,
                                jobTitle: formData.jobTitle || formData.publicJobTitle || '',
                                context: isEmbedded ? 'job_edit' : 'job_new',
                            }).catch(() => {});
                        }}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
                    >
                        <SparklesIcon className="w-5 h-5"/>
                        <span>{t('new_job.smart_import')}</span>
                    </button>
                    
                </div>
            </div>

            <div 
                ref={navRef} 
                className={`sticky top-0 z-50 overflow-x-auto bg-bg-card shadow-sm py-2 -mx-4 px-4 md:mx-0 md:px-0 border-b border-border-default no-scrollbar`}
            >
                <div className="flex items-center md:w-auto rounded-xl gap-1 w-max">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            data-section-id={section.id}
                            type="button"
                            onClick={() => scrollToSection(section.id)}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                                activeSection === section.id 
                                    ? 'bg-primary-100 text-primary-700 shadow-sm' 
                                    : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'
                            }`}
                        >
                            {section.icon}
                            {t(section.titleKey)}
                        </button>
                    ))}
                </div>
            </div>

            {isAIModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border-default">
                        <div className="p-6">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                                <SparklesIcon className="w-6 h-6 text-primary-500"/>
                                {t('new_job.ai_import_title')}
                            </h3>
                            <p className="text-text-muted mb-4 text-sm">{t('new_job.ai_import_desc')}</p>
                            <textarea
                                value={pastedJobText}
                                onChange={(e) => setPastedJobText(e.target.value)}
                                placeholder={t('new_job.paste_here')}
                                rows={8}
                                disabled={isParsing}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none min-h-[200px]"
                            />
                        </div>
                        <div className="p-4 bg-bg-subtle border-t border-border-default flex justify-end gap-3">
                            <button type="button" onClick={() => setIsAIModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">{t('new_job.cancel')}</button>
                            <button type="button" onClick={handleParseJob} disabled={isParsing || !pastedJobText.trim()} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                                {isParsing ? t('new_job.analyzing') : t('new_job.analyze_btn')}
                                {parseSuccess && <CheckCircleIcon className="w-5 h-5"/>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {showParseSummary && (
                <div className="fixed bottom-6 right-6 z-[60] bg-bg-card border border-border-default shadow-2xl rounded-xl p-5 max-w-md animate-fade-in">
                    <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-lg flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-purple-500" />
                            סיכום ניתוח AI
                        </h4>
                        <button onClick={() => setShowParseSummary(false)}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                    </div>
                    
                    {parseSummaryData.filled.length > 0 && (
                        <div className="mb-3">
                            <p className="text-xs font-bold text-green-700 uppercase mb-1">הושלם בהצלחה:</p>
                            <div className="flex flex-wrap gap-1">
                                {parseSummaryData.filled.map(f => (
                                    <span key={f} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3"/> {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {parseSummaryData.missing.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-orange-700 uppercase mb-1">חסר מידע (להשלמה ידנית):</p>
                            <div className="flex flex-wrap gap-1">
                                {parseSummaryData.missing.map(f => (
                                    <span key={f} className="text-xs bg-orange-50 text-orange-800 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1">
                                        <ExclamationTriangleIcon className="w-3 h-3"/> {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-8">
                <SectionCard id="general-info" title={t('new_job.section_general')} icon={<BriefcaseIcon className="w-5 h-5"/>} className="z-10 relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.client_name')}</label>
                            {isClientLocked ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-full bg-primary-50 border border-primary-200 text-primary-900 font-bold text-sm rounded-lg p-2.5 flex items-center justify-between">
                                        <span>{formData.clientName}</span>
                                        <CheckCircleIcon className="w-4 h-4 text-primary-600" />
                                    </div>
                                    {!isTenantUser ? (
                                        <button type="button" onClick={() => setIsClientConfirmed(false)} className="text-sm font-semibold text-text-muted hover:text-primary-600 underline flex-shrink-0">{t('new_job.replace')}</button>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-grow">
                                        <select 
                                            name="clientName" 
                                            value={formData.clientName} 
                                            onChange={handleChange}
                                            disabled={activeClientsLoading}
                                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm disabled:opacity-60"
                                        >
                                            <option value="">
                                                {activeClientsLoading ? `${t('new_job.choose_client')}…` : t('new_job.choose_client')}
                                            </option>
                                            {clientSelectOptions.map((c) => (
                                                <option key={c.id} value={c.label}>
                                                    {c.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button type="button" onClick={() => setIsClientConfirmed(true)} disabled={!formData.clientName} className="bg-primary-600 text-white font-bold p-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                        <CheckCircleIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                            )}
                       </div>

                       <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">
                                {t('jobs.col_field')}
                                <span className="text-red-500 mr-0.5" aria-hidden> *</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className={`w-full bg-bg-input border rounded-lg py-2.5 px-3 text-sm flex justify-between items-center text-right hover:border-primary-300 transition-colors focus:ring-1 focus:ring-primary-500 ${
                                    jobFieldError && !isJobFieldComplete(formData.jobField)
                                        ? 'border-red-400 ring-1 ring-red-200'
                                        : 'border-border-default'
                                }`}
                            >
                                <span className={`truncate ${formData.jobField ? 'text-text-default' : 'text-text-muted'}`}>
                                    {formData.jobField ? formatJobFieldLabel(formData.jobField) : t('new_job.choose_field_placeholder') || 'בחר תחום...'}
                                </span>
                                <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                            </button>
                            <JobFieldSelector
                                value={formData.jobField}
                                onChange={(value) => {
                                    setJobFieldError(false);
                                    setFormData((prev) => ({ ...prev, jobField: value }));
                                }}
                                isModalOpen={isJobFieldSelectorOpen}
                                setIsModalOpen={setIsJobFieldSelectorOpen}
                            />
                       </div>
                       
                       <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.health_profile')}</label>
                           <div className="relative">
                               <select name="healthProfile" value={formData.healthProfile} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 pr-9 appearance-none focus:ring-primary-500 focus:border-primary-500 cursor-pointer">
                                    <option value="standard">רגיל (Standard)</option>
                                    <option value="high_volume">מסת גיוס (Volume)</option>
                                    <option value="executive">בכירים (Executive)</option>
                                </select>
                               <div className={`absolute top-1/2 left-3 -translate-y-1/2 w-3 h-3 rounded-full ${formData.healthProfile === 'high_volume' ? 'bg-orange-500' : formData.healthProfile === 'executive' ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                               <ChevronDownIcon className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                           </div>
                       </div>
                       
                        <div className="lg:col-span-1">
                             <MultiSelect 
                                label={t('new_job.assigned_recruiters')}
                                options={mockInternalRecruiters} 
                                selectedIds={formData.assignedRecruiters} 
                                onChange={(ids) => setFormData(prev => ({ ...prev, assignedRecruiters: ids }))}
                                placeholder="בחר רכזים..."
                             />
                        </div>

                         <div className="lg:col-span-1">
                             <MultiSelect 
                                label={t('new_job.account_managers')}
                                options={mockAccountManagers} 
                                selectedIds={formData.assignedAccountManagers} 
                                onChange={(ids) => setFormData(prev => ({ ...prev, assignedAccountManagers: ids }))}
                                placeholder="בחר מנהלי תיק..."
                             />
                        </div>

                       <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.status')}</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                                <option value="טיוטה">טיוטה</option>
                                <option value="פעילה">פעילה</option>
                                <option value="מוקפאת">מוקפאת</option>
                                <option value="מאוישת">מאוישת</option>
                            </select>
                       </div>

                       <div className="lg:col-span-1">
                           <MultiSelect
                               label={t('form.availability')}
                               options={availabilityMultiOptions(availabilityPicklist)}
                               selectedIds={formData.availabilityOptions}
                               onChange={(ids) => setFormData((prev) => ({ ...prev, availabilityOptions: ids }))}
                               placeholder="בחר זמינות מקובלת..."
                           />
                       </div>

                       <div className="lg:col-span-1">
                           <MultiSelect
                               label={t('new_job.job_scope')}
                               options={jobScopeOptions}
                               selectedIds={formData.jobType} 
                               onChange={(ids) => setFormData(prev => ({ ...prev, jobType: ids }))}
                               placeholder="בחר היקף משרה..."
                           />
                       </div>
                       
                       <div className="lg:col-span-1">
                           <PriorityToggle value={formData.priority} onChange={(p) => setFormData(prev => ({ ...prev, priority: p }))} />
                       </div>
                    </div>
                    <TechnicalIdentifiers 
                        jobId={formData.postingCode} 
                        postingCode={formData.postingCode} 
                        uniqueEmail={`humand+${formData.postingCode}@app.hiro.co.il`}
                        creationDate={formData.creationDate}
                        onPostingCodeChange={(value) => setFormData(prev => ({ ...prev, postingCode: value, uniqueEmail: `humand+${value}@app.hiro.co.il` }))}
                        validityDays={formData.validityDays}
                        reScreeningCooldownMonths={formData.reScreeningCooldownMonths}
                        requireOriginalCv={formData.requireOriginalCv}
                        onValidityDaysChange={(n) => setFormData((prev) => ({ ...prev, validityDays: n }))}
                        onReScreeningCooldownMonthsChange={(n) => setFormData((prev) => ({ ...prev, reScreeningCooldownMonths: n }))}
                        onRequireOriginalCvChange={(v) => setFormData((prev) => ({ ...prev, requireOriginalCv: v }))}
                        orgScreeningDefaults={orgScreeningDefaults}
                    />
                </SectionCard>

                <SectionCard id="description-content" title={t('new_job.section_description')} icon={<PencilIcon className="w-5 h-5"/>}>
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.job_title')}</label>
                            <input 
                                type="text" 
                                name="jobTitle" 
                                value={formData.jobTitle} 
                                onChange={handleChange} 
                                placeholder="לדוגמה: מנהל/ת מוצר בכיר/ה" 
                                className={getInputClass('jobTitle', "w-full bg-bg-input border border-border-default text-text-default text-lg font-bold rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-3 transition shadow-sm")} 
                            />
                             <AIIndicator name="jobTitle" />
                        </div>

                        <div className="relative">
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">כותרת פרסום (חיצונית)</label>
                            <input
                                type="text"
                                name="publicJobTitle"
                                value={formData.publicJobTitle}
                                onChange={handleChange}
                                placeholder="כותרת מושכת למועמדים..."
                                className="w-full bg-bg-input border border-border-default text-text-default rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-3 text-sm"
                            />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.job_description')}</label>
                                <RichTextArea
                                    value={formData.jobDescription}
                                    onChange={(html) => setFormData(prev => ({ ...prev, jobDescription: html }))}
                                    placeholder="פירוט תחומי אחריות..."
                                    minHeight="240px"
                                    toolbarClassName="bg-primary-50/70 border-primary-200"
                                    editorClassName="bg-white"
                                    className={getInputClass('jobDescription', 'border-primary-200 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 bg-bg-input')}
                                />
                                <AIIndicator name="jobDescription" />
                            </div>
                            <div className="space-y-4">
                             
                                <div>
                                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('new_job.internal_notes')}</label>
                                    <RichTextArea
                                        value={formData.internalNotes}
                                        onChange={(html) => setFormData(prev => ({ ...prev, internalNotes: html }))}
                                        placeholder="דגשים לצוות הגיוס..."
                                        minHeight="160px"
                                        toolbarClassName="bg-primary-50/70 border-primary-200"
                                        editorClassName="bg-white"
                                        className="border-primary-200 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-200 bg-bg-input"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard id="conditions-reqs" title={t('new_job.section_requirements')} icon={<UserGroupIcon className="w-5 h-5"/>}>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         
                            <div className="lg:col-span-3">
                             <div className="flex items-center justify-between mb-2">
                                <button
                                    type="button"
                                    onClick={() => setIsTagSelectorOpen(true)}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100 hover:bg-primary-100 transition-colors"
                                >
                                    <TagIcon className="w-4 h-4" />
                                    <span>פתח ספריית תגיות</span>
                                </button>
                             </div>
                             <div className="relative mb-3">
                                 <div className="flex items-center gap-2">
                                     <div className="relative flex-grow max-w-md">
                                        
                                        
                                        {isSuggestionsOpen && (suggestions.global.length > 0 || suggestions.company.length > 0) && (
                                            <div className="absolute top-full right-0 w-full mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                                {suggestions.global.length > 0 && (
                                                    <div>
                                                        <div className="px-3 py-1.5 bg-bg-subtle text-xs font-bold text-text-muted border-b border-border-subtle sticky top-0 flex items-center gap-2">
                                                            <GlobeAmericasIcon className="w-3.5 h-3.5"/>
                                                            תגיות מערכת
                                                        </div>
                                                        {suggestions.global.map(tag => (
                                                            <button 
                                                                key={tag.id}
                                                                onClick={() => handleSelectTag(tag, 'global')}
                                                                className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover flex flex-col items-start gap-0.5 border-b border-border-subtle/30 last:border-0"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <SparklesIcon className="w-3.5 h-3.5 text-purple-500"/>
                                                                    <span className="font-bold text-text-default">{tag.name}</span>
                                                                </div>
                                                                {tag.synonyms.length > 0 && (
                                                                    <span className="text-xs text-text-muted truncate w-full">
                                                                        {tag.synonyms.join(', ')}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {suggestions.company.length > 0 && (
                                                    <div>
                                                        <div className="px-3 py-1.5 bg-bg-subtle text-xs font-bold text-text-muted border-b border-border-subtle sticky top-0 flex items-center gap-2">
                                                            <BuildingOffice2Icon className="w-3.5 h-3.5"/>
                                                            תגיות חברה
                                                        </div>
                                                        {suggestions.company.map(tag => (
                                                            <button 
                                                                key={tag.id}
                                                                onClick={() => handleSelectTag(tag, 'company')}
                                                                className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover flex flex-col items-start gap-0.5 border-b border-border-subtle/30 last:border-0"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <BuildingOffice2Icon className="w-3.5 h-3.5 text-blue-500"/>
                                                                    <span className="font-bold text-text-default">{tag.name}</span>
                                                                </div>
                                                                 {tag.synonyms.length > 0 && (
                                                                    <span className="text-xs text-text-muted truncate w-full">
                                                                        {tag.synonyms.join(', ')}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                     </div>
                                  
                                 </div>
                             </div>
                             
                             <div className="space-y-4 pt-2">
                                {formData.skills && formData.skills.length > 0 ? (
                                    groupedJobTags.map((row) => (
                                        <div key={row.id} className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
                                                <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                                                <span>{row.label}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {row.tags.length === 0 ? (
                                                    <span className="text-[11px] text-text-subtle italic">לא קיימות תגיות</span>
                                                ) : (
                                                    row.tags.map((tag) => (
                                                        <SmartTag
                                                            key={tag.id}
                                                            tag={tag}
                                                            onToggle={handleToggleSmartTag}
                                                            onRemove={handleRemoveSmartTag}
                                                        />
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="min-h-[40px] p-2 bg-bg-subtle/30 rounded-lg border border-border-default/50">
                                        <span className="text-text-muted text-sm italic p-1">לא נוספו תגיות.</span>
                                    </div>
                                )}
                             </div>
                             
                         
                         </div>

                         <div className="lg:col-span-3 mt-4 border-t border-border-default pt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">{t('new_job.languages')}</h4>
                             <div className="flex items-end gap-2 mb-3 max-w-md">
                                 <div className="flex-grow">
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">שפה</label>
                                     <input type="text" value={newLanguageName} onChange={(e) => setNewLanguageName(e.target.value)} placeholder="אנגלית" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"/>
                                 </div>
                                  <div className="w-40">
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">רמה</label>
                                     <select value={newLanguageLevel} onChange={(e) => setNewLanguageLevel(e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                         {languageLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                     </select>
                                 </div>
                                 <button type="button" onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 p-2.5 rounded-lg hover:bg-primary-200"><PlusIcon className="w-5 h-5"/></button>
                             </div>
                             <div className="flex flex-wrap gap-2">
                                 {formData.languages && formData.languages.map(lang => (
                                     <span key={lang.id} className="flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded-md text-sm">
                                         {lang.language} - {lang.level}
                                         <button type="button" onClick={() => handleRemoveLanguage(lang.id)} className="text-text-subtle hover:text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                     </span>
                                 ))}
                             </div>
                         </div>

                        <div className="lg:col-span-3 mt-4 border-t border-border-default pt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">{t('new_job.salary_conditions')}</h4>
                             <div className={`bg-bg-subtle/30 p-4 rounded-xl border border-border-default/50 ${aiFilledFields.has('salaryMin') ? 'ring-2 ring-purple-100' : ''}`}>
                                 <div className="relative">
                                    <DoubleRangeSlider 
                                        label="טווח שכר חודשי" 
                                        min={5000} 
                                        max={50000} 
                                        step={500} 
                                        valueMin={formData.salaryMin} 
                                        valueMax={formData.salaryMax} 
                                        onChange={handleChange} 
                                        nameMin="salaryMin" 
                                        nameMax="salaryMax" 
                                        unit="₪" 
                                        includeUnknown={formData.includeUnknownSalary}
                                        onIncludeUnknownChange={(checked) => setFormData(prev => ({...prev, includeUnknownSalary: checked}))}
                                        unknownLabel={t('filter.include_unknown_salary')}
                                        highlight={aiFilledFields.has('salaryMin')}
                                        colorVar="--color-primary-500"
                                    />
                                    <AIIndicator name="salaryMin" />
                                </div>
                                 <div className="mt-4 flex flex-wrap gap-4">
                                     <div className="min-w-[200px] flex-grow max-w-md">
                                        <MultiSelect
                                            label={t('form.driving_license')}
                                            options={drivingLicenseMultiOptions(drivingLicensePicklist)}
                                            selectedIds={formData.drivingLicenses}
                                            onChange={(ids) => setFormData((prev) => ({ ...prev, drivingLicenses: ids }))}
                                            placeholder="ללא דרישה..."
                                        />
                                     </div>
                                     <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('form.mobility')}</label>
                                        <select name="mobility" value={formData.mobility} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 min-w-[150px]">
                                            <option value="">{t('form.mobility_placeholder')}</option>
                                            {mobilityPicklist.map((row) => (
                                                <option key={row.id} value={row.value}>
                                                    {picklistRowLabel(row)}
                                                </option>
                                            ))}
                                        </select>
                                     </div>
                                     <div className={getInputClass('preferredWorkingHours', 'w-full min-w-[200px] max-w-md flex-grow')}>
                                        <WorkingHoursInput
                                            value={formData.preferredWorkingHours || 'גמיש'}
                                            onChange={(v) =>
                                                setFormData((prev) => ({ ...prev, preferredWorkingHours: v }))
                                            }
                                            label={t('form.working_hours')}
                                        />
                                     </div>
                                 </div>
                             </div>
                        </div>

                        <div className="lg:col-span-3 mt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">{t('new_job.demographics')}</h4>
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2">
                                     <span className="text-sm font-semibold text-text-muted">{t('filter.gender')}:</span>
                                     <div className="flex gap-1">
                                         <button type="button" onClick={() => handleGenderChange('male')} className={`p-1.5 rounded-lg border ${formData.gender.includes('male') ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-400'}`}><GenderMaleIcon className="w-5 h-5"/></button>
                                         <button type="button" onClick={() => handleGenderChange('female')} className={`p-1.5 rounded-lg border ${formData.gender.includes('female') ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-white border-gray-200 text-gray-400'}`}><GenderFemaleIcon className="w-5 h-5"/></button>
                                     </div>
                                 </div>
                                  <div className="flex-grow max-w-sm">
                                     <DoubleRangeSlider 
                                        label={t('filter.age_range')}
                                        min={18} 
                                        max={70} 
                                        step={1} 
                                        valueMin={formData.ageMin} 
                                        valueMax={formData.ageMax} 
                                        onChange={handleChange} 
                                        nameMin="ageMin" 
                                        nameMax="ageMax" 
                                        includeUnknown={formData.includeUnknownAge}
                                        onIncludeUnknownChange={(checked) => setFormData(prev => ({...prev, includeUnknownAge: checked}))}
                                        unknownLabel={t('filter.include_unknown_age')}
                                        className="" 
                                        colorVar="--color-secondary-500"
                                    />
                                  </div>
                             </div>
                        </div>
                     </div>
                </SectionCard>
                
                <SectionCard id="distribution" title={t('new_job.section_distribution')} icon={<ShareIcon className="w-5 h-5"/>}>
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                         <div>
                             <h4 className="font-bold text-text-default mb-3 flex items-center justify-between">
                                 <span>{t('new_job.contacts')}</span>
                                 <span className="text-xs font-normal text-text-muted">
                                     {resolvedClientId
                                         ? distributionLoading
                                             ? 'טוען…'
                                             : `${distributionPeople.length} אנשי קשר / משתמשים`
                                         : 'נדרש לקוח מהרשימה'}
                                 </span>
                             </h4>
                             <div className="space-y-2 max-h-60 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/30">
                                 {distributionFetchError && (
                                     <p className="text-sm text-red-600 p-2">{distributionFetchError}</p>
                                 )}
                                 {!resolvedClientId && distributionListBlockedReason && (
                                     <p className="text-sm text-text-muted p-2">{distributionListBlockedReason}</p>
                                 )}
                                 {resolvedClientId && !distributionLoading && !distributionFetchError && distributionPeople.length === 0 && (
                                     <p className="text-sm text-text-muted p-2">אין אנשי קשר או משתמשי פורטל משויכים ללקוח זה.</p>
                                 )}
                                 {distributionPeople.map((person) => (
                                     <label
                                         key={person.key}
                                         className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded cursor-pointer"
                                     >
                                         <input
                                             type="checkbox"
                                             checked={formData.contacts.includes(person.key)}
                                             onChange={() => toggleContact(person.key)}
                                             className="w-4 h-4 text-primary-600 rounded"
                                         />
                                         <div className="flex-grow min-w-0">
                                             <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                                                 <span className="min-w-0 inline-flex items-baseline gap-1.5 flex-wrap">
                                                     <span>{person.name}</span>
                                                     {person.email ? (
                                                         <span
                                                             className="text-[11px] font-normal text-text-muted truncate max-w-[min(100%,14rem)]"
                                                             title={person.email}
                                                         >
                                                             {person.email}
                                                         </span>
                                                     ) : null}
                                                 </span>
                                                 <span
                                                     className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                                         person.kind === 'user'
                                                             ? 'bg-blue-100 text-blue-800'
                                                             : 'bg-bg-subtle text-text-muted'
                                                     }`}
                                                 >
                                                     {person.kind === 'user' ? 'משתמש' : 'איש קשר'}
                                                 </span>
                                             </div>
                                             <div className="text-xs text-text-muted truncate">{person.subtitle}</div>
                                         </div>
                                     </label>
                                 ))}
                             </div>
                         </div>

                         <div>
                             <h4 className="font-bold text-text-default mb-3">{t('new_job.publishing')}</h4>
                             <div className="space-y-2 max-h-60 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/30">
                                 {publishingSourcesLoading ? (
                                     <p className="text-sm text-text-muted p-4 text-center">{t('sources.loading')}</p>
                                 ) : !resolvedClientId ? (
                                     <p className="text-sm text-text-muted p-4 text-center">{t('new_job.publishing_choose_client')}</p>
                                 ) : formData.recruitmentSources.length === 0 ? (
                                     <p className="text-sm text-text-muted p-4 text-center">{t('new_job.publishing_no_active_sources')}</p>
                                 ) : (
                                     formData.recruitmentSources.map(source => (
                                         <SourceRow
                                             key={source.id}
                                             source={source}
                                             onToggleSelect={() => toggleSourceSelection(source.id)}
                                             onStatusChange={(status) => handleSourceStatusChange(source.id, status)}
                                             onAlertChange={(days) => handleSourceAlertChange(source.id, days)}
                                         />
                                     ))
                                 )}
                             </div>
                         </div>
                     </div>
                </SectionCard>

                <SectionCard id="location-settings" title={t('new_job.location')} icon={<MapPinIcon className="w-5 h-5"/>}>
                     <div className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-4 items-end relative">
                             <AIIndicator name="locations" />
                            <div className="flex-grow w-full">
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('filter.location_placeholder')}</label>
                                <LocationSelector
                                    selectedLocations={formData.locations}
                                    onChange={handleLocationsChange}
                                    className="w-full"
                                    summarizeAsCityNames
                                />
                            </div>
                        </div>
                     </div>
                </SectionCard>

                 <SectionCard id="screening" title={t('new_job.section_screening')} icon={<Cog6ToothIcon className="w-5 h-5"/>}>
                     <div className="space-y-6">
                        
                        {/* BLOCK 1: DIGITAL (Knockout) */}
                        <div className="border border-border-default rounded-xl p-4 bg-bg-card transition-all duration-200">
                             <div className="flex items-center justify-between mb-3">
                                 <div>
                                     <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.enableDigitalScreening ? 'bg-primary-100 text-primary-700' : 'bg-bg-subtle text-text-muted'}`}>
                                            <ComputerDesktopIcon className="w-4 h-4" />
                                        </div>
                                         <h4 className="font-bold text-text-default text-lg">שאלון דיגיטלי (אוטומטי)</h4>
                                     </div>
                                     <p className="text-sm text-text-muted mt-1 pr-10">
                                         המועמד יענה מיד לאחר ההגשה. כישלון בשאלת פסילה = דחייה אוטומטית.
                                     </p>
                                 </div>
                                 
                                 {/* Toggle Switch */}
                                 <label className="relative inline-flex items-center cursor-pointer">
                                     <input 
                                         type="checkbox" 
                                         className="sr-only peer" 
                                         checked={formData.enableDigitalScreening}
                                         onChange={(e) => setFormData(prev => ({ ...prev, enableDigitalScreening: e.target.checked }))}
                                     />
                                     <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                                 </label>
                             </div>

                             {formData.enableDigitalScreening && (
                                <div className="animate-fade-in border-t border-border-default pt-4 mt-2">
                                     
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">תבנית שאלון (אופציונלי)</label>
                                        <select 
                                            value={formData.selectedTemplate} 
                                            onChange={(e) => setFormData(prev => ({ ...prev, selectedTemplate: e.target.value }))}
                                            className="w-full sm:w-64 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500"
                                        >
                                            <option value="">ללא תבנית</option>
                                            <option value="general">שאלון כללי</option>
                                            <option value="sales">שאלון מכירות</option>
                                            <option value="tech">שאלון טכנולוגי</option>
                                        </select>
                                    </div>

                                    {/* Replace QuestionsList with mapping of JobQuestionCard */}
                                    <div className="space-y-4">
                                        {formData.digitalQuestions.map((q, index) => (
                                            <JobQuestionCard
                                                key={q.id}
                                                question={q}
                                                index={index}
                                                isLast={index === formData.digitalQuestions.length - 1}
                                                onUpdate={(id, field, value) => handleUpdateQuestion('digital', id, field, value)}
                                                onRemove={(id) => handleRemoveQuestion('digital', id)}
                                                onToggleExpand={(id) => handleToggleExpandQuestion('digital', id)}
                                                isExpanded={q.isExpanded || false}
                                                onMove={(id, direction) => handleMoveQuestion('digital', id, direction)}
                                                isFirst={index === 0}
                                            />
                                        ))}
                                        <button 
                                            type="button" 
                                            onClick={() => handleAddQuestionCard('digital')} 
                                            className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition"
                                        >
                                            <PlusIcon className="w-5 h-5" />
                                            <span>הוסף שאלה חדשה</span>
                                        </button>
                                    </div>
                                </div>
                             )}
                        </div>

                        {/* BLOCK 2: MANUAL (Phone Script) */}
                        <div className="border border-border-default rounded-xl p-4 bg-bg-card transition-all duration-200">
                             <div className="flex items-center justify-between mb-3">
                                 <div>
                                     <div className="flex items-center gap-2">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${formData.enableManualScreening ? 'bg-primary-100 text-primary-700' : 'bg-bg-subtle text-text-muted'}`}>
                                            <PhoneIcon className="w-4 h-4" />
                                        </div>
                                         <h4 className="font-bold text-text-default text-lg">שאלון ידני (תסריט שיחה)</h4>
                                     </div>
                                     <p className="text-sm text-text-muted mt-1 pr-10">
                                         יוצג לרכז/ת בזמן שיחה טלפונית לתיעוד תשובות המועמד.
                                     </p>
                                 </div>
                                 
                                 {/* Toggle Switch */}
                                 <label className="relative inline-flex items-center cursor-pointer">
                                     <input 
                                         type="checkbox" 
                                         className="sr-only peer" 
                                         checked={formData.enableManualScreening}
                                         onChange={(e) => setFormData(prev => ({ ...prev, enableManualScreening: e.target.checked }))}
                                     />
                                     <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                                 </label>
                             </div>

                             {formData.enableManualScreening && (
                                <div className="animate-fade-in border-t border-border-default pt-4 mt-2">
                                    <div className="space-y-2">
                                        {/* Simple List View for Manual Questions */}
                                        {formData.telephoneQuestions.map((q, index) => (
                                            <div key={q.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-border-default shadow-sm hover:border-primary-300 transition-colors group">
                                                 <div className="flex items-center gap-3">
                                                    <span className="text-sm font-bold text-text-muted">#{index + 1}</span>
                                                    <span className="text-sm font-medium text-text-default">{q.text || <span className="text-text-subtle italic">שאלה ללא כותרת...</span>}</span>
                                                     {q.disqualifyIfWrong && (
                                                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">
                                                            <ExclamationTriangleIcon className="w-3 h-3"/>
                                                            {q.disqualificationReason}
                                                        </span>
                                                     )}
                                                 </div>
                                                 <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                     <button 
                                                        onClick={() => handleOpenManualEdit(q)}
                                                        className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-bg-subtle rounded-lg transition-colors"
                                                     >
                                                         <PencilIcon className="w-4 h-4"/>
                                                     </button>
                                                     <button 
                                                        onClick={() => handleRemoveQuestion('manual', q.id)}
                                                        className="p-1.5 text-text-subtle hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                     >
                                                         <TrashIcon className="w-4 h-4"/>
                                                     </button>
                                                 </div>
                                            </div>
                                        ))}

                                         <button 
                                            type="button" 
                                            onClick={() => handleOpenManualEdit()} 
                                            className="w-full flex items-center justify-center gap-2 bg-primary-50 text-primary-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-primary-100 border border-dashed border-primary-200 transition-colors mt-2"
                                        >
                                            <PlusIcon className="w-4 h-4" />
                                            <span>הוסף שאלה לתסריט</span>
                                        </button>
                                    </div>
                                </div>
                             )}
                        </div>

                     </div>
                 </SectionCard>
            </div>
            
            <EditManualQuestionModal 
                isOpen={manualEditState.isOpen}
                onClose={() => setManualEditState({ isOpen: false, question: null })}
                onSave={handleSaveManualQuestion}
                question={manualEditState.question}
            />

            <div className="sticky bottom-0 z-30 p-4 bg-bg-card border-t border-border-default flex justify-between items-center -mx-4 md:mx-0 rounded-b-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="text-xs text-text-muted space-y-1">
                    <p>* שינויים נשמרים בטיוטה</p>
                    {!isJobFieldComplete(formData.jobField) && (
                        <p className="text-amber-700 font-medium">{t('new_job.job_field_required_hint')}</p>
                    )}
                </div>
                <div className="flex flex-col-reverse gap-2 md:flex-row md:items-center md:gap-3">
                    {saveMessage && (
                        <div className="text-xs text-green-600 max-w-sm">
                            {saveMessage}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleSaveAndContinue}
                        disabled={isSaving || !isJobFieldComplete(formData.jobField)}
                        className={`bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md ${
                            isSaving || !isJobFieldComplete(formData.jobField) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {'פרסום משרה'}
                    </button>
                    <button
                        type="button"
                        onClick={handleJustSave}
                        disabled={isSaving || !isJobFieldComplete(formData.jobField)}
                        className={`bg-bg-subtle text-text-default font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover border border-border-default transition ${
                            isSaving || !isJobFieldComplete(formData.jobField) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                    >
                        {isSaving ? 'שומר...' : 'שמור'}
                    </button>
                    {/* Ensure floating AI button (z-40) is not covered. This bar is z-30. */}
                </div>
            </div>
        <TagSelectorModal
            isOpen={isTagSelectorOpen}
            onClose={() => setIsTagSelectorOpen(false)}
            existingTags={(formData.skills || []).map((s) => s.key || s.name)}
            initialCategory="all"
            onSave={(selected: GlobalTagOption[]) => {
                        const existingKeys = new Set((formData.skills || []).map((s) => s.key || s.name));
                const newTags: JobSkill[] = selected
                    .filter((t) => !existingKeys.has(t.id))
                    .map((t) => ({
                        id: t.id,
                        name: t.nameHe || t.nameEn,
                        key: t.tagKey || t.nameEn || t.nameHe,
                        mode: 'normal',
                        source: 'global',
                        tagType: ((): SmartTagType => {
                            const cat = t.category;
                            if (cat === 'role') return 'role';
                            if (cat === 'seniority') return 'seniority';
                            if (cat === 'industry') return 'industry';
                            if (cat === 'certification' || cat === 'education') return 'certification';
                            if (cat === 'language') return 'language';
                            if (cat === 'tool') return 'tool';
                            if (cat === 'soft_skill') return 'soft';
                            return 'skill';
                        })(),
                    }));
                setFormData((prev) => ({
                    ...prev,
                    skills: [...(prev.skills || []), ...newTags],
                }));
                setIsTagSelectorOpen(false);
            }}
        />
        </div>
    );
};

export default NewJobView;
