import React, { useEffect, useMemo, useState } from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';

type ClientOption = { id: string; name: string };

const ClientEventsManagementView: React.FC = () => {
  const { user, ready: authReady } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !apiBase || tenantClientId) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/api/clients`, {
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
            .map((c: { id?: string; name?: string; displayName?: string }) => ({
              id: String(c.id || ''),
              name: String(c.displayName || c.name || '').trim() || 'לקוח',
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

  const clientOptions = useMemo<ClientOption[]>(() => {
    if (isPlatformAdmin) return clients;
    if (tenantClientId) return [{ id: tenantClientId, name: 'הלקוח שלי' }];
    return [];
  }, [isPlatformAdmin, clients, tenantClientId]);

  const defaultClientId = isPlatformAdmin ? clients[0]?.id || null : tenantClientId;

  if (!authReady) {
    return <div className="text-center py-16 text-text-muted">טוען...</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
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
        />
      )}
    </div>
  );
};

export default ClientEventsManagementView;
