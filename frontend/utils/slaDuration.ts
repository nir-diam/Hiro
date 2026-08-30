export type SlaUnit = 'days' | 'hours' | 'minutes';

export function normalizeSlaUnit(unit?: string | null): SlaUnit {
  if (unit === 'hours' || unit === 'minutes') return unit;
  return 'days';
}

export function cycleSlaUnit(unit: SlaUnit): SlaUnit {
  if (unit === 'days') return 'hours';
  if (unit === 'hours') return 'minutes';
  return 'days';
}

export function slaUnitLabel(unit: SlaUnit): string {
  if (unit === 'hours') return 'שעות';
  if (unit === 'minutes') return 'דקות';
  return 'ימים';
}

export function slaFieldLabel(unit: SlaUnit): string {
  return `התראת SLA (${slaUnitLabel(unit)})`;
}

export type SlaDueDateTime = { dueDate: string; dueTime: string | null };

/** Compute due date/time from now (or optional base). */
export function dueDateTimeAfterSla(
  value: number,
  unit: SlaUnit,
  base: Date = new Date(),
): SlaDueDateTime {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return { dueDate: '', dueTime: null };

  const d = new Date(base);
  if (unit === 'days') {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + v);
    return { dueDate: d.toISOString().slice(0, 10), dueTime: null };
  }

  if (unit === 'hours') {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + v);
  } else {
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + v);
  }

  const dueDate = d.toISOString().slice(0, 10);
  const dueTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { dueDate, dueTime };
}

export function formatSlaDuration(value: number, unit: SlaUnit): string {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return '';
  return `${v} ${slaUnitLabel(unit)}`;
}
