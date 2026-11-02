import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import { CLIENT_JOURNAL_UPDATED_EVENT } from '../utils/clientJournalEvents';
import { fetchProposals, PROPOSALS_UPDATED_EVENT } from '../services/proposalsApi';
import {
    countIncomingMessagesForScope,
    type InboxTaskScope,
} from '../utils/inboxLinkedTasks';
import type { NotificationInboxViewer } from '../services/notificationInboxCounts';
import { fetchNotificationMessageRows } from '../services/notificationMessagesApi';
import { NOTIFICATION_MESSAGES_REFRESH_EVENT } from '../services/notificationInboxCounts';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

const OPEN_EVENT_COUNT_TTL_MS = 60_000;
const openEventCountCache = new Map<string, { at: number; count: number }>();
const openEventCountInflight = new Map<string, Promise<number>>();

export function invalidateOpenEventCountCache(): void {
    openEventCountCache.clear();
}

async function fetchOpenEventCount(url: string, force = false): Promise<number> {
    if (!force) {
        const hit = openEventCountCache.get(url);
        if (hit && Date.now() - hit.at < OPEN_EVENT_COUNT_TTL_MS) return hit.count;
        const pending = openEventCountInflight.get(url);
        if (pending) return pending;
    }

    const promise = fetchJson(url)
        .then((body) => {
            const raw = body && typeof body === 'object' ? (body as { openCount?: unknown }).openCount : 0;
            const count = Number(raw);
            const safe = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
            openEventCountCache.set(url, { at: Date.now(), count: safe });
            return safe;
        })
        .finally(() => {
            if (openEventCountInflight.get(url) === promise) openEventCountInflight.delete(url);
        });
    openEventCountInflight.set(url, promise);
    return promise;
}

export type OrganizationTabIndicators = {
    tasks: number;
    contacts: number;
    jobs: number;
    events: number;
    documents: number;
};

export type ContactTabIndicators = {
    tasks: number;
    events: number;
    proposals: number;
    jobs: number;
};

const emptyOrgIndicators = (): OrganizationTabIndicators => ({
    tasks: 0,
    contacts: 0,
    jobs: 0,
    events: 0,
    documents: 0,
});

const emptyContactIndicators = (): ContactTabIndicators => ({
    tasks: 0,
    events: 0,
    proposals: 0,
    jobs: 0,
});

export function isJobOpenOrFrozen(status: unknown): boolean {
    const s = String(status || '');
    if (s === 'מוקפאת' || s.toLowerCase() === 'frozen' || s.toLowerCase() === 'paused' || s === 'טיוטה') {
        return true;
    }
    if (s === 'סגורה' || s === 'מאוישת' || s.toLowerCase() === 'closed') return false;
    return true;
}

export function isOpenProposalStatus(status: unknown): boolean {
    const s = String(status || 'draft').trim();
    return s === 'draft' || s === 'sent';
}

function orgQuery(organizationId?: string | null, organizationTmpId?: string | null): string {
    if (organizationTmpId) return `?organizationTmpId=${encodeURIComponent(organizationTmpId)}`;
    if (organizationId) return `?organizationId=${encodeURIComponent(organizationId)}`;
    return '';
}

async function fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: authHeaders(true), cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    return res.json();
}

function asList(data: unknown): Record<string, unknown>[] {
    if (Array.isArray(data)) {
        return data.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object');
    }
    const row = data as { data?: unknown; items?: unknown } | null;
    const list = row?.items ?? row?.data;
    if (!Array.isArray(list)) return [];
    return list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}

