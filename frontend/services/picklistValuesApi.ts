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

/** מודל עבודה מועדף למועמד — `PicklistCategory.key` (נפרד מ־job_scope / היקף משרה). */
export const WORK_MODEL_PICKLIST_KEY = 'work_model';

/** כשאין קטגוריה `work_model` במסד — אותם ברירות מחדל כמו למודל עבודה. */
export const WORK_MODEL_PREFERRED_FALLBACK: PicklistValueRow[] = JOB_SCOPE_PREFERRED_FALLBACK;

export function picklistRowLabel(v: PicklistValueRow): string {
    return ((v.displayName || v.label || v.value) as string).trim() || v.value;
}

export async function fetchPicklistValuesByKey(
    apiBase: string,
    categoryKey: string,
): Promise<PicklistValueRow[]> {
    if (!apiBase || !categoryKey) return [];
    try {
        const res = await fetch(
            `${apiBase}/api/picklists/categories/by-key/${encodeURIComponent(categoryKey)}/values`,
            { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } },
        );
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
