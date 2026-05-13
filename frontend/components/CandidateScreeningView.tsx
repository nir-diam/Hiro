import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronDownIcon,
    NoSymbolIcon,
    CheckCircleIcon,
    MapPinIcon,
    SparklesIcon,
    PaperAirplaneIcon,
    AvatarIcon,
    ArrowLeftIcon,
    ArrowsPointingOutIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    PencilIcon,
    PhoneIcon,
    ClockIcon,
    ArrowPathIcon,
} from './Icons';
import TagMatchPanel, { type TagMatchCategory } from './TagMatchPanel';
import ResumeViewer from './ResumeViewer';
import { InternalOpinionEditorModal, copyRichHtmlToClipboard } from './InternalOpinionEditorModal';
import { useLanguage } from '../context/LanguageContext';
import { buildParsedScreeningCvHtmlForPdf, renderScreeningCvHtmlToPdfBase64 } from '../utils/screeningCvPdfExport';
import type { LocationItem } from './LocationSelector';
import {
    buildJobLocationDisplayModel,
    type JobLocationDisplayModel,
    splitJobLocationString,
} from '../utils/jobLocationDisplay';
import { buildResumeDataFromCandidate } from '../utils/screeningResumeData';
import {
    buildJobTagMatchCategories,
    type ScreeningJobSkillRow,
    type ScreeningJobLanguageRow,
} from '../utils/jobTagMatchCategories';

export { buildResumeDataFromCandidate };
export type { ScreeningJobSkillRow, ScreeningJobLanguageRow };

const apiBase = import.meta.env.VITE_API_BASE || '';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Match-engine slice returned with candidate screening pool rows (Sonar-aligned). */
interface ScreeningPoolScoreBreakdown {
  geo?: number;
  geoDistance?: number | null;
  geoMissing?: boolean;
}

interface ScreeningJob {
  id: number | string;
  company: string;
  title: string;
  location: string;
  /** Primary city field from Job.city when present — merged into locality tokens for metrics. */
  city?: string;
  /** Job.region from API — used with city/location for geo distance display. */
  region?: string;
  /** When API returns structured locations (radius row), compact summary matches Studio. */
  locations?: LocationItem[];
  salary: string;
  /** Monthly brackets in thousands ₪ — job expectations from Job.SalaryMin/SalaryMax */
  salaryMin?: number;
  salaryMax?: number;
  jobType?: string | string[];
  /** Job requirement fields used for metric tones (Sonar-aligned). */
  gender?: string;
  mobility?: boolean;
  licenseType?: string;
  ageMin?: number;
  ageMax?: number;
  /** Internal HTML/text notes — may embed `[WORKING_HOURS] …` (see NewJobView). */
  internalNotes?: string;
  aiMatchScore: number;
  description: string;
  requirements: string[];
  /** Job taxonomy — affinity / screening payloads often rely on these. */
  field?: string;
  role?: string;
  /** Structured tag rows from Job.skills — primary source for כישורי חובה / שליליים in screening. */
  skills?: ScreeningJobSkillRow[];
  languages?: ScreeningJobLanguageRow[];
  screeningQuestions: { question: string; answer: string }[];
  /** Job JSONB contacts from API when present */
  contactsFromJob?: { id?: string; name: string; role?: string; email?: string }[];
  /** From job_candidates.workflowMeta when linked via bulk filter / screening */
  filterPosition?: string;
  filterNotes?: string;
  /** 1 = explicit application/link, 2 = manual override, 3 = interest match only */
  screeningPath?: 1 | 2 | 3;
  /** Present when job appears in pool but fails inclusion rules — card is visible but not selectable. */
  excludedReasons?: string[];
  /** Per-rule pass/fail from screening engine (localized labels client-side). */
  evaluationChecks?: ScreeningEvalCheck[];
  /** Job owner's client UUID when supplied by the screening pool (reserved). */
  screeningClientId?: string | null;
  /** From GET …/screening-pool — same shape as Job Sonar `scoreBreakdown` (geoDistance, etc.). */
  scoreBreakdown?: ScreeningPoolScoreBreakdown | null;
}

interface ScreeningEvalCheck {
  code: string;
  ok: boolean;
  category?: string;
  meta?: { until?: string; lastExitReason?: string | null } | null;
}

function formatEvalCheckLabel(
  t: (key: string, opts?: Record<string, string>) => string,
  check: ScreeningEvalCheck,
): string {
  if (!check.ok && check.code === 'cooldown_clear') {
    if (check.meta?.until) {
      let untilLabel = check.meta.until;
      try {
        untilLabel = new Date(check.meta.until).toLocaleDateString();
      } catch {
        /* keep ISO */
      }
      const base = t('screening.cooldown_until', { until: untilLabel });
      const reason = check.meta.lastExitReason ? String(check.meta.lastExitReason).trim() : '';
      return reason ? `${base} (${reason})` : base;
    }
    return t('screening.warn.cooldown');
  }
  const passKey = `screening.pass.${check.code}`;
  const warnKey = `screening.warn.${check.code}`;
  return check.ok ? t(passKey) : t(warnKey);
}

/** Compact location line for screening cards (avoids huge comma-separated city lists). */
const ScreeningJobLocationLine: React.FC<{
  model: JobLocationDisplayModel;
  t: (key: string, opts?: Record<string, string | number>) => string;
}> = ({ model, t }) => {
  const [expanded, setExpanded] = useState(false);

  if (model.kind === 'empty') return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((x) => !x);
  };

  if (model.kind === 'inline') {
    return (
      <span className="flex items-start gap-1 min-w-0">
        <MapPinIcon className="w-3 h-3 flex-shrink-0 mt-0.5" />
        <span className="min-w-0 break-words">{model.cities.join(', ')}</span>
      </span>
    );
  }

  if (model.kind === 'radius') {
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-start gap-1 min-w-0">
            <MapPinIcon className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="font-medium text-text-default break-words">
              {t('screening.location.radius_line', { center: model.center, km: model.km })}
            </span>
          </span>
          {model.cities.length > 0 ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary-600 hover:text-primary-800 underline decoration-primary-300 underline-offset-2 whitespace-nowrap"
              onClick={toggle}
            >
              {expanded
                ? t('screening.location.hide_settlements')
                : t('screening.location.show_settlements', { count: model.cities.length })}
            </button>
          ) : null}
        </div>
        {expanded && model.cities.length > 0 ? (
          <div className="mr-5 max-h-28 overflow-y-auto rounded-md border border-border-default/80 bg-bg-subtle/50 px-2 py-1.5 text-[11px] leading-snug text-text-muted">
            {model.cities.join(', ')}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="flex items-start gap-1 min-w-0">
          <MapPinIcon className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span className="font-medium text-text-default break-words">
            {t('screening.location.center_and_more', {
              center: model.firstCity,
              count: model.extraCount,
            })}
          </span>
        </span>
        <button
          type="button"
          className="text-xs font-semibold text-primary-600 hover:text-primary-800 underline decoration-primary-300 underline-offset-2 whitespace-nowrap"
          onClick={toggle}
        >
          {expanded
            ? t('screening.location.hide_settlements')
            : t('screening.location.show_settlements', { count: model.cities.length })}
        </button>
      </div>
      {expanded ? (
        <div className="mr-5 max-h-28 overflow-y-auto rounded-md border border-border-default/80 bg-bg-subtle/50 px-2 py-1.5 text-[11px] leading-snug text-text-muted">
          {model.cities.join(', ')}
        </div>
      ) : null}
    </div>
  );
};

interface SendModalContact {
  id: string;
  name: string;
  role: string;
  email?: string;
}

function screeningMetricLabelHe(code: string): string {
  const map: Record<string, string> = {
    already_advanced: 'שלב תהליך',
    manual_override_path: 'קיצור דרך ידני',
    affinity: 'הגשה / התאמת תחום',
    mandatory_skill: 'כישורי חובה',
    negative_skill: 'כישורים שליליים',
    no_cv: 'קובץ קו״ח',
    license: 'רישיון נהיגה',
    age_unknown: 'גיל',
    age_min: 'גיל מינימום',
    age_max: 'גיל מקסימום',
    mandatory_language: 'שפות חובה',
    profile_valid: 'תוקף פרופיל',
    cooldown_clear: 'צינון',
    status_lane: 'סטטוס קישור',
  };
  return map[code] || code;
}

type ScreeningCardMetricTone = 'good' | 'bad' | 'muted';

function gapChipLabelsFromCategories(categories: TagMatchCategory[], max = 8): string[] {
  const out: string[] = [];
  for (const cat of categories) {
    for (const ch of cat.chips) {
      if (ch.state === 'gap') out.push(ch.label);
    }
  }
  return out.slice(0, max);
}

function screeningCandLicenseSummary(c: Record<string, unknown>): string {
  const dl = String(c.drivingLicense ?? '').trim();
  if (dl) return dl;
  const arr = Array.isArray(c.drivingLicenses) ? (c.drivingLicenses as unknown[]) : [];
  return arr.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
}

function screeningNormGenderBucket(raw: string): 'm' | 'f' | '' {
  const x = raw.trim().toLowerCase();
  if (!x) return '';
  if (/זכר|^male$|^m$/i.test(x) || x === 'גבר') return 'm';
  if (/נקבה|^female$|^f$/i.test(x) || x === 'אישה') return 'f';
  return '';
}

/** Normalize place / requirement tokens for tolerant comparisons (RTL-safe). */
function normalizeLocaleToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ');
}

