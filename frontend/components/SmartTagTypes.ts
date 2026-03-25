export type SmartTagType = 'role' | 'seniority' | 'skill' | 'industry' | 'certification' | 'language' | 'tool' | 'soft';

/** Rich tag detail panel (click-to-open); built in CandidateProfile from tag metadata */
export interface SmartTagTooltipPanel {
    categoryLabel: string;
    title: string;
    experienceLabel?: string;
    experienceYears?: string;
    experienceIsCurrent?: boolean;
    confidenceLabel?: string;
    confidenceSub?: string;
    confidenceTone?: 'high' | 'medium' | 'low';
    sourcePath?: string;
    classificationLogic?: string;
    selectionReason?: string;
    cvQuote?: string;
    professionalSummary?: string;
    footerDate?: string;
}

export interface SmartTagData {
    label: string;
    type: SmartTagType;
    isVerified?: boolean;
    isAiSuggested?: boolean;
    customTooltip?: string;
    /** When set, SmartTagBadge renders the new click panel instead of parsing customTooltip */
    tooltipPanel?: SmartTagTooltipPanel;
}

