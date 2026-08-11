import React, { useCallback, useEffect, useState } from 'react';
import { PlusIcon } from './Icons';
import JobDetailsDrawer from './JobDetailsDrawer';
import { Job } from './JobsView';
import CandidateProcessManagementModal from './CandidateProcessManagementModal';
import {
  type CandidateJobLink,
  type LinkedJobApiRow,
  fetchCandidateLinkedJobs,
  getJobStatusStyle,
} from '../utils/candidateLinkedJobs';
import JobFieldSelector, { type SelectedJobField } from './JobFieldSelector';
import FieldInterestJobPickerModal, { type FieldInterestPreviewJob } from './FieldInterestJobPickerModal';
import { useLanguage } from '../context/LanguageContext';

function buildFieldInterestBody(selection: SelectedJobField, extra?: Record<string, unknown>) {
  return {
    category: selection.category,
    fieldType: selection.fieldType,
    role: selection.role,
    categoryId: selection.categoryId,
    clusterId: selection.clusterId,
    roleId: selection.roleId,
    ...extra,
  };
}

interface CandidateProcessesPanelProps {
  candidateId: string;
  candidateName: string;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  onOpenNewTask?: () => void;
  clientId?: string | null;
  candidatePipelineId?: string | null;
  pipelineStageId?: string | null;
  initialManageLinkId?: string;
  onPipelineStageChanged?: (pipelineId: string, stageId: string, stageName: string) => void;
}

