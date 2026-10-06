import { authHeaders } from '../utils/authHeaders';

const apiBase = () => import.meta.env.VITE_API_BASE || '';

export type CvForwardVariableMeta = {
    key: string;
    labelHe: string;
    labelEn: string;
    token: string;
};

/** Keep in sync with backend cvForwardSubjectVariables.js */
export const CV_FORWARD_VARIABLES_FALLBACK: CvForwardVariableMeta[] = [
    {
        key: 'מקור_גיוס',
        labelHe: 'מקור גיוס',
        labelEn: 'Recruitment source',
        token: '{{מקור_גיוס}}',
    },
    {
        key: 'שם_משרה',
        labelHe: 'שם משרה',
        labelEn: 'Job title',
        token: '{{שם_משרה}}',
    },
    {
        key: 'קוד_משרה',
        labelHe: 'קוד משרה',
        labelEn: 'Job posting code',
        token: '{{קוד_משרה}}',
    },
    {
        key: 'שם_לקוח',
        labelHe: 'שם לקוח',
        labelEn: 'Client name',
        token: '{{שם_לקוח}}',
    },
    {
        key: 'שם_מועמד',
        labelHe: 'שם מועמד',
        labelEn: 'Candidate name',
        token: '{{שם_מועמד}}',
    },
];

export async function fetchCvForwardVariables(): Promise<CvForwardVariableMeta[]> {
    const base = apiBase();
    if (!base) return CV_FORWARD_VARIABLES_FALLBACK;

    try {
        const res = await fetch(`${base}/api/jobs/cv-forward-variables`, {
            headers: authHeaders(true),
            cache: 'no-store',
        });
        if (!res.ok) return CV_FORWARD_VARIABLES_FALLBACK;
        const data = await res.json();
        return Array.isArray(data) && data.length > 0 ? data : CV_FORWARD_VARIABLES_FALLBACK;
    } catch {
        return CV_FORWARD_VARIABLES_FALLBACK;
    }
}
