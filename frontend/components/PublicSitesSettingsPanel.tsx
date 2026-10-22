import React, { useEffect, useState } from 'react';
import {
  createPublicSite,
  createPublicSiteKey,
  fetchPublicSiteDeliveries,
  fetchPublicSites,
  revokePublicSiteKey,
  rotatePublicSiteWebhookSecret,
  updatePublicSite,
  type PublicSiteDto,
} from '../services/publicSitesApi';

type ClientOption = { id: string; name?: string; displayName?: string; label?: string };

const PublicSitesSettingsPanel: React.FC<{ clientOptions?: ClientOption[] }> = ({ clientOptions = [] }) => {
  const [sites, setSites] = useState<PublicSiteDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [secretNotice, setSecretNotice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [scope, setScope] = useState<'aggregator' | 'tenant'>('tenant');
  const [environment, setEnvironment] = useState<'test' | 'production'>('test');
  const [clientId, setClientId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [deliveries, setDeliveries] = useState<Record<string, string>>({});

  const reload = async () => {
    setSites(await fetchPublicSites());
  };

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  const onCreate = async () => {
    setError(null);
    setSecretNotice(null);
    try {
      const created = await createPublicSite({
        name,
        domain,
        scope,
        environment,
        clientId: scope === 'tenant' ? clientId : null,
        webhookUrl: webhookUrl || null,
      });
      setSecretNotice(`Webhook secret (מוצג פעם אחת): ${created.webhookSecret}`);
      setName('');
      setDomain('');
      setWebhookUrl('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'יצירה נכשלה');
    }
  };

  const showDeliveries = async (siteId: string) => {
    const rows = await fetchPublicSiteDeliveries(siteId);
    setDeliveries((prev) => ({
      ...prev,
      [siteId]: rows.length
        ? rows.map((row) => `${row.createdAt || ''} ${row.event} ${row.status} (${row.attempts})${row.lastError ? ` — ${row.lastError}` : ''}`).join('\n')
        : 'אין שליחות',
    }));
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <div>
        <h2 className="text-lg font-bold text-text-default">אתרים ומפתחות</h2>
        <p className="text-sm text-text-muted mt-1">
          כל אתר הוא מפתח שרת-לשרת. מאגד רואה כל ארגון שהפעיל פרסום ב-Hiro. אתר ארגון רואה רק את המשרות של הלקוח שלו. אפשר שני מפתחות פעילים בזמן החלפה.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {secretNotice && <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 break-all">{secretNotice}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-border-default rounded-xl p-4">
        <input className="border rounded-lg p-2" placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="border rounded-lg p-2" placeholder="דומיין (hiro.co.il)" value={domain} onChange={(e) => setDomain(e.target.value)} dir="ltr" />
        <select className="border rounded-lg p-2" value={scope} onChange={(e) => setScope(e.target.value as 'aggregator' | 'tenant')}>
          <option value="tenant">ארגון</option>
          <option value="aggregator">מאגד</option>
        </select>
        <select className="border rounded-lg p-2" value={environment} onChange={(e) => setEnvironment(e.target.value as 'test' | 'production')}>
          <option value="test">בדיקות</option>
          <option value="production">ייצור</option>
        </select>
        {scope === 'tenant' && (
          <select className="border rounded-lg p-2 md:col-span-2" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">בחרו ארגון</option>
            {clientOptions.map((client) => (
              <option key={client.id} value={client.id}>{client.displayName || client.name || client.label || client.id}</option>
            ))}
          </select>
        )}
        <input className="border rounded-lg p-2 md:col-span-2" placeholder="כתובת webhook (https://…/api/revalidate)" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} dir="ltr" />
        <button type="button" className="bg-primary-600 text-white font-bold rounded-lg px-4 py-2" onClick={() => void onCreate()}>יצירת אתר</button>
      </div>

      {sites.map((site) => (
        <article key={site.id} className="border border-border-default rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <h3 className="font-bold">{site.name}</h3>
              <p className="text-sm text-text-muted" dir="ltr">{site.domain} · {site.scope} · {site.environment}</p>
            </div>
            <p className="text-xs text-text-muted">{site.webhookConfigured ? 'webhook מוגדר' : 'אין secret'}</p>
          </div>
          <input
            className="border rounded-lg p-2 w-full"
            dir="ltr"
            defaultValue={site.webhookUrl || ''}
            placeholder="webhook URL"
            onBlur={(e) => {
              if (e.target.value !== (site.webhookUrl || '')) {
                updatePublicSite(site.id, { webhookUrl: e.target.value }).then(reload).catch((err: Error) => setError(err.message));
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-sm border rounded-lg px-3 py-1" onClick={() => {
              const keyName = window.prompt('שם המפתח', `${site.name} key`);
              if (!keyName) return;
              createPublicSiteKey(site.id, keyName).then((created) => {
                setSecretNotice(`מפתח חדש (מוצג פעם אחת): ${created.key}`);
                return reload();
              }).catch((err: Error) => setError(err.message));
            }}>הפקת מפתח</button>
            <button type="button" className="text-sm border rounded-lg px-3 py-1" onClick={() => {
              rotatePublicSiteWebhookSecret(site.id).then((created) => {
                setSecretNotice(`Webhook secret חדש (מוצג פעם אחת): ${created.webhookSecret}`);
              }).catch((err: Error) => setError(err.message));
            }}>החלפת secret</button>
            <button type="button" className="text-sm border rounded-lg px-3 py-1" onClick={() => showDeliveries(site.id).catch((err: Error) => setError(err.message))}>לוג שליחות</button>
          </div>
          <ul className="text-sm space-y-1">
            {(site.keys || []).map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-2">
                <span dir="ltr">{key.keyPrefix}…</span>
                <span>{key.name}</span>
                <span className="text-text-muted">קריאות {key.requestCount || 0}</span>
                <span className="text-text-muted">{key.lastUsedAt ? `שימוש אחרון ${new Date(key.lastUsedAt).toLocaleString('he-IL')}` : 'טרם נעשה שימוש'}</span>
                {key.revokedAt ? <span>מבוטל</span> : (
                  <button type="button" className="text-red-600" onClick={() => revokePublicSiteKey(site.id, key.id).then(reload).catch((err: Error) => setError(err.message))}>ביטול</button>
                )}
              </li>
            ))}
          </ul>
          {deliveries[site.id] && <pre className="text-xs bg-bg-subtle rounded-lg p-2 whitespace-pre-wrap">{deliveries[site.id]}</pre>}
        </article>
      ))}
    </div>
  );
};

export default PublicSitesSettingsPanel;
