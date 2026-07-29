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

export type JobHealthColor = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'orange' | 'gray';
export type JobHealthProfileId = 'standard' | 'high_volume' | 'executive';
export type JobHealthCondition =
    | 'candidates_total'
    | 'candidates_at_stage'
    | 'time_in_stage'
    | 'days_since_contact'
    | 'disqualification_rate'
    | 'days_open';
export type JobHealthOperator = 'gt' | 'lt' | 'eq' | 'between';

export type JobHealthRuleDto = {
    id: string;
    profileId?: JobHealthProfileId;
    color: JobHealthColor;
    condition: JobHealthCondition;
    operator: JobHealthOperator;
    value: number;
    maxValue?: number;
    stage?: string;
    enabled: boolean;
    sortIndex?: number;
};

export type JobHealthProfilesDto = Record<JobHealthProfileId, JobHealthRuleDto[]>;

export type JobHealthConfigDto = {
    isSystemActive: boolean;
    profiles: JobHealthProfilesDto;
    stages: string[];
};

export async function fetchJobHealthRules(
    clientId: string,
    organizationId?: string | null,
): Promise<JobHealthConfigDto> {
    const qs = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : '';
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/job-health-rules${qs}`,
        { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as Partial<JobHealthConfigDto>;
    return {
        isSystemActive: json.isSystemActive !== false,
        profiles: {
            standard: Array.isArray(json.profiles?.standard) ? json.profiles!.standard : [],
            high_volume: Array.isArray(json.profiles?.high_volume) ? json.profiles!.high_volume : [],
            executive: Array.isArray(json.profiles?.executive) ? json.profiles!.executive : [],
        },
        stages: Array.isArray(json.stages) ? json.stages : [],
    };
}

export async function syncJobHealthRules(
    clientId: string,
    payload: {
        organizationId?: string | null;
        isSystemActive: boolean;
        profiles: JobHealthProfilesDto;
    },
): Promise<JobHealthConfigDto> {
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/job-health-rules`,
        {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({
                organizationId: payload.organizationId || null,
                isSystemActive: payload.isSystemActive,
                profiles: payload.profiles,
            }),
        },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as Partial<JobHealthConfigDto>;
    return {
        isSystemActive: json.isSystemActive !== false,
        profiles: {
            standard: Array.isArray(json.profiles?.standard) ? json.profiles!.standard : [],
            high_volume: Array.isArray(json.profiles?.high_volume) ? json.profiles!.high_volume : [],
            executive: Array.isArray(json.profiles?.executive) ? json.profiles!.executive : [],
        },
        stages: [],
    };
}

export type JobPulseLevel = 'green' | 'yellow' | 'red';

export type JobHealthPulseDto = {
    level: JobPulseLevel;
    color?: string;
    message: string;
    pulse?: boolean;
};

export async function fetchJobHealthPulse(
    clientId: string,
    organizationId?: string | null,
): Promise<{ isSystemActive: boolean; byJobId: Record<string, JobHealthPulseDto> }> {
    const qs = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : '';
    const res = await fetch(
        `${apiBase()}/api/clients/${encodeURIComponent(clientId)}/job-health-pulse${qs}`,
        { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) throw new Error(await parseErr(res));
    const json = (await res.json()) as {
        isSystemActive?: boolean;
        byJobId?: Record<string, JobHealthPulseDto>;
    };
    return {
        isSystemActive: json.isSystemActive !== false,
        byJobId: json.byJobId && typeof json.byJobId === 'object' ? json.byJobId : {},
    };
}
