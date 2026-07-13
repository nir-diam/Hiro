import { hebrewFieldChangeLine } from './eventHistoryText';

export interface TagHistoryEntryLike {
    id?: string;
    action?: string;
    actor?: string;
    actorDisplayName?: string;
    userName?: string;
    userEmail?: string;
    changes?: {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
        eventKind?: string;
        targetTagName?: string;
        targetTagId?: string;
        candidateCount?: number;
        jobCount?: number;
        jobTitle?: string;
        sourceContext?: string;
    };
    createdAt?: string;
}

const SNAKE_TO_CAMEL: Record<string, string> = {
    display_name_he: 'displayNameHe',
    display_name_en: 'displayNameEn',
    tag_key: 'tagKey',
    quality_state: 'qualityState',
    description_he: 'descriptionHe',
    internal_note: 'internalNote',
    usage_count: 'usageCount',
    last_used_at: 'lastUsedAt',
    created_by: 'createdBy',
    updated_by: 'updatedBy',
};

const TAG_FIELD_LABELS: Record<string, string> = {
    displayNameHe: 'שם התגית (עברית)',
    displayNameEn: 'שם התגית (אנגלית)',
    tagKey: 'מפתח תגית',
    type: 'סוג',
    category: 'קטגוריה',
    status: 'סטטוס',
    qualityState: 'מצב איכות',
    source: 'מקור',
    descriptionHe: 'תיאור',
    internalNote: 'הערה פנימית',
    matchable: 'ניתן ל-matching',
    domains: 'תחומים',
};

const STATUS_LABELS: Record<string, string> = {
    active: 'פעיל',
    draft: 'טיוטה',
    deprecated: 'מיושן',
    archived: 'ארכיון',
    pending: 'ממתין',
};

const QUALITY_STATE_LABELS: Record<string, string> = {
    verified: 'מאומת (Verified)',
    needs_review: 'לביקורת (Needs Review)',
    experimental: 'נסיוני (Experimental)',
    initial_detection: 'זיהוי ראשוני',
};

const SOURCE_LABELS: Record<string, string> = {
    system: 'מערכת',
    admin: 'מנהל',
    user: 'משתמש',
    ai: 'AI',
    manual: 'ידני',
    job: 'משרה',
};

const SKIP_FIELDS = new Set([
    'id',
    'embedding',
    'usageCount',
    'lastUsedAt',
    'createdAt',
    'updatedAt',
    'createdBy',
    'updatedBy',
    'created_at',
    'updated_at',
]);

function normalizeTagRecord(raw?: Record<string, unknown>): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, unknown> = { ...raw };
    for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
        if (raw[snake] !== undefined && out[camel] === undefined) {
            out[camel] = raw[snake];
        }
    }
    return out;
}

function displayValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (field === 'status') return STATUS_LABELS[String(value)] || String(value);
    if (field === 'qualityState') return QUALITY_STATE_LABELS[String(value)] || String(value);
    if (field === 'source') return SOURCE_LABELS[String(value)] || String(value);
    if (Array.isArray(value)) {
        if (!value.length) return '—';
        return value
            .map((item) => {
                if (typeof item === 'string') return item.trim();
                if (item && typeof item === 'object') {
                    const o = item as Record<string, unknown>;
                    return String(o.phrase || o.name || o.value || '').trim();
                }
                return String(item);
            })
            .filter(Boolean)
            .join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function formatNameChange(before?: Record<string, unknown>, after?: Record<string, unknown>): string | null {
    const oldHe = String(before?.displayNameHe ?? '').trim();
    const newHe = String(after?.displayNameHe ?? '').trim();
    if (oldHe !== newHe) {
        return `שם התגית שונה מ-**${oldHe || '—'}** ל-**${newHe || '—'}**`;
    }
    const oldEn = String(before?.displayNameEn ?? '').trim();
    const newEn = String(after?.displayNameEn ?? '').trim();
    if (oldEn !== newEn) {
        return `שם התגית (אנגלית) שונה מ-**${oldEn || '—'}** ל-**${newEn || '—'}**`;
    }
    return null;
}

function diffStringArrays(
    label: string,
    oldArr: unknown,
    newArr: unknown,
    addedFmt: (v: string) => string,
    removedFmt: (v: string) => string,
): string[] {
    const oldList = (Array.isArray(oldArr) ? oldArr : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean);
    const newList = (Array.isArray(newArr) ? newArr : [])
        .map((v) => String(v || '').trim())
        .filter(Boolean);
    const oldSet = new Set(oldList);
    const newSet = new Set(newList);
    const lines: string[] = [];
    for (const item of newList) {
        if (!oldSet.has(item)) lines.push(addedFmt(item));
    }
    for (const item of oldList) {
        if (!newSet.has(item)) lines.push(removedFmt(item));
    }
    if (!lines.length && oldList.join('|') !== newList.join('|')) {
        return [hebrewFieldChangeLine(label, oldList.join(', ') || '—', newList.join(', ') || '—')];
    }
    return lines;
}

function diffSynonyms(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
    const oldSyn = Array.isArray(before?.synonyms) ? before!.synonyms : [];
    const newSyn = Array.isArray(after?.synonyms) ? after!.synonyms : [];
    const phrase = (item: unknown) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
            return String((item as Record<string, unknown>).phrase || '').trim();
        }
        return '';
    };
    const oldList = oldSyn.map(phrase).filter(Boolean);
    const newList = newSyn.map(phrase).filter(Boolean);
    const oldSet = new Set(oldList);
    const newSet = new Set(newList);
    const lines: string[] = [];
    for (const p of newList) {
        if (!oldSet.has(p)) lines.push(`נוספה מילה נרדפת: **${p}**`);
    }
    for (const p of oldList) {
        if (!newSet.has(p)) lines.push(`הוסרה מילה נרדפת: **${p}**`);
    }
    return lines;
}

