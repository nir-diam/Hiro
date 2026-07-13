export type PicklistValueRow = {
    id: string;
    label: string;
    value: string;
    displayName: string | null;
};

/** היקף משרה (מועמד) — ממופה ל־`candidates.jobScopes` / `jobScope`; טעינה מ־`/api/picklists/.../by-key/job_scope/values`. */
export const JOB_SCOPE_PICKLIST_KEY = 'job_scope';

/** סוג תעסוקה רצוי (מועמד) — ממופה ל־`candidates.employmentTypes` / `employmentType`; מפתח קטגוריה `employment_type`. */
export const EMPLOYMENT_TYPE_PICKLIST_KEY = 'employment_type';

/** When picklist is empty: employment type multi-select. */
export const EMPLOYMENT_TYPE_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_sachir', label: 'שכיר', value: 'שכיר', displayName: null },
    { id: '_fb_atzmai', label: 'עצמאי', value: 'עצמאי', displayName: null },
    { id: '_fb_kablan', label: 'קבלן', value: 'קבלן', displayName: null },
];

/** היקף משרה למועמד (מלאה / משמרות / זמנית) כשאין ערכים בפיקליסט. */
export const JOB_SCOPE_MULTI_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_full', label: 'מלאה', value: 'מלאה', displayName: null },
    { id: '_fb_shifts', label: 'משמרות', value: 'משמרות', displayName: null },
    { id: '_fb_temp', label: 'זמנית', value: 'זמנית', displayName: null },
];

/** Organization sector / type (AdminCompaniesView מגזר) — `PicklistCategory.key`. */
export const SECTOR_PICKLIST_KEY = 'sector';

/** תעשיית אם (mainField) — parent category; children are subcategories with domain values (subField). */
export const BUSINESS_FIELD_CATEGORY_ID = '16c81e14-316d-403d-951a-263d02f57f4b';

/** דומיינים מקושרים לתגיות (AdminTagsView) — `PicklistCategory.id`. */
export const TAG_DOMAIN_PICKLIST_CATEGORY_ID = 'b066daec-01f0-4c37-aae9-04d7e99a5805';

export type PicklistSubcategoryRow = {
    id: string;
    name: string;
    description?: string | null;
};

export async function fetchPicklistSubcategories(
    apiBase: string,
    parentCategoryId: string,
): Promise<PicklistSubcategoryRow[]> {
    const root = (apiBase || '').replace(/\/$/, '');
    const id = String(parentCategoryId || '').trim();
    if (!root || !id) return [];
    try {
        const res = await fetch(`${root}/api/picklists/categories/${encodeURIComponent(id)}/subcategories`, {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return [];
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ''),
            name: String(row.name ?? '').trim(),
            description: row.description != null ? String(row.description) : null,
        })).filter((r) => r.id && r.name);
    } catch {
        return [];
    }
}

export async function fetchPicklistCategoryValues(
    apiBase: string,
    categoryId: string,
): Promise<PicklistValueRow[]> {
    const root = (apiBase || '').replace(/\/$/, '');
    const id = String(categoryId || '').trim();
    if (!root || !id) return [];
    try {
        const res = await fetch(`${root}/api/picklists/categories/${encodeURIComponent(id)}/values`, {
            credentials: 'include',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return [];
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return [];
        return data
            .map((row: Record<string, unknown>) => ({
                id: String(row.id ?? ''),
                label: String(row.label ?? ''),
                value: String(row.value ?? ''),
                displayName: row.displayName != null ? String(row.displayName) : null,
            }))
            .filter((r) => r.id && (r.label || r.value));
    } catch {
        return [];
    }
}

/** When picklist is empty or category missing: matches legacy hardcoded options + filters. */
export const SECTOR_PICKLIST_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_hitech', label: 'הייטק', value: 'הייטק', displayName: null },
    { id: '_fb_industry', label: 'תעשייה', value: 'תעשייה', displayName: null },
    { id: '_fb_finance', label: 'פיננסים', value: 'פיננסים', displayName: null },
    { id: '_fb_services', label: 'שירותים', value: 'שירותים', displayName: null },
    { id: '_fb_retail', label: 'מסחר וקמעונאות', value: 'מסחר וקמעונאות', displayName: null },
    { id: '_fb_other', label: 'אחר (אחזקות ועוד)', value: 'אחר', displayName: null },
];

/** When picklist is empty: scope dropdown (legacy + work models). */
export const JOB_SCOPE_SELECT_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_full', label: 'מלאה', value: 'מלאה', displayName: null },
    { id: '_fb_remote', label: 'בית', value: 'בית', displayName: null },
    { id: '_fb_hybrid', label: 'היברידי', value: 'היברידי', displayName: null },
    { id: '_fb_office', label: 'משרד', value: 'משרד', displayName: null },
];

/** When picklist is empty: preferred work model multi-select only. */
export const JOB_SCOPE_PREFERRED_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_remote', label: 'בית', value: 'בית', displayName: null },
    { id: '_fb_hybrid', label: 'היברידי', value: 'היברידי', displayName: null },
    { id: '_fb_office', label: 'משרד', value: 'משרד', displayName: null },
];

