import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { XMarkIcon, ClockIcon } from './Icons';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import JobDetailsDrawer from './JobDetailsDrawer';
import ClientDetailsDrawer from './ClientDetailsDrawer';
import { useAuth } from '../context/AuthContext';
import {
  type CandidateJobLink,
  fetchJobLinkProcessJournal,
} from '../utils/candidateLinkedJobs';
import {
  buildCandidateDrawerStub,
  buildClientDrawerStub,
  buildJobDrawerStub,
  hydrateClientForDrawer,
  hydrateJobForDrawer,
  type JobDrawerJob,
} from '../utils/processEntityDrawers';
import type { Client } from './ClientsListView';
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
  const [clientDrawer, setClientDrawer] = useState<Client | null>(null);
  const [jobDrawer, setJobDrawer] = useState<JobDrawerJob | null>(null);
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(false);
  const [isClientDrawerOpen, setIsClientDrawerOpen] = useState(false);
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
    const jobCompany =
      localJob.company && localJob.company !== '—' ? String(localJob.company).trim() : '';

    const resolveOrganizationForTenant = async (): Promise<{ id: string; name: string } | null> => {
      if (!tenantClientId || !jobCompany || !apiBase) return null;
      try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const res = await fetch(
          `${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/linked-organizations`,
          {
            headers: {
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            cache: 'no-store',
          },
        );
        if (!res.ok) return null;
        const rows = await res.json();
        const list = Array.isArray(rows) ? rows : rows?.data ?? [];
        const companyN = jobCompany.toLowerCase();
        for (const raw of list) {
          const org = (raw.organization && typeof raw.organization === 'object')
            ? raw.organization
            : raw;
          const orgId = raw.organizationId ? String(raw.organizationId) : '';
          const orgName = String(org?.name || raw.name || '').trim();
          if (!orgId || !orgName) continue;
          const orgNameN = orgName.toLowerCase();
          if (
            orgNameN === companyN
            || orgNameN.includes(companyN)
            || companyN.includes(orgNameN)
          ) {
            return { id: orgId, name: orgName };
          }
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    const applyResolvedOrganization = (match: { id: string; name: string } | null) => {
      if (!match) return;
      setResolvedOrganizationId(match.id);
      setResolvedOrganizationName(match.name);
    };

    const direct =
      (clientIdProp && String(clientIdProp).trim()) ||
      (localJob.clientId && String(localJob.clientId).trim()) ||
      (job.clientId && String(job.clientId).trim()) ||
      '';

    if (direct) {
      setResolvedClientId(direct);
      setClientIdLoading(false);
      if (tenantClientId && direct === tenantClientId && jobCompany) {
        void resolveOrganizationForTenant().then(applyResolvedOrganization);
      }
      return;
    }

    if (!localJob.linkId) {
      if (tenantClientId && jobCompany) {
        setClientIdLoading(true);
        void resolveOrganizationForTenant()
          .then((match) => {
            applyResolvedOrganization(match);
            if (tenantClientId) setResolvedClientId(tenantClientId);
          })
          .finally(() => setClientIdLoading(false));
      } else {
        setResolvedClientId('');
        setClientIdLoading(false);
      }
      return;
    }

    let cancelled = false;
    setClientIdLoading(true);
    void (async () => {
      try {
        const journal = await fetchJobLinkProcessJournal(localJob.linkId);
        if (cancelled) return;

        let resolved = journal.clientId ? String(journal.clientId).trim() : '';

        if (!resolved && journal.jobId && apiBase) {
          try {
            const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
            const jobRes = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(String(journal.jobId))}`, {
              headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              cache: 'no-store',
            });
            if (jobRes.ok) {
              const jobRow = (await jobRes.json()) as { clientId?: string | null; client_id?: string | null };
              resolved =
                (jobRow.clientId != null && String(jobRow.clientId).trim()) ||
                (jobRow.client_id != null && String(jobRow.client_id).trim()) ||
                '';
            }
          } catch {
            /* keep journal-only resolution */
          }
        }

        if (!resolved && tenantClientId) {
          resolved = tenantClientId;
        }

        let orgMatch: { id: string; name: string } | null = null;
        if (tenantClientId && resolved === tenantClientId && jobCompany) {
          orgMatch = await resolveOrganizationForTenant();
        }

        setResolvedClientId(resolved);
        applyResolvedOrganization(orgMatch);
        if (resolved) {
          setLocalJob((prev) => (prev.clientId ? prev : { ...prev, clientId: resolved }));
        }
      } catch {
        if (!cancelled) {
          setResolvedClientId(tenantClientId || '');
          setResolvedOrganizationId('');
          setResolvedOrganizationName('');
        }
      } finally {
        if (!cancelled) setClientIdLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, clientIdProp, user?.clientId, localJob.linkId, localJob.clientId, localJob.company, job.clientId, apiBase]);

  const clientId = resolvedClientId;
  const organizationId = resolvedOrganizationId;
  const jobCompanyLabel =
    (localJob.company && localJob.company !== '—' ? localJob.company : null)
    || resolvedOrganizationName
    || null;

  const clientOptions = useMemo(
    () =>
      clientId
        ? [
            {
              id: clientId,
              name: jobCompanyLabel || 'לקוח',
              ...(organizationId ? { organizationId } : {}),
            },
          ]
        : [],
    [clientId, jobCompanyLabel, organizationId],
  );

  const openCandidateDrawer = useCallback(() => {
    setCandidateDrawer(buildCandidateDrawerStub(candidateId, candidateName));
    setIsCandidateDrawerOpen(true);
  }, [candidateId, candidateName]);

  const openClientDrawer = useCallback(async () => {
    if (!clientId) return;
    const name = localJob.company && localJob.company !== '—' ? localJob.company : 'לקוח';
    setClientDrawer(buildClientDrawerStub(clientId, name));
    setIsClientDrawerOpen(true);
    const hydrated = await hydrateClientForDrawer(apiBase, clientId);
    if (hydrated) setClientDrawer(hydrated);
  }, [apiBase, clientId, localJob.company]);

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

  const companyLabel = localJob.company && localJob.company !== '—' ? localJob.company : null;
  const jobTitleLabel = localJob.jobTitle && localJob.jobTitle !== '—' ? localJob.jobTitle : null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-bg-card w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <header className="p-5 border-b border-border-default flex items-center justify-between bg-white relative z-10 shrink-0">
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
                  {clientId ? (
                    <button
                      type="button"
                      onClick={() => void openClientDrawer()}
                      className="hover:text-primary-700 hover:underline transition-colors"
                      title="פתח דראוור לקוח"
                    >
                      {companyLabel}
                    </button>
                  ) : (
                    <span>{companyLabel}</span>
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
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted p-8">
              טוען יומן אירועים...
            </div>
          ) : localJob.linkId ? (
            <ClientsEventsJournalTab
              clientOptions={clientOptions}
              defaultClientId={clientId || null}
              defaultOrganizationId={organizationId || null}
              defaultOrganizationName={jobCompanyLabel}
              scopeOrganizationId={organizationId || null}
              scopeOrganizationName={jobCompanyLabel}
              scopeCandidateId={candidateId}
              scopeContactName={candidateName}
              scopeJobId={localJob.jobId}
              scopeJobLinkId={localJob.linkId}
              scopeJobTitle={localJob.jobTitle}
              scopeJobCompany={localJob.company}
              embeddedInModal
              defaultActionPipelineId={candidatePipelineId}
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
      <ClientDetailsDrawer
        client={clientDrawer}
        isOpen={isClientDrawerOpen && Boolean(clientDrawer)}
        onClose={() => setIsClientDrawerOpen(false)}
        overlayZIndexClass="z-[80]"
      />
      <JobDetailsDrawer
        job={jobDrawer}
        isOpen={isJobDrawerOpen && Boolean(jobDrawer)}
        onClose={() => setIsJobDrawerOpen(false)}
        overlayZIndexClass="z-[80]"
      />
    </div>
  );
};

export default CandidateProcessManagementModal;