function localeTokensRoughMatch(aRaw: string, bRaw: string): boolean {
  const a = normalizeLocaleToken(aRaw);
  const b = normalizeLocaleToken(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

/** Normalized locality tokens listed for the job (free-text + structured locations). */
function normalizedJobCityTokens(job: ScreeningJob, model: JobLocationDisplayModel): Set<string> {
  const out = new Set<string>();
  const add = (raw: string) => {
    const n = normalizeLocaleToken(raw);
    if (n.length >= 2) out.add(n);
  };
  for (const seg of splitJobLocationString(job.location)) add(seg);
  if (typeof job.city === 'string' && job.city.trim()) add(job.city);
  if (model.kind === 'inline') for (const c of model.cities) add(c);
  if (model.kind === 'compact') for (const c of model.cities) add(c);
  if (model.kind === 'radius') {
    add(model.center);
    for (const c of model.cities) add(c);
  }
  return out;
}

function candidateCityMatchesJobLocations(candidateCity: string, jobTokens: Set<string>): boolean {
  const cn = normalizeLocaleToken(candidateCity);
  if (!cn || jobTokens.size === 0) return false;
  for (const jt of jobTokens) {
    if (localeTokensRoughMatch(cn, jt)) return true;
  }
  return false;
}

/** Picklist / JSON token → label string */
function stringifyScopePickToken(x: unknown): string {
  if (x == null) return '';
  if (typeof x === 'string') return x.trim();
  if (typeof x === 'number' && Number.isFinite(x)) return String(x);
  if (typeof x === 'object') {
    const o = x as { name?: unknown; label?: unknown; value?: unknown };
    const n = String(o.name ?? o.label ?? o.value ?? '').trim();
    if (n) return n;
  }
  return String(x).trim();
}

/** Job daily hours embedded in `internalNotes` as `[WORKING_HOURS] …` (NewJobView). */
function extractJobWorkingHoursFromNotes(notes: string | undefined | null): string {
  const raw = String(notes || '');
  const m = raw.match(/\[WORKING_HOURS\]\s*([^\n\r<]*)/i);
  if (m?.[1]) {
    const parsed = String(m[1]).trim();
    if (parsed) return parsed;
  }
  return '';
}

/** מועמד: שעות מועדפות + זמינות + מודלי עבודה מועדפים (להשוואה מול שעות המשרה). */
function candidateHoursPreferenceStr(c: Record<string, unknown>): string {
  const parts: string[] = [];
  const wh = String(c.preferredWorkingHours ?? '').trim();
  const av = String(c.availability ?? '').trim();
  if (wh) parts.push(wh);
  if (av) parts.push(av);
  for (const x of Array.isArray(c.preferredWorkModels) ? c.preferredWorkModels : []) {
    const s = stringifyScopePickToken(x);
    if (s) parts.push(s);
  }
  const seen = new Set<string>();
  return parts
    .filter((x) => {
      const k = normalizeLocaleToken(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(', ');
}

function hoursPreferenceCompatible(candBlob: string, jobBlob: string): boolean {
  const c = normalizeLocaleToken(candBlob);
  const j = normalizeLocaleToken(jobBlob);
  if (!c || !j) return false;
  if (/גמיש|ללא אילוצי שעות|flexible|משמרות\s*גמיש|עבודה\s*גמישה/i.test(c)) return true;
  if (/גמיש|ללא אילוצי שעות|flexible/i.test(j)) return true;
  if (c === j) return true;
  if (localeTokensRoughMatch(c, j)) return true;
  if (c.length >= 4 && j.length >= 4 && (c.includes(j) || j.includes(c))) return true;
  return false;
}

/** מועמד: רק jobScope + jobScopes (מול job.jobType). */
function candidateJobScopesOnlyList(c: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const k = normalizeLocaleToken(t);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  add(String(c.jobScope ?? ''));
  for (const x of Array.isArray(c.jobScopes) ? c.jobScopes : []) add(stringifyScopePickToken(x));
  return out;
}

function jobJobTypeOnlyList(job: ScreeningJob): string[] {
  const jt = job.jobType;
  const raw =
    Array.isArray(jt)
      ? jt.filter(Boolean).map(String).map((x) => x.trim()).filter(Boolean)
      : String(jt ?? '')
          .trim()
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of raw) {
    const k = normalizeLocaleToken(chunk);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(chunk);
  }
  return out;
}

function normalizedDistinctTokens(strings: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of strings) {
    const k = normalizeLocaleToken(raw);
    if (k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(raw.trim());
  }
  return out;
}

function tokenListsOverlap(candidateTokens: string[], jobTokens: string[]): boolean {
  const A = normalizedDistinctTokens(candidateTokens);
  const B = normalizedDistinctTokens(jobTokens);
  if (A.length === 0 || B.length === 0) return false;
  for (const a of A) {
    for (const b of B) {
      if (normalizeLocaleToken(a) === normalizeLocaleToken(b)) return true;
      if (localeTokensRoughMatch(a, b)) return true;
    }
  }
  return false;
}

function parseScreeningSalaryNum(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw != null && String(raw).trim()) {
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function salaryThousandsIntervalsOverlap(
  cMin: number | undefined,
  cMax: number | undefined,
  jMin: number | undefined,
  jMax: number | undefined,
): boolean {
  const candLo = cMin ?? cMax;
  const candHi = cMax ?? cMin ?? candLo;
  const jobLo = jMin ?? jMax;
  const jobHi = jMax ?? jMin ?? jobLo;
  if (
    candLo == null ||
    candHi == null ||
    jobLo == null ||
    jobHi == null ||
    !Number.isFinite(candLo) ||
    !Number.isFinite(candHi) ||
    !Number.isFinite(jobLo) ||
    !Number.isFinite(jobHi)
  )
    return false;
  const loC = Math.min(candLo, candHi);
  const hiC = Math.max(candLo, candHi);
  const loJ = Math.min(jobLo, jobHi);
  const hiJ = Math.max(jobLo, jobHi);
  return loC <= hiJ && hiC >= loJ;
}

function toneJobVsCandidate(jobSpecifies: boolean, candHas: boolean, matches: boolean): ScreeningCardMetricTone {
  if (!jobSpecifies) return 'muted';
  if (!candHas) return 'bad';
  return matches ? 'good' : 'bad';
}

function jobSpecifiesSalary(job: ScreeningJob): boolean {
  const has = (v: unknown) => v != null && Number.isFinite(Number(v));
  return has(job.salaryMin) || has(job.salaryMax);
}

function licensesCompatible(jobLic: string, candBlob: string): boolean {
  const j = normalizeLocaleToken(jobLic);
  if (!j || !candBlob.trim()) return false;
  const chunks = candBlob
    .split(/[,;/|]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const hay = normalizeLocaleToken(candBlob);
  if (chunks.length <= 1) {
    return localeTokensRoughMatch(hay, j) || hay.includes(j) || j.includes(hay);
  }
  for (const ch of chunks) {
    const cn = normalizeLocaleToken(ch);
    if (localeTokensRoughMatch(cn, j) || cn.includes(j) || j.includes(cn)) return true;
  }
  return false;
}

/** Candidate residence city only (never inferred from the job card). */
function candidatePrimaryCityLine(c: Record<string, unknown>): string {
  const emdash = '—';
  const direct = String(c.city ?? (c as { addressCity?: unknown }).addressCity ?? '').trim();
  if (direct) return direct;
  const loc = String(c.location ?? c.address ?? '').trim();
  if (loc) {
    const parts = loc.split(/[,،]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[0];
    if (loc.length <= 48) return loc;
    return `${loc.slice(0, 45)}…`;
  }
  return emdash;
}

function screeningJobSliceForMetrics(job: ScreeningJob): Record<string, unknown> {
  return {
    jobType: job.jobType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    gender: job.gender,
    mobility: job.mobility,
    licenseType: job.licenseType,
    city: job.city,
    region: job.region,
    location: job.location,
  };
}

function buildScreeningCardMetricCells(
  job: ScreeningJob,
  candidate: Record<string, unknown>,
  locationModel: JobLocationDisplayModel,
  t: (key: string, opts?: Record<string, string | number>) => string,
): { label: string; value: string; tone: ScreeningCardMetricTone }[] {
  const jobRec = screeningJobSliceForMetrics(job) as Record<string, unknown>;
  const emdash = '—';

  const vecPct = Math.max(0, Math.min(100, Math.round(Number(job.aiMatchScore) || 0)));
  const vecTone: ScreeningCardMetricTone = vecPct >= 75 ? 'good' : 'muted';

  const candScopeTokens = candidateJobScopesOnlyList(candidate);
  const jobScopeTokens = jobJobTypeOnlyList(job);
  const scopeVal = candScopeTokens.length ? candScopeTokens.join(', ') : emdash;
  const scopeTone = toneJobVsCandidate(
    jobScopeTokens.length > 0,
    candScopeTokens.length > 0,
    tokenListsOverlap(candScopeTokens, jobScopeTokens),
  );

  const jobHoursStr = extractJobWorkingHoursFromNotes(job.internalNotes);
  const candHoursStr = candidateHoursPreferenceStr(candidate);
  const hoursVal = candHoursStr || emdash;
  const hoursTone = toneJobVsCandidate(
    Boolean(jobHoursStr.trim()),
    Boolean(candHoursStr.trim()),
    hoursPreferenceCompatible(candHoursStr, jobHoursStr),
  );

  const cityVal = candidatePrimaryCityLine(candidate);
  const jobLocTokens = normalizedJobCityTokens(job, locationModel);
  const cityTone = toneJobVsCandidate(
    jobLocTokens.size > 0,
    cityVal !== emdash,
    candidateCityMatchesJobLocations(cityVal, jobLocTokens),
  );

  const jobGeoText = String(job.city ?? job.region ?? job.location ?? '').trim();
  const jobHasGeoTarget = Boolean(jobGeoText);
  const bd = job.scoreBreakdown;
  const rawGeoKm = bd?.geoDistance;
  const geoKm =
    typeof rawGeoKm === 'number' && Number.isFinite(rawGeoKm) ? Math.round(rawGeoKm) : null;
  const geoMissing = Boolean(bd?.geoMissing);
  const geoScoreNum = typeof bd?.geo === 'number' && Number.isFinite(bd.geo) ? bd.geo : null;

  let distanceVal: string;
  let distanceTone: ScreeningCardMetricTone = 'muted';
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

  const ageVal = String(candidate.age ?? '').trim() || emdash;
  const ageNum = parseInt(String(candidate.age ?? '').trim(), 10);
  const amin = job.ageMin;
  const amax = job.ageMax;
  const ageJobSpecifies =
    (typeof amin === 'number' && Number.isFinite(amin)) ||
    (typeof amax === 'number' && Number.isFinite(amax));
  const ageCandHas = Number.isFinite(ageNum);
  let ageMatch = false;
  if (ageJobSpecifies && ageCandHas) {
    const belowMin = typeof amin === 'number' && Number.isFinite(amin) && ageNum < amin;
    const aboveMax = typeof amax === 'number' && Number.isFinite(amax) && ageNum > amax;
    ageMatch = !belowMin && !aboveMax;
  }
  const ageTone = toneJobVsCandidate(ageJobSpecifies, ageCandHas, ageMatch);

  const genderVal = String(candidate.gender ?? '').trim() || emdash;
  const jobGenderRaw = String(jobRec.gender ?? '').trim();
  const genderJobSpecifies = Boolean(jobGenderRaw) && !/^לא\s*משנה/i.test(jobGenderRaw);
  const genderCandHas = genderVal !== emdash;
  const jb = genderJobSpecifies ? screeningNormGenderBucket(jobGenderRaw) : '';
  const cb = genderCandHas ? screeningNormGenderBucket(genderVal) : '';
  const genderMatch = Boolean(jb && cb && jb === cb);
  const genderTone = toneJobVsCandidate(genderJobSpecifies, genderCandHas, genderMatch);

  const mobilityStr = String(candidate.mobility ?? '').trim();
  const mobilityVal = mobilityStr || emdash;
  const mobilityJobSpecifies = jobRec.mobility === true;
  const mobilityCandHas = mobilityStr.length > 0;
  let mobilityMatch = false;
  if (mobilityJobSpecifies && mobilityCandHas) {
    const privateOk =
      /רכב\s*פרטי|נהיגה\s*עצמית|פרטי|עם\s*רכב|מכונית\s*פרטית|נהג\s*עצמאי|private|own\s*car/i.test(
        mobilityStr,
      );
    const publicOnly =
      /ציבורית|תחבורה\s*ציבורית|^ציבורי$|אוטובוס|רכבת|קו\s*עירוני|public\s*transport|\bbus\b/i.test(
        mobilityStr,
      ) && !privateOk;
    mobilityMatch = !publicOnly;
  }
  const mobilityTone = toneJobVsCandidate(mobilityJobSpecifies, mobilityCandHas, mobilityMatch);

  const jobLic = String(jobRec.licenseType ?? '').trim();
  const licRaw = screeningCandLicenseSummary(candidate);
  const licVal = licRaw || emdash;
  const licJobSpecifies = Boolean(jobLic);
  const licCandHas = Boolean(licRaw);
  const licMatch = licensesCompatible(jobLic, licRaw);
  const licTone = toneJobVsCandidate(licJobSpecifies, licCandHas, licMatch);
  const licDisplay =
    licTone === 'bad' && !licCandHas ? t('job.sonar.license_none') : licVal;

  const cSalMin = parseScreeningSalaryNum(candidate.salaryMin);
  const cSalMax = parseScreeningSalaryNum(candidate.salaryMax);
  const jSalMin = job.salaryMin;
  const jSalMax = job.salaryMax;
  const salJobSpecifies = jobSpecifiesSalary(job);
  const salCandHas = cSalMin != null || cSalMax != null;
  const salMatch = salaryThousandsIntervalsOverlap(cSalMin, cSalMax, jSalMin, jSalMax);
  const salaryTone = toneJobVsCandidate(salJobSpecifies, salCandHas, salMatch);

  let salaryVal = t('job.sonar.salary_unknown');
  if (salCandHas) {
    const bracket =
      cSalMin != null && cSalMax != null && cSalMin !== cSalMax
        ? `${cSalMin}-${cSalMax}k ₪`
        : cSalMin != null
          ? `${cSalMin}k ₪`
          : `${cSalMax}k ₪`;
    if (salJobSpecifies && salMatch) salaryVal = `${t('job.sonar.salary_fit')} (${bracket})`;
    else if (salJobSpecifies && !salMatch) salaryVal = `${t('job.sonar.salary_above')} (${bracket})`;
    else salaryVal = bracket;
  }

  return [
    { label: t('job.sonar.metric_vector_value'), value: `${vecPct}%`, tone: vecTone },
    { label: t('job.sonar.fl_scope'), value: scopeVal, tone: scopeTone },
    { label: t('job.sonar.fl_hours'), value: hoursVal, tone: hoursTone },
    { label: t('job.sonar.fl_city'), value: cityVal, tone: cityTone },
    { label: t('job.sonar.fl_distance'), value: distanceVal, tone: distanceTone },
    { label: t('job.sonar.fl_age'), value: ageVal, tone: ageTone },
    { label: t('job.sonar.fl_gender'), value: genderVal, tone: genderTone },
    { label: t('job.sonar.fl_mobility'), value: mobilityVal, tone: mobilityTone },
    { label: t('job.sonar.fl_license'), value: licDisplay, tone: licTone },
    { label: t('job.sonar.fl_salary'), value: salaryVal, tone: salaryTone },
  ];
}

function screeningMetricDotClass(tone: ScreeningCardMetricTone): string {
  if (tone === 'good') return 'bg-green-500';
  if (tone === 'bad') return 'bg-red-500';
  return 'bg-gray-300';
}

function screeningMetricValueClass(tone: ScreeningCardMetricTone): string {
  if (tone === 'bad') return 'text-red-700';
  if (tone === 'muted') return 'text-text-muted';
  return 'text-text-default';
}

const MatchScoreExplanation: React.FC<{
  job: ScreeningJob;
  t: (key: string, opts?: Record<string, string>) => string;
  onClose: () => void;
  onReanalyze: () => void;
  analyzing: boolean;
}> = ({ job, t, onClose, onReanalyze, analyzing }) => {
  const checks = job.evaluationChecks || [];
  const failed = checks.filter((c) => !c.ok);
  const summary =
    failed.length === 0
      ? 'כל בדיקות הסינון האוטומטי עברו — המשרה כלולה במסלול הסינון.'
      : `${failed.length} בדיקות דורשות תשומת לב לפני המשך טיפול במועמד.`;

  return (
    <div
      className="match-score-popup-content absolute z-[100] top-[44px] left-0 md:left-auto md:right-0 w-[min(100vw-2rem,20rem)] bg-white rounded-2xl shadow-2xl border border-border-default overflow-visible animate-in fade-in zoom-in duration-200"
      onClick={(e) => e.stopPropagation()}
      dir="rtl"
    >
      <div className="absolute -top-2 left-8 w-4 h-4 bg-bg-subtle border-t border-l border-border-default rotate-45 z-0" />
      <div className="relative z-10 bg-white rounded-2xl overflow-hidden">
        <div className="p-3 border-b border-border-default flex items-center justify-between bg-bg-subtle/50">
          <div className="flex items-center gap-2 min-w-0">
            <SparklesIcon className="w-5 h-5 text-accent-600 shrink-0" />
            <h3 className="font-bold text-text-default text-sm truncate">ניתוח התאמת סינון</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-bg-hover rounded-full shrink-0">
            <XMarkIcon className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between bg-accent-50 p-2.5 rounded-xl border border-accent-100">
            <span className="text-xs font-medium text-accent-900">ציון התאמה (מערכת)</span>
            <span className="text-lg font-black text-accent-600">{job.aiMatchScore}%</span>
          </div>

          {checks.length === 0 ? (
            <p className="text-xs text-text-muted leading-snug">
              אין רשימת בדיקות מפורטת מהשרת — השתמשו ברשימת הסינון למטה בכרטיס.
            </p>
          ) : (
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wide">בדיקות</h4>
              <div className="space-y-1.5">
                {checks.map((ch, idx) => (
                  <div key={`${ch.code}-${idx}`} className="flex items-start gap-2 p-2 rounded-lg hover:bg-bg-subtle/80">
                    <div
                      className={`mt-0.5 p-0.5 rounded-full shrink-0 ${ch.ok ? 'bg-green-100' : 'bg-red-100'}`}
                    >
                      {ch.ok ? (
                        <CheckCircleIcon className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <NoSymbolIcon className="w-3.5 h-3.5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-text-muted">{screeningMetricLabelHe(ch.code)}</p>
                      <p className="text-xs text-text-default leading-snug">{formatEvalCheckLabel(t, ch)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border-default">
            <p className="text-xs text-text-muted leading-relaxed italic">&quot;{summary}&quot;</p>
          </div>

          <div className="pt-1 flex items-center justify-between text-[10px] text-text-muted">
            <div className="flex items-center gap-1">
              <ClockIcon className="w-3 h-3" />
              <span>מבוסס נתוני משרה ומועמד עדכניים</span>
            </div>
            <button
              type="button"
              disabled={analyzing}
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze();
              }}
              className="flex items-center gap-1 text-primary-600 font-bold hover:underline disabled:opacity-50"
            >
              {analyzing ? (
                <span className="w-3 h-3 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ArrowPathIcon className="w-3 h-3" />
              )}
              <span>חוות דעת AI</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AIMatchScore: React.FC<{ score: number; onOpen?: (e: React.MouseEvent) => void }> = ({
  score,
  onOpen,
}) => {
    const scoreColor = score > 85 ? 'text-accent-600' : score > 70 ? 'text-primary-600' : 'text-red-600';
    const bgColor = score > 85 ? 'bg-accent-100/70' : score > 70 ? 'bg-primary-100/70' : 'bg-red-100/70';

    return (
        <button
            type="button"
            className={`match-score-popup-trigger flex items-center justify-center gap-1.5 text-sm font-bold px-2.5 py-1 rounded-full ${bgColor} ${scoreColor} hover:ring-2 hover:ring-offset-1 hover:ring-accent-400 transition-all cursor-pointer`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.(e);
            }}
        >
            <SparklesIcon className="w-4 h-4" />
            <span>{score}%</span>
        </button>
    );
};

function jobContactStableId(x: any, index: number, jobId: string): string {
  const kind = x.kind === 'user' ? 'user' : x.kind === 'contact' ? 'contact' : null;
  const rid = x.id != null ? String(x.id).trim() : '';
  if (kind && rid) return `${kind}:${rid}`;
  if (rid) return rid;
  return `job-${jobId}-contact-${index}`;
}

function mapApiJobToScreeningJob(raw: any): ScreeningJob {
  const req = raw.requirements ?? [];
  const reqList = Array.isArray(req) ? req : (typeof req === 'string' ? [req] : []);
  const screening = raw.telephoneQuestions ?? raw.screeningQuestions ?? [];
  const screeningList = Array.isArray(screening)
    ? screening.map((q: any) => ({ question: typeof q === 'string' ? q : (q?.question ?? q?.text ?? ''), answer: '' }))
    : [];
  const rawContacts = raw.contacts;
  const jid = String(raw.id ?? '');
  let contactsFromJob: ScreeningJob['contactsFromJob'];
  if (Array.isArray(rawContacts) && rawContacts.length) {
    contactsFromJob = rawContacts
      .map((x: any, i: number) => {
        const emailRaw = x.email != null ? String(x.email).trim() : '';
        const name =
          typeof x.name === 'string' && x.name.trim()
            ? x.name.trim()
            : String(x.contactName || x.fullName || x.email || '').trim();
        return {
          id: jobContactStableId(x, i, jid),
          name,
          role: typeof x.role === 'string' ? x.role : String(x.title || ''),
          email: emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : undefined,
        };
      })
      .filter((x) => Boolean(x.name));
  }
  const fp = typeof raw.filterPosition === 'string' ? raw.filterPosition.trim() : '';
  const fn = typeof raw.filterNotes === 'string' ? raw.filterNotes.trim() : '';
  const locArr = Array.isArray(raw.locations) ? (raw.locations as LocationItem[]) : undefined;
  const skillsRaw = raw.skills;
  const skillsArr = Array.isArray(skillsRaw) ? (skillsRaw as ScreeningJobSkillRow[]) : undefined;
  const langRaw = raw.languages;
  const langArr = Array.isArray(langRaw) ? (langRaw as ScreeningJobLanguageRow[]) : undefined;
  const sminRaw = raw.salaryMin;
  let salaryMinNum: number | undefined;
  if (typeof sminRaw === 'number' && Number.isFinite(sminRaw)) salaryMinNum = sminRaw;
  else if (sminRaw != null && String(sminRaw).trim()) {
    const n = parseFloat(String(sminRaw).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) salaryMinNum = n;
  }
  const smRaw = raw.salaryMax;
  let salaryMaxNum: number | undefined;
  if (typeof smRaw === 'number' && Number.isFinite(smRaw)) salaryMaxNum = smRaw;
  else if (smRaw != null && String(smRaw).trim()) {
    const n = parseFloat(String(smRaw).replace(/[^\d.-]/g, ''));
    if (Number.isFinite(n)) salaryMaxNum = n;
  }

  return {
    id: raw.id,
    company: raw.client ?? raw.company ?? '',
    title: raw.title ?? '',
    location: raw.location ?? raw.city ?? '',
    city:
      typeof raw.city === 'string' && raw.city.trim()
        ? raw.city.trim()
        : typeof raw.city === 'number'
          ? String(raw.city)
          : undefined,
    region:
      typeof raw.region === 'string' && raw.region.trim()
        ? raw.region.trim()
        : raw.region != null && String(raw.region).trim()
          ? String(raw.region).trim()
          : undefined,
    locations: locArr,
    salary: raw.salaryMin && raw.salaryMax ? `${raw.salaryMin}-${raw.salaryMax}k ₪` : (raw.salary ?? ''),
    salaryMin: salaryMinNum,
    salaryMax: salaryMaxNum,
    jobType: raw.jobType,
    gender:
      typeof raw.gender === 'string'
        ? raw.gender.trim()
        : raw.gender != null && String(raw.gender).trim()
          ? String(raw.gender).trim()
          : undefined,
    mobility: raw.mobility === true ? true : raw.mobility === false ? false : undefined,
    licenseType:
      typeof raw.licenseType === 'string'
        ? raw.licenseType.trim()
        : raw.licenseType != null && String(raw.licenseType).trim()
          ? String(raw.licenseType).trim()
          : undefined,
    ageMin: typeof raw.ageMin === 'number' && Number.isFinite(raw.ageMin) ? raw.ageMin : undefined,
    ageMax: typeof raw.ageMax === 'number' && Number.isFinite(raw.ageMax) ? raw.ageMax : undefined,
    internalNotes: typeof raw.internalNotes === 'string' ? raw.internalNotes : undefined,
    aiMatchScore: typeof raw.matchPercentage === 'number' ? raw.matchPercentage : 0,
    description: raw.description ?? '',
    requirements: reqList,
    field: typeof raw.field === 'string' && raw.field.trim() ? raw.field.trim() : undefined,
    role: typeof raw.role === 'string' && raw.role.trim() ? raw.role.trim() : undefined,
    skills: skillsArr,
    languages: langArr,
    screeningQuestions: screeningList,
    contactsFromJob,
    filterPosition: fp || undefined,
    filterNotes: fn || undefined,
  };
}

/** Chips + send payload: always from current `job.contactsFromJob` (never a stale parallel cache). */
function contactsListFromScreeningJob(job: ScreeningJob): SendModalContact[] {
  const jid = String(job.id);
  const list = job.contactsFromJob ?? [];
  return list
    .map((c, i) => ({
      id: c.id ?? `job-embed-${jid}-${i}`,
      name: (c.name || '').trim(),
      role: (c.role || '').trim(),
      email: c.email?.trim() || undefined,
    }))
    .filter((c) => c.name.length > 0);
}

function stripHtmlToText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

const REJECTION_REASONS = [
  'חוסר ניסיון רלוונטי',
  'ציפיות שכר גבוהות',
  'חוסר התאמה טכנולוגית',
  'חוסר התאמה אישיותית',
  'מרחק גיאוגרפי',
  'מועמד משך עניין',
  'אחר',
] as const;

const CandidateScreeningView: React.FC<{
  onBack: () => void;
  candidateId?: string;
  candidate?: {
    fullName?: string;
    title?: string;
    professionalSummary?: string;
    workExperience?: any[];
    education?: any[];
    skills?: any;
    email?: string;
    phone?: string;
    resumeUrl?: string;
    resumeFileUrl?: string;
    resumeText?: string;
    resumeRaw?: string;
    resume?: string;
  };
}> = ({ onBack, candidateId, candidate }) => {
    const { t } = useLanguage();
    const [jobs, setJobs] = useState<ScreeningJob[]>([]);
    const [selectedJobs, setSelectedJobs] = useState<(number | string)[]>([]);
    const [expandedJobId, setExpandedJobId] = useState<number | string | null>(null);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [internalOpinionByJobId, setInternalOpinionByJobId] = useState<Record<string, string>>({});
    const [loadingOpinionForJobId, setLoadingOpinionForJobId] = useState<number | string | null>(null);
    const [screeningDataByJobId, setScreeningDataByJobId] = useState<Record<string, { answers: string[]; telephoneImpression: string }>>({});
    const [opinionEditJob, setOpinionEditJob] = useState<ScreeningJob | null>(null);
    const [opinionEditDraft, setOpinionEditDraft] = useState('');
    const [opinionEditSaving, setOpinionEditSaving] = useState(false);
    const [opinionEditRegenerating, setOpinionEditRegenerating] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS[0]);
    const [rejectNotes, setRejectNotes] = useState('');
    const [rejectSubmitting, setRejectSubmitting] = useState(false);
    const [sendCvModalOpen, setSendCvModalOpen] = useState(false);
    const [sendModalJobIds, setSendModalJobIds] = useState<(number | string)[]>([]);
    const [selectedContactsByJob, setSelectedContactsByJob] = useState<Record<string, Record<string, boolean>>>({});
    const [sendCvSubmitting, setSendCvSubmitting] = useState(false);
    const [sendAttachOriginalCv, setSendAttachOriginalCv] = useState(true);
    const [sendAttachSystemPdf, setSendAttachSystemPdf] = useState(false);
    const [activeMatchScorePopup, setActiveMatchScorePopup] = useState<number | string | null>(null);
    const [selectedJobForTags, setSelectedJobForTags] = useState<ScreeningJob | null>(null);
    const [tagMatchCandidateSnapshot, setTagMatchCandidateSnapshot] = useState<Record<
      string,
      unknown
    > | null>(null);
    const resumeSendCvAfterOpinionRef = useRef(false);
    const saveTimeoutByJobRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const candidateResumeData = useMemo(
      () => buildResumeDataFromCandidate(candidate as any, candidateId),
      [candidate, candidateId]
    );

    const candidateForTagMatch = useMemo(() => {
      const base = (candidate ?? {}) as Record<string, unknown>;
      const snap = tagMatchCandidateSnapshot;
      const tagDetails =
        snap && Array.isArray(snap.tagDetails) && snap.tagDetails.length > 0
          ? snap.tagDetails
          : base.tagDetails;
      const tags =
        snap && Array.isArray(snap.tags) && snap.tags.length > 0 ? snap.tags : base.tags;
      return {
        ...base,
        ...(tagDetails !== undefined ? { tagDetails } : {}),
        ...(tags !== undefined ? { tags } : {}),
      };
    }, [candidate, tagMatchCandidateSnapshot]);

    useEffect(() => {
      if (!selectedJobForTags || !candidateId || !apiBase) {
        setTagMatchCandidateSnapshot(null);
        return;
      }
      let cancelled = false;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${apiBase}/api/candidates/${encodeURIComponent(String(candidateId))}`, {
        headers,
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('candidate'))))
        .then((data: Record<string, unknown>) => {
          if (!cancelled) setTagMatchCandidateSnapshot(data);
        })
        .catch(() => {
          if (!cancelled) setTagMatchCandidateSnapshot(null);
        });
      return () => {
        cancelled = true;
      };
    }, [selectedJobForTags, candidateId, apiBase]);

    useEffect(() => {
      if (!candidateId || !apiBase) {
        setJobs([]);
        return;
      }
      setJobsLoading(true);
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${apiBase}/api/candidates/${candidateId}/screening-pool`, {
        headers,
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('pool'))))
        .then(
          (data: {
            included?: any[];
            excluded?: any[];
          }) => {
          const inc = Array.isArray(data?.included) ? data.included : [];
          const exc = Array.isArray(data?.excluded) ? data.excluded : [];
          const mapChecks = (row: any) =>
            Array.isArray(row.evaluationChecks) ? row.evaluationChecks : undefined;
          const clientFromRow = (row: any) =>
            row.clientId != null && String(row.clientId).trim() ? String(row.clientId).trim() : null;

          const includedList = inc.map((row: any) => ({
            ...mapApiJobToScreeningJob(row.job || {}),
            screeningPath: row.path === 2 ? 2 : row.path === 1 ? 1 : row.path === 3 ? 3 : undefined,
            evaluationChecks: mapChecks(row),
            screeningClientId: clientFromRow(row),
            scoreBreakdown: row.scoreBreakdown ?? null,
          }));
          const excludedList = exc.map((row: any) => ({
            ...mapApiJobToScreeningJob(row.job || {}),
            excludedReasons: Array.isArray(row.reasons) ? row.reasons : [],
            evaluationChecks: mapChecks(row),
            screeningClientId: clientFromRow(row),
            scoreBreakdown: row.scoreBreakdown ?? null,
          }));
          setJobs([...includedList, ...excludedList]);
        })
        .catch(() => {
          setJobs([]);
        })
        .finally(() => setJobsLoading(false));
    }, [candidateId]);

    useEffect(() => {
      setSelectedJobs([]);
      setExpandedJobId(null);
      setSendCvModalOpen(false);
      setSendModalJobIds([]);
      setSelectedContactsByJob({});
      setActiveMatchScorePopup(null);
      setSelectedJobForTags(null);
    }, [candidateId]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Element;
        if (
          activeMatchScorePopup != null &&
          !target.closest('.match-score-popup-trigger') &&
          !target.closest('.match-score-popup-content')
        ) {
          setActiveMatchScorePopup(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMatchScorePopup]);

    useEffect(() => {
      if (!candidateId || !apiBase || jobs.length === 0) return;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, { headers, cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data: Record<string, { screeningAnswers?: { question: string; answer: string }[]; telephoneImpression?: string; internalOpinion?: string }>) => {
          setScreeningDataByJobId((prev) => {
            const next = { ...prev };
            jobs.forEach((job) => {
              const jid = String(job.id);
              const fromApi = data[jid];
              const questions = job.screeningQuestions || [];
              const answers = questions.map((sq) => {
                const a = fromApi?.screeningAnswers?.find((x) => x.question === sq.question);
                return a?.answer ?? '';
              });
              next[jid] = {
                answers: answers.length ? answers : prev[jid]?.answers ?? [],
                telephoneImpression: fromApi?.telephoneImpression ?? prev[jid]?.telephoneImpression ?? '',
              };
            });
            return next;
          });
          setInternalOpinionByJobId((prev) => {
            const next = { ...prev };
            jobs.forEach((job) => {
              const jid = String(job.id);
              const opinion = (data[jid] as { internalOpinion?: string } | undefined)?.internalOpinion;
              if (opinion) next[jid] = opinion;
            });
            return next;
          });
        })
        .catch(() => {});
    }, [candidateId, jobs.map((j) => j.id).join(',')]);

    const getScreeningForJob = useCallback((job: ScreeningJob) => {
      const jid = String(job.id);
      const stored = screeningDataByJobId[jid];
      const questions = job.screeningQuestions || [];
      return {
        answers: stored?.answers ?? questions.map(() => ''),
        telephoneImpression: stored?.telephoneImpression ?? '',
      };
    }, [screeningDataByJobId]);

    const saveScreeningForJob = useCallback(
      async (job: ScreeningJob) => {
        if (!candidateId || !apiBase) return;
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const screeningAnswers = (job.screeningQuestions || []).map((sq, i) => ({
          question: sq.question,
          answer: answers[i] ?? '',
        }));
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          await fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              screeningAnswers,
              telephoneImpression,
            }),
          });
        } catch (_) {}
      },
      [candidateId, getScreeningForJob]
    );

    const debouncedSaveScreening = useCallback(
      (job: ScreeningJob) => {
        const jid = String(job.id);
        const t = saveTimeoutByJobRef.current[jid];
        if (t) clearTimeout(t);
        saveTimeoutByJobRef.current[jid] = setTimeout(() => {
          saveScreeningForJob(job);
          delete saveTimeoutByJobRef.current[jid];
        }, 2000);
      },
      [saveScreeningForJob]
    );

    useEffect(() => {
      const ref = saveTimeoutByJobRef.current;
      return () => {
        Object.values(ref).forEach(clearTimeout);
        saveTimeoutByJobRef.current = {};
      };
    }, []);

    const updateScreeningAnswer = useCallback(
      (job: ScreeningJob, questionIndex: number, value: string) => {
        const jid = String(job.id);
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const nextAnswers = [...answers];
        while (nextAnswers.length <= questionIndex) nextAnswers.push('');
        nextAnswers[questionIndex] = value;
        setScreeningDataByJobId((prev) => ({ ...prev, [jid]: { answers: nextAnswers, telephoneImpression } }));
        debouncedSaveScreening(job);
      },
      [getScreeningForJob, debouncedSaveScreening]
    );

    const updateTelephoneImpression = useCallback(
      (job: ScreeningJob, value: string) => {
        const jid = String(job.id);
        const { answers } = getScreeningForJob(job);
        setScreeningDataByJobId((prev) => ({ ...prev, [jid]: { answers, telephoneImpression: value } }));
        debouncedSaveScreening(job);
      },
      [getScreeningForJob, debouncedSaveScreening]
    );

    const persistInternalOpinion = useCallback(
      async (job: ScreeningJob, html: string) => {
        if (!candidateId || !apiBase) return false;
        const { answers, telephoneImpression } = getScreeningForJob(job);
        const screeningAnswers = (job.screeningQuestions || []).map((sq, i) => ({
          question: sq.question,
          answer: answers[i] ?? '',
        }));
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          const res = await fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              screeningAnswers,
              telephoneImpression,
              internalOpinion: html,
            }),
          });
          return res.ok;
        } catch {
          return false;
        }
      },
      [candidateId, getScreeningForJob]
    );

    const requestGeneratedInternalOpinionHtml = useCallback(
      async (job: ScreeningJob): Promise<{ html: string | null; errorMessage?: string }> => {
        if (!candidateId || !apiBase) {
          return { html: null, errorMessage: 'לא זמין: יש לטעון מועמד מהמערכת.' };
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        try {
          const res = await fetch(`${apiBase}/api/candidates/${candidateId}/generate-internal-opinion`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              jobId: job.id,
              jobTitle: job.title,
              jobDescription: job.description,
              requirements: job.requirements,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.html) return { html: data.html };
          return { html: null, errorMessage: data.message || 'שגיאה ביצירת חוות הדעת.' };
        } catch {
          return { html: null, errorMessage: 'שגיאת רשת.' };
        }
      },
      [candidateId]
    );

    const handleGenerateInternalOpinion = useCallback(
      async (job: ScreeningJob) => {
        setLoadingOpinionForJobId(job.id);
        try {
          const { html, errorMessage } = await requestGeneratedInternalOpinionHtml(job);
          if (html) {
            setInternalOpinionByJobId((prev) => ({ ...prev, [String(job.id)]: html }));
            await persistInternalOpinion(job, html);
          } else if (errorMessage) {
            alert(errorMessage);
          }
        } finally {
          setLoadingOpinionForJobId(null);
        }
      },
      [requestGeneratedInternalOpinionHtml, persistInternalOpinion]
    );

    const openOpinionEditor = useCallback((job: ScreeningJob) => {
      setOpinionEditJob(job);
      setOpinionEditDraft(internalOpinionByJobId[String(job.id)] || '');
    }, [internalOpinionByJobId]);

    const openOpinionEditorFromSendModal = useCallback(
      (job: ScreeningJob) => {
        resumeSendCvAfterOpinionRef.current = true;
        setSendCvModalOpen(false);
        setOpinionEditJob(job);
        setOpinionEditDraft(internalOpinionByJobId[String(job.id)] || '');
      },
      [internalOpinionByJobId]
    );

    const closeOpinionEditor = useCallback(() => {
      setOpinionEditJob(null);
      setOpinionEditDraft('');
      setOpinionEditSaving(false);
      setOpinionEditRegenerating(false);
      if (resumeSendCvAfterOpinionRef.current) {
        resumeSendCvAfterOpinionRef.current = false;
        setSendCvModalOpen(true);
      }
    }, []);

    const handleSaveOpinionFromModal = useCallback(async () => {
      if (!opinionEditJob) return;
      setOpinionEditSaving(true);
      try {
        const ok = await persistInternalOpinion(opinionEditJob, opinionEditDraft);
        if (ok) {
          setInternalOpinionByJobId((prev) => ({ ...prev, [String(opinionEditJob.id)]: opinionEditDraft }));
          closeOpinionEditor();
        } else {
          alert('שמירת חוות הדעת נכשלה.');
        }
      } finally {
        setOpinionEditSaving(false);
      }
    }, [opinionEditJob, opinionEditDraft, persistInternalOpinion, closeOpinionEditor]);

    const handleRegenerateOpinionInModal = useCallback(async () => {
      if (!opinionEditJob) return;
      setOpinionEditRegenerating(true);
      try {
        const { html, errorMessage } = await requestGeneratedInternalOpinionHtml(opinionEditJob);
        if (html) {
          setOpinionEditDraft(html);
          setInternalOpinionByJobId((prev) => ({ ...prev, [String(opinionEditJob.id)]: html }));
          await persistInternalOpinion(opinionEditJob, html);
        } else if (errorMessage) {
          alert(errorMessage);
        }
      } finally {
        setOpinionEditRegenerating(false);
      }
    }, [opinionEditJob, requestGeneratedInternalOpinionHtml, persistInternalOpinion]);

    const handleCopyOpinionFromModal = useCallback(async () => {
      try {
        await copyRichHtmlToClipboard(opinionEditDraft);
        alert('הועתק ללוח — ניתן להדביק במייל עם עיצוב.');
      } catch {
        alert('העתקה ללוח נכשלה.');
      }
    }, [opinionEditDraft]);

    const handleReportOpinionIssue = useCallback(() => {
      const details = window.prompt('תאר את הבעיה בחוות הדעת (אופציונלי):');
      if (details === null) return;
      alert('תודה על הדיווח. הצוות יבדוק את הנושא.');
    }, []);

    const handleSelectJob = (jobId: number | string) => {
      const row = jobs.find((j) => j.id === jobId);
      if (row?.excludedReasons?.length) return;
      setSelectedJobs((prev) =>
        prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId],
      );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectable = jobs.filter((j) => !(j.excludedReasons && j.excludedReasons.length));
      if (e.target.checked) {
        setSelectedJobs(selectable.map((j) => j.id));
      } else {
        setSelectedJobs([]);
      }
    };

    const closeRejectModal = useCallback(() => {
      setRejectModalOpen(false);
      setRejectNotes('');
      setRejectReason(REJECTION_REASONS[0]);
      setRejectSubmitting(false);
    }, []);

    const openRejectModal = useCallback(() => {
      if (selectedJobs.length === 0) return;
      setRejectReason(REJECTION_REASONS[0]);
      setRejectNotes('');
      setRejectModalOpen(true);
    }, [selectedJobs]);

    const handleConfirmReject = useCallback(async () => {
      if (selectedJobs.length === 0) return;
      const jobIds = [...selectedJobs];

      const applyLocalReject = () => {
        setJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)));
        setSelectedJobs([]);
        setExpandedJobId(null);
        setScreeningDataByJobId((prev) => {
          const next = { ...prev };
          jobIds.forEach((id) => {
            delete next[String(id)];
          });
          return next;
        });
        setInternalOpinionByJobId((prev) => {
          const next = { ...prev };
          jobIds.forEach((id) => {
            delete next[String(id)];
          });
          return next;
        });
        closeRejectModal();
      };

      if (!candidateId || !apiBase) {
        applyLocalReject();
        return;
      }

      setRejectSubmitting(true);
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const payload = {
        screeningStatus: 'rejected' as const,
        rejectionReason: rejectReason,
        rejectionNotes: rejectNotes.trim(),
      };

      try {
        const results = await Promise.allSettled(
          jobIds.map((jobId) =>
            fetch(`${apiBase}/api/candidates/${candidateId}/screening-data`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ jobId, ...payload }),
            }).then((res) => {
              if (!res.ok) throw new Error(String(res.status));
            })
          )
        );
        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length === 0) {
          applyLocalReject();
        } else {
          alert(`שלילה נכשלה עבור ${failed.length} מתוך ${jobIds.length} משרות. נסה שוב.`);
        }
      } catch {
        alert('שגיאת רשת בשמירת השלילה.');
      } finally {
        setRejectSubmitting(false);
      }
    }, [
      selectedJobs,
      candidateId,
      rejectReason,
      rejectNotes,
      closeRejectModal,
    ]);

    useLayoutEffect(() => {
      if (!sendCvModalOpen || sendModalJobIds.length === 0) return;
      const selectedJobObjs = jobs.filter((j) => sendModalJobIds.includes(j.id));
      setSelectedContactsByJob((prev) => {
        const next: Record<string, Record<string, boolean>> = {};
        for (const job of selectedJobObjs) {
          const jid = String(job.id);
          const contacts = contactsListFromScreeningJob(job);
          const row: Record<string, boolean> = {};
          for (const c of contacts) {
            const was = prev[jid]?.[c.id];
            row[c.id] = was !== undefined ? was : true;
          }
          next[jid] = row;
        }
        return next;
      });
    }, [sendCvModalOpen, sendModalJobIds.join(','), jobs]);

    const closeSendCvModal = useCallback(() => {
      setSendCvModalOpen(false);
      setSendModalJobIds([]);
      setSelectedContactsByJob({});
      setSendCvSubmitting(false);
      setSendAttachOriginalCv(true);
      setSendAttachSystemPdf(false);
    }, []);

    const openSendCvModal = useCallback(() => {
      if (selectedJobs.length === 0) return;
      setSendModalJobIds([...selectedJobs]);
      const hasFile = Boolean(candidateResumeData.resumeUrl);
      setSendAttachOriginalCv(hasFile);
      setSendAttachSystemPdf(!hasFile);
      setSendCvModalOpen(true);
    }, [selectedJobs, candidateResumeData.resumeUrl]);

    const toggleSendContact = useCallback((jobId: string, contactId: string) => {
      setSelectedContactsByJob((prev) => ({
        ...prev,
        [jobId]: {
          ...(prev[jobId] || {}),
          [contactId]: !prev[jobId]?.[contactId],
        },
      }));
    }, []);

    const handleConfirmSendCv = useCallback(async () => {
      const jobIds = sendModalJobIds;
      if (jobIds.length === 0) return;

      for (const id of jobIds) {
        const jid = String(id);
        const job = jobs.find((j) => String(j.id) === String(id));
        const list = job ? contactsListFromScreeningJob(job) : [];
        if (list.length === 0) {
          alert('למשרה אחת או יותר מהנבחרות לא הוגדרו אנשי קשר. הוסיפו אנשי קשר בכרטיס המשרה ואז נסו שוב.');
          return;
        }
        const map = selectedContactsByJob[jid];
        const n = map ? Object.entries(map).filter(([, v]) => v).length : 0;
        if (n === 0) {
          alert('יש לבחור לפחות איש קשר אחד לכל משרה.');
          return;
        }
      }

      const jobsPayload = jobs.filter((j) => jobIds.includes(j.id));
      const missingOpinion = jobsPayload.some((j) => !stripHtmlToText(internalOpinionByJobId[String(j.id)] || ''));
      if (missingOpinion && !window.confirm('לחלק מהמשרות אין חוות דעת פנימית. להמשיך בכל זאת?')) {
        return;
      }

      if (!apiBase) {
        alert('חסרה הגדרת שרת (VITE_API_BASE).');
        return;
      }
      if (!candidateId) {
        alert('חסר מזהה מועמד.');
        return;
      }

      if (!sendAttachOriginalCv && !sendAttachSystemPdf) {
        alert('בחרו לפחות סוג קובץ אחד לצירוף.');
        return;
      }
      if (sendAttachOriginalCv && !candidateResumeData.resumeUrl) {
        alert('אין קובץ מקורי למועמד — בטלו את \"קובץ מועמד מקורי\" או סמנו \"קובץ מועמד מערכת\".');
        return;
      }

      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        alert('נדרשת התחברות כדי לשלוח מייל.');
        return;
      }

      setSendCvSubmitting(true);
      try {
        let systemCvPdfBase64: string | undefined;
        if (sendAttachSystemPdf) {
          try {
            const summaryHtml = (candidateResumeData.summary || '').replace(
              /עבודה עצמאית/g,
              '<span style="background:rgba(254,240,138,0.55);padding:2px 4px;border-radius:4px;">עבודה עצמאית</span>',
            );
            const pdfHtml = buildParsedScreeningCvHtmlForPdf(
              candidateResumeData.name,
              candidateResumeData.contact,
              summaryHtml,
              candidateResumeData.experience,
              candidateResumeData.education,
              {
                summary: t('section.summary'),
                work: t('section.work_experience'),
                education: t('section.education'),
              },
            );
            systemCvPdfBase64 = await renderScreeningCvHtmlToPdfBase64(pdfHtml);
          } catch (pdfErr) {
            console.error('[screening] system CV PDF failed', pdfErr);
            alert('יצירת PDF מערכת נכשלה. נסו שוב או בטלו את סימון קובץ המערכת.');
            return;
          }
        }

        const payload = jobIds.map((id) => {
          const job = jobs.find((j) => String(j.id) === String(id));
          const contacts = job ? contactsListFromScreeningJob(job) : [];
          const sel = selectedContactsByJob[String(id)] || {};
          const sc = job ? getScreeningForJob(job) : { answers: [] as string[], telephoneImpression: '' };
          return {
            jobId: id,
            jobTitle: job?.title,
            company: job?.company,
            contacts: contacts
              .filter((c) => sel[c.id])
              .map((c) => ({
                email: String(c.email || '').trim(),
                name: c.name || '',
              })),
            internalOpinionHtml: internalOpinionByJobId[String(id)] || '',
            jobDescriptionPlain: job ? stripHtmlToText(job.description || '') : '',
            jobRequirementsPlain: job
              ? (job.requirements || []).map((r) => stripHtmlToText(String(r))).filter(Boolean)
              : [],
            screeningQa: job
              ? (job.screeningQuestions || []).map((sq, i) => ({
                  question: sq.question || '',
                  answer: sc.answers[i] ?? '',
                }))
              : [],
            telephoneImpression: sc.telephoneImpression || '',
          };
        });

        const res = await fetch(`${apiBase}/api/email-uploads/send-screening-cv`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            candidateId,
            attachOriginalCv: sendAttachOriginalCv,
            attachSystemCvPdf: sendAttachSystemPdf,
            systemCvPdfBase64: systemCvPdfBase64 || undefined,
            sends: payload,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(typeof data?.message === 'string' ? data.message : 'שליחת המייל נכשלה.');
          return;
        }

        const n = typeof data?.count === 'number' ? data.count : payload.reduce((a, p) => a + p.contacts.length, 0);
        alert(n > 0 ? `נשלחו ${n} מיילים בהצלחה.` : 'לא נשלחו מיילים.');
        setSelectedJobs((prev) => prev.filter((jid) => !jobIds.includes(jid)));
        closeSendCvModal();
      } finally {
        setSendCvSubmitting(false);
      }
    }, [
      sendModalJobIds,
      selectedContactsByJob,
      jobs,
      internalOpinionByJobId,
      getScreeningForJob,
      candidateId,
      candidateResumeData.name,
      candidateResumeData.resumeUrl,
      candidateResumeData.contact,
      candidateResumeData.summary,
      candidateResumeData.experience,
      candidateResumeData.education,
      closeSendCvModal,
      apiBase,
      sendAttachOriginalCv,
      sendAttachSystemPdf,
      t,
    ]);

    const sendModalJobs = useMemo(
      () => jobs.filter((j) => sendModalJobIds.includes(j.id)),
      [jobs, sendModalJobIds]
    );

    const sendCvBlockedNoJobContacts = useMemo(
      () => sendModalJobs.some((j) => contactsListFromScreeningJob(j).length === 0),
      [sendModalJobs]
    );

    const sendCvBlockedMissingRecipientEmail = useMemo(() => {
      for (const j of sendModalJobs) {
        const jid = String(j.id);
        const list = contactsListFromScreeningJob(j);
        const sel = selectedContactsByJob[jid] || {};
        for (const c of list) {
          if (!sel[c.id]) continue;
          const em = String(c.email || '').trim();
          if (!EMAIL_RE.test(em)) return true;
        }
      }
      return false;
    }, [sendModalJobs, selectedContactsByJob]);

    const sendCvSendDisabled =
      sendCvBlockedNoJobContacts || sendCvBlockedMissingRecipientEmail || (!sendAttachOriginalCv && !sendAttachSystemPdf);

    const selectableJobs = useMemo(
      () => jobs.filter((j) => !(j.excludedReasons && j.excludedReasons.length)),
      [jobs],
    );

    const allSelected = useMemo(
      () => selectableJobs.length > 0 && selectableJobs.every((j) => selectedJobs.includes(j.id)),
      [selectableJobs, selectedJobs],
    );

    const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2);

    const opinionEditorCandidateLabel = candidateResumeData.name;

    return (
        <div className="bg-bg-default h-full flex flex-col -m-6 overflow-hidden relative">
            {/* Header */}
            <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-card flex-shrink-0 shadow-sm z-20">
                <div className="flex items-center gap-4">
                     <button onClick={onBack} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
                        <ArrowLeftIcon className="w-6 h-6 transform rotate-180" />
                    </button>
                    <h3 className="text-xl font-bold text-text-default">סינון מועמד</h3>
                </div>
                 {/* Desktop Actions */}
                 <div className="hidden md:flex items-center gap-3">
                    <button
                        onClick={openRejectModal}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-lg hover:bg-red-100 transition shadow-sm disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                    >
                        <NoSymbolIcon className="w-5 h-5" />
                        <span>שלול ({selectedJobs.length})</span>
                    </button>
                    
                    <button
                        onClick={openSendCvModal}
                        disabled={selectedJobs.length === 0}
                        className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition shadow-sm disabled:bg-primary-300 disabled:cursor-not-allowed"
                    >
                         <span>שלח קו"ח ללקוח ({selectedJobs.length})</span>
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                 </div>
            </header>

            <div className="flex flex-1 overflow-hidden relative flex-row">
                 {/* Right Pane - Jobs List */}
                 {/* RTL: First child is Right. We want Jobs on Right. */}
                 {/* Mobile: Full width (CV hidden). Desktop: Half width. */}
                <div className="w-full md:w-1/2 flex flex-col overflow-hidden bg-bg-subtle/30 md:border-l border-border-default">
                     <div className="p-3 border-b border-border-default flex items-center justify-between bg-bg-subtle/50">
                         <h4 className="font-bold text-text-muted text-sm">משרות לבדיקה ({jobs.length}){jobsLoading ? '...' : ''}</h4>
                         <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                checked={allSelected}
                                onChange={handleSelectAll}
                                id="select-all-jobs"
                                disabled={jobsLoading || selectableJobs.length === 0}
                            />
                            <label htmlFor="select-all-jobs" className="text-sm text-text-muted cursor-pointer">בחר הכל</label>
                        </div>
                     </div>
                     
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 md:pb-4">
                        {jobsLoading ? (
                            <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 text-text-muted">
                                <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                                <p className="text-sm font-medium">{t('screening.loading_pool')}</p>
                            </div>
                        ) : (
                        <>
                        {jobs.map((job) => {
                            const locationModel = buildJobLocationDisplayModel({
                              location: job.location,
                              locations: job.locations,
                            });
                            const jobExcluded = !!(job.excludedReasons && job.excludedReasons.length);
                            const screeningGapStrip =
                              jobExcluded ||
                              !!(job.evaluationChecks && job.evaluationChecks.some((c) => !c.ok));
                            const tagGaps = gapChipLabelsFromCategories(
                              buildJobTagMatchCategories(job, candidateForTagMatch),
                            );
                            const tagAttention = tagGaps.length > 0;
                            const stripAlert = screeningGapStrip || tagAttention;
                            return (
                            <div key={job.id} className={`relative border rounded-lg bg-bg-card transition-all ${expandedJobId === job.id ? 'border-primary-300 shadow-md' : 'border-border-default hover:border-primary-200'} ${activeMatchScorePopup === job.id ? 'z-[55]' : ''}`}>
                                {/* Job Summary */}
                                <div
                                    className="flex items-start gap-3 p-3 cursor-pointer"
                                    onClick={() => setExpandedJobId(prevId => prevId === job.id ? null : job.id)}
                                >
                                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            className="h-5 w-5 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                            checked={selectedJobs.includes(job.id)}
                                            onChange={() => handleSelectJob(job.id)}
                                            disabled={jobsLoading || jobExcluded}
                                        />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1 gap-2">
                                             <div className="min-w-0 flex-1">
                                                <p className="font-bold text-text-default text-base leading-tight flex flex-wrap items-center gap-2">
                                                    {job.title}
                                                    {job.screeningPath === 2 ? (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                                                            {t('screening.path_badge_2')}
                                                        </span>
                                                    ) : job.screeningPath === 1 ? (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                                                            {t('screening.path_badge_1')}
                                                        </span>
                                                    ) : job.screeningPath === 3 ? (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
                                                            {t('screening.path_badge_3')}
                                                        </span>
                                                    ) : null}
                                                </p>
                                                <p className="text-sm text-text-muted">{job.company}</p>
                                              
                                                {(job.filterPosition || job.filterNotes) ? (
                                                    <div className="mt-2 rounded-lg border border-amber-200/90 bg-amber-50/70 px-2.5 py-1.5 text-[11px] leading-snug text-text-default space-y-1">
                                                        {job.filterPosition ? (
                                                            <p>
                                                                <span className="font-bold text-amber-900/80">{t('candidates.screening_filter_position')}: </span>
                                                                {job.filterPosition}
                                                            </p>
                                                        ) : null}
                                                        {job.filterNotes ? (
                                                            <p>
                                                                <span className="font-bold text-amber-900/80">{t('candidates.screening_filter_notes')}: </span>
                                                                {job.filterNotes}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                             </div>
                                             <div className="relative shrink-0">
                                                {activeMatchScorePopup === job.id ? (
                                                    <MatchScoreExplanation
                                                      job={job}
                                                      t={t}
                                                      onClose={() => setActiveMatchScorePopup(null)}
                                                      onReanalyze={() => {
                                                        void handleGenerateInternalOpinion(job);
                                                        setActiveMatchScorePopup(null);
                                                      }}
                                                      analyzing={loadingOpinionForJobId === job.id}
                                                    />
                                                ) : null}
                                                <AIMatchScore
                                                  score={job.aiMatchScore}
                                                  onOpen={() =>
                                                    setActiveMatchScorePopup((prev) =>
                                                      prev === job.id ? null : job.id,
                                                    )
                                                  }
                                                />
                                             </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-3 text-xs text-text-subtle mt-2 flex-wrap">
                                             {locationModel.kind !== 'empty' ? (
                                               <>
                                                 <ScreeningJobLocationLine model={locationModel} t={t} />
                                                 <span aria-hidden className="select-none text-text-subtle">•</span>
                                               </>
                                             ) : null}
                                             <span className="font-medium text-text-default">{job.salary}</span>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 items-center">
                                            {buildScreeningCardMetricCells(
                                              job,
                                              candidateForTagMatch,
                                              locationModel,
                                              t,
                                            ).map((m) => (
                                              <div key={m.label} className="flex items-center gap-1.5 shrink-0">
                                                <span
                                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${screeningMetricDotClass(
                                                    m.tone,
                                                  )}`}
                                                />
                                                <span className="text-[11px] text-text-muted">{m.label}:</span>
                                                <span
                                                  className={`text-[11px] font-bold ${screeningMetricValueClass(
                                                    m.tone,
                                                  )}`}
                                                >
                                                  {m.value}
                                                </span>
                                              </div>
                                            ))}
                                        </div>

                                        <div
                                            className={`mt-3 flex items-center justify-between gap-2 p-2.5 rounded-lg border cursor-pointer ${
                                                stripAlert
                                                    ? 'bg-red-50 border-red-100'
                                                    : 'bg-bg-subtle/40 border-border-default hover:border-primary-200/80'
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedJobForTags(job);
                                            }}
                                        >
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {tagAttention ? (
                                                    <>
                                                        <span className="font-bold text-red-600 text-[11px] shrink-0">
                                                            {t('job.sonar.gaps_tags_heading')}
                                                        </span>
                                                        <span className="text-red-700 text-[11px] truncate">
                                                            {tagGaps.join(', ')}
                                                        </span>
                                                    </>
                                                ) : screeningGapStrip ? (
                                                    <>
                                                        <span className="font-bold text-red-600 text-[11px] shrink-0">
                                                            {t('screening.filter_gaps_heading')}
                                                        </span>
                                                        <span className="text-red-700 text-[11px] truncate">
                                                            {jobExcluded && job.excludedReasons?.length
                                                                ? job.excludedReasons
                                                                      .map((c) => t(`screening.warn.${c}`))
                                                                      .join(' · ')
                                                                : (job.evaluationChecks || [])
                                                                      .filter((x) => !x.ok)
                                                                      .map((x) => formatEvalCheckLabel(t, x))
                                                                      .join(' · ') || '—'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-[11px] text-text-muted truncate">
                                                        {t('screening.tag_strip_hint')}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="text-[10px] font-bold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md bg-white border border-border-default shadow-sm shrink-0 hover:border-primary-200 transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedJobForTags(job);
                                                }}
                                            >
                                                {t('screening.tag_more_details')}
                                            </button>
                                        </div>
                                    </div>
                                     <div className="self-center pl-1">
                                        <ChevronDownIcon className={`w-5 h-5 text-text-muted transition-transform ${expandedJobId === job.id ? 'rotate-180' : ''}`} />
                                    </div>
                                </div>
                                
                                {/* Expanded Details */}
                                {expandedJobId === job.id && (
                                    <div className="p-4 border-t border-border-default bg-bg-subtle/30 text-sm">
                                        <div className="space-y-4">
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">תיאור המשרה</h5>
                                                <p className="text-text-default leading-relaxed">{job.description}</p>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase">דרישות</h5>
                                                <ul className="space-y-1">
                                                    {job.requirements.map((req, i) => (
                                                        <li key={i} className="flex items-start gap-2">
                                                            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                                                            <span>{req}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <div className="bg-primary-50/50 p-3 rounded-lg border border-primary-100">
                                                <h5 className="font-bold text-primary-800 mb-2 text-xs uppercase">שאלות סינון</h5>
                                                <div className="space-y-3">
                                                    {job.screeningQuestions.map((sq, i) => (
                                                        <div key={i}>
                                                            <label className="block font-semibold text-text-default mb-1">{sq.question}</label>
                                                            <input
                                                                type="text"
                                                                placeholder="תשובת המועמד..."
                                                                value={getScreeningForJob(job).answers[i] ?? ''}
                                                                onChange={(e) => updateScreeningAnswer(job, i, e.target.value)}
                                                                className="w-full bg-white border border-primary-200 rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-text-muted mb-1 text-xs uppercase flex items-center gap-1">
                                                    <PhoneIcon className="w-3 h-3" />
                                                    התרשמות טלפונית
                                                </h5>
                                                <textarea
                                                    rows={2}
                                                    placeholder="רשום התרשמות משיחה טלפונית..."
                                                    value={getScreeningForJob(job).telephoneImpression}
                                                    onChange={(e) => updateTelephoneImpression(job, e.target.value)}
                                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                                                />
                                            </div>
                                            <div className="pt-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h5 className="font-bold text-text-muted text-xs uppercase">חוות דעת פנימית</h5>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={loadingOpinionForJobId === job.id}
                                                            onClick={(e) => { e.stopPropagation(); handleGenerateInternalOpinion(job); }}
                                                            className="text-[10px] font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 transition-colors disabled:opacity-50"
                                                        >
                                                            <SparklesIcon className="w-3 h-3" />
                                                            {loadingOpinionForJobId === job.id ? 'מייצר...' : 'הפק חוות דעת AI'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                openOpinionEditor(job);
                                                            }}
                                                            className="text-[10px] font-bold text-text-muted hover:text-text-default flex items-center gap-1 bg-bg-subtle px-2 py-1 rounded-md border border-border-default transition-colors"
                                                        >
                                                            <ArrowsPointingOutIcon className="w-3 h-3" />
                                                            ערוך והרחב
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReportOpinionIssue();
                                                            }}
                                                            className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 bg-red-50 px-2 py-1 rounded-md border border-red-100 transition-colors"
                                                            title="דווח על אי-דיוק"
                                                        >
                                                            <ExclamationTriangleIcon className="w-3 h-3" />
                                                            דווח
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="w-full bg-white border border-border-default rounded-xl p-4 text-sm text-text-default cursor-pointer hover:border-primary-300 transition-all shadow-sm relative group max-h-[400px] overflow-y-auto custom-scrollbar">
                                                    <div className="prose prose-sm max-w-none opacity-80" dangerouslySetInnerHTML={{ __html: internalOpinionByJobId[String(job.id)] || '<p class="text-text-muted">לחץ על &quot;הפק חוות דעת AI&quot; כדי ליצור חוות דעת.</p>' }} />
                                                    <div className="sticky bottom-0 right-0 flex justify-end pt-2">
                                                        <span className="text-[10px] font-bold text-text-muted bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-md border border-border-default">לחץ לכיווץ</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            );
                        })}
                        </>
                        )}
                    </div>
                </div>

                {/* Left Pane - CV */}
                {/* Visually LEFT in RTL. Hidden on mobile. */}
                <div className="hidden md:flex w-1/2 bg-bg-card overflow-hidden flex-col">
                     <ResumeViewer
                       resumeData={candidateResumeData}
                       fullData={candidate as any}
                       candidateId={candidateId || null}
                       className="h-full border-none shadow-none rounded-none"
                     />
                </div>
            </div>

            {/* Mobile Bottom Actions Bar - Only visible on mobile */}
            <div className="md:hidden absolute bottom-0 left-0 right-0 p-4 bg-bg-card border-t border-border-default flex items-center gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                 <button
                    onClick={openRejectModal}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 text-red-600 font-bold py-3 px-4 rounded-xl transition active:bg-red-100 disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-not-allowed"
                >
                    <NoSymbolIcon className="w-5 h-5" />
                    <span>שלול ({selectedJobs.length})</span>
                </button>
                
                <button
                    onClick={openSendCvModal}
                    disabled={selectedJobs.length === 0}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-xl transition active:bg-primary-700 disabled:bg-primary-300 disabled:cursor-not-allowed"
                >
                     <span>שלח ללקוח ({selectedJobs.length})</span>
                    <PaperAirplaneIcon className="w-5 h-5" />
                </button>
            </div>

            {selectedJobForTags ? (
              <TagMatchPanel
                isOpen
                onClose={() => setSelectedJobForTags(null)}
                title={selectedJobForTags.title}
                subtitle={selectedJobForTags.company}
                categories={buildJobTagMatchCategories(selectedJobForTags, candidateForTagMatch)}
              />
            ) : null}

            <InternalOpinionEditorModal
                job={opinionEditJob}
                draftHtml={opinionEditDraft}
                onDraftChange={setOpinionEditDraft}
                candidateLabel={opinionEditorCandidateLabel}
                onClose={closeOpinionEditor}
                onSave={() => void handleSaveOpinionFromModal()}
                saving={opinionEditSaving}
                onRegenerate={() => void handleRegenerateOpinionInModal()}
                regenerating={opinionEditRegenerating}
                onCopy={() => void handleCopyOpinionFromModal()}
                onReport={handleReportOpinionIssue}
            />

            {rejectModalOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/50 z-[10060] flex items-center justify-center p-4 animate-in fade-in duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="reject-candidate-modal-title"
                >
                  <div
                    className="bg-bg-card w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center">
                          <NoSymbolIcon className="w-6 h-6" />
                        </div>
                        <h3 id="reject-candidate-modal-title" className="font-bold text-lg text-text-default">
                          שלילת מועמד ({selectedJobs.length})
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeRejectModal}
                        disabled={rejectSubmitting}
                        className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors disabled:opacity-50"
                        aria-label="סגור"
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </header>
                    <div className="p-6 space-y-4">
                      <div>
                        <label htmlFor="reject-reason" className="block text-sm font-semibold text-text-muted mb-2">
                          סיבת השלילה:
                        </label>
                        <select
                          id="reject-reason"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          disabled={rejectSubmitting}
                          className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500"
                        >
                          {REJECTION_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reject-notes" className="block text-sm font-semibold text-text-muted mb-2">
                          הערות נוספות:
                        </label>
                        <textarea
                          id="reject-notes"
                          rows={4}
                          placeholder="פרט את סיבת השלילה..."
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          disabled={rejectSubmitting}
                          className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                        />
                      </div>
                    </div>
                    <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={closeRejectModal}
                        disabled={rejectSubmitting}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors disabled:opacity-50"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmReject()}
                        disabled={rejectSubmitting}
                        className="px-8 py-2.5 font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-200 transition-all transform active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {rejectSubmitting ? 'שומר...' : 'שלול מועמד'}
                      </button>
                    </footer>
                  </div>
                </div>,
                document.body
              )}

            {sendCvModalOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  className="fixed inset-0 bg-black/50 z-[10070] flex items-center justify-center p-4 animate-in fade-in duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="send-cv-modal-title"
                >
                  <div
                    className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center">
                          <PaperAirplaneIcon className="w-6 h-6" />
                        </div>
                        <h3 id="send-cv-modal-title" className="font-bold text-lg text-text-default">
                          שליחת קו&quot;ח ללקוח
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={closeSendCvModal}
                        disabled={sendCvSubmitting}
                        className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors disabled:opacity-50"
                        aria-label="סגור"
                      >
                        <XMarkIcon className="w-6 h-6" />
                      </button>
                    </header>
                    <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar flex-1 min-h-0">
                      <div className="bg-primary-50 p-4 rounded-xl border border-primary-100">
                        <p className="text-sm text-primary-800 leading-relaxed">
                          אתה עומד לשלוח את המועמד{' '}
                          <span className="font-bold">{candidateResumeData.name}</span> עבור{' '}
                          <span className="font-bold">{sendModalJobIds.length}</span> משרות, עם חוות הדעת המקצועית
                          שהוזנה. הקבצים המצורפים למייל ייקבעו לפי הבחירה למטה.
                          {!candidateResumeData.resumeUrl ? (
                            <span className="block mt-2 font-semibold text-primary-900">
                              אין קובץ מקורי שמור למועמד — יוצג קובץ מערכת (PDF) כברירת מחדל.
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                          משרות נבחרות ואנשי קשר:
                        </h4>
                        <div className="space-y-4">
                          {sendModalJobs.map((job) => {
                            const jid = String(job.id);
                            const contacts = contactsListFromScreeningJob(job);
                            return (
                              <div
                                key={jid}
                                className="p-4 bg-bg-subtle rounded-xl border border-border-default space-y-4"
                              >
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-base text-text-default">{job.title}</p>
                                    <p className="text-sm text-text-muted">{job.company}</p>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => openOpinionEditorFromSendModal(job)}
                                      disabled={sendCvSubmitting}
                                      className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                                      title="ערוך חוות דעת"
                                    >
                                      <PencilIcon className="w-4 h-4" />
                                      <span className="hidden sm:inline">ערוך חוות דעת</span>
                                    </button>
                                    <div className="flex items-center gap-2 border-r border-border-default pr-3 mr-1">
                                      <span className="text-xs font-bold text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full border border-accent-100">
                                        {job.aiMatchScore}% התאמה
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                {!jobsLoading && contacts.length > 0 ? (
                                  <div className="pt-3 border-t border-border-default/50">
                                    <p className="text-[10px] font-bold text-text-muted uppercase mb-2 tracking-wide">
                                      אנשי קשר לקבלת קו&quot;ח (מהמשרה):
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {contacts.map((c) => {
                                        const selected = !!selectedContactsByJob[jid]?.[c.id];
                                        const hasMail = EMAIL_RE.test(String(c.email || '').trim());
                                        return (
                                          <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => toggleSendContact(jid, c.id)}
                                            disabled={sendCvSubmitting}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-medium disabled:opacity-50 ${
                                              selected
                                                ? 'bg-primary-50 border-primary-200 text-primary-700 shadow-sm'
                                                : 'bg-bg-card border-border-default text-text-muted hover:border-primary-200'
                                            } ${selected && !hasMail ? 'ring-1 ring-red-200' : ''}`}
                                          >
                                            <div
                                              className="rounded-full flex items-center justify-center bg-primary-100 shrink-0"
                                              style={{ width: 24, height: 24 }}
                                            >
                                              <span className="text-primary-600" style={{ fontSize: 10 }}>
                                                {getInitials(c.name || '?')}
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <p className="leading-none">{c.name}</p>
                                              {c.role ? (
                                                <p className="text-[9px] mt-0.5 text-primary-400">{c.role}</p>
                                              ) : null}
                                              {hasMail ? (
                                                <p className="text-[9px] mt-0.5 text-text-subtle truncate max-w-[140px]">
                                                  {c.email}
                                                </p>
                                              ) : (
                                                <p className="text-[9px] mt-0.5 text-red-500">חסר מייל במשרה</p>
                                              )}
                                            </div>
                                            {selected ? (
                                              <CheckCircleIcon className="w-3.5 h-3.5 text-primary-500 ml-0.5 shrink-0" />
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-3 pt-2 border-t border-border-default/60">
                        <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">קבצים מצורפים למייל</h4>
                        <label className="flex items-start gap-3 cursor-pointer text-sm text-text-default">
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-border-default"
                            checked={sendAttachOriginalCv}
                            onChange={(e) => setSendAttachOriginalCv(e.target.checked)}
                            disabled={sendCvSubmitting || !candidateResumeData.resumeUrl}
                          />
                          <span>
                            <span className="font-semibold block">קובץ מועמד מקורי</span>
                            <span className="text-text-subtle text-xs">
                              הקובץ כפי שהועלה למערכת (PDF, Word וכו&apos;).
                              {!candidateResumeData.resumeUrl ? ' — לא זמין למועמד זה.' : ''}
                            </span>
                          </span>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer text-sm text-text-default">
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-border-default"
                            checked={sendAttachSystemPdf}
                            onChange={(e) => setSendAttachSystemPdf(e.target.checked)}
                            disabled={sendCvSubmitting}
                          />
                          <span>
                            <span className="font-semibold block">קובץ מועמד מערכת</span>
                            <span className="text-text-subtle text-xs">
                              PDF שנוצר מתצוגת קו&quot;ח מעובדת במערכת (תקציר, ניסיון, השכלה), כפי שמוצגים בטאב הקורות חיים.
                            </span>
                          </span>
                        </label>
                        <p className="text-xs text-text-subtle">
                          ניתן לסמן את שני הסעיפים כדי לשלוח את שני הקבצים יחד.
                        </p>
                      </div>
                      <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                        <div className="mt-0.5 shrink-0">
                          <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600" />
                        </div>
                        <p className="text-xs text-yellow-800">
                          שים לב: מומלץ לוודא שחוות הדעת הפנימית ערוכה ומוכנה לשליחה לפני האישור.
                        </p>
                      </div>
                    </div>
                    <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={closeSendCvModal}
                        disabled={sendCvSubmitting}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors disabled:opacity-50"
                      >
                        ביטול
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmSendCv()}
                        disabled={sendCvSubmitting || sendCvSendDisabled}
                        className="px-8 py-2.5 font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-200 transition-all transform active:scale-95 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <span>{sendCvSubmitting ? 'שולח...' : 'אשר ושלח'}</span>
                        <PaperAirplaneIcon className="w-5 h-5" />
                      </button>
                    </footer>
                  </div>
                </div>,
                document.body
              )}
        </div>
    );
};

export default CandidateScreeningView;
