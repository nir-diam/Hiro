export type ParsedTextHistoryEntry = {
    text: string;
    savedAt?: string | null;
};

export function normalizeOriginalTextHistory(raw: unknown): ParsedTextHistoryEntry[] {
    if (!Array.isArray(raw)) return [];
    const out: ParsedTextHistoryEntry[] = [];
    for (const entry of raw) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'text' in entry) {
            const text = String((entry as ParsedTextHistoryEntry).text ?? '').trim();
            if (!text) continue;
            const savedAt = (entry as ParsedTextHistoryEntry).savedAt ?? null;
            out.push({ text, savedAt: savedAt ? String(savedAt) : null });
            continue;
        }
        const text = String(entry ?? '').trim();
        if (!text) continue;
        out.push({ text, savedAt: null });
    }
    return out;
}
