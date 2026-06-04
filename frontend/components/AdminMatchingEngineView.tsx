
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
    SparklesIcon, 
    TagIcon, 
    GlobeAmericasIcon, 
    BriefcaseIcon, 
    ArrowPathIcon,
    CheckCircleIcon,
    InformationCircleIcon,
    AcademicCapIcon,
    LanguageIcon,
    WrenchScrewdriverIcon,
    UserGroupIcon,
    BuildingOffice2Icon,
    ShieldCheckIcon,
    ScaleIcon,
    FolderIcon,
    XCircleIcon,
    TrashIcon,
    PlusIcon
} from './Icons';

interface WeightSetting {
    id: string;
    label: string;
    value: number;
    icon: React.ReactNode;
    description: string;
}

const API_BASE        = import.meta.env.VITE_API_BASE || '';
const API_CONFIG      = `${API_BASE}/api/admin/matching-engine/config`;
const API_PRESETS     = `${API_BASE}/api/admin/matching-engine/presets`;
const API_SIMULATE    = `${API_BASE}/api/admin/matching-engine/simulate`;
const API_CLIENTS     = `${API_BASE}/api/clients`;
const API_CANDIDATES  = `${API_BASE}/api/candidates`;
const API_JOBS        = `${API_BASE}/api/jobs`;

const SIM_PICKER_SEARCH_MIN = 2;
const SIM_PICKER_DEBOUNCE_MS = 350;
const SIM_PICKER_RESULT_LIMIT = 30;

/**
 * This screen talks only to admin matching-engine endpoints and `GET /api/clients` (labels for chips).
 * It does not read or write `client_usage_settings` — the tenant’s chosen preset id
 * (`matching_engine_preset_id`) is owned by Company Settings (usage-settings API), not the admin UI.
 */
const buildHeaders = (json = false): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
};

interface DbPreset {
    id: number;
    configKey: string;
    label: string;
    description: string;
    clientIds: string[];
    config: Record<string, unknown>;
    createdAt: string;
}

interface ClientOption {
    id: string;
    name: string;
    displayName?: string;
}

type PenaltyPolicyRow = { mismatch: number; missing: number };

const DEFAULT_PENALTY_POLICIES: Record<string, PenaltyPolicyRow> = {
    gender:       { mismatch: 10, missing: 5 },
    mobility:     { mismatch: 10, missing: 5 },
    scope:        { mismatch: 10, missing: 5 },
    license:      { mismatch: 10, missing: 5 },
    work_hours:   { mismatch: 8,  missing: 4 },
    availability: { mismatch: 8,  missing: 4 },
};

const PENALTY_DIMENSION_META: { id: keyof typeof DEFAULT_PENALTY_POLICIES; label: string }[] = [
    { id: 'gender',       label: 'מין' },
    { id: 'mobility',     label: 'ניידות' },
    { id: 'scope',        label: 'היקף משרה' },
    { id: 'license',      label: 'רישיון נהיגה' },
    { id: 'work_hours',   label: 'שעות עבודה' },
    { id: 'availability', label: 'זמינות' },
];

function normalizePenaltyPoliciesFromCfg(cfg: Record<string, unknown> | undefined): Record<string, PenaltyPolicyRow> {
    const raw = cfg?.penaltyPolicies as Record<string, PenaltyPolicyRow> | undefined;
    const out: Record<string, PenaltyPolicyRow> = {};
    for (const [id, def] of Object.entries(DEFAULT_PENALTY_POLICIES)) {
        const row = raw?.[id];
        out[id] = {
            mismatch: Number(row?.mismatch ?? def.mismatch),
            missing:  Number(row?.missing  ?? def.missing),
        };
    }
    return out;
}

