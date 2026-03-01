import React, { useState } from 'react';
import { BriefcaseIcon, AcademicCapIcon, WrenchScrewdriverIcon, SparklesIcon, PlusIcon, CheckCircleIcon, XMarkIcon } from './Icons';
import { SmartTagType, SmartTagData } from './SmartTagTypes';

interface SmartTagBadgeProps extends SmartTagData {
    onRemove?: () => void;
}

const SmartTagBadge: React.FC<SmartTagBadgeProps> = ({ label, type, isVerified, isAiSuggested, customTooltip, onRemove }) => {
    const baseClasses = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all cursor-default select-none border whitespace-nowrap relative group/tag";
    const configs: Record<SmartTagType, string> = {
        role: "bg-primary-600 text-white font-bold border-primary-600 shadow-sm",
        seniority: "bg-white border-primary-400 text-primary-700 font-bold",
        skill: "bg-sky-50 text-sky-800 border-sky-200 font-semibold",
        tool: "bg-gray-100 text-gray-800 border-gray-200 font-semibold",
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
        <div className="relative inline-flex group/tag">
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
            {onRemove && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onRemove();
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full border border-white bg-white text-gray-500 flex items-center justify-center text-[10px] opacity-0 group-hover/tag:opacity-100 transition"
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
        types: ['certification', 'language'],
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

interface TagRowGroupProps {
    groupedSmartTags: Record<SmartTagType, SmartTagData[]>;
    onQualificationAdd?: () => void;
    onRowAdd?: (rowId: string) => void;
    onTagRemove?: (label: string) => void;
}

const TagRowGroup: React.FC<TagRowGroupProps> = ({ groupedSmartTags, onQualificationAdd, onRowAdd, onTagRemove }) => {
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
                    const skillTags = groupedSmartTags['skill'] || [];
                    const toolTags = groupedSmartTags['tool'] || [];
                    const visibleSkills = getVisibleTags(skillTags, row.limit);
                    const visibleTools = getVisibleTags(toolTags, row.limit);
                    const extraSkills = Math.max(0, skillTags.length - visibleSkills.length);
                    const extraTools = Math.max(0, toolTags.length - visibleTools.length);
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
                                    {visibleSkills.map((tag) => (
                                        <SmartTagBadge
                                            key={`${row.id}-skill-${tag.label}`}
                                            {...tag}
                                            onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                        />
                                    ))}
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
                                        {skillTags.slice(row.limit).map((tag) => (
                                            <SmartTagBadge
                                                key={`${row.id}-skill-hidden-${tag.label}`}
                                                {...tag}
                                                onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Row 2: Tools */}
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    {visibleTools.map((tag) => (
                                        <SmartTagBadge
                                            key={`${row.id}-tool-${tag.label}`}
                                            {...tag}
                                            onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                        />
                                    ))}
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
                                        {toolTags.slice(row.limit).map((tag) => (
                                            <SmartTagBadge
                                                key={`${row.id}-tool-hidden-${tag.label}`}
                                                {...tag}
                                                onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }

                const tags = row.types.flatMap((type) => groupedSmartTags[type] || []);
                const visibleTags = getVisibleTags(tags, row.limit, row.priorityType);
                const extraCount = Math.max(0, tags.length - visibleTags.length);

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
                            {visibleTags.map((tag) => (
                                <SmartTagBadge
                                    key={`${row.id}-${tag.label}`}
                                    {...tag}
                                    onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                />
                            ))}
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
                                {tags.slice(row.limit).map((tag) => (
                                    <SmartTagBadge
                                        key={`${row.id}-hidden-${tag.label}`}
                                        {...tag}
                                        onRemove={onTagRemove ? () => onTagRemove(tag.label) : undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default TagRowGroup;

