const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
  return h;
}

async function parseErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    return j.message || res.statusText || 'Request failed';
  } catch {
    return res.statusText || 'Request failed';
  }
}

export type ExecutePipelineOutcomeParams = {
  pipelineKind: 'client' | 'candidate';
  clientId: string;
  pipelineId: string;
  stageId: string;
  outcomeId: string;
  context?: {
    jobCandidateId?: string;
    clientEventId?: string;
    candidateId?: string;
  };
  source?: 'manual' | 'system_event';
  /** Optional journal row title/comment from the UI draft before commit. */
  historyTitle?: string;
  historyComment?: string;
};

export type AutomationResultItem = {
  automationId: string;
  status: string;
  actionType?: string | null;
  templateId?: string | null;
  statusName?: string | null;
  channel?: string;
  reason?: string;
  message?: string;
};

export type ExecutePipelineOutcomeResult = {
  outcome: { id: string; name: string; actionType: string };
  actionResult: Record<string, unknown>;
  automationResults: AutomationResultItem[];
};

export type ApprovePipelineAutomationsParams = ExecutePipelineOutcomeParams & {
  automationIds: string[];
};

export async function executePipelineOutcome(
  params: ExecutePipelineOutcomeParams,
): Promise<ExecutePipelineOutcomeResult> {
  const res = await fetch(`${apiBase()}/api/pipeline-outcomes/execute`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as ExecutePipelineOutcomeResult;
}

export async function approvePipelineAutomations(
  params: ApprovePipelineAutomationsParams,
): Promise<{ automationResults: AutomationResultItem[] }> {
  const res = await fetch(`${apiBase()}/api/pipeline-outcomes/approve-automations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return (await res.json()) as { automationResults: AutomationResultItem[] };
}
