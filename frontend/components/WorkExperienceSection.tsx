
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PencilIcon, TrashIcon, PlusIcon, CheckIcon, XMarkIcon, ChevronUpIcon, ChevronDownIcon, SparklesIcon } from './Icons';
import { GoogleGenAI } from '@google/genai';
import TagSelectorModal, { type TagOption } from './TagSelectorModal';
import {
    resolveExperienceContextTags,
    type ExperienceContextTag,
    type ExperienceContextTagType,
} from '../utils/workExperienceRoleTag';
import { resolveRowRoleTagIdsForEdit } from '../utils/workExperienceRoleTagSync';

const COMPANY_LOOKUP_DEBOUNCE_MS = 300;
const COMPANY_LOOKUP_MIN_CHARS = 3;
const COMPANY_LOOKUP_LIMIT = 6;
const MAX_ROLE_TAGS_PER_ROW = 2;

type GlobalCompanyLookupResult = {
    id: string;
    name: string;
    website?: string | null;
    logo?: string | null;
    mainField?: string | null;
};

const CONTEXT_TAG_STYLES: Record<ExperienceContextTagType, { className: string; title: string }> = {
    role: { className: 'bg-purple-50 text-purple-700 border-purple-200', title: 'תפקיד' },
    seniority: { className: 'bg-indigo-50 text-indigo-700 border-indigo-200', title: 'בכירות' },
    industry: { className: 'bg-teal-50 text-teal-700 border-teal-200', title: 'ענף' },
};

interface Experience {
    id: number;
    title: string;
    company: string;
    companyField: string;
    startDate: string; // YYYY-MM
    endDate: string;   // YYYY-MM or "Present"
    description: string;
    isCurrent?: boolean;
    is_current?: boolean;
    organizationId?: string | null;
    roleTagIds?: string[];
    tagId?: string;
    roleTag?: string;
}

const PRESENT_MARKERS = /present|current|כיום|היום|נוכחי|עד\s*היום/i;

const isPresentEndDate = (value?: string | null, isCurrent?: boolean) => {
    if (isCurrent === true) return true;
    if (value == null || !String(value).trim()) return isCurrent === true;
    return PRESENT_MARKERS.test(String(value).trim());
};

/** Normalize stored CV dates (YYYY, YYYY-MM, MM/YYYY, etc.) for `<input type="month">`. */
const toMonthInputValue = (value?: string | null): string => {
    if (!value || isPresentEndDate(value)) return '';
    const clean = String(value).trim();
    if (/^\d{4}-\d{2}$/.test(clean)) return clean;
    const ym = clean.match(/^(\d{4})-(\d{1,2})$/);
    if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}`;
    const my = clean.match(/^(\d{1,2})[/.-](\d{4})$/);
    if (my) {
        const month = Number(my[1]);
        const year = Number(my[2]);
        if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, '0')}`;
    }
    const yearOnly = clean.match(/^(\d{4})$/);
    if (yearOnly) return `${yearOnly[1]}-01`;
    const parsed = new Date(clean);
    if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    }
    return '';
};

const formatExperienceDateLabel = (value?: string) => {
    if (!value || isPresentEndDate(value)) return 'כיום';
    if (/^\d{4}$/.test(String(value).trim())) return String(value).trim();
    const monthVal = toMonthInputValue(value);
    if (!monthVal) return String(value);
    const [year, month] = monthVal.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { year: 'numeric', month: 'short' });
};

const normalizeExperienceForForm = (item: Omit<Experience, 'id'> | Experience) => {
    const isCurrent = item.isCurrent === true || item.is_current === true;
    const endIsPresent = isPresentEndDate(item.endDate, isCurrent);
    return {
        ...item,
        startDate: toMonthInputValue(item.startDate),
        endDate: endIsPresent ? 'Present' : toMonthInputValue(item.endDate),
    };
};

const parseMonthDate = (value?: string): Date | null => {
    const monthVal = toMonthInputValue(value);
    if (!monthVal) return null;
    const [year, month] = monthVal.split('-').map(Number);
    return new Date(year, month - 1, 1);
};

interface WorkExperienceSectionProps {
    experience: Experience[];
    onExperienceChange: (newExperience: Experience[]) => void;
    /** Candidate tagDetails — role tags are shown on matching rows. */
    tagDetails?: unknown[];
    candidateId?: string;
}

