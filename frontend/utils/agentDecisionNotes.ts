/** Read-only agent notes from dedicated DB field. */
export function formatAgentNotes(agentNotes?: string | null): string {
    return String(agentNotes || '').trim();
}

/** Shared sizing for user-notes textarea in AI decision tables. */
export const AI_DECISION_USER_NOTES_FIELD_PROPS = {
    wrapperClassName: 'min-w-[260px] max-w-none w-full',
    rows: 5,
    className: 'min-h-[120px]',
} as const;
