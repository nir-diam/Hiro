import type { AuthUser } from '../context/AuthContext';
import type { JobComposeRow } from './jobsApi';
import { buildPublicJobAppUrl, buildPublicJobUrl, resolvePublicClientRouteKey } from './publishingApi';
import { navigationPlaceholdersFromMetadata } from '../utils/clientNavigationLinks';
import {
    alignEmailSignatureHtml,
    buildEmailSignatureHtml,
    detectEmailTextDirection,
    emailSignaturePlainText,
    parseEmailSignature,
} from '../utils/emailSignature';

/** Logical keys (without `{}`) — used when merging templates before send. */
export type MessageTemplateToken =
    | 'candidate_first_name'
    | 'candidate_last_name'
    | 'candidate_phone'
    | 'candidate_email'
    | 'candidate_cv_link'
    | 'candidate_id'
    | 'candidate_portal_link'
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
    | 'thank_you_page_link'
    | 'job_public_page_link'
    | 'waze_link'
    | 'google_maps_link'
    | 'recruiter_signature';

export const MESSAGE_TEMPLATE_PLACEHOLDER_ROWS: { label: string; token: MessageTemplateToken }[] = [
    { label: 'שם פרטי מועמד', token: 'candidate_first_name' },
    { label: 'שם משפחה מועמד', token: 'candidate_last_name' },
    { label: 'טלפון מועמד', token: 'candidate_phone' },
    { label: 'מייל מועמד', token: 'candidate_email' },
    { label: 'לינק קורות חיים', token: 'candidate_cv_link' },
    { label: 'תעודת זהות מועמד', token: 'candidate_id' },
    { label: 'קישור לאזור האישי (מג\'יק לינק)', token: 'candidate_portal_link' },
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
    { label: 'לינק לדף משרה ציבורי', token: 'job_public_page_link' },
    { label: 'קישור וויז', token: 'waze_link' },
    { label: 'קישור גוגל מפות', token: 'google_maps_link' },
    { label: 'חתימת רכז (HTML)', token: 'recruiter_signature' },
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

async function loadCandidatePlaceholderBundle(
    root: string,
    cid: string,
    init: RequestInit,
): Promise<{ cand: Record<string, unknown> | null; linked: unknown[] }> {
    const { fetchStaffCandidateById } = await import('../utils/staffCandidateApi');
    const [candResult, ljRes] = await Promise.all([
        fetchStaffCandidateById(cid).catch(() => null),
        fetch(`${root}/api/candidates/${encodeURIComponent(cid)}/linked-jobs`, init),
    ]);
    let linked: unknown[] = [];
    if (ljRes.ok) {
        const j = (await ljRes.json()) as unknown;
        linked = Array.isArray(j) ? j : [];
    }
    return { cand: candResult, linked };
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

export type ApplyMessageTemplateOptions = {
    /** Keep signature HTML (with logo) for email rich compose — not plain text. */
    emailCompose?: boolean;
};

/** Replace `{token}` occurrences using DB-backed / contextual strings (unknown tokens left unchanged). */
export function applyMessageTemplatePlaceholders(
    template: string,
    values: Partial<Record<MessageTemplateToken, string>>,
    options?: ApplyMessageTemplateOptions,
): string {
    let out = String(template ?? '');
    const merged: Record<string, string> = {};
    for (const k of MESSAGE_TEMPLATE_PLACEHOLDER_ROWS.map((r) => r.token)) {
        merged[k] = values[k] != null ? String(values[k]) : '';
    }
    for (const key of Object.keys(merged)) {
        const re = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g');
        let val = merged[key];
        if (key === 'recruiter_signature' && val) {
            if (options?.emailCompose) {
                const dir = detectEmailTextDirection(out);
                val = alignEmailSignatureHtml(val, dir);
            } else {
                val = emailSignaturePlainText({ html: val }) || '[חתימת רכז]';
            }
        }
        out = out.replace(re, val);
    }
    return out;
}

export type MessagingPlaceholderChannel = 'whatsapp' | 'sms' | 'email';

export type MessagingPlaceholderLoadArgs = {
    candidateId?: string | null;
    jobId?: string | null;
    /** WhatsApp uses the share URL (OG preview); email/SMS use the short app URL. */
    channel?: MessagingPlaceholderChannel;
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
    let jobClientDomain: string | null = null;
    let clientMetadata: Record<string, unknown> | null = null;

    const cid = args.candidateId != null && String(args.candidateId).trim() ? String(args.candidateId).trim() : '';
    const jid = args.jobId != null && String(args.jobId).trim() ? String(args.jobId).trim() : '';

    try {
        if (cid) {
            const bundle = await loadCandidatePlaceholderBundle(root, cid, init);
            cand = bundle.cand;
            linked = bundle.linked;
        }
    } catch {
        /* keep fallbacks */
    }

    try {
        if (jid) {
            const [jRes, pubRes] = await Promise.all([
                fetch(`${root}/api/jobs/${encodeURIComponent(jid)}`, init),
                fetch(`${root}/api/jobs/${encodeURIComponent(jid)}/publication`, init),
            ]);
            if (jRes.ok) {
                const j = (await jRes.json()) as unknown;
                jobFull = j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
                const jobClientId =
                    jobFull?.clientId != null && String(jobFull.clientId).trim()
                        ? String(jobFull.clientId).trim()
                        : '';
                if (jobClientId) {
                    const cRes = await fetch(`${root}/api/clients/${encodeURIComponent(jobClientId)}`, init);
                    if (cRes.ok) {
                        const c = (await cRes.json()) as unknown;
                        if (c && typeof c === 'object') {
                            const meta = (c as Record<string, unknown>).metadata;
                            clientMetadata = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : null;
                        }
                    }
                }
            }
            if (pubRes.ok) {
                const pub = (await pubRes.json()) as unknown;
                if (pub && typeof pub === 'object') {
                    const branding = (pub as Record<string, unknown>).clientBranding;
                    if (branding && typeof branding === 'object') {
                        jobClientDomain =
                            resolvePublicClientRouteKey(
                                String((branding as Record<string, unknown>).domain || '').trim() || null,
                            ) ?? null;
                    }
                }
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
    const recruiterSigPrefs = parseEmailSignature(u?.uiPreferences ?? null);
    const recruiterSignatureHtml = buildEmailSignatureHtml(recruiterSigPrefs);

    const sendDate = new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'long',
        timeZone: 'Asia/Jerusalem',
    }).format(new Date());

    const privacy = String(import.meta.env.VITE_PRIVACY_POLICY_URL || '').trim();
    const thankYou = String(import.meta.env.VITE_THANK_YOU_PAGE_URL || '').trim();

    const postingCode =
        jobFull != null && String(jobFull.postingCode ?? '').trim()
            ? String(jobFull.postingCode).trim()
            : compose != null && String(compose.postingCode ?? '').trim()
              ? String(compose.postingCode).trim()
              : null;

    const jobPublicPageLink = jid
        ? args.channel === 'whatsapp'
            ? buildPublicJobUrl(jid, undefined, postingCode, jobClientDomain)
            : buildPublicJobAppUrl(jid, undefined, postingCode, jobClientDomain)
        : '';

    const navLinks = navigationPlaceholdersFromMetadata(clientMetadata);

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
        job_public_page_link: jobPublicPageLink,
        waze_link: navLinks.waze_link,
        google_maps_link: navLinks.google_maps_link,
        recruiter_signature: recruiterSignatureHtml,
    };

    if (!values.recruiter_signature && u?.id) {
        try {
            const { fetchStaffUser } = await import('./usersApi');
            const staff = await fetchStaffUser(String(u.id));
            const sig = buildEmailSignatureHtml(parseEmailSignature(staff.uiPreferences ?? null));
            if (sig) values.recruiter_signature = sig;
        } catch {
            /* keep empty */
        }
    }

    return values;
}

export function templateUsesNavigationPlaceholders(text: string): {
    waze: boolean;
    googleMaps: boolean;
} {
    const src = String(text || '');
    const has = (token: MessageTemplateToken) => new RegExp(`\\{\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}`).test(src);
    return {
        waze: has('waze_link'),
        googleMaps: has('google_maps_link'),
    };
}

export function missingNavigationPlaceholderMessage(
    subject: string,
    content: string,
    values: Partial<Record<MessageTemplateToken, string>>,
): string | null {
    const used = templateUsesNavigationPlaceholders(`${subject}\n${content}`);
    if (used.waze && !String(values.waze_link || '').trim()) {
        return 'ללקוח לא הוגדרה כתובת הגעה לראיון — לא ניתן לשלוח תבנית עם {waze_link} ריק.';
    }
    if (used.googleMaps && !String(values.google_maps_link || '').trim()) {
        return 'ללקוח לא הוגדרה כתובת הגעה לראיון — לא ניתן לשלוח תבנית עם {google_maps_link} ריק.';
    }
    return null;
}