const CandidateProcessesPanel: React.FC<CandidateProcessesPanelProps> = ({
  candidateId,
  candidateName,
  clientId,
  candidatePipelineId,
  pipelineStageId,
  initialManageLinkId,
  onPipelineStageChanged,
}) => {
  const { t } = useLanguage();
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [jobs, setJobs] = useState<CandidateJobLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manageJob, setManageJob] = useState<CandidateJobLink | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
  const [fieldInterestSaving, setFieldInterestSaving] = useState(false);
  const [fieldInterestPreview, setFieldInterestPreview] = useState<{
    selection: SelectedJobField;
    jobs: FieldInterestPreviewJob[];
  } | null>(null);
  const [jobCatalog, setJobCatalog] = useState<Job[]>([]);

  const fieldInterestAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const reload = useCallback(async () => {
    if (!candidateId) {
      setJobs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCandidateLinkedJobs(candidateId);
      setJobs(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!initialManageLinkId || jobs.length === 0) return;
    const match = jobs.find((job) => job.linkId === initialManageLinkId);
    if (match) setManageJob(match);
  }, [initialManageLinkId, jobs]);

  useEffect(() => {
    if (!apiBase) return;
    let active = true;
    void fetch(`${apiBase}/api/jobs`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (active) setJobCatalog(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setJobCatalog([]);
      });
    return () => {
      active = false;
    };
  }, [apiBase]);

  const handleOpenProcess = (link: CandidateJobLink) => {
    setManageJob(link);
  };

  const buildFallbackJob = (link: CandidateJobLink): Job =>
    ({
      id: 0,
      title: link.jobTitle,
      client: link.company,
      field: '',
      role: '',
      priority: 'רגילה',
      clientType: 'כללי',
      city: link.location,
      region: 'לא צויין',
      gender: 'לא משנה',
      mobility: false,
      licenseType: 'לא צויין',
      postingCode: link.jobId || '',
      validityDays: 30,
      recruitingCoordinator: 'מערכת',
      accountManager: 'מערכת',
      salaryMin: 0,
      salaryMax: 0,
      ageMin: 18,
      ageMax: 65,
      openPositions: 1,
      status: 'טיוטה',
      associatedCandidates: 0,
      waitingForScreening: 0,
      activeProcess: 0,
      openDate: new Date().toISOString(),
      recruiter: 'מערכת',
      location: link.location,
      jobType: 'לא צויין',
      description: '',
      requirements: [],
      rating: 0,
      healthProfile: 'standard',
    }) as Job;

  const handleOpenJob = (link: CandidateJobLink) => {
    if (!link.jobId) return;
    const fromCatalog = jobCatalog.find((j) => String(j.id) === String(link.jobId));
    if (fromCatalog) {
      setSelectedJob(fromCatalog);
      setIsDrawerOpen(true);
      return;
    }
    const byTitle = jobCatalog.find((j) => j.title === link.jobTitle);
    setSelectedJob(byTitle || buildFallbackJob(link));
    setIsDrawerOpen(true);
  };

  const commitFieldInterest = useCallback(
    async (selection: SelectedJobField, jobIds?: string[]) => {
      if (!apiBase || !candidateId) throw new Error('לא נבחר מועמד');
      const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(candidateId)}/field-interest`, {
        method: 'POST',
        credentials: 'include',
        headers: fieldInterestAuthHeaders(),
        body: JSON.stringify(buildFieldInterestBody(selection, jobIds !== undefined ? { jobIds } : {})),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { message?: string }).message || 'שמירת התעניינות נכשלה');
      }
      await reload();
    },
    [apiBase, candidateId, fieldInterestAuthHeaders, reload],
  );

  const handleFieldSelected = async (selectedField: SelectedJobField | null) => {
    if (!selectedField) {
      setIsJobFieldSelectorOpen(false);
      return;
    }
    if (!apiBase || !candidateId) {
      setError(t('interested_jobs.no_candidate') || 'לא נבחר מועמד');
      setIsJobFieldSelectorOpen(false);
      return;
    }
    setFieldInterestSaving(true);
    setError(null);
    try {
      const previewRes = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(candidateId)}/field-interest`, {
        method: 'POST',
        credentials: 'include',
        headers: fieldInterestAuthHeaders(),
        body: JSON.stringify(buildFieldInterestBody(selectedField, { preview: true })),
      });
      if (!previewRes.ok) {
        const errBody = await previewRes.json().catch(() => ({}));
        throw new Error((errBody as { message?: string }).message || 'טעינת משרות מתאימות נכשלה');
      }
      const previewPayload = (await previewRes.json()) as { jobs?: LinkedJobApiRow[] };
      const previewJobs = (Array.isArray(previewPayload.jobs) ? previewPayload.jobs : []).filter(
        (row) => row.jobId != null && String(row.jobId).trim() !== '',
      );
      if (previewJobs.length === 0) {
        await commitFieldInterest(selectedField);
        setIsJobFieldSelectorOpen(false);
        return;
      }
      setFieldInterestPreview({
        selection: selectedField,
        jobs: previewJobs.map((row) => ({
          jobId: String(row.jobId),
          matchScore: row.matchScore,
          job: row.job as FieldInterestPreviewJob['job'],
        })),
      });
      setIsJobFieldSelectorOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה');
      setIsJobFieldSelectorOpen(false);
    } finally {
      setFieldInterestSaving(false);
    }
  };

  const handleFieldInterestPickerConfirm = async (selectedJobIds: string[]) => {
    if (!fieldInterestPreview) return;
    setFieldInterestSaving(true);
    setError(null);
    try {
      await commitFieldInterest(fieldInterestPreview.selection, selectedJobIds);
      setFieldInterestPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה');
    } finally {
      setFieldInterestSaving(false);
    }
  };

  const countLabel = jobs.length === 1 ? 'משרה אחת' : `${jobs.length} משרות`;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-text-default">תהליכים פעילים והפניות</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted">{countLabel}</span>
          <button
            type="button"
            onClick={() => setIsJobFieldSelectorOpen(true)}
            className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:underline"
            title={t('interested_jobs.add_interest') || 'הוסף התעניינות'}
          >
            <PlusIcon className="w-4 h-4" />
            הוסף
          </button>
        </div>
      </div>

      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      ) : null}

      {loading ? (
        <div className="text-sm text-text-muted py-6 text-center">טוען תהליכים...</div>
      ) : jobs.length === 0 ? (
        <div className="text-sm text-text-muted bg-bg-subtle/70 border border-border-default rounded-xl p-6 text-center">
          אין תהליכים פעילים. לחץ על &quot;הוסף&quot; כדי לשייך משרה למועמד.
        </div>
      ) : (
        jobs.map((job) => {
          const { bg, text, icon } = getJobStatusStyle(job.status);
          return (
            <div
              key={job.linkId}
              className="bg-bg-card border border-border-default shadow-sm p-4 rounded-xl"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <button
                    type="button"
                    onClick={() => handleOpenProcess(job)}
                    className="font-bold text-primary-700 text-base hover:underline cursor-pointer text-right"
                  >
                    {job.jobTitle}
                  </button>
                  <p className="text-sm text-text-muted font-semibold">{job.company}</p>
                </div>
                <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${bg} ${text} border-transparent`}>
                  {icon}
                  <span>{job.status}</span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-text-muted mt-3 pt-3 border-t border-border-subtle">
                <span>עודכן: {job.lastUpdated}</span>
                <button
                  type="button"
                  onClick={() => handleOpenProcess(job)}
                  className="text-primary-600 hover:underline font-semibold"
                >
                  ניהול תהליך
                </button>
              </div>
            </div>
          );
        })
      )}

      {manageJob ? (
        <CandidateProcessManagementModal
          isOpen={Boolean(manageJob)}
          onClose={() => setManageJob(null)}
          candidateId={candidateId}
          candidateName={candidateName}
          job={manageJob}
          clientId={clientId}
          candidatePipelineId={candidatePipelineId}
          pipelineStageId={pipelineStageId}
          onPipelineStageChanged={onPipelineStageChanged}
          onJobUpdated={(updated) => {
            setJobs((prev) => prev.map((j) => (j.linkId === updated.linkId ? updated : j)));
            setManageJob(updated);
          }}
        />
      ) : null}

      <JobDetailsDrawer job={selectedJob} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      <JobFieldSelector
        value={null}
        onChange={handleFieldSelected}
        isModalOpen={isJobFieldSelectorOpen}
        setIsModalOpen={setIsJobFieldSelectorOpen}
      />

      <FieldInterestJobPickerModal
        isOpen={fieldInterestPreview != null}
        roleLabel={
          fieldInterestPreview
            ? `${fieldInterestPreview.selection.category} › ${fieldInterestPreview.selection.role}`
            : ''
        }
        jobs={fieldInterestPreview?.jobs ?? []}
        saving={fieldInterestSaving}
        onClose={() => {
          if (!fieldInterestSaving) setFieldInterestPreview(null);
        }}
        onConfirm={handleFieldInterestPickerConfirm}
        labels={{
          title: t('interested_jobs.picker_title'),
          subtitle: t('interested_jobs.picker_subtitle'),
          colJob: t('interested_jobs.col_jobTitle'),
          colCompany: t('interested_jobs.col_company'),
          colLocation: t('interested_jobs.col_location'),
          colMatch: t('interested_jobs.col_matchScore'),
          selectAll: t('interested_jobs.picker_select_all'),
          clearAll: t('interested_jobs.picker_clear_all'),
          cancel: t('interested_jobs.picker_cancel'),
          confirm: t('interested_jobs.picker_confirm'),
          confirmCount: t('interested_jobs.picker_selected_count'),
          empty: t('interested_jobs.picker_empty'),
        }}
      />
    </div>
  );
};

export default CandidateProcessesPanel;
