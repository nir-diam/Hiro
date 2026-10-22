import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  MagnifyingGlassIcon, ChevronDownIcon, ChevronUpIcon, TargetIcon, PlusIcon,
  CheckCircleIcon, Squares2X2Icon, TableCellsIcon, SparklesIcon,
  XMarkIcon, ArrowPathIcon, FlagIcon, NoSymbolIcon, FunnelIcon,
} from './Icons';
import BulkAddToFilterModal, { type BulkJobPickerOption } from './BulkAddToFilterModal';
import ScreeningCollisionWarningModal, { type ScreeningWarningAgg } from './ScreeningCollisionWarningModal';
import {
  fetchScreeningPrecheckForJobs,
  linkCandidatesToJobFilters,
  type JobFilterSaveOptions,
} from '../utils/candidateJobFilterApi';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import AIFeedbackModal from './AIFeedbackModal';
import TagMatchPanel, { type TagMatchCategory } from './TagMatchPanel';
import JobMatchDeepInsightModal from './JobMatchDeepInsightModal';
import { MatchScorePopup, matchScorePopupPositionFromEvent, useMatchScorePopupDismiss } from './MatchScorePopup';
import type { MatchScoreBreakdownData } from './MatchScoreBreakdownPanel';
import { vectorLayerPctFromBreakdown } from '../utils/sonarMatchBreakdown';
import {
  fetchJobMatches, fetchJobMatchesPage, assignCandidateToJob, fetchCandidate, fetchClientOptions, fetchCityOptions,
  ignoreJobMatch, fetchJobMatchIgnores, clearJobMatchIgnore,
  type JobMatchResult, type JobMatchIgnoreItem,
} from '../utils/candidateJobMatchingApi';
import { buildJobTagMatchCategories, type JobTagMatchInput } from '../utils/jobTagMatchCategories';
import JobDetailsDrawer from './JobDetailsDrawer';
import { authHeaders } from '../utils/authHeaders';
import { useLanguage } from '../context/LanguageContext';
import ScanSettingsPanel, {
  DEFAULT_AFFINITY_LEVEL,
  DEFAULT_SCAN_BATCH_SIZE,
  DEFAULT_SCAN_THRESHOLD,
  type AffinityLevel,
  toScanHardFilters,
} from './ScanSettingsPanel';
import {
  mapApiRecordToJobDetailsDrawerJob,
  type JobDetailsDrawerJob,
} from '../utils/jobDetailsDrawerUtils';

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

function jobVectorPct(job: JobMatchResult): number | null {
  return vectorLayerPctFromBreakdown(job.scoreBreakdown);
}

