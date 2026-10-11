export const LEAVE_WITHOUT_SAVE_MESSAGE =
  'יש שינויים שלא נשמרו. לצאת מהעמוד בלי לשמור?';

export function confirmLeaveWithoutSave(message = LEAVE_WITHOUT_SAVE_MESSAGE): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm(message);
}