/** רישיון נהיגה נדרש למשרה — `jobs.licenseType`; `PicklistCategory.key`. */
export const DRIVING_LICENSE_PICKLIST_KEY = 'driving_license';

/** ניידות / רכב למשרה — `jobs.mobility`; `PicklistCategory.key`. */
export const MOBILITY_PICKLIST_KEY = 'mobility';

/** When picklist `driving_license` is empty — aligns with DB seed + screening (`licenseType` empty for neutral). */
export const DRIVING_LICENSE_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_dl_none', label: 'ללא', value: '-', displayName: null },
    { id: '_fb_dl_a', label: 'A (אופנוע)', value: 'A', displayName: null },
    { id: '_fb_dl_a1', label: 'A1', value: 'A1', displayName: null },
    { id: '_fb_dl_a2', label: 'A2', value: 'A2', displayName: null },
    { id: '_fb_dl_b', label: 'B (רכב פרטי)', value: 'B', displayName: null },
    { id: '_fb_dl_c', label: 'C (משאית)', value: 'C', displayName: null },
    { id: '_fb_dl_c1', label: 'C1', value: 'C1', displayName: null },
    { id: '_fb_dl_d', label: 'D (אוטובוס)', value: 'D', displayName: null },
    { id: '_fb_dl_d1', label: 'D1', value: 'D1', displayName: null },
    { id: '_fb_dl_e', label: 'E (גורר)', value: 'E', displayName: null },
    { id: '_fb_dl_1', label: '1 (טרקטור)', value: '1', displayName: null },
];

/** Driving-license dropdown: ללא / `-` always first, then other neutrals, then rest by Hebrew label. */
export function sortDrivingLicensePicklistRows(rows: PicklistValueRow[]): PicklistValueRow[] {
    const tier = (r: PicklistValueRow): number => {
        const lbl = picklistRowLabel(r).trim();
        const v = String(r.value ?? '').trim();
        if (lbl === 'ללא' || v === '-') return 0;
        if (v === 'לא חשוב' || lbl === 'לא חשוב') return 1;
        return 2;
    };
    return [...rows].sort((a, b) => {
        const ta = tier(a);
        const tb = tier(b);
        if (ta !== tb) return ta - tb;
        return picklistRowLabel(a).localeCompare(picklistRowLabel(b), 'he');
    });
}

/** When picklist `mobility` is empty — aligns with legacy boolean `mobility`. */
export const MOBILITY_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_mob_na', label: 'לא חשוב', value: 'לא חשוב', displayName: null },
    { id: '_fb_mob_req', label: 'חובה', value: 'חובה', displayName: null },
];

/** זמינות להתחלה (מועמד / משרה) — `candidates.availability`, `jobs.availability`; `PicklistCategory.key`. */
export const AVAILABILITY_PICKLIST_KEY = 'availability';

/** When picklist `availability` is empty — recruitment timeline emoji options (MainContent / CandidateProfile). */
export const AVAILABILITY_FALLBACK: PicklistValueRow[] = [
    {
        id: '_fb_av_green',
        label: '🟢 מיידי (זמין לעבודה מיד).',
        value: '🟢 מיידי (זמין לעבודה מיד).',
        displayName: null,
    },
    {
        id: '_fb_av_yellow',
        label: '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
        value: '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
        displayName: null,
    },
    {
        id: '_fb_av_orange',
        label: '🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).',
        value: '🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).',
        displayName: null,
    },
    {
        id: '_fb_av_red',
        label: '🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).',
        value: '🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).',
        displayName: null,
    },
];

/** סטטוס מועמד (`candidates.status`) — `PicklistCategory.key`. */
export const CANDIDATE_STATUS_PICKLIST_KEY = 'candidate_status';

/** When picklist `candidate_status` is missing or has no active values — legacy bulk modal options. */
export const CANDIDATE_STATUS_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_cs_missing', label: 'חסר נתונים', value: 'חסר נתונים', displayName: null },
    { id: '_fb_cs_active', label: 'פעיל', value: 'פעיל', displayName: null },
    { id: '_fb_cs_new', label: 'חדש', value: 'חדש', displayName: null },
    { id: '_fb_cs_checked', label: 'עבר בדיקה ראשונית', value: 'עבר בדיקה ראשונית', displayName: null },
];

/** מודל עבודה מועדף למועמד — `PicklistCategory.key` (נפרד מ־job_scope / היקף משרה). */
export const WORK_MODEL_PICKLIST_KEY = 'work_model';

/** כשאין קטגוריה `work_model` במסד — אותם ברירות מחדל כמו למודל עבודה. */
export const WORK_MODEL_PREFERRED_FALLBACK: PicklistValueRow[] = JOB_SCOPE_PREFERRED_FALLBACK;

export function picklistRowLabel(v: PicklistValueRow): string {
    return ((v.displayName || v.label || v.value) as string).trim() || v.value;
}

