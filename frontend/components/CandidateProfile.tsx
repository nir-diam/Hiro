
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PhoneIcon, EnvelopeIcon, LanguageIcon, AcademicCapIcon, MapPinIcon, LinkedInIcon, WhatsappIcon, MatchIcon, ClipboardDocumentListIcon, AvatarIcon, PencilIcon, BookmarkIcon, BookmarkIconSolid, BriefcaseIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, ChatBubbleBottomCenterTextIcon, BuildingOffice2Icon, TagIcon, FlagIcon, PlusIcon, SparklesIcon, CheckCircleIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, TrashIcon } from './Icons';
import { MessageMode } from '../hooks/useUIState';
import DevAnnotation from './DevAnnotation';
import { useLanguage } from '../context/LanguageContext';

const SocialButton: React.FC<{ children: React.ReactNode, onClick?: () => void, title?: string, className?: string }> = ({ children, onClick, title, className }) => (
  <button onClick={onClick} title={title} className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative z-20 ${className || 'bg-primary-100/70 text-primary-600 hover:bg-primary-200'}`}>
    {children}
  </button>
);

type SmartTagType = 'role' | 'seniority' | 'skill' | 'industry' | 'certification' | 'language' | 'tool' | 'soft';

interface SmartTagData {
    label: string;
    type: SmartTagType;
    isVerified?: boolean;
    isAiSuggested?: boolean;
    customTooltip?: string;
}

const SmartTag: React.FC<SmartTagData> = ({ label, type, isVerified, isAiSuggested, customTooltip }) => {
    const baseClasses = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all cursor-default select-none border whitespace-nowrap relative group/tag";
    const configs: Record<SmartTagType, string> = {
        role: "bg-primary-600 text-white font-bold border-primary-600 shadow-sm",
        seniority: "bg-white border-primary-400 text-primary-700 font-bold",
        skill: "bg-slate-100 text-slate-800 border-slate-200 font-semibold",
        tool: "bg-blue-50 text-blue-800 border-blue-100 font-bold",
        soft: "bg-transparent border-slate-200 text-slate-600 italic font-medium",
        industry: "bg-emerald-50 text-emerald-800 border-emerald-100 font-bold",
        certification: "bg-orange-50 text-orange-800 border-orange-100 font-bold",
        language: "bg-pink-50 text-pink-700 border-pink-100 font-medium",
    };
    const typeLabels: Record<SmartTagType, string> = {
        role: "תפקיד",
        seniority: "בכירות",
        skill: "מיומנות",
        tool: "כלי עבודה",
        soft: "כישורים רכים",
        industry: "תעשייה",
        certification: "השכלה/הסמכה",
        language: "שפה",
    };
    const sourceLabel = isAiSuggested ? "AI (בינה מלאכותית)" : "הוזן ידנית / מועמד";

    return (
        <div
            className={`${baseClasses} ${configs[type]} ${isAiSuggested ? 'border-dashed' : 'border-solid'} hover:shadow-md hover:-translate-y-0.5`}
        >
            {isAiSuggested && <SparklesIcon className="w-3 h-3 opacity-70" />}
            <span>{label}</span>
            {isVerified && <CheckCircleIcon className="w-3 h-3 text-current opacity-80" />}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[220px] px-3 py-2 bg-gray-900/95 text-white text-[11px] rounded-lg opacity-0 group-hover/tag:opacity-100 transition-opacity duration-200 pointer-events-none z-50 backdrop-blur-sm shadow-xl flex flex-col items-center gap-0.5 transform scale-95 group-hover/tag:scale-100 origin-bottom text-center leading-tight">
                {customTooltip ? (
                    <span className="font-medium whitespace-pre-wrap">{customTooltip}</span>
                ) : (
                    <>
                        <span className="font-bold border-b border-gray-700 pb-0.5 mb-0.5">{typeLabels[type]}</span>
                        <span className="text-gray-300 text-[9px]">{sourceLabel}</span>
                    </>
                )}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900/95"></div>
            </div>
        </div>
    );
};

const MAX_VISIBLE_TAGS = 5;

const TAG_LINE_CONFIG: Array<{
    type: SmartTagType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}> = [
    { type: 'role', label: 'תפקיד', icon: TagIcon },
    { type: 'seniority', label: 'בכירות', icon: FlagIcon },
    { type: 'skill', label: 'מיומנויות', icon: SparklesIcon },
    { type: 'industry', label: 'תעשייה', icon: BuildingOffice2Icon },
    { type: 'certification', label: 'השכלה/הסמכה', icon: AcademicCapIcon },
    { type: 'language', label: 'שפה', icon: LanguageIcon },
];

const TimelineEvent: React.FC<{ day: string; month: string; time: string; title: string; company: string; color: string }> = ({ day, month, time, title, company, color }) => (
    <div className="flex-1 min-w-[90px] bg-white border border-border-default rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between relative overflow-hidden group">
        <div className={`absolute top-0 right-0 w-1 h-full bg-${color}-500`}></div>
        <div className="flex justify-between items-start mb-1.5 pl-1">
             <div className="text-center bg-bg-subtle rounded-md px-1.5 py-0.5 min-w-[2.5rem]">
                <span className="block text-lg font-extrabold text-text-default leading-none">{day}</span>
                <span className="block text-[9px] text-text-muted font-medium">{month}</span>
             </div>
             <span className="text-[9px] font-mono text-text-subtle bg-bg-subtle px-1 py-0.5 rounded">{time}</span>
        </div>
        <div>
            <p className="font-bold text-text-default text-xs leading-tight mb-0.5 truncate">{title}</p>
            <p className="text-[10px] text-text-muted truncate" title={company}>{company}</p>
        </div>
    </div>
);

const EditableField: React.FC<{
    value: string;
    placeholder: string;
    onSave: (newValue: string) => void;
    className?: string;
    icon?: React.ReactNode;
    multiline?: boolean;
    collapsible?: boolean;
}> = ({ value, placeholder, onSave, className = "", icon, multiline = false, collapsible = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const [isExpanded, setIsExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    // Calculate split point at 50% of the text length
    const isLongText = collapsible && localValue && localValue.length > 100; // Minimum threshold to even consider collapsing
    const cutOffPoint = Math.floor(localValue.length / 2);
    
    const displayValue = !isEditing && !isExpanded && isLongText 
        ? localValue.slice(0, cutOffPoint) + '...' 
        : localValue;

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
            e.preventDefault();
            e.stopPropagation();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setLocalValue(value);
            setIsEditing(false);
        }
    };

    return (
        <div className={`relative group flex items-start gap-2 ${className} z-10`}>
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
                            className="w-full bg-bg-input border border-primary-500 rounded p-1 text-inherit focus:ring-2 focus:ring-primary-200 outline-none resize-none relative z-30"
                            placeholder={placeholder}
                            rows={6}
                        />
                    ) : (
                        <input
                            ref={inputRef as React.RefObject<HTMLInputElement>}
                            type="text"
                            value={localValue}
                            onChange={(e) => setLocalValue(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-bg-input border-b-2 border-primary-500 outline-none text-inherit relative z-30"
                            placeholder={placeholder}
                        />
                    )
                ) : (
                    <div className="relative pr-6">
                         <div 
                            onClick={() => setIsEditing(true)}
                            className="cursor-pointer hover:bg-bg-hover/50 rounded-md py-0.5 px-1 min-h-[1.5em]"
                        >
                            <p className="whitespace-pre-line break-words leading-relaxed">
                                {displayValue || <span className="text-text-subtle opacity-60 italic">{placeholder}</span>}
                            </p>
                        </div>
                        
                        {/* Show More / Show Less Button */}
                        {isLongText && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                className="text-xs font-bold text-primary-600 hover:text-primary-800 mt-1 flex items-center gap-1 select-none bg-primary-50 px-2 py-0.5 rounded-full w-fit"
                            >
                                {isExpanded ? (
                                    <>הצג פחות <ChevronUpIcon className="w-3 h-3" /></>
                                ) : (
                                    <>המשך לקרוא <ChevronDownIcon className="w-3 h-3" /></>
                                )}
                            </button>
                        )}

                        {/* Edit Button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600 z-20"
                            aria-label="ערוך"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

type ExperienceSlice = { label: string; color: string; percentage?: number; years?: number };

// Mock data for the experience visualization if not present in candidateData
// Updated with theme-aware color variables
const mockExperienceDistribution: ExperienceSlice[] = [
    { label: 'מסחר וקמעונאות', percentage: 65, color: 'bg-primary-500' },
    { label: 'טכנולוגיה ושירותים', percentage: 35, color: 'bg-secondary-400' },
];

const EXPERIENCE_COLORS = ['bg-primary-500', 'bg-secondary-400', 'bg-emerald-500', 'bg-amber-400', 'bg-sky-500', 'bg-rose-500', 'bg-indigo-500'];

const parseYearFromValue = (value?: string | number | null): number | null => {
    if (value == null) return null;
    if (typeof value === 'number') return Math.floor(value);
    const match = String(value).match(/(\d{4})/);
    return match ? Number(match[1]) : null;
};

const isPresentMarker = (value?: string | number | null) => {
    if (typeof value !== 'string') return false;
    const normalized = value.toLowerCase();
    return normalized.includes('present') || normalized.includes('current') || normalized.includes('היום') || normalized.includes('נוכחי');
};

const buildExperienceDistributionFromWork = (workExperience?: any[]): ExperienceSlice[] => {
    const entries = Array.isArray(workExperience) ? workExperience : [];
    if (!entries.length) return [];
    const currentYear = new Date().getFullYear();
    const buckets: Record<string, { label: string; years: number }> = {};

    entries.forEach(item => {
        const label = (item.companyField || item.company || item.title || 'אחר')?.toString().trim() || 'אחר';
        const startYear = parseYearFromValue(item.startDate);
        if (!startYear) return;
        let endYear = parseYearFromValue(item.endDate);
        if (!endYear && isPresentMarker(item.endDate)) {
            endYear = currentYear;
        }
        if (!endYear) {
            endYear = currentYear;
        }
        const duration = Math.max(0, endYear - startYear);
        if (!duration) return;
        buckets[label] = {
            label,
            years: (buckets[label]?.years || 0) + duration,
        };
    });

    const aggregated = Object.values(buckets)
        .filter(item => item.years > 0)
        .sort((a, b) => b.years - a.years || a.label.localeCompare(b.label));

    return aggregated.map((item, index) => ({
        ...item,
        color: EXPERIENCE_COLORS[index % EXPERIENCE_COLORS.length],
    }));
};

const mockSmartTags = {
    domains: ['יבוא וסחר סיטונאי', 'הפצה טכנולוגית'],
    orgDNA: {
        label: 'ניסיון בארגוני Enterprise',
        subLabel: '500+ עובדים',
        icon: <BuildingOffice2Icon className="w-3.5 h-3.5" />
    }
};

const ExperienceBar: React.FC<{ 
    data?: ExperienceSlice[];
    smartTags?: { domains: string[], orgDNA?: { label: string, subLabel: string, icon?: any } }
}> = ({ data = mockExperienceDistribution, smartTags = mockSmartTags }) => {
    const { t } = useLanguage();
    const yearsLabel =  'שנים';
    const computedData = data.map(item => ({ ...item }));
    const totalYears = computedData.reduce((sum, item) => sum + (item.years ?? 0), 0);
    const hasYears = totalYears > 0;
    const totalPercentage = computedData.reduce((sum, item) => sum + (item.percentage ?? 0), 0);
    const effectiveTotal = hasYears ? totalYears : (totalPercentage || 100);

    return (
        <div className="w-full mt-2 mb-4">
            <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-bold text-text-default flex items-center gap-2">
                    <BriefcaseIcon className="w-4 h-4 text-primary-500"/>
                    <span>{t('profile.industry_profile')}</span>
                </h4>
            </div>
            
            {/* Visual Bar */}
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-bg-subtle mb-2">
                {computedData.map((item, index) => {
                    const value = hasYears ? (item.years ?? 0) : (item.percentage ?? 0);
                    const widthPercent = effectiveTotal ? (value / effectiveTotal) * 100 : 0;
                    const labelValue = `${item.years ?? 0} ${yearsLabel}`;
                    return (
                        <div
                            key={index}
                            className={`${item.color} h-full relative group cursor-help`}
                            style={{ width: `${widthPercent}%` }}
                            title={`${item.label}: ${labelValue}`}
                        />
                    );
                })}
            </div>

            {/* Legend - Inline */}
            <div className="flex flex-wrap gap-3 mb-3 items-center">
                {computedData.map((item, index) => {
                    const labelValue = `${item.years ?? 0} ${yearsLabel}`;
                    return (
                        <div key={index} className="flex items-center gap-1.5 text-[11px]">
                            <div className={`w-2 h-2 rounded-full ${item.color}`}></div>
                            <span className="text-text-default font-medium">{item.label}</span>
                            <span className="text-text-muted">({labelValue})</span>
                        </div>
                    );
                })}
            </div>

            {/* Insights Strip - Horizontal Row */}
            <div className="flex flex-col sm:flex-row gap-3 text-xs bg-bg-subtle/30 p-2 rounded-lg border border-border-default/40 items-start sm:items-center">
                {/* Org DNA */}
                {smartTags?.orgDNA && (
                    <div className="flex items-center gap-2 min-w-0 sm:border-l sm:border-border-default sm:pl-3 sm:max-w-[40%]">
                        <div className="text-text-muted flex-shrink-0">
                            {smartTags.orgDNA.icon || <BuildingOffice2Icon className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0 overflow-hidden">
                            <span className="font-bold text-text-default block leading-tight truncate" title={smartTags.orgDNA.label}>
                                {smartTags.orgDNA.label}
                            </span>
                            {smartTags.orgDNA.subLabel && (
                                <span className="text-[10px] text-text-subtle block leading-tight truncate" title={smartTags.orgDNA.subLabel}>
                                    {smartTags.orgDNA.subLabel}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Domains */}
                <div className="flex flex-wrap gap-1.5 items-center flex-1 min-w-0">
                    {smartTags?.domains.map((tag, i) => (
                        <span key={i} className="text-[11px] text-text-default bg-white border border-border-default px-2 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface MultiProfileOption {
    id: string | number;
    profileName: string;
    profilePicture?: string;
    isDeleted?: boolean;
}

interface CandidateProfileProps {
    candidateData: any;
    onMatchJobsClick: () => void;
    onScreenCandidateClick: () => void;
    onOpenMessageModal: (config: { mode: MessageMode, candidateName: string, candidatePhone: string }) => void;
    onTagsChange: (tags: string[]) => void;
    onFormChange: (data: any) => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onReportInaccuracy?: () => void;
    hideActions?: boolean;
    isSaving?: boolean;
    onSaveCandidate?: () => void;
    saveStatusMessage?: string | null;
    profiles?: MultiProfileOption[];
    activeProfileId?: string | number;
    onSwitchProfile?: (id: string | number) => void;
    onAddProfile?: () => void;
}

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

type CandidateTagDetail = {
    tagKey?: string;
    displayNameHe?: string;
    displayNameEn?: string;
    rawType?: string;
    context?: string;
    isCurrent?: boolean;
    isInSummary?: boolean;
    confidenceScore?: number;
};

const formatConfidenceLabel = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
    if (value >= 0.95) return 'בביטחון גבוה';
    if (value >= 0.8) return 'בביטחון בינוני';
    if (value >= 0.6) return 'בביטחון נמוך';
    return 'בביטחון מוגבל';
};

const buildTagTooltipText = (tag: string, detail?: CandidateTagDetail) => {
    if (!detail) return undefined;
    const descriptorParts: string[] = [];
    if (detail.rawType && detail.rawType !== tag) {
        descriptorParts.push(RAW_TYPE_LABELS[detail.rawType] || detail.rawType);
    }
    const contextLabel = detail.context ? CONTEXT_LABELS[detail.context] || detail.context : undefined;
    const temporalLabel = detail.isCurrent ? 'נוכחי' : 'ניסיון עבר';
    const summaryLabel = detail.isInSummary ? 'נכלל בסיכום' : undefined;
    const confidenceLabel = formatConfidenceLabel(detail.confidenceScore);
    const descriptor = descriptorParts.length ? `זוהה כ${descriptorParts.join(' ')}` : 'זוהה';
    const parts = [
        descriptor,
        contextLabel ? `בהקשר ${contextLabel}` : undefined,
        temporalLabel,
        summaryLabel,
        confidenceLabel,
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
    if (raw.includes('tool')) return 'skill';
    if (raw.includes('soft') || raw.includes('skill')) return 'skill';
    return 'skill';
};

const CandidateProfile: React.FC<CandidateProfileProps> = ({
  candidateData,
  onMatchJobsClick,
  onScreenCandidateClick,
  onOpenMessageModal,
  onTagsChange,
  onFormChange,
  isFavorite,
  onToggleFavorite,
  onReportInaccuracy,
  hideActions = false,
  isSaving = false,
  onSaveCandidate,
  saveStatusMessage,
  profiles = [],
  activeProfileId,
  onSwitchProfile,
  onAddProfile,
}) => {
  const { t } = useLanguage();
  const jobMatchesCount = 8; 
  const getInitials = (name: string) => (name || '').split(' ').map(n => n[0]).join('');
  const candidateInitials = getInitials(candidateData.fullName);

  const currentProfileId = activeProfileId ?? candidateData.id;
  const [fetchedProfiles, setFetchedProfiles] = useState<MultiProfileOption[]>([]);
  const profileList = fetchedProfiles;
  const activeProfileOption = profileList.find((p) => p.id === currentProfileId) || profileList[0];
  const showProfileSwitcher = profileList.length > 0;
  const [isSwitcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const handleProfileChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = event.target.value;
    const newProfile = profileList.find(profile => profile.id?.toString() === selectedId);
    onSwitchProfile?.(newProfile?.id ?? selectedId);
  };

  const tagDetailLookup = useMemo(() => {
    const map = new Map<string, CandidateTagDetail>();
    (candidateData.tagDetails || []).forEach((detail: CandidateTagDetail) => {
      [detail.tagKey, detail.displayNameHe, detail.displayNameEn].forEach((key) => {
        if (typeof key === 'string' && key.trim()) {
          map.set(key.trim(), detail);
        }
      });
    });
    return map;
  }, [candidateData.tagDetails]);

  const getTagTooltip = useCallback((tag: string) => {
    const detail = tagDetailLookup.get(tag);
    return buildTagTooltipText(tag, detail);
  }, [tagDetailLookup]);

  const apiBase = import.meta.env.VITE_API_BASE || '';
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<{ inProgress: boolean; type: 'resume' | 'profile'; message: string }>({
      inProgress: false,
      type: 'resume',
      message: '',
  });
  const authHeaders = () => {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const candidateId = candidateData.backendId || candidateData.id;
  const [activeTagRow, setActiveTagRow] = useState<SmartTagType | null>(null);
  const [newTagText, setNewTagText] = useState<Record<SmartTagType, string>>({});
  const [isSavingTag, setIsSavingTag] = useState(false);
  const tagInputRefs = useRef<Record<SmartTagType, HTMLInputElement | null>>({});
  const [pendingTagDetails, setPendingTagDetails] = useState<Record<string, SmartTagType>>({});
  const [expandedSections, setExpandedSections] = useState<Set<SmartTagType>>(new Set());

  const groupedSmartTags = useMemo(() => {
    const base = TAG_LINE_CONFIG.reduce<Record<SmartTagType, SmartTagData[]>>((acc, section) => {
      acc[section.type] = [];
      return acc;
    }, {} as Record<SmartTagType, SmartTagData[]>);

    const tagsList: string[] = Array.isArray(candidateData.tags) ? candidateData.tags : [];
    tagsList.forEach((tag) => {
      const detail = tagDetailLookup.get(tag);
      const pendingType = pendingTagDetails[tag];
      if (pendingType && !detail) return; // wait for confirmed detail before adding fallback
      const type = inferSmartTagType(detail);
      const entry: SmartTagData = {
        label: tag,
        type,
        isVerified: Boolean(detail?.isCurrent),
        isAiSuggested: false,
        customTooltip: getTagTooltip(tag),
      };
      if (!base[type]) {
        base[type] = [];
      }
      base[type].push(entry);
    });

    Object.entries(pendingTagDetails).forEach(([label, type]) => {
      const normalizedType = type as SmartTagType;
      const exists = base[normalizedType]?.some(tagItem => tagItem.label === label);
      if (!exists) {
        base[normalizedType].push({
          label,
          type: normalizedType,
          isVerified: false,
          isAiSuggested: false,
        });
      }
    });

    return base;
  }, [candidateData.tags, tagDetailLookup, getTagTooltip, pendingTagDetails]);
  useEffect(() => {
    if (activeTagRow) {
      tagInputRefs.current[activeTagRow]?.focus();
    }
  }, [activeTagRow]);

  useEffect(() => {
    setPendingTagDetails(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(prev).forEach(([label, type]) => {
        const detail = tagDetailLookup.get(label);
        if (detail && inferSmartTagType(detail) === type) {
          delete next[label];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tagDetailLookup]);

  const toggleSectionExpansion = useCallback((type: SmartTagType) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const experienceDistribution = useMemo(() => {
    const aggregated = buildExperienceDistributionFromWork(candidateData.workExperience);
    if (aggregated.length) {
      return aggregated;
    }
    const fallback = candidateData.industryAnalysis?.industries;
    if (Array.isArray(fallback) && fallback.length) {
      return fallback.map((item, index) => ({
        ...item,
        color: item.color || EXPERIENCE_COLORS[index % EXPERIENCE_COLORS.length],
      }));
    }
    return mockExperienceDistribution;
  }, [candidateData.workExperience, candidateData.industryAnalysis]);

  const handleCreateCandidateTag = async (type: SmartTagType, label: string) => {
    if (!candidateId || !label.trim()) {
      setActiveTagRow(null);
      setNewTagText(prev => ({ ...prev, [type]: '' }));
      return;
    }

    setIsSavingTag(true);
    setPendingTagDetails(prev => ({
      ...prev,
      [label.trim()]: type,
    }));
    try {
      const payload = {
        candidate_id: candidateId,
        tagKey: label.trim(),
        displayNameHe: label.trim(),
        raw_type: type,
      };
      const res = await fetch(`${apiBase}/api/admin/candidate-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text() || 'Failed to add tag');
      await res.json();
      const currentTags = Array.isArray(candidateData.tags) ? candidateData.tags : [];
      if (!currentTags.includes(label.trim())) {
        onTagsChange([...currentTags, label.trim()]);
      }
    } catch (err) {
      console.error('Failed to add tag', err);
    } finally {
      setIsSavingTag(false);
      setActiveTagRow(null);
      setNewTagText(prev => ({ ...prev, [type]: '' }));
    }
  };

  const handleTagInputBlur = (type: SmartTagType) => {
    const currentValue = newTagText[type] || '';
    if (!currentValue.trim()) {
      setActiveTagRow(null);
      setNewTagText(prev => ({ ...prev, [type]: '' }));
      return;
    }
    handleCreateCandidateTag(type, currentValue.trim());
  };

  const handleTagInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, type: SmartTagType) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const currentValue = newTagText[type] || '';
      if (currentValue.trim()) {
        handleCreateCandidateTag(type, currentValue.trim());
      }
    } else if (event.key === 'Escape') {
      setActiveTagRow(null);
      setNewTagText(prev => ({ ...prev, [type]: '' }));
    }
  };

  const handleAddTagRow = (type: SmartTagType) => {
    setActiveTagRow(type);
    setNewTagText(prev => ({ ...prev, [type]: '' }));
  };

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
      return btoa(String.fromCharCode(...bytes));
  };

  const uploadToS3 = async (file: File) => {
      if (!candidateId) {
          alert('אנא שמור קודם את הפרופיל לפני העלאת קובץ.');
          return;
      }
      const folder = 'resumes';
      try {
          setUploadState({ inProgress: true, type: 'resume', message: 'מכין העלאה...' });
          const presignRes = await fetch(`${apiBase}/api/candidates/${candidateId}/upload-url`, {
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
          setUploadState({ inProgress: true, type: 'resume', message: 'מעלה קובץ...' });
          const putRes = await fetch(uploadUrl, {
              method: 'PUT',
              headers: Object.keys(headers).length ? headers : undefined,
              body: file,
          });
          if (!putRes.ok) throw new Error('Upload to S3 failed');
          setUploadState({ inProgress: true, type: 'resume', message: 'שומר קובץ...' });
          const attachRes = await fetch(`${apiBase}/api/candidates/${candidateId}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ key, type: 'resume' }),
          });
          if (!attachRes.ok) throw new Error('Failed to attach media');
          const updated = await attachRes.json();
          onFormChange({ ...candidateData, ...updated });
      } catch (err: any) {
          console.error('Resume upload failed', err);
          alert(err?.message || 'העלאת קובץ נכשלה.');
      } finally {
          setUploadState({ inProgress: false, type: 'resume', message: '' });
      }
  };

  const handleResumeSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          await uploadToS3(file);
          e.target.value = '';
      }
  };

  const handleDownloadCv = () => {
      if (candidateData.resumeUrl) {
          window.open(candidateData.resumeUrl, '_blank');
      } else {
          alert('אין קובץ קורות חיים להורדה כרגע.');
      }
  };
  useEffect(() => {
    if (!apiBase) return;
    const controller = new AbortController();
    const backendId = candidateData.backendId || candidateData.id;
    if (!backendId) return;

    const loadProfiles = async () => {
      try {
        const res = await fetch(`${apiBase}/api/candidates/${backendId}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        const userId = data.userId || data.userId?.id;
        if (!userId) return;

        const listRes = await fetch(`${apiBase}/api/candidates/by-user/${userId}`, { signal: controller.signal });
        if (!listRes.ok) return;

        const payload = await listRes.json();
        const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
        const options = list
          .map((item: any) => ({
            id: item.id,
            profileName: item.profileName || item.title || item.fullName || 'פרופיל',
            profilePicture: item.profilePicture,
            isDeleted: Boolean(item.isDeleted),
          }))
          .filter(Boolean);
        setFetchedProfiles(options);
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.error('Failed to fetch linked profiles', err);
      }
    };

    loadProfiles();
    return () => controller.abort();
  }, [apiBase, candidateData.backendId, candidateData.id]);

  const companyName = "AllJobs";
  const companyInitials = getInitials(companyName);
  
  const openModal = (mode: MessageMode) => {
    onOpenMessageModal({
        mode,
        candidateName: candidateData.fullName,
        candidatePhone: candidateData.phone,
    });
  };

  const profileVersionCount = profileList.length;
  const getProfileYear = (profile: MultiProfileOption) => {
    const createdAt = (profile as any).createdAt || (profile as any).updatedAt;
    if (createdAt) {
      const resolved = new Date(createdAt);
      if (!Number.isNaN(resolved.getTime())) return resolved.getFullYear();
    }
    return new Date().getFullYear();
  };

  const handleDocumentClick = (event: MouseEvent) => {
    if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
      setSwitcherOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  const handleProfileSelect = (profile: MultiProfileOption) => {
    setSwitcherOpen(false);
    onSwitchProfile?.(profile.id);
  };

    const renderProfileSwitcher = () => {
    if (!showProfileSwitcher) return null;
    const yearLabel = getProfileYear(activeProfileOption || profileList[0]);
        const normalizedProfileList = profileList.map((profile) => ({
            ...profile,
            isDeleted: Boolean(profile.isDeleted),
        }));
    return (
      <div ref={switcherRef} className="absolute top-4 left-4 z-30 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSwitcherOpen((prev) => !prev)}
          className="group flex items-center gap-2 px-3 py-1.5 rounded-full transition-all text-xs font-semibold border backdrop-blur-sm shadow-sm bg-white/80 text-text-subtle border-border-default hover:text-primary-600 hover:border-primary-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3.5 h-3.5 text-primary-500">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{activeProfileOption?.profileName || 'פרופיל'}</span>
          <span className="w-px h-3 bg-current opacity-20" />
          <span className="font-mono">{yearLabel}</span>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className={`w-3 h-3 opacity-50 transition-transform duration-200 ${isSwitcherOpen ? '-rotate-180' : ''}`}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <button
          onClick={onAddProfile}
          className="p-2 text-text-subtle hover:text-primary-600 transition-colors bg-white/80 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md border border-border-default"
          title="צור פרופיל חדש"
        >
          <PlusIcon className="w-4 h-4" />
        </button>

        {isSwitcherOpen && (
          <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-border-default z-50 overflow-hidden animate-fade-in origin-top-right">
            <div className="p-2.5 bg-bg-subtle/50 border-b border-border-default flex justify-between items-center">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">היסטוריית גרסאות</p>
              <span className="text-[10px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">{profileVersionCount} גרסאות</span>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {normalizedProfileList.map((profile, index) => {
                const isActive = profile.id === activeProfileOption?.id;
                const profileYear = getProfileYear(profile);
                const sourceLabel = (profile as any).source || companyName;
                const baseRowClasses = [
                    'px-3 py-2.5 border-b border-border-subtle last:border-0 hover:bg-primary-50 transition-colors cursor-pointer group flex items-start gap-3',
                    isActive ? 'bg-primary-50/60' : '',
                    profile.isDeleted ? 'bg-red-50/60 border-red-100' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div
                    key={`${profile.id}-${index}`}
                    onClick={() => handleProfileSelect(profile)}
                    className={baseRowClasses}
                    aria-disabled={profile.isDeleted}
                  >
                    <div className="mt-0.5 flex flex-col items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-primary-500' : 'bg-border-default'}`}></div>
                    </div>
                      <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className={`text-xs font-bold truncate ${profile.isDeleted ? 'text-red-600' : isActive ? 'text-primary-900' : 'text-text-default'}`}>
                          {profile.profileName}
                          {profile.isDeleted && ' (נמחק)'}
                        </p>
                        {profile.isDeleted && (
                          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">מחוק</span>
                        )}
                        <button
                          type="button"
                          className={`ml-2 text-text-subtle hover:text-primary-600 transition-colors ${isActive ? 'text-primary-500 opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          title={isActive ? 'בטל נעיצה' : 'בחר כפרופיל ברירת מחדל'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-3 h-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-text-muted">
                        <span>{profileYear}</span>
                        <span>•</span>
                        <span className="truncate max-w-[80px]">{sourceLabel}</span>
                        {isActive && (
                          <span className="bg-green-100 text-green-700 px-1 rounded ml-1">פעיל</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderProfileSwitcher()}

      <div className="candidate-profile-card bg-gradient-to-br from-primary-50/80 via-bg-card to-primary-50/40 rounded-2xl shadow-lg p-4 md:p-5 relative mb-6 border border-border-subtle">
         {/* Favorite Button */}
         <button 
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }} 
            className="absolute top-4 left-4 p-2 text-text-subtle hover:text-primary-600 transition-colors z-30 bg-bg-card/50 rounded-full shadow-sm hover:bg-bg-card"
            title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
        >
            {isFavorite ? <BookmarkIconSolid className="w-6 h-6 text-primary-500" /> : <BookmarkIcon className="w-6 h-6" />}
        </button>

        {/* Report Flag Button - Only if handler provided */}
        {onReportInaccuracy && (
            <button 
                onClick={(e) => { e.stopPropagation(); onReportInaccuracy(); }} 
                className="absolute top-4 left-16 p-2 text-text-subtle hover:text-red-500 transition-colors z-30 bg-bg-card/50 rounded-full shadow-sm hover:bg-bg-card"
                title="דווח על אי-דיוק"
            >
                <FlagIcon className="w-6 h-6" />
            </button>
        )}
        
        <div className="flex flex-col lg:flex-row justify-between items-stretch gap-6">
          
          {/* Right Side - Candidate Info */}
          <div className="w-full lg:w-7/12 relative z-10 flex flex-col justify-center">
              <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right">
                  <div className="relative flex-shrink-0 hidden sm:block">
                      <div className="w-24 h-24 rounded-full border-4 border-bg-card shadow-md overflow-hidden ring-2 ring-primary-100">
                        <AvatarIcon initials={candidateInitials} size={96} fontSize={42} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                      </div>
                      <div className="absolute top-0 -right-2 w-8 h-8 bg-bg-card rounded-full flex items-center justify-center shadow-sm border border-border-subtle" title={`מקור: ${companyName}`}>
                        <AvatarIcon initials={companyInitials} size={24} fontSize={10} bgClassName="fill-gray-100" textClassName="fill-gray-600 font-bold" />
                      </div>
                  </div>
                  <div className="w-full sm:mr-6 flex-1">
                      <div className="flex items-center justify-center sm:justify-start flex-wrap mb-1 gap-3">
                          <EditableField
                              value={candidateData.fullName || ''}
                              placeholder="שם מועמד"
                              onSave={(val) => onFormChange({ ...candidateData, fullName: val })}
                              className="text-3xl font-extrabold text-text-default tracking-tight"
                          />
                          <div className="flex items-center text-text-muted text-sm bg-bg-subtle/50 px-2 py-0.5 rounded-md border border-border-subtle gap-1">
                                <EditableField
                                    value={candidateData.age ? String(candidateData.age) : ''}
                                    placeholder="גיל"
                                    onSave={(val) => onFormChange({ ...candidateData, age: val })}
                                    className="font-semibold min-w-[40px]"
                                />
                                <span className="mx-1.5">•</span>
                                <MapPinIcon className="w-3.5 h-3.5 ml-1" />
                                <EditableField
                                    value={candidateData.address || ''}
                                    placeholder="מיקום"
                                    onSave={(val) => onFormChange({ ...candidateData, address: val })}
                                    className="min-w-[80px]"
                                />
                          </div>
                      </div>
                      
                      <div className="mb-3">
                          <EditableField 
                              value={candidateData.title || ''} 
                              placeholder={t('profile.main_profile_label')} 
                              onSave={(val) => onFormChange({ ...candidateData, title: val })}
                              className="text-lg font-bold text-primary-700"
                          />
                      </div>

                      <div className="mb-4 bg-bg-subtle/30 p-3 rounded-lg border border-border-subtle/50">
                         <EditableField 
                              value={candidateData.professionalSummary || ''} 
                              placeholder={t('profile.summary_placeholder')} 
                              onSave={(val) => onFormChange({ ...candidateData, professionalSummary: val })}
                              className="text-text-default text-sm leading-relaxed"
                              multiline
                              collapsible={true}
                          />
                      </div>

                 
                        

                      <div className="w-full mt-auto">
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">{t('profile.tags_skills')}</h4>
                </div>
                <div className="space-y-4">
                  {TAG_LINE_CONFIG.map(section => {
                    const isActiveRow = activeTagRow === section.type;
                    return (
                      <div key={section.type} className="space-y-2 group/row">
                        <div className="flex items-center gap-2 text-[11px] text-text-muted">
                          <section.icon className="w-4 h-4 text-primary-500" />
                          <span className="font-semibold text-text-default">{section.label}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 min-h-[36px]">
                          {(() => {
                            const tags = groupedSmartTags[section.type] || [];
                            const isExpanded = expandedSections.has(section.type);
                            const visibleTags = isExpanded ? tags : tags.slice(0, MAX_VISIBLE_TAGS);
                            const extraCount = Math.max(0, tags.length - MAX_VISIBLE_TAGS);
                            return (
                              <>
                                {visibleTags.map(tag => (
                                  <SmartTag key={`${section.type}-${tag.label}`} {...tag} />
                                ))}
                                {tags.length ? null : (
                                  <span className="text-[11px] text-text-subtle italic">לא מוגדר</span>
                                )}
                                {tags.length > MAX_VISIBLE_TAGS && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSectionExpansion(section.type)}
                                    className="text-[11px] font-semibold text-primary-600 border border-primary-200 rounded-full px-3 py-1 opacity-80 hover:opacity-100 transition"
                                  >
                                    {isExpanded ? 'הסתר' : `+${extraCount}`}
                                  </button>
                                )}
                              </>
                            );
                          })()}
                          {isActiveRow ? (
                            <input
                              ref={(el) => {
                                if (el) tagInputRefs.current[section.type] = el;
                                else tagInputRefs.current[section.type] = null;
                              }}
                              value={newTagText[section.type] || ''}
                              onChange={(e) => setNewTagText(prev => ({ ...prev, [section.type]: e.target.value }))}
                              onBlur={() => handleTagInputBlur(section.type)}
                              onKeyDown={(e) => handleTagInputKeyDown(e, section.type)}
                              placeholder={`הוסף תגית חדשה`}
                              className="bg-white border border-border-default rounded-full px-3 py-1.5 text-xs focus:ring-2 focus:ring-primary-500 transition-colors"
                              disabled={isSavingTag && isActiveRow}
                              autoComplete="off"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddTagRow(section.type)}
                              className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded-full hover:bg-bg-subtle text-text-muted hover:text-primary-600"
                              title="הוסף תגית לקטגוריה זו"
                            >
                              <PlusIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                      
                      {!hideActions && (
                          <>
                              <div className="flex flex-wrap items-center justify-start gap-3 mt-6 pt-4 border-t border-border-default/50">
                              <DevAnnotation
                                  title="AI Matching"
                                  description="Calculates relevance score based on candidate skills vs job requirements."
                                  logic={["Vectors Embedding for skills", "Industry overlap analysis"]}
                              >
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onMatchJobsClick(); }}
                                      className="flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20"
                                  >
                                      <MatchIcon className="w-5 h-5" />
                                      <span>{t('profile.matches')} ({jobMatchesCount})</span>
                                  </button>
                              </DevAnnotation>
                              <button
                                  onClick={(e) => { e.stopPropagation(); onScreenCandidateClick(); }}
                                  className="flex items-center justify-center gap-2 bg-white border border-border-default text-text-default font-bold py-2 px-4 rounded-xl hover:bg-bg-hover transition-all shadow-sm"
                              >
                                  <ClipboardDocumentListIcon className="w-5 h-5 text-text-muted" />
                                  <span>{t('profile.screen_candidate')}</span>
                              </button>
                              {onSaveCandidate && (
                                  <button
                                      onClick={(e) => { e.stopPropagation(); onSaveCandidate(); }}
                                      disabled={isSaving}
                                      className="flex items-center justify-center gap-2 bg-primary-500 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-600 transition-all shadow-md disabled:opacity-60"
                                  >
                                      <span>{isSaving ? 'שומר/ת...' : 'שמירת פרטים'}</span>
                                  </button>
                              )}
                              </div>
                              {saveStatusMessage && (
                                  <p className="text-xs text-text-muted mt-2 w-full">{saveStatusMessage}</p>
                              )}
                          </>
                      )}

                  </div>
              </div>
          </div>

          {/* Left Side - Timeline & Analysis - Hidden on mobile */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between hidden lg:flex relative z-0 h-full border-r border-border-default/50 pr-6">
              
               {/* Timeline Section */}
              <div className="mb-2">
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">{t('profile.recent_activity')}</h4>
                  <div className="flex justify-between items-stretch gap-2">
                      <TimelineEvent day="14" month="יולי" time="13:00" title="קו''ח" company="בזק" color="primary" />
                      <TimelineEvent day="10" month="יולי" time="09:00" title="שיחה" company="Wix" color="accent" />
                      <TimelineEvent day="06" month="יולי" time="10:00" title="ראיון" company="Fiverr" color="secondary" />
                  </div>
              </div>

              {/* Visual Experience Distribution Bar - Horizontal Compact */}
              <ExperienceBar 
                 data={experienceDistribution} 
                 smartTags={candidateData.industryAnalysis?.smartTags}
              />

              
          </div>
        </div>
      </div>
        <input
          ref={resumeInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.png,.jpg"
          className="hidden"
          onChange={handleResumeSelected}
        />
    </div>
  );
};

export default CandidateProfile;
