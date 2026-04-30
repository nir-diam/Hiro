const apiBase = () => import.meta.env.VITE_API_BASE || '';

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

export type RecruitmentStatusDto = {
    id: string;
    clientId?: string;
    sortIndex?: number;
    group: string;
    name: string;
    textColor: string;
    isActive: boolean;
};

export async function fetchRecruitmentStatuses(clientId: string): Promise<RecruitmentStatusDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-statuses`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { statuses?: RecruitmentStatusDto[] };
    return Array.isArray(json.statuses) ? json.statuses : [];
}

/** Full sync — send ordered rows; omit id or temp ids for creates. */
export async function syncRecruitmentStatuses(
    clientId: string,
    statuses: Omit<RecruitmentStatusDto, 'sortIndex'>[],
): Promise<RecruitmentStatusDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-statuses`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
            statuses: statuses.map((s) => ({
                id: s.id,
                group: s.group,
                statusGroup: s.group,
                name: s.name,
                textColor: s.textColor,
                isActive: s.isActive,
            })),
        }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { statuses?: RecruitmentStatusDto[] };
    return Array.isArray(json.statuses) ? json.statuses : [];
}
