import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    BriefcaseIcon,
    AcademicCapIcon,
    WrenchScrewdriverIcon,
    SparklesIcon,
    PlusIcon,
    CheckCircleIcon,
    XMarkIcon,
    ClockIcon,
} from './Icons';
import { SmartTagType, SmartTagData, SmartTagTooltipPanel, SmartTagMode } from './SmartTagTypes';
import { isAcademicDegreeCatalogTag } from '../utils/academicDegreeCatalogTag';

const TYPE_DEFAULT_BORDER: Record<SmartTagType, string> = {
    role: 'border-primary-600',
    seniority: 'border-primary-400',
    skill: 'border-sky-200',
    tool: 'border-gray-200',
    soft: 'border-slate-200',
    industry: 'border-emerald-100',
    certification: 'border-orange-100',
    language: 'border-pink-100',
    degree: 'border-orange-100',
    education: 'border-orange-100',
};

const modeBorderClass = (mode: SmartTagMode | undefined, type: SmartTagType): string => {
    if (mode === 'mandatory') {
        return 'border-[3px] border-green-500 ring-2 ring-green-400/70 shadow-[0_0_0_1px_rgba(34,197,94,0.45),0_0_10px_rgba(34,197,94,0.35)]';
    }
    if (mode === 'negative') {
        return 'border-[3px] border-red-500 ring-2 ring-red-400/70 shadow-[0_0_0_1px_rgba(239,68,68,0.45),0_0_10px_rgba(239,68,68,0.35)]';
    }
    return TYPE_DEFAULT_BORDER[type];
};

const modeToggleTitle = (mode: SmartTagMode | undefined): string => {
    const current =
        mode === 'mandatory' ? 'חובה' : mode === 'negative' ? 'שלילי' : 'רגיל';
    return `מצב נוכחי: ${current} — לחץ לשינוי (רגיל / חובה / שלילי)`;
};

const TYPE_LABELS_HE: Record<SmartTagType, string> = {
    role: 'תפקיד',
    seniority: 'בכירות',
    skill: 'מיומנות',
    tool: 'כלי עבודה',
    soft: 'כישורים רכים',
    industry: 'תעשייה',
    certification: 'השכלה/הסמכה',
    language: 'שפה',
    degree: 'השכלה',
    education: 'השכלה',
};

function panelFromLegacyTooltip(
    label: string,
    type: SmartTagType,
    customTooltip: string
): SmartTagTooltipPanel {
    const lines = customTooltip
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const first = lines[0] || '';
    const m = first.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) {
        const rest = lines.slice(1).join('\n').trim();
        return {
            categoryLabel: m[2].trim(),
            title: m[1].trim(),
            classificationLogic: rest || undefined,
        };
    }
    return {
        categoryLabel: TYPE_LABELS_HE[type],
        title: label,
        classificationLogic: lines.length ? lines.join('\n') : customTooltip.trim(),
    };
}

interface SmartTagBadgeProps extends SmartTagData {
    onRemove?: () => void;
    onToggleMode?: () => void;
    onSearch?: () => void;
}