const calculateDuration = (startDate: string, endDate: string): string => {
    const start = parseMonthDate(startDate);
    if (!start) return '';
    const end = isPresentEndDate(endDate) ? new Date() : (parseMonthDate(endDate) || new Date());
    
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years === 0 && months === 0) return "חודש";
    
    const yearStr = years > 0 ? `${years} שנ${years > 1 ? 'ים' : 'ה'}` : '';
    const monthStr = months > 0 ? `${months} חודש${months > 1 ? 'ים' : ''}` : '';

    return [yearStr, monthStr].filter(Boolean).join(' ו');
};


const roleTagLabels = (ids: string[], tagDetails: unknown[]): string[] =>
    ids.map((tid) => {
        const detail = (Array.isArray(tagDetails) ? tagDetails : []).find((d) => {
            if (!d || typeof d !== 'object') return false;
            const raw = d as Record<string, unknown>;
            const id = raw.tagId ?? raw.tag_id ?? (raw.tag as { id?: string })?.id;
            return id != null && String(id) === tid;
        }) as Record<string, unknown> | undefined;
        return String(detail?.displayNameHe || detail?.displayNameEn || detail?.tagKey || tid).trim();
    }).filter(Boolean);

const ExperienceForm: React.FC<{
    item: Omit<Experience, 'id'> | Experience;
    onSave: (item: Omit<Experience, 'id'> | Experience) => void;
    onCancel: () => void;
    tagDetails: unknown[];
    candidateId?: string;
}> = ({ item, onSave, onCancel, tagDetails, candidateId }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [formData, setFormData] = useState(() => normalizeExperienceForForm(item));
    const [isGenerating, setIsGenerating] = useState(false);
    const [roleTagIds, setRoleTagIds] = useState<string[]>(() =>
        resolveRowRoleTagIdsForEdit(item as unknown as Record<string, unknown>, tagDetails),
    );
    const [roleTagModalOpen, setRoleTagModalOpen] = useState(false);
    const [linkedOrganizationId, setLinkedOrganizationId] = useState<string | null>(
        item.organizationId ? String(item.organizationId) : null,
    );
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [companyLookupResults, setCompanyLookupResults] = useState<GlobalCompanyLookupResult[]>([]);
    const [companyLookupLoading, setCompanyLookupLoading] = useState(false);
    const [debouncedCompanyQuery, setDebouncedCompanyQuery] = useState('');
    const companyDropdownRef = useRef<HTMLDivElement>(null);
    const companyLookupAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setFormData(normalizeExperienceForForm(item));
        setRoleTagIds(resolveRowRoleTagIdsForEdit(item as unknown as Record<string, unknown>, tagDetails));
        setLinkedOrganizationId(item.organizationId ? String(item.organizationId) : null);
    }, [item, tagDetails]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedCompanyQuery(formData.company.trim()), COMPANY_LOOKUP_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [formData.company]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
                setShowCompanyDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!apiBase || debouncedCompanyQuery.length < COMPANY_LOOKUP_MIN_CHARS || linkedOrganizationId) {
            companyLookupAbortRef.current?.abort();
            setCompanyLookupResults([]);
            setCompanyLookupLoading(false);
            return;
        }

        companyLookupAbortRef.current?.abort();
        const controller = new AbortController();
        companyLookupAbortRef.current = controller;
        setCompanyLookupResults([]);
        setCompanyLookupLoading(true);

        fetch(
            `${apiBase}/api/companies/global-lookup?q=${encodeURIComponent(debouncedCompanyQuery)}&limit=${COMPANY_LOOKUP_LIMIT}`,
            { signal: controller.signal, cache: 'no-store' },
        )
            .then((r) => {
                if (!r.ok) throw new Error('Lookup failed');
                return r.json();
            })
            .then((payload) => {
                if (controller.signal.aborted) return;
                const list = Array.isArray(payload?.data) ? payload.data : [];
                setCompanyLookupResults(list.slice(0, COMPANY_LOOKUP_LIMIT));
            })
            .catch((err) => {
                if (controller.signal.aborted || err?.name === 'AbortError') return;
                setCompanyLookupResults([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setCompanyLookupLoading(false);
            });

        return () => controller.abort();
    }, [apiBase, debouncedCompanyQuery, linkedOrganizationId]);

    const handleCompanyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData((prev) => ({ ...prev, company: value }));
        setLinkedOrganizationId(null);
        setShowCompanyDropdown(true);
    };

    const selectExistingCompany = useCallback((company: GlobalCompanyLookupResult) => {
        setFormData((prev) => ({ ...prev, company: company.name || '' }));
        setLinkedOrganizationId(company.id || null);
        setShowCompanyDropdown(false);
    }, []);

    const clearLinkedCompany = () => {
        setLinkedOrganizationId(null);
        setShowCompanyDropdown(true);
    };

    const handleRoleTagsSave = (selected: TagOption[]) => {
        setRoleTagIds(selected.map((t) => String(t.id)).filter((id) => !id.startsWith('custom-')).slice(0, MAX_ROLE_TAGS_PER_ROW));
        setRoleTagModalOpen(false);
    };

    const handleSubmitSave = () => {
        const payload = {
            ...formData,
            roleTagIds: roleTagIds.slice(0, MAX_ROLE_TAGS_PER_ROW),
            organizationId: linkedOrganizationId,
        };
        onSave(payload);
    };

    const selectedRoleLabels = roleTagLabels(roleTagIds, tagDetails);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const { name, value, type, checked } = e.target;
         if (name === 'endDate' && type === 'checkbox') {
             setFormData(prev => ({ ...prev, endDate: checked ? 'Present' : toMonthInputValue(prev.endDate) }));
         } else {
             setFormData(prev => ({ ...prev, [name]: value }));
         }
    };

    const isWorkingHereToday = isPresentEndDate(formData.endDate);

    const handleGenerateDescription = async () => {
        if (!formData.title) return;
        setIsGenerating(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const contextParts = [];
            contextParts.push(`תפקיד: ${formData.title}`);
            if (formData.company) contextParts.push(`חברה: ${formData.company}`);
            if (formData.companyField) contextParts.push(`תחום עיסוק החברה: ${formData.companyField}`);

            const prompt = `
            כתוב תיאור תפקיד מקצועי ותמציתי (3-4 נקודות, בולטים) בעברית עבור קורות חיים, בהתבסס על הפרטים הבאים:
            ${contextParts.join(', ')}.
            הניסוח צריך להיות מרשים, בגוף ראשון (למשל: "ניהלתי", "פיתחתי"), ולהדגיש אחריות והישגים.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: prompt,
            });

            if (response.text) {
                setFormData(prev => ({ ...prev, description: response.text.trim() }));
            }
        } catch (error) {
            console.error("AI Generation failed", error);
            alert("אירעה שגיאה ביצירת התיאור. אנא נסה שנית.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
         <div className="space-y-4 p-4 bg-primary-50/50 rounded-lg border border-primary-200 shadow-sm animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">תפקיד</label>
                    <input name="title" value={formData.title} onChange={handleChange} placeholder="לדוגמה: מנהל מוצר" className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500" />
                </div>
                <div className="relative" ref={companyDropdownRef}>
                    <label className="block text-xs font-semibold text-text-muted mb-1">חברה</label>
                    <input
                        name="company"
                        value={formData.company}
                        onChange={handleCompanyChange}
                        onFocus={() => { if (!linkedOrganizationId) setShowCompanyDropdown(true); }}
                        placeholder="שם החברה"
                        autoComplete="off"
                        readOnly={Boolean(linkedOrganizationId)}
                        className={`w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500 ${linkedOrganizationId ? 'opacity-90' : ''}`}
                    />
                    {linkedOrganizationId && (
                        <button
                            type="button"
                            onClick={clearLinkedCompany}
                            className="absolute left-2 top-8 text-[11px] font-semibold text-primary-600 hover:text-primary-700"
                        >
                            שנה שם
                        </button>
                    )}
                    {showCompanyDropdown && !linkedOrganizationId && formData.company.trim().length >= COMPANY_LOOKUP_MIN_CHARS && (
                        <div className="absolute z-20 mt-1 w-full bg-bg-card border border-border-default rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {companyLookupLoading && (
                                <p className="px-3 py-2 text-xs text-text-muted">מחפש...</p>
                            )}
                            {!companyLookupLoading && companyLookupResults.length === 0 && (
                                <p className="px-3 py-2 text-xs text-text-muted">
                                    לא נמצאה התאמה — השם יישמר ויישלח לאישור מנהל.
                                </p>
                            )}
                            {companyLookupResults.map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => selectExistingCompany(row)}
                                    className="w-full text-right px-3 py-2 text-sm hover:bg-primary-50 border-b border-border-subtle last:border-0"
                                >
                                    <span className="font-semibold text-text-default">{row.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-text-muted">תגיות תפקיד (עד {MAX_ROLE_TAGS_PER_ROW})</label>
                    <button
                        type="button"
                        onClick={() => setRoleTagModalOpen(true)}
                        className="text-xs font-bold text-primary-600 hover:text-primary-700"
                    >
                        {selectedRoleLabels.length ? 'ערוך תגיות' : 'בחר מתוך הרשימה'}
                    </button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                    {selectedRoleLabels.length ? (
                        selectedRoleLabels.map((label) => (
                            <span
                                key={label}
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200"
                            >
                                {label}
                            </span>
                        ))
                    ) : (
                        <span className="text-xs text-text-subtle">לא נבחרו תגיות תפקיד</span>
                    )}
                </div>
            </div>
            <div>
                 <label className="block text-xs font-semibold text-text-muted mb-1">תחום עיסוק החברה</label>
                 <input name="companyField" value={formData.companyField} onChange={handleChange} placeholder="לדוגמה: הייטק / פינטק" className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500" />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                 <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-text-muted mb-1">תאריך התחלה</label>
                        <input type="month" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm text-text-muted focus:ring-1 focus:ring-primary-500" />
                    </div>
                    <span className="mt-6">-</span>
                    <div className="flex-1">
                         <label className="block text-xs font-semibold text-text-muted mb-1">תאריך סיום</label>
                         <input type="month" name="endDate" value={isWorkingHereToday ? '' : formData.endDate} onChange={handleEndDateChange} disabled={isWorkingHereToday} className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm text-text-muted disabled:bg-bg-subtle focus:ring-1 focus:ring-primary-500" />
                    </div>
                 </div>
                 <label className="flex items-center gap-2 text-sm font-medium cursor-pointer mt-6">
                    <input type="checkbox" name="endDate" checked={isWorkingHereToday} onChange={handleEndDateChange} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                    אני עובד/ת כאן כיום
                </label>
             </div>
            
            <div className="relative">
                <div className="flex justify-between items-end mb-1">
                    <label className="block text-xs font-semibold text-text-muted">תיאור התפקיד</label>
                    <button 
                        onClick={handleGenerateDescription}
                        disabled={!formData.title || isGenerating}
                        className={`text-xs flex items-center gap-1 font-bold transition-colors ${
                            !formData.title 
                            ? 'text-gray-300 cursor-not-allowed' 
                            : 'text-purple-600 hover:text-purple-700'
                        }`}
                        title={!formData.title ? "יש להזין תפקיד תחילה" : "צור תיאור אוטומטי בעזרת AI"}
                    >
                        {isGenerating ? (
                             <span className="animate-pulse">חושב...</span>
                        ) : (
                            <>
                                <SparklesIcon className="w-3 h-3" />
                                <span>כתוב עבורי</span>
                            </>
                        )}
                    </button>
                </div>
                <textarea 
                    name="description" 
                    value={formData.description} 
                    onChange={handleChange} 
                    rows={4} 
                    placeholder="פרט על תחומי האחריות, הישגים מרכזיים וטכנולוגיות..." 
                    className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500"
                ></textarea>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <button onClick={onCancel} className="p-2 text-text-muted hover:bg-bg-hover rounded-full transition-colors"><XMarkIcon className="w-5 h-5"/></button>
                <button onClick={handleSubmitSave} className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-full transition-colors shadow-sm"><CheckIcon className="w-5 h-5"/></button>
            </div>

            <TagSelectorModal
                isOpen={roleTagModalOpen}
                onClose={() => setRoleTagModalOpen(false)}
                onSave={handleRoleTagsSave}
                existingTags={[]}
                initialCategory="role"
                context="candidate"
                candidateId={candidateId}
                maxSelection={MAX_ROLE_TAGS_PER_ROW}
                initialSelectedTagIds={roleTagIds}
            />
        </div>
    );
};


const WorkExperienceSection: React.FC<WorkExperienceSectionProps> = ({ experience, onExperienceChange, tagDetails, candidateId }) => {
    const [editingId, setEditingId] = useState<number | null | 'new'>(null);

    const contextTagsById = useMemo(() => {
        const map = new Map<number, ExperienceContextTag[]>();
        const details = Array.isArray(tagDetails) ? tagDetails : [];
        if (!details.length) return map;
        for (const item of experience) {
            map.set(item.id, resolveExperienceContextTags(item as unknown as Record<string, unknown>, details));
        }
        return map;
    }, [experience, tagDetails]);

    const handleSave = (item: Omit<Experience, 'id'> | Experience) => {
        const rowId = 'id' in item && item.id != null ? item.id : Date.now();
        const row = { ...item, id: rowId } as Experience;
        const exists = experience.some((exp) => exp.id === rowId);
        if (exists) {
            onExperienceChange(experience.map((exp) => (exp.id === rowId ? row : exp)));
        } else {
            onExperienceChange([row, ...experience]);
        }
        setEditingId(null);
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        const newExperience = [...experience];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex >= 0 && targetIndex < newExperience.length) {
            // Swap items
            [newExperience[index], newExperience[targetIndex]] = [newExperience[targetIndex], newExperience[index]];
            onExperienceChange(newExperience);
        }
    };

    return (
        <div className="space-y-4">
            <div className="relative border-r-2 border-primary-200 pr-8 space-y-8">
                {experience.map((item, index) => (
                    <div key={item.id} className="relative transition-all duration-300">
                        {/* Timeline Dot */}
                        <div className="absolute top-4 -right-[41px] w-4 h-4 rounded-full bg-bg-card ring-4 ring-primary-200 z-10"></div>
                        
                        {editingId === item.id ? (
                            <ExperienceForm 
                                item={item}
                                onSave={handleSave}
                                onCancel={() => setEditingId(null)}
                                tagDetails={Array.isArray(tagDetails) ? tagDetails : []}
                                candidateId={candidateId}
                            />
                        ) : (
                            <div className="bg-bg-subtle/40 border border-border-default hover:border-primary-200 p-4 rounded-lg group transition-all hover:bg-bg-card hover:shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-base text-text-default">{item.title}</h4>
                                        <p className="text-sm font-semibold text-text-muted">
                                            {item.company}
                                            {item.companyField && !/^[a-z0-9_-]+$/i.test(String(item.companyField).trim())
                                                ? ` · ${item.companyField}`
                                                : ''}
                                        </p>
                                        <p className="text-xs text-text-subtle mt-1">{formatExperienceDateLabel(item.startDate)} - {formatExperienceDateLabel(item.endDate)} &middot; <span className="font-semibold">{calculateDuration(item.startDate, item.endDate)}</span></p>
                                        {(contextTagsById.get(item.id) || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {(contextTagsById.get(item.id) || []).map((tag) => (
                                                    <span
                                                        key={tag.key}
                                                        title={CONTEXT_TAG_STYLES[tag.type].title}
                                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${CONTEXT_TAG_STYLES[tag.type].className}`}
                                                    >
                                                        {tag.label}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-card/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-border-subtle">
                                        <div className="flex flex-col border-l border-border-default pl-1 ml-1">
                                            <button 
                                                onClick={() => handleMoveItem(index, 'up')} 
                                                disabled={index === 0}
                                                className="p-1 text-text-subtle hover:text-primary-600 disabled:opacity-30 disabled:hover:text-text-subtle transition-colors"
                                                title="הזז למעלה"
                                            >
                                                <ChevronUpIcon className="w-3.5 h-3.5"/>
                                            </button>
                                            <button 
                                                onClick={() => handleMoveItem(index, 'down')} 
                                                disabled={index === experience.length - 1}
                                                className="p-1 text-text-subtle hover:text-primary-600 disabled:opacity-30 disabled:hover:text-text-subtle transition-colors"
                                                title="הזז למטה"
                                            >
                                                <ChevronDownIcon className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                        <button onClick={() => setEditingId(item.id)} className="p-1.5 text-text-muted hover:text-primary-600 rounded-md hover:bg-primary-50 transition-colors" title="ערוך">
                                            <PencilIcon className="w-4 h-4"/>
                                        </button>
                                        <button onClick={() => onExperienceChange(experience.filter(exp => exp.id !== item.id))} className="p-1.5 text-text-muted hover:text-red-500 rounded-md hover:bg-red-50 transition-colors" title="מחק">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                                {item.description && (
                                    <p className="text-sm text-text-muted mt-3 whitespace-pre-line leading-relaxed border-t border-border-subtle pt-2">
                                        {item.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {editingId === 'new' ? (
                <ExperienceForm
                    item={{ id: Date.now(), title: '', company: '', companyField: '', startDate: '', endDate: 'Present', description: '' }}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                    tagDetails={Array.isArray(tagDetails) ? tagDetails : []}
                    candidateId={candidateId}
                />
            ) : (
                <div className="pt-2">
                    <button onClick={() => setEditingId('new')} className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-primary-200 text-primary-600 font-semibold py-3 px-4 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all group">
                        <div className="bg-primary-100 p-1 rounded-full group-hover:scale-110 transition-transform">
                             <PlusIcon className="w-4 h-4" />
                        </div>
                        <span>הוסף ניסיון תעסוקתי</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default WorkExperienceSection;
