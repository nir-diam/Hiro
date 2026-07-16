
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartBarIcon,
  PencilIcon as PencilSquareIcon,
  ClipboardDocumentIcon,
  FunnelIcon,
  LinkIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import type { Candidate } from './CandidatesListView';
import {
  buildDuplicateJobSeed,
  buildDuplicatePublicationSeed,
  formatRecruitmentSourceLabel,
} from '../utils/duplicateJob';
import { fetchJobPublication } from '../services/publishingApi';

const SidebarCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <div className="bg-bg-card rounded-xl border border-border-default shadow-sm">
    <div className="flex items-center justify-between p-4 border-b border-border-default">
      <div className="flex items-center gap-3">
        <div className="bg-primary-100 text-primary-600 p-2 rounded-lg">{icon}</div>
        <h3 className="font-bold text-text-default">{title}</h3>
      </div>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const InsightItem: React.FC<{ label: string; count: number; onClick?: () => void }> = ({
  label,
  count,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center justify-between w-full text-sm font-semibold text-text-default hover:bg-primary-50 p-2 rounded-lg transition-colors group"
  >
    <span className="text-right truncate">{label}</span>
    <span className="font-bold text-primary-600 bg-primary-100 group-hover:bg-primary-200 px-2 py-0.5 rounded-full transition-colors shrink-0">
      {count}
    </span>
  </button>
);

type JobSidebarJob = {
  id?: string;
  status: string;
  openDate: string;
  associatedCandidates?: number;
  [key: string]: unknown;
};

type JobCandidateRow = {
  id: string;
  status?: string;
  source?: string;
};

interface JobDetailsSidebarProps {
  job: JobSidebarJob;
  openSummaryDrawer: (candidate: Candidate | number) => void;
  /** Called when live job_candidates list is loaded (for parent stats). */
  onCandidateCountChange?: (count: number) => void;
}

const JobDetailsSidebar: React.FC<JobDetailsSidebarProps> = ({ job, onCandidateCountChange }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [candidates, setCandidates] = useState<JobCandidateRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const openDate = new Date(job.openDate);
  const today = new Date();
  const diffTime = Math.max(0, today.getTime() - (Number.isNaN(openDate.getTime()) ? today.getTime() : openDate.getTime()));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  useEffect(() => {
    const jobId = job?.id ? String(job.id) : '';
    if (!apiBase || !jobId) {
      setCandidates([]);
      onCandidateCountChange?.(0);
      return;
    }
    let active = true;
    setSourcesLoading(true);
    (async () => {
      try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/candidates`, { headers });
        if (!res.ok) throw new Error('Failed to load candidates');
        const payload = await res.json();
        if (!active) return;
        const list = Array.isArray(payload.candidates) ? payload.candidates : [];
        setCandidates(list);
        onCandidateCountChange?.(list.length);
      } catch {
        if (active) {
          setCandidates([]);
          onCandidateCountChange?.(0);
        }
      } finally {
        if (active) setSourcesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [apiBase, job?.id, onCandidateCountChange]);

  const totalCandidates = candidates.length;

  const funnelStats = useMemo(() => {
    const newCandidates = candidates.filter((c) => c.status === 'חדש').length;
    const advancedProcess = candidates.filter((c) =>
      ['סינון טלפוני', 'ראיון', 'הצעה'].includes(String(c.status || '')),
    ).length;
    const rejected = candidates.filter((c) => c.status === 'נדחה').length;
    const cvSent = candidates.filter((c) =>
      ['קו״ח נשלחו', 'קו"ח נשלחו', 'CV Sent', 'קוח נשלחו'].includes(String(c.status || '')),
    ).length;
    return { newCandidates, advancedProcess, rejected, cvSent };
  }, [candidates]);

  const sourceRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      const label = formatRecruitmentSourceLabel(c.source);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'he'));
  }, [candidates]);

  const handleDuplicateJob = async () => {
    const jobId = job?.id ? String(job.id) : '';
    if (!jobId) return;
    setDuplicateError(null);
    setIsDuplicating(true);
    try {
      let publicationSeed = null;
      try {
        const pub = await fetchJobPublication(jobId);
        publicationSeed = buildDuplicatePublicationSeed(pub);
      } catch {
        publicationSeed = null;
      }
      navigate('/jobs/new', {
        state: {
          duplicateJob: buildDuplicateJobSeed(job as Record<string, unknown>),
          duplicatePublication: publicationSeed,
          duplicateFromJobId: jobId,
        },
      });
    } catch (err: unknown) {
      setDuplicateError(err instanceof Error ? err.message : 'שכפול המשרה נכשל');
    } finally {
      setIsDuplicating(false);
    }
  };

  const statusLabel = (() => {
    const key = `status.${job.status}`;
    const translated = t(key);
    return translated === key ? job.status : translated;
  })();

  return (
    <div className="space-y-6">
      <SidebarCard title={t('job_sidebar.quick_stats')} icon={<ChartBarIcon className="w-5 h-5" />}>
        <div className="grid grid-cols-2 gap-y-4 text-sm">
          <div className="font-semibold text-text-muted">{t('job_sidebar.status')}</div>
          <div>
            <span
              className={`font-bold px-2 py-0.5 rounded-full ${
                job.status === 'פתוחה' || job.status === 'Open'
                  ? 'text-green-600 bg-green-100'
                  : 'text-text-default bg-bg-subtle'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="font-semibold text-text-muted">{t('job_sidebar.total_candidates')}</div>
          <div className="font-bold text-text-default">{totalCandidates}</div>

          <div className="font-semibold text-text-muted">{t('job_sidebar.open_for')}</div>
          <div className="font-bold text-text-default">
            {diffDays} {t('job_sidebar.days')}
          </div>

          <div className="font-semibold text-text-muted">{t('job_sidebar.open_date')}</div>
          <div className="font-bold text-text-default">
            {Number.isNaN(openDate.getTime()) ? '—' : openDate.toLocaleDateString('he-IL')}
          </div>
        </div>
      </SidebarCard>

      <SidebarCard title={t('job_sidebar.funnel')} icon={<FunnelIcon className="w-5 h-5" />}>
        <div className="space-y-1">
          <InsightItem label={t('job_sidebar.new_candidates')} count={funnelStats.newCandidates} />
          <InsightItem label={t('job_sidebar.advanced_process')} count={funnelStats.advancedProcess} />
          <InsightItem label={t('job_sidebar.cv_sent')} count={funnelStats.cvSent} />
          <InsightItem label={t('job_sidebar.rejected')} count={funnelStats.rejected} />
        </div>
      </SidebarCard>

      <SidebarCard title={t('job_sidebar.sources')} icon={<LinkIcon className="w-5 h-5" />}>
        <div className="space-y-1">
          {sourcesLoading && (
            <p className="text-xs text-text-muted p-2">{t('job_sidebar.sources_loading')}</p>
          )}
          {!sourcesLoading && sourceRows.length === 0 && (
            <p className="text-xs text-text-subtle italic p-2">{t('job_sidebar.sources_empty')}</p>
          )}
          {!sourcesLoading &&
            sourceRows.map((row) => <InsightItem key={row.label} label={row.label} count={row.count} />)}
        </div>
      </SidebarCard>

      <SidebarCard title={t('job_sidebar.quick_actions')} icon={<PencilSquareIcon className="w-5 h-5" />}>
        <ul className="space-y-3">
          <li>
            <button
              type="button"
              onClick={() => void handleDuplicateJob()}
              disabled={isDuplicating || !job?.id}
              className="flex items-center gap-3 text-sm font-semibold text-text-default hover:text-primary-600 transition-colors disabled:opacity-50"
            >
              <span className="text-primary-500">
                <ClipboardDocumentIcon className="w-5 h-5" />
              </span>
              {isDuplicating ? t('job_sidebar.duplicating') : t('job_sidebar.duplicate')}
            </button>
          </li>
        </ul>
        {duplicateError && <p className="text-xs text-red-600 mt-2">{duplicateError}</p>}
      </SidebarCard>
    </div>
  );
};

export default JobDetailsSidebar;
