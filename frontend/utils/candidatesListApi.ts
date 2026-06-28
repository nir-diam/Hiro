/** When adv JSON in query string exceeds this, use POST /api/candidates/search/list instead. */
export const CANDIDATES_ADV_QUERY_MAX_LEN = 1800;

export type CandidatesListRequest = {
    page: number;
    limit: number;
    search?: string;
    advanced?: unknown;
    dataIncomplete?: boolean;
    jobId?: string;
    matchLastJobScores?: boolean | '0' | '1';
    savedSearchId?: string | number | null;
};

export function shouldPostCandidatesList(req: CandidatesListRequest): boolean {
    if (req.advanced == null) return false;
    try {
        return JSON.stringify(req.advanced).length > CANDIDATES_ADV_QUERY_MAX_LEN;
    } catch {
        return true;
    }
}

export async function fetchCandidatesListResponse(
    apiBase: string,
    req: CandidatesListRequest,
    init: RequestInit,
): Promise<Response> {
    const base = apiBase.replace(/\/$/, '');
    if (shouldPostCandidatesList(req)) {
        const body: Record<string, unknown> = {
            page: req.page,
            limit: req.limit,
        };
        const st = String(req.search || '').trim();
        if (st) body.search = st;
        if (req.advanced != null) body.adv = req.advanced;
        if (req.dataIncomplete) body.dataIncomplete = '1';
        const mj = String(req.jobId || '').trim();
        if (mj) body.jobId = mj;
        if (req.matchLastJobScores != null) {
            body.matchLastJobScores = req.matchLastJobScores === false ? '0' : '1';
        }
        if (req.savedSearchId != null) body.savedSearchId = String(req.savedSearchId);
        return fetch(`${base}/api/candidates/search/list`, {
            ...init,
            method: 'POST',
            headers: {
                ...(init.headers as Record<string, string> | undefined),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    const params = new URLSearchParams({
        page: String(req.page),
        limit: String(req.limit),
    });
    const st = String(req.search || '').trim();
    if (st) params.set('search', st);
    if (req.advanced != null) {
        params.set('adv', JSON.stringify(req.advanced));
    }
    if (req.dataIncomplete) params.set('dataIncomplete', '1');
    const mj = String(req.jobId || '').trim();
    if (mj) params.set('jobId', mj);
    if (req.matchLastJobScores != null) {
        params.set('matchLastJobScores', req.matchLastJobScores === false ? '0' : '1');
    }
    if (req.savedSearchId != null) params.set('savedSearchId', String(req.savedSearchId));
    return fetch(`${base}/api/candidates?${params.toString()}`, init);
}
