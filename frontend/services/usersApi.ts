const apiBase = () => import.meta.env.VITE_API_BASE || '';

export type StaffUserDto = {
    id: string;
    email: string;
    name: string | null;
    role: string;
    phone: string | null;
    extension: string | null;
    isActive: boolean;
    clientId?: string | null;
    dataScope?: { candidates?: string; jobs?: string };
    permissions?: Record<string, boolean>;
    createdAt?: string;
    updatedAt?: string;
};

function authHeaders(): HeadersInit {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

export type ClientOptionDto = { id: string; name: string };

export async function fetchClientOptions(): Promise<ClientOptionDto[]> {
    const res = await fetch(`${apiBase()}/api/clients`, { headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load clients');
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return [];
    return rows.map((c: any) => ({
        id: String(c.id),
        name: String(c.displayName || c.name || c.id),
    }));
}

export async function fetchStaffUsers(): Promise<StaffUserDto[]> {
    const res = await fetch(`${apiBase()}/api/users`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load users');
    return res.json();
}

export async function fetchStaffUser(id: string): Promise<StaffUserDto> {
    const res = await fetch(`${apiBase()}/api/users/${id}`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to load user');
    return res.json();
}

export async function createStaffUser(body: {
    email: string;
    /** Omit when invite is true — server sends activation email */
    password?: string;
    /** Default flow from Coordinators settings: email with activation link */
    invite?: boolean;
    name: string;
    role: 'manager' | 'recruiter';
    phone?: string;
    extension?: string;
    /** Required when logged in as platform admin (super_admin / admin) */
    clientId?: string | null;
}): Promise<StaffUserDto & { inviteSent?: boolean; message?: string }> {
    const res = await fetch(`${apiBase()}/api/users`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to create user');
    return res.json();
}

export async function updateStaffUser(
    id: string,
    body: Partial<{
        name: string;
        email: string;
        phone: string;
        extension: string;
        isActive: boolean;
        role: 'manager' | 'recruiter';
        dataScope: { candidates: string; jobs: string };
        permissions: Record<string, boolean>;
        password: string;
        clientId: string | null;
    }>,
): Promise<StaffUserDto> {
    const res = await fetch(`${apiBase()}/api/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed to update user');
    return res.json();
}
