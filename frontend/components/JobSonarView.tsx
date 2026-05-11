import React, { useCallback, useMemo, useState } from 'react';
import TagMatchPanel, { type TagMatchCategory } from './TagMatchPanel';
import {
    ArrowPathIcon,
    CheckCircleIcon,
    FunnelIcon,
    GlobeAmericasIcon,
    ListBulletIcon,
    SonarIcon,
    SparklesIcon,
    Squares2X2Icon,
    UserGroupIcon,
    UserIcon,
    XMarkIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
    buildJobTagMatchCategories,
    type JobTagMatchInput,
} from '../utils/jobTagMatchCategories';
import type { Candidate } from './CandidatesListView';

const SONAR_FILTER_KEYS = [
    'scope',
    'hours',
    'distance',
    'age',
    'gender',
    'mobility',
    'license',
    'salary',
    'affinity',
] as const;

export interface SonarScanRow {
    candidate: Record<string, unknown>;
    matchPercentage: number;
    vectorSimilarity: number | null;
}

export interface JobSonarViewProps {
    jobId?: number | string;
    /** Loaded job JSON — used for tag comparison shape */
    job: Record<string, unknown>;
    openSummaryDrawer: (candidate: Candidate | number) => void;
}

const apiBase = () => (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

const authHeaders = (): HeadersInit => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
};

function stableUiId(raw: unknown): number {
    const s = raw != null ? String(raw) : '';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h || 1;
}

function jobRecordToTagMatchJob(job: Record<string, unknown>): JobTagMatchInput {
    const req = job.requirements;
    const requirements = Array.isArray(req) ? req.map((r) => String(r ?? '').trim()).filter(Boolean) : [];
    return {
        title: typeof job.title === 'string' ? job.title : undefined,
        role: typeof job.role === 'string' ? job.role : undefined,
        field: typeof job.field === 'string' ? job.field : undefined,
        skills: Array.isArray(job.skills) ? (job.skills as JobTagMatchInput['skills']) : undefined,
        languages: Array.isArray(job.languages) ? (job.languages as JobTagMatchInput['languages']) : undefined,
        requirements,
        filterPosition: typeof job.filterPosition === 'string' ? job.filterPosition : undefined,
        filterNotes: typeof job.filterNotes === 'string' ? job.filterNotes : undefined,
    };
}

function gapChipLabels(categories: TagMatchCategory[], max = 8): string[] {
    const out: string[] = [];
    for (const cat of categories) {
        for (const ch of cat.chips) {
            if (ch.state === 'gap') out.push(ch.label);
        }
    }
    return out.slice(0, max);
}

type SonarMetricTone = 'good' | 'bad' | 'muted';

interface SonarMetricCell {
    label: string;
    value: string;
    tone: SonarMetricTone;
}

function normJobType(job: Record<string, unknown>): string {
    const jt = job.jobType;
    if (Array.isArray(jt)) return jt.filter(Boolean).map(String).join(', ');
    return String(jt ?? '').trim();
}

function candLicenseSummary(c: Record<string, unknown>): string {
    const dl = String(c.drivingLicense ?? '').trim();
    if (dl) return dl;
    const arr = Array.isArray(c.drivingLicenses) ? (c.drivingLicenses as unknown[]) : [];
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
}

function isLikelyGlobalCandidate(c: Record<string, unknown>): boolean {
    if (c.recruitmentSourceId != null && String(c.recruitmentSourceId).trim() !== '') return true;
    const sl = String(c.source ?? '').trim().toLowerCase();
    if (
        /global|גלובל|matrix|system|pool|import|csv|upload|אריאל|alljobs|drushim|מערכת|גייס|קורות/i.test(
            sl,
        )
    ) {
        return true;
    }
    const tags = Array.isArray(c.internalTags) ? (c.internalTags as unknown[]) : [];
    return tags.some((x) => /גלובל|global|pool|import/i.test(String(x)));
}

/** Prefer newest known activity / profile touch time for “לפני X ימים”. */
function pickActivityTimestamp(c: Record<string, unknown>): string | number | Date | undefined {
    const keys = [
        'updatedAt',
        'createdAt',
        'recruitmentSourceUpdatedAt',
        'recruitmentSourceCreatedAt',
        'lastActive',
        'lastActivity',
    ] as const;
    let best: Date | null = null;
    for (const k of keys) {
        const v = c[k];
        if (v == null || v === '') continue;
        const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
        if (Number.isNaN(d.getTime())) continue;
        if (!best || d.getTime() > best.getTime()) best = d;
    }
    return best ?? undefined;
}

function relativeActivityLabel(
    c: Record<string, unknown>,
    t: (key: string, opts?: Record<string, string | number>) => string,
): string | null {
    const ts = pickActivityTimestamp(c);
    if (!ts) return null;
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return t('job.sonar.rel_today');
    if (days === 1) return t('job.sonar.rel_yesterday');
    return t('job.sonar.rel_days', { count: String(days) });
}

