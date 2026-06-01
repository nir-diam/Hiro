/** Shared Sonar / match-popup metric builders (traffic-light dots + grid). */

export type SonarMetricTone = 'good' | 'bad' | 'muted';

export type SonarMetricCell = {
    label: string;
    value: string;
    tone: SonarMetricTone;
};

type IntentTranslate = (key: string, params?: Record<string, string | number>) => string;

/** Affinity / intent row from engine breakdown (linked jobs + taxonomy). */
export function formatIntentAffinityMetric(
    breakdown: SonarScoreBreakdown | null | undefined,
    t: IntentTranslate,
): SonarMetricCell {
    const scoreRaw = breakdown?.intentScore ?? breakdown?.intent;
    const score =
        typeof scoreRaw === 'number' && Number.isFinite(scoreRaw) ? Math.round(scoreRaw) : null;
    const intentType = String(breakdown?.intentType ?? '').trim();

    if (score == null && !intentType) {
        return {
            label: t('job.sonar.fl_affinity'),
            value: t('job.sonar.affinity_unknown'),
            tone: 'muted',
        };
    }

    const typeKey =
        intentType === 'exact' ||
        intentType === 'role' ||
        intentType === 'category' ||
        intentType === 'different' ||
        intentType === 'cluster'
            ? `job.sonar.intent_${intentType === 'cluster' ? 'role' : intentType}`
            : 'job.sonar.affinity_unknown';

    const label = t(typeKey);
    const value =
        score != null ? t('job.sonar.intent_score_value', { label, score }) : label;

    let tone: SonarMetricTone = 'muted';
    if (score != null) {
        if (score >= 80) tone = 'good';
        else if (score <= 0) tone = 'bad';
        else tone = 'muted';
    } else if (intentType === 'different') {
        tone = 'bad';
    } else if (intentType === 'exact' || intentType === 'role') {
        tone = 'good';
    }

    return { label: t('job.sonar.fl_affinity'), value, tone };
}

export type ParameterMatchStatus = 'match' | 'missing' | 'mismatch' | 'gap' | 'unknown';

export type SonarScoreBreakdown = {
    semanticScore?: number;
    vector?: number;
    tagsScore?: number;
    tags?: number;
    geoScore?: number;
    geo?: number;
    geoDistance?: number | null;
    geoMissing?: boolean;
    intentScore?: number;
    intent?: number;
    intentType?: string;
    experienceScore?: number;
    experience?: number;
    /** When false, experience layer is off in matching engine config */
    isExperienceEnabled?: boolean;
    coreScore?: number;
    weightedContributions?: Record<string, { score: number; weight: number; points: number }>;
    salaryPenalty?: number;
    ageGapPenalty?: number;
    generalPenalties?: number;
    penaltyReasons?: Array<{ label: string; amount: number; key?: string; type?: string }>;
};

export type SonarMatchRowInput = {
    matchPercentage: number;
    vectorSimilarity?: number | null;
    scoreBreakdown?: SonarScoreBreakdown | null;
    parameterMatches?: Partial<
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
    > | null;
};

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

function normGenderBucket(raw: string): 'm' | 'f' | '' {
    const x = raw.trim().toLowerCase();
    if (!x) return '';
    if (/זכר|^male$|^m$/i.test(x) || x === 'גבר') return 'm';
    if (/נקבה|^female$|^f$/i.test(x) || x === 'אישה') return 'f';
    return '';
}

function isSonarPlaceholderValue(val: string, emdash: string): boolean {
    const s = String(val ?? '').trim();
    return !s || s === emdash || s === '-';
}

function toneFromParameterMatch(
    pm: SonarMatchRowInput['parameterMatches'],
    key: keyof NonNullable<SonarMatchRowInput['parameterMatches']>,
    fallback: SonarMetricTone,
): SonarMetricTone {
    const v = pm?.[key];
    if (v === 'match') return 'good';
    if (v === 'missing' || v === 'mismatch' || v === 'gap') return 'bad';
    if (v === 'unknown') return 'muted';
    return fallback;
}

function cosineSimilarityToPct(sim: number | null | undefined): number | null {
    if (sim == null || !Number.isFinite(sim)) return null;
    if (sim >= 0 && sim <= 1) return Math.round(sim * 100);
    return Math.round(((sim + 1) / 2) * 100);
}

function layerScoreTone(score: number | null, threshold: number): SonarMetricTone {
    if (score == null) return 'muted';
    if (score >= threshold) return 'good';
    if (score < Math.max(40, threshold - 20)) return 'bad';
    return 'muted';
}