function recordsEqual(before?: Record<string, unknown>, after?: Record<string, unknown>): boolean {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) return false;
    }
    return true;
}

function collectGenericFieldChanges(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (key === 'displayNameHe' || key === 'displayNameEn' || key === 'synonyms' || key === 'aliases') continue;
        const label = TAG_FIELD_LABELS[key] || key;
        const oldVal = before?.[key];
        const newVal = after?.[key];
        if (displayValue(key, oldVal) === displayValue(key, newVal)) continue;
        lines.push(hebrewFieldChangeLine(label, displayValue(key, oldVal), displayValue(key, newVal)));
    }
    return lines;
}

function collectFieldChanges(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (key === 'displayNameHe' || key === 'displayNameEn' || key === 'synonyms' || key === 'aliases') continue;

        const label = TAG_FIELD_LABELS[key];
        if (!label) continue;

        const oldVal = before?.[key];
        const newVal = after?.[key];
        if (displayValue(key, oldVal) === displayValue(key, newVal)) continue;

        lines.push(
            hebrewFieldChangeLine(label, displayValue(key, oldVal), displayValue(key, newVal)),
        );
    }

    lines.push(
        ...diffStringArrays(
            'שמות נוספים (Aliases)',
            before?.aliases,
            after?.aliases,
            (v) => `נוסף אליאס חדש: **${v}**`,
            (v) => `הוסר האליאס: **${v}**`,
        ),
    );

    lines.push(...diffSynonyms(before, after));

    return lines;
}

function formatCountPair(candidates?: number, jobs?: number): string {
    const c = Number(candidates) || 0;
    const j = Number(jobs) || 0;
    return `${c} מועמדים ו-${j} משרות`;
}

export function formatTagHistoryActionType(entry: TagHistoryEntryLike): string {
    const kind = entry.changes?.eventKind;
    if (kind === 'merge') return 'מיזוג';
    if (kind === 'force_delete') return 'מחיקה';
    if (entry.action === 'create') return 'יצירה';
    if (entry.action === 'delete') return 'מחיקה';
    return 'עדכון';
}

export function formatTagHistoryDescription(entry: TagHistoryEntryLike): string {
    const changes = entry.changes || {};
    const before = normalizeTagRecord(changes.before);
    const after = normalizeTagRecord(changes.after);
    const eventKind = changes.eventKind;

    if (eventKind === 'merge') {
        const target = changes.targetTagName || changes.targetTagId || 'תגית אחרת';
        return `התגית מוזגה לתוך התגית **${target}** (השפיע על ${formatCountPair(changes.candidateCount, changes.jobCount)})`;
    }

    if (eventKind === 'force_delete') {
        return `התגית נמחקה מהמאגר והוסרה באופן גורף מ-${formatCountPair(changes.candidateCount, changes.jobCount)}`;
    }

    if (entry.action === 'create') {
        const source = String(after?.source || changes.sourceContext || '').toLowerCase();
        const jobTitle = String(changes.jobTitle || '').trim();
        const name = String(after?.displayNameHe || after?.displayNameEn || after?.tagKey || '').trim();
        if (source === 'job' && jobTitle) {
            return `התגית "${name || 'חדשה'}" נוצרה במערכת מתוך משרה: ${jobTitle}`;
        }
        if (source === 'job') {
            return `התגית "${name || 'חדשה'}" נוצרה במערכת מתוך משרה`;
        }
        if (source === 'ai') {
            return `התגית "${name || 'חדשה'}" נוצרה במערכת (זיהוי אוטומטי)`;
        }
        return name ? `התגית "${name}" נוצרה במערכת` : 'התגית נוצרה במערכת';
    }

    if (entry.action === 'delete') {
        const name = String(before?.displayNameHe || before?.displayNameEn || before?.tagKey || after?.displayNameHe || '').trim();
        return name ? `התגית "${name}" נמחקה מהמאגר` : 'התגית נמחקה מהמאגר';
    }

    if (recordsEqual(before, after)) {
        return 'עדכון בוצע (פרטי השינוי לא נשמרו בגרסה קודמת)';
    }

    const nameLine = formatNameChange(before, after);
    const fieldLines = collectFieldChanges(before, after);
    const genericLines = fieldLines.length ? [] : collectGenericFieldChanges(before, after);
    const allFieldLines = fieldLines.length ? fieldLines : genericLines;

    if (nameLine && allFieldLines.length) {
        return [nameLine, ...allFieldLines].join(' · ');
    }
    if (nameLine) return nameLine;
    if (allFieldLines.length === 1) return allFieldLines[0];
    if (allFieldLines.length > 1) return allFieldLines.join(' · ');

    return 'בוצע עדכון לתגית (ללא שדות מזוהים)';
}

export function stripHistoryMarkdown(text: string): string {
    return text.replace(/\*\*(.+?)\*\*/g, '$1');
}
