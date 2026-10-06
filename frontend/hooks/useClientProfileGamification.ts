import { useCallback, useEffect, useState } from 'react';
import {
    CLIENT_GAMIFICATION_UPDATED_EVENT,
    CLIENT_PROFILE_UPDATES_REVIEW_SEEN_EVENT,
    getProfileUpdatesHistorySeenAt,
    markProfileUpdatesHistorySeen,
} from '../utils/clientGamification';
import {
    fetchClientOrgProfileUpdateHistory,
    type OrgProfileUpdateDto,
} from '../services/organizationProfileUpdatesApi';

function hasUnseenReviewRows(rows: OrgProfileUpdateDto[], clientId: string): boolean {
    const seenAt = getProfileUpdatesHistorySeenAt(clientId);
    return rows.some((row) => {
        if (row.status !== 'approved' && row.status !== 'rejected') return false;
        if (!row.reviewedAt) return false;
        const t = new Date(row.reviewedAt).getTime();
        return Number.isFinite(t) && t > seenAt;
    });
}

export function useClientProfileGamification(tenantClientId: string | null) {
    const [points, setPoints] = useState(0);
    const [hasUnseenReview, setHasUnseenReview] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    const refresh = useCallback(async () => {
        if (!tenantClientId) {
            setPoints(0);
            setHasUnseenReview(false);
            return;
        }
        try {
            const res = await fetchClientOrgProfileUpdateHistory(tenantClientId, { limit: 30 });
            if (typeof res.clientGamificationPoints === 'number') {
                setPoints(Math.max(0, Math.floor(res.clientGamificationPoints)));
            } else {
                setPoints(0);
            }
            setHasUnseenReview(hasUnseenReviewRows(res.data, tenantClientId));
        } catch {
            setPoints(0);
            setHasUnseenReview(false);
        }
    }, [tenantClientId]);

    const openHistory = useCallback(() => {
        if (tenantClientId) {
            markProfileUpdatesHistorySeen(tenantClientId);
            setHasUnseenReview(false);
        }
        setHistoryOpen(true);
    }, [tenantClientId]);

    const closeHistory = useCallback(() => {
        setHistoryOpen(false);
        void refresh();
    }, [refresh]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const onGamificationUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ clientId?: string; points?: number }>).detail;
            if (!tenantClientId || detail?.clientId !== tenantClientId) return;
            if (typeof detail.points === 'number') {
                setPoints(Math.max(0, Math.floor(detail.points)));
            }
            void refresh();
        };
        const onReviewSeen = (event: Event) => {
            const detail = (event as CustomEvent<{ clientId?: string }>).detail;
            if (tenantClientId && detail?.clientId === tenantClientId) {
                setHasUnseenReview(false);
            }
        };
        window.addEventListener(CLIENT_GAMIFICATION_UPDATED_EVENT, onGamificationUpdated);
        window.addEventListener(CLIENT_PROFILE_UPDATES_REVIEW_SEEN_EVENT, onReviewSeen);
        return () => {
            window.removeEventListener(CLIENT_GAMIFICATION_UPDATED_EVENT, onGamificationUpdated);
            window.removeEventListener(CLIENT_PROFILE_UPDATES_REVIEW_SEEN_EVENT, onReviewSeen);
        };
    }, [tenantClientId, refresh]);

    return {
        points,
        hasUnseenReview,
        historyOpen,
        openHistory,
        closeHistory,
        refresh,
    };
}
