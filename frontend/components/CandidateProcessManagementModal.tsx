import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { XMarkIcon, ClockIcon } from './Icons';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import { useAuth } from '../context/AuthContext';
import {
  type CandidateJobLink,
  fetchJobLinkProcessJournal,
} from '../utils/candidateLinkedJobs';

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
  const clientId =
    (clientIdProp && String(clientIdProp).trim()) ||
    (user?.clientId && String(user.clientId).trim()) ||
    '';

  const [localJob, setLocalJob] = useState(job);

  useEffect(() => {
    setLocalJob(job);
  }, [job]);

  const clientOptions = useMemo(
    () =>
      clientId
        ? [
            {
              id: clientId,
              name:
                localJob.company && localJob.company !== '—'
                  ? localJob.company
                  : 'לקוח',
            },
          ]
        : [],
    [clientId, localJob.company],
  );

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
        lastUpdated: new Date().toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      };
      setLocalJob(updated);
      onJobUpdated(updated);
    } catch {
      // keep current job state if sync fails
    }
  }, [localJob, onJobUpdated]);

  useEffect(() => {
    if (!isOpen) return;
    const onStageMoved = (ev: Event) => {
      const detail = (ev as CustomEvent<{ candidateId?: string; pipelineId?: string; stageId?: string; stageName?: string }>)
        .detail;
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

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-bg-card w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        <header className="p-5 border-b border-border-default flex items-center justify-between bg-white relative z-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-text-default flex items-center gap-2">
              <ClockIcon className="w-6 h-6 text-primary-600" />
              ניהול תהליכים — {candidateName}
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              {localJob.jobTitle} · {localJob.company}
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
          {clientId ? (
            <ClientsEventsJournalTab
              clientOptions={clientOptions}
              defaultClientId={clientId}
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
              לא ניתן לטעון יומן אירועים — חסר מזהה לקוח.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CandidateProcessManagementModal;