const DRIVING_LICENSE_NEUTRAL_RAW = new Set([
    '',
    '-',
    'ללא',
    'לא חשוב',
    'לא ידוע',
    'none',
    'no',
    'not required',
    'n/a',
    'na',
]);

/** AI / legacy stored tokens → canonical picklist `value`. */
const DRIVING_LICENSE_SYNONYMS: Record<string, string> = {
    אופנוע: 'A',
    motorcycle: 'A',
    moto: 'A',
    טרקטור: '1',
    tractor: '1',
    'רכב פרטי': 'B',
    'private car': 'B',
    car: 'B',
    משאית: 'C',
    truck: 'C',
    lorry: 'C',
    אוטובוס: 'D',
    bus: 'D',
    גורר: 'E',
    trailer: 'E',
};

function drivingLicenseRowsOrFallback(rows?: PicklistValueRow[]): PicklistValueRow[] {
    return rows?.length ? rows : DRIVING_LICENSE_FALLBACK;
}

/** Whether a stored token means “no license” / not relevant for CV display. */
export function isNeutralDrivingLicenseStored(
    stored: string,
    rows: PicklistValueRow[] = DRIVING_LICENSE_FALLBACK,
): boolean {
    const key = String(stored ?? '').trim();
    if (!key) return true;
    if (DRIVING_LICENSE_NEUTRAL_RAW.has(key.toLowerCase())) return true;

    const list = drivingLicenseRowsOrFallback(rows);
    const row =
        list.find((r) => String(r.value ?? '').trim() === key) ||
        list.find((r) => String(r.id ?? '').trim() === key) ||
        list.find((r) => picklistRowLabel(r) === key || String(r.label ?? '').trim() === key);
    if (!row) return false;

    const v = String(row.value ?? '').trim();
    const lbl = picklistRowLabel(row);
    return v === '-' || lbl === 'ללא' || v === 'לא חשוב' || lbl === 'לא חשוב';
}

/** Resolve messy stored value → canonical picklist `value`, or null. */
export function resolveDrivingLicensePicklistValue(
    stored: string,
    rows: PicklistValueRow[] = DRIVING_LICENSE_FALLBACK,
): string | null {
    const key = String(stored ?? '').trim();
    if (!key || isNeutralDrivingLicenseStored(key, rows)) return null;

    const list = drivingLicenseRowsOrFallback(rows);

    const byValue = list.find(
        (r) => String(r.value ?? '').trim() === key || String(r.id ?? '').trim() === key,
    );
    if (byValue) return String(byValue.value).trim();

    const byLabel = list.find(
        (r) => picklistRowLabel(r) === key || String(r.label ?? '').trim() === key,
    );
    if (byLabel) return String(byLabel.value).trim();

    const syn = DRIVING_LICENSE_SYNONYMS[key.toLowerCase()];
    if (syn && list.some((r) => String(r.value).trim() === syn)) return syn;

    const lower = key.toLowerCase();
    const byPartial = list.find((r) => {
        const lbl = picklistRowLabel(r).toLowerCase();
        if (!lbl || lbl === 'ללא') return false;
        return lbl.includes(lower) || lower.includes(lbl);
    });
    if (byPartial) return String(byPartial.value).trim();

    if (/^[a-e]\d?$/i.test(key)) {
        const letter = list.find((r) => String(r.value).trim().toUpperCase() === key.toUpperCase());
        if (letter) return String(letter.value).trim();
    }
    if (key === '1') {
        const one = list.find((r) => String(r.value).trim() === '1');
        if (one) return '1';
    }

    return null;
}

/** Map stored picklist value/key → Hebrew display label for CV print & UI. */
export function drivingLicenseDisplayLabel(
    stored: string,
    rows: PicklistValueRow[] = DRIVING_LICENSE_FALLBACK,
): string {
    const key = String(stored || '').trim();
    if (!key || isNeutralDrivingLicenseStored(key, rows)) return '';

    const list = drivingLicenseRowsOrFallback(rows);
    const pickValue = resolveDrivingLicensePicklistValue(key, list);
    if (pickValue) {
        const row = list.find((r) => String(r.value).trim() === pickValue);
        if (row && !isNeutralDrivingLicenseStored(pickValue, list)) {
            return picklistRowLabel(row);
        }
    }

    const asLabel = list.find((r) => picklistRowLabel(r) === key);
    if (asLabel && !isNeutralDrivingLicenseStored(asLabel.value, list)) {
        return picklistRowLabel(asLabel);
    }

    return '';
}

export async function fetchPicklistValuesByKey(
    apiBase: string,
    categoryKey: string,
): Promise<PicklistValueRow[]> {
    const key = String(categoryKey || '').trim();
    if (!key) return [];
    const root = (apiBase || '').replace(/\/$/, '');
    const url = `${root}/api/picklists/categories/by-key/${encodeURIComponent(key)}/values`;
    try {
        const res = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ''),
            label: String(row.label ?? ''),
            value: String(row.value ?? ''),
            displayName: row.displayName != null ? String(row.displayName) : null,
        }));
    } catch {
        return [];
    }
}
