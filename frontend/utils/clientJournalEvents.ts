export const CLIENT_JOURNAL_UPDATED_EVENT = 'hiro:client-journal-updated';

export function dispatchClientJournalUpdated(detail?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CLIENT_JOURNAL_UPDATED_EVENT, { detail }));
}
