
import React, { useId, useState, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import AccordionSection from './AccordionSection';
import ContentNavBar from './ContentNavBar';
import { ClipboardDocumentCheckIcon, TagIcon, PencilIcon, CalendarDaysIcon, AcademicCapIcon, LanguageIcon, WalletIcon, ChatBubbleOvalLeftEllipsisIcon, EnvelopeIcon, MapPinIcon, PlusIcon, TrashIcon, BriefcaseIcon, LockClosedIcon, XMarkIcon } from './Icons';
import WorkExperienceSection from './WorkExperienceSection';
import { TagInput } from './TagInput';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import { FormMultiSelect } from './FormMultiSelect';
import { useLanguage } from '../context/LanguageContext';
import { buildCandidateFullName } from '../utils/candidateName';
import {
    fetchPicklistValuesByKey,
    JOB_SCOPE_PICKLIST_KEY,
    WORK_MODEL_PICKLIST_KEY,
    WORK_MODEL_PREFERRED_FALLBACK,
    EMPLOYMENT_TYPE_PICKLIST_KEY,
    EMPLOYMENT_TYPE_FALLBACK,
    JOB_SCOPE_MULTI_FALLBACK,
    picklistRowLabel,
    type PicklistValueRow,
} from '../services/picklistValuesApi';

const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; required?: boolean; type?: string; icon?: React.ReactNode }> = ({ label, name, value, onChange, required, type = "text", icon }) => {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="flex items-center text-sm font-semibold text-text-muted mb-1">
                {label} {required && <span className="text-red-500 mr-1">*</span>}
                {icon && <span className="text-gray-400 mr-2">{icon}</span>}
            </label>
            <input id={id} type={type} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"/>
        </div>
    );
};

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, name, value, onChange, children }) => {
    const id = useId();
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-semibold text-text-muted mb-1">{label}</label>
            <select id={id} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                {children}
            </select>
        </div>
    );
};

const SkillSlider: React.FC<{ label: string; level: number, levelText: string; onChange: (level: number) => void }> = ({ label, level, levelText, onChange }) => (
    <div>
        <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-text-muted">{label}</label>
            <span className="text-sm font-semibold text-primary-600">{levelText}</span>
        </div>
        <div className="relative pt-1">
            <input type="range" min="1" max="100" value={level} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500" />
        </div>
    </div>
);

const Tag: React.FC<{ children: React.ReactNode; onRemove: () => void; }> = ({ children, onRemove }) => (
    <span className="flex items-center bg-primary-100 text-primary-800 text-sm font-medium pl-3 pr-2 py-1 rounded-full">
        {children}
        <button onClick={onRemove} className="mr-1.5 text-primary-500 hover:text-primary-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    </span>
);

interface MainContentProps {
    formData: any;
    onFormChange: (updatedData: any) => void;
    onImmediateSave?: (patch: any) => void;
    onInternalTagsChange?: (tags: string[]) => void;
    viewMode?: 'recruiter' | 'candidate';
}

const formatCurrency = (value: number | null | undefined) => {
    if (value === undefined || value === null) return '';
    if (Number.isNaN(value)) return '';
    return value.toLocaleString();
};

const salaryDisplayText = (min?: number | null, max?: number | null) => {
    const formattedMin = formatCurrency(min);
    const formattedMax = formatCurrency(max);
    if (!formattedMin && !formattedMax) return <span className="text-text-muted">לא צוין</span>;
    if (formattedMin && formattedMax && formattedMin === formattedMax) {
        return <span className="text-primary-600 text-2xl">{formattedMin} ₪</span>;
    }
    return (
        <>
            {formattedMin && (
                <>
                    <span className="text-text-muted">מ-</span>
                    <span className="text-primary-600">{formattedMin} ₪</span>
                </>
            )}
            {formattedMin && formattedMax && <span className="text-text-muted">עד-</span>}
            {formattedMax && <span className="text-primary-600">{formattedMax} ₪</span>}
        </>
    );
};

const formatEducationEntry = (entry: any) => {
    if (typeof entry === 'string') return entry;
    if (entry == null) return '';
    if (Array.isArray(entry)) return entry.join(' • ');
    if (typeof entry === 'object') {
        const parts = [];
        if (entry.degree) parts.push(entry.degree);
        if (entry.institution) parts.push(entry.institution);
        if (entry.year) parts.push(entry.year);
        return parts.filter(Boolean).join(' • ') || JSON.stringify(entry);
    }
    return String(entry);
};

