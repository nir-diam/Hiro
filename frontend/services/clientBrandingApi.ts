const apiBase = () => import.meta.env.VITE_API_BASE || '';

const authHeaders = (json = false): Record<string, string> => {
  const token = localStorage.getItem('token');
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (json) h['Content-Type'] = 'application/json';
  return h;
};

export type ClientBranding = {
  logoUrl: string | null;
  primaryColor: string | null;
};

const GOOGLE_FAVICON_MARKER = 'google.com/s2/favicons';

function trimLogo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function isGoogleFaviconUrl(url: string): boolean {
  return url.includes(GOOGLE_FAVICON_MARKER);
}

/** Match ClientsListView / contact logo resolution — client row, metadata, linked org. */
export function resolveClientLogoUrl(data: Record<string, unknown>): string | null {
  const candidates: string[] = [];
  const push = (v: unknown) => {
    const s = trimLogo(v);
    if (s) candidates.push(s);
  };

  push(data.logoUrl);
  const meta = data.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    push((meta as Record<string, unknown>).logo);
  }

  const links = Array.isArray(data.organizationLinks) ? data.organizationLinks : [];
  const sorted = [...links].sort((a, b) => {
    const ap = a && typeof a === 'object' && (a as Record<string, unknown>).isPrimary ? 1 : 0;
    const bp = b && typeof b === 'object' && (b as Record<string, unknown>).isPrimary ? 1 : 0;
    return bp - ap;
  });
  for (const link of sorted) {
    if (!link || typeof link !== 'object') continue;
    const org = (link as Record<string, unknown>).organization;
    if (org && typeof org === 'object') {
      push((org as Record<string, unknown>).logo);
    }
  }

  if (!candidates.length) return null;
  const preferred = candidates.find((url) => !isGoogleFaviconUrl(url));
  return preferred ?? candidates[0];
}

export async function fetchClientBranding(clientId: string): Promise<ClientBranding> {
  const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load client branding');
  const data = await res.json();
  return {
    logoUrl: resolveClientLogoUrl(data),
    primaryColor: trimLogo(data.primaryColor),
  };
}

export async function saveClientBranding(
  clientId: string,
  branding: Partial<ClientBranding>,
): Promise<ClientBranding> {
  const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify({
      logoUrl: branding.logoUrl ?? undefined,
      primaryColor: branding.primaryColor ?? undefined,
    }),
  });
  if (!res.ok) throw new Error('Failed to save client branding');
  const data = await res.json();
  return {
    logoUrl: resolveClientLogoUrl(data),
    primaryColor: trimLogo(data.primaryColor),
  };
}

export async function uploadClientLogo(clientId: string, file: File): Promise<string> {
  const presignRes = await fetch(
    `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/documents/upload-url`,
    {
      method: 'POST',
      headers: authHeaders(true),
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || 'image/png',
      }),
    },
  );
  if (!presignRes.ok) throw new Error('Failed to prepare logo upload');
  const { uploadUrl, publicUrl } = await presignRes.json();
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'image/png' },
  });
  if (!uploadRes.ok) throw new Error('Logo upload failed');
  return publicUrl as string;
}
