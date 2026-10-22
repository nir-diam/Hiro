import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { XMarkIcon, ClockIcon } from './Icons';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import JobDetailsDrawer from './JobDetailsDrawer';
import OrganizationPreviewDrawer from './OrganizationPreviewDrawer';
import { useAuth } from '../context/AuthContext';
import {
  type CandidateJobLink,
  fetchJobLinkProcessJournal,
} from '../utils/candidateLinkedJobs';
import {
  buildCandidateDrawerStub,
  buildJobDrawerStub,
  hydrateJobForDrawer,
  type JobDrawerJob,
} from '../utils/processEntityDrawers';
import type { Candidate } from './CandidatesListView';

export type ProcessModalJob = CandidateJobLink;

interface CandidateProcessManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  job: ProcessModalJob;
  onJobUpdated: (job: ProcessModalJob) => void;
  clientId?: string | null;
  candidatePipelineId?: string | null;
  pipelineStageId?: string | null;
  onPipelineStageChanged?: (pipelineId: string, stageId: string, stageName: string) => void;
}

const CandidateProcessManagementModal: React.FC<CandidateProcessManagementModalProps> = ({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  job,
  onJobUpdated,
  clientId: clientIdProp,
  candidatePipelineId,
  pipelineStageId,
  onPipelineStageChanged,
}) => {
  const { user } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const [localJob, setLocalJob] = useState(job);
  const [resolvedClientId, setResolvedClientId] = useState('');
  const [resolvedOrganizationId, setResolvedOrganizationId] = useState('');
  const [resolvedOrganizationName, setResolvedOrganizationName] = useState('');
  const [clientIdLoading, setClientIdLoading] = useState(false);

  const [candidateDrawer, setCandidateDrawer] = useState<Candidate | null>(null);
  const [jobDrawer, setJobDrawer] = useState<JobDrawerJob | null>(null);
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(false);
  const [isOrgDrawerOpen, setIsOrgDrawerOpen] = useState(false);
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);

  useEffect(() => {
    setLocalJob(job);
  }, [job]);

  useEffect(() => {
    if (!isOpen) {
      setResolvedClientId('');
      setResolvedOrganizationId('');
      setResolvedOrganizationName('');
      setClientIdLoading(false);
      return;
    }

    const tenantClientId = user?.clientId ? String(user.clientId).trim() : '';
    const direct =
      (clientIdProp && String(clientIdProp).trim()) ||
      (localJob.clientId && String(localJob.clientId).trim()) ||
      (job.clientId && String(job.clientId).trim()) ||
      tenantClientId;
    const orgId = String(localJob.organizationId || '').trim();
    const orgName = localJob.company && localJob.company !== '—' ? localJob.company : '';

    setResolvedClientId(direct);
    setResolvedOrganizationId(orgId);
    setResolvedOrganizationName(orgName);
    setClientIdLoading(false);
  }, [
    isOpen,
    clientIdProp,
    user?.clientId,
    localJob.clientId,
    localJob.organizationId,
    localJob.company,
    job.clientId,
  ]);

  const knownClientId = String(
    clientIdProp || localJob.clientId || job.clientId || user?.clientId || '',
  ).trim();
  const clientId = resolvedClientId || knownClientId;
  const organizationId =
    resolvedOrganizationId || String(localJob.organizationId || '').trim();
  const companyFromJob = localJob.company && localJob.company !== '—' ? localJob.company : '';
  const organizationLabel = resolvedOrganizationName || companyFromJob || null;

  const defaultActionPipelineIdForJournal = candidatePipelineId ?? null;
  const defaultProcessStageIdForJournal = pipelineStageId ?? null;

  const clientOptions = useMemo(
    () =>
      clientId
        ? [
            {
              id: clientId,
              name: organizationLabel || 'לקוח',
              ...(organizationId && organizationLabel ? { organizationId } : {}),
            },
          ]
        : [],
    [clientId, organizationLabel, organizationId],
  );

  const openCandidateDrawer = useCallback(() => {
    setCandidateDrawer(buildCandidateDrawerStub(candidateId, candidateName));
    setIsCandidateDrawerOpen(true);
  }, [candidateId, candidateName]);

  const openOrganizationDrawer = useCallback(() => {
    if (!organizationId || !organizationLabel) return;
    setIsOrgDrawerOpen(true);
  }, [organizationId, organizationLabel]);

  const openJobDrawer = useCallback(async () => {
    const jobId = String(localJob.jobId || '').trim();
    if (!jobId) return;
    const title = String(localJob.jobTitle || '').trim() || 'משרה';
    const company = localJob.company && localJob.company !== '—' ? localJob.company : '';
    setJobDrawer(buildJobDrawerStub(jobId, title, company));
    setIsJobDrawerOpen(true);
    const hydrated = await hydrateJobForDrawer(apiBase, jobId, title, company);
    setJobDrawer(hydrated);
  }, [apiBase, localJob.jobId, localJob.jobTitle, localJob.company]);

  const syncJobFromJournal = useCallback(async () => {
    if (!localJob.linkId) return;
    try {
      const refreshed = await fetchJobLinkProcessJournal(localJob.linkId);
      const updated: ProcessModalJob = {
        ...localJob,
        status: refreshed.currentStatus || localJob.status,
        internalNote: refreshed.workflowMeta?.internalNote ?? localJob.internalNote,
        dueDate: refreshed.workflowMeta?.dueDate ?? localJob.dueDate,
        dueTime: refreshed.workflowMeta?.dueTime ?? localJob.dueTime,
        inviteCandidate: refreshed.workflowMeta?.inviteCandidate ?? localJob.inviteCandidate,
        inviteClient: refreshed.workflowMeta?.inviteClient ?? localJob.inviteClient,
        clientId: refreshed.clientId ? String(refreshed.clientId) : localJob.clientId,
        lastUpdated: new Date().toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      };
      setLocalJob(updated);
      if (updated.clientId) setResolvedClientId(String(updated.clientId));
      onJobUpdated(updated);
    } catch {
      // keep current job state if sync fails
    }
  }, [localJob, onJobUpdated]);

  useEffect(() => {
    if (!isOpen) return;
    const onStageMoved = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          candidateId?: string;
          pipelineId?: string;
          stageId?: string;
          stageName?: string;
        }>
      ).detail;
      if (!detail?.candidateId || String(detail.candidateId) !== String(candidateId)) return;
      if (detail.pipelineId && detail.stageId) {
        onPipelineStageChanged?.(
          detail.pipelineId,
          detail.stageId,
          String(detail.stageName || '').trim(),
        );
      }
      void syncJobFromJournal();
    };
    window.addEventListener('hiro:candidate-pipeline-stage-moved', onStageMoved);
    return () => window.removeEventListener('hiro:candidate-pipeline-stage-moved', onStageMoved);
  }, [isOpen, candidateId, onPipelineStageChanged, syncJobFromJournal]);

  if (!isOpen) return null;

  const companyLabel = organizationLabel;
  const jobTitleLabel = localJob.jobTitle && localJob.jobTitle !== '—' ? localJob.jobTitle : null;

  return (
    <>
      <style>{`
        .process-modal-scroll .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .process-modal-scroll .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .process-modal-scroll .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .process-modal-scroll .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4 process-modal-scroll">
      <div className="bg-bg-card w-full max-w-6xl h-[90vh] max-h-[900px] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <header className="p-4 md:p-5 border-b border-border-default flex items-start justify-between gap-3 bg-white relative z-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text-default flex items-center gap-2 flex-wrap">
              <ClockIcon className="w-6 h-6 text-primary-600 shrink-0" />
              <span>ניהול תהליכים —</span>
              <button
                type="button"
                onClick={openCandidateDrawer}
                className="text-primary-700 hover:text-primary-800 hover:underline transition-colors"
                title="פתח דראוור מועמד"
              >
                {candidateName}
              </button>
            </h2>
            <p className="text-sm text-text-muted mt-0.5 flex flex-wrap items-center gap-1">
              {jobTitleLabel && localJob.jobId ? (
                <button
                  type="button"
                  onClick={() => void openJobDrawer()}
                  className="text-text-default font-semibold hover:text-primary-700 hover:underline transition-colors"
                  title="פתח דראוור משרה"
                >
                  {jobTitleLabel}
                </button>
              ) : jobTitleLabel ? (
                <span className="text-text-default font-semibold">{jobTitleLabel}</span>
              ) : null}
              {companyLabel ? (
                <>
                  {jobTitleLabel ? <span>·</span> : null}
                  {organizationId && organizationLabel ? (
                    <button
                      type="button"
                      onClick={openOrganizationDrawer}
                      className="hover:text-primary-700 hover:underline transition-colors"
                      title="פתח דראוור חברה"
                    >
                      {organizationLabel}
                    </button>
                  ) : (
                    <span>{organizationLabel}</span>
                  )}
                </>
              ) : null}
              {localJob.status ? (
                <span className="mr-2 text-text-default font-semibold">· {localJob.status}</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors border border-transparent hover:border-border-default"
            aria-label="סגור"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col bg-bg-subtle/30">
          {clientIdLoading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted p-8 overflow-y-auto">
              טוען יומן אירועים...
            </div>
          ) : localJob.linkId ? (
            <ClientsEventsJournalTab
              clientOptions={clientOptions}
              defaultClientId={clientId || null}
              defaultOrganizationId={organizationId || null}
              defaultOrganizationName={organizationLabel}
              scopeOrganizationId={organizationId || null}
              scopeOrganizationName={organizationLabel}
              scopeCandidateId={candidateId}
              scopeContactName={candidateName}
              scopeJobId={localJob.jobId}
              scopeJobLinkId={localJob.linkId}
              scopeJobTitle={localJob.jobTitle}
              scopeJobCompany={localJob.company}
              embeddedInModal
              defaultActionPipelineId={defaultActionPipelineIdForJournal}
              defaultProcessStageId={defaultProcessStageIdForJournal}
              autoSelectFirstEvent
              onEventsChanged={() => void syncJobFromJournal()}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted p-8">
              לא ניתן לטעון יומן אירועים — חסר קישור משרה.
            </div>
          )}
        </div>
      </div>

      <CandidateSummaryDrawer
        candidate={candidateDrawer}
        isOpen={isCandidateDrawerOpen && Boolean(candidateDrawer)}
        onClose={() => setIsCandidateDrawerOpen(false)}
        isFavorite={false}
        onToggleFavorite={() => {}}
        overlayZIndexClass="z-[80]"
      />
      <OrganizationPreviewDrawer
        target={
          organizationId && organizationLabel
            ? { organizationId, name: organizationLabel }
            : null
        }
        isOpen={isOrgDrawerOpen && Boolean(organizationId && organizationLabel)}
        onClose={() => setIsOrgDrawerOpen(false)}
        tenantClientId={user?.clientId ? String(user.clientId) : null}
        overlayZIndexClass="z-[80]"
      />
      <JobDetailsDrawer
        job={jobDrawer}
        isOpen={isJobDrawerOpen && Boolean(jobDrawer)}
        onClose={() => setIsJobDrawerOpen(false)}
        overlayZIndexClass="z-[80]"
      />
    </div>
    </>
  );
};

export default CandidateProcessManagementModal;
