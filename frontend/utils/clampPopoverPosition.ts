/** Keep a horizontally centered popover fully inside the viewport. */
export function clampCenteredPopoverX(anchorCenterX: number, popoverWidth: number, padding = 12): number {
    if (typeof window === 'undefined') return anchorCenterX;
    const maxW = Math.min(popoverWidth, window.innerWidth - padding * 2);
    const half = maxW / 2;
    return Math.max(padding + half, Math.min(anchorCenterX, window.innerWidth - padding - half));
}

/** Prefer below anchor; flip above if there is not enough room. */
export function popoverTopBelowAnchor(
    anchorTop: number,
    anchorBottom: number,
    estimatedHeight: number,
    gap = 8,
    padding = 12,
): number {
    if (typeof window === 'undefined') return anchorBottom + gap;
    const below = anchorBottom + gap;
    if (below + estimatedHeight <= window.innerHeight - padding) return below;
    const above = anchorTop - estimatedHeight - gap;
    if (above >= padding) return above;
    return Math.max(padding, window.innerHeight - estimatedHeight - padding);
}
