/** DB ENUM + UI label: פעילה in forms maps to פתוחה in the API (see Job model). */
export function jobStatusApiToForm(status: string | undefined | null): string {
    const s = String(status ?? '').trim();
    if (s === 'פתוחה') return 'פעילה';
    if (s === 'מאוישת') return 'סגורה';
    if (s === 'טיוטה' || s === 'מוקפאת' || s === 'סגורה' || s === 'פעילה') return s;
    return 'טיוטה';
}

export function jobStatusFormToApi(status: string | undefined | null): string {
    const s = String(status ?? '').trim();
    if (s === 'פעילה') return 'פתוחה';
    if (s === 'סגורה' || s === 'מאוישת') return 'מאוישת';
    if (s === 'טיוטה' || s === 'מוקפאת' || s === 'פתוחה') return s;
    return 'טיוטה';
}

/** User-facing label for lists, sidebar, drawer (matches NewJobView form wording). */
export function jobStatusApiToDisplay(status: string | undefined | null): string {
    return jobStatusApiToForm(status);
}
