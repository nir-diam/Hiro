import type { AuthUser } from '../context/AuthContext';
import type { JobComposeRow } from './jobsApi';

/** Logical keys (without `{}`) — used when merging templates before send. */
export type MessageTemplateToken =
    | 'candidate_first_name'
    | 'candidate_last_name'
    | 'candidate_phone'
    | 'candidate_email'
    | 'candidate_cv_link'
    | 'candidate_id'
    | 'job_referrals'
    | 'company_name'
    | 'client_name'
    | 'contact_name'
    | 'contact_phone'
    | 'contact_email'
    | 'job_title'
    | 'job_description'
    | 'job_requirements'
    | 'recruiter_name'
    | 'recruiter_email'
    | 'recruiter_phone'
    | 'send_date'
    | 'privacy_policy_link'
    | 'thank_you_page_link';

export const MESSAGE_TEMPLATE_PLACEHOLDER_ROWS: { label: string; token: MessageTemplateToken }[] = [
    { label: 'שם פרטי מועמד', token: 'candidate_first_name' },
    { label: 'שם משפחה מועמד', token: 'candidate_last_name' },
    { label: 'טלפון מועמד', token: 'candidate_phone' },
    { label: 'מייל מועמד', token: 'candidate_email' },
    { label: 'לינק קורות חיים', token: 'candidate_cv_link' },
    { label: 'תעודת זהות מועמד', token: 'candidate_id' },
    { label: 'משרות והפניות', token: 'job_referrals' },
    { label: 'שם חברה', token: 'company_name' },
    { label: 'שם חברה (לקוח)', token: 'client_name' },
    { label: 'שם איש קשר', token: 'contact_name' },
    { label: 'טלפון איש קשר', token: 'contact_phone' },
    { label: 'מייל איש קשר', token: 'contact_email' },
    { label: 'כותרת משרה', token: 'job_title' },
    { label: 'תיאור משרה', token: 'job_description' },
    { label: 'דרישות משרה', token: 'job_requirements' },
    { label: 'שם רכז', token: 'recruiter_name' },
    { label: 'מייל רכז', token: 'recruiter_email' },
    { label: 'טלפון רכז', token: 'recruiter_phone' },
    { label: 'תאריך שליחה', token: 'send_date' },
    { label: 'מדיניות הפרטיות', token: 'privacy_policy_link' },
    { label: 'כתובת דף תודה', token: 'thank_you_page_link' },
];

/** Same shape `MessageTemplatesView` historically exported — UI inserts `{token}` into HTML/forms. */
export const messageTemplateParameters = MESSAGE_TEMPLATE_PLACEHOLDER_ROWS.map((row) => ({
    label: row.label,
    value: `{${row.token}}`,
}));

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function staffFetchHeaders(): HeadersInit {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const token = raw != null ? String(raw).trim() || null : null;
    const h: HeadersInit = { Accept: 'application/json' };
    if (token) (h as Record<string, string>).Authorization = `Bearer ${token}`;
    return h;
}

