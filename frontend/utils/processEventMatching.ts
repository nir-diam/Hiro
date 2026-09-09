import { processNameMatchesPipeline } from './processManagementCatalog';

export type ProcessJournalEventLike = {
  id: string;
  processId?: string | null;
  process?: string;
  contactId?: string | null;
  contactName?: string | null;
  organizationId?: string | null;
  clientName?: string;
  title?: string;
  description?: string;
  creator?: string;
  date?: string;
  isActive?: boolean;
};

export const mapRawProcessJournalEvent = (raw: Record<string, unknown>): ProcessJournalEventLike => ({
  id: String(raw.id || ''),
  processId: raw.processId != null ? String(raw.processId) : null,
  process: String(raw.process || ''),
  contactId: raw.contactId != null ? String(raw.contactId) : null,
  contactName: raw.contactName != null ? String(raw.contactName) : null,
  organizationId: raw.organizationId != null ? String(raw.organizationId) : null,
  clientName: String(raw.clientName || ''),
  title: String(raw.title || ''),
  description: String(raw.description || ''),
  creator: String(raw.creator || raw.coordinator || ''),
  date: String(raw.date || raw.createdAt || ''),
  isActive: raw.isActive !== false,
});

export const eventMatchesContact = (
  event: ProcessJournalEventLike,
  contactId?: string | null,
  contactName?: string | null,
  candidateId?: string | null,
): boolean => {
  if (candidateId) {
    const meta = (event as { metadata?: Record<string, unknown> }).metadata;
    if (meta?.candidateId != null && String(meta.candidateId) === String(candidateId)) return true;
    if (event.contactId && String(event.contactId) === String(candidateId)) return true;
  }
  if (!contactId && !contactName && !candidateId) return true;
  if (contactId && event.contactId && String(event.contactId) === String(contactId)) return true;
  if (contactName && event.contactName && String(event.contactName).includes(contactName)) return true;
  if (contactName) {
    const blob = `${event.title || ''} ${event.description || ''} ${event.creator || ''}`;
    if (blob.includes(contactName)) return true;
  }
  return false;
};

export const eventMatchesOrganization = (
  event: ProcessJournalEventLike,
  organizationId?: string | null,
  organizationName?: string | null,
): boolean => {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return true;
  if (String(event.organizationId || '') === orgId) return true;

  const orgName = String(organizationName || '').trim().toLowerCase();
  if (!orgName) return false;

  const linkedName = String(event.contactName || event.clientName || '').trim().toLowerCase();
  if (
    linkedName
    && (linkedName === orgName || linkedName.includes(orgName) || orgName.includes(linkedName))
  ) {
    return true;
  }

  const blob = `${event.title || ''} ${event.description || ''} ${event.process || ''}`.toLowerCase();
  return blob.includes(orgName);
};

const pickBestProcessEvent = (rows: ProcessJournalEventLike[]): ProcessJournalEventLike | null => {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
  return sorted.find((e) => e.isActive !== false) || sorted[0];
};

type PipelineNameLookup = { id: string; name?: string };

export const findProcessEventForPipeline = (
  events: ProcessJournalEventLike[],
  pipelineId: string,
  pipelines: PipelineNameLookup[],
  scopeContactId?: string | null,
  scopeContactName?: string | null,
  scopeCandidateId?: string | null,
  scopeOrganizationId?: string | null,
  scopeOrganizationName?: string | null,
): ProcessJournalEventLike | null => {
  const pid = String(pipelineId || '').trim();
  if (!pid) return null;

  const scoped = events.filter((event) => {
    if (!eventMatchesContact(event, scopeContactId, scopeContactName, scopeCandidateId)) return false;
    if (
      scopeOrganizationId
      && !scopeContactId
      && !scopeCandidateId
      && !eventMatchesOrganization(event, scopeOrganizationId, scopeOrganizationName)
    ) {
      return false;
    }
    return true;
  });

  const byProcessId = scoped.filter((event) => String(event.processId || '') === pid);
  const byIdMatch = pickBestProcessEvent(byProcessId);
  if (byIdMatch) return byIdMatch;

  const pipeline = pipelines.find((p) => p.id === pid);
  const pipelineName = String(pipeline?.name || '').trim().toLowerCase();
  if (!pipelineName) return null;

  const byName = scoped.filter((event) => {
    const proc = String(event.process || '').trim().toLowerCase();
    return processNameMatchesPipeline(proc, pipelineName);
  });
  return pickBestProcessEvent(byName);
};

export const processRowHasJournalEvent = (
  events: ProcessJournalEventLike[],
  row: {
    kind: 'contact' | 'organization';
    pipelineId: string;
    name: string;
    organizationId?: string | null;
    contact?: { id: string; name: string; organizationId?: string | null };
  },
  pipelines: PipelineNameLookup[],
): boolean =>
  Boolean(
    findProcessEventForPipeline(
      events,
      row.pipelineId,
      pipelines,
      row.kind === 'contact' ? row.contact?.id : null,
      row.kind === 'contact' ? row.contact?.name || row.name : null,
      null,
      row.kind === 'organization' ? row.organizationId : row.contact?.organizationId,
      row.kind === 'organization' ? row.name : null,
    ),
  );
