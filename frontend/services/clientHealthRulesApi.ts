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

export type HealthColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';

export type HealthConditionType =
    | 'days_since_contact'
    | 'active_placements'
    | 'open_opportunities'
    | 'no_future_activity';

export type HealthOperator = 'gt' | 'lt' | 'eq' | 'is_true' | 'is_false';

export type ClientHealthRuleDto = {
    id: string;
    clientId?: string;
    organizationId?: string | null;
    pipelineId?: string | null;
    color: HealthColor;
    condition: HealthConditionType;
    operator: HealthOperator;
    value: number;
    enabled: boolean;
    sortIndex?: number;
};

export async function fetchClientHealthRules(
    clientId: string,
    organizationId?: string | null,
    pipelineId?: string | null,
): Promise<ClientHealthRuleDto[]> {
    const params = new URLSearchParams();
    if (organizationId) params.set('organizationId', organizationId);
    if (pipelineId) params.set('pipelineId', pipelineId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/health-rules${qs}`,
        { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { rules?: ClientHealthRuleDto[] };
    return Array.isArray(json.rules) ? json.rules : [];
}

export async function syncClientHealthRules(
    clientId: string,
    rules: ClientHealthRuleDto[],
    organizationId?: string | null,
    pipelineId?: string | null,
): Promise<ClientHealthRuleDto[]> {
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/health-rules`,
        {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({
                organizationId: organizationId || null,
                pipelineId: pipelineId || null,
                rules: rules.map((r, i) => ({
                    id: r.id,
                    color: r.color,
                    condition: r.condition,
                    operator: r.operator,
                    value: r.value,
                    enabled: r.enabled,
                    sortIndex: i,
                })),
            }),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { rules?: ClientHealthRuleDto[] };
    return Array.isArray(json.rules) ? json.rules : [];
}

export type ClientPulseLevel = 'green' | 'yellow' | 'red';

export type OrgHealthPulseDto = {
    level: ClientPulseLevel;
    color?: string;
    message: string;
    pulse?: boolean;
    metrics?: {
        daysSinceLastContact?: number;
        openOpportunities?: number;
        activePlacements?: number;
        noFutureActivity?: boolean;
        lastTouchAt?: string;
    } | null;
};

export async function fetchClientHealthPulse(
    clientId: string,
    pipelineId?: string | null,
): Promise<Record<string, OrgHealthPulseDto>> {
    const qs = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : '';
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/health-pulse${qs}`,
        { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as { byOrganizationId?: Record<string, OrgHealthPulseDto> };
    return json.byOrganizationId && typeof json.byOrganizationId === 'object'
        ? json.byOrganizationId
        : {};
}
