/** Calendar-day difference: due date minus today (local midnight). */
export function daysFromTodayUntilDue(dueDate: string | null | undefined): number | null {
    const raw = String(dueDate ?? '').trim();
    if (!raw) return null;
    const [y, m, d] = raw.split('-').map((x) => Number(x));
    if (!y || !m || !d) return null;
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - today.getTime();
    return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

export function formatDueDaysLabel(days: number | null | undefined): string {
    if (days == null || !Number.isFinite(days)) return '';
    if (days === 0) return 'היום';
    if (days === 1) return 'עוד יום';
    if (days > 1) return `עוד ${days} ימים`;
    if (days === -1) return 'איחור של יום';
    return `איחור של ${Math.abs(days)} ימים`;
}

export function formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function dueDateAfterTodayOffset(dayOffset: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return formatDateInputValue(d);
}

/** Task SLA field: days until due at creation time (from due date only). */
export function allocatedDaysFromDueDate(dueDate: string | null | undefined): number | null {
    const days = daysFromTodayUntilDue(dueDate);
    return days == null ? null : days;
}
