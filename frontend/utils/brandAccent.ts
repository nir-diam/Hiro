import type React from 'react';

export function brandAccentStyle(color?: string | null): React.CSSProperties | undefined {
  const c = String(color || '').trim();
  if (!c) return undefined;
  return {
    '--brand-accent': c,
    '--brand-accent-soft': `${c}18`,
    '--brand-accent-border': `${c}44`,
  } as React.CSSProperties;
}

export function brandOrPrimary(accentColor: string | undefined | null, brandClass: string, primaryClass: string) {
  return accentColor?.trim() ? brandClass : primaryClass;
}
