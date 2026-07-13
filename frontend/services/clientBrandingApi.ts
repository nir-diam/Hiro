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

export async function fetchClientBranding(clientId: string): Promise<ClientBranding> {
  const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load client branding');
  const data = await res.json();
  return {
    logoUrl: data.logoUrl?.trim() || null,
    primaryColor: data.primaryColor?.trim() || null,
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
    logoUrl: data.logoUrl?.trim() || null,
    primaryColor: data.primaryColor?.trim() || null,
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
