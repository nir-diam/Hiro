import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon, ChevronDownIcon, TargetIcon, PlusIcon,
  CheckCircleIcon, Squares2X2Icon, TableCellsIcon, SparklesIcon,
  XMarkIcon, ArrowPathIcon, FlagIcon,
} from './Icons';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import AIFeedbackModal from './AIFeedbackModal';
import TagMatchPanel, { type TagMatchCategory } from './TagMatchPanel';
import JobMatchDeepInsightModal from './JobMatchDeepInsightModal';
import {
  fetchJobMatches, assignCandidateToJob, fetchCandidate, fetchClientOptions, fetchCityOptions,
  type JobMatchResult,
} from '../utils/candidateJobMatchingApi';
import { buildJobTagMatchCategories, type JobTagMatchInput } from '../utils/jobTagMatchCategories';

// ─── helpers ─────────────────────────────────────────────────────────────────

function jobToTagInput(job: JobMatchResult): JobTagMatchInput {
  const requirements = Array.isArray(job.requirements)
    ? job.requirements.map((r) => String(r ?? '').trim()).filter(Boolean)
    : [];
  return {
    title: job.title,
    role: job.role,
    field: job.field,
    skills: job.skills as JobTagMatchInput['skills'],
    languages: job.languages as JobTagMatchInput['languages'],
    requirements,
  };
}

function salaryLabel(job: JobMatchResult): string {
  if (job.salaryMin && job.salaryMax) return `${job.salaryMin.toLocaleString()}–${job.salaryMax.toLocaleString()} ₪`;
  if (job.salaryMax) return `עד ${job.salaryMax.toLocaleString()} ₪`;
  if (job.salaryMin) return `מ-${job.salaryMin.toLocaleString()} ₪`;
  return '';
}

// ─── sub-components ───────────────────────────────────────────────────────────

const MatchProgressBar: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="w-full bg-bg-subtle rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score}%` }} />
    </div>
  );
};

// ─── main component ───────────────────────────────────────────────────────────

interface JobMatchingViewProps {
  onBack: () => void;
  candidateName: string;
  candidateId: string;
}

