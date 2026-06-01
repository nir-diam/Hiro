/** Build non-overlapping highlight spans in plain CV text from tag quotes / labels. */

export type TagDetailForHighlight = {
    tagKey?: string;
    displayNameHe?: string;
    displayNameEn?: string;
    quote?: string;
    evidence?: string;
    rawType?: string;
    context?: string;
    tagReason?: string;
    rawTypeReason?: string;
    descriptionHe?: string;
    confidenceScore?: number;
    finalScore?: number;
    isCurrent?: boolean;
    createdAt?: string;
    category?: string;
};

export type TextHighlightSpan = {
    start: number;
    end: number;
    detail: TagDetailForHighlight;
};

function needleForTag(d: TagDetailForHighlight): string {
    const q = String(d.quote ?? d.evidence ?? '').trim();
    if (q.length >= 2) return q;
    return String(d.displayNameHe || d.displayNameEn || d.tagKey || '').trim();
}

export function collectSearchTextHighlightSpans(
    text: string,
    tagDetails: TagDetailForHighlight[],
): TextHighlightSpan[] {
    if (!text || !tagDetails.length) return [];

    const raw: TextHighlightSpan[] = [];
    for (const detail of tagDetails) {
        const needle = needleForTag(detail);
        if (needle.length < 2) continue;
        let idx = 0;
        while (idx < text.length) {
            const found = text.indexOf(needle, idx);
            if (found === -1) break;
            raw.push({ start: found, end: found + needle.length, detail });
            idx = found + needle.length;
        }
    }

    raw.sort((a, b) => a.start - b.start || b.end - b.end - (a.end - a.start));
    const merged: TextHighlightSpan[] = [];
    for (const span of raw) {
        const last = merged[merged.length - 1];
        if (!last || span.start >= last.end) {
            merged.push(span);
        }
    }
    return merged;
}

export function chipClassForRawType(rawType?: string): string {
    const rt = String(rawType || '').toLowerCase();
    if (/role|seniority/.test(rt)) {
        return 'bg-secondary-200 text-secondary-800 border-secondary-300';
    }
    if (/certification|degree|education/.test(rt)) {
        return 'bg-yellow-200 text-yellow-800 border-yellow-300';
    }
    if (/tool/.test(rt)) {
        return 'bg-emerald-200 text-emerald-800 border-emerald-300';
    }
    if (/industry|domain/.test(rt)) {
        return 'bg-primary-200 text-primary-800 border-primary-300';
    }
    if (/language/.test(rt)) {
        return 'bg-blue-200 text-blue-800 border-blue-300';
    }
    return 'bg-primary-200 text-primary-800 border-primary-300';
}
