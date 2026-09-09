import React from 'react';

/** Table layout — `border-collapse` breaks `position: sticky` on headers in some browsers. */
export const STICKY_TABLE_CLASS = 'border-separate border-spacing-0';

export type StickyTableHeaderTone = 'subtle' | 'surface';

const HEADER_BG: Record<StickyTableHeaderTone, string> = {
    subtle: 'bg-bg-subtle',
    surface: 'bg-[#f8fafc]',
};

/** Header cells when thead is in the sticky header row (no per-cell sticky needed). */
export function stickyTableHeaderCellClass(
    extra = '',
    tone: StickyTableHeaderTone = 'subtle',
): string {
    return [
        HEADER_BG[tone],
        'shadow-[inset_0_-1px_0_0] shadow-border-default',
        extra,
    ]
        .filter(Boolean)
        .join(' ');
}

/** Horizontal scroll only — rows grow naturally; page scrolls vertically. */
export const ADMIN_TABLE_SCROLL_CLASS =
    'overflow-x-auto overflow-y-visible min-w-0 w-full [scrollbar-width:thin]';

type AdminViewportShellProps = {
    children: React.ReactNode;
    chromeOffsetPx?: number;
    className?: string;
};

export function AdminViewportShell({ children, className = '' }: AdminViewportShellProps) {
    return <div className={className}>{children}</div>;
}
