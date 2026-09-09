/** Map API job row → shape expected by JobDetailsDrawer. */
const DRAWER_STATUSES = new Set(['פתוחה', 'מוקפאת', 'מאוישת', 'טיוטה', 'סגורה']);

export type JobDetailsDrawerJob = {
    id: string | number;
    title: string;
    client: string;
    status: 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה';
    associatedCandidates: number;
    openDate: string;
    recruiter: string;
    location: string;
    jobType: string | string[];
    description: string;
    requirements: string[];
    salaryMin: number;
    salaryMax: number;
};

export function buildFallbackJobForDrawer(jobId: string, jobTitle: string, client = ''): JobDetailsDrawerJob {
    return {
        id: jobId,
        title: jobTitle || 'משרה',
        client,
        status: 'טיוטה',
        associatedCandidates: 0,
        openDate: new Date().toISOString(),
        recruiter: 'מערכת',
        location: 'לא צויין',
        jobType: 'לא צויין',
        description: '',
        requirements: [],
        salaryMin: 0,
        salaryMax: 0,
    };
}

export function mapApiRecordToJobDetailsDrawerJob(
    raw: Record<string, unknown>,
    fallback?: { jobId: string; jobTitle: string; client?: string },
): JobDetailsDrawerJob {
    const statusRaw = String(raw.status || 'טיוטה');
    const status = (
        statusRaw === 'סגורה' || statusRaw === 'מאוישת'
            ? 'מאוישת'
            : statusRaw === 'מוקפאת' || statusRaw === 'טיוטה'
              ? statusRaw
              : DRAWER_STATUSES.has(statusRaw)
                ? statusRaw
                : 'פתוחה'
    ) as JobDetailsDrawerJob['status'];
    const requirements = Array.isArray(raw.requirements)
        ? raw.requirements.map((r) => String(r || '').trim()).filter(Boolean)
        : [];
    const jobType = Array.isArray(raw.jobType)
        ? raw.jobType.map((v) => String(v))
        : raw.jobType != null && String(raw.jobType).trim()
          ? [String(raw.jobType)]
          : ['מלאה'];
    const rawId = raw.id != null ? raw.id : fallback?.jobId;
    return {
        id: typeof rawId === 'number' ? rawId : String(rawId || fallback?.jobId || 0),
        title: String(raw.title || raw.publicJobTitle || fallback?.jobTitle || 'משרה'),
        client: String(raw.client || fallback?.client || ''),
        status,
        associatedCandidates: Number(raw.associatedCandidates) || 0,
        openDate: String(raw.openDate || raw.createdAt || new Date().toISOString()),
        recruiter: String(raw.recruiter || raw.recruitingCoordinator || 'מערכת'),
        location: String(raw.location || raw.city || 'לא צויין'),
        jobType,
        description: String(raw.description || raw.PublicDescription || raw.publicDescription || ''),
        requirements,
        salaryMin: Number(raw.salaryMin) || 0,
        salaryMax: Number(raw.salaryMax) || 0,
    };
}
