export type SmartTagType = 'role' | 'seniority' | 'skill' | 'industry' | 'certification' | 'language' | 'tool' | 'soft';

export interface SmartTagData {
    label: string;
    type: SmartTagType;
    isVerified?: boolean;
    isAiSuggested?: boolean;
    customTooltip?: string;
}

