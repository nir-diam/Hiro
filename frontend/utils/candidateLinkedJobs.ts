import React from 'react';
import {
  CheckCircleIcon,
  CalendarIcon,
  NoSymbolIcon,
  ArrowUturnLeftIcon,
  ArchiveBoxIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
  CheckBadgeIcon,
} from '../components/Icons';

export type LinkedJobApiRow = {
  jobCandidateId: string;
  jobId: string;
  status?: string | null;
  source?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  job: Record<string, unknown>;
  workflowMeta?: Record<string, unknown>;
  matchScore?: number | null;
  scoreBreakdown?: Record<string, unknown> | null;
};

export type CandidateJobLink = {
  linkId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  location: string;
  lastUpdated: string;
  status: string;
  internalNote: string;
  dueDate: string;
  dueTime: string;
  inviteCandidate: boolean;
  inviteClient: boolean;
  clientId?: string;
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function mapLinkedJobRow(row: LinkedJobApiRow): CandidateJobLink {
  const job = row.job || {};
  const wm =
    row.workflowMeta && typeof row.workflowMeta === 'object' && !Array.isArray(row.workflowMeta)
      ? row.workflowMeta
      : {};
  const title = String(job.title || job.publicJobTitle || '').trim() || '—';
  const city = String(job.city || '').trim();
  const loc = String(job.location || '').trim();
  const location = [city, loc].filter(Boolean).join(', ') || '—';
  const updatedRaw = row.updatedAt || row.createdAt;
  const lastUpdated = updatedRaw
    ? new Date(updatedRaw).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  return {
    linkId: row.jobCandidateId,
    jobId: row.jobId != null ? String(row.jobId) : '',
    jobTitle: title,
    company: String(job.client || '').trim() || '—',
    location,
    lastUpdated,
    status: String(row.status || 'חדש').trim() || 'חדש',
    internalNote: wm.internalNote != null ? String(wm.internalNote) : '',
    dueDate: wm.dueDate != null ? String(wm.dueDate) : '',
    dueTime: wm.dueTime != null ? String(wm.dueTime) : '',
    inviteCandidate: Boolean(wm.inviteCandidate),
    inviteClient: Boolean(wm.inviteClient),
    clientId:
      job.clientId != null
        ? String(job.clientId)
        : job.client_id != null
          ? String(job.client_id)
          : undefined,
  };
}

type StatusStyle = { bg: string; text: string; icon: React.ReactElement<{ className?: string }> };

const STATUS_STYLES: Record<string, StatusStyle> = {
  חדש: { bg: 'bg-sky-100', text: 'text-sky-800', icon: React.createElement(InformationCircleIcon, { className: 'w-3.5 h-3.5' }) },
  פעיל: { bg: 'bg-accent-100', text: 'text-accent-800', icon: React.createElement(CheckCircleIcon, { className: 'w-3.5 h-3.5' }) },
  'הוזמן לראיון': {
    bg: 'bg-secondary-100',
    text: 'text-secondary-800',
    icon: React.createElement(CalendarIcon, { className: 'w-3.5 h-3.5' }),
  },
  'הועבר ללקוח': {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: React.createElement(PaperAirplaneIcon, { className: 'w-3.5 h-3.5' }),
  },
  התקבל: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: React.createElement(CheckBadgeIcon, { className: 'w-3.5 h-3.5' }),
  },
  'לא רלוונטי': {
    bg: 'bg-gray-200',
    text: 'text-gray-700',
    icon: React.createElement(NoSymbolIcon, { className: 'w-3.5 h-3.5' }),
  },
  'מועמד משך עניין': {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: React.createElement(ArrowUturnLeftIcon, { className: 'w-3.5 h-3.5' }),
  },
  בארכיון: {
    bg: 'bg-bg-card border border-border-default',
    text: 'text-text-muted',
    icon: React.createElement(ArchiveBoxIcon, { className: 'w-3.5 h-3.5' }),
  },
};

export function getJobStatusStyle(status: string): StatusStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES['חדש'];
}

export async function fetchCandidateLinkedJobs(candidateId: string): Promise<CandidateJobLink[]> {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  if (!apiBase || !candidateId) return [];
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(candidateId)}/linked-jobs`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('טעינת תהליכים נכשלה');
  const rows: unknown = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapLinkedJobRow(r as LinkedJobApiRow));
}

export async function patchCandidateJobLinkStatus(
  linkId: string,
  payload: {
    status: string;
    internalNote?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    inviteCandidate?: boolean;
    inviteClient?: boolean;
    forceAppendStatus?: boolean;
  },
): Promise<void> {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!apiBase || !token) throw new Error('לא מחובר');
  const res = await fetch(`${apiBase}/api/candidates/linked-jobs/${encodeURIComponent(linkId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      status: payload.status,
      internalNote: payload.internalNote ?? '',
      dueDate: payload.dueDate ?? null,
      dueTime: payload.dueTime ?? null,
      inviteCandidate: Boolean(payload.inviteCandidate),
      inviteClient: Boolean(payload.inviteClient),
      forceAppendStatus: payload.forceAppendStatus === true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'שמירת סטטוס נכשלה');
  }
}

export type ProcessJournalUpdate = {
  id: string;
  title: string;
  date: string;
  creator: string;
  comment?: string;
};

export type ProcessJournalEntry = {
  id: string;
  title: string;
  status: string;
  description: string;
  date: string;
  creator: string;
  dueDate: string | null;
  dueTime: string | null;
  isActive?: boolean;
  tags: string[];
  updates: ProcessJournalUpdate[];
};

export type ProcessJournalResponse = {
  jobCandidateId: string;
  candidateId: string;
  jobId: string;
  clientId?: string | null;
  currentStatus: string;
  workflowMeta: {
    internalNote: string;
    dueDate: string;
    dueTime: string;
    inviteCandidate: boolean;
    inviteClient: boolean;
  };
  entries: ProcessJournalEntry[];
};

export async function fetchJobLinkProcessJournal(linkId: string): Promise<ProcessJournalResponse> {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (!apiBase || !token) throw new Error('לא מחובר');
  const res = await fetch(`${apiBase}/api/candidates/linked-jobs/${encodeURIComponent(linkId)}/process-journal`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'טעינת יומן תהליך נכשלה');
  }
  return (await res.json()) as ProcessJournalResponse;
}

export async function patchJobLinkProcessJournalEntry(
  linkId: string,
  entryId: string,
  payload: {
    title?: string;
    description?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    nextStageTitle?: string;
    creator?: string | null;
    isActive?: boolean;
    updates?: ProcessJournalUpdate[];
  },
): Promise<ProcessJournalResponse> {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!apiBase || !token) throw new Error('לא מחובר');
  const res = await fetch(
    `${apiBase}/api/candidates/linked-jobs/${encodeURIComponent(linkId)}/process-journal/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'עדכון האירוע נכשל');
  }
  return (await res.json()) as ProcessJournalResponse;
}
