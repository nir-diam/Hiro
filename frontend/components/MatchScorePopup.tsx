import React, { useEffect, useMemo } from 'react';
import { clampCenteredPopoverX } from '../utils/clampPopoverPosition';
import {
    MatchScoreBreakdownPanel,
    type MatchScoreBreakdownData,
    type ParameterMatchesMap,
} from './MatchScoreBreakdownPanel';

export const MATCH_SCORE_POPUP_WIDTH = 288;

export function matchScorePopupPositionFromEvent(
    e: Pick<React.MouseEvent, 'currentTarget'>,
): { x: number; y: number } {
    const target = e.currentTarget;
    if (!(target instanceof Element)) {
        if (typeof window !== 'undefined') {
            return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        }
        return { x: 0, y: 0 };
    }
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.bottom + 8 };
}

export type MatchScorePopupProps = {
    position: { x: number; y: number };
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
    const popupStyle = useMemo(() => {
        if (typeof window === 'undefined') {
            return { top: position.y, left: position.x, transform: 'translate(-50%, calc(-100% - 12px))' as const };
        }
        const left = clampCenteredPopoverX(position.x, MATCH_SCORE_POPUP_WIDTH);
        const top = Math.max(12, position.y);
        return { top, left, transform: 'translate(-50%, calc(-100% - 12px))' as const };
    }, [position.x, position.y]);

    return (
        <div
            className="match-score-popup fixed z-[1000] w-72 max-h-[min(75vh,28rem)] text-right pointer-events-auto animate-fade-in"
            style={popupStyle}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="relative overflow-hidden rounded-xl shadow-xl border border-border-default bg-bg-card">
                <div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-bg-card border-b border-r border-border-default rotate-45 pointer-events-none z-10"
                    aria-hidden
                />
                <MatchScoreBreakdownPanel
                    variant="popup"
                    onClose={onClose}
                    className="max-h-[min(75vh,28rem)] overflow-y-auto custom-scrollbar"
                    {...panelProps}
                />
            </div>
        </div>
    );
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