export function pickBreakdownScore(...vals: (number | undefined)[]): number | null {
    for (const v of vals) {
        if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    }
    return null;
}

/** Semantic / vector layer % from engine breakdown (not overall matchScore). */
export function vectorLayerPctFromBreakdown(
    bd: SonarScoreBreakdown | null | undefined,
): number | null {
    return pickBreakdownScore(bd?.semanticScore, bd?.vector);
}

/**
 * True when matching engine has the experience layer enabled (admin "הפעל שכבת ניסיון" checkbox).
 * Weight may be 0 while the layer is still on — only explicit `isExperienceEnabled: false` hides it.
 */
export function isExperienceLayerActive(bd: SonarScoreBreakdown | null | undefined): boolean {
    if (!bd) return false;
    return bd.isExperienceEnabled !== false;
}

export function buildSonarFormulaMetrics(
    row: SonarMatchRowInput,
    t: (key: string, opts?: Record<string, string | number>) => string,
    matchThresholdMin?: number,
): SonarMetricCell[] {
    const thrRaw = Number(matchThresholdMin);
    const threshold = Number.isFinite(thrRaw) && thrRaw > 0 ? thrRaw : 70;
    const bd = row.scoreBreakdown;
    const cells: SonarMetricCell[] = [];

    const searchPct = cosineSimilarityToPct(
        typeof row.vectorSimilarity === 'number' ? row.vectorSimilarity : null,
    );
    if (searchPct != null) {
        cells.push({
            label: t('job.sonar.metric_vector_search'),
            value: `${searchPct}%`,
            tone: layerScoreTone(searchPct, threshold),
        });
    }

    const wc = bd?.weightedContributions;
    const layerRow = (key: string, labelKey: string, scoreVals: (number | undefined)[]) => {
        const score = pickBreakdownScore(...scoreVals);
        if (score == null) return;
        const contrib = wc?.[key];
        const w = contrib?.weight;
        const pts = contrib?.points;
        const value =
            typeof w === 'number' && typeof pts === 'number'
                ? `${score}% · ${Math.round(pts)} נק' (משקל ${w}%)`
                : `${score}%`;
        cells.push({
            label: t(labelKey),
            value,
            tone: layerScoreTone(score, threshold),
        });
    };

    layerRow('vector', 'job.sonar.layer_semantic', [bd?.semanticScore, bd?.vector]);
    layerRow('tags', 'job.sonar.layer_tags', [bd?.tagsScore, bd?.tags]);
    layerRow('geo', 'job.sonar.layer_geo', [bd?.geoScore, bd?.geo]);
    layerRow('intent', 'job.sonar.layer_intent', [bd?.intentScore, bd?.intent]);
    if (isExperienceLayerActive(bd)) {
        layerRow('experience', 'job.sonar.layer_experience', [bd?.experienceScore, bd?.experience]);
    }

    const core = pickBreakdownScore(bd?.coreScore);
    if (core != null) {
        cells.push({
            label: t('job.sonar.layer_core'),
            value: `${core}%`,
            tone: layerScoreTone(core, threshold),
        });
    }

    const penaltyTotal =
        (bd?.generalPenalties ?? 0) + (bd?.salaryPenalty ?? 0) + (bd?.ageGapPenalty ?? 0);
    const reasons = Array.isArray(bd?.penaltyReasons) ? bd.penaltyReasons : [];
    const listed = reasons.filter((pr) => pr && typeof pr.amount === 'number' && pr.amount > 0).slice(0, 3);
    if (listed.length) {
        for (const pr of listed) {
            cells.push({
                label: String(pr.label || pr.key || t('job.sonar.layer_penalties')),
                value: `-${Math.round(pr.amount)}`,
                tone: 'bad',
            });
        }
    } else if (penaltyTotal > 0) {
        cells.push({
            label: t('job.sonar.layer_penalties'),
            value: `-${Math.round(penaltyTotal)}`,
            tone: 'bad',
        });
    }

    return cells;
}

