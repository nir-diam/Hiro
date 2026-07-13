import { SmartTagData, SmartTagTooltipPanel, SmartTagType } from '../components/SmartTagTypes';

const RAW_TYPE_LABELS: Record<string, string> = {
    Role: 'תפקיד',
    Skill: 'מיומנות',
    Tool: 'כלי',
    Certification: 'הסמכה',
    Degree: 'השכלה',
    Language: 'שפה',
    Industry: 'ענף',
};

export type CandidateTagDetail = {
    id?: string;
    tagKey?: string;
    displayNameHe?: string;
    displayNameEn?: string;
    rawType?: string;
    context?: string;
    isCurrent?: boolean;
    isInSummary?: boolean;
    confidenceScore?: number;
    finalScore?: number;
    category?: string;
    evidence?: string | string[];
    quote?: string;
    rawTypeReason?: string;
    tagReason?: string;
    descriptionHe?: string;
    createdAt?: string;
};

const SMART_TAG_TYPES: SmartTagType[] = [
    'role',
    'seniority',
    'skill',
    'industry',
    'certification',
    'language',
    'tool',
    'soft',
];

const ensureArray = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value];
    return [];
};

const getLabelCaseInsensitive = (labels: Record<string, string>, key: string): string | undefined => {
    if (!key || typeof key !== 'string') return undefined;
    const exact = labels[key];
    if (exact) return exact;
    const capped = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
    return labels[capped] ?? labels[key.toLowerCase()] ?? key;
};

export const normalizeTagDetail = (d: Record<string, unknown>): CandidateTagDetail => ({
    id: d?.id != null ? String(d.id) : undefined,
    tagKey: (d?.tagKey ?? d?.tag_key) as string | undefined,
    displayNameHe: (d?.displayNameHe ?? d?.display_name_he) as string | undefined,
    displayNameEn: (d?.displayNameEn ?? d?.display_name_en) as string | undefined,
    rawType: (d?.rawType ?? d?.raw_type) as string | undefined,
    context: d?.context as string | undefined,
    isCurrent: (d?.isCurrent ?? d?.is_current) as boolean | undefined,
    isInSummary: (d?.isInSummary ?? d?.is_in_summary) as boolean | undefined,
    confidenceScore:
        typeof (d?.confidenceScore ?? d?.confidence_score) === 'number'
            ? (d?.confidenceScore ?? d?.confidence_score)
            : undefined,
    finalScore:
        typeof (d?.finalScore ?? d?.final_score) === 'number'
            ? (d?.finalScore ?? d?.final_score)
            : undefined,
    category: d?.category as string | undefined,
    evidence: (d?.evidence ?? d?.quote) as string | string[] | undefined,
    quote: typeof (d?.quote ?? d?.evidence) === 'string' ? (d?.quote ?? d?.evidence) : undefined,
    rawTypeReason: (d?.rawTypeReason ?? d?.raw_type_reason) as string | undefined,
    tagReason: (d?.tagReason ?? d?.tag_reason) as string | undefined,
    descriptionHe: (d?.descriptionHe ?? d?.description_he) as string | undefined,
    createdAt: (d?.createdAt ?? d?.created_at) as string | undefined,
});

