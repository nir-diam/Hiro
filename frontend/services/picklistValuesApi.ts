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

/** רישיון נהיגה נדרש למשרה — `jobs.licenseType`; `PicklistCategory.key`. */
export const DRIVING_LICENSE_PICKLIST_KEY = 'driving_license';

/** ניידות / רכב למשרה — `jobs.mobility`; `PicklistCategory.key`. */
export const MOBILITY_PICKLIST_KEY = 'mobility';

/** When picklist `driving_license` is empty — aligns with DB seed + screening (`licenseType` empty for neutral). */
export const DRIVING_LICENSE_FALLBACK: PicklistValueRow[] = [
    { id: '_fb_dl_none', label: 'ללא', value: '-', displayName: null },
    { id: '_fb_dl_b', label: 'B', value: 'B', displayName: null },
    { id: '_fb_dl_c', label: 'C', value: 'C', displayName: null },
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