const getLevelText = (level: number): string => {
    if (level >= 90) return "שפת אם / מעולה";
    if (level >= 70) return "טוב מאוד";
    if (level >= 50) return "טוב";
    if (level >= 30) return "בסיסי";
    return "חלש";
};

const HEBREW_MONTH_TO_NUM: Record<string, number> = {
    ינואר: 1,
    פברואר: 2,
    מרץ: 3,
    אפריל: 4,
    מאי: 5,
    יוני: 6,
    יולי: 7,
    אוגוסט: 8,
    ספטמבר: 9,
    אוקטובר: 10,
    נובמבר: 11,
    דצמבר: 12,
};

const HEBREW_MONTH_LABELS = [
    'ינואר',
    'פברואר',
    'מרץ',
    'אפריל',
    'מאי',
    'יוני',
    'יולי',
    'אוגוסט',
    'ספטמבר',
    'אוקטובר',
    'נובמבר',
    'דצמבר',
];

const normalizeBirthYear = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null;
};

const normalizeBirthMonthNum = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim();
    const n = parseInt(s, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
    const he = HEBREW_MONTH_TO_NUM[s];
    if (he != null) return he;
    return null;
};

const normalizeBirthDayNum = (raw: unknown): number | null => {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw).trim(), 10);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

/** Age from birth fields: uses full date when month (and ideally day) exist; otherwise year difference only. */
const computeAgeFromBirth = (birthYear: unknown, birthMonth: unknown, birthDay: unknown): string => {
    const y = normalizeBirthYear(birthYear);
    if (y == null) return '';
    const mNum = normalizeBirthMonthNum(birthMonth);
    const dNum = normalizeBirthDayNum(birthDay);
    const now = new Date();
    if (mNum == null && dNum == null) {
        const a = now.getFullYear() - y;
        return a >= 0 && a <= 130 ? String(a) : '';
    }
    const month = mNum ?? 1;
    const day = dNum ?? 1;
    const birth = new Date(y, month - 1, day);
    if (Number.isNaN(birth.getTime())) return '';
    let age = now.getFullYear() - birth.getFullYear();
    const md = now.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
    if (age < 0 || age > 130) return '';
    return String(age);
};

const DRIVING_LICENSE_PICKLIST_KEY = 'driving_license';
const GENDER_PICKLIST_KEY = 'gender';
const MOBILITY_PICKLIST_KEY = 'mobility';

type PicklistRow = PicklistValueRow;