const parseMonthYear = (value?: string): Date | null => {
    if (!value || typeof value !== 'string') return null;
    const clean = value.trim();
    const monthYearMatch = clean.match(/^(\d{1,2})[/-](\d{4})$/);
    if (monthYearMatch) {
        const month = Number(monthYearMatch[1]);
        const year = Number(monthYearMatch[2]);
        if (month >= 1 && month <= 12) return new Date(year, month - 1, 1);
    }
    const yearMatch = clean.match(/^(\d{4})$/);
    if (yearMatch) return new Date(Number(yearMatch[1]), 0, 1);
    const parsed = new Date(clean);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const estimateExperienceYears = (detail: CandidateTagDetail, workExperience: unknown[] = []): number | undefined => {
    if (!Array.isArray(workExperience) || !workExperience.length) return undefined;
    const needle = (detail.displayNameHe || detail.displayNameEn || detail.tagKey || '').toLowerCase().trim();
    if (!needle) return undefined;
    let totalMonths = 0;
    workExperience.forEach((exp) => {
        const row = exp as Record<string, unknown>;
        const haystack = [row?.title, row?.description, row?.companyField, row?.company]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        if (!haystack.includes(needle)) return;
        const start = parseMonthYear(String(row?.startDate ?? ''));
        const end = parseMonthYear(String(row?.endDate ?? '')) || new Date();
        if (!start || end < start) return;
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
        totalMonths += Math.max(0, months);
    });
    if (!totalMonths) return detail.isCurrent ? 1 : undefined;
    return Math.max(1, Math.round((totalMonths / 12) * 10) / 10);
};

const parseConfidenceParts = (
    detail: CandidateTagDetail,
): { label: string; sub: string; tone: 'high' | 'medium' | 'low' } => {
    const score = typeof detail.confidenceScore === 'number' ? detail.confidenceScore : undefined;
    const final = typeof detail.finalScore === 'number' ? detail.finalScore : undefined;
    if ((score !== undefined && score >= 0.95) || (final !== undefined && final >= 250)) {
        return { label: 'גבוהה', sub: 'זיהוי מפורש', tone: 'high' };
    }
    if ((score !== undefined && score >= 0.75) || (final !== undefined && final >= 150)) {
        return { label: 'בינונית', sub: 'הסקה מהקשר', tone: 'medium' };
    }
    return { label: 'נמוכה', sub: 'הסקה כללית', tone: 'low' };
};

const formatTooltipFooterDate = (value?: string): string | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const buildTagTooltipPanel = (
    tag: string,
    detail: CandidateTagDetail | undefined,
    workExperience: unknown[] = [],
): SmartTagTooltipPanel | undefined => {
    if (!detail) return undefined;
    const typeLabel = detail.rawType
        ? getLabelCaseInsensitive(RAW_TYPE_LABELS, detail.rawType) || detail.rawType
        : 'תגית';
    const tagName = detail.displayNameHe || detail.displayNameEn || tag;
    const years = estimateExperienceYears(detail, workExperience);
    const confidence = parseConfidenceParts(detail);

    const evidenceTokens = Array.isArray(detail.evidence)
        ? detail.evidence
        : typeof detail.evidence === 'string'
          ? [detail.evidence]
          : [];
    const cvQuote =
        (typeof detail.quote === 'string' && detail.quote.trim()) ||
        evidenceTokens.map((t) => String(t).trim()).find(Boolean);

    const hierarchyParts = ['קורות חיים'];
    if (detail.category) hierarchyParts.push(detail.category);
    hierarchyParts.push(detail.context || typeLabel);
    const sourcePath = hierarchyParts.join(' > ');

    const logic = detail.rawTypeReason?.trim();
    const desc = detail.descriptionHe?.trim();
    const classificationLogic = logic || (!logic && desc ? desc : undefined);
    const professionalSummary = desc && desc !== logic ? desc : undefined;

    return {
        categoryLabel: typeLabel,
        title: tagName,
        experienceLabel: 'ניסיון מצטבר',
        experienceYears: years != null ? `${years} שנים` : undefined,
        experienceIsCurrent: Boolean(detail.isCurrent),
        confidenceLabel: confidence.label,
        confidenceSub: confidence.sub,
        confidenceTone: confidence.tone,
        sourcePath,
        classificationLogic,
        selectionReason: detail.tagReason?.trim() || undefined,
        cvQuote: cvQuote || undefined,
        professionalSummary,
        footerDate: formatTooltipFooterDate(detail.createdAt),
    };
};

const buildLanguageTooltipPanel = (label: string, level?: string): SmartTagTooltipPanel => ({
    categoryLabel: 'שפה',
    title: label,
    professionalSummary: level ? `רמה: ${level}` : undefined,
});

export const inferSmartTagType = (detail?: CandidateTagDetail): SmartTagType => {
    const raw = (detail?.rawType || '').toLowerCase();
    if (raw.includes('role')) return 'role';
    if (raw.includes('seniority') || raw.includes('level')) return 'seniority';
    if (raw.includes('industry') || raw.includes('domain')) return 'industry';
    if (raw.includes('certification') || raw.includes('degree') || raw.includes('education')) return 'certification';
    if (raw.includes('language')) return 'language';
    if (raw.includes('tool')) return 'tool';
    if (raw.includes('soft')) return 'soft';
    if (raw.includes('skill')) return 'skill';
    return 'skill';
};

const tagDetailLabel = (detail: CandidateTagDetail, fallback = ''): string =>
    (detail.displayNameHe || detail.displayNameEn || detail.tagKey || fallback).trim();

const pushGroupedTag = (
    base: Record<SmartTagType, SmartTagData[]>,
    entry: SmartTagData,
    seen: Set<string>,
) => {
    const key = `${entry.type}::${entry.label}`;
    if (!entry.label || seen.has(key)) return;
    seen.add(key);
    if (!base[entry.type]) base[entry.type] = [];
    base[entry.type].push(entry);
};

export const buildTagDetailLookup = (tagDetails: unknown): Map<string, CandidateTagDetail> => {
    const map = new Map<string, CandidateTagDetail>();
    ensureArray(tagDetails).forEach((raw) => {
        const detail = normalizeTagDetail((raw || {}) as Record<string, unknown>);
        [detail.tagKey, detail.displayNameHe, detail.displayNameEn].forEach((key) => {
            if (typeof key === 'string' && key.trim()) {
                map.set(key.trim(), detail);
            }
        });
    });
    return map;
};

export const buildCandidateGroupedSmartTags = (candidate: {
    tags?: unknown;
    tagDetails?: unknown;
    languages?: unknown;
    skills?: { soft?: unknown };
    workExperience?: unknown;
    experience?: unknown;
}): Record<SmartTagType, SmartTagData[]> => {
    const base = SMART_TAG_TYPES.reduce<Record<SmartTagType, SmartTagData[]>>((acc, type) => {
        acc[type] = [];
        return acc;
    }, {} as Record<SmartTagType, SmartTagData[]>);

    const tagDetailLookup = buildTagDetailLookup(candidate.tagDetails);
    const workExperience = ensureArray(candidate.workExperience || candidate.experience);
    const seen = new Set<string>();

    // Primary source: tagDetails (full candidate API). List view often has tags[] without details.
    ensureArray(candidate.tagDetails).forEach((raw) => {
        const detail = normalizeTagDetail((raw || {}) as Record<string, unknown>);
        const label = tagDetailLabel(detail);
        if (!label) return;
        const type = inferSmartTagType(detail);
        pushGroupedTag(base, {
            label,
            type,
            isVerified: Boolean(detail.isCurrent),
            isAiSuggested: false,
            tooltipPanel: buildTagTooltipPanel(label, detail, workExperience),
        }, seen);
    });

    const tagsList = ensureArray(candidate.tags).map((t) => String(t ?? '').trim()).filter(Boolean);
    tagsList.forEach((tag) => {
        const detail = tagDetailLookup.get(tag);
        const type = inferSmartTagType(detail);
        const displayNameHe = detail?.displayNameHe?.trim();
        const label = (displayNameHe || tag).trim() || tag;
        pushGroupedTag(base, {
            label,
            type,
            isVerified: Boolean(detail?.isCurrent),
            isAiSuggested: false,
            tooltipPanel: detail ? buildTagTooltipPanel(tag, detail, workExperience) : undefined,
        }, seen);
    });

    ensureArray(candidate.languages).forEach((lang) => {
        const row = lang as Record<string, unknown>;
        const label =
            (typeof lang === 'string'
                ? lang
                : row?.lang || row?.language || row?.name || row?.value || ''
            )
                .toString()
                .trim();
        if (!label) return;
        const descriptor =
            typeof lang === 'object' ? row.levelText || row.level || row.proficiency || '' : '';
        const entry: SmartTagData = {
            label,
            type: 'language',
            isVerified: false,
            isAiSuggested: false,
            customTooltip: descriptor ? `רמה: ${descriptor}` : undefined,
            tooltipPanel: buildLanguageTooltipPanel(label, descriptor ? String(descriptor) : undefined),
        };
        if (!base.language) base.language = [];
        base.language.push(entry);
    });

    ensureArray(candidate.skills?.soft).forEach((softSkill) => {
        const label = (
            typeof softSkill === 'string'
                ? softSkill
                : (softSkill as Record<string, unknown>)?.name ??
                  (softSkill as Record<string, unknown>)?.label ??
                  (softSkill as Record<string, unknown>)?.displayNameHe ??
                  ''
        )
            .toString()
            .trim();
        if (!label) return;
        let detail = tagDetailLookup.get(label);
        if (!detail && typeof softSkill === 'object' && softSkill !== null) {
            detail = normalizeTagDetail(softSkill as Record<string, unknown>);
            if (!detail.rawType) detail.rawType = 'soft_skill';
        }
        const entry: SmartTagData = {
            label,
            type: 'soft',
            isVerified: Boolean(detail?.isCurrent),
            isAiSuggested: false,
            tooltipPanel: detail
                ? buildTagTooltipPanel(label, detail, workExperience)
                : { categoryLabel: 'כישורים רכים', title: label },
        };
        if (!base.soft) base.soft = [];
        base.soft.push(entry);
    });

    return base;
};
