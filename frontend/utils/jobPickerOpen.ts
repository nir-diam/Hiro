/** Open / active jobs — DB enum is `פתוחה`; UI sometimes labels that `פעילה` (NewJobView). */
export function jobIsOpenForStaffPick(status?: string | null): boolean {
    const s = String(status ?? '')
        .trim()
        .normalize('NFC');
    if (!s) return false;
    if (s === 'פתוחה' || s === 'פעילה') return true;
    const lower = s.toLowerCase();
    return lower === 'open' || lower === 'active';
}