export async function loadOrganizationTabIndicators(input: {
    clientId: string;
    organizationId?: string | null;
    organizationTmpId?: string | null;
    viewer?: NotificationInboxViewer;
    forceEvents?: boolean;
}): Promise<OrganizationTabIndicators> {
    const { clientId, organizationId, organizationTmpId, viewer, forceEvents = false } = input;
    const base = apiBase();
    if (!base || !clientId) return emptyOrgIndicators();

    const orgQs = orgQuery(organizationId, organizationTmpId);
    const docParams = new URLSearchParams();
    if (organizationId) docParams.set('organizationId', organizationId);
    if (organizationTmpId) docParams.set('organizationTmpId', organizationTmpId);
    const docQs = docParams.toString() ? `?${docParams.toString()}` : '';

    const jobsUrl = organizationId
        ? `${base}/api/organizations/${encodeURIComponent(organizationId)}/jobs?clientId=${encodeURIComponent(clientId)}`
        : null;

    const eventsParams = new URLSearchParams();
    eventsParams.set('openCount', '1');
    if (organizationId) eventsParams.set('organizationId', organizationId);
    if (organizationTmpId) eventsParams.set('organizationTmpId', organizationTmpId);

    const [contactsRes, eventsCountRes, docsRes, jobsRes, inboxRes] = await Promise.allSettled([
        fetchJson(`${base}/api/clients/${encodeURIComponent(clientId)}/contacts${orgQs}`),
        fetchOpenEventCount(
            `${base}/api/clients/${encodeURIComponent(clientId)}/events?${eventsParams.toString()}`,
            forceEvents,
        ),
        fetchJson(`${base}/api/clients/${encodeURIComponent(clientId)}/documents${docQs}`),
        jobsUrl ? fetchJson(jobsUrl) : Promise.resolve([]),
        fetchNotificationMessageRows(base, { summary: true }).catch(() => []),
    ]);

    let tasks = 0;
    if (inboxRes.status === 'fulfilled') {
        const jobIds = new Set<string>();
        if (jobsRes.status === 'fulfilled') {
            for (const row of asList(jobsRes.value)) {
                const id = String(row.id || '').trim();
                if (id) jobIds.add(id);
            }
        }
        const scope: InboxTaskScope = {
            organizationId: organizationId || undefined,
            organizationTmpId: organizationTmpId || undefined,
            organizationJobIds: jobIds.size ? jobIds : undefined,
        };
        tasks = countIncomingMessagesForScope(
            inboxRes.value as Record<string, unknown>[],
            scope,
            viewer,
        );
    }

    let contacts = 0;
    if (contactsRes.status === 'fulfilled') {
        contacts = asList(contactsRes.value).filter((row) => row.isActive !== false).length;
    }

    let events = 0;
    if (eventsCountRes.status === 'fulfilled') {
        events = eventsCountRes.value;
    }

    let documents = 0;
    if (docsRes.status === 'fulfilled') {
        documents = asList(docsRes.value).length;
    }

    let jobs = 0;
    if (jobsRes.status === 'fulfilled') {
        jobs = asList(jobsRes.value).filter((row) => isJobOpenOrFrozen(row.status)).length;
    } else if (!organizationId && organizationTmpId) {
        /* pending org: jobs may not have org endpoint yet */
        jobs = 0;
    }

    return { tasks, contacts, jobs, events, documents };
}

export async function loadContactTabIndicators(input: {
    clientId: string;
    contactId: string;
    contactName?: string | null;
    organizationId?: string | null;
    organizationTmpId?: string | null;
    viewer?: NotificationInboxViewer;
    forceEvents?: boolean;
}): Promise<ContactTabIndicators> {
    const { clientId, contactId, contactName, organizationId, organizationTmpId, viewer, forceEvents = false } = input;
    const base = apiBase();
    if (!base || !clientId || !contactId) return emptyContactIndicators();

    const scopedName = String(contactName || '').trim();

    const contactEventsParams = new URLSearchParams();
    contactEventsParams.set('openCount', '1');
    contactEventsParams.set('contactId', contactId);
    if (scopedName) contactEventsParams.set('contactName', scopedName);
    if (organizationId) contactEventsParams.set('organizationId', organizationId);
    if (organizationTmpId) contactEventsParams.set('organizationTmpId', organizationTmpId);

    const [eventsCountRes, jobsRes, proposalsRes, inboxRes] = await Promise.allSettled([
        fetchOpenEventCount(
            `${base}/api/clients/${encodeURIComponent(clientId)}/events?${contactEventsParams.toString()}`,
            forceEvents,
        ),
        fetchJson(
            `${base}/api/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}/jobs`,
        ),
        fetchProposals({ clientId, contactId }),
        fetchNotificationMessageRows(base, { summary: true }).catch(() => []),
    ]);

    let tasks = 0;
    if (inboxRes.status === 'fulfilled') {
        const scope: InboxTaskScope = {
            contactId,
            contactName: scopedName || undefined,
        };
        tasks = countIncomingMessagesForScope(
            inboxRes.value as Record<string, unknown>[],
            scope,
            viewer,
        );
    }

    let events = 0;
    if (eventsCountRes.status === 'fulfilled') {
        events = eventsCountRes.value;
    }

    let jobs = 0;
    if (jobsRes.status === 'fulfilled') {
        jobs = asList(jobsRes.value).filter((row) => isJobOpenOrFrozen(row.status)).length;
    }

    let proposals = 0;
    if (proposalsRes.status === 'fulfilled') {
        proposals = (proposalsRes.value || []).filter((p) => isOpenProposalStatus(p.status)).length;
    }

    return { tasks, events, proposals, jobs };
}

