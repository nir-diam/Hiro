/** Tailwind chip classes for known legacy types; unknown types get a neutral chip. */
const LEGACY_CHIPS: Record<string, { bg: string; text: string; border: string }> = {
  ראיון: { bg: 'bg-secondary-100', text: 'text-secondary-800', border: 'border-secondary-500' },
  פגישה: { bg: 'bg-primary-100', text: 'text-primary-800', border: 'border-primary-500' },
  תזכורת: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500' },
  'משימת מערכת': { bg: 'bg-gray-200', text: 'text-gray-800', border: 'border-gray-500' },
};

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-400' };

export function eventTypeChipClasses(type: string): { bg: string; text: string; border: string } {
  return LEGACY_CHIPS[type] ?? FALLBACK;
}
