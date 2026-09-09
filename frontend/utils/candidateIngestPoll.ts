const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait until background CV enrichment clears ingestPending (attachMedia / createFromAi 202). */
export async function waitForCandidateEnrichment(
    apiBase: string,
    candidateId: string,
    authHeaders: () => Record<string, string>,
    maxAttempts = 150,
): Promise<Record<string, unknown>> {
    let pollId = candidateId;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const res = await fetch(`${apiBase}/api/candidates/${pollId}`, {
            headers: { ...authHeaders() },
        });
        const row = await res.json();
        if (!res.ok) {
            throw new Error(row?.message || 'שגיאה בטעינת פרופיל מועמד.');
        }
        if (row?.isDeleted && row?.canonicalCandidateId) {
            pollId = String(row.canonicalCandidateId);
            continue;
        }
        if (!row?.ingestPending) {
            return row;
        }
        await sleep(2000);
    }
    throw new Error('עיבוד קורות החיים נמשך זמן רב מדי. נסה לרענן את העמוד.');
}

export function isCandidateEnrichmentPending(
    status: number,
    body: Record<string, unknown> | null | undefined,
): boolean {
    if (!body) return status === 202;
    const candidate = (body.candidate as Record<string, unknown> | undefined) || body;
    return (
        status === 202 ||
        body.processing === true ||
        body.ingestPending === true ||
        candidate.ingestPending === true
    );
}