function candidateDisplayName(c: Record<string, unknown>): string {
    const full = String(c.fullName ?? '').trim();
    if (full) return full;
    const fn = String(c.firstName ?? '').trim();
    const ln = String(c.lastName ?? '').trim();
    const joined = [fn, ln].filter(Boolean).join(' ');
    if (joined) return joined;
    return String(c.name ?? '').trim();
}

function candidateDisplayTitle(c: Record<string, unknown>): string {
    const disp = candidateDisplayName(c).trim().toLowerCase();
    const isDup = (s: string) => s.trim().length > 0 && s.trim().toLowerCase() === disp;

    const pick = (...vals: unknown[]): string => {
        for (const v of vals) {
            const s = String(v ?? '').trim();
            if (s && !isDup(s)) return s;
        }
        return '';
    };

    const fromRole = pick(c.role, c.currentRole, c.headline, c.position, c.jobTitle, c.filterPosition);
    if (fromRole) return fromRole;

    const ti = String(c.title ?? '').trim();
    if (ti && !isDup(ti)) return ti;

    const emp = Array.isArray(c.employmentTypes)
        ? (c.employmentTypes as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
    const empJoined = emp.join(', ');
    if (empJoined && !isDup(empJoined)) return empJoined;

    const single = String(c.employmentType ?? '').trim();
    if (single && !isDup(single)) return single;

    return '';
}

function sonarProfileImgSrc(c: Record<string, unknown>): string | null {
    const raw = String(c.profilePicture ?? '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    const base = apiBase();
    if (!base) return raw.startsWith('/') ? raw : null;
    if (raw.startsWith('/')) return `${base}${raw}`;
    return `${base}/${raw.replace(/^\//, '')}`;
}

function initialsForSonarAvatar(name: string): string {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
    }
    return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function SonarCandidateAvatar({ candidate }: { candidate: Record<string, unknown> }) {
    const src = sonarProfileImgSrc(candidate);
    const displayName = candidateDisplayName(candidate);

    if (src) {
        return (
            <img
                src={src}
                alt={displayName || ''}
                className="w-12 h-12 rounded-full object-cover bg-bg-surface text-text-muted outline outline-2 outline-white shadow-sm relative z-10"
            />
        );
    }

    return (
        <div className="w-12 h-12 bg-bg-surface rounded-full flex items-center justify-center text-text-muted outline outline-2 outline-white shadow-sm relative z-10">
            <UserIcon className="w-6 h-6 shrink-0" aria-hidden />
        </div>
    );
}

function sonarInsightLine(c: Record<string, unknown>, t: (key: string) => string): string {
    const ma = c.matchAnalysis as { reason?: string } | undefined;
    const reason = ma?.reason != null ? String(ma.reason).trim() : '';
    if (reason) return reason;
    const sum = String(c.professionalSummary ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (sum.length > 160) return `${sum.slice(0, 157)}…`;
    if (sum) return sum;
    return t('job.sonar.insight_fallback');
}

/** Normalize gender for mismatch checks (Hebrew + English). */
function normGenderBucket(raw: string): 'm' | 'f' | '' {
    const x = raw.trim().toLowerCase();
    if (!x) return '';
    if (/זכר|^male$|^m$/i.test(x) || x === 'גבר') return 'm';
    if (/נקבה|^female$|^f$/i.test(x) || x === 'אישה') return 'f';
    return '';
}

function buildSonarMetricCells(
    job: Record<string, unknown>,
    c: Record<string, unknown>,
    row: SonarScanRow,
    t: (key: string, opts?: Record<string, string | number>) => string,
): SonarMetricCell[] {
    const emdash = '—';

    const vecPct = Math.max(0, Math.min(100, Math.round(row.matchPercentage)));
    const vecTone: SonarMetricTone = vecPct >= 75 ? 'good' : 'muted';

    const prefs = Array.isArray(c.preferredWorkModels) ? (c.preferredWorkModels as string[]) : [];
    const scopes = Array.isArray(c.jobScopes) ? (c.jobScopes as string[]) : [];
    const scopeVal =
        String(c.jobScope ?? '').trim() ||
        (scopes.length ? scopes.join(', ') : '') ||
        (prefs.length ? prefs.join(', ') : '') ||
        normJobType(job) ||
        emdash;
    const scopeTone: SonarMetricTone = scopeVal === emdash ? 'muted' : 'good';

    const hoursVal =
        String(c.preferredWorkingHours ?? '').trim() ||
        String(c.availability ?? '').trim() ||
        prefs.find((p) => /בוקר|ערב|לילה|גמיש|morning|evening/i.test(p)) ||
        emdash;
    const hoursTone: SonarMetricTone = hoursVal === emdash ? 'muted' : 'good';

    const distanceVal = t('job.sonar.distance_na');

    const ageVal = String(c.age ?? '').trim() || emdash;
    const ageTone: SonarMetricTone = ageVal === emdash ? 'muted' : 'good';

    const genderVal = String(c.gender ?? '').trim() || emdash;
    const jobGenderRaw = String(job.gender ?? '').trim();
    let genderTone: SonarMetricTone = genderVal === emdash ? 'muted' : 'good';
    if (
        jobGenderRaw &&
        !/^לא\s*משנה/i.test(jobGenderRaw) &&
        genderVal !== emdash
    ) {
        const jb = normGenderBucket(jobGenderRaw);
        const cb = normGenderBucket(genderVal);
        if (jb && cb && jb !== cb) genderTone = 'bad';
    }

    const mobilityStr = String(c.mobility ?? '').trim();
    const mobilityVal = mobilityStr || emdash;
    let mobilityTone: SonarMetricTone = mobilityStr ? 'good' : 'muted';
    if (job.mobility === true) {
        if (!mobilityStr) {
            mobilityTone = 'bad';
        } else {
            const privateOk =
                /רכב\s*פרטי|נהיגה\s*עצמית|פרטי|עם\s*רכב|מכונית\s*פרטית|נהג\s*עצמאי|private|own\s*car/i.test(
                    mobilityStr,
                );
            const publicOnly =
                /ציבורית|תחבורה\s*ציבורית|^ציבורי$|אוטובוס|רכבת|קו\s*עירוני|public\s*transport|\bbus\b/i.test(
                    mobilityStr,
                ) && !privateOk;
            mobilityTone = publicOnly ? 'bad' : 'good';
        }
    } else if (!mobilityStr) {
        mobilityTone = 'muted';
    }

    const jobLic = String(job.licenseType ?? '').trim();
    const licRaw = candLicenseSummary(c);
    const licEmpty = !licRaw;
    const licVal = licRaw || emdash;
    let licTone: SonarMetricTone =
        Boolean(jobLic) && licEmpty ? 'bad' : !licEmpty ? 'good' : 'muted';
    const licDisplay =
        licTone === 'bad' && licEmpty ? t('job.sonar.license_none') : licVal;

    const jMax = Number(job.salaryMax);
    const cMin = Number(c.salaryMin);
    let salaryVal = t('job.sonar.salary_unknown');
    let salaryTone: SonarMetricTone = 'muted';
    if (Number.isFinite(jMax) && Number.isFinite(cMin)) {
        if (cMin <= jMax * 1.15) {
            salaryVal = t('job.sonar.salary_fit');
            salaryTone = 'good';
        } else {
            salaryVal = t('job.sonar.salary_above');
            salaryTone = 'bad';
        }
    } else if (Number.isFinite(cMin)) {
        salaryVal = String(cMin);
        salaryTone = 'good';
    }

    const jf = String(job.field ?? '').trim().toLowerCase();
    const cf = String(c.field ?? '').trim().toLowerCase();
    const ji = String(job.industry ?? '').trim().toLowerCase();
    const ci = String(c.industry ?? '').trim().toLowerCase();
    let affVal = t('job.sonar.affinity_unknown');
    let affTone: SonarMetricTone = 'muted';
    if (jf && cf && (jf === cf || jf.includes(cf) || cf.includes(jf))) {
        affVal = t('job.sonar.affinity_strong');
        affTone = 'good';
    } else if (
        (ji && ci && (ji.includes(ci) || ci.includes(ji))) ||
        (jf && cf && (jf.includes(cf) || cf.includes(jf)))
    ) {
        affVal = t('job.sonar.affinity_partial');
        affTone = 'good';
    }

    return [
        { label: t('job.sonar.metric_vector_pct'), value: `${vecPct}%`, tone: vecTone },
        { label: t('job.sonar.fl_scope'), value: scopeVal, tone: scopeTone },
        { label: t('job.sonar.fl_hours'), value: hoursVal, tone: hoursTone },
        { label: t('job.sonar.fl_distance'), value: distanceVal, tone: 'muted' },
        { label: t('job.sonar.fl_age'), value: ageVal, tone: ageTone },
        { label: t('job.sonar.fl_gender'), value: genderVal, tone: genderTone },
        { label: t('job.sonar.fl_mobility'), value: mobilityVal, tone: mobilityTone },
        { label: t('job.sonar.fl_license'), value: licDisplay, tone: licTone },
        { label: t('job.sonar.fl_salary'), value: salaryVal, tone: salaryTone },
        { label: t('job.sonar.fl_affinity'), value: affVal, tone: affTone },
    ];
}

function SonarScoreRing({ pct, compact }: { pct: number; compact?: boolean }) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const high = clamped >= 90;
    const arcCls = high ? 'text-accent-500' : 'text-primary-500';
    const labelCls = high ? 'text-accent-600' : 'text-primary-700';
    const wrap = compact ? 'relative w-12 h-12 flex items-center justify-center shrink-0' : 'relative w-14 h-14 flex items-center justify-center shrink-0';
    const labelSize = compact ? 'text-[11px]' : 'text-sm';
    return (
        <div className={wrap}>
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36" aria-hidden>
                <path
                    className="text-bg-subtle"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                    className={arcCls}
                    strokeWidth="3"
                    strokeDasharray={`${clamped}, 100`}
                    stroke="currentColor"
                    fill="none"
                    strokeLinecap="round"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className={`${labelSize} font-black ${labelCls}`}>{clamped}</span>
            </div>
        </div>
    );
}

function MetricDot({ tone }: { tone: SonarMetricTone }) {
    const cls =
        tone === 'good' ? 'bg-green-500' : tone === 'bad' ? 'bg-red-500' : 'bg-gray-300';
    return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

function metricValueClass(tone: SonarMetricTone): string {
    return tone === 'bad' ? 'text-red-700' : tone === 'muted' ? 'text-text-muted' : 'text-text-default';
}

function SonarMetricInline({ m }: { m: SonarMetricCell }) {
    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <MetricDot tone={m.tone} />
            <span className="text-[11px] text-text-muted">{m.label}:</span>
            <span className={`text-[11px] font-bold ${metricValueClass(m.tone)}`}>{m.value}</span>
        </div>
    );
}

function mapApiToDrawerCandidate(c: Record<string, unknown>, matchPct: number): Candidate {
    const backendId = c.id != null ? String(c.id) : '';
    const fullName = candidateDisplayName(c) || '—';
    const avatar = initialsForSonarAvatar(fullName === '—' ? '' : fullName);

    const tags: string[] = [];
    if (Array.isArray(c.tags)) {
        for (const tg of c.tags) {
            if (typeof tg === 'string') tags.push(tg);
            else if (tg && typeof tg === 'object') {
                const o = tg as Record<string, unknown>;
                const n = typeof o.name === 'string' ? o.name : typeof o.label === 'string' ? o.label : '';
                if (n) tags.push(n);
            }
        }
    }

    return {
        id: stableUiId(backendId),
        backendId,
        name: fullName || '—',
        avatar,
        title: candidateDisplayTitle(c),
        status: String(c.status ?? ''),
        lastActivity: String(c.lastActivity ?? c.lastActive ?? ''),
        source: String((c as { source?: string }).source ?? ''),
        tags,
        internalTags: Array.isArray(c.internalTags)
            ? (c.internalTags as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
            : [],
        matchScore: matchPct,
        phone: String(c.phone ?? ''),
        address: String(c.address ?? c.location ?? ''),
        professionalSummary: String(c.professionalSummary ?? c.summary ?? ''),
        email: String(c.email ?? ''),
        location: String(c.location ?? ''),
    };
}

interface SonarResultRowProps {
    layout: 'cards' | 'list';
    row: SonarScanRow;
    job: Record<string, unknown>;
    tagJobModel: JobTagMatchInput;
    actingId: string | null;
    tagLoadingId: string | null;
    openSummaryDrawer: (candidate: Candidate | number) => void;
    openTagPanel: (row: SonarScanRow) => void;
    handleAddToJob: (row: SonarScanRow) => void;
    handleIgnore: (row: SonarScanRow) => void;
    t: (key: string, opts?: Record<string, string | number>) => string;
}

function SonarResultRow({
    layout,
    row,
    job,
    tagJobModel,
    actingId,
    tagLoadingId,
    openSummaryDrawer,
    openTagPanel,
    handleAddToJob,
    handleIgnore,
    t,
}: SonarResultRowProps) {
    const cid = row.candidate.id != null ? String(row.candidate.id) : '';
    const categories = buildJobTagMatchCategories(tagJobModel, row.candidate);
    const gaps = gapChipLabels(categories);
    const name = candidateDisplayName(row.candidate) || cid || '—';
    const title = candidateDisplayTitle(row.candidate);
    const busy = actingId === cid;
    const metrics = buildSonarMetricCells(job, row.candidate, row, t);
    const activity = relativeActivityLabel(row.candidate, t);
    const insight = sonarInsightLine(row.candidate, t);
    const globalCand = isLikelyGlobalCandidate(row.candidate);

    const metricValueCls = (tone: SonarMetricTone) =>
        tone === 'bad' ? 'text-red-700' : tone === 'muted' ? 'text-text-muted' : 'text-text-default';

    const cardShell =
        'bg-white dark:bg-bg-card border border-border-default hover:border-primary-200 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-all cursor-pointer group relative overflow-hidden';
    const rowShadowStyle = { boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' } as React.CSSProperties;

    if (layout === 'list') {
        const subtitle = title.trim() || '—';

        return (
            <div
                role="presentation"
                className={`${cardShell} flex flex-col md:flex-row items-center gap-6 w-full`}
                style={rowShadowStyle}
                onClick={() => openSummaryDrawer(mapApiToDrawerCandidate(row.candidate, row.matchPercentage))}
            >
                <div className="flex items-center gap-4 w-full md:w-[25%] shrink-0 ps-4 border-b md:border-b-0 md:border-s border-border-subtle/50 pb-4 md:pb-0">
                    <div className="relative shrink-0">
                        <SonarCandidateAvatar candidate={row.candidate} />
                        <div
                            className={`absolute -bottom-1 -end-1 border-2 border-white rounded-full p-1 shadow-sm z-20 ${
                                globalCand ? 'bg-accent-100 text-accent-700' : 'bg-primary-100 text-primary-700'
                            }`}
                            title={globalCand ? t('job.sonar.global_badge') : t('job.sonar.pool_badge_tooltip')}
                        >
                            {globalCand ? (
                                <GlobeAmericasIcon className="w-2.5 h-2.5" />
                            ) : (
                                <UserGroupIcon className="w-2.5 h-2.5" />
                            )}
                        </div>
                    </div>
                    <div className="space-y-0.5 text-end w-full min-w-0">
                        <h4 className="font-extrabold text-[15px] text-text-default tracking-tight group-hover:text-primary-600 transition-colors truncate flex items-center justify-between gap-2">
                            <span className="truncate">{name}</span>
                        </h4>
                        <p className="text-[11px] text-text-muted font-medium truncate flex items-center justify-between gap-2">
                            <span className="truncate">{subtitle}</span>
                            {activity ? (
                                <span className="text-[9px] text-text-muted opacity-70 shrink-0 whitespace-nowrap ms-2">
                                    {activity}
                                </span>
                            ) : null}
                        </p>
                    </div>
                </div>

                <div className="flex-1 w-full flex flex-col gap-6 pe-2 min-w-0 self-stretch">
                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center w-full min-w-0">
                        <SonarScoreRing pct={row.matchPercentage} compact />
                        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center flex-1 min-w-0 pe-2">
                            {metrics.map((m) => (
                                <React.Fragment key={m.label}>
                                    <SonarMetricInline m={m} />
                                </React.Fragment>
                            ))}
                        </div>
                    </div>

                    {gaps.length > 0 ? (
                        <div
                            className="mt-3 flex flex-wrap items-center justify-between gap-2 bg-red-50 p-2.5 rounded-lg border border-red-100 cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span className="font-bold text-red-600 text-[11px] shrink-0">
                                    {t('job.sonar.gaps_tags_heading')}
                                </span>
                                <span className="text-red-700 text-[11px]">{gaps.join(', ')}</span>
                            </div>
                            <button
                                type="button"
                                disabled={busy || tagLoadingId === cid}
                                onClick={() => void openTagPanel(row)}
                                className="text-[10px] font-bold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md bg-white border border-border-default shadow-sm hover:border-primary-200 transition-colors shrink-0 whitespace-nowrap"
                            >
                                {tagLoadingId === cid ? t('job.sonar.loading_tags') : t('job.sonar.gaps_more_details')}
                            </button>
                        </div>
                    ) : null}
                </div>
                <div                    className="w-full md:w-auto shrink-0 flex items-center justify-end gap-2 mt-4 md:mt-0 px-2 md:px-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAddToJob(row)}
                        className="flex-1 md:flex-none bg-white border border-border-default hover:border-primary-200 hover:bg-primary-50 text-text-default hover:text-primary-700 font-bold py-2.5 px-6 rounded-xl text-[11px] md:text-sm transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        <CheckCircleIcon className="w-4 h-4 text-primary-500 shrink-0" />
                        {t('job.sonar.add_short')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleIgnore(row)}
                        className="flex-shrink-0 p-2.5 bg-white border border-border-default hover:border-red-200 hover:bg-red-50 text-text-muted hover:text-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
                        title={t('job.sonar.ignore_tooltip')}
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            role="presentation"
            className="bg-white dark:bg-bg-card border border-border-default hover:border-primary-200 rounded-3xl p-4 shadow-sm cursor-pointer group relative flex flex-col transition-all overflow-hidden h-full w-full max-w-[17rem] sm:max-w-[18rem]"
            onClick={() => openSummaryDrawer(mapApiToDrawerCandidate(row.candidate, row.matchPercentage))}
        >
            <div
                className="absolute top-0 right-0 w-full h-24 bg-gradient-to-b from-bg-subtle to-transparent opacity-50 pointer-events-none"
                aria-hidden
            />
            <div className="flex flex-col flex-grow z-10 gap-4">
                <div className="flex justify-between items-start">
                    <SonarScoreRing pct={row.matchPercentage} />
                    <div className="flex flex-col items-end text-right min-w-0 flex-1 ml-8 sm:ml-10">
                        <div className="relative mb-2">
                            <SonarCandidateAvatar candidate={row.candidate} />
                            {globalCand ? (
                                <div
                                    className="absolute -bottom-1 -right-1 bg-accent-100 text-accent-700 border-2 border-white rounded-full p-1 shadow-sm z-20"
                                    title={t('job.sonar.global_badge')}
                                >
                                    <GlobeAmericasIcon className="w-3 h-3" />
                                </div>
                            ) : (
                                <div
                                    className="absolute -bottom-1 -right-1 bg-primary-100 text-primary-700 border-2 border-white rounded-full p-1 shadow-sm z-20"
                                    title={t('job.sonar.pool_badge_tooltip')}
                                >
                                    <UserGroupIcon className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                        <h4 className="font-extrabold text-[15px] text-text-default tracking-tight group-hover:text-primary-600 transition-colors">
                            {name}
                        </h4>
                        <p className="text-[11px] text-text-muted font-medium">{title}</p>
                        {activity ? (
                            <span className="text-[9px] text-text-muted opacity-70 mt-0.5">{activity}</span>
                        ) : null}
                    </div>
                </div>

                <div className="w-full h-px bg-border-subtle" />

                <div className="flex-grow flex flex-col gap-4 w-full">
                    <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                        {metrics.map((m) => (
                            <div key={m.label} className="flex flex-col text-right gap-0.5">
                                <span className="text-[10px] text-text-muted">{m.label}</span>
                                <div className="flex items-center justify-start gap-1.5">
                                    <MetricDot tone={m.tone} />
                                    <span className={`text-[11px] font-bold truncate ${metricValueCls(m.tone)}`}>
                                        {m.value}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {gaps.length > 0 ? (
                        <div
                            className="mt-2 text-[10px] bg-red-50 dark:bg-red-950/30 p-2 rounded-lg border border-red-100 dark:border-red-900/40 flex justify-between items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="min-w-0">
                                <span className="font-bold text-red-600 ml-1">{t('job.sonar.gaps_tags_heading')}</span>
                                <span className="text-red-700">{gaps.join(', ')}</span>
                            </div>
                            <button
                                type="button"
                                disabled={busy || tagLoadingId === cid}
                                onClick={() => void openTagPanel(row)}
                                className="text-[10px] font-bold text-text-muted hover:text-primary-600 px-2 py-1 rounded bg-bg-card border border-border-default whitespace-nowrap shrink-0"
                            >
                                {tagLoadingId === cid ? t('job.sonar.loading_tags') : t('job.sonar.tag_details')}
                            </button>
                        </div>
                    ) : (
                        <div className="mt-2 text-[10px] text-green-700 bg-green-50 dark:bg-green-950/20 px-2 py-1.5 rounded-lg border border-green-100 dark:border-green-900/30 font-semibold">
                            {t('job.sonar.no_gaps')}
                        </div>
                    )}

                    <div className="mt-auto pt-3 border-t border-border-subtle/50">
                        <div className="flex items-start gap-2">
                            <SparklesIcon className="w-3.5 h-3.5 text-primary-400 mt-0.5 shrink-0" />
                            <p className="text-[10px] leading-relaxed text-text-muted">{insight}</p>
                        </div>
                    </div>
                </div>

                <div className="w-full pt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAddToJob(row)}
                        className="flex-1 bg-white dark:bg-bg-card border border-border-default hover:bg-primary-50 hover:border-primary-200 text-text-default hover:text-primary-600 font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        <CheckCircleIcon className="w-4 h-4 text-primary-500" />
                        {t('job.sonar.add_to_job')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleIgnore(row)}
                        className="flex-shrink-0 p-2.5 bg-white dark:bg-bg-card border border-border-default hover:border-red-200 hover:bg-red-50 text-text-muted hover:text-red-600 rounded-xl transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
                        title={t('job.sonar.ignore_tooltip')}
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

const JobSonarView: React.FC<JobSonarViewProps> = ({ jobId, job, openSummaryDrawer }) => {
    const { t } = useLanguage();
    const tagJobModel = useMemo(() => jobRecordToTagMatchJob(job), [job]);

    const [batchSize, setBatchSize] = useState(20);
    const [threshold, setThreshold] = useState(70);
    const [vectorSimilarity, setVectorSimilarity] = useState(true);
    const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set());

    const [rows, setRows] = useState<SonarScanRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const [tagPanelCategories, setTagPanelCategories] = useState<TagMatchCategory[] | null>(null);
    const [tagPanelTitle, setTagPanelTitle] = useState('');
    const [tagLoadingId, setTagLoadingId] = useState<string | null>(null);

    const [actingId, setActingId] = useState<string | null>(null);
    const [resultsLayout, setResultsLayout] = useState<'cards' | 'list'>('cards');

    const toggleFilter = (key: string) => {
        setActiveFilters((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const runSonar = useCallback(async () => {
        const base = apiBase();
        const jid = jobId != null ? String(jobId).trim() : '';
        if (!base || !jid) {
            setError(t('job.sonar.error_no_job'));
            return;
        }
        setLoading(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch(`${base}/api/jobs/${encodeURIComponent(jid)}/sonar-scan`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    limit: batchSize,
                    matchThresholdMin: threshold,
                    useVector: vectorSimilarity,
                    hardFilters: [...activeFilters],
                }),
            });
            if (!res.ok) {
                const msg = await res.text().catch(() => '');
                throw new Error(msg || res.statusText || 'sonar');
            }
            const data = await res.json();
            const list = Array.isArray(data.rows) ? data.rows : [];
            setRows(list as SonarScanRow[]);
            if (!list.length) setFeedback(t('job.sonar.empty_results'));
        } catch (e) {
            console.error('[JobSonarView] sonar-scan', e);
            setRows([]);
            setError(t('job.sonar.error_scan'));
        } finally {
            setLoading(false);
        }
    }, [jobId, batchSize, threshold, vectorSimilarity, activeFilters, t]);

    const enrichCandidateForTags = useCallback(
        async (c: Record<string, unknown>): Promise<Record<string, unknown>> => {
            const base = apiBase();
            const cid = c.id != null ? String(c.id) : '';
            const hasDetails = Array.isArray(c.tagDetails) && (c.tagDetails as unknown[]).length > 0;
            if (!base || !cid || hasDetails) return c;
            try {
                const res = await fetch(`${base}/api/candidates/${encodeURIComponent(cid)}`, {
                    headers: authHeaders(),
                    cache: 'no-store',
                });
                if (!res.ok) return c;
                const full = await res.json();
                return full && typeof full === 'object' ? { ...c, ...full } : c;
            } catch {
                return c;
            }
        },
        [],
    );

    const openTagPanel = async (row: SonarScanRow) => {
        const cid = row.candidate.id != null ? String(row.candidate.id) : '';
        const name = candidateDisplayName(row.candidate) || cid;
        setTagPanelTitle(name);
        setTagLoadingId(cid);
        setTagPanelCategories(null);
        try {
            const cand = await enrichCandidateForTags(row.candidate);
            const categories = buildJobTagMatchCategories(tagJobModel, cand);
            setTagPanelCategories(categories);
        } finally {
            setTagLoadingId(null);
        }
    };

    const closeTagPanel = () => {
        setTagPanelCategories(null);
        setTagPanelTitle('');
    };

    const removeRow = (cid: string) => {
        setRows((prev) => prev.filter((r) => String(r.candidate.id) !== cid));
    };

    const handleAddToJob = async (row: SonarScanRow) => {
        const base = apiBase();
        const jid = jobId != null ? String(jobId).trim() : '';
        const cid = row.candidate.id != null ? String(row.candidate.id) : '';
        if (!base || !jid || !cid) return;
        setActingId(cid);
        setFeedback(null);
        try {
            const res = await fetch(`${base}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    jobId: jid,
                    source: 'bulk_job_filter',
                    manualOverride: true,
                    status: 'חדש',
                }),
            });
            if (!res.ok) throw new Error('link');
            removeRow(cid);
            setFeedback(t('job.sonar.added_ok'));
        } catch {
            setFeedback(t('job.sonar.add_failed'));
        } finally {
            setActingId(null);
        }
    };

    const handleIgnore = async (row: SonarScanRow) => {
        const base = apiBase();
        const jid = jobId != null ? String(jobId).trim() : '';
        const cid = row.candidate.id != null ? String(row.candidate.id) : '';
        if (!base || !jid || !cid) return;
        setActingId(cid);
        setFeedback(null);
        try {
            const res = await fetch(`${base}/api/candidates/${encodeURIComponent(cid)}/screening-data`, {
                method: 'PUT',
                headers: authHeaders(),
                body: JSON.stringify({
                    jobId: jid,
                    screeningStatus: 'rejected',
                    rejectionReason: 'sonar_ignore',
                    rejectionNotes: '',
                    screeningAnswers: [],
                    telephoneImpression: '',
                    internalOpinion: null,
                }),
            });
            if (!res.ok) throw new Error('ignore');
            removeRow(cid);
            setFeedback(t('job.sonar.ignore_ok'));
        } catch {
            setFeedback(t('job.sonar.ignore_failed'));
        } finally {
            setActingId(null);
        }
    };

    const clientLabel = typeof job.client === 'string' ? job.client : '';

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8 bg-bg-surface/30 min-h-[50vh]">
            {feedback && (
                <div
                    className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-semibold text-accent-900"
                    role="status"
                >
                    {feedback}
                </div>
            )}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                <div className="lg:col-span-8 relative overflow-hidden rounded-[2rem] p-8 transition-all duration-700 bg-bg-card border-2 border-border-default shadow-xl shadow-primary-900/5">
                    <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
                        <div className="relative shrink-0">
                            <div className="w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 bg-white border-4 border-primary-50 shadow-inner">
                                <SonarIcon className="w-16 h-16 text-primary-600" />
                            </div>
                        </div>
                        <div className="flex-grow space-y-4 text-center md:text-right">
                            <div className="space-y-1">
                                <h2 className="text-3xl font-black text-text-default">{t('job.sonar.title')}</h2>
                                <p className="text-sm text-text-muted font-medium">
                                    {t('job.sonar.subtitle', { batch: batchSize, threshold })}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void runSonar()}
                                disabled={loading}
                                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black px-12 py-4 rounded-2xl shadow-xl hover:shadow-primary-600/30 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto md:mr-0 md:ml-auto"
                            >
                                <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                                {loading ? t('job.sonar.scanning') : t('job.sonar.run')}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-4 bg-bg-card border-2 border-border-default rounded-[2rem] p-6 shadow-xl shadow-primary-900/5 space-y-6">
                    <div className="flex items-center gap-2 text-text-default font-black text-sm border-b border-border-default pb-3">
                        <FunnelIcon className="w-4 h-4 text-primary-500 shrink-0" />
                        {t('job.sonar.settings')}
                    </div>
                    <div className="space-y-5">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-[11px] font-bold gap-2">
                                <span className="text-text-muted">{t('job.sonar.batch')}</span>
                                <span className="text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md whitespace-nowrap">
                                    {t('job.sonar.batch_display', { count: batchSize })}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={5}
                                max={50}
                                step={5}
                                value={batchSize}
                                onChange={(e) => setBatchSize(Number(e.target.value))}
                                disabled={loading}
                                className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-600"
                            />
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-[11px] font-bold gap-2">
                                <span className="text-text-muted">{t('job.sonar.threshold')}</span>
                                <span className="text-accent-600 bg-accent-50 px-2 py-0.5 rounded-md whitespace-nowrap">
                                    {t('job.sonar.threshold_display', { pct: threshold })}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={50}
                                max={95}
                                step={5}
                                value={threshold}
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                disabled={loading}
                                className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-accent-500"
                            />
                        </div>

                        <label className="flex items-center justify-between p-3 bg-bg-subtle/50 rounded-xl border border-border-subtle cursor-pointer hover:border-primary-300 transition-colors gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
                                    <SparklesIcon className="w-4 h-4 text-accent-500" />
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                    <span className="text-xs font-black text-text-default block">{t('job.sonar.vector')}</span>
                                    <p className="text-[10px] text-text-muted">{t('job.sonar.vector_hint')}</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={vectorSimilarity}
                                onChange={(e) => setVectorSimilarity(e.target.checked)}
                                disabled={loading}
                                className="w-5 h-5 rounded-md text-primary-600 focus:ring-primary-500 shrink-0"
                            />
                        </label>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-[11px] font-bold pb-1 border-b border-border-default/50">
                                <span className="text-text-muted">{t('job.sonar.filters')}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {SONAR_FILTER_KEYS.map((fk) => {
                                    const active = activeFilters.has(fk);
                                    return (
                                        <button
                                            key={fk}
                                            type="button"
                                            onClick={() => toggleFilter(fk)}
                                            disabled={loading}
                                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
                                                active
                                                    ? 'bg-primary-50 text-primary-800 border-primary-300'
                                                    : 'bg-bg-subtle text-text-muted border-border-default hover:bg-bg-surface'
                                            }`}
                                        >
                                            {t(`job.sonar.fl_${fk}`)}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {rows.length > 0 && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-end justify-between px-2 gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-accent-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-accent-600/30 shrink-0">
                                <SparklesIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-black text-xl text-text-default">{t('job.sonar.results_heading')}</h3>
                                <p className="text-xs text-text-muted font-bold tracking-tight uppercase opacity-60">
                                    {t('job.sonar.results_subtitle', { count: rows.length })}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 self-start sm:self-auto flex-wrap justify-end">
                            <div className="flex items-center bg-bg-card border border-border-default rounded-xl p-1 shrink-0">
                                <button
                                    type="button"
                                    title={t('job_events.view_cards')}
                                    aria-pressed={resultsLayout === 'cards'}
                                    onClick={() => setResultsLayout('cards')}
                                    className={`p-1.5 rounded-lg transition-all ${
                                        resultsLayout === 'cards'
                                            ? 'bg-bg-subtle text-primary-600 shadow-sm'
                                            : 'text-text-muted hover:text-text-default hover:bg-bg-surface'
                                    }`}
                                >
                                    <Squares2X2Icon className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    title={t('candidates.view_list')}
                                    aria-pressed={resultsLayout === 'list'}
                                    onClick={() => setResultsLayout('list')}
                                    className={`p-1.5 rounded-lg transition-all ${
                                        resultsLayout === 'list'
                                            ? 'bg-bg-subtle text-primary-600 shadow-sm'
                                            : 'text-text-muted hover:text-text-default hover:bg-bg-surface'
                                    }`}
                                >
                                    <ListBulletIcon className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] font-bold text-text-muted bg-bg-card p-1.5 rounded-xl border border-border-default">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-subtle">
                                    <UserGroupIcon className="w-3 h-3 text-primary-500" />
                                    {t('job.sonar.legend_pool_strip')}
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-subtle">
                                    <GlobeAmericasIcon className="w-3 h-3 text-accent-500" />
                                    {t('job.sonar.legend_global_strip')}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        className={
                            resultsLayout === 'cards'
                                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 justify-items-center'
                                : 'flex flex-col gap-4'
                        }
                    >
                        {rows.map((row) => {
                            const rk =
                                row.candidate.id != null ? String(row.candidate.id) : candidateDisplayName(row.candidate);
                            return (
                                <React.Fragment key={rk || 'row'}>
                                    <SonarResultRow
                                        layout={resultsLayout}
                                        row={row}
                                        job={job}
                                        tagJobModel={tagJobModel}
                                        actingId={actingId}
                                        tagLoadingId={tagLoadingId}
                                        openSummaryDrawer={openSummaryDrawer}
                                        openTagPanel={openTagPanel}
                                        handleAddToJob={handleAddToJob}
                                        handleIgnore={handleIgnore}
                                        t={t}
                                    />
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            )}

            {tagPanelCategories && (
                <TagMatchPanel
                    isOpen
                    onClose={closeTagPanel}
                    title={tagPanelTitle}
                    subtitle={clientLabel}
                    categories={tagPanelCategories}
                />
            )}
        </div>
    );
};

export default JobSonarView;
