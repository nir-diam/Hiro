/** Marker appended to task/reminder email bodies (must match NewTaskModal + strip helper). */
export const TASK_LINKED_APPENDIX_REGEX = /\n\n---\nמידע מקושר מהמערכת:\n[\s\S]*$/;

export const EMPTY_LINKED_LABEL = '—';

export function stripTaskLinkedAppendixFromBody(body: string): string {
    return String(body ?? '').replace(TASK_LINKED_APPENDIX_REGEX, '').trimEnd();
}

/** Best-effort parse of older multi-line appendices (IDs, email, etc.). */
export function parseLegacyLinkedAppendix(text: string): Partial<Record<'candidate' | 'job' | 'client', string>> {
    const marker = '\n\n---\nמידע מקושר מהמערכת:\n';
    const idx = text.indexOf(marker);
    if (idx === -1) return {};
    const block = text.slice(idx + marker.length).trim();
    const r: Partial<Record<'candidate' | 'job' | 'client', string>> = {};
    for (const rawLine of block.split('\n')) {
        const line = rawLine.trim();
        if (/^מועמד:\s+/.test(line)) r.candidate = line.replace(/^מועמד:\s+/, '').trim();
        else if (/^משרה:\s+/.test(line)) r.job = line.replace(/^משרה:\s+/, '').trim();
        else if (/^כותרת:\s+/.test(line) && !r.job) r.job = line.replace(/^כותרת:\s+/, '').trim();
        else if (/^לקוח:\s+/.test(line)) r.client = line.replace(/^לקוח:\s+/, '').trim();
    }
    return r;
}