function jobDistanceKm(job: JobMatchResult): number | null {
  const raw = job.scoreBreakdown?.geoDistance;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
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
  const { t } = useLanguage();
  // ── data ──
  const [jobs, setJobs] = useState<JobMatchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [matchCursor, setMatchCursor] = useState({ nextOffset: 0, hasMore: false, total: 0 });
  const matchesInFlightRef = useRef(false);
  const nextOffsetRef = useRef(0);
  const [batchSize, setBatchSize] = useState(DEFAULT_SCAN_BATCH_SIZE);
  const [threshold, setThreshold] = useState(DEFAULT_SCAN_THRESHOLD);
  const [vectorSimilarity, setVectorSimilarity] = useState(true);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(() => new Set());
  const [affinityLevel, setAffinityLevel] = useState<AffinityLevel>(DEFAULT_AFFINITY_LEVEL);
  const [error, setError] = useState<string | null>(null);
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);

  // ── ui ──
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [sortKey, setSortKey] = useState<'title' | 'match' | 'vector' | 'distance' | 'status' | 'city' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [activeMatchPopup, setActiveMatchPopup] = useState<{ id: string; x: number; y: number } | null>(null);
  const [candidateRecord, setCandidateRecord] = useState<Record<string, unknown> | null>(null);

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

  // ── blacklist (job_match_ignore) ──
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreLoading, setIgnoreLoading] = useState(false);
  const [ignoreItems, setIgnoreItems] = useState<JobMatchIgnoreItem[]>([]);
  const [ignoreCount, setIgnoreCount] = useState(0);
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const ignorePanelRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [bulkFilterOpen, setBulkFilterOpen] = useState(false);
  const [screeningCollisionOpen, setScreeningCollisionOpen] = useState(false);
  const [screeningCollisionAgg, setScreeningCollisionAgg] = useState<ScreeningWarningAgg[]>([]);
  const pendingFilterRef = useRef<{ jobIds: string[]; options?: JobFilterSaveOptions } | null>(null);
  const apiBase = import.meta.env.VITE_API_BASE || '';

  const bulkFilterJobOptions = useMemo((): BulkJobPickerOption[] => {
    return jobs.map((j) => ({
      id: j.id,
      title: j.title,
      subtitle: j.client,
      status: j.status,
      city: j.city,
    }));
  }, [jobs]);

  const bulkFilterMatchScoresByJobId = useMemo(() => {
    const m: Record<string, number> = {};
    for (const j of jobs) {
      if (j.id && typeof j.matchScore === 'number' && !Number.isNaN(j.matchScore)) {
        m[j.id] = j.matchScore;
      }
    }
    return m;
  }, [jobs]);

  const [drawerJob, setDrawerJob] = useState<JobDetailsDrawerJob | null>(null);
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);

  const openJobDrawer = useCallback(
    async (job: JobMatchResult) => {
      const jobId = String(job.id || '').trim();
      if (!jobId) return;
      setDrawerJob(
        mapApiRecordToJobDetailsDrawerJob(
          {
            id: jobId,
            title: job.title,
            client: job.client,
            status: job.status,
            city: job.city,
            location: job.city,
            jobType: job.jobType,
            description: job.description,
            requirements: job.requirements,
            salaryMin: job.salaryMin,
            salaryMax: job.salaryMax,
            openDate: job.jobOpenDate,
          } as Record<string, unknown>,
          { jobId, jobTitle: job.title, client: job.client },
        ),
      );
      setIsJobDrawerOpen(true);
      if (!apiBase) return;
      try {
        const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`, {
          headers: authHeaders(true),
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const raw = (data?.job ?? data) as Record<string, unknown>;
        if (raw && typeof raw === 'object') {
          setDrawerJob(
            mapApiRecordToJobDetailsDrawerJob(raw, {
              jobId,
              jobTitle: job.title,
              client: job.client,
            }),
          );
        }
      } catch {
        /* keep stub from match row */
      }
    },
    [apiBase],
  );

  // ── filters ──
  const [advancedFilters, setAdvancedFilters] = useState({
    score: 0,
    vectorMin: 0,
    maxDistanceKm: null as number | null,
    jobType: 'הכל',
    status: 'הכל',
    client: 'הכל',
    city: 'הכל',
  });

  // ─── load ──────────────────────────────────────────────────────────────────

  const loadJobsCore = useCallback(async (append = false) => {
    if (!candidateId || matchesInFlightRef.current) return;
    matchesInFlightRef.current = true;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    const offset = append ? nextOffsetRef.current : 0;
    try {
      const page = await fetchJobMatchesPage(candidateId, {
        limit: batchSize,
        offset,
        minScore: threshold,
        useVector: vectorSimilarity,
        hardFilters: toScanHardFilters(activeFilters),
        affinityLevel,
      });
      nextOffsetRef.current = page.nextOffset;
      setMatchCursor({ nextOffset: page.nextOffset, hasMore: page.hasMore, total: page.total });
      setJobs((prev) => {
        if (!append) return page.rows;
        const seen = new Set(prev.map((job) => job.id));
        return [...prev, ...page.rows.filter((job) => !seen.has(job.id))];
      });
      if (!append) {
        const linked = new Set<string>(
          page.rows.filter((j) => j.matchType === 'application' && j.jobCandidateId).map((j) => j.id),
        );
        setAssignedJobs(linked);
      } else {
        setAssignedJobs((prev) => {
          const next = new Set(prev);
          page.rows.forEach((j) => {
            if (j.matchType === 'application' && j.jobCandidateId) next.add(j.id);
          });
          return next;
        });
      }
    } catch (e) {
      setError((e as Error).message || 'שגיאה בטעינת ההתאמות');
    } finally {
      matchesInFlightRef.current = false;
      setLoading(false);
    }
  }, [candidateId, batchSize, threshold, vectorSimilarity, activeFilters, affinityLevel]);

  const refreshJobs = useCallback(() => {
    void loadJobsCore();
  }, [loadJobsCore]);

  useEffect(() => {
    setJobs([]);
    setHasSearched(false);
    setError(null);
    setMatchCursor({ nextOffset: 0, hasMore: false, total: 0 });
    nextOffsetRef.current = 0;
  }, [candidateId]);

  const toggleFilter = (key: string) => {
    if (key === 'affinity') return;
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const refreshIgnoreList = useCallback(async () => {
    if (!candidateId) {
      setIgnoreItems([]);
      setIgnoreCount(0);
      return;
    }
    setIgnoreLoading(true);
    try {
      const data = await fetchJobMatchIgnores(candidateId);
      setIgnoreItems(data.items);
      setIgnoreCount(data.count);
    } catch {
      setIgnoreItems([]);
      setIgnoreCount(0);
    } finally {
      setIgnoreLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void refreshIgnoreList();
  }, [refreshIgnoreList]);

  useEffect(() => {
    if (!ignoreOpen) return;
    void refreshIgnoreList();
  }, [ignoreOpen, refreshIgnoreList]);

  useEffect(() => {
    if (!ignoreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ignorePanelRef.current && !ignorePanelRef.current.contains(e.target as Node)) {
        setIgnoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [ignoreOpen]);

  useEffect(() => {
    Promise.all([fetchClientOptions(), fetchCityOptions()]).then(([clients, cities]) => {
      setClientOptions(clients);
      setCityOptions(cities);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!candidateId) {
      setCandidateRecord(null);
      return;
    }
    let cancelled = false;
    fetchCandidate(candidateId)
      .then((row) => {
        if (!cancelled) setCandidateRecord(row);
      })
      .catch(() => {
        if (!cancelled) setCandidateRecord({ id: candidateId });
      });
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  useMatchScorePopupDismiss(Boolean(activeMatchPopup), () => setActiveMatchPopup(null));

  const openMatchPopup = (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (activeMatchPopup?.id === jobId) {
      setActiveMatchPopup(null);
      return;
    }
    setActiveMatchPopup({ id: jobId, ...matchScorePopupPositionFromEvent(e) });
  };

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

  const runAddToFilter = useCallback(
    async (jobIds: string[], options?: JobFilterSaveOptions) => {
      const cid = String(candidateId || '').trim();
      const jids = jobIds.map((id) => String(id).trim()).filter(Boolean);
      if (!cid || !apiBase || jids.length === 0) {
        setBulkFilterOpen(false);
        return;
      }
      const { ok, fail } = await linkCandidatesToJobFilters(apiBase, [cid], jids, options);
      setBulkFilterOpen(false);
      if (fail === 0) {
        setFeedback(
          jids.length > 1 ? `נוסף לסינון ב-${jids.length} משרות` : 'המועמד נוסף לסינון המשרה',
        );
        setTimeout(() => setFeedback(null), 4000);
      } else if (ok === 0) {
        setAssignError('הוספה לסינון נכשלה');
        setTimeout(() => setAssignError(null), 4000);
      } else {
        setFeedback(`נוסף לסינון: ${ok} מתוך ${jids.length} משרות`);
        setTimeout(() => setFeedback(null), 4000);
      }
    },
    [apiBase, candidateId],
  );

  const handleAddToFilterSave = useCallback(
    async (jobIds: string[], options?: JobFilterSaveOptions) => {
      const cid = String(candidateId || '').trim();
      const jids = jobIds.map((id) => String(id).trim()).filter(Boolean);
      if (!cid || !apiBase || jids.length === 0) {
        setBulkFilterOpen(false);
        return;
      }
      const agg = await fetchScreeningPrecheckForJobs(apiBase, [cid], jids);
      if (agg.length > 0) {
        pendingFilterRef.current = { jobIds: jids, options };
        setScreeningCollisionAgg(agg);
        setScreeningCollisionOpen(true);
        return;
      }
      await runAddToFilter(jids, options);
    },
    [apiBase, candidateId, runAddToFilter],
  );

  const handleIgnoreJob = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    if (!candidateId || !jobId) return;
    setIgnoringId(jobId);
    setFeedback(null);
    setAssignError(null);
    try {
      await ignoreJobMatch(candidateId, jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      setIgnoreCount((c) => c + 1);
      setFeedback('המשרה הוסרה לרשימה השחורה.');
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setAssignError((err as Error).message || 'לא הצלחנו להסיר את המשרה');
      setTimeout(() => setAssignError(null), 4000);
    } finally {
      setIgnoringId(null);
    }
  };

  const handleRestoreIgnore = async (jobId: string) => {
    if (!candidateId || !jobId) return;
    setRestoringId(jobId);
    setFeedback(null);
    try {
      await clearJobMatchIgnore(candidateId, jobId);
      setIgnoreItems((prev) => {
        const next = prev.filter((i) => i.jobId !== jobId);
        if (next.length === 0) setIgnoreOpen(false);
        return next;
      });
      setIgnoreCount((c) => Math.max(0, c - 1));
      setFeedback('המשרה הוחזרה מהרשימה השחורה. לחץ רענן כדי לראות אותה בתוצאות.');
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setAssignError((err as Error).message || 'לא הצלחנו להחזיר מהרשימה השחורה');
      setTimeout(() => setAssignError(null), 4000);
    } finally {
      setRestoringId(null);
    }
  };

  const handleRecalculateMatch = async (jobId: string) => {
    setRecalculatingId(jobId);
    try {
      // Re-fetch only this job's score by reloading all (backend is fast with cache)
      const rows = await fetchJobMatches(candidateId, {
        limit: batchSize,
        minScore: threshold,
        useVector: vectorSimilarity,
        hardFilters: toScanHardFilters(activeFilters),
        affinityLevel,
      });
      setJobs(rows);
    } catch {
      // silently ignore
    } finally {
      setRecalculatingId(null);
      setActiveMatchPopup(null);
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
    console.info('[JobMatchingView] field selected:', selectedField.role);
  };

  const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAdvancedFilters((prev) => {
      if (name === 'score' || name === 'vectorMin') return { ...prev, [name]: Number(value) };
      if (name === 'maxDistanceKm') {
        if (value.trim() === '') return { ...prev, maxDistanceKm: null };
        const n = Number(value);
        return { ...prev, maxDistanceKm: Number.isFinite(n) && n >= 0 ? n : prev.maxDistanceKm };
      }
      return { ...prev, [name]: value };
    });
  };

  const handleResetAdvancedFilters = () => {
    setAdvancedFilters({
      score: 0,
      vectorMin: 0,
      maxDistanceKm: null,
      jobType: 'הכל',
      status: 'הכל',
      client: 'הכל',
      city: 'הכל',
    });
  };

  // ─── filtering (local) ─────────────────────────────────────────────────────

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((j) => !searchTerm || j.title.toLowerCase().includes(searchTerm.toLowerCase()) || j.client.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter((j) => j.matchScore >= advancedFilters.score)
      .filter((j) => {
        if (advancedFilters.vectorMin <= 0) return true;
        const vector = jobVectorPct(j);
        return vector != null && vector >= advancedFilters.vectorMin;
      })
      .filter((j) => {
        if (advancedFilters.maxDistanceKm == null) return true;
        const km = jobDistanceKm(j);
        return km != null && km <= advancedFilters.maxDistanceKm;
      })
      .filter((j) => advancedFilters.jobType === 'הכל' || j.jobType.includes(advancedFilters.jobType))
      .filter((j) => advancedFilters.status === 'הכל' || j.status === advancedFilters.status)
      .filter((j) => advancedFilters.client === 'הכל' || j.client === advancedFilters.client)
      .filter((j) => advancedFilters.city === 'הכל' || j.city === advancedFilters.city);
  }, [jobs, searchTerm, advancedFilters]);

  const sortedJobs = useMemo(() => {
    if (!sortKey) return filteredJobs;
    const dir = sortDir === 'asc' ? 1 : -1;
    const numeric = sortKey === 'match' || sortKey === 'vector' || sortKey === 'distance';
    return [...filteredJobs].sort((a, b) => {
      let cmp = 0;
      if (numeric) {
        const valueOf = (job: JobMatchResult) =>
          sortKey === 'match' ? job.matchScore : sortKey === 'vector' ? jobVectorPct(job) : jobDistanceKm(job);
        const av = valueOf(a);
        const bv = valueOf(b);
        if (av == null && bv == null) cmp = 0;
        else if (av == null) return 1;
        else if (bv == null) return -1;
        else cmp = av - bv;
      } else {
        const av = sortKey === 'title' ? a.title : sortKey === 'status' ? a.status : a.city;
        const bv = sortKey === 'title' ? b.title : sortKey === 'status' ? b.status : b.city;
        cmp = String(av || '').localeCompare(String(bv || ''), 'he');
      }
      if (cmp !== 0) return cmp * dir;
      return a.title.localeCompare(b.title, 'he');
    });
  }, [filteredJobs, sortKey, sortDir]);

  const toggleMatchSort = (key: 'title' | 'match' | 'vector' | 'distance' | 'status' | 'city') => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'distance' || key === 'title' || key === 'status' || key === 'city' ? 'asc' : 'desc');
  };

  const passedCount = filteredJobs.filter((j) => j.requirementsMet).length;

  const activeMatchJob = activeMatchPopup ? filteredJobs.find((j) => j.id === activeMatchPopup.id) : null;

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

  const IgnoreButton: React.FC<{ job: JobMatchResult; size?: 'sm' | 'md' }> = ({ job, size = 'md' }) => {
    const busy = ignoringId === job.id;
    const px = size === 'sm' ? 'py-1 px-3 text-xs' : 'py-2 px-4 text-sm';
    return (
      <button
        type="button"
        onClick={(e) => void handleIgnoreJob(e, job.id)}
        disabled={busy}
        className={`border border-border-default bg-bg-card text-text-muted hover:text-red-600 hover:border-red-200 hover:bg-red-50 font-semibold ${px} rounded-lg transition flex items-center gap-1.5 disabled:opacity-50`}
        title="הסר מתוצאות ההתאמה"
      >
        <XMarkIcon className="w-4 h-4" />
        {busy ? 'מסיר…' : 'הסר'}
      </button>
    );
  };

  // ─── match summary line ──────────────────────────────────────────────────

  const MatchSummaryLine: React.FC<{ job: JobMatchResult }> = ({ job }) => {
    type Dot = { label: string; value: string; ok: boolean; muted?: boolean };
    const pm = job.parameterMatches;

    const scoreOk = job.matchScore >= 70;
    const vectorPct = vectorLayerPctFromBreakdown(job.scoreBreakdown);
    const vectorOk = vectorPct != null ? vectorPct >= 70 : scoreOk;

    const rawGeoKm = job.scoreBreakdown?.geoDistance;
    const geoKm =
      typeof rawGeoKm === 'number' && Number.isFinite(rawGeoKm) ? Math.round(rawGeoKm) : null;

    const map: {
      key: keyof typeof pm;
      label: string;
      matchLabel: string;
      mismatchLabel: string;
      missingLabel: string;
    }[] = [
      { key: 'salary', label: 'ציפיות שכר', matchLabel: 'תואם', mismatchLabel: 'פער בשכר', missingLabel: 'מידע חסר' },
      { key: 'scope', label: 'שעות משרה', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
      { key: 'work_hours', label: 'שעות עבודה', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
      { key: 'availability', label: 'זמינות', matchLabel: 'תואם', mismatchLabel: 'לא מתאים', missingLabel: 'מידע חסר' },
      { key: 'mobility', label: 'ניידות', matchLabel: 'בסדר', mismatchLabel: 'נדרש רכב', missingLabel: 'מידע חסר' },
      { key: 'license', label: 'רישיון נהיגה', matchLabel: 'יש רישיון', mismatchLabel: 'נדרש רישיון', missingLabel: 'מידע חסר' },
      { key: 'age', label: 'גיל', matchLabel: 'מתאים', mismatchLabel: 'לא בטווח גיל', missingLabel: 'מידע חסר' },
      { key: 'gender', label: 'מגדר', matchLabel: 'מתאים', mismatchLabel: 'מגבלת מגדר', missingLabel: 'מידע חסר' },
      { key: 'mandatory_skill', label: 'מיומנות חובה', matchLabel: 'יש', mismatchLabel: 'חסרה', missingLabel: 'מידע חסר' },
      { key: 'mandatory_language', label: 'שפה חובה', matchLabel: 'יש', mismatchLabel: 'חסרה', missingLabel: 'מידע חסר' },
    ];

    const items: Dot[] = [
      {
        label: 'התאמה וקטורית',
        value: vectorPct != null ? `${vectorPct}%` : '—',
        ok: vectorOk,
        muted: vectorPct == null,
      },
      ...(job.city ? [{ label: 'מיקום', value: job.city, ok: true }] : []),
      {
        label: 'מרחק מן היעד',
        value: geoKm != null ? `${geoKm} ק"מ` : 'לא זמין',
        ok: geoKm != null,
        muted: geoKm == null,
      },
      ...map.flatMap(({ key, label, matchLabel, mismatchLabel, missingLabel }) => {
        const v = pm?.[key];
        if (v === 'match') return [{ label, value: matchLabel, ok: true }];
        if (v === 'missing') return [{ label, value: missingLabel, ok: false }];
        if (v === 'mismatch' || v === 'gap') return [{ label, value: mismatchLabel, ok: false }];
        return [];
      }),
    ];

    return (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                item.muted ? 'bg-gray-400' : item.ok ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="text-[11px] text-text-muted">{item.label}:</span>
            <span
              className={`text-[11px] font-bold ${
                item.muted ? 'text-text-muted' : item.ok ? 'text-text-default' : 'text-red-700'
              }`}
            >
              {item.value}
            </span>
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
                type="button"
                data-match-score-trigger
                onClick={(e) => openMatchPopup(e, job.id)}
                className="font-extrabold text-3xl text-text-default"
              >
                {recalculatingId === job.id ? '...' : `${job.matchScore}%`}
              </button>
              <p className={`text-xs font-semibold ${job.requirementsMet ? 'text-emerald-600' : 'text-red-600'}`}>
                {job.requirementsMet ? 'עבר תנאי סף' : 'לא עומד בדרישות'}
              </p>
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => void openJobDrawer(job)}
                className="font-bold text-text-default text-base text-right hover:text-primary-600 hover:underline transition-colors"
                title="פתיחת פרטי משרה"
              >
                {job.title}
              </button>
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
            <IgnoreButton job={job} />
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
    const vectorPct = jobVectorPct(job);
    const distanceKm = jobDistanceKm(job);
    return (
      <>
        <tr onClick={toggleExpand} className="bg-bg-card hover:bg-bg-hover transition-colors cursor-pointer">
          <td className="p-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void openJobDrawer(job);
              }}
              className="font-bold text-text-default text-base text-right hover:text-primary-600 hover:underline transition-colors block w-full"
              title="פתיחת פרטי משרה"
            >
              {job.title}
            </button>
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
                type="button"
                data-match-score-trigger
                onClick={(e) => openMatchPopup(e, job.id)}
                className="flex items-center gap-2 cursor-pointer w-full"
              >
                <div className="w-16">
                  {recalculatingId === job.id
                    ? <div className="w-full flex items-center justify-center h-2"><svg className="animate-spin h-4 w-4 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg></div>
                    : <MatchProgressBar score={job.matchScore} />}
                </div>
                <span className="font-bold text-text-default">{recalculatingId === job.id ? '' : `${job.matchScore}%`}</span>
              </button>
            </div>
          </td>
          <td className="p-4 text-sm font-semibold text-text-default">
            {vectorPct != null ? `${vectorPct}%` : '—'}
          </td>
          <td className="p-4 text-sm text-text-default">
            {distanceKm != null ? `${Math.round(distanceKm)} ק״מ` : '—'}
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
              <IgnoreButton job={job} size="sm" />
              <AssignButton job={job} size="sm" />
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr className="bg-bg-subtle/50">
            <td colSpan={7}><JobMatchDetails job={job} /></td>
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
      {feedback && (
        <div className="mb-2 rounded-lg border border-accent-200 bg-accent-50 text-accent-900 px-4 py-2 text-sm font-semibold">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
      <main className="lg:col-span-8 flex-1 overflow-y-auto space-y-4 min-h-0">
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
              onClick={refreshJobs}
              disabled={loading}
              className="flex items-center gap-2 bg-primary-100/70 text-primary-700 font-semibold py-2 px-4 rounded-lg hover:bg-primary-200 transition disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>רענן</span>
            </button>
            <div className="relative" ref={ignorePanelRef}>
              <button
                type="button"
                onClick={() => setIgnoreOpen((v) => !v)}
                className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-lg border transition ${
                  ignoreCount > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                    : 'bg-bg-subtle border-border-default text-text-muted hover:text-text-default'
                }`}
                aria-expanded={ignoreOpen}
                title="משרות שהוסרו מהתאמות למועמד זה"
              >
                <NoSymbolIcon className="w-4 h-4" />
                <span>רשימה שחורה ({ignoreCount})</span>
              </button>
              {ignoreOpen && (
                <div className="absolute top-full start-0 mt-2 z-30 w-80 max-h-72 overflow-y-auto bg-bg-card border border-border-default rounded-xl shadow-xl p-3 text-start">
                  <p className="text-xs font-bold text-text-default mb-2">משרות ברשימה השחורה</p>
                  {ignoreLoading ? (
                    <p className="text-xs text-text-muted">טוען…</p>
                  ) : ignoreItems.length === 0 ? (
                    <p className="text-xs text-text-muted">אין משרות ברשימה</p>
                  ) : (
                    <ul className="space-y-2">
                      {ignoreItems.map((entry) => (
                        <li
                          key={entry.jobId}
                          className="flex items-start justify-between gap-2 text-xs border-b border-border-subtle pb-2 last:border-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-text-default truncate">{entry.title || 'משרה'}</p>
                            {entry.client && <p className="text-text-muted truncate">{entry.client}</p>}
                            {entry.city && <p className="text-text-muted truncate">{entry.city}</p>}
                          </div>
                          <button
                            type="button"
                            disabled={restoringId === entry.jobId}
                            onClick={() => void handleRestoreIgnore(entry.jobId)}
                            className="shrink-0 text-[10px] font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap disabled:opacity-50"
                          >
                            החזר לתוצאות
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBulkFilterOpen(true)}
              disabled={!candidateId}
              className="flex items-center gap-2 font-semibold py-2 px-4 rounded-lg border border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FunnelIcon className="w-4 h-4" />
              <span>הוספת לסינון</span>
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
                    ציון התאמה מינימלי: <span className="text-primary-600 font-bold">{advancedFilters.score}%</span>
                  </label>
                  <input type="range" min="0" max="100" name="score" value={advancedFilters.score} onChange={handleAdvancedFilterChange} className="w-full accent-primary-500" />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    התאמה וקטורית מינימלית: <span className="text-primary-600 font-bold">{advancedFilters.vectorMin}%</span>
                  </label>
                  <input type="range" min="0" max="100" name="vectorMin" value={advancedFilters.vectorMin} onChange={handleAdvancedFilterChange} className="w-full accent-primary-500" />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-xs font-semibold text-text-muted mb-1">מרחק מקסימלי (ק״מ)</label>
                  <input
                    type="number"
                    min="0"
                    name="maxDistanceKm"
                    value={advancedFilters.maxDistanceKm ?? ''}
                    onChange={handleAdvancedFilterChange}
                    placeholder="ללא הגבלה"
                    className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500"
                  />
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
            <button onClick={refreshJobs} className="text-red-600 font-semibold underline text-xs">נסה שוב</button>
          </div>
        )}

        {/* Job List */}
        {!loading && !error && filteredJobs.length > 0 && (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {sortedJobs.map((job) => <JobCard key={job.id} job={job} />)}
            </div>
          ) : (
            <div className="bg-bg-card rounded-lg border border-border-default">
              <table className="w-full text-sm text-right">
                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                  <tr>
                    {([
                      ['title', 'משרה'],
                      ['match', 'ציון התאמה'],
                      ['vector', 'התאמה וקטורית'],
                      ['distance', 'מרחק מהיעד'],
                      ['status', 'סטטוס'],
                      ['city', 'מיקום'],
                    ] as const).map(([key, label]) => {
                      const active = sortKey === key;
                      return (
                        <th key={key} className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => toggleMatchSort(key)}
                            className={`inline-flex items-center gap-1 uppercase ${active ? 'text-primary-700' : 'hover:text-text-default'}`}
                            aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                          >
                            <span>{label}</span>
                            {active && sortDir === 'asc' ? (
                              <ChevronUpIcon className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDownIcon className={`w-3.5 h-3.5 ${active ? '' : 'opacity-40'}`} />
                            )}
                          </button>
                        </th>
                      );
                    })}
                    <th className="p-4 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {sortedJobs.map((job) => <JobRow key={job.id} job={job} />)}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Empty state */}
        {!loading && !error && !hasSearched && (
          <div className="text-center py-16 flex flex-col items-center">
            <TargetIcon className="w-16 h-16 text-text-subtle mb-4" />
            <h3 className="text-xl font-bold text-text-default">ההתאמה לא רצה עדיין</h3>
            <p className="mt-2 text-text-muted">כוונן את הגדרות הסריקה ולחץ «חפש משרות».</p>
          </div>
        )}
        {!loading && !error && hasSearched && filteredJobs.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center">
            <TargetIcon className="w-16 h-16 text-text-subtle mb-4" />
            <h3 className="text-xl font-bold text-text-default">לא נמצאו משרות מתאימות</h3>
            <p className="mt-2 text-text-muted">נסה להרחיב את החיפוש או לשנות את הקריטריונים.</p>
          </div>
        )}
        {hasSearched && matchCursor.hasMore && (
          <div className="flex justify-center pt-2">
      
          </div>
        )}
      </main>

      <aside className="lg:col-span-4 bg-bg-card border-2 border-border-default rounded-[2rem] p-6 shadow-xl shadow-primary-900/5 space-y-6 h-fit sticky top-0">
        <ScanSettingsPanel
          batchSize={batchSize}
          onBatchSizeChange={setBatchSize}
          threshold={threshold}
          onThresholdChange={setThreshold}
          vectorSimilarity={vectorSimilarity}
          onVectorSimilarityChange={setVectorSimilarity}
          activeFilters={activeFilters}
          onToggleFilter={toggleFilter}
          affinityLevel={affinityLevel}
          onAffinityLevelChange={setAffinityLevel}
          loading={loading}
          batchCountLabel={t('job.matching.batch_display', { count: batchSize })}
          searchLabel={t('job.matching.search')}
          onSearch={() => void loadJobsCore()}
          searchDisabled={!candidateId}
        />
      </aside>
      </div>

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

      <BulkAddToFilterModal
        isOpen={bulkFilterOpen}
        onClose={() => setBulkFilterOpen(false)}
        onSave={handleAddToFilterSave}
        selectedCount={1}
        jobs={bulkFilterJobOptions}
        matchScoresByJobId={bulkFilterMatchScoresByJobId}
        candidateBackendIds={candidateId ? [candidateId] : []}
        candidateDisplayName={candidateName}
      />
      <ScreeningCollisionWarningModal
        isOpen={screeningCollisionOpen}
        onClose={() => {
          setScreeningCollisionOpen(false);
          pendingFilterRef.current = null;
        }}
        aggregate={screeningCollisionAgg}
        onConfirm={() => {
          const p = pendingFilterRef.current;
          pendingFilterRef.current = null;
          setScreeningCollisionOpen(false);
          if (p) void runAddToFilter(p.jobIds, p.options);
        }}
      />

      <JobDetailsDrawer
        job={drawerJob}
        isOpen={isJobDrawerOpen}
        onClose={() => {
          setIsJobDrawerOpen(false);
          setDrawerJob(null);
        }}
        overlayZIndexClass="z-[80]"
      />

      {activeMatchPopup && activeMatchJob ? (
        <MatchScorePopup
          position={{ x: activeMatchPopup.x, y: activeMatchPopup.y }}
          onClose={() => setActiveMatchPopup(null)}
          matchScore={activeMatchJob.matchScore}
          jobTitle={activeMatchJob.title}
          scoreBreakdown={(activeMatchJob.scoreBreakdown as MatchScoreBreakdownData | null) ?? null}
          parameterMatches={activeMatchJob.parameterMatches}
          job={activeMatchJob as unknown as Record<string, unknown>}
          candidate={candidateRecord || { id: candidateId }}
          candidateName={candidateName}
          candidateTitle={
            typeof candidateRecord?.title === 'string'
              ? candidateRecord.title
              : typeof candidateRecord?.currentTitle === 'string'
                ? candidateRecord.currentTitle
                : null
          }
          professionalSummary={
            typeof candidateRecord?.professionalSummary === 'string'
              ? candidateRecord.professionalSummary
              : activeMatchJob.description || null
          }
        />
      ) : null}
    </div>
  );
};

export default JobMatchingView;
