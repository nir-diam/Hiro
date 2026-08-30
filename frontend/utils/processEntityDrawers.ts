import type { Client } from '../components/ClientsListView';
import type { Candidate } from '../components/CandidatesListView';
import { authHeaders } from './authHeaders';

export type JobDrawerJob = {
  id: string | number;
  title: string;
  client: string;
  status: 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה';
  associatedCandidates: number;
  openDate: string;
  recruiter: string;
  location: string;
  jobType: string | string[];
  description: string;
  requirements: string[];
  salaryMin: number;
  salaryMax: number;
};

const JOB_DRAWER_STATUSES = new Set(['פתוחה', 'מוקפאת', 'מאוישת', 'טיוטה']);

export function buildCandidateDrawerStub(candidateId: string, name: string): Candidate {
  return {
    id: 0,
    backendId: candidateId,
    name: name || 'מועמד',
    avatar: '',
    title: '',
    status: '',
    lastActivity: '',
    source: '',
    tags: [],
    internalTags: [],
    matchScore: 0,
    phone: '',
  };
}

export function buildClientDrawerStub(clientId: string, name: string): Client {
  return {
    id: clientId,
    name: name || 'לקוח',
    contactPerson: '',
    phone: '',
    email: '',
    openJobs: 0,
    status: 'פעיל',
    accountManager: '',
    city: '',
    region: '',
    industry: '',
    tier: 'Standard',
    pipelineStage: 'lead',
    pipelineValue: 0,
    lastContactDate: new Date().toISOString(),
    daysSinceLastContact: 0,
    nextScheduledActivity: null,
    activePlacements: 0,
  };
}

export function buildJobDrawerStub(jobId: string, title: string, client = ''): JobDrawerJob {
  return {
    id: jobId,
    title: title || 'משרה',
    client,
    status: 'פתוחה',
    associatedCandidates: 0,
    openDate: new Date().toISOString(),
    recruiter: '',
    location: '',
    jobType: '',
    description: '',
    requirements: [],
    salaryMin: 0,
    salaryMax: 0,
  };
}

function normalizeClientFromApi(raw: Record<string, unknown>): Client {
  const metadata =
    raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const lastContactDate =
    String(metadata.lastContactDate || metadata.lastContact || raw.createdAt || new Date().toISOString());
  const daysSinceLastContact = Math.max(
    0,
    Math.floor((Date.now() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24)),
  );
  return {
    id: String(raw.id || ''),
    name: String(raw.displayName || raw.name || 'לקוח'),
    contactPerson: String(raw.contactPerson || raw.mainContactName || ''),
    phone: String(raw.phone || raw.mainContactPhone || ''),
    email: String(raw.email || raw.mainContactEmail || ''),
    openJobs: Number(raw.openJobs ?? 0),
    status: (raw.status as Client['status']) || (raw.isActive === false ? 'לא פעיל' : 'פעיל'),
    accountManager: String(raw.accountManager || ''),
    city: String(raw.city || ''),
    region: String(raw.region || ''),
    industry: String(raw.industry || ''),
    tier: (metadata.tier as Client['tier']) || 'Standard',
    pipelineStage: String(metadata.pipelineStage || 'lead'),
    pipelineValue: Number(metadata.pipelineValue ?? 0),
    lastContactDate,
    daysSinceLastContact,
    nextScheduledActivity: (metadata.nextScheduledActivity as string | null) || null,
    activePlacements: Number(metadata.activePlacements ?? 0),
    notes: metadata.notes as string | undefined,
    isContactProcess: Boolean(metadata.isContactProcess),
    logo: (raw.logoUrl as string | undefined) || (metadata.logo as string | undefined),
  };
}

export async function hydrateClientForDrawer(apiBase: string, clientId: string): Promise<Client | null> {
  if (!apiBase || !clientId) return null;
  try {
    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw = (json?.data ?? json) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return null;
    return normalizeClientFromApi(raw);
  } catch {
    return null;
  }
}

export async function hydrateJobForDrawer(
  apiBase: string,
  jobId: string,
  title: string,
  client = '',
): Promise<JobDrawerJob> {
  const fallback = buildJobDrawerStub(jobId, title, client);
  if (!apiBase || !jobId) return fallback;
  try {
    const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const raw = (json?.job ?? json) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object') return fallback;
    const statusRaw = String(raw.status || 'פתוחה');
    const status = JOB_DRAWER_STATUSES.has(statusRaw) ? (statusRaw as JobDrawerJob['status']) : 'פתוחה';
    return {
      ...fallback,
      title: String(raw.title || raw.name || title || 'משרה'),
      client: String(raw.client || client || ''),
      status,
      associatedCandidates: Number(raw.associatedCandidates ?? raw.candidateCount ?? 0),
      openDate: String(raw.openDate || raw.createdAt || fallback.openDate),
      recruiter: String(raw.recruiter || ''),
      location: String(raw.location || raw.city || ''),
      jobType: (raw.jobType as string | string[]) || '',
      description: String(raw.description || ''),
      requirements: Array.isArray(raw.requirements) ? (raw.requirements as string[]) : [],
      salaryMin: Number(raw.salaryMin ?? 0),
      salaryMax: Number(raw.salaryMax ?? 0),
    };
  } catch {
    return fallback;
  }
}
