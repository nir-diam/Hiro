import React, { useMemo } from 'react';
import {
    BriefcaseIcon,
    GlobeAmericasIcon,
    ScaleIcon,
    SparklesIcon,
    TagIcon,
    UserGroupIcon,
    XMarkIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
    isExperienceLayerActive,
    pickBreakdownScore,
    type SonarScoreBreakdown,
    type ParameterMatchStatus,
} from '../utils/sonarMatchBreakdown';

export type MatchScoreBreakdownData = SonarScoreBreakdown;

export type ParameterMatchesMap = Partial<
    Record<
        | 'gender'
        | 'mobility'
        | 'scope'
        | 'license'
        | 'work_hours'
        | 'availability'
        | 'age'
        | 'salary'
        | 'mandatory_skill'
        | 'mandatory_language',
        ParameterMatchStatus
    >
>;

type LayerBarConfig = {
    key: string;
    label: string;
    score: number;
    barClass: string;
    iconClass: string;
    Icon: React.FC<{ className?: string }>;
};

const LAYER_LABEL_KEYS: Record<string, string> = {
    semantic: 'job.sonar.layer_semantic',
    tags: 'job.sonar.layer_tags',
    geo: 'job.sonar.layer_geo',
    experience: 'job.sonar.layer_experience',
    intent: 'job.sonar.layer_intent',
};

const LAYER_LABEL_FULL_KEYS: Record<string, string> = {
    semantic: 'job.sonar.layer_semantic_full',
    tags: 'job.sonar.layer_tags_full',
    geo: 'job.sonar.layer_geo_full',
    experience: 'job.sonar.layer_experience_full',
    intent: 'job.sonar.layer_intent_full',
};

function buildLayerBars(
    bd: SonarScoreBreakdown | null | undefined,
    t: (k: string) => string,
    shortLabels: boolean,
    showExperience: boolean,
): LayerBarConfig[] {
    if (!bd) return [];
    const rows: Array<Omit<LayerBarConfig, 'score' | 'label'> & { scores: (number | undefined)[]; key: string }> = [
        {
            key: 'semantic',
            scores: [bd.semanticScore, bd.vector],
            barClass: 'bg-purple-500',
            iconClass: 'text-purple-500',
            Icon: SparklesIcon,
        },
        {
            key: 'tags',
            scores: [bd.tagsScore, bd.tags],
            barClass: 'bg-blue-500',
            iconClass: 'text-blue-500',
            Icon: TagIcon,
        },
        {
            key: 'geo',
            scores: [bd.geoScore, bd.geo],
            barClass: 'bg-emerald-500',
            iconClass: 'text-emerald-500',
            Icon: GlobeAmericasIcon,
        },
        ...(showExperience
            ? [
                  {
                      key: 'experience',
                      scores: [bd.experienceScore, bd.experience],
                      barClass: 'bg-orange-500',
                      iconClass: 'text-orange-500',
                      Icon: BriefcaseIcon,
                  },
              ]
            : []),
        {
            key: 'intent',
            scores: [bd.intentScore, bd.intent],
            barClass: 'bg-amber-500',
            iconClass: 'text-amber-500',
            Icon: UserGroupIcon,
        },
    ];

    return rows
        .map((row) => {
            const score = pickBreakdownScore(...row.scores);
            if (score == null) return null;
            const labelKey = shortLabels ? LAYER_LABEL_KEYS[row.key] : LAYER_LABEL_FULL_KEYS[row.key];
            return {
                key: row.key,
                label: labelKey ? t(labelKey) : row.key,
                score,
                barClass: row.barClass,
                iconClass: row.iconClass,
                Icon: row.Icon,
            };
        })
        .filter((x): x is LayerBarConfig => x != null);
}

type PenaltyItem = { key: string; label: string; amount: number };

