import React, { useEffect, useState } from 'react';
import { ClockIcon } from './Icons';
import AuditHistoryRow from './AuditHistoryRow';
import { authHeaders } from '../utils/authHeaders';
import { buildContactHistoryEntries, type ContactHistoryEntry } from '../utils/contactEventHistory';

interface ContactHistoryTabProps {
  clientId: string;
  contactId: string;
  contactName?: string;
  organizationId?: string | null;
}

const ContactHistoryTab: React.FC<ContactHistoryTabProps> = ({
  clientId,
  contactId,
  contactName = '',
  organizationId,
}) => {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [entries, setEntries] = useState<ContactHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiBase || !clientId || !contactId) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ summary: '1', limit: '200' });
    if (organizationId) qs.set('organizationId', String(organizationId));

    fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/events?${qs.toString()}`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('טעינת ההיסטוריה נכשלה');
        return res.json();
      })
      .then((payload) => {
        if (!active) return;
        const list = Array.isArray(payload) ? payload : payload?.data ?? [];
        setEntries(
          buildContactHistoryEntries(
            list.filter((row: unknown): row is Record<string, unknown> => !!row && typeof row === 'object'),
            contactId,
            contactName,
          ),
        );
      })
      .catch((err: unknown) => {
        if (!active || (err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'טעינת ההיסטוריה נכשלה');
        setEntries([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase, clientId, contactId, contactName, organizationId]);

  return (
    <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-4 sm:p-6">
      <header className="flex items-center gap-2 mb-4 pb-4 border-b border-border-default">
        <ClockIcon className="w-5 h-5 text-primary-600" />
        <div>
          <h2 className="text-lg font-bold text-text-default">היסטוריית איש קשר</h2>
          <p className="text-xs text-text-muted">
            {contactName
              ? `פעילות ואירועים הקשורים ל${contactName} בלבד`
              : 'פעילות ואירועים הקשורים לאיש הקשר הנוכחי בלבד'}
          </p>
        </div>
      </header>

      {loading && (
        <div className="py-12 text-center text-text-muted text-sm">טוען היסטוריה...</div>
      )}

      {!loading && error && (
        <div className="py-8 text-center text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="py-12 text-center text-text-muted text-sm">אין היסטוריית פעילות להצגה</div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div className="space-y-3">
          <div className="hidden md:grid md:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_100px_minmax(0,2fr)] gap-4 px-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            <span>מתי</span>
            <span>מי</span>
            <span>פעולה</span>
            <span>תיאור השינוי</span>
          </div>
          {entries.map((entry) => (
            <AuditHistoryRow
              key={entry.id}
              timestamp={entry.timestamp}
              actor={entry.actor || undefined}
              userName={entry.actor || undefined}
              actionLabel={entry.actionLabel}
              description={entry.description}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ContactHistoryTab;
