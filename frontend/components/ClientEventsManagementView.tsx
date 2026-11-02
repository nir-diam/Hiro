import React, { useEffect, useMemo, useState } from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import type { MessageModalConfig } from '../hooks/useUIState';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';

type ClientOption = {
  id: string;
  name: string;
  organizationId?: string | null;
  journalEventCount?: number;
};

const ADMIN_EVENTS_CLIENT_STORAGE_KEY = 'hiro.eventsManagement.selectedClientId';

type LinkedOrganizationRow = {
  organizationId?: string | null;
  organization?: { name?: string | null; displayName?: string | null } | null;
  name?: string | null;
};

type Props = {
  openMessageModal: (config: MessageModalConfig) => void;
};

const ClientEventsManagementView: React.FC<Props> = ({ openMessageModal }) => {
  const { user, ready: authReady } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [linkedOrganizations, setLinkedOrganizations] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journalDirty, setJournalDirty] = useState(false);

  useUnsavedChangesGuard(journalDirty);

  useEffect(() => {
    if (!authReady || !apiBase || tenantClientId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/api/clients?journalCounts=1`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('טעינת לקוחות נכשלה');
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setClients(
          list
            .map((c: { id?: string; name?: string; displayName?: string; journalEventCount?: number }) => ({
              id: String(c.id || ''),
              name: String(c.displayName || c.name || '').trim() || 'לקוח',
              journalEventCount: Math.max(0, Number(c.journalEventCount) || 0),
            }))
            .filter((c: ClientOption) => c.id),
        );
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e?.message || 'שגיאה בטעינת לקוחות');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authReady, apiBase, tenantClientId]);

  useEffect(() => {
    if (!authReady || !apiBase || !tenantClientId) {
      setLinkedOrganizations([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/api/clients/${encodeURIComponent(tenantClientId)}/linked-organizations`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('טעינת ארגונים נכשלה');
        return r.json();
      })
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setLinkedOrganizations(
          list
            .map((raw: LinkedOrganizationRow) => {
              const orgId = raw.organizationId ? String(raw.organizationId) : '';
              if (!orgId) return null;
              const org = raw.organization;
              const name =
                String(org?.name || org?.displayName || raw.name || '').trim() || 'ארגון';
              return {
                id: tenantClientId,
                name,
                organizationId: orgId,
              } satisfies ClientOption;
            })
            .filter((row): row is ClientOption => Boolean(row)),
        );
      })
      .catch((e: Error) => {
        if (!active) return;
        setError(e?.message || 'שגיאה בטעינת ארגונים');
        setLinkedOrganizations([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authReady, apiBase, tenantClientId]);

  const clientOptions = useMemo<ClientOption[]>(() => {
    if (isPlatformAdmin) return clients;
    if (tenantClientId) {
      return linkedOrganizations.length
        ? linkedOrganizations
        : [{ id: tenantClientId, name: 'הלקוח שלי' }];
    }
    return [];
  }, [isPlatformAdmin, clients, tenantClientId, linkedOrganizations]);

  const defaultClientId = useMemo(() => {
    if (!isPlatformAdmin) return tenantClientId;
    if (typeof sessionStorage !== 'undefined') {
      try {
        const saved = String(sessionStorage.getItem(ADMIN_EVENTS_CLIENT_STORAGE_KEY) || '').trim();
        const savedClient = clients.find((c) => c.id === saved);
        if (savedClient && (savedClient.journalEventCount ?? 0) > 0) return saved;
      } catch {
        // ignore
      }
    }
    const withEvents = clients.filter((c) => (c.journalEventCount ?? 0) > 0);
    if (withEvents.length) {
      return withEvents.reduce((best, c) =>
        (c.journalEventCount ?? 0) > (best.journalEventCount ?? 0) ? c : best,
      ).id;
    }
    return clients[0]?.id || null;
  }, [isPlatformAdmin, tenantClientId, clients]);

  if (!authReady) {
    return <div className="text-center py-16 text-text-muted">טוען...</div>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100dvh-10rem)]">
      {error ? (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}
      {loading && clientOptions.length === 0 ? (
        <div className="text-center py-16 text-text-muted">טוען...</div>
      ) : (
        <ClientsEventsJournalTab
          clientOptions={clientOptions}
          defaultClientId={defaultClientId}
          crossClientJournal={isPlatformAdmin}
          openMessageModal={openMessageModal}
          onDirtyChange={setJournalDirty}
        />
      )}
    </div>
  );
};

export default ClientEventsManagementView;