export function useOrganizationProfileTabIndicators(input: {
    clientId: string | null;
    organizationId?: string | null;
    organizationTmpId?: string | null;
    enabled?: boolean;
    /** Re-fetch when this changes (e.g. active tab). */
    reloadWhen?: unknown;
}): OrganizationTabIndicators {
    const { clientId, organizationId, organizationTmpId, enabled = true, reloadWhen } = input;
    const { user } = useAuth();
    const [indicators, setIndicators] = useState<OrganizationTabIndicators>(emptyOrgIndicators);

    const refresh = useCallback(async (forceEvents = false) => {
        if (!enabled || !clientId) {
            setIndicators(emptyOrgIndicators());
            return;
        }
        try {
            const next = await loadOrganizationTabIndicators({
                clientId,
                organizationId,
                organizationTmpId,
                forceEvents,
                viewer: { email: user?.email, name: user?.name, id: user?.id },
            });
            setIndicators(next);
        } catch {
            setIndicators(emptyOrgIndicators());
        }
    }, [clientId, organizationId, organizationTmpId, enabled, user?.email, user?.name, user?.id]);

    useEffect(() => {
        void refresh(false);
    }, [refresh, reloadWhen]);

    useEffect(() => {
        if (typeof window === 'undefined' || !enabled) return undefined;
        const onJournal = () => {
            invalidateOpenEventCountCache();
            void refresh(true);
        };
        const onInbox = () => {
            void refresh(false);
        };
        window.addEventListener(CLIENT_JOURNAL_UPDATED_EVENT, onJournal);
        window.addEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onInbox);
        return () => {
            window.removeEventListener(CLIENT_JOURNAL_UPDATED_EVENT, onJournal);
            window.removeEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onInbox);
        };
    }, [refresh, enabled]);

    return indicators;
}

export function useContactProfileTabIndicators(input: {
    clientId: string | null;
    contactId: string | null;
    contactName?: string | null;
    organizationId?: string | null;
    organizationTmpId?: string | null;
    enabled?: boolean;
    reloadWhen?: unknown;
}): ContactTabIndicators {
    const {
        clientId,
        contactId,
        contactName,
        organizationId,
        organizationTmpId,
        enabled = true,
        reloadWhen,
    } = input;
    const { user } = useAuth();
    const [indicators, setIndicators] = useState<ContactTabIndicators>(emptyContactIndicators);

    const refresh = useCallback(async (forceEvents = false) => {
        if (!enabled || !clientId || !contactId) {
            setIndicators(emptyContactIndicators());
            return;
        }
        try {
            const next = await loadContactTabIndicators({
                clientId,
                contactId,
                contactName,
                organizationId,
                organizationTmpId,
                forceEvents,
                viewer: { email: user?.email, name: user?.name, id: user?.id },
            });
            setIndicators(next);
        } catch {
            setIndicators(emptyContactIndicators());
        }
    }, [
        clientId,
        contactId,
        contactName,
        organizationId,
        organizationTmpId,
        enabled,
        user?.email,
        user?.name,
        user?.id,
    ]);

    useEffect(() => {
        void refresh(false);
    }, [refresh, reloadWhen]);

    useEffect(() => {
        if (typeof window === 'undefined' || !enabled) return undefined;
        const onJournal = () => {
            invalidateOpenEventCountCache();
            void refresh(true);
        };
        const onProposals = () => {
            void refresh(false);
        };
        window.addEventListener(CLIENT_JOURNAL_UPDATED_EVENT, onJournal);
        window.addEventListener(PROPOSALS_UPDATED_EVENT, onProposals);
        window.addEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onJournal);
        return () => {
            window.removeEventListener(CLIENT_JOURNAL_UPDATED_EVENT, onJournal);
            window.removeEventListener(PROPOSALS_UPDATED_EVENT, onProposals);
            window.removeEventListener(NOTIFICATION_MESSAGES_REFRESH_EVENT, onJournal);
        };
    }, [refresh, enabled]);

    return indicators;
}
