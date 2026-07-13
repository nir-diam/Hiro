import { hebrewFieldChangeLine } from './eventHistoryText';

export interface CompanyHistoryEntryLike {
    id?: string;
    organizationId?: string;
    action?: string;
    actor?: string;
    actorDisplayName?: string;
    userName?: string;
    userEmail?: string;
    changes?: {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
    };
    createdAt?: string;
    created_at?: string;
}

const COMPANY_FIELD_LABELS: Record<string, string> = {
    name: 'שם החברה (עברית)',
    nameEn: 'שם באנגלית',
    legalName: 'שם משפטי',
    aliases: 'שמות נוספים',
    website: 'אתר אינטרנט',
    linkedinUrl: 'לינקדאין',
    logo: 'לוגו',
    foundedYear: 'שנת הקמה',
    location: 'מיקום',
    hqCountry: 'מדינת מטה',
    address: 'כתובת',
    activityStatus: 'סטטוס פעילות',
    employeeCount: 'גודל ארגון',
    mainField: 'תעשיית אם',
    mainField2: 'תעשיות אם נוספות',
    subField: 'תת-תחום',
    secondaryField: 'תחום משני',
    businessModel: 'מודל עסקי',
    productType: 'סוג מוצר/שירות',
    type: 'סוג ארגון',
    classification: 'סיווג',
    structure: 'מבנה ארגוני',
    parentCompany: 'חברת אם',
    subsidiaries: 'חברות בת',
    growthIndicator: 'מדד צמיחה',
    dataConfidence: 'אמינות נתונים',
    lastVerified: 'אימות אחרון',
    description: 'תיאור',
    tags: 'תגיות',
    techTags: 'Tech Stack',
};

const DATA_CONFIDENCE_LABELS: Record<string, string> = {
    High: 'גבוהה',
    Medium: 'בינונית',
    Low: 'נמוכה',
    'Pending Review': 'ממתין לביקורת',
};

const SKIP_FIELDS = new Set([
    'id',
    'embedding',
    'candidateCount',
    'history',
    'comments',
    'snippet',
    'latitude',
    'longitude',
    'email',
    'phone',
    'growthTrend',
    'relation',
    'createdAt',
    'updatedAt',
    'created_at',
    'updated_at',
]);

function displayValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (field === 'dataConfidence') {
        return DATA_CONFIDENCE_LABELS[String(value)] || String(value);
    }
    if (Array.isArray(value)) {
        if (!value.length) return '—';
        return value.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
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

function formatNameChange(before?: Record<string, unknown>, after?: Record<string, unknown>): string | null {
    const oldName = String(before?.name ?? '').trim();
    const newName = String(after?.name ?? '').trim();
    if (oldName !== newName) {
        return `שם החברה שונה מ-**${oldName || '—'}** ל-**${newName || '—'}**`;
    }
    return null;
}

function recordsEqual(before?: Record<string, unknown>, after?: Record<string, unknown>): boolean {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key])) return false;
    }
    return true;
}

function collectFieldChanges(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (key === 'name' || key === 'aliases') continue;

        const label = COMPANY_FIELD_LABELS[key];
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
            'שמות נוספים',
            before?.aliases,
            after?.aliases,
            (v) => `נוסף אליאס חדש: **${v}**`,
            (v) => `הוסר האליאס: **${v}**`,
        ),
    );

    return lines;
}

function collectGenericFieldChanges(before?: Record<string, unknown>, after?: Record<string, unknown>): string[] {
    const lines: string[] = [];
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
        if (SKIP_FIELDS.has(key)) continue;
        if (key === 'name' || key === 'aliases') continue;
        const label = COMPANY_FIELD_LABELS[key] || key;
        const oldVal = before?.[key];
        const newVal = after?.[key];
        if (displayValue(key, oldVal) === displayValue(key, newVal)) continue;
        lines.push(hebrewFieldChangeLine(label, displayValue(key, oldVal), displayValue(key, newVal)));
    }
    return lines;
}

export function formatCompanyHistoryActionType(entry: CompanyHistoryEntryLike): string {
    if (entry.action === 'create') return 'יצירה';
    if (entry.action === 'delete') return 'מחיקה';
    return 'עדכון';
}

export function formatCompanyHistoryDescription(entry: CompanyHistoryEntryLike): string {
    const changes = entry.changes || {};
    const before = changes.before;
    const after = changes.after;

    if (entry.action === 'create') {
        const name = String(after?.name || after?.nameEn || '').trim();
        return name ? `החברה "${name}" נוצרה במערכת` : 'החברה נוצרה במערכת';
    }

    if (entry.action === 'delete') {
        const name = String(before?.name || before?.nameEn || after?.name || '').trim();
        return name ? `החברה "${name}" נמחקה מהמאגר` : 'החברה נמחקה מהמאגר';
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

    return 'בוצע עדכון לפרופיל החברה (ללא שדות מזוהים)';
}
