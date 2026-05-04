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

export type RecruitmentSourceDto = {
    id: string;
    clientId?: string;
    sortIndex?: number;
    name: string;
    addresses: string;
    exclusivityMonths: number;
};

export async function fetchRecruitmentSources(clientId: string): Promise<RecruitmentSourceDto[]> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-sources`, {
        headers: authHeaders(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { sources?: RecruitmentSourceDto[] };
    return Array.isArray(json.sources) ? json.sources : [];
}

export async function createRecruitmentSource(
    clientId: string,
    body: Pick<RecruitmentSourceDto, 'name' | 'addresses' | 'exclusivityMonths'>,
): Promise<RecruitmentSourceDto> {
    const res = await fetch(`${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-sources`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            name: body.name,
            addresses: body.addresses,
            exclusivityMonths: body.exclusivityMonths,
        }),
    });
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { source?: RecruitmentSourceDto };
    if (!json.source) throw new Error('Invalid response');
    return json.source;
}

export async function updateRecruitmentSource(
    clientId: string,
    sourceId: string,
    body: Pick<RecruitmentSourceDto, 'name' | 'addresses' | 'exclusivityMonths'>,
): Promise<RecruitmentSourceDto> {
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-sources/${encodeURIComponent(sourceId)}`,
        {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({
                name: body.name,
                addresses: body.addresses,
                exclusivityMonths: body.exclusivityMonths,
            }),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { source?: RecruitmentSourceDto };
    if (!json.source) throw new Error('Invalid response');
    return json.source;
}

export async function deleteRecruitmentSource(clientId: string, sourceId: string): Promise<void> {
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/recruitment-sources/${encodeURIComponent(sourceId)}`,
        {
            method: 'DELETE',
            headers: authHeaders(),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
}