export function buildSonarRequirementMetrics(
    job: Record<string, unknown>,
    c: Record<string, unknown>,
    row: SonarMatchRowInput,
    t: (key: string, opts?: Record<string, string | number>) => string,
    _matchThresholdMin?: number,
): SonarMetricCell[] {
    const emdash = '—';

    const prefs = Array.isArray(c.preferredWorkModels) ? (c.preferredWorkModels as string[]) : [];
    const scopes = Array.isArray(c.jobScopes) ? (c.jobScopes as string[]) : [];
    const scopeVal =
        String(c.jobScope ?? '').trim() ||
        (scopes.length ? scopes.join(', ') : '') ||
        (prefs.length ? prefs.join(', ') : '') ||
        normJobType(job) ||
        emdash;

    const jobTypes = Array.isArray(job.jobType)
        ? (job.jobType as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean)
        : [];
    const jobEmpT = String((job as { employmentType?: unknown }).employmentType ?? '').trim();
    const jobSingleScope = String(job.jobScope ?? '').trim();
    const jobHasScopeReq = Boolean(jobTypes.length || jobEmpT || jobSingleScope);
    let scopeTone: SonarMetricTone = 'muted';
    if (jobHasScopeReq) {
        if (isSonarPlaceholderValue(scopeVal, emdash)) scopeTone = 'bad';
        else {
            const blob = scopeVal.toLowerCase();
            const needles = [...jobTypes, jobEmpT, jobSingleScope].map((s) => s.toLowerCase()).filter((s) => s.length >= 2);
            const hit = needles.some((n) => blob.includes(n) || n.includes(blob));
            scopeTone = hit ? 'good' : 'bad';
        }
    }

    const hoursVal =
        String(c.preferredWorkingHours ?? '').trim() ||
        prefs.find((p) => /בוקר|ערב|לילה|גמיש|morning|evening/i.test(p)) ||
        emdash;
    const jobPwh = String(job.preferredWorkingHours ?? '').trim();
    const jobAvail = String(job.availability ?? '').trim();
    const jobHasHoursReq = Boolean(jobPwh || jobAvail);
    let hoursTone: SonarMetricTone = 'muted';
    if (jobHasHoursReq) {
        if (isSonarPlaceholderValue(hoursVal, emdash)) hoursTone = 'bad';
        else {
            const cand = hoursVal.toLowerCase();
            const jb = `${jobPwh} ${jobAvail}`.toLowerCase().trim();
            if (!jb) hoursTone = 'good';
            else if (jb === 'גמיש' && cand.includes('גמיש')) hoursTone = 'good';
            else if (jb === 'גמיש') hoursTone = 'good';
            else {
                const tokens = jb.split(/[\s,/|]+/).filter((w) => w.length > 2);
                hoursTone =
                    tokens.some((w) => cand.includes(w)) ||
                    cand.split(/[\s,]+/).some((w) => w.length > 2 && jb.includes(w))
                        ? 'good'
                        : 'bad';
            }
        }
    }

    const jobGeoText = String(job.city ?? job.region ?? job.location ?? '').trim();
    const jobHasGeoTarget = Boolean(jobGeoText);
    const bd = row.scoreBreakdown;
    const rawGeoKm = bd?.geoDistance;
    const geoKm = typeof rawGeoKm === 'number' && Number.isFinite(rawGeoKm) ? Math.round(rawGeoKm) : null;
    const geoMissing = Boolean(bd?.geoMissing);
    const geoScoreNum = typeof bd?.geo === 'number' && Number.isFinite(bd.geo) ? bd.geo : null;

    let distanceVal: string;
    let distanceTone: SonarMetricTone = 'muted';
    if (!jobHasGeoTarget) {
        distanceVal = t('job.sonar.distance_not_on_job');
        distanceTone = 'muted';
    } else if (geoKm != null) {
        distanceVal = t('job.sonar.distance_km', { km: geoKm });
        if (geoScoreNum != null) {
            distanceTone = geoScoreNum >= 72 ? 'good' : geoScoreNum < 55 ? 'bad' : 'muted';
        } else {
            distanceTone = geoKm <= 25 ? 'good' : geoKm > 60 ? 'bad' : 'muted';
        }
    } else {
        distanceVal = t('job.sonar.distance_na');
        distanceTone = geoMissing ? 'bad' : 'muted';
    }

    const jobAgeMin = job.ageMin != null ? Number(job.ageMin) : null;
    const jobAgeMax = job.ageMax != null ? Number(job.ageMax) : null;
    const jobHasAgeReq =
        (jobAgeMin != null && Number.isFinite(jobAgeMin)) || (jobAgeMax != null && Number.isFinite(jobAgeMax));
    const ageVal = String(c.age ?? '').trim() || emdash;
    let ageTone: SonarMetricTone = 'muted';
    if (jobHasAgeReq) {
        if (isSonarPlaceholderValue(ageVal, emdash)) ageTone = 'bad';
        else {
            const ageNum = parseInt(String(c.age).replace(/[^\d]/g, ''), 10);
            if (!Number.isFinite(ageNum)) ageTone = 'bad';
            else if (
                (jobAgeMin != null && Number.isFinite(jobAgeMin) && ageNum < jobAgeMin) ||
                (jobAgeMax != null && Number.isFinite(jobAgeMax) && ageNum > jobAgeMax)
            ) {
                ageTone = 'bad';
            } else ageTone = 'good';
        }
    }

    const genderVal = String(c.gender ?? '').trim() || emdash;
    const jobGenderRaw = String(job.gender ?? '').trim();
    let genderTone: SonarMetricTone = 'muted';
    if (jobGenderRaw && !/^לא\s*משנה/i.test(jobGenderRaw)) {
        if (isSonarPlaceholderValue(genderVal, emdash)) genderTone = 'bad';
        else {
            const jb = normGenderBucket(jobGenderRaw);
            const cb = normGenderBucket(genderVal);
            if (jb && cb) genderTone = jb === cb ? 'good' : 'bad';
            else genderTone = 'muted';
        }
    }

    const mobilityStr = String(c.mobility ?? '').trim();
    const mobilityMeaningful = mobilityStr && !isSonarPlaceholderValue(mobilityStr, emdash);
    const mobilityVal = mobilityMeaningful ? mobilityStr : emdash;
    let mobilityTone: SonarMetricTone = 'muted';
    if (job.mobility === true) {
        if (!mobilityMeaningful) mobilityTone = 'bad';
        else {
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
    }

    const jobLic = String(job.licenseType ?? '').trim();
    const licRaw = candLicenseSummary(c);
    const licEmpty = !licRaw;
    const licVal = licRaw || emdash;
    let licTone: SonarMetricTone = 'muted';
    let licDisplay = licVal;
    if (jobLic) {
        if (licEmpty) {
            licTone = 'bad';
            licDisplay = t('job.sonar.license_none');
        } else {
            licTone = 'good';
        }
    }

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
        salaryTone = 'muted';
    }

    const affMetric = formatIntentAffinityMetric(bd, t);

    const pm = row.parameterMatches;
    scopeTone = toneFromParameterMatch(pm, 'scope', scopeTone);
    hoursTone = toneFromParameterMatch(pm, 'work_hours', hoursTone);
    ageTone = toneFromParameterMatch(pm, 'age', ageTone);
    genderTone = toneFromParameterMatch(pm, 'gender', genderTone);
    mobilityTone = toneFromParameterMatch(pm, 'mobility', mobilityTone);
    licTone = toneFromParameterMatch(pm, 'license', licTone);
    salaryTone = toneFromParameterMatch(pm, 'salary', salaryTone);

    return [
        { label: t('job.sonar.fl_scope'), value: scopeVal, tone: scopeTone },
        { label: t('job.sonar.fl_hours'), value: hoursVal, tone: hoursTone },
        { label: t('job.sonar.fl_distance'), value: distanceVal, tone: distanceTone },
        { label: t('job.sonar.fl_age'), value: ageVal, tone: ageTone },
        { label: t('job.sonar.fl_gender'), value: genderVal, tone: genderTone },
        { label: t('job.sonar.fl_mobility'), value: mobilityVal, tone: mobilityTone },
        { label: t('job.sonar.fl_license'), value: licDisplay, tone: licTone },
        { label: t('job.sonar.fl_salary'), value: salaryVal, tone: salaryTone },
        affMetric,
    ];
}

/** Map list-view candidate fields to sonar requirement metric input. */
export function candidateToSonarRecord(candidate: {
    backendId?: string;
    gender?: string;
    age?: string;
    jobScopes?: string[];
    preferredWorkingHours?: string;
    availability?: string;
    address?: string;
    location?: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    field?: string;
    industry?: string;
    mobility?: string;
    drivingLicense?: string;
}): Record<string, unknown> {
    return {
        id: candidate.backendId,
        gender: candidate.gender,
        age: candidate.age,
        jobScopes: candidate.jobScopes,
        preferredWorkingHours: candidate.preferredWorkingHours ?? candidate.availability,
        address: candidate.address ?? candidate.location,
        location: candidate.location ?? candidate.address,
        salaryMin: candidate.salaryMin,
        salaryMax: candidate.salaryMax,
        field: candidate.field,
        industry: candidate.industry,
        mobility: candidate.mobility,
        drivingLicense: candidate.drivingLicense,
    };
}