const MainContent: React.FC<MainContentProps> = ({
    formData,
    onFormChange,
    onImmediateSave,
    onInternalTagsChange,
    viewMode = 'recruiter',
}) => {
    const { t } = useLanguage();
    const innerSummaryId = useId();
    const recruiterNotesId = useId();
    const candidateNotesId = useId();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [drivingLicenseOptions, setDrivingLicenseOptions] = useState<PicklistRow[]>([]);
    const [genderOptions, setGenderOptions] = useState<PicklistRow[]>([]);
    const [mobilityOptions, setMobilityOptions] = useState<PicklistRow[]>([]);
    const [jobScopePicklistRaw, setJobScopePicklistRaw] = useState<PicklistRow[]>([]);
    const [workModelPicklistRaw, setWorkModelPicklistRaw] = useState<PicklistRow[]>([]);
    const [employmentTypePicklistRaw, setEmploymentTypePicklistRaw] = useState<PicklistRow[]>([]);

    useEffect(() => {
        if (!apiBase) return;
        let cancelled = false;
        void (async () => {
            const [dl, g, mob, js, wm, et] = await Promise.all([
                fetchPicklistValuesByKey(apiBase, DRIVING_LICENSE_PICKLIST_KEY),
                fetchPicklistValuesByKey(apiBase, GENDER_PICKLIST_KEY),
                fetchPicklistValuesByKey(apiBase, MOBILITY_PICKLIST_KEY),
                fetchPicklistValuesByKey(apiBase, JOB_SCOPE_PICKLIST_KEY),
                fetchPicklistValuesByKey(apiBase, WORK_MODEL_PICKLIST_KEY),
                fetchPicklistValuesByKey(apiBase, EMPLOYMENT_TYPE_PICKLIST_KEY),
            ]);
            if (cancelled) return;
            setDrivingLicenseOptions(dl);
            setGenderOptions(g);
            setMobilityOptions(mob);
            setJobScopePicklistRaw(js);
            setWorkModelPicklistRaw(wm);
            setEmploymentTypePicklistRaw(et);
        })();
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    const jobScopeMultiRows = useMemo(
        () => (jobScopePicklistRaw.length > 0 ? jobScopePicklistRaw : JOB_SCOPE_MULTI_FALLBACK),
        [jobScopePicklistRaw],
    );
    const jobScopeMultiSelectOptions = useMemo(
        () => jobScopeMultiRows.map((v) => ({ value: v.value, label: picklistRowLabel(v) })),
        [jobScopeMultiRows],
    );

    const preferredWorkModelRows = useMemo(
        () => (workModelPicklistRaw.length > 0 ? workModelPicklistRaw : WORK_MODEL_PREFERRED_FALLBACK),
        [workModelPicklistRaw],
    );
    const preferredWorkModelSelectOptions = useMemo(
        () => preferredWorkModelRows.map((v) => ({ value: v.value, label: picklistRowLabel(v) })),
        [preferredWorkModelRows],
    );

    const employmentTypeRows = useMemo(
        () => (employmentTypePicklistRaw.length > 0 ? employmentTypePicklistRaw : EMPLOYMENT_TYPE_FALLBACK),
        [employmentTypePicklistRaw],
    );
    const employmentTypeSelectOptions = useMemo(
        () => employmentTypeRows.map((v) => ({ value: v.value, label: picklistRowLabel(v) })),
        [employmentTypeRows],
    );

    const drivingLicenseCurrent = formData.drivingLicense != null ? String(formData.drivingLicense) : '';

    const genderValueSet = useMemo(() => new Set(genderOptions.map((o) => o.value)), [genderOptions]);
    const genderCurrent = formData.gender != null ? String(formData.gender) : '';
    const genderUnknown = genderCurrent !== '' && !genderValueSet.has(genderCurrent);

    const mobilityValueSet = useMemo(() => new Set(mobilityOptions.map((o) => o.value)), [mobilityOptions]);
    const mobilityCurrent = formData.mobility != null ? String(formData.mobility) : '';
    const mobilityUnknown = mobilityCurrent !== '' && !mobilityValueSet.has(mobilityCurrent);

    const birthYearChoices = useMemo(() => {
        const y = new Date().getFullYear();
        const arr: number[] = [];
        for (let i = 0; i <= 100; i++) arr.push(y - i);
        return arr;
    }, []);

    const birthYearStr = formData.birthYear != null ? String(formData.birthYear).trim() : '';
    const birthYearNum = normalizeBirthYear(formData.birthYear);
    const birthYearInList = birthYearNum != null && birthYearChoices.includes(birthYearNum);

    const birthMonthRaw = formData.birthMonth != null ? String(formData.birthMonth).trim() : '';
    const birthMonthNum = normalizeBirthMonthNum(formData.birthMonth);
    const birthMonthSelectValue = birthMonthNum != null ? String(birthMonthNum) : birthMonthRaw;

    const birthDayRaw = formData.birthDay != null ? String(formData.birthDay).trim() : '';
    const birthDayNum = normalizeBirthDayNum(formData.birthDay);
    const birthDaySelectValue = birthDayNum != null ? String(birthDayNum) : birthDayRaw;

    const computedAge = useMemo(
        () => computeAgeFromBirth(formData.birthYear, formData.birthMonth, formData.birthDay),
        [formData.birthYear, formData.birthMonth, formData.birthDay],
    );
    const ageDisplayValue =
        formData.age != null && String(formData.age).trim() !== '' ? String(formData.age) : computedAge;

    // States for new item inputs
    const [newLanguageName, setNewLanguageName] = useState('');
    const [newEducation, setNewEducation] = useState('');
    const [editingEducation, setEditingEducation] = useState<{id: number, value: string} | null>(null);
    const [newSoftSkill, setNewSoftSkill] = useState('');
    const [newTechSkill, setNewTechSkill] = useState({ name: '', level: 50 });
    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
        if (typeof window === 'undefined') return null;
        let el: HTMLElement | null = node;
        while (el) {
            const style = window.getComputedStyle(el);
            const oy = style.overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
            el = el.parentElement;
        }
        return (document.scrollingElement as HTMLElement | null) || null;
    };

    const updateFormPreserveScroll = (next: any, origin?: EventTarget | null) => {
        const originEl = origin instanceof HTMLElement ? origin : null;
        const scrollEl =
            // Prefer the nearest scroll container to the edited input
            getScrollParent(originEl) ||
            // Fallback to the recruiter main container if present
            (typeof document !== 'undefined' ? (document.getElementById('main-scroll-container') as HTMLElement | null) : null);

        const prevTop = scrollEl ? scrollEl.scrollTop : null;
        flushSync(() => {
            onFormChange(next);
        });
        if (scrollEl && prevTop !== null) {
            scrollEl.scrollTop = prevTop;
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        updateFormPreserveScroll({ ...formData, [name]: value }, e.target);
    };

    const handleNamePartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const next: Record<string, unknown> = { ...formData, [name]: value };
        if (name === 'firstName' || name === 'lastName') {
            const fn = name === 'firstName' ? value : String(formData.firstName ?? '');
            const ln = name === 'lastName' ? value : String(formData.lastName ?? '');
            next.fullName = buildCandidateFullName(fn, ln);
        }
        updateFormPreserveScroll(next, e.target);
    };

    const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const numericValue = parseInt(value, 10);
        let newMin = formData.salaryMin;
        let newMax = formData.salaryMax;
        const maxRange = 2000;

        if (name === 'salaryMin') {
            newMin = numericValue;
            if (newMin > newMax) {
                newMax = newMin; // If min goes past max, they become equal
            } else if (newMax - newMin > maxRange) {
                newMax = newMin + maxRange; // If range exceeds max, pull max closer
            }
        } else if (name === 'salaryMax') {
            newMax = numericValue;
            if (newMax < newMin) {
                newMin = newMax; // If max goes below min, they become equal
            } else if (newMax - newMin > maxRange) {
                newMin = newMax - maxRange; // If range exceeds max, push min up
            }
        }
        
        updateFormPreserveScroll({ ...formData, salaryMin: newMin, salaryMax: newMax }, e.target);
    };

    // --- Language Handlers ---
    const handleLanguageLevelChange = (id: number, newLevel: number) => {
        const updatedLanguages = formData.languages.map((lang: any) => 
            lang.id === id ? { ...lang, level: newLevel, levelText: getLevelText(newLevel) } : lang
        );
        onFormChange({ ...formData, languages: updatedLanguages });
    };

    const handleAddLanguage = () => {
        if (newLanguageName.trim()) {
            const newLang = { id: Date.now(), name: newLanguageName, level: 50, levelText: getLevelText(50) };
            onFormChange({ ...formData, languages: [...formData.languages, newLang] });
            setNewLanguageName('');
        }
    };
    
    const handleRemoveLanguage = (id: number) => {
        onFormChange({ ...formData, languages: formData.languages.filter((lang: any) => lang.id !== id) });
    };

    // --- Education Handlers ---
    const handleAddEducation = () => {
        if (newEducation.trim()) {
            const newEdu = { id: Date.now(), value: newEducation };
            onFormChange({ ...formData, education: [...formData.education, newEdu] });
            setNewEducation('');
        }
    };

    const handleRemoveEducation = (id: number) => {
        onFormChange({ ...formData, education: formData.education.filter((edu: any) => edu.id !== id) });
    };

    const handleUpdateEducation = () => {
        if (editingEducation) {
            onFormChange({ ...formData, education: formData.education.map((edu: any) => edu.id === editingEducation.id ? editingEducation : edu) });
            setEditingEducation(null);
        }
    };
    
    // --- Soft Skills Handlers ---
    const handleAddSoftSkill = () => {
        const incoming = newSoftSkill.trim();
        const current = Array.isArray(formData.softSkills) ? formData.softSkills : [];
        if (incoming && !current.includes(incoming)) {
            const updated = [...current, incoming];
            onFormChange({ ...formData, softSkills: updated, skills: { ...(formData.skills || {}), soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
            onImmediateSave?.({ softSkills: updated, skills: { soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
            setNewSoftSkill('');
        }
    };
    const handleRemoveSoftSkill = (skillToRemove: string) => {
        const current = Array.isArray(formData.softSkills) ? formData.softSkills : [];
        const updated = current.filter((skill: string) => skill !== skillToRemove);
        onFormChange({ ...formData, softSkills: updated, skills: { ...(formData.skills || {}), soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
        onImmediateSave?.({ softSkills: updated, skills: { soft: updated, technical: formData.skills?.technical || formData.techSkills || [] } });
    };

    // --- Tech Skills Handlers ---
    const handleTechSkillLevelChange = (id: number, newLevel: number) => {
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        const updatedSkills = current.map((skill: any) => 
            skill.id === id ? { ...skill, level: newLevel, levelText: getLevelText(newLevel) } : skill
        );
        onFormChange({ ...formData, techSkills: updatedSkills, skills: { ...(formData.skills || {}), technical: updatedSkills, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updatedSkills, skills: { technical: updatedSkills, soft: formData.skills?.soft || formData.softSkills || [] } });
    };

    const handleAddTechSkill = () => {
        const name = newTechSkill.name.trim();
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        if (!name) return;
        const newSkill = { ...newTechSkill, name, id: Date.now(), levelText: getLevelText(newTechSkill.level) };
        const updated = [...current, newSkill];
        onFormChange({ ...formData, techSkills: updated, skills: { ...(formData.skills || {}), technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updated, skills: { technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
            setNewTechSkill({ name: '', level: 50 });
    };
    
    const handleRemoveTechSkill = (id: number) => {
        const current = Array.isArray(formData.techSkills) ? formData.techSkills : [];
        const updated = current.filter((skill: any) => skill.id !== id);
        onFormChange({ ...formData, techSkills: updated, skills: { ...(formData.skills || {}), technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
        onImmediateSave?.({ techSkills: updated, skills: { technical: updated, soft: formData.skills?.soft || formData.softSkills || [] } });
    };
    
    const handleWorkExperienceChange = (newExperience: any) => {
        onFormChange({ ...formData, workExperience: newExperience });
    };


    return (
        <div className="space-y-6">
            {viewMode === 'recruiter' && <ContentNavBar />}
            
            {viewMode === 'recruiter' && (
                <div id="inner-summary">
                    <AccordionSection title={t('section.inner_summary')} icon={<ClipboardDocumentCheckIcon className="w-5 h-5" />} defaultOpen>
                        <label htmlFor={innerSummaryId} className="sr-only">
                            {t('section.inner_summary')}
                        </label>
                        <textarea
                            id={innerSummaryId}
                            className="w-full h-32 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                            placeholder={t('section.inner_summary_placeholder')}
                            value={formData.internalNotes || ''}
                            onChange={(e) => onFormChange({ ...formData, internalNotes: e.target.value })}
                        />
                    </AccordionSection>
                </div>
            )}

            <div id="personal-details">
                <AccordionSection title={t('section.personal_details')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormInput
                            label={t('form.first_name')}
                            name="firstName"
                            value={formData.firstName ?? ''}
                            onChange={handleNamePartChange}
                            required
                        />
                        <FormInput
                            label={t('form.last_name')}
                            name="lastName"
                            value={formData.lastName ?? ''}
                            onChange={handleNamePartChange}
                            required
                        />
                        {viewMode === 'recruiter' && <FormSelect label={t('form.status')} name="status" value={formData.status} onChange={handleInputChange}><option>חדש</option><option>עבר בדיקה ראשונית</option></FormSelect>}
                        <FormInput label={t('form.phone')} name="phone" value={formData.phone} onChange={handleInputChange} required />
                        <FormInput label={t('form.email')} name="email" value={formData.email} onChange={handleInputChange} type="email" icon={<EnvelopeIcon className="w-4 h-4" />}/>
                        <FormInput label={t('form.address')} name="address" value={formData.address} onChange={handleInputChange} required icon={<MapPinIcon className="w-4 h-4" />} />
                        <FormInput label={t('form.id_number')} name="idNumber" value={formData.idNumber} onChange={handleInputChange} />

                        <FormSelect
                            label={t('form.gender')}
                            name="gender"
                            value={genderCurrent}
                            onChange={handleInputChange}
                        >
                            <option value="">-</option>
                            {genderUnknown && <option value={genderCurrent}>{genderCurrent}</option>}
                            {genderOptions.map((v) => (
                                <option key={v.id || v.value} value={v.value}>
                                    {(v.displayName || v.label).trim() || v.value}
                                </option>
                            ))}
                        </FormSelect>

                        <FormMultiSelect
                            label={t('form.driving_license')}
                            options={drivingLicenseOptions.map((v) => ({
                                value: v.value,
                                label: (v.displayName || v.label).trim() || v.value,
                            }))}
                            value={
                                Array.isArray(formData.drivingLicenses) && formData.drivingLicenses.length > 0
                                    ? formData.drivingLicenses.map(String)
                                    : drivingLicenseCurrent && drivingLicenseCurrent !== '-'
                                      ? [drivingLicenseCurrent]
                                      : []
                            }
                            onChange={(next) => {
                                updateFormPreserveScroll({
                                    ...formData,
                                    drivingLicenses: next,
                                    drivingLicense: next[0] || '',
                                });
                                onImmediateSave?.({ drivingLicenses: next, drivingLicense: next[0] || '' });
                            }}
                            placeholder="בחר"
                        />

                        <FormSelect
                            label={t('form.mobility')}
                            name="mobility"
                            value={mobilityCurrent}
                            onChange={handleInputChange}
                        >
                            <option value="-"></option>
                            {mobilityOptions.map((v) => (
                                <option key={v.id || v.value} value={v.value}>
                                    {(v.displayName || v.label).trim() || v.value}
                                </option>
                            ))}
                        </FormSelect>

                        <FormMultiSelect
                            label={t('form.preferred_work_model')}
                            options={preferredWorkModelSelectOptions}
                            value={Array.isArray(formData.preferredWorkModels) ? formData.preferredWorkModels.map(String) : []}
                            onChange={(next) => {
                                updateFormPreserveScroll({ ...formData, preferredWorkModels: next });
                                onImmediateSave?.({ preferredWorkModels: next });
                            }}
                            placeholder="בחר"
                        />

                        {/* סוג תעסוקה רצוי / היקף משרה: אותו גריד כמו פרטים אישיים (פיקליסטים employment_type, job_scope) */}
                        <FormMultiSelect
                            label={t('form.employment_type')}
                            options={employmentTypeSelectOptions}
                            value={
                                Array.isArray(formData.employmentTypes) && formData.employmentTypes.length > 0
                                    ? formData.employmentTypes.map(String)
                                    : formData.employmentType
                                      ? [String(formData.employmentType)]
                                      : ['']
                            }
                            onChange={(next) => {
                                const normalized = next.length ? next : [''];
                                updateFormPreserveScroll({
                                    ...formData,
                                    employmentTypes: normalized,
                                    employmentType: normalized[0] || '',
                                });
                                onImmediateSave?.({
                                    employmentTypes: normalized,
                                    employmentType: normalized[0] || '',
                                });
                            }}
                            placeholder="בחר"
                        />
                        <FormMultiSelect
                            label={t('form.job_scope')}
                            options={jobScopeMultiSelectOptions}
                            value={
                                Array.isArray(formData.jobScopes) && formData.jobScopes.length > 0
                                    ? formData.jobScopes.map(String)
                                    : formData.jobScope
                                      ? [String(formData.jobScope)]
                                      : []
                            }
                            onChange={(next) => {
                                updateFormPreserveScroll({
                                    ...formData,
                                    jobScopes: next,
                                    jobScope: next[0] || '',
                                });
                                onImmediateSave?.({ jobScopes: next, jobScope: next[0] || '' });
                            }}
                            placeholder="בחר"
                        />

                        <div id="preferences">
                            <FormSelect
                                label={t('form.availability')}
                                name="availability"
                                value={formData.availability}
                                onChange={handleInputChange}
                            >
                                <option>בחר</option>
                                <option value="🟢 מיידי (זמין לעבודה מיד).">🟢 מיידי (זמין לעבודה מיד).</option>
                                <option value="🟡 חודש הודעה (עובד, מחפש אקטיבית).">
                                    🟡 חודש הודעה (עובד, מחפש אקטיבית).
                                </option>
                                <option value="🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).">
                                    🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).
                                </option>
                                <option value="🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).">
                                    🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).
                                </option>
                            </FormSelect>
                        </div>
                    </div>
                </AccordionSection>
            </div>

            <div id="salary">
                <AccordionSection title={t('section.salary')} icon={<WalletIcon className="w-5 h-5"/>} defaultOpen>
            <div className="p-4 space-y-4">
                        <div className="flex justify-center items-center text-lg font-bold space-x-4">
                            {salaryDisplayText(formData.salaryMin, formData.salaryMax)}
                        </div>
                        <div className="relative h-8 flex items-center">
                            <div className="absolute w-full h-1.5 bg-bg-subtle rounded-full">
                                <div
                                    className="absolute h-1.5 bg-primary-500 rounded-full"
                                    style={{
                                        right: `${((formData.salaryMin - 5000) / 45000) * 100}%`,
                                        left: `${100 - ((formData.salaryMax - 5000) / 45000) * 100}%`
                                    }}
                                ></div>
                            </div>
                            <input
                                type="range"
                                min="5000"
                                max="50000"
                                step="1000"
                                value={formData.salaryMin}
                                name="salaryMin"
                                onChange={handleSalaryChange}
                                className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                             <input
                                type="range"
                                min="5000"
                                max="50000"
                                step="1000"
                                value={formData.salaryMax}
                                name="salaryMax"
                                onChange={handleSalaryChange}
                                className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                            />
                        </div>
                     </div>
                </AccordionSection>
            </div>

            <div id="work-experience">
                <AccordionSection title={t('section.work_experience')} icon={<BriefcaseIcon className="w-5 h-5"/>} defaultOpen>
                    <WorkExperienceSection 
                        experience={Array.isArray(formData.workExperience) ? formData.workExperience : []}
                        onExperienceChange={handleWorkExperienceChange}
                    />
                </AccordionSection>
            </div>
            
            

            <div id="birth-date">
                <AccordionSection title={t('section.birth_date')} icon={<CalendarDaysIcon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <FormSelect
                            label={t('form.birth_year')}
                            name="birthYear"
                            value={birthYearStr}
                            onChange={handleInputChange}
                        >
                            <option value="">-</option>
                            {birthYearStr !== '' && !birthYearInList ? (
                                <option value={birthYearStr}>{birthYearStr}</option>
                            ) : null}
                            {birthYearChoices.map((y) => (
                                <option key={y} value={String(y)}>
                                    {y}
                                </option>
                            ))}
                        </FormSelect>
                        <FormSelect
                            label={t('form.birth_month')}
                            name="birthMonth"
                            value={birthMonthSelectValue}
                            onChange={handleInputChange}
                        >
                            <option value="">-</option>
                            {birthMonthRaw !== '' && birthMonthNum == null ? (
                                <option value={birthMonthRaw}>{birthMonthRaw}</option>
                            ) : null}
                            {HEBREW_MONTH_LABELS.map((label, idx) => (
                                <option key={label} value={String(idx + 1)}>
                                    {label}
                                </option>
                            ))}
                        </FormSelect>
                        <FormSelect
                            label={t('form.birth_day')}
                            name="birthDay"
                            value={birthDaySelectValue}
                            onChange={handleInputChange}
                        >
                            <option value="">-</option>
                            {birthDayRaw !== '' && birthDayNum == null ? (
                                <option value={birthDayRaw}>{birthDayRaw}</option>
                            ) : null}
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                <option key={d} value={String(d)}>
                                    {d}
                                </option>
                            ))}
                        </FormSelect>
                        <FormInput
                            label={t('form.age')}
                            name="age"
                            value={ageDisplayValue}
                            onChange={handleInputChange}
                        />
                    </div>
                </AccordionSection>
            </div>
            
            <div id="languages">
                <AccordionSection title={t('section.languages')} icon={<LanguageIcon className="w-5 h-5"/>} defaultOpen>
                     <div className="space-y-4">
                        {formData.languages?.map((lang: any) => (
                            <div key={lang.id} className="flex items-center gap-4">
                                <div className="flex-grow">
                                    <SkillSlider label={lang.name} level={lang.level} levelText={lang.levelText} onChange={(level) => handleLanguageLevelChange(lang.id, level)} />
                                </div>
                                <button onClick={() => handleRemoveLanguage(lang.id)} className="p-2 text-text-subtle hover:text-red-500 rounded-full hover:bg-red-50">
                                    <TrashIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        ))}
                        <div className="flex items-end gap-2 pt-4 border-t border-border-default">
                             <div className="flex-grow">
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('form.add_language')}</label>
                                <input type="text" placeholder="לדוגמה: ספרדית" value={newLanguageName} onChange={e => setNewLanguageName(e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"/>
                            </div>
                            <button onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                        </div>
                     </div>
                </AccordionSection>
            </div>
            

            <div id="education">
                <AccordionSection title={t('section.education')} icon={<AcademicCapIcon className="w-5 h-5"/>} defaultOpen>
                     <div className="space-y-3">
                       {formData.education?.map((edu: any, idx: number) => {
                            const eduId = edu.id ?? idx;
                            const rawEduValue = edu.value ?? edu;
                            const eduValue = formatEducationEntry(rawEduValue);
                            return (
                            <div key={eduId} className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-subtle/50 group">
                                {editingEducation?.id === eduId ? (
                                    <input
                                        type="text"
                                        value={editingEducation?.value ?? ''}
                                        onChange={(e) => setEditingEducation({ id: eduId, value: e.target.value })}
                                        onBlur={handleUpdateEducation}
                                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateEducation()}
                                        autoFocus
                                        className="w-full bg-bg-input border border-primary-300 text-sm rounded-md p-1.5"
                                    />
                                ) : (
                                    <p className="text-sm text-text-muted font-semibold cursor-pointer" onClick={() => setEditingEducation({ id: eduId, value: eduValue })}>
                                        {eduValue}
                                    </p>
                                )}
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setEditingEducation({ id: eduId, value: eduValue })} className="p-1.5 text-text-subtle hover:text-primary-600 rounded-full"><PencilIcon className="w-4 h-4"/></button>
                                    <button onClick={() => handleRemoveEducation(eduId)} className="p-1.5 text-text-subtle hover:text-red-500 rounded-full"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        )})}
                        <div className="flex items-end gap-2 pt-4 border-t border-border-default">
                            <div className="flex-grow">
                                <label className="block text-sm font-semibold text-text-muted mb-1">{t('form.add_education')}</label>
                                <input type="text" value={newEducation} onChange={e => setNewEducation(e.target.value)} placeholder="לדוגמה: תואר שני במנהל עסקים, אוניברסיטת בן גוריון" className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                            </div>
                            <button onClick={handleAddEducation} className="bg-primary-100 text-primary-700 font-semibold px-4 py-2.5 rounded-lg hover:bg-primary-200 transition shadow-sm flex-shrink-0">{t('form.add')}</button>
                        </div>
                     </div>
                </AccordionSection>
            </div>

           
            
            <div id="notes" className="space-y-6">
                {viewMode === 'recruiter' && (
                    <>
                        <div id="candidate-notes-recruiter">
                            <AccordionSection title={t('section.recruiter_notes')} icon={<ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/>} defaultOpen>
                                <label htmlFor={candidateNotesId} className="sr-only">{t('section.recruiter_notes')}</label>
                                <textarea
                                    id={candidateNotesId}
                                    name="candidateNotes"
                                    value={formData.candidateNotes ?? ''}
                                    onChange={handleInputChange}
                                    disabled
                                    className="w-full h-24 bg-bg-subtle border border-border-default text-text-muted text-sm rounded-lg block p-2.5 shadow-sm cursor-not-allowed opacity-80"
                                    placeholder={t('section.recruiter_notes_placeholder')}
                                />
                            </AccordionSection>
                        </div>
                       
                    </>
                )}

                {viewMode === 'candidate' && (
                    <div id="candidate-notes-edit">
                        <AccordionSection title={t('section.candidate_notes')} icon={<ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5"/>} defaultOpen>
                            <label htmlFor={candidateNotesId} className="sr-only">{t('section.candidate_notes')}</label>
                            <textarea
                                id={candidateNotesId}
                                name="candidateNotes"
                                value={formData.candidateNotes ?? ''}
                                onChange={handleInputChange}
                                className="w-full h-24 bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                placeholder={t('section.candidate_notes_placeholder')}
                            />
                        </AccordionSection>
                    </div>
                )}
            </div>



            
        </div>
    );
};

export default MainContent;