const LayerBarRow: React.FC<{ layer: LayerBarConfig; compact?: boolean }> = ({ layer, compact }) => {
    const pct = Math.max(0, Math.min(100, layer.score));
    const Icon = layer.Icon;
    return (
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
            <div
                className={`flex justify-between text-text-default ${compact ? 'text-xs font-semibold' : 'text-sm font-bold'}`}
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} shrink-0 ${layer.iconClass}`} />
                    <span className="truncate">{layer.label}</span>
                </span>
                <span className={compact ? 'text-text-default shrink-0' : 'text-text-muted shrink-0'}>{pct}%</span>
            </div>
            <div className={`${compact ? 'h-1.5' : 'h-2.5'} bg-bg-subtle rounded-full overflow-hidden`}>
                <div
                    className={`h-full ${layer.barClass} rounded-full transition-all duration-1000`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

const PenaltyBarRow: React.FC<{ item: PenaltyItem; pointsLabel: string }> = ({ item, pointsLabel }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-semibold text-rose-600">
            <span className="flex items-center gap-1 truncate pe-2">{item.label}</span>
            <span className="bg-rose-50 px-1 py-0.5 rounded text-rose-700 shrink-0">
                -{item.amount} {pointsLabel}
            </span>
        </div>
        <div className="h-1 bg-rose-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 rounded-full" style={{ width: '100%' }} />
        </div>
    </div>
);

export const MatchScoreBreakdownPanel: React.FC<{
    matchScore: number;
    jobTitle?: string | null;
    scoreBreakdown?: MatchScoreBreakdownData | null;
    parameterMatches?: ParameterMatchesMap | null;
    job?: Record<string, unknown> | null;
    candidate?: Record<string, unknown> | null;
    vectorSimilarity?: number | null;
    matchThresholdMin?: number;
    loading?: boolean;
    professionalSummary?: string | null;
    candidateName?: string | null;
    candidateTitle?: string | null;
    className?: string;
    variant?: 'default' | 'popup';
    onClose?: () => void;
    /** Overrides breakdown flag when set (e.g. from client matching-engine config) */
    isExperienceEnabled?: boolean;
}> = ({
    matchScore,
    jobTitle,
    scoreBreakdown,
    isExperienceEnabled: isExperienceEnabledProp,
    loading,
    professionalSummary,
    candidateName,
    candidateTitle,
    className = '',
    variant = 'popup',
    onClose,
}) => {
    const { t } = useLanguage();
    const compact = variant === 'popup';
    const bd = scoreBreakdown;
    const hasLayers = Boolean(bd && typeof bd === 'object');
    const displayName = String(candidateName ?? '').trim() || 'מועמד';
    const displayTitle = String(candidateTitle ?? '').trim();
    const finalPct = Math.max(0, Math.min(100, Math.round(matchScore)));

    const showExperience =
        typeof isExperienceEnabledProp === 'boolean'
            ? isExperienceEnabledProp
            : isExperienceLayerActive(bd);
    const layerBars = useMemo(
        () => buildLayerBars(bd, t, compact, showExperience),
        [bd, t, compact, showExperience],
    );

    const agePenalty = typeof bd?.ageGapPenalty === 'number' && bd.ageGapPenalty > 0 ? Math.round(bd.ageGapPenalty) : 0;
    const salaryPenalty =
        typeof bd?.salaryPenalty === 'number' && bd.salaryPenalty > 0 ? Math.round(bd.salaryPenalty) : 0;

    const penaltyReasons = useMemo(() => {
        const listed = Array.isArray(bd?.penaltyReasons) ? bd!.penaltyReasons! : [];
        return listed.filter((pr) => pr && typeof pr.amount === 'number' && pr.amount > 0);
    }, [bd]);

    const generalReasons = useMemo(() => {
        if (penaltyReasons.length) {
            return penaltyReasons.filter(
                (pr) => pr.key !== 'age_gap' && pr.type !== 'age_gap' && !/גיל|age/i.test(String(pr.label || '')),
            );
        }
        return [];
    }, [penaltyReasons]);

    const penaltyItems = useMemo((): PenaltyItem[] => {
        const items: PenaltyItem[] = [];
        if (agePenalty > 0) {
            items.push({ key: 'age_gap', label: t('job.sonar.penalty_age_gap'), amount: agePenalty });
        }
        for (const pr of generalReasons) {
            items.push({
                key: String(pr.key || pr.label || 'penalty'),
                label: String(pr.label || pr.key || t('job.sonar.layer_penalties')),
                amount: Math.round(pr.amount),
            });
        }
        const hasSalaryInReasons = generalReasons.some((pr) =>
            /שכר|salary/i.test(String(pr.label || pr.key || '')),
        );
        if (salaryPenalty > 0 && !hasSalaryInReasons) {
            items.push({
                key: 'salary_gap',
                label: t('job.sonar.penalty_salary_gap'),
                amount: salaryPenalty,
            });
        }

        return items.filter((item) => item.amount > 0);
    }, [agePenalty, generalReasons, salaryPenalty, t]);

    const summaryText = professionalSummary?.trim() || null;

    const popupHeader = (
        <div className="flex justify-between items-center px-4 py-3 border-b border-border-subtle bg-bg-subtle/30">
            <div className="flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-sm text-text-default">{t('job.sonar.popup_title')}</span>
            </div>
            {onClose ? (
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-md text-text-muted hover:text-text-default hover:bg-white transition-colors"
                    aria-label="סגור"
                >
                    <XMarkIcon className="w-3.5 h-3.5" />
                </button>
            ) : null}
        </div>
    );

    const scoreBlock = compact ? (
        <div className="flex items-center justify-center gap-1 mb-5">
            <div className="text-4xl font-black text-primary-600 tracking-tight leading-none">
                {finalPct}
                <span className="text-2xl text-primary-400 opacity-80">%</span>
            </div>
        </div>
    ) : (
        <div className="flex flex-col items-center pb-8 border-b border-border-subtle">
            <div className="text-center mb-3 space-y-0.5">
                <div className="font-bold text-text-default text-sm">{displayName}</div>
                {displayTitle ? (
                    <div className="text-text-muted truncate max-w-[16rem] text-xs">{displayTitle}</div>
                ) : null}
            </div>
            <div className="font-bold text-text-muted uppercase tracking-widest text-sm mb-3">
                {t('job.sonar.score_final_heading')}
            </div>
            <div className="text-7xl font-black tracking-tighter text-primary-600">
                {finalPct}
                <span className="text-4xl text-primary-400 opacity-50">%</span>
            </div>
        </div>
    );

    const layersBlock = (
        <div className={compact ? 'space-y-3.5 max-h-[14rem] overflow-y-auto custom-scrollbar' : 'space-y-5 pt-2'}>
            {layerBars.map((layer) => (
                <LayerBarRow key={layer.key} layer={layer} compact={compact} />
            ))}
        </div>
    );

    const penaltiesBlock =
        penaltyItems.length > 0 ? (
            <div className={compact ? 'pt-3 mt-3 border-t border-border-subtle space-y-2.5' : 'pt-4 mt-2 border-t border-border-subtle space-y-3'}>
                {penaltyItems.map((item) =>
                    compact ? (
                        <PenaltyBarRow key={item.key} item={item} pointsLabel={t('job.sonar.points_abbr')} />
                    ) : (
                        <div key={item.key} className="space-y-2">
                            <div className="flex justify-between text-sm font-bold text-rose-600">
                                <span className="flex items-center gap-1.5">
                                    <ScaleIcon className="w-4 h-4" />
                                    {item.label}
                                </span>
                                <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md text-[10px]">
                                    -{item.amount} {t('job.sonar.points_abbr')}
                                </span>
                            </div>
                            <div className="h-2.5 bg-rose-100 rounded-full overflow-hidden">
                                <div className="h-full bg-rose-500 rounded-full" style={{ width: '100%' }} />
                            </div>
                        </div>
                    ),
                )}
            </div>
        ) : null;

    const footerBlock =
        jobTitle || summaryText ? (
            <div className={compact ? 'mt-4 pt-3 border-t border-border-subtle' : 'mt-8 pt-5 border-t border-border-subtle'}>
                {jobTitle ? (
                    <div className={`font-semibold text-text-default mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>
                        <span className="text-text-muted">{t('job.sonar.job_label')}:</span> {jobTitle}
                    </div>
                ) : null}
                {summaryText ? (
                    <p className={`leading-snug text-text-muted ${compact ? 'text-[11px]' : 'text-sm'}`}>
                        {summaryText}
                    </p>
                ) : null}
            </div>
        ) : null;

    const cardCls = compact
        ? `bg-bg-card text-right overflow-hidden ${className}`
        : `sticky top-6 space-y-6 bg-white p-8 rounded-3xl border border-border-default shadow-xl text-right ${className}`;

    if (loading) {
        return (
            <div className={cardCls}>
                {compact ? popupHeader : null}
                <p className={`text-text-muted text-center ${compact ? 'p-4 py-8 text-xs' : 'py-4 text-sm'}`}>
                    {t('job.sonar.loading_tags')}
                </p>
            </div>
        );
    }

    if (!hasLayers) {
        return (
            <div className={cardCls}>
                {compact ? popupHeader : null}
                <div className={compact ? 'p-4' : undefined}>
                    {!compact ? (
                        <div className="flex flex-col items-center pb-3 border-b border-border-subtle">
                            <div className="text-center mb-1.5 space-y-0.5">
                                <div className="font-bold text-text-default text-sm">{displayName}</div>
                                {displayTitle ? (
                                    <div className="text-[10px] text-text-muted truncate max-w-[16rem]">
                                        {displayTitle}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                    {compact ? (
                        <div className="flex items-center justify-center gap-1 mb-4">
                            <div className="text-4xl font-black text-primary-600 tracking-tight leading-none">
                                {finalPct}
                                <span className="text-2xl text-primary-400 opacity-80">%</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center pb-3 border-b border-border-subtle mb-4">
                            <div className="text-5xl font-black text-primary-600">
                                {finalPct}
                                <span className="text-2xl opacity-50">%</span>
                            </div>
                        </div>
                    )}
                    <p className="text-[10px] text-text-muted italic text-center">
                        בחר משרה בהשוואה בחיפוש החכם לפירוט מלא, או פתח מועמד שקושר למשרה.
                    </p>
                </div>
            </div>
        );
    }

    if (compact) {
        return (
            <div className={cardCls}>
                {popupHeader}
                <div className="p-4">
                    {scoreBlock}
                    {layersBlock}
                    {penaltiesBlock}
                    {footerBlock}
                </div>
            </div>
        );
    }

    return (
        <div className={cardCls}>
            {scoreBlock}
            {layersBlock}
            {penaltiesBlock}
            {footerBlock}
        </div>
    );
};