const AdminMatchingEngineView: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);

    // Main Algorithm Weights
    const [mainWeights, setMainWeights] = useState<WeightSetting[]>([
        { 
            id: 'vector', 
            label: 'חיפוש סמנטי (Vector)', 
            value: 20, 
            icon: <SparklesIcon className="w-5 h-5 text-purple-500" />,
            description: 'הבנת הקשר ומשמעות מעבר למילות מפתח מדויקות'
        },
        { 
            id: 'tags', 
            label: 'שכבת תגיות (Tags)', 
            value: 35, 
            icon: <TagIcon className="w-5 h-5 text-blue-500" />,
            description: 'דיוק לפי 9 קטגוריות הליבה המובנות'
        },
        { 
            id: 'geo', 
            label: 'גיאוגרפיה (Geo)', 
            value: 20, 
            icon: <GlobeAmericasIcon className="w-5 h-5 text-emerald-500" />,
            description: 'קרבה פיזית בין המועמד למשרה'
        },
        { 
            id: 'experience', 
            label: 'ניסיון וחברות (Exp)', 
            value: 15, 
            icon: <BriefcaseIcon className="w-5 h-5 text-orange-500" />,
            description: 'איכות המעסיקים הקודמים והתאמה לתעשייה'
        },
        { 
            id: 'intent', 
            label: 'זיקה למשרה (Intent)', 
            value: 10, 
            icon: <UserGroupIcon className="w-5 h-5 text-rose-500" />,
            description: 'הגשה ספציפית למשרה או התעניינות בתחום משיק'
        },
    ]);

    const [intentWeights, setIntentWeights] = useState<WeightSetting[]>([
        { id: 'exact', label: 'אותה משרה בדיוק', value: 100, icon: <UserGroupIcon className="w-4 h-4" />, description: 'הגשה מפורשת למשרה זו' },
        { id: 'role', label: 'Role שונה מאותו קלאסטר', value: 60, icon: <BriefcaseIcon className="w-4 h-4" />, description: 'הגשה למשרה באותו טייטל' },
        { id: 'cluster', label: 'Role שונה מקלאסטר שונה מאותה קטגוריה', value: 30, icon: <TagIcon className="w-4 h-4" />, description: 'הגשה לתפקיד קרוב סמנטית' },
        { id: 'different', label: 'תחום אחר לגמרי', value: 0, icon: <XCircleIcon className="w-4 h-4" />, description: 'הגשה לתפקיד ללא הקשר' },
    ]);

    // Internal Tag Category Weights
    const [tagWeights, setTagWeights] = useState<WeightSetting[]>([
        { id: 'role', label: 'תפקיד', value: 100, icon: <UserGroupIcon className="w-4 h-4" />, description: 'התאמה לתפקיד המוגדר' },
        { id: 'seniority', label: 'בכירות', value: 80, icon: <ShieldCheckIcon className="w-4 h-4" />, description: 'רמת ניסיון ודרג' },
        { id: 'skill', label: 'מיומנות', value: 70, icon: <TagIcon className="w-4 h-4" />, description: 'כישורים מקצועיים' },
        { id: 'tool', label: 'כלי / תוכנה', value: 60, icon: <WrenchScrewdriverIcon className="w-4 h-4" />, description: 'שליטה בכלים טכנולוגיים' },
        { id: 'industry', label: 'תעשייה', value: 50, icon: <BuildingOffice2Icon className="w-4 h-4" />, description: 'ניסיון בתחום הפעילות' },
        { id: 'education', label: 'השכלה', value: 40, icon: <AcademicCapIcon className="w-4 h-4" />, description: 'תארים והסמכות אקדמיות' },
        { id: 'language', label: 'שפה', value: 30, icon: <LanguageIcon className="w-4 h-4" />, description: 'שליטה בשפות נדרשות' },
        { id: 'soft_skill', label: 'כישור רך', value: 20, icon: <UserGroupIcon className="w-4 h-4" />, description: 'תכונות אישיות ובינאישיות' },
        { id: 'certification', label: 'הסמכה/תעודה', value: 20, icon: <ShieldCheckIcon className="w-4 h-4" />, description: 'תעודות מקצועיות' },
    ]);

    // Tag Source Weights
    const [sourceWeights, setSourceWeights] = useState<WeightSetting[]>([
        { id: 'recruiter', label: 'הוספה ע"י רכז', value: 100, icon: <UserGroupIcon className="w-4 h-4 text-blue-500" />, description: 'תגיות שאומתו ידנית ע"י איש מקצוע' },
        { id: 'candidate', label: 'הוספה ע"י מועמד', value: 70, icon: <UserGroupIcon className="w-4 h-4 text-emerald-500" />, description: 'תגיות שהמועמד העיד על עצמו' },
        { id: 'ai', label: 'חילוץ AI (אוטומטי)', value: 50, icon: <SparklesIcon className="w-4 h-4 text-purple-500" />, description: 'תגיות שחולצו אוטומטית מקורות החיים' },
    ]);

    // Geo Regional Logic
    const [geoRegions, setGeoRegions] = useState([
        { id: 'center', label: 'מרכז, שרון וגוש דן', grace: 15, penaltyPerKm: 2 },
        { id: 'shfela', label: 'השפלה', grace: 20, penaltyPerKm: 1.5 },
        { id: 'jerusalem', label: 'ירושלים והסביבה', grace: 20, penaltyPerKm: 1.5 },
        { id: 'north', label: 'צפון', grace: 30, penaltyPerKm: 1 },
        { id: 'south', label: 'דרום', grace: 30, penaltyPerKm: 1 },
    ]);

    const [missingGeoScore, setMissingGeoScore] = useState(50);
    const [missingSalaryScore, setMissingSalaryScore] = useState(0);

    // Salary Penalty Settings
    const [salaryDiffThreshold, setSalaryDiffThreshold] = useState(10);
    const [salaryPenalty, setSalaryPenalty] = useState(5);

    // Age Gap Penalty Settings
    const [ageGapPenalty, setAgeGapPenalty] = useState(2);
    const [missingAgeScore, setMissingAgeScore] = useState(6);

    const [isExperienceEnabled, setIsExperienceEnabled] = useState(true);

    const [penaltyPolicies, setPenaltyPolicies] = useState<Record<string, PenaltyPolicyRow>>(
        () => ({ ...DEFAULT_PENALTY_POLICIES }),
    );

    // Simulator — real backend IDs
    const [simCandidateId, setSimCandidateId] = useState('');
    const [simJobId,       setSimJobId]       = useState('');
    const [simResult,      setSimResult]      = useState<any>(null);
    const [isSimulating,   setIsSimulating]   = useState(false);
    const [simError,       setSimError]       = useState<string | null>(null);

    /** Optional overrides merged on top of DB candidate/job (empty = use real data). */
    const [simOverrides, setSimOverrides] = useState({
        candidateGender: '',
        jobGender: '',
        candidateMobility: '',
        jobMobility: '' as '' | 'true' | 'false',
        candidateLicense: '',
        jobLicense: '',
        candidateScope: '',
        jobJobType: '' as '' | 'מלאה' | 'חלקית' | 'משמרות',
        candidateAvailability: '',
        candidateWorkHours: '',
    });

    // Typeahead search for simulator pickers (no bulk load)
    const [candidateResults, setCandidateResults] = useState<{ id: string; name: string }[]>([]);
    const [jobResults, setJobResults] = useState<{ id: string; title: string }[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<{ id: string; name: string } | null>(null);
    const [selectedJob, setSelectedJob] = useState<{ id: string; title: string } | null>(null);
    const [candidateFilter, setCandidateFilter] = useState('');
    const [jobFilter, setJobFilter] = useState('');
    const [isFetchingCandidates, setIsFetchingCandidates] = useState(false);
    const [isFetchingJobs, setIsFetchingJobs] = useState(false);

    useEffect(() => {
        const q = candidateFilter.trim();
        if (q.length < SIM_PICKER_SEARCH_MIN) {
            setCandidateResults([]);
            return undefined;
        }
        const timer = window.setTimeout(async () => {
            setIsFetchingCandidates(true);
            try {
                const res = await fetch(
                    `${API_CANDIDATES}?search=${encodeURIComponent(q)}&limit=${SIM_PICKER_RESULT_LIMIT}`,
                    { headers: buildHeaders() },
                );
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data.data ?? data.rows ?? []);
                    const mapped = list
                        .map((c: { id?: string; fullName?: string; firstName?: string }) => ({
                            id: String(c.id),
                            name: String(c.fullName || c.firstName || c.id),
                        }))
                        .filter((c: { id: string }) => c.id);
                    setCandidateResults(mapped);
                }
            } catch {
                /* silent */
            } finally {
                setIsFetchingCandidates(false);
            }
        }, SIM_PICKER_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [candidateFilter]);

    useEffect(() => {
        const q = jobFilter.trim();
        if (q.length < SIM_PICKER_SEARCH_MIN) {
            setJobResults([]);
            return undefined;
        }
        const timer = window.setTimeout(async () => {
            setIsFetchingJobs(true);
            try {
                const res = await fetch(
                    `${API_JOBS}?search=${encodeURIComponent(q)}&limit=${SIM_PICKER_RESULT_LIMIT}`,
                    { headers: buildHeaders() },
                );
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data.data ?? data.rows ?? []);
                    const mapped = list
                        .map((j: { id?: string; title?: string; publicJobTitle?: string; client?: string }) => {
                            const title = String(j.title || j.publicJobTitle || j.id || '');
                            const client = j.client ? String(j.client).trim() : '';
                            return {
                                id: String(j.id),
                                title: client ? `${title} · ${client}` : title,
                            };
                        })
                        .filter((j: { id: string }) => j.id);
                    setJobResults(mapped);
                }
            } catch {
                /* silent */
            } finally {
                setIsFetchingJobs(false);
            }
        }, SIM_PICKER_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [jobFilter]);

    const candidateOptions = useMemo(() => {
        const byId = new Map<string, { id: string; name: string }>();
        if (selectedCandidate) byId.set(selectedCandidate.id, selectedCandidate);
        for (const c of candidateResults) byId.set(c.id, c);
        return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    }, [candidateResults, selectedCandidate]);

    const jobOptions = useMemo(() => {
        const byId = new Map<string, { id: string; title: string }>();
        if (selectedJob) byId.set(selectedJob.id, selectedJob);
        for (const j of jobResults) byId.set(j.id, j);
        return Array.from(byId.values()).sort((a, b) => a.title.localeCompare(b.title, 'he'));
    }, [jobResults, selectedJob]);

    const runSimulation = async () => {
        if (!simCandidateId || !simJobId) {
            setSimError('יש לבחור מועמד ומשרה לפני הרצת הסימולציה');
            return;
        }
        setIsSimulating(true);
        setSimError(null);
        setSimResult(null);
        try {
            const res = await fetch(API_SIMULATE, {
                method: 'POST',
                headers: buildHeaders(true),
                body: JSON.stringify({
                    candidateId: simCandidateId,
                    jobId:       simJobId,
                    // Live panel state only — preset is already applied to sliders when selected
                    config:      buildPayload(),
                    candidateOverrides: (() => {
                        const o: Record<string, unknown> = {};
                        if (simOverrides.candidateGender.trim()) o.gender = simOverrides.candidateGender.trim();
                        if (simOverrides.candidateMobility.trim()) o.mobility = simOverrides.candidateMobility.trim();
                        if (simOverrides.candidateLicense.trim()) o.drivingLicense = simOverrides.candidateLicense.trim();
                        if (simOverrides.candidateScope.trim()) o.jobScope = simOverrides.candidateScope.trim();
                        if (simOverrides.candidateAvailability.trim()) o.availability = simOverrides.candidateAvailability.trim();
                        if (simOverrides.candidateWorkHours.trim()) o.preferredWorkingHours = simOverrides.candidateWorkHours.trim();
                        return Object.keys(o).length ? o : undefined;
                    })(),
                    jobOverrides: (() => {
                        const o: Record<string, unknown> = {};
                        if (simOverrides.jobGender.trim()) o.gender = simOverrides.jobGender.trim();
                        if (simOverrides.jobMobility === 'true') o.mobility = true;
                        if (simOverrides.jobMobility === 'false') o.mobility = false;
                        if (simOverrides.jobLicense.trim()) o.licenseType = simOverrides.jobLicense.trim();
                        if (simOverrides.jobJobType) o.jobType = [simOverrides.jobJobType];
                        return Object.keys(o).length ? o : undefined;
                    })(),
                }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            // Normalise to the shape the results panel expects
            setSimResult({
                score:         data.finalScore,
                candidateName: data.candidateName,
                jobTitle:      data.jobTitle,
                breakdown:     data.breakdown,
                penaltyPoliciesUsed: data.penaltyPoliciesUsed as Record<string, { mismatch: number; missing: number }> | undefined,
            });
        } catch (err: unknown) {
            setSimError(err instanceof Error ? err.message : 'שגיאה בסימולציה');
        } finally {
            setIsSimulating(false);
        }
    };

    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // ── load saved config + presets + clients on mount ───────────────────────
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(API_CONFIG, { headers: buildHeaders() });
                if (!res.ok) return;
                const cfg = await res.json();

                if (cfg.mainWeights)
                    setMainWeights(prev => prev.map(w => ({ ...w, value: cfg.mainWeights[w.id] ?? w.value })));
                if (cfg.intentWeights)
                    setIntentWeights(prev => prev.map(w => ({ ...w, value: cfg.intentWeights[w.id] ?? w.value })));
                if (cfg.tagWeights)
                    setTagWeights(prev => prev.map(w => ({ ...w, value: cfg.tagWeights[w.id] ?? w.value })));
                if (cfg.sourceWeights)
                    setSourceWeights(prev => prev.map(w => ({ ...w, value: cfg.sourceWeights[w.id] ?? w.value })));
                if (cfg.geoRegions)
                    setGeoRegions(prev => prev.map(r => cfg.geoRegions[r.id]
                        ? { ...r, grace: cfg.geoRegions[r.id].grace, penaltyPerKm: cfg.geoRegions[r.id].penaltyPerKm }
                        : r
                    ));
                if (cfg.missingGeoScore     !== undefined) setMissingGeoScore(cfg.missingGeoScore);
                if (cfg.missingSalaryScore  !== undefined) setMissingSalaryScore(cfg.missingSalaryScore);
                if (cfg.salaryDiffThreshold !== undefined) setSalaryDiffThreshold(cfg.salaryDiffThreshold);
                if (cfg.salaryPenalty       !== undefined) setSalaryPenalty(cfg.salaryPenalty);
                if (cfg.ageGapPenalty       !== undefined) setAgeGapPenalty(cfg.ageGapPenalty);
                if (cfg.missingAgeScore     !== undefined) setMissingAgeScore(Number(cfg.missingAgeScore));
                if (cfg.isExperienceEnabled !== undefined) setIsExperienceEnabled(cfg.isExperienceEnabled);
                setPenaltyPolicies(normalizePenaltyPoliciesFromCfg(cfg as Record<string, unknown>));
            } catch {
                // silent — fall back to defaults
            }

            // load presets from DB — auto-apply the first one
            try {
                const pr = await fetch(API_PRESETS, { headers: buildHeaders() });
                if (pr.ok) {
                    const presets: DbPreset[] = await pr.json();
                    setDbPresets(presets);
                    if (presets.length > 0) {
                        const first = presets[0];
                        setActivePresetId(first.id);
                        // Apply the preset's stored config immediately (overrides the global defaults)
                        const cfg = first.config as Record<string, unknown>;
                        const mw = cfg.mainWeights   as Record<string, number> | undefined;
                        const tw = cfg.tagWeights    as Record<string, number> | undefined;
                        const iw = cfg.intentWeights as Record<string, number> | undefined;
                        const sw = cfg.sourceWeights as Record<string, number> | undefined;
                        const gr = cfg.geoRegions    as Record<string, { grace: number; penaltyPerKm: number }> | undefined;
                        if (mw) setMainWeights(prev   => prev.map(w => ({ ...w, value: mw[w.id] ?? w.value })));
                        if (tw) setTagWeights(prev    => prev.map(w => ({ ...w, value: tw[w.id] ?? w.value })));
                        if (iw) setIntentWeights(prev => prev.map(w => ({ ...w, value: iw[w.id] ?? w.value })));
                        if (sw) setSourceWeights(prev => prev.map(w => ({ ...w, value: sw[w.id] ?? w.value })));
                        if (gr) setGeoRegions(prev    => prev.map(r => gr[r.id] ? { ...r, ...gr[r.id] } : r));
                        if (cfg.missingGeoScore     !== undefined) setMissingGeoScore(cfg.missingGeoScore as number);
                        if (cfg.missingSalaryScore  !== undefined) setMissingSalaryScore(cfg.missingSalaryScore as number);
                        if (cfg.salaryDiffThreshold !== undefined) setSalaryDiffThreshold(cfg.salaryDiffThreshold as number);
                        if (cfg.salaryPenalty       !== undefined) setSalaryPenalty(cfg.salaryPenalty as number);
                        if (cfg.ageGapPenalty       !== undefined) setAgeGapPenalty(cfg.ageGapPenalty as number);
                        if (cfg.missingAgeScore     !== undefined) setMissingAgeScore(Number(cfg.missingAgeScore));
                        if (cfg.isExperienceEnabled !== undefined) setIsExperienceEnabled(cfg.isExperienceEnabled as boolean);
                        setPenaltyPolicies(normalizePenaltyPoliciesFromCfg(cfg));
                    }
                }
            } catch { /* silent */ }

            // load clients for the multiselect
            try {
                const cl = await fetch(API_CLIENTS, { headers: buildHeaders() });
                if (cl.ok) {
                    const data = await cl.json();
                    const list = Array.isArray(data) ? data : (data.data ?? []);
                    setClients(list.map((c: Record<string, unknown>) => ({
                        id:          String(c.id ?? ''),
                        name:        String(c.name ?? ''),
                        displayName: c.displayName ? String(c.displayName) : undefined,
                    })));
                }
            } catch { /* silent */ }

            setIsLoading(false);
        })();
    }, []);

    const handleMainWeightChange = (id: string, newValue: number) => {
        setMainWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const handleTagWeightChange = (id: string, newValue: number) => {
        setTagWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const handleIntentWeightChange = (id: string, newValue: number) => {
        setIntentWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const handleSourceWeightChange = (id: string, newValue: number) => {
        setSourceWeights(prev => prev.map(w => w.id === id ? { ...w, value: newValue } : w));
    };

    const activeMainWeights = mainWeights.filter(w => isExperienceEnabled || w.id !== 'experience');
    const totalMainWeight = activeMainWeights.reduce((sum, w) => sum + w.value, 0);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError(null);
        try {
            const payload = buildPayload();

            // Always save global config
            const res = await fetch(API_CONFIG, {
                method: 'PUT',
                headers: buildHeaders(true),
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // If a preset is active, also update it with the same payload
            if (activePresetId) {
                const presetRes = await fetch(`${API_PRESETS}/${activePresetId}`, {
                    method: 'PUT',
                    headers: buildHeaders(true),
                    body: JSON.stringify({ config: payload }),
                });
                if (presetRes.ok) {
                    const updated: DbPreset = await presetRes.json();
                    setDbPresets(prev => prev.map(p => p.id === updated.id ? updated : p));
                }
            }

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setIsSaving(false);
        }
    };

    // ── DB-backed presets ─────────────────────────────────────────────────────
    const [dbPresets, setDbPresets] = useState<DbPreset[]>([]);
    const [activePresetId, setActivePresetId] = useState<number | null>(null);
    const [clients, setClients] = useState<ClientOption[]>([]);
    const [showNewPresetModal, setShowNewPresetModal] = useState(false);
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetDesc, setNewPresetDesc] = useState('');
    const [newPresetClientIds, setNewPresetClientIds] = useState<string[]>([]);

    // ── build payload for save ────────────────────────────────────────────────
    const buildPayload = useCallback(() => ({
        mainWeights:        mainWeights.reduce((acc, w)  => ({ ...acc, [w.id]: w.value }), {} as Record<string, number>),
        intentWeights:      intentWeights.reduce((acc, w) => ({ ...acc, [w.id]: w.value }), {} as Record<string, number>),
        tagWeights:         tagWeights.reduce((acc, w)   => ({ ...acc, [w.id]: w.value }), {} as Record<string, number>),
        sourceWeights:      sourceWeights.reduce((acc, w) => ({ ...acc, [w.id]: w.value }), {} as Record<string, number>),
        geoRegions:         geoRegions.reduce((acc, r)   => ({ ...acc, [r.id]: { grace: r.grace, penaltyPerKm: r.penaltyPerKm } }), {} as Record<string, { grace: number; penaltyPerKm: number }>),
        missingGeoScore,
        missingSalaryScore,
        salaryDiffThreshold,
        salaryPenalty,
        ageGapPenalty,
        missingAgeScore,
        isExperienceEnabled,
        penaltyPolicies,
    }), [mainWeights, intentWeights, tagWeights, sourceWeights, geoRegions, missingGeoScore, missingSalaryScore, salaryDiffThreshold, salaryPenalty, ageGapPenalty, missingAgeScore, isExperienceEnabled, penaltyPolicies]);

    const handleSaveAsNewPresetClick = () => {
        setNewPresetName('');
        setNewPresetDesc('');
        setNewPresetClientIds([]);
        setShowNewPresetModal(true);
    };

    const confirmSaveNewPreset = async () => {
        if (!newPresetName.trim() || isSavingPreset) return;
        setIsSavingPreset(true);
        try {
            const res = await fetch(API_PRESETS, {
                method: 'POST',
                headers: buildHeaders(true),
                body: JSON.stringify({
                    label:       newPresetName.trim(),
                    description: newPresetDesc.trim(),
                    clientIds:   newPresetClientIds,
                    config:      buildPayload(),
                }),
            });
            if (res.ok) {
                const created: DbPreset = await res.json();
                setDbPresets(prev => [...prev, created]);
                setShowNewPresetModal(false);
            }
        } catch { /* silent */ }
        finally { setIsSavingPreset(false); }
    };

    const deleteDbPreset = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('האם אתה בטוח שברצונך למחוק תבנית זו?')) return;
        setDbPresets(prev => prev.filter(p => p.id !== id));
        if (activePresetId === id) setActivePresetId(null);
        await fetch(`${API_PRESETS}/${id}`, { method: 'DELETE', headers: buildHeaders() }).catch(() => {});
    };

    const updateActivePreset = async () => {
        if (!activePresetId) return;
        const payload = buildPayload();
        try {
            const res = await fetch(`${API_PRESETS}/${activePresetId}`, {
                method: 'PUT',
                headers: { ...buildHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: payload }),
            });
            if (!res.ok) throw new Error('Failed');
            const updated: DbPreset = await res.json();
            setDbPresets(prev => prev.map(p => p.id === updated.id ? updated : p));
        } catch {
            alert('שגיאה בעדכון התבנית');
        }
    };

    const applyDbPreset = useCallback((cfg: Record<string, unknown>) => {
        const mw = cfg.mainWeights   as Record<string, number> | undefined;
        const tw = cfg.tagWeights    as Record<string, number> | undefined;
        const iw = cfg.intentWeights as Record<string, number> | undefined;
        const sw = cfg.sourceWeights as Record<string, number> | undefined;
        const gr = cfg.geoRegions    as Record<string, { grace: number; penaltyPerKm: number }> | undefined;

        // Use explicit `w.id in obj` check so a value of 0 is applied correctly
        if (mw) setMainWeights(prev   => prev.map(w => ({ ...w, value: w.id in mw ? Number(mw[w.id]) : w.value })));
        if (tw) setTagWeights(prev    => prev.map(w => ({ ...w, value: w.id in tw ? Number(tw[w.id]) : w.value })));
        if (iw) setIntentWeights(prev => prev.map(w => ({ ...w, value: w.id in iw ? Number(iw[w.id]) : w.value })));
        if (sw) setSourceWeights(prev => prev.map(w => ({ ...w, value: w.id in sw ? Number(sw[w.id]) : w.value })));
        if (gr) setGeoRegions(prev    => prev.map(r => r.id in gr ? { ...r, grace: Number(gr[r.id].grace), penaltyPerKm: Number(gr[r.id].penaltyPerKm) } : r));
        if (cfg.missingGeoScore     !== undefined) setMissingGeoScore(Number(cfg.missingGeoScore));
        if (cfg.missingSalaryScore  !== undefined) setMissingSalaryScore(Number(cfg.missingSalaryScore));
        if (cfg.salaryDiffThreshold !== undefined) setSalaryDiffThreshold(Number(cfg.salaryDiffThreshold));
        if (cfg.salaryPenalty       !== undefined) setSalaryPenalty(Number(cfg.salaryPenalty));
        if (cfg.ageGapPenalty       !== undefined) setAgeGapPenalty(Number(cfg.ageGapPenalty));
        if (cfg.missingAgeScore     !== undefined) setMissingAgeScore(Number(cfg.missingAgeScore));
        if (cfg.isExperienceEnabled !== undefined) setIsExperienceEnabled(Boolean(cfg.isExperienceEnabled));
        setPenaltyPolicies(normalizePenaltyPoliciesFromCfg(cfg));
    }, []);

    const toggleClientId = (id: string) =>
        setNewPresetClientIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-text-muted">
                <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" />
                <span>Loading configuration...</span>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20 relative">
            {showNewPresetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">שמור כגישה חדשה</h3>
                            <button onClick={() => setShowNewPresetModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <XCircleIcon className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">שם הגישה</label>
                                <input 
                                    type="text" 
                                    value={newPresetName}
                                    onChange={e => setNewPresetName(e.target.value)}
                                    placeholder="למשל: התאמה לחברת סטארטאפ"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">תיאור (אופציונלי)</label>
                                <textarea 
                                    value={newPresetDesc}
                                    onChange={e => setNewPresetDesc(e.target.value)}
                                    placeholder="פרט למי/מתי הגישה הזו מתאימה..."
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all resize-none h-24"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    זמין ללקוחות (אופציונלי)
                                    {newPresetClientIds.length > 0 && (
                                        <span className="ml-2 text-xs font-medium bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                                            {newPresetClientIds.length} נבחרו
                                        </span>
                                    )}
                                </label>
                                {clients.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">טוען לקוחות...</p>
                                ) : (
                                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                        {clients.map(c => (
                                            <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newPresetClientIds.includes(c.id)}
                                                    onChange={() => toggleClientId(c.id)}
                                                    className="rounded border-slate-300 text-primary-500 focus:ring-primary-500 w-4 h-4 shrink-0"
                                                />
                                                <span className="text-sm text-slate-700 truncate">
                                                    {c.displayName || c.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-slate-500 mt-1">
                                    אם יושאר ריק, הגישה תהיה זמינה לכל הלקוחות.
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button 
                                onClick={() => setShowNewPresetModal(false)}
                                className="px-5 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-lg transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                onClick={confirmSaveNewPreset}
                                disabled={!newPresetName.trim() || isSavingPreset}
                                className="px-5 py-2 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 shadow-md shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSavingPreset && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                                שמירת גישה
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-text-default">הגדרות מנוע התאמה (Matching Engine)</h2>
                    <p className="text-sm text-text-muted">ניהול משקלים ואלגוריתם השקלול לחישוב אחוז התאמה</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={isSaving || totalMainWeight !== 100}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
                        totalMainWeight === 100 
                            ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-500/20' 
                            : 'bg-bg-subtle text-text-muted cursor-not-allowed'
                    }`}
                >
                    {isSaving ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                    שמור שינויים
                </button>
            </div>

            {showSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>ההגדרות נשמרו בהצלחה ועודכנו במנוע החישוב.</span>
                </div>
            )}
            {saveError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                    <XCircleIcon className="w-5 h-5" />
                    <span>שמירה נכשלה: {saveError}</span>
                </div>
            )}

            {/* Presets */}
            <div className="bg-white p-6 rounded-2xl border border-border-subtle shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-primary-500" />
                        <h3 className="text-lg font-bold text-text-default">תבניות שקלול (גישות)</h3>
                    </div>
                    <button 
                        onClick={handleSaveAsNewPresetClick} 
                        className="text-sm font-bold text-primary-700 bg-primary-100/50 hover:bg-primary-100 px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        <PlusIcon className="w-4 h-4" />
                        שמור גישה נוכחית כחדשה
                    </button>
                </div>
                {dbPresets.length === 0 && (
                    <p className="text-sm text-text-muted italic py-2">אין גישות שמורות עדיין. שמור את ההגדרות הנוכחיות כגישה חדשה.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {dbPresets.map(preset => {
                        const isActive = activePresetId === preset.id;
                        return (
                        <button
                            key={preset.id}
                            onClick={() => { applyDbPreset(preset.config); setActivePresetId(preset.id); }}
                            className={`p-4 rounded-xl border transition-all text-right group relative flex flex-col items-start h-full
                                ${isActive
                                    ? 'border-purple-500 ring-2 ring-purple-500 bg-purple-50 shadow-md shadow-purple-200'
                                    : 'border-purple-200 bg-purple-50/30 hover:bg-purple-50 hover:border-purple-500 hover:ring-1 hover:ring-purple-500'
                                }`}
                        >
                            {isActive && (
                                <span className="absolute top-2.5 right-2.5 bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    פעיל
                                </span>
                            )}
                            <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div
                                    onClick={(e) => deleteDbPreset(preset.id, e)}
                                    className="p-1.5 bg-white/80 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded border border-transparent hover:border-red-200 transition-colors"
                                    title="מחק גישה"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mb-2 pr-8 w-full">
                                <div className={`p-2 bg-white rounded-lg shadow-sm transition-colors shrink-0 ${isActive ? 'text-purple-600' : 'group-hover:text-purple-600 text-purple-400'}`}>
                                    <TagIcon className="w-5 h-5" />
                                </div>
                                <h3 className="font-bold text-text-default truncate">{preset.label}</h3>
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed mb-1 line-clamp-2">{preset.description || 'גישה מותאמת אישית'}</p>
                            {/* Mini weight preview */}
                            {(() => {
                                const mw = preset.config?.mainWeights as Record<string, number> | undefined;
                                if (!mw) return null;
                                const keys = [
                                    { id: 'vector', color: 'bg-purple-400', label: 'V' },
                                    { id: 'tags',   color: 'bg-blue-400',   label: 'T' },
                                    { id: 'geo',    color: 'bg-emerald-400', label: 'G' },
                                    { id: 'experience', color: 'bg-orange-400', label: 'E' },
                                    { id: 'intent', color: 'bg-rose-400',   label: 'I' },
                                ];
                                const total = keys.reduce((s, k) => s + (mw[k.id] ?? 0), 0) || 1;
                                return (
                                    <div className="w-full mt-1 mb-2">
                                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 w-full gap-px">
                                            {keys.map(k => {
                                                const pct = ((mw[k.id] ?? 0) / total) * 100;
                                                if (pct === 0) return null;
                                                return <div key={k.id} className={`${k.color} h-full`} style={{ width: `${pct}%` }} title={`${k.label}: ${mw[k.id]}%`} />;
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                            {preset.clientIds && preset.clientIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-auto">
                                    {preset.clientIds.map(cid => {
                                        const client = clients.find(c => c.id === cid);
                                        return (
                                            <span key={cid} className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                                                {client ? (client.displayName || client.name) : cid}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </button>
                    );})}
                </div>
            </div>

            {totalMainWeight !== 100 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl flex items-center gap-3">
                    <InformationCircleIcon className="w-5 h-5" />
                    <span>שים לב: סכום המשקלים הראשיים חייב להיות בדיוק 100% (כרגע: {totalMainWeight}%).</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Weights Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-text-default flex items-center gap-2">
                                <ArrowPathIcon className="w-5 h-5 text-primary-500" />
                                שקלול שכבות הליבה
                            </h3>
                            <label className="flex items-center gap-2 cursor-pointer bg-bg-subtle px-3 py-1.5 rounded-lg border border-border-default hover:bg-bg-input transition-colors">
                                <span className="text-sm font-bold text-text-default">הפעל שכבת ניסיון</span>
                                <input 
                                    type="checkbox" 
                                    checked={isExperienceEnabled}
                                    onChange={(e) => setIsExperienceEnabled(e.target.checked)}
                                    className="rounded border-border-default text-primary-500 focus:ring-primary-500 w-4 h-4"
                                />
                            </label>
                        </div>
                        
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 leading-relaxed">
                            <p className="font-bold mb-1">מה ההבדל בין שכבת הניסיון (Experience) לבין תגיות (Tags)?</p>
                            <p className="mb-2"><strong>תגיות</strong> בודקות האם קיימות מילות מפתח ספציפיות (למשל: "Fintech", "React", "ניהול צוות").</p>
                            <p><strong>שכבת הניסיון</strong> מעריכה את <em>האיכות והרלוונטיות</em> של החברות בהן המועמד עבד (למשל: עבודה בחברות Tier-1 בתעשייה, משך הזמן בכל תפקיד, ורצף תעסוקתי). אם אינך זקוק לשקלול מורכב של איכות המעסיקים, תוכל לכבות שכבה זו ולהסתמך על תגיות בלבד.</p>
                        </div>
                        
                        <div className="space-y-8">
                            {activeMainWeights.map(weight => (
                                <div key={weight.id} className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-bg-subtle rounded-lg">
                                                {weight.icon}
                                            </div>
                                            <div>
                                                <div className="font-bold text-text-default">{weight.label}</div>
                                                <div className="text-xs text-text-muted">{weight.description}</div>
                                            </div>
                                        </div>
                                        <div className="text-lg font-black text-primary-600">{weight.value}%</div>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleMainWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-600"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-6 border-t border-border-subtle flex items-center justify-between">
                            <span className="text-sm font-bold text-text-muted">סה"כ משקל מצטבר:</span>
                            <span className={`text-xl font-black ${totalMainWeight === 100 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {totalMainWeight}%
                            </span>
                        </div>
                    </div>

                    <div className="bg-bg-subtle rounded-2xl p-6 border border-dashed border-border-default">
                        <h4 className="font-bold text-text-default mb-2 flex items-center gap-2">
                            <InformationCircleIcon className="w-4 h-4" />
                            איך זה עובד?
                        </h4>
                        <p className="text-sm text-text-muted leading-relaxed">
                            האלגוריתם מחשב ציון התאמה סופי על ידי שקלול ארבע השכבות לעיל. 
                            שינוי המשקלים משפיע באופן מיידי על דירוג המועמדים בכל המשרות במערכת. 
                            מומלץ לבצע שינויים קטנים ולבדוק את התוצאות בסימולטור לפני שמירה סופית.
                        </p>
                    </div>
                </div>

                {/* Internal Tag Weights Section */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <TagIcon className="w-5 h-5 text-primary-500" />
                            שקלול פנימי של תגיות
                        </h3>
                        
                        <div className="space-y-5">
                            {tagWeights.map(weight => (
                                <div key={weight.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-text-default font-medium">
                                            {weight.icon}
                                            {weight.label}
                                        </div>
                                        <span className="font-bold text-primary-600">{weight.value}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleTagWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                    />
                                </div>
                            ))}

                            {/* Tags Relative Weight Indicator */}
                            <div className="pt-6 border-t border-border-subtle mt-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-[10px] font-bold text-text-muted uppercase">חלוקת משקל יחסית בין הקטגוריות:</div>
                                    <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                                        סה"כ שקלול: 100%
                                    </div>
                                </div>
                                <div className="flex h-3 rounded-full overflow-hidden bg-bg-subtle shadow-inner">
                                    {tagWeights.map((w, idx) => {
                                        const total = tagWeights.reduce((acc, curr) => acc + curr.value, 0);
                                        const percentage = total > 0 ? (w.value / total) * 100 : 0;
                                        const colors = [
                                            'bg-primary-500', 'bg-blue-500', 'bg-emerald-500', 
                                            'bg-purple-500', 'bg-orange-500', 'bg-rose-500',
                                            'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500'
                                        ];
                                        if (percentage === 0) return null;
                                        return (
                                            <div 
                                                key={w.id} 
                                                className={`${colors[idx % colors.length]} h-full transition-all duration-500 border-r border-white/20 last:border-0`}
                                                style={{ width: `${percentage}%` }}
                                                title={`${w.label}: ${Math.round(percentage)}%`}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-3 gap-y-2 gap-x-4 mt-4">
                                    {tagWeights.filter(w => w.value > 0).map((w, idx) => {
                                        const total = tagWeights.reduce((acc, curr) => acc + curr.value, 0);
                                        const percentage = total > 0 ? (w.value / total) * 100 : 0;
                                        const colors = [
                                            'bg-primary-500', 'bg-blue-500', 'bg-emerald-500', 
                                            'bg-purple-500', 'bg-orange-500', 'bg-rose-500',
                                            'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500'
                                        ];
                                        return (
                                            <div key={w.id} className="text-[9px] text-text-muted flex items-center gap-1.5 truncate">
                                                <div className={`w-2 h-2 rounded-sm ${colors[idx % colors.length]}`} />
                                                <span className="font-bold text-text-default">{Math.round(percentage)}%</span>
                                                <span className="truncate">{w.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 p-3 bg-primary-50 rounded-xl text-[11px] text-primary-700 leading-tight">
                            הערכים כאן מייצגים את ה"חשיבות היחסית" של כל קטגוריה בתוך שכבת התגיות. 
                            ערך גבוה יותר (למשל 100 בתפקיד) יגרום להתאמה בקטגוריה זו להשפיע יותר על הציון של שכבת התגיות.
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                            <UserGroupIcon className="w-5 h-5 text-rose-500" />
                            שקלול פנימי של זיקה למשרה
                        </h3>
                        
                        <div className="space-y-5">
                            {intentWeights.map(weight => (
                                <div key={weight.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-text-default font-medium">
                                            {weight.icon}
                                            {weight.label}
                                        </div>
                                        <span className="font-bold text-rose-600">{weight.value}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleIntentWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-rose-500"
                                    />
                                    <div className="text-[10px] text-text-muted mt-1 leading-tight">{weight.description}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* General penalty policies */}
            <div className="mt-8 bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-2 flex items-center gap-2">
                    <ScaleIcon className="w-5 h-5 text-rose-500" />
                    מדיניות קנסות כלליים (Penalty_general)
                </h3>
                <p className="text-xs text-text-muted mb-6">
                    לכל ממד: קנס על חוסר התאמה (Mismatch) וקנס על מידע חסר בפרופיל כשהמשרה מחייבת את השדה.
                    קנס נגבה רק אם המשרה דורשת את הממד (למשל ניידות רק כש־mobility=true במשרה) — שינוי ממד שלא רלוונטי למועמד/משרה בסימולציה לא ישפיע.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {PENALTY_DIMENSION_META.map((dim) => {
                        const row = penaltyPolicies[dim.id] || DEFAULT_PENALTY_POLICIES[dim.id];
                        return (
                            <div key={dim.id} className="p-4 rounded-xl border border-border-default bg-bg-subtle/40 space-y-4">
                                <div className="font-bold text-text-default text-sm">{dim.label}</div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-rose-600 font-semibold">חוסר התאמה</span>
                                        <span className="font-black text-rose-600">-{row.mismatch}</span>
                                    </div>
                                    <input
                                        type="range" min={0} max={50} value={row.mismatch}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            setPenaltyPolicies((prev) => ({
                                                ...prev,
                                                [dim.id]: { ...(prev[dim.id] || row), mismatch: v },
                                            }));
                                        }}
                                        className="w-full h-1.5 accent-rose-500"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-amber-600 font-semibold">מידע חסר</span>
                                        <span className="font-black text-amber-600">-{row.missing}</span>
                                    </div>
                                    <input
                                        type="range" min={0} max={50} value={row.missing}
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            setPenaltyPolicies((prev) => ({
                                                ...prev,
                                                [dim.id]: { ...(prev[dim.id] || row), missing: v },
                                            }));
                                        }}
                                        className="w-full h-1.5 accent-amber-500"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Additional Settings & Penalties */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8 items-stretch">
                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm min-w-0">
                        <h3 className="text-base font-bold text-text-default mb-6 flex items-center gap-2 leading-snug">
                            <UserGroupIcon className="w-5 h-5 shrink-0 text-primary-500" />
                            שקלול מקור התגית
                        </h3>
                        
                        <div className="space-y-5">
                            {sourceWeights.map(weight => (
                                <div key={weight.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2 text-text-default font-medium">
                                            {weight.icon}
                                            {weight.label}
                                        </div>
                                        <span className="font-bold text-primary-600">{weight.value}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        value={weight.value}
                                        onChange={(e) => handleSourceWeightChange(weight.id, parseInt(e.target.value))}
                                        className="w-full h-1.5 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                    />
                                    <div className="text-[10px] text-text-muted">{weight.description}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm min-w-0">
                        <h3 className="text-base font-bold text-text-default mb-6 flex items-center gap-2 leading-snug">
                            <UserGroupIcon className="w-5 h-5 shrink-0 text-primary-500" />
                            קנס על חריגה מטווח הגילאים
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">נקודות קנס לכל שנת חריגה</div>
                                    <span className="text-2xl font-black text-orange-600">-{ageGapPenalty}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="10" 
                                    value={ageGapPenalty}
                                    onChange={(e) => setAgeGapPenalty(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>5 נק'</span>
                                    <span>10 נק'</span>
                                </div>
                            </div>

                            <div className="text-xs text-text-muted leading-relaxed">
                                <p className="font-bold text-text-default mb-1">איך זה עובד?</p>
                                כאשר גיל המועמד חורג מטווח הגילאים שהוגדר למשרה (כלפי מעלה או מטה), יופחתו {ageGapPenalty} נקודות מהציון הסופי על כל שנת חריגה.
                                <br />
                                <span className="text-primary-600 font-medium italic">הערה: הוצאת הגיל משכבת הניסיון והפיכתו לקנס מאפשרת שליטה מדויקת יותר ומונעת פגיעה במועמדים שמתאימים מקצועית אך חורגים מעט דמוגרפית.</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm min-w-0">
                        <h3 className="text-base font-bold text-text-default mb-6 flex items-center gap-2 leading-snug">
                            <InformationCircleIcon className="w-5 h-5 shrink-0 text-primary-500" />
                            מדיניות מידע חסר
                        </h3>

                        <div className="space-y-4 max-h-[min(500px,70vh)] overflow-y-auto pr-2 custom-scrollbar">
                            <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">ציון ברירת מחדל ללא כתובת</div>
                                    <span className="text-2xl font-black text-primary-600">{missingGeoScore}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    value={missingGeoScore}
                                    onChange={(e) => setMissingGeoScore(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>קנס מלא (0)</span>
                                    <span>נייטרלי (50)</span>
                                    <span>בונוס (100)</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border bg-rose-50 border-rose-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">קנס ברירת מחדל ללא גיל</div>
                                    <span className="text-2xl font-black text-rose-600">-{missingAgeScore}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={50}
                                    value={missingAgeScore}
                                    onChange={(e) => setMissingAgeScore(parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק&apos;</span>
                                    <span>25 נק&apos;</span>
                                    <span>50 נק&apos;</span>
                                </div>
                            </div>

                            

                            <div className="text-xs text-text-muted leading-relaxed mt-4">
                                <p className="font-bold text-text-default mb-1">איך זה עובד?</p>
                                כתובת וגיל מטופלים כאן כשכבות ציון / קנס ייעודיים. ניידות, היקף משרה, רישיון, שעות וזמינות — ב
                                <span className="font-medium text-text-default"> מדיניות קנסות כלליים </span>
                                (מידע חסר / חוסר התאמה).
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm min-w-0">
                        <h3 className="text-base font-bold text-text-default mb-6 flex items-center gap-2 leading-snug">
                            <ScaleIcon className="w-5 h-5 shrink-0 text-primary-500" />
                            קנס על פער בציפיות שכר
                        </h3>
                        
                        <div className="space-y-6">
                            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">קנס ברירת מחדל ללא ציפיות שכר</div>
                                    <span className="text-2xl font-black text-purple-600">-{missingSalaryScore}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    value={missingSalaryScore}
                                    onChange={(e) => setMissingSalaryScore(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>25 נק'</span>
                                    <span>50 נק'</span>
                                </div>
                            </div>

                            <div className="p-4 bg-primary-50 rounded-xl border border-primary-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">סף פער באחוזים (ממנו מתחיל הקנס)</div>
                                    <span className="text-2xl font-black text-primary-600">{salaryDiffThreshold}%</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="50" 
                                    step="5"
                                    value={salaryDiffThreshold}
                                    onChange={(e) => setSalaryDiffThreshold(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-primary-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0%</span>
                                    <span>25%</span>
                                    <span>50%</span>
                                </div>
                            </div>

                            <div className="p-4 bg-rose-50 rounded-xl border border-rose-100">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="font-bold text-text-default">נקודות קנס לכל {salaryDiffThreshold}% פער</div>
                                    <span className="text-2xl font-black text-rose-600">-{salaryPenalty}</span>
                                </div>
                                
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="20" 
                                    value={salaryPenalty}
                                    onChange={(e) => setSalaryPenalty(parseInt(e.target.value))}
                                    className="w-full h-2 bg-bg-subtle rounded-lg appearance-none cursor-pointer accent-rose-500"
                                />
                                
                                <div className="flex justify-between text-[10px] text-text-muted mt-2 font-bold uppercase tracking-wider">
                                    <span>0 נק'</span>
                                    <span>10 נק'</span>
                                    <span>20 נק'</span>
                                </div>
                            </div>

                            <div className="text-xs text-text-muted leading-relaxed">
                                <p className="font-bold text-text-default mb-1">איך זה עובד? (שכר בלבד — לא שעות עבודה)</p>
                                משווה <span className="font-medium text-text-default">ציפיות שכר מינימום של המועמד</span> מול{' '}
                                <span className="font-medium text-text-default">שכר מקסימום במשרה</span> (`salaryMin` / `salaryMax`).
                                <br />
                                אין ציפיות שכר → קנס קבוע של {missingSalaryScore} נק&apos;.
                                <br />
                                ציפיות גבוהות מהמשרה → פער באחוזים; מעל סף {salaryDiffThreshold}% →{' '}
                                {salaryPenalty} נק&apos; לכל מדרגה של {salaryDiffThreshold}% (במנוע: `matchingScoreService`).
                                <br />
                                שעות עבודה (`preferredWorkingHours`) מוגדרות ב־<span className="font-medium text-text-default">מדיניות קנסות כלליים</span>.
                            </div>
                        </div>
                    </div>

            </div>

            {/* Geo Regional Logic Section */}
            <div className="mt-8">
                <div className="bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                        <GlobeAmericasIcon className="w-5 h-5 text-primary-500" />
                            רגישות מרחק לפי אזורים (ק"מ)
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            {geoRegions.map(region => (
                                <div key={region.id} className="p-5 bg-bg-subtle rounded-2xl border border-border-subtle space-y-4">
                                    <div className="font-bold text-text-default border-b border-border-subtle pb-2">{region.label}</div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-emerald-600 font-bold uppercase">מרחק לציון מלא (ק"מ)</div>
                                            <input 
                                                type="number" 
                                                value={region.grace}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setGeoRegions(prev => prev.map(r => r.id === region.id ? { ...r, grace: val || 0 } : r));
                                                }}
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-sm font-bold"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[10px] text-red-600 font-bold uppercase">קנס לכל ק"מ חריגה (%)</div>
                                            <input 
                                                type="number" 
                                                step="0.5"
                                                value={region.penaltyPerKm}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setGeoRegions(prev => prev.map(r => r.id === region.id ? { ...r, penaltyPerKm: val || 0 } : r));
                                                }}
                                                className="w-full bg-white border border-border-default rounded-lg px-2 py-1.5 text-sm font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-text-muted italic">
                                        * עד {region.grace} ק"מ הציון הוא 100%. לאחר מכן יורד ב-{region.penaltyPerKm}% לכל ק"מ.
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            {/* Simulator Section */}
            <div className="mt-8 bg-white rounded-2xl border border-border-default overflow-hidden shadow-sm">
                <div className="p-6 border-b border-border-subtle bg-bg-subtle flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary-100 rounded-lg">
                            <ArrowPathIcon className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-text-default">סימולטור התאמה (Live Test)</h3>
                            <p className="text-sm text-text-muted">בדוק איך המשקלים שהגדרת משפיעים על התאמה אמיתית</p>
                        </div>
                    </div>
                    <button 
                        onClick={runSimulation}
                        disabled={isSimulating}
                        className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all ${isSimulating ? 'bg-bg-subtle text-text-muted cursor-not-allowed' : 'bg-primary-600 text-white hover:bg-primary-700 shadow-lg shadow-primary-200'}`}
                    >
                        {isSimulating ? (
                            <>
                                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                מחשב...
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="w-5 h-5" />
                                הרץ סימולציה
                            </>
                        )}
                    </button>
                </div>

                <div className="p-6 lg:p-8 grid grid-cols-1 xl:grid-cols-2 gap-8 lg:gap-12 bg-bg-subtle/10">
                    {/* Simulator Inputs — real data */}
                    <div className="space-y-6">
                        {simError && (
                            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium flex items-center gap-2">
                                <XCircleIcon className="w-5 h-5 shrink-0" />
                                {simError}
                            </div>
                        )}

                        {/* Candidate picker */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm">
                            <div className="bg-bg-subtle rounded-t-2xl px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <UserGroupIcon className="w-5 h-5 text-primary-500" />
                                בחר מועמד
                                {isFetchingCandidates && <ArrowPathIcon className="w-4 h-4 animate-spin text-text-muted mr-auto" />}
                                {!isFetchingCandidates && candidateFilter.trim().length >= SIM_PICKER_SEARCH_MIN && (
                                    <span className="mr-auto text-xs font-normal text-text-muted">
                                        {candidateOptions.length} תוצאות
                                    </span>
                                )}
                            </div>
                            <div className="p-4 space-y-2">
                                <input
                                    type="text"
                                    placeholder="הקלד שם, אימייל או טלפון (לפחות 2 תווים)..."
                                    value={candidateFilter}
                                    onChange={e => setCandidateFilter(e.target.value)}
                                    className="w-full border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                {candidateFilter.trim().length > 0 && candidateFilter.trim().length < SIM_PICKER_SEARCH_MIN && (
                                    <p className="text-xs text-text-muted">הקלד לפחות {SIM_PICKER_SEARCH_MIN} תווים לחיפוש</p>
                                )}
                                <select
                                    size={6}
                                    value={simCandidateId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setSimCandidateId(id);
                                        const picked = candidateOptions.find(c => c.id === id);
                                        if (picked) setSelectedCandidate(picked);
                                        setSimResult(null);
                                    }}
                                    className="w-full border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                >
                                    <option value="">
                                        {candidateFilter.trim().length < SIM_PICKER_SEARCH_MIN
                                            ? '— הקלד לחיפוש מועמד —'
                                            : isFetchingCandidates
                                              ? 'מחפש…'
                                              : candidateOptions.length
                                                ? '— בחר מועמד —'
                                                : 'אין תוצאות'}
                                    </option>
                                    {candidateOptions.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                {simCandidateId && (
                                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                                        <CheckCircleIcon className="w-4 h-4 shrink-0" />
                                        <span className="font-bold truncate">
                                            {selectedCandidate?.name || simCandidateId}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Job picker */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm">
                            <div className="bg-bg-subtle rounded-t-2xl px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <BriefcaseIcon className="w-5 h-5 text-orange-500" />
                                בחר משרה
                                {isFetchingJobs && <ArrowPathIcon className="w-4 h-4 animate-spin text-text-muted mr-auto" />}
                                {!isFetchingJobs && jobFilter.trim().length >= SIM_PICKER_SEARCH_MIN && (
                                    <span className="mr-auto text-xs font-normal text-text-muted">
                                        {jobOptions.length} תוצאות
                                    </span>
                                )}
                            </div>
                            <div className="p-4 space-y-2">
                                <input
                                    type="text"
                                    placeholder="הקלד כותרת משרה, לקוח או קוד (לפחות 2 תווים)..."
                                    value={jobFilter}
                                    onChange={e => setJobFilter(e.target.value)}
                                    className="w-full border border-border-default rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                {jobFilter.trim().length > 0 && jobFilter.trim().length < SIM_PICKER_SEARCH_MIN && (
                                    <p className="text-xs text-text-muted">הקלד לפחות {SIM_PICKER_SEARCH_MIN} תווים לחיפוש</p>
                                )}
                                <select
                                    size={6}
                                    value={simJobId}
                                    onChange={e => {
                                        const id = e.target.value;
                                        setSimJobId(id);
                                        const picked = jobOptions.find(j => j.id === id);
                                        if (picked) setSelectedJob(picked);
                                        setSimResult(null);
                                    }}
                                    className="w-full border border-border-default rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
                                >
                                    <option value="">
                                        {jobFilter.trim().length < SIM_PICKER_SEARCH_MIN
                                            ? '— הקלד לחיפוש משרה —'
                                            : isFetchingJobs
                                              ? 'מחפש…'
                                              : jobOptions.length
                                                ? '— בחר משרה —'
                                                : 'אין תוצאות'}
                                    </option>
                                    {jobOptions.map(j => (
                                        <option key={j.id} value={j.id}>{j.title}</option>
                                    ))}
                                </select>
                                {simJobId && (
                                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                                        <CheckCircleIcon className="w-4 h-4 shrink-0" />
                                        <span className="font-bold truncate">
                                            {selectedJob?.title || simJobId}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Active preset indicator */}
                        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                            <SparklesIcon className="w-4 h-4 shrink-0" />
                            הסימולציה משתמשת ב<strong className="mx-1">המשקלים והקנסות מהמסך הנוכחי</strong> (גם לפני שמירה).
                            {activePresetId && (
                                <span className="text-purple-700"> · גישה: {dbPresets.find(p => p.id === activePresetId)?.label}</span>
                            )}
                        </div>

                        {/* Penalty test overrides */}
                        <div className="bg-white rounded-2xl border border-border-default shadow-sm">
                            <div className="bg-bg-subtle rounded-t-2xl px-5 py-3.5 border-b border-border-default flex items-center gap-2.5 font-bold text-text-default">
                                <ScaleIcon className="w-5 h-5 text-rose-500" />
                                שדות לבדיקת קנסות (אופציונלי)
                            </div>
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">מין מועמד</span>
                                    <select value={simOverrides.candidateGender} onChange={(e) => setSimOverrides((p) => ({ ...p, candidateGender: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5">
                                        <option value="">— מהמערכת —</option>
                                        <option value="זכר">זכר</option>
                                        <option value="נקבה">נקבה</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">מין נדרש במשרה</span>
                                    <select value={simOverrides.jobGender} onChange={(e) => setSimOverrides((p) => ({ ...p, jobGender: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5">
                                        <option value="">— מהמערכת —</option>
                                        <option value="זכר">זכר</option>
                                        <option value="נקבה">נקבה</option>
                                        <option value="לא משנה">לא משנה</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">ניידות מועמד</span>
                                    <input value={simOverrides.candidateMobility} onChange={(e) => setSimOverrides((p) => ({ ...p, candidateMobility: e.target.value }))} placeholder="לדוגמה: רכב פרטי" className="w-full border rounded-lg px-2 py-1.5" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">ניידות נדרשת</span>
                                    <select value={simOverrides.jobMobility} onChange={(e) => setSimOverrides((p) => ({ ...p, jobMobility: e.target.value as '' | 'true' | 'false' }))} className="w-full border rounded-lg px-2 py-1.5">
                                        <option value="">— מהמערכת —</option>
                                        <option value="true">כן</option>
                                        <option value="false">לא</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">רישיון מועמד</span>
                                    <input value={simOverrides.candidateLicense} onChange={(e) => setSimOverrides((p) => ({ ...p, candidateLicense: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">רישיון נדרש</span>
                                    <input value={simOverrides.jobLicense} onChange={(e) => setSimOverrides((p) => ({ ...p, jobLicense: e.target.value }))} placeholder="B" className="w-full border rounded-lg px-2 py-1.5" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">היקף מועמד</span>
                                    <input value={simOverrides.candidateScope} onChange={(e) => setSimOverrides((p) => ({ ...p, candidateScope: e.target.value }))} placeholder="מלאה / חלקית" className="w-full border rounded-lg px-2 py-1.5" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-semibold text-text-muted">סוג משרה</span>
                                    <select value={simOverrides.jobJobType} onChange={(e) => setSimOverrides((p) => ({ ...p, jobJobType: e.target.value as typeof p.jobJobType }))} className="w-full border rounded-lg px-2 py-1.5">
                                        <option value="">— מהמערכת —</option>
                                        <option value="מלאה">מלאה</option>
                                        <option value="חלקית">חלקית</option>
                                        <option value="משמרות">משמרות</option>
                                    </select>
                                </label>
                                <label className="space-y-1 sm:col-span-2">
                                    <span className="text-xs font-semibold text-text-muted">זמינות מועמד</span>
                                    <input value={simOverrides.candidateAvailability} onChange={(e) => setSimOverrides((p) => ({ ...p, candidateAvailability: e.target.value }))} className="w-full border rounded-lg px-2 py-1.5" />
                                </label>
                            </div>
                        </div>
                    </div>{/* end left panel */}


                    {/* Results Display */}
                    <div className="relative h-full min-h-[400px]">
                        {!simResult && !isSimulating && (
                            <div className="sticky top-6 flex flex-col items-center justify-center text-center p-10 bg-white rounded-3xl border-2 border-dashed border-border-default shadow-sm h-full max-h-[600px]">
                                <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-6">
                                    <ArrowPathIcon className="w-10 h-10 text-primary-500 opacity-50" />
                                </div>
                                <h4 className="text-xl font-bold text-text-default mb-2">מוכן לסימולציה</h4>
                                <p className="text-text-muted font-medium max-w-xs mx-auto">הזן את נתוני המועמד ולחץ על "הרץ סימולציה" כדי לראות את התוצאות בזמן אמת</p>
                            </div>
                        )}

                        {isSimulating && (
                            <div className="sticky top-6 flex flex-col items-center justify-center text-center p-10 bg-white/90 backdrop-blur-md rounded-3xl border border-primary-100 shadow-xl z-10 h-full max-h-[600px]">
                                <ArrowPathIcon className="w-16 h-16 text-primary-500 animate-spin mb-6" />
                                <div className="text-xl text-primary-700 font-bold">מנתח התאמה רב-שכבתית...</div>
                                <p className="text-primary-500/70 mt-2 text-sm">מחשב וקטורים, תגיות, מרחק ופער שכר</p>
                            </div>
                        )}

                        {simResult && (
                            <div className="sticky top-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 bg-white p-8 rounded-3xl border border-border-default shadow-xl">
                                <div className="flex flex-col items-center justify-center pb-8 border-b border-border-subtle">
                                    {(simResult.candidateName || simResult.jobTitle) && (
                                        <div className="text-center mb-3 space-y-0.5">
                                            {simResult.candidateName && <div className="text-sm font-bold text-text-default">{simResult.candidateName}</div>}
                                            {simResult.jobTitle && <div className="text-xs text-text-muted">{simResult.jobTitle}</div>}
                                        </div>
                                    )}
                                    <div className="text-sm font-bold text-text-muted uppercase tracking-widest mb-3">ציון התאמה סופי</div>
                                    <div className={`text-7xl font-black tracking-tighter ${simResult.score > 80 ? 'text-emerald-600' : simResult.score > 60 ? 'text-blue-600' : 'text-orange-600'}`}>
                                        {simResult.score}<span className="text-4xl opacity-50">%</span>
                                    </div>
                                </div>

                                <div className="space-y-5 pt-2">
                                    {/* Vector */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-purple-500"/> שכבה סמנטית</span>
                                            <span className="text-text-muted">{simResult.breakdown.vector}%</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.vector}%` }}></div>
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><TagIcon className="w-4 h-4 text-blue-500"/> שכבת תגיות</span>
                                            <span className="text-text-muted">{simResult.breakdown.tags}%</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.tags}%` }}></div>
                                        </div>
                                        {simResult.breakdown.tagBreakdown &&
                                        typeof simResult.breakdown.tagBreakdown === 'object' &&
                                        Object.keys(simResult.breakdown.tagBreakdown).length > 0 ? (
                                            <div className="mt-2 ps-1 space-y-1 border-s-2 border-blue-100">
                                                {Object.entries(
                                                    simResult.breakdown.tagBreakdown as Record<string, number>,
                                                ).map(([catId, catScore]) => {
                                                    const label =
                                                        tagWeights.find((w) => w.id === catId)?.label || catId;
                                                    const wgt = tagWeights.find((w) => w.id === catId)?.value ?? 0;
                                                    return (
                                                        <div
                                                            key={catId}
                                                            className="flex justify-between text-[10px] text-text-muted"
                                                        >
                                                            <span>
                                                                {label}
                                                                {wgt > 0 ? (
                                                                    <span className="text-blue-600/80"> (משקל {wgt})</span>
                                                                ) : null}
                                                            </span>
                                                            <span className="font-semibold text-text-default">
                                                                {catScore}%
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Geo */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><GlobeAmericasIcon className="w-4 h-4 text-emerald-500"/> שכבה גיאוגרפית</span>
                                            <span className="text-text-muted">{simResult.breakdown.geo !== null ? `${simResult.breakdown.geo}%` : 'לא חושב'}</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.geo || 0}%` }}></div>
                                        </div>
                                    </div>

                                    {/* Experience */}
                                    {isExperienceEnabled && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-text-default flex items-center gap-2"><BriefcaseIcon className="w-4 h-4 text-orange-500"/> שכבת ניסיון</span>
                                                <span className="text-text-muted">{simResult.breakdown.experience}%</span>
                                            </div>
                                            <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.experience}%` }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Intent */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm font-bold">
                                            <span className="text-text-default flex items-center gap-2"><UserGroupIcon className="w-4 h-4 text-rose-500"/> שכבת זיקה (Intent)</span>
                                            <span className="text-text-muted">{simResult.breakdown.intent}%</span>
                                        </div>
                                        <div className="h-2.5 bg-bg-subtle rounded-full overflow-hidden">
                                            <div className="h-full bg-rose-500 rounded-full transition-all duration-1000" style={{ width: `${simResult.breakdown.intent}%` }}></div>
                                        </div>
                                        {simResult.breakdown.intentType && (() => {
                                            const tierId = simResult.breakdown.intentType === 'category' ? 'cluster' : simResult.breakdown.intentType;
                                            const tier = intentWeights.find((w) => w.id === tierId);
                                            return tier ? (
                                                <p className="text-[10px] text-text-muted leading-tight">
                                                    רמת זיקה: {tier.label} (משקל מוגדר: {tier.value})
                                                </p>
                                            ) : null;
                                        })()}
                                    </div>

                                    {/* Age Gap Penalty */}
                                    {simResult.breakdown.ageGapPenalty > 0 && (
                                        <div className="space-y-2 pt-4 mt-2 border-t border-border-subtle">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-orange-600 flex items-center gap-2"><UserGroupIcon className="w-4 h-4"/> קנס חריגת גיל</span>
                                                <span className="text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md">-{simResult.breakdown.ageGapPenalty} נק'</span>
                                            </div>
                                            <div className="h-2.5 bg-orange-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-500 rounded-full transition-all duration-1000" style={{ width: `100%` }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {/* General penalties */}
                                    {(simResult.breakdown.generalPenalties > 0 || (Array.isArray(simResult.breakdown.penaltyReasons) && simResult.breakdown.penaltyReasons.length > 0)) && (
                                        <div className="space-y-2 pt-4 mt-2 border-t border-border-subtle">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-rose-600 flex items-center gap-2"><ScaleIcon className="w-4 h-4"/> קנסות כלליים</span>
                                                <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">-{simResult.breakdown.generalPenalties || 0} נק'</span>
                                            </div>
                                            {(simResult.breakdown.penaltyReasons || []).filter((r: { key?: string }) => r.key !== 'salary' && r.key !== 'age').map((r: { label: string; amount: number }, i: number) => (
                                                <div key={i} className="flex justify-between text-xs text-rose-700 bg-rose-50/80 px-2 py-1 rounded">
                                                    <span>{r.label}</span>
                                                    <span className="font-bold">-{r.amount}</span>
                                                </div>
                                            ))}
                                            {simResult.penaltyPoliciesUsed && (
                                                <p className="text-[10px] text-text-muted pt-1">
                                                    משקלי Penalty_general בסימולציה:{' '}
                                                    {PENALTY_DIMENSION_META.map((d) => {
                                                        const p = simResult.penaltyPoliciesUsed[d.id];
                                                        if (!p) return null;
                                                        return `${d.label} ${p.mismatch}/${p.missing}`;
                                                    }).filter(Boolean).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Salary Penalty */}
                                    {simResult.breakdown.salaryPenalty > 0 && (
                                        <div className="space-y-2 pt-4 mt-2 border-t border-border-subtle">
                                            <div className="flex justify-between text-sm font-bold">
                                                <span className="text-rose-600 flex items-center gap-2"><ScaleIcon className="w-4 h-4"/> קנס פער שכר</span>
                                                <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">-{simResult.breakdown.salaryPenalty} נק'</span>
                                            </div>
                                            <div className="h-2.5 bg-rose-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-rose-500 rounded-full transition-all duration-1000" style={{ width: `100%` }}></div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8 p-5 bg-blue-50/50 rounded-2xl border border-blue-100 text-sm text-blue-900 leading-relaxed shadow-sm">
                                    <div className="font-bold mb-2 flex items-center gap-2 text-blue-700">
                                        <InformationCircleIcon className="w-5 h-5" /> ניתוח תוצאות:
                                    </div>
                                    <p className="opacity-90">
                                        ציון ההתאמה הסופי חושב על סמך נתוני המועמד והמשרה בפועל.
                                        {simResult.breakdown.intentType && (() => {
                                            const tierId = simResult.breakdown.intentType === 'category' ? 'cluster' : simResult.breakdown.intentType;
                                            const tier = intentWeights.find((w) => w.id === tierId);
                                            return (
                                                <span className="block mt-1">
                                                    זיקה למשרה: {tier?.label || simResult.breakdown.intentType}
                                                    {tier ? ` (${simResult.breakdown.intent}%)` : ''}.
                                                </span>
                                            );
                                        })()}
                                        {simResult.breakdown.candidateYears > 0 && <span className="block mt-1">שנות ניסיון המועמד: <strong>{simResult.breakdown.candidateYears}</strong>{simResult.breakdown.requiredYears > 0 ? ` (נדרש: ${simResult.breakdown.requiredYears})` : ''}.</span>}
                                        {simResult.breakdown.geoMissing && <span className="font-bold text-amber-700 block mt-1"> ניקוד גיאוגרפי: ברירת מחדל (כתובת לא זמינה).</span>}
                                        {simResult.breakdown.salaryPenalty > 0 && <span className="font-bold text-rose-700 block mt-1"> קנס פער שכר: {simResult.breakdown.salaryPenalty} נקודות.</span>}
                                        {simResult.breakdown.ageGapPenalty > 0 && <span className="font-bold text-orange-700 block mt-1"> קנס חריגת גיל: {simResult.breakdown.ageGapPenalty} נקודות.</span>}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Formula preview — live values */}
            <div className="mt-8 bg-white rounded-2xl border border-border-default p-6 shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                    <ArrowPathIcon className="w-5 h-5 text-primary-500" />
                    נוסחת השקלול הנוכחית (ערכים חיים)
                </h3>

                {(() => {
                    const vW = mainWeights.find(w => w.id === 'vector')?.value    ?? 0;
                    const tW = mainWeights.find(w => w.id === 'tags')?.value      ?? 0;
                    const gW = mainWeights.find(w => w.id === 'geo')?.value       ?? 0;
                    const eW = isExperienceEnabled ? (mainWeights.find(w => w.id === 'experience')?.value ?? 0) : 0;
                    const iW = mainWeights.find(w => w.id === 'intent')?.value    ?? 0;
                    const total = vW + tW + gW + eW + iW;
                    return (
                        <div className="space-y-5">
                            {/* Main formula */}
                            <div className="bg-bg-subtle p-5 rounded-xl font-mono text-sm overflow-x-auto">
                                <div className="text-text-muted mb-3 text-xs font-sans">// נוסחת חישוב הציון הסופי</div>
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className="text-primary-700 font-black">TotalW</span>
                                    <span className="text-text-muted">=</span>
                                    <span className="bg-purple-100  text-purple-700  px-2 py-0.5 rounded font-bold">{vW}</span>
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-blue-100    text-blue-700    px-2 py-0.5 rounded font-bold">{tW}</span>
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold">{gW}</span>
                                    {eW > 0 && <><span className="text-text-muted">+</span><span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-bold">{eW}</span></>}
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-rose-100    text-rose-700    px-2 py-0.5 rounded font-bold">{iW}</span>
                                    <span className="text-text-muted">=</span>
                                    <span className={`font-black text-base ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    <span className="text-primary-700 font-black">S_core</span>
                                    <span className="text-text-muted">=</span>
                                    <span className="text-text-muted">(</span>
                                    <span className="bg-purple-100  text-purple-700  px-2 py-0.5 rounded">S_vector × {vW}</span>
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-blue-100    text-blue-700    px-2 py-0.5 rounded">S_tags × {tW}</span>
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">S_geo × {gW}</span>
                                    {eW > 0 && <>
                                        <span className="text-text-muted">+</span>
                                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">S_exp × {eW}</span>
                                    </>}
                                    <span className="text-text-muted">+</span>
                                    <span className="bg-rose-100    text-rose-700    px-2 py-0.5 rounded">S_intent × {iW}</span>
                                    <span className="text-text-muted">) ÷</span>
                                    <span className="font-bold">{total}</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    <span className="text-primary-700 font-black">S_final</span>
                                    <span className="text-text-muted">=</span>
                                    <span>S_core</span>
                                    <span className="text-text-muted">−</span>
                                    <span className="bg-rose-100   text-rose-700   px-2 py-0.5 rounded">Penalty_salary</span>
                                    <span className="text-text-muted">−</span>
                                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">Penalty_age</span>
                                    <span className="text-text-muted">−</span>
                                    <span className="bg-rose-200 text-rose-800 px-2 py-0.5 rounded">Penalty_general</span>
                                    <span className="text-text-muted">(max 0)</span>
                                </div>
                            </div>

                            {/* Tags sub-formula */}
                            <div className="bg-bg-subtle p-5 rounded-xl font-mono text-xs overflow-x-auto text-text-muted">
                                <div className="text-text-muted mb-2 font-sans text-xs">// פירוט שכבת תגיות</div>
                                S_tags = ( Σ score_i × categoryWeight_i ) ÷ Σ categoryWeight_i
                            </div>

                            {total !== 100 && (
                                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3 rounded-xl text-sm">
                                    <InformationCircleIcon className="w-5 h-5 shrink-0" />
                                    <span>סכום המשקלים הנוכחי הוא <strong>{total}</strong> (לא 100). הנוסחה מנרמלת אוטומטית לפי סך המשקלים — הציון עדיין תקין.</span>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
};

export default AdminMatchingEngineView;
