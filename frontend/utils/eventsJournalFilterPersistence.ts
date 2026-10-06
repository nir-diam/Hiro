export type EditorDateRangeFilter = {
  dateFrom: string;
  dateTo: string;
};

export type EventsJournalFiltersSnapshot = {
  version: 1;
  selectedPipelineIds: string[];
  selectedSystemEventIds: string[];
  selectedStageOutcomeKeys: string[];
  selectedStatuses: string[];
  selectedActiveStates: string[];
  selectedCompanies: string[];
  selectedEditors: string[];
  /** Handling coordinator (לטיפול) — managers only */
  selectedHandlingCoordinators: string[];
  editorDateRanges: Record<string, EditorDateRangeFilter>;
  dateFrom: string;
  dateTo: string;
  dateSortOrder: 'asc' | 'desc';
  entitySearchQuery: string;
};

type StorageScope = {
  crossClientJournal?: boolean;
  scopeOrganizationId?: string | null;
  scopeOrganizationTmpId?: string | null;
  scopeContactId?: string | null;
  scopeCandidateId?: string | null;
  scopeJobId?: string | null;
  hideFilters?: boolean;
  embeddedInModal?: boolean;
};

export function buildEventsJournalFilterStorageKey(scope: StorageScope): string | null {
  if (scope.hideFilters || scope.embeddedInModal) return null;
  if (scope.scopeContactId) return `hiro.eventsJournal.filters.contact:${scope.scopeContactId}`;
  if (scope.scopeCandidateId) return `hiro.eventsJournal.filters.candidate:${scope.scopeCandidateId}`;
  if (scope.scopeJobId) return `hiro.eventsJournal.filters.job:${scope.scopeJobId}`;
  if (scope.scopeOrganizationId) return `hiro.eventsJournal.filters.org:${scope.scopeOrganizationId}`;
  if (scope.scopeOrganizationTmpId) {
    return `hiro.eventsJournal.filters.org-tmp:${scope.scopeOrganizationTmpId}`;
  }
  if (scope.crossClientJournal) return 'hiro.eventsJournal.filters.admin-global';
  return 'hiro.eventsJournal.filters.default';
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function parseEditorDateRanges(value: unknown): Record<string, EditorDateRangeFilter> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, EditorDateRangeFilter> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = String(key || '').trim();
    if (!name || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Partial<EditorDateRangeFilter>;
    out[name] = {
      dateFrom: typeof row.dateFrom === 'string' ? row.dateFrom : '',
      dateTo: typeof row.dateTo === 'string' ? row.dateTo : '',
    };
  }
  return out;
}

export function loadEventsJournalFilters(storageKey: string | null): EventsJournalFiltersSnapshot | null {
  if (!storageKey || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<EventsJournalFiltersSnapshot>;
    if (saved.version !== 1) return null;
    const dateSortOrder = saved.dateSortOrder === 'asc' ? 'asc' : 'desc';
    return {
      version: 1,
      selectedPipelineIds: parseStringArray(saved.selectedPipelineIds),
      selectedSystemEventIds: parseStringArray(saved.selectedSystemEventIds),
      selectedStageOutcomeKeys: parseStringArray(saved.selectedStageOutcomeKeys),
      selectedStatuses: parseStringArray(saved.selectedStatuses),
      selectedActiveStates: parseStringArray(saved.selectedActiveStates),
      selectedCompanies: parseStringArray(saved.selectedCompanies),
      selectedEditors: parseStringArray(saved.selectedEditors),
      selectedHandlingCoordinators: parseStringArray(saved.selectedHandlingCoordinators),
      editorDateRanges: parseEditorDateRanges(saved.editorDateRanges),
      dateFrom: typeof saved.dateFrom === 'string' ? saved.dateFrom : '',
      dateTo: typeof saved.dateTo === 'string' ? saved.dateTo : '',
      dateSortOrder,
      entitySearchQuery: typeof saved.entitySearchQuery === 'string' ? saved.entitySearchQuery : '',
    };
  } catch {
    return null;
  }
}

export function saveEventsJournalFilters(
  storageKey: string | null,
  snapshot: EventsJournalFiltersSnapshot,
): void {
  if (!storageKey || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // ignore quota / privacy errors
  }
}

export function clearEventsJournalFilters(storageKey: string | null): void {
  if (!storageKey || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