function apiRoot(): string {
    return (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
}

function splitFullName(fullName: string): { first: string; last: string } {
    const s = String(fullName || '').trim();
    if (!s) return { first: '', last: '' };
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { first: parts[0], last: '' };
    return { first: parts[0], last: parts.slice(1).join(' ') };
}

function formatRequirements(job: Record<string, unknown>): string {
    const req = job.requirements;
    if (Array.isArray(req)) {
        return req.map((x) => String(x ?? '').trim()).filter(Boolean).join('\n');
    }
    if (typeof req === 'string') return req.trim();
    return '';
}

function formatLinkedJobsSummary(rows: unknown[]): string {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const lines: string[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const job = r.job && typeof r.job === 'object' ? (r.job as Record<string, unknown>) : {};
        const title = String(job.title || '').trim() || 'משרה';
        const client = String(job.client || '').trim();
        const status = String(r.status || '').trim();
        const bit = [title, client ? `(${client})` : '', status ? `— ${status}` : '']
            .filter(Boolean)
            .join(' ');
        if (bit) lines.push(bit);
    }
    return lines.join('\n');
}

/** Replace `{token}` occurrences using DB-backed / contextual strings (unknown tokens left unchanged). */
export function applyMessageTemplatePlaceholders(template: string, values: Partial<Record<MessageTemplateToken, string>>): string {
    let out = String(template ?? '');
    const merged: Record<string, string> = {};
    for (const k of MESSAGE_TEMPLATE_PLACEHOLDER_ROWS.map((r) => r.token)) {
        merged[k] = values[k] != null ? String(values[k]) : '';
    }
    for (const key of Object.keys(merged)) {
        const re = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g');
        out = out.replace(re, merged[key]);
    }
    return out;
}

export type MessagingPlaceholderLoadArgs = {
    candidateId?: string | null;
    jobId?: string | null;
    /** Recipient strip shown before GET completes — overridden when candidate loads */
    fallbackCandidateName: string;
    fallbackCandidatePhone: string;
    fallbackCandidateEmail?: string | null;
    jobComposeRow?: JobComposeRow | null;
    recruiter?: AuthUser | null;
};

/**
 * Loads candidate row + linked jobs + optional job detail, then builds token → string map for merging templates.
 */
export async function loadMessagingPlaceholderValues(args: MessagingPlaceholderLoadArgs): Promise<Partial<Record<MessageTemplateToken, string>>> {
    const root = apiRoot();
    const headers = staffFetchHeaders();
    const init: RequestInit = { credentials: 'include', cache: 'no-store', headers };

    const fallbackParts = splitFullName(args.fallbackCandidateName);

    let cand: Record<string, unknown> | null = null;
    let linked: unknown[] = [];
    let jobFull: Record<string, unknown> | null = null;

    const cid = args.candidateId != null && String(args.candidateId).trim() ? String(args.candidateId).trim() : '';

    try {
        if (cid) {
            const cUrl = `${root}/api/candidates/${encodeURIComponent(cid)}`;
            const [cRes, ljRes] = await Promise.all([
                fetch(cUrl, init),
                fetch(`${root}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`, init),
            ]);
            if (cRes.ok) {
                const j = (await cRes.json()) as unknown;
                cand = j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
            }
            if (ljRes.ok) {
                const j = (await ljRes.json()) as unknown;
                linked = Array.isArray(j) ? j : [];
            }
        }
    } catch {
        /* keep fallbacks */
    }

    const jid = args.jobId != null && String(args.jobId).trim() ? String(args.jobId).trim() : '';
    try {
        if (jid) {
            const jUrl = `${root}/api/jobs/${encodeURIComponent(jid)}`;
            const jRes = await fetch(jUrl, init);
            if (jRes.ok) {
                const j = (await jRes.json()) as unknown;
                jobFull = j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
            }
        }
    } catch {
        jobFull = null;
    }

    const firstFromDb = cand != null ? String(cand.firstName ?? '').trim() : '';
    const lastFromDb = cand != null ? String(cand.lastName ?? '').trim() : '';
    const fullFromDb = cand != null ? String(cand.fullName ?? '').trim() : '';
    const splitDb = fullFromDb ? splitFullName(fullFromDb) : { first: '', last: '' };

    const firstName = firstFromDb || fallbackParts.first || splitDb.first;
    const lastName = lastFromDb || fallbackParts.last || splitDb.last;

    const phone =
        cand != null && String(cand.phone ?? '').trim()
            ? String(cand.phone).trim()
            : String(args.fallbackCandidatePhone || '').trim();

    const email =
        cand != null && String(cand.email ?? '').trim()
            ? String(cand.email).trim()
            : String(args.fallbackCandidateEmail ?? '').trim();

    const cvLink = cand != null ? String(cand.resumeUrl ?? '').trim() : '';
    const idNumber = cand != null ? String(cand.idNumber ?? '').trim() : '';

    const jobReferrals = formatLinkedJobsSummary(linked);

    const compose = args.jobComposeRow;
    const jobTitle =
        jobFull != null && String(jobFull.title ?? '').trim()
            ? String(jobFull.title).trim()
            : compose != null
              ? String(compose.title || '').trim()
              : '';

    const clientLabel =
        jobFull != null && String(jobFull.client ?? '').trim()
            ? String(jobFull.client).trim()
            : compose != null
              ? String(compose.client || '').trim()
              : '';

    const description =
        jobFull != null
            ? String(jobFull.description ?? jobFull.PublicDescription ?? jobFull.publicDescription ?? '').trim()
            : '';

    const requirements = jobFull != null ? formatRequirements(jobFull) : '';

    const u = args.recruiter;
    const recruiterName = u != null ? String(u.name ?? '').trim() : '';
    const recruiterEmail = u != null ? String(u.email ?? '').trim() : '';
    const recruiterPhone = u != null ? String(u.phone ?? '').trim() : '';

    const sendDate = new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'long',
        timeZone: 'Asia/Jerusalem',
    }).format(new Date());

    const privacy = String(import.meta.env.VITE_PRIVACY_POLICY_URL || '').trim();
    const thankYou = String(import.meta.env.VITE_THANK_YOU_PAGE_URL || '').trim();

    const values: Partial<Record<MessageTemplateToken, string>> = {
        candidate_first_name: firstName,
        candidate_last_name: lastName,
        candidate_phone: phone,
        candidate_email: email,
        candidate_cv_link: cvLink,
        candidate_id: idNumber,
        job_referrals: jobReferrals,
        company_name: clientLabel,
        client_name: clientLabel,
        contact_name: '',
        contact_phone: '',
        contact_email: '',
        job_title: jobTitle,
        job_description: description,
        job_requirements: requirements,
        recruiter_name: recruiterName,
        recruiter_email: recruiterEmail,
        recruiter_phone: recruiterPhone,
        send_date: sendDate,
        privacy_policy_link: privacy,
        thank_you_page_link: thankYou,
    };

    return values;
}