const SmartTagBadge: React.FC<SmartTagBadgeProps> = ({
    label,
    type,
    mode = 'normal' as SmartTagMode,
    isVerified,
    isAiSuggested,
    customTooltip,
    tooltipPanel: panelProp,
    onRemove,
    onToggleMode,
    onSearch,
}) => {
    const [hovered, setHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'above' | 'below' } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const updateTooltipPos = useCallback(() => {
        const el = wrapRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const placement = rect.top > 220 ? 'above' : 'below';
        setTooltipPos({
            top: placement === 'above' ? rect.top - 10 : rect.bottom + 10,
            left: Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2)),
            placement,
        });
    }, []);

    const panel = useMemo(() => {
        if (panelProp) return panelProp;
        if (customTooltip?.trim()) return panelFromLegacyTooltip(label, type, customTooltip);
        return null;
    }, [panelProp, customTooltip, label, type]);

    const hasPopover = Boolean(panel);
    const sourceLabel = isAiSuggested ? 'AI (בינה מלאכותית)' : 'הוזן ידנית / מועמד';
    const canToggleMode = Boolean(onToggleMode);
    const canSearch = Boolean(onSearch);

    const baseClasses =
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all select-none border whitespace-nowrap relative';
    const configs: Record<SmartTagType, string> = {
        role: 'bg-primary-600 text-white font-bold shadow-sm',
        seniority: 'bg-white text-primary-700 font-bold',
        skill: 'bg-sky-50 text-sky-800 font-semibold',
        tool: 'bg-gray-100 text-gray-800 font-semibold',
        soft: 'bg-transparent text-slate-600 italic font-medium',
        industry: 'bg-emerald-50 text-emerald-800 font-bold',
        certification: 'bg-orange-50 text-orange-800 font-bold',
        language: 'bg-pink-50 text-pink-700 font-medium',
        degree: 'bg-orange-50 text-orange-800 font-bold',
        education: 'bg-orange-50 text-orange-800 font-bold',
    };

    const confidenceDot =
        panel?.confidenceTone === 'medium'
            ? 'bg-amber-500'
            : panel?.confidenceTone === 'low'
              ? 'bg-slate-400'
              : 'bg-emerald-500';

    useEffect(() => {
        if (!hovered) {
            setTooltipPos(null);
            return;
        }
        updateTooltipPos();
        const reposition = () => updateTooltipPos();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [hovered, updateTooltipPos]);

    const handleBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (canSearch) {
            onSearch?.();
            return;
        }
        if (canToggleMode) {
            onToggleMode?.();
        }
    };

    const badgeClass = `${baseClasses} ${configs[type]} ${modeBorderClass(mode, type)} ${
        isAiSuggested ? 'border-dashed' : 'border-solid'
    } ${canToggleMode || canSearch || hasPopover ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : 'cursor-default'}`;

    return (
        <div
            ref={wrapRef}
            className="relative inline-flex group/tag"
            onMouseEnter={() => {
                setHovered(true);
                updateTooltipPos();
            }}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                type="button"
                onClick={handleBadgeClick}
                className={badgeClass}
                title={
                    canSearch
                        ? 'חיפוש מועמדים עם תואר אקדמי'
                        : canToggleMode
                          ? modeToggleTitle(mode)
                          : undefined
                }
                aria-label={
                    canSearch
                        ? `${label} — חיפוש מועמדים עם תואר אקדמי`
                        : mode === 'mandatory'
                          ? `${label} — תגית חובה`
                          : mode === 'negative'
                            ? `${label} — תגית שלילית`
                            : label
                }
            >
                {isAiSuggested && <SparklesIcon className="w-3 h-3 opacity-70" />}
                <span>{label}</span>
                {isVerified && <CheckCircleIcon className="w-3 h-3 text-current opacity-80" />}
            </button>

            {hasPopover && panel && hovered && tooltipPos && createPortal(
                <div
                    role="tooltip"
                    aria-label={`פרטי תגית: ${panel.title}`}
                    style={{
                        position: 'fixed',
                        top: tooltipPos.top,
                        left: tooltipPos.left,
                        transform: tooltipPos.placement === 'above' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                        zIndex: 99999,
                    }}
                    className="relative pointer-events-auto animate-fade-in max-w-[min(400px,calc(100vw-2rem))]"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                >
                    <div
                        className="flex flex-col gap-4 p-5 w-[min(400px,calc(100vw-2rem))] min-w-[280px] text-right bg-white dark:bg-slate-900 backdrop-blur-xl rounded-2xl shadow-2xl border-2 border-slate-300 dark:border-slate-600 ring-1 ring-black/10 dark:ring-white/10 relative whitespace-normal break-words max-h-[min(60vh,400px)] overflow-y-auto custom-scrollbar"
                        dir="rtl"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-500 via-secondary-500 to-primary-500 opacity-80 rounded-t-2xl shrink-0" />
                        <div className="flex justify-between items-start mt-1 shrink-0">
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider">
                                    {panel.categoryLabel}
                                </span>
                                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight break-words">
                                    {panel.title}
                                </h3>
                            </div>
                        </div>

                        {(panel.experienceYears || panel.confidenceLabel) && (
                            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shrink-0">
                                <div className="flex-1 flex flex-col gap-1 min-w-0">
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                        {panel.experienceLabel || 'ניסיון מצטבר'}
                                    </span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {panel.experienceYears ? (
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                {panel.experienceYears}
                                            </span>
                                        ) : (
                                            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                                לא זמין
                                            </span>
                                        )}
                                        {panel.experienceIsCurrent ? (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                נוכחי
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                {panel.confidenceLabel ? (
                                    <>
                                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 shrink-0" />
                                        <div className="flex-1 flex flex-col gap-1 min-w-0">
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                                                רמת ביטחון
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex items-center justify-center shrink-0">
                                                    <div className={`w-2 h-2 rounded-full ${confidenceDot}`} />
                                                    {panel.confidenceTone === 'high' ? (
                                                        <div
                                                            className={`absolute inset-0 w-2 h-2 rounded-full ${confidenceDot} animate-ping opacity-40`}
                                                        />
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                        {panel.confidenceLabel}
                                                    </span>
                                                    {panel.confidenceSub ? (
                                                        <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-none">
                                                            {panel.confidenceSub}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        )}

                        {panel.sourcePath ? (
                            <div className="flex flex-col gap-1 shrink-0">
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                    מקור המידע
                                </span>
                                <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-700 font-mono break-words">
                                    {panel.sourcePath}
                                </div>
                            </div>
                        ) : null}

                        {(panel.classificationLogic || panel.selectionReason || panel.cvQuote) && (
                            <div className="flex flex-col gap-3 mt-1 shrink-0">
                                {panel.classificationLogic ? (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                            לוגיקת סיווג
                                        </span>
                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-r-2 border-primary-300 dark:border-primary-600 pr-3 break-words whitespace-pre-wrap">
                                            {panel.classificationLogic}
                                        </p>
                                    </div>
                                ) : null}
                                {(panel.selectionReason || panel.cvQuote) && (
                                    <div className="flex flex-col gap-1">
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                            סיבת בחירה
                                        </span>
                                        <div className="flex flex-col gap-2 border-r-2 border-secondary-300 dark:border-secondary-600 pr-3">
                                            {panel.selectionReason ? (
                                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
                                                    {panel.selectionReason}
                                                </p>
                                            ) : null}
                                            {panel.cvQuote ? (
                                                <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 relative overflow-hidden mt-1">
                                                    <div className="absolute top-0 right-0 w-1 h-full bg-secondary-400 dark:bg-secondary-500" />
                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mb-1">
                                                        ביטוי מפורש מקורות החיים:
                                                    </span>
                                                    <p className="text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed break-words">
                                                        <span className="text-secondary-500 font-bold">&quot;</span>
                                                        {panel.cvQuote}
                                                        <span className="text-secondary-500 font-bold">&quot;</span>
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {panel.professionalSummary ? (
                            <div className="mt-1 bg-primary-50/50 dark:bg-primary-900/20 p-4 rounded-xl border border-primary-100/50 dark:border-primary-800/50 shrink-0">
                                <span className="text-[10px] text-primary-600 dark:text-primary-400 font-bold uppercase tracking-wider mb-1.5 block">
                                    סיכום מקצועי
                                </span>
                                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                                    {panel.professionalSummary}
                                </p>
                            </div>
                        ) : null}

                        <div className="mt-1 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
                                <ClockIcon className="w-3.5 h-3.5 shrink-0" />
                                <span className="text-[10px] font-medium">
                                    {panel.footerDate || sourceLabel}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {onRemove ? (
                                    <button
                                        type="button"
                                        onClick={() => onRemove()}
                                        className="text-[10px] font-bold text-red-600 hover:text-red-700 pointer-events-auto"
                                    >
                                        הסר תגית
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div
                        className={`absolute left-1/2 -translate-x-1/2 border-[8px] border-transparent pointer-events-none ${
                            tooltipPos.placement === 'above'
                                ? 'top-full border-t-white dark:border-t-slate-900 drop-shadow-sm'
                                : 'bottom-full border-b-white dark:border-b-slate-900'
                        }`}
                    />
                </div>,
                document.body,
            )}

            {onRemove && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                    className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border border-white bg-white text-gray-500 flex items-center justify-center text-[10px] transition z-[1] ${
                        hovered ? 'opacity-100' : 'opacity-0 group-hover/tag:opacity-100'
                    }`}
                    aria-label="הסר תגית"
                >
                    <XMarkIcon className="w-3 h-3" />
                </button>
            )}
        </div>
    );
};

type RowAction = 'qualification' | 'tagSelector';

const rowConfigs: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    types: SmartTagType[];
    limit: number;
    priorityType?: SmartTagType;
    buttonAction?: RowAction;
}> = [
    {
        id: 'roles',
        label: 'תפקיד והקשר',
        icon: BriefcaseIcon,
        iconColor: 'text-purple-500',
        types: ['role', 'seniority', 'industry'],
        limit: 4,
        priorityType: 'industry',
        buttonAction: 'tagSelector',
    },
    {
        id: 'qualifications',
        label: 'השכלה ושפות',
        icon: AcademicCapIcon,
        iconColor: 'text-orange-500',
        types: ['certification', 'language', 'degree', 'education'],
        limit: 4,
        buttonAction: 'qualification',
    },
    {
        id: 'tools',
        label: 'כלים ומיומנויות',
        icon: WrenchScrewdriverIcon,
        iconColor: 'text-blue-600',
        types: ['skill', 'tool'],
        limit: 4,
        buttonAction: 'tagSelector',
    },
    {
        id: 'soft',
        label: 'כישורים רכים',
        icon: SparklesIcon,
        iconColor: 'text-amber-500',
        types: ['soft'],
        limit: 4,
        buttonAction: 'tagSelector',
    },
];

const tagIdentity = (tag: SmartTagData): string =>
    `${tag.type}::${String(tag.label || '').trim().toLowerCase()}`;

/** Deduplicate by type+label while preserving first occurrence order. */
const dedupeTags = (tags: SmartTagData[]): SmartTagData[] => {
    const seen = new Set<string>();
    return tags.filter((tag) => {
        const key = tagIdentity(tag);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const getVisibleTags = (
    tags: SmartTagData[],
    limit: number,
    priorityType?: SmartTagType,
): SmartTagData[] => {
    if (!tags.length) return [];
    if (tags.length <= limit) return tags;
    const visible = tags.slice(0, limit);
    if (priorityType) {
        const hasPriorityVisible = visible.some((tag) => tag.type === priorityType);
        if (!hasPriorityVisible) {
            const priorityTag = tags.find((tag) => tag.type === priorityType);
            if (priorityTag) {
                visible[limit - 1] = priorityTag;
            }
        }
    }
    return visible;
};

/** Tags not shown in the primary row (accounts for priority-type swaps). */
const getHiddenTags = (tags: SmartTagData[], visibleTags: SmartTagData[]): SmartTagData[] => {
    const visibleKeys = new Set(visibleTags.map(tagIdentity));
    return tags.filter((tag) => !visibleKeys.has(tagIdentity(tag)));
};

interface TagRowGroupProps {
    groupedSmartTags: Record<SmartTagType, SmartTagData[]>;
    onQualificationAdd?: () => void;
    onRowAdd?: (rowId: string) => void;
    onTagRemove?: (label: string) => void;
    onTagToggle?: (tagKey: string) => void;
    onTagSearch?: (tag: SmartTagData) => void;
}

const renderTagBadge = (
    tag: SmartTagData,
    key: string,
    onTagRemove?: (label: string) => void,
    onTagToggle?: (tagKey: string) => void,
    onTagSearch?: (tag: SmartTagData) => void,
) => {
    const opensDegreeSearch = Boolean(onTagSearch && isAcademicDegreeCatalogTag(tag.label, tag.tagKey));
    return (
        <SmartTagBadge
            key={key}
            {...tag}
            onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
            onToggleMode={
                !opensDegreeSearch && onTagToggle && tag.tagKey
                    ? () => onTagToggle(tag.tagKey!)
                    : undefined
            }
            onSearch={opensDegreeSearch ? () => onTagSearch!(tag) : undefined}
        />
    );
};

const TagRowGroup: React.FC<TagRowGroupProps> = ({
    groupedSmartTags,
    onQualificationAdd,
    onRowAdd,
    onTagRemove,
    onTagToggle,
    onTagSearch,
}) => {
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const toggleHiddenTags = (rowId: string) => {
        setExpandedRows((prev) => ({ ...prev, [rowId]: !prev[rowId] }));
    };
    const isSkillsToolsRow = (r: typeof rowConfigs[0]) =>
        r.types.length === 2 && r.types.includes('skill') && r.types.includes('tool');

    return (
        <div className="space-y-4 pt-2">
            {rowConfigs.map((row) => {
                const showButton =
                    Boolean(row.buttonAction) &&
                    ((row.buttonAction === 'qualification' && onQualificationAdd) ||
                        (row.buttonAction === 'tagSelector' && onRowAdd));
                const handleButtonClick = () => {
                    if (row.buttonAction === 'qualification') {
                        onQualificationAdd?.();
                    } else if (row.buttonAction === 'tagSelector') {
                        onRowAdd?.(row.id);
                    }
                };

                if (isSkillsToolsRow(row)) {
                    const skillTags = dedupeTags(groupedSmartTags['skill'] || []);
                    const toolTags = dedupeTags(groupedSmartTags['tool'] || []);
                    const visibleSkills = getVisibleTags(skillTags, row.limit);
                    const visibleTools = getVisibleTags(toolTags, row.limit);
                    const hiddenSkills = getHiddenTags(skillTags, visibleSkills);
                    const hiddenTools = getHiddenTags(toolTags, visibleTools);
                    const extraSkills = hiddenSkills.length;
                    const extraTools = hiddenTools.length;
                    const skillExpandKey = `${row.id}-skill`;
                    const toolExpandKey = `${row.id}-tool`;
                    return (
                        <div key={row.id} className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
                                    <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                                    <span>{row.label}</span>
                                </div>
                                {showButton && (
                                    <button
                                        type="button"
                                        onClick={handleButtonClick}
                                        className="flex-shrink-0 text-xs font-semibold text-primary-600 rounded-full border border-primary-200 px-2 py-0.5 flex items-center gap-1 hover:bg-primary-50 transition"
                                        aria-label="הוסף תגית חדשה"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            {/* Row 1: Skills */}
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    {visibleSkills.length === 0 && toolTags.length === 0 && (
                                        <span className="text-[11px] text-text-subtle italic">לא קיימות תגיות</span>
                                    )}
                                    {visibleSkills.map((tag) =>
                                        renderTagBadge(tag, `${row.id}-skill-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                                    )}
                                    {extraSkills > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleHiddenTags(skillExpandKey)}
                                            className="text-[11px] font-semibold text-primary-600 border border-primary-200 rounded-full px-3 py-1 opacity-80 hover:opacity-100 transition"
                                        >
                                            {expandedRows[skillExpandKey] ? 'הסתר' : `+${extraSkills}`}
                                        </button>
                                    )}
                                </div>
                                {extraSkills > 0 && expandedRows[skillExpandKey] && (
                                    <div className="flex flex-wrap gap-2">
                                        {hiddenSkills.map((tag) =>
                                            renderTagBadge(tag, `${row.id}-skill-hidden-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* Row 2: Tools */}
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    {visibleTools.map((tag) =>
                                        renderTagBadge(tag, `${row.id}-tool-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                                    )}
                                    {extraTools > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => toggleHiddenTags(toolExpandKey)}
                                            className="text-[11px] font-semibold text-primary-600 border border-primary-200 rounded-full px-3 py-1 opacity-80 hover:opacity-100 transition"
                                        >
                                            {expandedRows[toolExpandKey] ? 'הסתר' : `+${extraTools}`}
                                        </button>
                                    )}
                                </div>
                                {extraTools > 0 && expandedRows[toolExpandKey] && (
                                    <div className="flex flex-wrap gap-2">
                                        {hiddenTools.map((tag) =>
                                            renderTagBadge(tag, `${row.id}-tool-hidden-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }

                const tags = dedupeTags(row.types.flatMap((type) => groupedSmartTags[type] || []));
                const visibleTags = getVisibleTags(tags, row.limit, row.priorityType);
                const hiddenTags = getHiddenTags(tags, visibleTags);
                const extraCount = hiddenTags.length;

                return (
                    <div key={row.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-muted">
                                <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                                <span>{row.label}</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {visibleTags.length === 0 && (
                                <span className="text-[11px] text-text-subtle italic">לא קיימות תגיות</span>
                            )}
                            {visibleTags.map((tag) =>
                                renderTagBadge(tag, `${row.id}-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                            )}
                            {extraCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => toggleHiddenTags(row.id)}
                                    className="text-[11px] font-semibold text-primary-600 border border-primary-200 rounded-full px-3 py-1 opacity-80 hover:opacity-100 transition"
                                >
                                    {expandedRows[row.id] ? 'הסתר' : `+${extraCount}`}
                                </button>
                            )}
                            {showButton && (
                                <button
                                    type="button"
                                    onClick={handleButtonClick}
                                    className="ml-auto flex-shrink-0 order-last text-xs font-semibold text-primary-600 rounded-full border border-primary-200 px-2 py-0.5 flex items-center gap-1 hover:bg-primary-50 transition"
                                    aria-label="הוסף תגית חדשה"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                        {extraCount > 0 && expandedRows[row.id] && (
                            <div className="flex flex-wrap gap-2 mt-1">
                                {hiddenTags.map((tag) =>
                                    renderTagBadge(tag, `${row.id}-hidden-${tagIdentity(tag)}`, onTagRemove, onTagToggle, onTagSearch),
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TagRowGroup;

