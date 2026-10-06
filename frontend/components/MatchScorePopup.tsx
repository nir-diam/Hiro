import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { clampCenteredPopoverX } from '../utils/clampPopoverPosition';
import {
    MatchScoreBreakdownPanel,
    type MatchScoreBreakdownData,
    type ParameterMatchesMap,
} from './MatchScoreBreakdownPanel';

export const MATCH_SCORE_POPUP_WIDTH = 288;
const POPUP_GAP = 10;
const VIEWPORT_PAD = 12;
const POPUP_MAX_HEIGHT_REM = 28;

function popupMaxHeightCapPx(): number {
    if (typeof window === 'undefined') return POPUP_MAX_HEIGHT_REM * 16;
    return Math.min(window.innerHeight * 0.75, POPUP_MAX_HEIGHT_REM * 16);
}

export type MatchScorePopupPosition = {
    x: number;
    y: number;
    anchorTop?: number;
    anchorBottom?: number;
};

export function matchScorePopupPositionFromEvent(
    e: Pick<React.MouseEvent, 'currentTarget'>,
): MatchScorePopupPosition {
    const target = e.currentTarget;
    if (!(target instanceof Element)) {
        if (typeof window !== 'undefined') {
            const x = window.innerWidth / 2;
            const y = window.innerHeight / 2;
            return { x, y, anchorTop: y - 24, anchorBottom: y + 24 };
        }
        return { x: 0, y: 0, anchorTop: 0, anchorBottom: 0 };
    }
    const rect = target.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2,
        y: rect.bottom + POPUP_GAP,
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
    };
}

type MatchScorePopupLayout =
    | {
          placement: 'above';
          left: number;
          bottom: number;
          transform: 'translateX(-50%)';
          maxHeight: number;
      }
    | {
          placement: 'below';
          left: number;
          top: number;
          transform: 'translateX(-50%)';
          maxHeight: number;
      };

function computeMatchScorePopupStyle(position: MatchScorePopupPosition): MatchScorePopupLayout {
    const leftFallback = position.x;
    if (typeof window === 'undefined') {
        return {
            placement: 'above',
            left: leftFallback,
            bottom: 80,
            transform: 'translateX(-50%)',
            maxHeight: popupMaxHeightCapPx(),
        };
    }

    const anchorTop = position.anchorTop ?? position.y - POPUP_GAP;
    const anchorBottom = position.anchorBottom ?? anchorTop + 40;
    const left = clampCenteredPopoverX(position.x, MATCH_SCORE_POPUP_WIDTH, VIEWPORT_PAD);
    const vh = window.innerHeight;
    const maxBottomY = vh - VIEWPORT_PAD;
    const maxHeightCap = Math.min(
        popupMaxHeightCapPx(),
        Math.max(200, vh - VIEWPORT_PAD * 2),
    );

    const spaceAbove = anchorTop - VIEWPORT_PAD - POPUP_GAP;
    const spaceBelow = vh - anchorBottom - VIEWPORT_PAD - POPUP_GAP;
    const preferAbove = spaceAbove >= spaceBelow;

    if (!preferAbove && spaceBelow >= 160) {
        const top = Math.min(anchorBottom + POPUP_GAP, maxBottomY - 160);
        const maxHeight = Math.max(160, Math.min(maxHeightCap, maxBottomY - top));
        return {
            placement: 'below',
            left,
            top: Math.max(VIEWPORT_PAD, top),
            transform: 'translateX(-50%)',
            maxHeight,
        };
    }

    let maxHeight = maxHeightCap;
    let popupBottomY = Math.min(anchorTop - POPUP_GAP, maxBottomY);

    if (popupBottomY - maxHeight < VIEWPORT_PAD) {
        popupBottomY = VIEWPORT_PAD + maxHeight;
    }
    if (popupBottomY > maxBottomY) {
        popupBottomY = maxBottomY;
        maxHeight = Math.max(160, popupBottomY - VIEWPORT_PAD);
    }

    return {
        placement: 'above',
        left,
        bottom: vh - popupBottomY,
        transform: 'translateX(-50%)',
        maxHeight,
    };
}

export type MatchScorePopupProps = {
    position: MatchScorePopupPosition;
    onClose: () => void;
    matchScore: number;
    jobTitle?: string | null;
    scoreBreakdown?: MatchScoreBreakdownData | null;
    parameterMatches?: ParameterMatchesMap | null;
    job?: Record<string, unknown> | null;
    candidate?: Record<string, unknown> | null;
    professionalSummary?: string | null;
    candidateName?: string | null;
    candidateTitle?: string | null;
    loading?: boolean;
    vectorSimilarity?: number | null;
    isExperienceEnabled?: boolean;
};

export const MatchScorePopup: React.FC<MatchScorePopupProps> = ({ position, onClose, ...panelProps }) => {
    const layout = useMemo(() => computeMatchScorePopupStyle(position), [position]);

    const popup = (
        <div
            className="match-score-popup fixed z-[1000] w-72 flex flex-col text-right pointer-events-auto animate-fade-in"
            style={{
                left: layout.left,
                transform: layout.transform,
                maxHeight: layout.maxHeight,
                ...(layout.placement === 'above'
                    ? { bottom: layout.bottom, top: 'auto' as const }
                    : { top: layout.top, bottom: 'auto' as const }),
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="relative flex flex-col min-h-0 overflow-hidden rounded-xl shadow-xl border border-border-default bg-bg-card max-h-full">
                {layout.placement === 'above' ? (
                    <div
                        className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-b border-r border-border-default rotate-45 pointer-events-none z-10"
                        aria-hidden
                    />
                ) : (
                    <div
                        className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-t border-l border-border-default rotate-45 pointer-events-none z-10"
                        aria-hidden
                    />
                )}
                <MatchScoreBreakdownPanel
                    variant="popup"
                    onClose={onClose}
                    className="min-h-0 flex-1 overflow-y-auto custom-scrollbar max-h-full"
                    {...panelProps}
                />
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(popup, document.body) : popup;
};

/** Close popup when clicking outside the panel or score trigger. */
export function useMatchScorePopupDismiss(active: boolean, onClose: () => void) {
    useEffect(() => {
        if (!active) return;
        const handler = (event: MouseEvent) => {
            const target = event.target as Element;
            if (target.closest('.match-score-popup') || target.closest('[data-match-score-trigger]')) return;
            onClose();
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [active, onClose]);
}
