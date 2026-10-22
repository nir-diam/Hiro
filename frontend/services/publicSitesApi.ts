const apiBase = () => import.meta.env.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export type PublicSiteKeyDto = {
  id: string;
  name: string;
  keyPrefix: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  requestCount?: number;
};

export type PublicSiteDto = {
  id: string;
  name: string;
  domain: string;
  scope: 'aggregator' | 'tenant';
  clientId?: string | null;
  environment: 'test' | 'production';
  webhookUrl?: string | null;
  webhookConfigured?: boolean;
  recruitmentSourceName?: string | null;
  keys?: PublicSiteKeyDto[];
};

export type PublicSiteOption = {
  id: string;
  name: string;
  domain: string;
  scope: 'aggregator' | 'tenant';
  environment: 'test' | 'production';
};

async function parseErr(res: Response): Promise<string> {
  try {
    const body = await res.json() as { message?: string };
    return body.message || res.statusText;
  } catch {
    return res.statusText || 'Request failed';
  }
}

export async function fetchPublicSites(): Promise<PublicSiteDto[]> {
  const res = await fetch(`${apiBase()}/api/public-sites`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseErr(res));
  const json = await res.json() as { sites?: PublicSiteDto[] };
  return json.sites || [];
}

export async function createPublicSite(body: Record<string, unknown>): Promise<{ site: PublicSiteDto; webhookSecret: string }> {
  const res = await fetch(`${apiBase()}/api/public-sites`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function updatePublicSite(id: string, body: Record<string, unknown>): Promise<PublicSiteDto> {
  const res = await fetch(`${apiBase()}/api/public-sites/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function createPublicSiteKey(siteId: string, name: string): Promise<{ key: string; keyPrefix: string }> {
  const res = await fetch(`${apiBase()}/api/public-sites/${encodeURIComponent(siteId)}/keys`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function revokePublicSiteKey(siteId: string, keyId: string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/public-sites/${encodeURIComponent(siteId)}/keys/${encodeURIComponent(keyId)}/revoke`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErr(res));
}

export async function rotatePublicSiteWebhookSecret(siteId: string): Promise<{ webhookSecret: string }> {
  const res = await fetch(`${apiBase()}/api/public-sites/${encodeURIComponent(siteId)}/webhook-secret`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseErr(res));
  return res.json();
}

export async function fetchPublicSiteDeliveries(siteId: string): Promise<Array<{ id: string; event: string; status: string; attempts: number; lastError?: string | null; createdAt?: string }>> {
  const res = await fetch(`${apiBase()}/api/public-sites/${encodeURIComponent(siteId)}/deliveries`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseErr(res));
  const json = await res.json() as { deliveries?: Array<{ id: string; event: string; status: string; attempts: number; lastError?: string | null; createdAt?: string }> };
  return json.deliveries || [];
}

export async function fetchPublishSiteOptions(clientId?: string | null): Promise<PublicSiteOption[]> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  const res = await fetch(`${apiBase()}/api/public-sites/options${query}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseErr(res));
  const json = await res.json() as { sites?: PublicSiteOption[] };
  return json.sites || [];
}