const JobMatchingView: React.FC<JobMatchingViewProps> = ({ onBack, candidateName, candidateId }) => {
  // ── data ──
  const [jobs, setJobs] = useState<JobMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  // ── ui ──
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ── assign state ──
  const [assignedJobs, setAssignedJobs] = useState<Set<string>>(new Set());
  const [successfullyAssignedId, setSuccessfullyAssignedId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // ── recalculate ──
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);

  // ── tag panel ──
  const [tagPanelJob, setTagPanelJob] = useState<JobMatchResult | null>(null);
  const [tagPanelCategories, setTagPanelCategories] = useState<TagMatchCategory[] | null>(null);
  const [tagPanelLoading, setTagPanelLoading] = useState(false);

  // ── deep insight ──
  const [deepInsightJob, setDeepInsightJob] = useState<JobMatchResult | null>(null);

  // ── modals ──
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);

  // ── filters ──
  const [advancedFilters, setAdvancedFilters] = useState({
    score: 0,
    jobType: 'הכל',
    status: 'הכל',
    client: 'הכל',
    city: 'הכל',
  });

  // ─── load ──────────────────────────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchJobMatches(candidateId, { limit: 50 });
      setJobs(rows);
      // Seed assignedJobs from already-linked results
      const linked = new Set<string>(
        rows.filter((j) => j.matchType === 'application' && j.jobCandidateId).map((j) => j.id),
      );
      setAssignedJobs(linked);
    } catch (e) {
      setError((e as Error).message || 'שגיאה בטעינת ההתאמות');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  useEffect(() => {
    Promise.all([fetchClientOptions(), fetchCityOptions()]).then(([clients, cities]) => {
      setClientOptions(clients);
      setCityOptions(cities);
    }).catch(() => {});
  }, []);

  // ─── click outside popover ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (popoverRef.current && !popoverRef.current.contains(t) && !t.closest('[data-popover-trigger]')) {
        setActivePopoverId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── handlers ─────────────────────────────────────────────────────────────

  const handleAssignJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (assignedJobs.has(jobId)) return;
    setAssignError(null);
    try {
      await assignCandidateToJob(candidateId, jobId);
      setAssignedJobs((prev) => new Set(prev).add(jobId));
      setSuccessfullyAssignedId(jobId);
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, matchType: 'application' } : j));
      setTimeout(() => setSuccessfullyAssignedId(null), 2500);
    } catch (e) {
      setAssignError((e as Error).message || 'שגיאה בשיוך למשרה');
      setTimeout(() => setAssignError(null), 4000);
    }
  };

  const handleRecalculateMatch = async (jobId: string) => {
    setRecalculatingId(jobId);
    try {
      // Re-fetch only this job's score by reloading all (backend is fast with cache)
      const rows = await fetchJobMatches(candidateId, { limit: 50 });
      setJobs(rows);
    } catch {
      // silently ignore
    } finally {
      setRecalculatingId(null);
      setActivePopoverId(null);
    }
  };

  const handleOpenTagPanel = async (job: JobMatchResult) => {
    setTagPanelJob(job);
    setTagPanelCategories(null);
    setTagPanelLoading(true);
    try {
      const candFull = await fetchCandidate(candidateId);
      const categories = buildJobTagMatchCategories(jobToTagInput(job), candFull);
      setTagPanelCategories(categories);
    } catch {
      setTagPanelCategories([]);
    } finally {
      setTagPanelLoading(false);
    }
  };

  const handleFieldSelected = (selectedField: SelectedJobField) => {
    setIsJobFieldSelectorOpen(false);
    // Just reload to pick up any new jobs or re-run matching
    loadJobs();
    console.info('[JobMatchingView] field selected:', selectedField.role);
  };

  const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAdvancedFilters((prev) => ({ ...prev, [name]: name === 'score' ? Number(value) : value }));
  };

  const handleResetAdvancedFilters = () => {
    setAdvancedFilters({ score: 0, jobType: 'הכל', status: 'הכל', client: 'הכל', city: 'הכל' });
  };

  // ─── filtering (local) ─────────────────────────────────────────────────────

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((j) => !searchTerm || j.title.toLowerCase().includes(searchTerm.toLowerCase()) || j.client.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter((j) => j.matchScore >= advancedFilters.score)
      .filter((j) => advancedFilters.jobType === 'הכל' || j.jobType.includes(advancedFilters.jobType))
      .filter((j) => advancedFilters.status === 'הכל' || j.status === advancedFilters.status)
      .filter((j) => advancedFilters.client === 'הכל' || j.client === advancedFilters.client)
      .filter((j) => advancedFilters.city === 'הכל' || j.city === advancedFilters.city);
  }, [jobs, searchTerm, advancedFilters]);

  const passedCount = filteredJobs.filter((j) => j.requirementsMet).length;

  // ─── popover ──────────────────────────────────────────────────────────────

  const JobMatchPopover: React.FC<{ job: JobMatchResult; onClose: () => void }> = ({ job, onClose }) => {
    const [recalcLoading, setRecalcLoading] = useState(false);
    const pm = job.parameterMatches;
    const checks: { label: string; key: keyof typeof pm }[] = [
      { label: 'כישורי חובה', key: 'mandatory_skill' },
      { label: 'רישיון נהיגה', key: 'license' },
      { label: 'גיל', key: 'age' },
      { label: 'מין', key: 'gender' },
      { label: 'ניידות', key: 'mobility' },
      { label: 'שפות חובה', key: 'mandatory_language' },
    ].filter((c) => pm && pm[c.key] !== 'unknown');

    return (
      <div
        ref={popoverRef}
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 bg-bg-card rounded-xl shadow-2xl border border-border-default z-30 p-4"
      >
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-4 h-4 transform rotate-45 -mb-2 bg-bg-card border-b border-r border-border-default" />
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-bold text-text-default text-sm flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-primary-500" />
            <span>ניתוח התאמת AI</span>
          </h4>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-bg-hover" aria-label="סגור">
            <XMarkIcon className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {checks.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {checks.map((c) => {
              const state = pm[c.key];
              return (
                <div key={c.key} className="flex items-center justify-between text-xs">
                  <span className="text-text-muted">{c.label}</span>
                  <span className={`font-semibold ${state === 'match' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {state === 'match' ? '✓ עומד' : '✗ חסר'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border-default">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-text-subtle">נותח: {job.lastAnalyzed}</p>
            <button
              onClick={() => setIsFeedbackModalOpen(true)}
              className="text-text-subtle hover:text-red-500 p-1 rounded transition-colors"
              title="דווח על אי-דיוק"
            >
              <FlagIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setDeepInsightJob(job); onClose(); }}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-600 bg-primary-50 py-2 px-3 rounded-lg hover:bg-primary-100 transition"
            >
              <SparklesIcon className="w-3.5 h-3.5" />
              ניתוח עומק
            </button>
            <button
              onClick={async () => {
                setRecalcLoading(true);
                await handleRecalculateMatch(job.id);
                setRecalcLoading(false);
              }}
              disabled={recalcLoading}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 py-2 px-3 rounded-lg hover:bg-purple-100 transition disabled:opacity-50 disabled:cursor-wait"
            >
              {recalcLoading
                ? <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                : <ArrowPathIcon className="w-3.5 h-3.5" />}
              חשב מחדש
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── expanded detail ───────────────────────────────────────────────────────

  const JobMatchDetails: React.FC<{ job: JobMatchResult }> = ({ job }) => (
    <div className="p-4 bg-bg-subtle/70 text-right space-y-4">
      {job.description && (
        <div>
          <h5 className="font-bold text-text-muted mb-1 text-sm">תיאור המשרה</h5>
          <p className="text-sm text-text-muted leading-relaxed">{job.description}</p>
        </div>
      )}
      {Array.isArray(job.requirements) && job.requirements.length > 0 && (
        <div>
          <h5 className="font-bold text-text-muted mb-2 text-sm">דרישות עיקריות</h5>
          <ul className="space-y-1">
            {job.requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-text-default">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Tag / gap analysis button */}
      <div className="flex gap-2">
        <button
          onClick={() => handleOpenTagPanel(job)}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 py-1.5 px-3 rounded-lg hover:bg-primary-100 transition"
        >
          {tagPanelLoading && tagPanelJob?.id === job.id
            ? <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
            : <TargetIcon className="w-3.5 h-3.5" />}
          פירוט פערים/תגיות
        </button>
        <button
          onClick={() => setDeepInsightJob(job)}
          className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 py-1.5 px-3 rounded-lg hover:bg-purple-100 transition"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          ניתוח עומק AI
        </button>
      </div>
    </div>
  );

  // ─── assign button ─────────────────────────────────────────────────────────

  const AssignButton: React.FC<{ job: JobMatchResult; size?: 'sm' | 'md' }> = ({ job, size = 'md' }) => {
    const isAssigned = assignedJobs.has(job.id);
    const isSuccess = successfullyAssignedId === job.id;
    const px = size === 'sm' ? 'py-1 px-3 text-xs' : 'py-2 px-4 text-sm';

    if (isSuccess) {
      return (
        <div className={`flex items-center gap-1.5 text-emerald-600 font-semibold ${px} animate-pulse`}>
          <CheckCircleIcon className="w-4 h-4" />
          <span>שויך!</span>
        </div>
      );
    }
    return (
      <button
        onClick={(e) => handleAssignJob(e, job.id)}
        disabled={isAssigned}
        className={`bg-primary-500 text-white font-semibold ${px} rounded-lg hover:bg-primary-600 transition flex items-center gap-1.5 disabled:bg-gray-300 disabled:cursor-not-allowed`}
      >
        <PlusIcon className="w-4 h-4" />
        {isAssigned ? 'שויך' : 'שייך למשרה'}
      </button>
    );
  };

  // ─── match summary line ──────────────────────────────────────────────────

  const MatchSummaryLine: React.FC<{ job: JobMatchResult }> = ({ job }) => {
    type Dot = { label: string; value: string; ok: boolean };
    const pm = job.parameterMatches;

    const scoreOk = job.matchScore >= 70;

    const map: { key: keyof typeof pm; label: string; matchLabel: string; gapLabel: string }[] = [
      { key: 'salary',            label: 'ציפיות שכר',   matchLabel: 'תואם',        gapLabel: 'פער בשכר'      },
      { key: 'scope',             label: 'שעות משרה',    matchLabel: 'תואם',        gapLabel: 'לא מתאים'      },
      { key: 'mobility',          label: 'ניידות',        matchLabel: 'בסדר',        gapLabel: 'נדרש רכב'      },
      { key: 'license',           label: 'רישיון נהיגה',  matchLabel: 'יש רישיון',   gapLabel: 'נדרש רישיון'   },
      { key: 'age',               label: 'גיל',           matchLabel: 'מתאים',       gapLabel: 'לא בטווח גיל'  },
      { key: 'gender',            label: 'מגדר',          matchLabel: 'מתאים',       gapLabel: 'מגבלת מגדר'    },
      { key: 'mandatory_skill',   label: 'מיומנות חובה',  matchLabel: 'יש',          gapLabel: 'חסרה'          },
      { key: 'mandatory_language',label: 'שפה חובה',      matchLabel: 'יש',          gapLabel: 'חסרה'          },
    ];

    const items: Dot[] = [
      { label: 'התאמה וקטורית', value: `${job.matchScore}%`, ok: scoreOk },
      ...(job.city ? [{ label: 'מיקום', value: job.city, ok: true }] : []),
      ...map.flatMap(({ key, label, matchLabel, gapLabel }) => {
        const v = pm?.[key];
        if (v === 'match') return [{ label, value: matchLabel, ok: true  }];
        if (v === 'gap')   return [{ label, value: gapLabel,   ok: false }];
        return [];
      }),
    ];

    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.ok ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[11px] text-text-muted">{item.label}:</span>
            <span className={`text-[11px] font-bold ${item.ok ? 'text-text-default' : 'text-red-700'}`}>{item.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // ─── card view ────────────────────────────────────────────────────────────

  const JobCard: React.FC<{ job: JobMatchResult }> = ({ job }) => {
    const isExpanded = expandedJobId === job.id;
    return (
      <div className="bg-bg-card border border-border-default rounded-xl hover:shadow-lg transition-shadow duration-300">
        <div className="p-4 space-y-3">
          <div className="flex justify-between items-start">
            <div className="text-left relative">
              <button
                onClick={(e) => { e.stopPropagation(); setActivePopoverId((p) => p === job.id ? null : job.id); }}
                data-popover-trigger
                className="font-extrabold text-3xl text-text-default"
              >
                {recalculatingId === job.id ? '...' : `${job.matchScore}%`}
              </button>
              {activePopoverId === job.id && (
                <JobMatchPopover job={job} onClose={() => setActivePopoverId(null)} />
              )}
              <p className={`text-xs font-semibold ${job.requirementsMet ? 'text-emerald-600' : 'text-red-600'}`}>
                {job.requirementsMet ? 'עבר תנאי סף' : 'לא עומד בדרישות'}
              </p>
            </div>
            <div className="text-right">
              <h4 className="font-bold text-text-default text-base">{job.title}</h4>
              <p className="text-sm text-text-muted flex items-center justify-end gap-2 flex-wrap">
                <span>{job.client}</span>
                {job.matchType === 'ai' && (
                  <span className="text-xs font-bold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <SparklesIcon className="w-3 h-3" />הצעת AI
                  </span>
                )}
                {job.matchType === 'application' && (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    משויך
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                  {job.status}
                </span>
              </p>
            </div>
          </div>
          <MatchProgressBar score={job.matchScore} />
          <MatchSummaryLine job={job} />
          <p className="text-xs text-text-subtle">
            {[job.jobType.join('/'), salaryLabel(job)].filter(Boolean).join(' | ')}
          </p>
          <div className="flex items-center justify-end gap-4 pt-3 border-t border-border-subtle">
            <button
              onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
              className="text-text-muted font-semibold py-1 px-3 text-sm rounded-md hover:bg-bg-hover transition flex items-center gap-1"
            >
              <span>{isExpanded ? 'הסתר' : 'פרטים'}</span>
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            <AssignButton job={job} />
          </div>
        </div>
        {isExpanded && <div className="border-t border-border-default"><JobMatchDetails job={job} /></div>}
      </div>
    );
  };

  // ─── table row ────────────────────────────────────────────────────────────

  const JobRow: React.FC<{ job: JobMatchResult }> = ({ job }) => {
    const isExpanded = expandedJobId === job.id;
    const toggleExpand = () => setExpandedJobId(isExpanded ? null : job.id);
    return (
      <>
        <tr onClick={toggleExpand} className="bg-bg-card hover:bg-bg-hover transition-colors cursor-pointer">
          <td className="p-4">
            <div className="font-bold text-text-default text-base">{job.title}</div>
            <div className="text-sm text-text-muted flex items-center gap-2 flex-wrap mb-1">
              <span>{job.client}</span>
              {job.matchType === 'ai' && (
                <span className="text-xs font-bold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <SparklesIcon className="w-3 h-3" />הצעת AI
                </span>
              )}
              {job.matchType === 'application' && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">משויך</span>
              )}
            </div>
            <MatchSummaryLine job={job} />
          </td>
          <td className="p-4">
            <div className="relative flex justify-start">
              <button
                onClick={(e) => { e.stopPropagation(); setActivePopoverId((p) => p === job.id ? null : job.id); }}
                data-popover-trigger
                className="flex items-center gap-2 cursor-pointer w-full"
              >
                <div className="w-16">
                  {recalculatingId === job.id
                    ? <div className="w-full flex items-center justify-center h-2"><svg className="animate-spin h-4 w-4 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg></div>
                    : <MatchProgressBar score={job.matchScore} />}
                </div>
                <span className="font-bold text-text-default">{recalculatingId === job.id ? '' : `${job.matchScore}%`}</span>
              </button>
              {activePopoverId === job.id && (
                <JobMatchPopover job={job} onClose={() => setActivePopoverId(null)} />
              )}
            </div>
          </td>
          <td className="p-4">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {job.status}
            </span>
          </td>
          <td className="p-4 text-text-muted text-sm">{job.city}</td>
          <td className="p-4">
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
                className="text-text-muted font-semibold py-1 px-3 text-sm rounded-md hover:bg-bg-hover transition flex items-center gap-1"
              >
                <span>פרטים</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
              <AssignButton job={job} size="sm" />
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr className="bg-bg-subtle/50">
            <td colSpan={5}><JobMatchDetails job={job} /></td>
          </tr>
        )}
      </>
    );
  };

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-transparent rounded-2xl h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 px-1">
        <h2 className="text-xl font-bold text-text-default">
          התאמת משרות עבור <span className="text-primary-600">{candidateName}</span>
        </h2>
        <button
          onClick={onBack}
          className="p-2 rounded-full bg-bg-card border border-border-default hover:bg-bg-hover text-text-muted transition-colors shadow-sm"
          title="סגור חלונית התאמות"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Global error/assign feedback */}
      {assignError && (
        <div className="mb-2 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-2 text-sm">
          {assignError}
        </div>
      )}

      <main className="flex-1 overflow-y-auto space-y-4">
        {/* Controls bar */}
        <div className="flex items-center justify-between bg-bg-card p-3 rounded-lg border border-border-default">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsJobFieldSelectorOpen(true)}
              className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm"
            >
              <PlusIcon className="w-5 h-5" />
              <span>הוספת תפקיד</span>
            </button>
            <button
              onClick={loadJobs}
              disabled={loading}
              className="flex items-center gap-2 bg-primary-100/70 text-primary-700 font-semibold py-2 px-4 rounded-lg hover:bg-primary-200 transition disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>רענן</span>
            </button>
          </div>
          <div className="relative">
            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="חיפוש משרה או לקוח..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 bg-bg-subtle border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition"
            />
          </div>
        </div>

        {/* Summary & Filters */}
        <div className="bg-bg-card p-3 rounded-lg border border-border-default sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-text-muted">
              {loading
                ? 'טוען...'
                : <>נמצאו <span className="text-primary-600 font-bold">{filteredJobs.length}</span> משרות | <span className="text-emerald-600 font-bold">{passedCount}</span> עברו תנאי סף</>
              }
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}>
                  <Squares2X2Icon className="w-5 h-5" />
                </button>
                <button onClick={() => setViewMode('table')} title="תצוגת שורות" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}>
                  <TableCellsIcon className="w-5 h-5" />
                </button>
              </div>
              <button
                onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                className="text-sm font-semibold text-primary-600 flex items-center gap-1"
              >
                <span>חיפוש מתקדם</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          {isAdvancedSearchOpen && (
            <div className="mt-4 pt-4 border-t border-border-default">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-4 gap-y-2">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    ציון מינימלי: <span className="text-primary-600 font-bold">{advancedFilters.score}%</span>
                  </label>
                  <input type="range" min="0" max="100" name="score" value={advancedFilters.score} onChange={handleAdvancedFilterChange} className="w-full accent-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">סוג משרה</label>
                  <select name="jobType" value={advancedFilters.jobType} onChange={handleAdvancedFilterChange} className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500">
                    <option value="הכל">הכל</option>
                    <option value="מלאה">מלאה</option>
                    <option value="חלקית">חלקית</option>
                    <option value="משמרות">משמרות</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס משרה</label>
                  <select name="status" value={advancedFilters.status} onChange={handleAdvancedFilterChange} className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500">
                    <option value="הכל">הכל</option>
                    <option value="פתוחה">פתוחה</option>
                    <option value="מוקפאת">מוקפאת</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">לקוח</label>
                  <select name="client" value={advancedFilters.client} onChange={handleAdvancedFilterChange} className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500">
                    <option value="הכל">הכל</option>
                    {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">עיר</label>
                  <select name="city" value={advancedFilters.city} onChange={handleAdvancedFilterChange} className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500">
                    <option value="הכל">הכל</option>
                    {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={handleResetAdvancedFilters} className="text-sm font-semibold text-text-muted hover:text-primary-600 py-2 px-4 rounded-lg hover:bg-bg-hover transition w-full text-center">
                    איפוס
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && jobs.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-bg-card rounded-xl border border-border-default p-4 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-bg-subtle rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-bg-subtle rounded w-1/3" />
                    <div className="h-3 bg-bg-subtle rounded w-1/2" />
                    <div className="h-2 bg-bg-subtle rounded w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={loadJobs} className="text-red-600 font-semibold underline text-xs">נסה שוב</button>
          </div>
        )}

        {/* Job List */}
        {!loading && !error && filteredJobs.length > 0 && (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredJobs.map((job) => <JobCard key={job.id} job={job} />)}
            </div>
          ) : (
            <div className="bg-bg-card rounded-lg border border-border-default">
              <table className="w-full text-sm text-right">
                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                  <tr>
                    <th className="p-4 text-right">משרה</th>
                    <th className="p-4 text-right">התאמה</th>
                    <th className="p-4 text-right">סטטוס</th>
                    <th className="p-4 text-right">מיקום</th>
                    <th className="p-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredJobs.map((job) => <JobRow key={job.id} job={job} />)}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Empty state */}
        {!loading && !error && filteredJobs.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center">
            <TargetIcon className="w-16 h-16 text-text-subtle mb-4" />
            <h3 className="text-xl font-bold text-text-default">לא נמצאו משרות מתאימות</h3>
            <p className="mt-2 text-text-muted">נסה להרחיב את החיפוש או לשנות את הקריטריונים.</p>
          </div>
        )}
      </main>

      {/* Modals */}
      <JobFieldSelector
        value={null}
        onChange={handleFieldSelected}
        isModalOpen={isJobFieldSelectorOpen}
        setIsModalOpen={setIsJobFieldSelectorOpen}
      />

      <AIFeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        context="Match Score Analysis"
      />

      {tagPanelJob && tagPanelCategories && (
        <TagMatchPanel
          isOpen={true}
          onClose={() => { setTagPanelJob(null); setTagPanelCategories(null); }}
          title={tagPanelJob.title}
          subtitle={tagPanelJob.client}
          categories={tagPanelCategories}
        />
      )}

      {deepInsightJob && (
        <JobMatchDeepInsightModal
          isOpen={true}
          onClose={() => setDeepInsightJob(null)}
          candidateId={candidateId}
          jobId={deepInsightJob.id}
          jobTitle={deepInsightJob.title}
          candidateName={candidateName}
        />
      )}
    </div>
  );
};

export default JobMatchingView;
