import type { DateRange } from '../components/DateRangeSelector';

export type ComplexQueryOperator = 'AND' | 'OR' | 'NOT';

/** UI rule row — mirrors ComplexQueryComponents field ids. */
export type ComplexFilterRule = {
    id: string;
    operator: ComplexQueryOperator;
    field: string;
    value?: unknown;
    textValue?: string;
    dateRange?: DateRange | null;
    searchAllProfiles?: boolean;
    sourceMode?: string;
    channelStatus?: string;
    candidateStatus?: string;
    jobStatuses?: string[];
    recruiters?: string[];
    updaterTypes?: string[];
    clientValue?: string[];
    secondaryValue?: unknown;
};

/** Strip UI-only id; keep fields the API compiler understands. */
export function serializeComplexRuleForApi(rule: ComplexFilterRule): Record<string, unknown> {
    const out: Record<string, unknown> = {
        operator: rule.operator,
        field: rule.field,
    };
    if (rule.value !== undefined && rule.value !== '') out.value = rule.value;
    if (rule.textValue != null && rule.textValue !== '') out.textValue = rule.textValue;
    if (rule.dateRange) out.dateRange = rule.dateRange;
    if (rule.searchAllProfiles === false) out.searchAllProfiles = false;
    if (rule.sourceMode) out.sourceMode = rule.sourceMode;
    if (rule.channelStatus) out.channelStatus = rule.channelStatus;
    if (rule.candidateStatus) out.candidateStatus = rule.candidateStatus;
    if (Array.isArray(rule.jobStatuses) && rule.jobStatuses.length) out.jobStatuses = rule.jobStatuses;
    if (Array.isArray(rule.recruiters) && rule.recruiters.length) out.recruiters = rule.recruiters;
    if (Array.isArray(rule.updaterTypes) && rule.updaterTypes.length) out.updaterTypes = rule.updaterTypes;
    if (Array.isArray(rule.clientValue) && rule.clientValue.length) out.clientValue = rule.clientValue;
    if (rule.secondaryValue !== undefined && rule.secondaryValue !== '') out.secondaryValue = rule.secondaryValue;
    return out;
}

export function serializeComplexRulesForApi(rules: ComplexFilterRule[]): Record<string, unknown>[] {
    return (rules || []).map(serializeComplexRuleForApi);
}

export function createEmptyComplexRule(operator: ComplexQueryOperator): ComplexFilterRule {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        operator,
        field: 'text',
        value: '',
        textValue: '',
        searchAllProfiles: true,
    };
}

/** True when a rule has enough input to send to the API compiler. */
export function complexRuleHasValue(rule: ComplexFilterRule): boolean {
    if (!rule?.field) return false;
    if (typeof rule.textValue === 'string' && rule.textValue.trim()) return true;
    if (rule.dateRange && (rule.dateRange.from || rule.dateRange.to)) return true;
    const v = rule.value;
    if (typeof v === 'string' && v.trim()) return true;
    if (Array.isArray(v) && v.length > 0) return true;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (o.from || o.to) return true;
        if (typeof o.id === 'string' && o.id.trim()) return true;
        if (typeof o.title === 'string' && o.title.trim()) return true;
    }
    return false;
}

export function complexRulesHaveValue(rules: ComplexFilterRule[]): boolean {
    return (rules || []).some(complexRuleHasValue);
}

/** Multiline textarea → deduped keyword list. */
export function linesFromRuleValue(value: unknown): string[] {
    const raw = typeof value === 'string' ? value : '';
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return [...new Set(lines)];
}
