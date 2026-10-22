import type { ScreeningWarningAgg } from '../components/ScreeningCollisionWarningModal';

export type JobFilterSaveOptions = {
  notes?: string;
  filterPosition?: string;
};

function authHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json) headers['Content-Type'] = 'application/json';
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function linkCandidateToJobFilter(
  apiBase: string,
  candidateId: string,
  jobId: string,
  options?: JobFilterSaveOptions,
): Promise<boolean> {
  const cid = String(candidateId || '').trim();
  const jid = String(jobId || '').trim();
  if (!apiBase || !cid || !jid) return false;
  const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({
      jobId: jid,
      filterNotes: options?.notes?.trim() || '',
      filterPosition: options?.filterPosition?.trim() || '',
    }),
  });
  return res.ok;
}

export async function fetchScreeningPrecheckForJob(
  apiBase: string,
  candidateId: string,
  jobId: string,
): Promise<ScreeningWarningAgg | null> {
  const cid = String(candidateId || '').trim();
  const jid = String(jobId || '').trim();
  if (!apiBase || !cid || !jid) return null;
  try {
    const res = await fetch(
      `${apiBase}/api/candidates/${encodeURIComponent(cid)}/screening-precheck?jobId=${encodeURIComponent(jid)}`,
      { headers: authHeaders(), cache: 'no-store' },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { warnings?: ScreeningWarningAgg['warnings'] };
    if (Array.isArray(j.warnings) && j.warnings.length) {
      return { candidateId: cid, warnings: j.warnings };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Aggregate screening precheck warnings for many candidate × job pairs. */
export async function fetchScreeningPrecheckForJobs(
  apiBase: string,
  candidateIds: string[],
  jobIds: string[],
): Promise<ScreeningWarningAgg[]> {
  const cids = candidateIds.map((id) => String(id || '').trim()).filter(Boolean);
  const jids = jobIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (!apiBase || cids.length === 0 || jids.length === 0) return [];
  const agg: ScreeningWarningAgg[] = [];
  for (const cid of cids) {
    for (const jid of jids) {
      const row = await fetchScreeningPrecheckForJob(apiBase, cid, jid);
      if (row) agg.push(row);
    }
  }
  return agg;
}

/** Link many candidates to many jobs (cartesian product). Returns success/fail pair counts. */
export async function linkCandidatesToJobFilters(
  apiBase: string,
  candidateIds: string[],
  jobIds: string[],
  options?: JobFilterSaveOptions,
): Promise<{ ok: number; fail: number }> {
  const cids = candidateIds.map((id) => String(id || '').trim()).filter(Boolean);
  const jids = jobIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (!apiBase || cids.length === 0 || jids.length === 0) return { ok: 0, fail: 0 };
  let ok = 0;
  let fail = 0;
  for (const cid of cids) {
    for (const jid of jids) {
      const success = await linkCandidateToJobFilter(apiBase, cid, jid, options);
      if (success) ok += 1;
      else fail += 1;
    }
  }
  return { ok, fail };
}
