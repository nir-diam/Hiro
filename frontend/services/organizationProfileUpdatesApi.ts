const apiBase = () => (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '';

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

async function parseErr(res: Response): Promise<string> {
    try {
        const j = (await res.json()) as { message?: string };
        return j.message || res.statusText || 'Request failed';
    } catch {
        return res.statusText || 'Request failed';
    }
}

export type OrgProfileAdditionalLocation = {
    description: string;
    location: string;
    address?: string;
};

export type OrgProfileFields = {
    mainField?: string;
    mainField2?: string[];
    subField?: string[];
    secondaryField?: string;
    employeeCount?: string;
    structure?: string;
    location?: string;
    website?: string;
    subsidiaries?: string[];
    additionalLocations?: OrgProfileAdditionalLocation[];
};

export type OrgProfileUpdateDto = {
    id: string;
    clientId: string;
    organizationId: string;
    status: 'pending' | 'approved' | 'rejected' | 'superseded';
    previousFields: OrgProfileFields;
    proposedFields: OrgProfileFields;
    submittedByUserId?: string | null;
    submittedByName?: string | null;
    reviewedByUserId?: string | null;
    reviewedByName?: string | null;
    reviewedAt?: string | null;
    reviewNote?: string | null;
    createdAt: string;
    updatedAt: string;
    clientName?: string | null;
    organizationName?: string | null;
    clientGamificationPoints?: number;
};

export const ORG_PROFILE_FIELD_KEYS: (keyof OrgProfileFields)[] = [
    'mainField',
    'mainField2',
    'subField',
    'secondaryField',
    'employeeCount',
    'structure',
    'subsidiaries',
    'location',
    'additionalLocations',
    'website',
];

function profileFieldComparable(key: keyof OrgProfileFields, value: unknown): string {
    if (key === 'additionalLocations' && Array.isArray(value)) {
        return JSON.stringify(
            value.map((item) => ({
                description: String((item as OrgProfileAdditionalLocation)?.description || '').trim(),
                location: String((item as OrgProfileAdditionalLocation)?.location || '').trim(),
                address: String((item as OrgProfileAdditionalLocation)?.address || '').trim(),
            })),
        );
    }
    return formatOrgProfileFieldValue(key, value);
}

export function changedOrgProfileFieldKeys(row: OrgProfileUpdateDto): (keyof OrgProfileFields)[] {
    const prev = row.previousFields || {};
    const next = row.proposedFields || {};
    return ORG_PROFILE_FIELD_KEYS.filter((key) => {
        const a = profileFieldComparable(key, prev[key]);
        const b = profileFieldComparable(key, next[key]);
        return a !== b;
    });
}

export const ORG_PROFILE_UPDATE_STATUS_LABELS: Record<
    OrgProfileUpdateDto['status'],
    { label: string; className: string }
> = {
    pending: { label: 'ממתין לאישור', className: 'bg-amber-100 text-amber-800' },
    approved: { label: 'אושר', className: 'bg-emerald-100 text-emerald-800' },
    rejected: { label: 'נדחה', className: 'bg-rose-100 text-rose-800' },
    superseded: { label: 'הוחלף', className: 'bg-gray-100 text-gray-600' },
};

export async function fetchClientOrgProfileUpdateHistory(
    clientId: string,
    params?: { page?: number; limit?: number },
): Promise<{
    data: OrgProfileUpdateDto[];
    total: number;
    page: number;
    totalPages: number;
    clientGamificationPoints?: number;
}> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/organization-profile-updates${qs ? `?${qs}` : ''}`,
        { headers: authHeaders() },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function fetchPendingOrgProfileUpdate(
    clientId: string,
    organizationId?: string | null,
): Promise<OrgProfileUpdateDto | null> {
    const q = organizationId?.trim()
        ? `?organizationId=${encodeURIComponent(organizationId.trim())}`
        : '';
    const res = await fetch(`${apiBase()}/api/clients/${clientId}/organization-profile-updates/pending${q}`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const data = await res.json();
    return data && data.id ? data : null;
}

export async function submitOrgProfileUpdate(
    clientId: string,
    fields: OrgProfileFields,
    organizationId?: string | null,
): Promise<OrgProfileUpdateDto> {
    const q = organizationId?.trim()
        ? `?organizationId=${encodeURIComponent(organizationId.trim())}`
        : '';
    const res = await fetch(`${apiBase()}/api/clients/${clientId}/organization-profile-updates${q}`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export type OrgProfileUpdatesListResult = {
    data: OrgProfileUpdateDto[];
    total: number;
    page: number;
    totalPages: number;
};

export async function fetchOrgProfileUpdates(params: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
}): Promise<OrgProfileUpdatesListResult> {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    if (params.search?.trim()) q.set('search', params.search.trim());
    const res = await fetch(`${apiBase()}/api/organizations/profile-updates?${q}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

function reviewedAtMs(row: OrgProfileUpdateDto): number {
    const raw = row.reviewedAt || row.updatedAt || row.createdAt;
    const t = raw ? Date.parse(raw) : NaN;
    return Number.isFinite(t) ? t : 0;
}

/** Approved + rejected; works even when the API has no combined `status=handled` filter. */
export async function fetchOrgProfileUpdatesHandled(params: {
    limit?: number;
    search?: string;
} = {}): Promise<OrgProfileUpdatesListResult> {
    const limit = params.limit ?? 100;
    const search = params.search;
    const [approved, rejected] = await Promise.all([
        fetchOrgProfileUpdates({ status: 'approved', limit, search }),
        fetchOrgProfileUpdates({ status: 'rejected', limit, search }),
    ]);
    const data = [...approved.data, ...rejected.data].sort((a, b) => reviewedAtMs(b) - reviewedAtMs(a));
    const total = approved.total + rejected.total;
    return {
        data,
        total,
        page: 1,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function countOrgProfileUpdatesHandled(search?: string): Promise<number> {
    const res = await fetchOrgProfileUpdatesHandled({ limit: 1, search });
    return res.total;
}

export async function fetchOrgProfileUpdatesPendingCount(): Promise<number> {
    const res = await fetch(`${apiBase()}/api/organizations/profile-updates/pending-count`, {
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const j = (await res.json()) as { count?: number };
    return Number(j.count) || 0;
}

export async function approveOrgProfileUpdate(id: string): Promise<OrgProfileUpdateDto> {
    const res = await fetch(`${apiBase()}/api/organizations/profile-updates/${id}/approve`, {
        method: 'POST',
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export async function rejectOrgProfileUpdate(id: string, reviewNote?: string): Promise<OrgProfileUpdateDto> {
    const res = await fetch(`${apiBase()}/api/organizations/profile-updates/${id}/reject`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ reviewNote: reviewNote || null }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    return res.json();
}

export const ORG_PROFILE_FIELD_LABELS: Record<keyof OrgProfileFields, string> = {
    mainField: 'תעשייה (ראשי)',
    mainField2: 'תעשייה (משני)',
    subField: 'תחום עיסוק',
    secondaryField: 'תחום עיסוק משני',
    employeeCount: 'כמות עובדים',
    structure: 'סוג בעלות',
    location: 'מיקום ראשי',
    subsidiaries: 'חברות בנות',
    additionalLocations: 'מיקומים נוספים',
    website: 'אתר',
};

export function formatOrgProfileFieldValue(key: keyof OrgProfileFields, value: unknown): string {
    if (value == null) return '—';
    if (key === 'additionalLocations' && Array.isArray(value)) {
        const parts = value
            .map((item) => {
                if (!item || typeof item !== 'object') return '';
                const loc = item as OrgProfileAdditionalLocation;
                return [loc.description, loc.location, loc.address].filter(Boolean).join(' · ');
            })
            .filter(Boolean);
        return parts.length ? parts.join(' | ') : '—';
    }
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
    const s = String(value).trim();
    return s || '—';
}

export function industryDisplayFromFields(f: OrgProfileFields): string {
    const parts = [f.mainField, ...(f.mainField2 || [])].map((x) => String(x || '').trim()).filter(Boolean);
    return parts.join(' · ') || '—';
}
