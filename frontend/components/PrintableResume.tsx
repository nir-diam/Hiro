import React from 'react';
import { buildCandidateFullName } from '../utils/candidateName';
import {
    educationEntryToDisplayLine,
    normalizeDrivingLicensesForPrint,
    normalizeLanguagesForPrintRows,
    splitWorkExperienceForPrint,
} from '../utils/printableResumeFormatting';
import { inferSmartTagType, normalizeTagDetail } from '../utils/candidateGroupedSmartTags';

export type PrintableResumeAgency = {
    name?: string | null;
    logoUrl?: string | null;
    /** Company brand color from company settings (`clients.primaryColor`). */
    brandColor?: string | null;
};

const DEFAULT_BRAND = '#1e293b';
const PRESENT_RE = /present|current|now|היום|כיום|עד\s*היום|הווה/i;
const LEADING_YEAR_RANGE_RE = /^\s*\d{4}\s*[-–—]\s*(?:\d{4}|היום|כיום|present)?\s*/i;
const BULLET_PREFIX_RE = /^[\s•·\-–—*▪●]+/;

const oneLine = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

/** "מנהל/ת פרויקטים" → "מנהל פרויקטים" (the CV speaks for one candidate). */
const stripGenderSlash = (value: string): string =>
    value.replace(/\/(?:ת|ית|ה|יות|ות)(?=[\s,.)]|$)/g, '').replace(/\s{2,}/g, ' ').trim();

const yearOf = (value: unknown): number | null => {
    const m = String(value ?? '').match(/(19|20)\d{2}/);
    return m ? Number(m[0]) : null;
};

const isPresent = (value: unknown): boolean => PRESENT_RE.test(String(value ?? ''));

/** Sort key: present first, then latest end (year*12+month), undated last. */
const endSortKey = (exp: Record<string, unknown>): number => {
    const end = exp.endDate;
    if (isPresent(end) || isPresent(exp.dateRangeLabel)) return Number.MAX_SAFE_INTEGER;
    const s = String(end ?? '');
    const ym = s.match(/((?:19|20)\d{2})-(\d{2})/);
    if (ym) return Number(ym[1]) * 12 + Number(ym[2]);
    const y = yearOf(end) ?? yearOf(exp.dateRangeLabel) ?? yearOf(exp.startDate);
    return y != null ? y * 12 + 12 : -1;
};

const dateRange = (exp: Record<string, unknown>): string => {
    const start = yearOf(exp.startDate);
    const endIsPresent = isPresent(exp.endDate);
    const end = endIsPresent ? 'היום' : yearOf(exp.endDate);
    if (start == null && end == null) return oneLine(exp.dateRangeLabel);
    if (start != null && end != null && String(start) === String(end)) return String(start);
    return [start, end].filter((v) => v != null).join(' – ');
};

const isSlug = (value: string) => /^[a-z0-9_-]+$/i.test(value);

type ExperienceView = { title: string; dates: string; company: string; bullets: string[] };

const toExperienceView = (raw: Record<string, unknown>): ExperienceView => {
    const rawTitle = oneLine(raw.title || raw.position || raw.role);
    const title = stripGenderSlash(rawTitle.replace(LEADING_YEAR_RANGE_RE, ''));
    const companyField = oneLine(raw.companyField);
    const company = [oneLine(raw.company || raw.organization || raw.employer), companyField && !isSlug(companyField) ? companyField : '']
        .filter(Boolean)
        .join(' · ');

    const lines = String(raw.description || raw.summary || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(BULLET_PREFIX_RE, '').trim())
        .filter(Boolean);
    // Parsed CVs often repeat the heading ("2015-2023 אגד – מנהל פרויקטים") as the first line.
    if (lines.length && rawTitle) {
        const first = oneLine(lines[0]);
        if (first.startsWith(rawTitle)) {
            const rest = first.slice(rawTitle.length).replace(/^[\s,.;:–—-]+/, '').trim();
            if (rest) lines[0] = rest;
            else lines.shift();
        }
    }
    return { title, dates: dateRange(raw), company, bullets: lines };
};

const sortByEndDesc = (items: unknown[]): Record<string, unknown>[] =>
    (items.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
        .map((exp, index) => ({ exp, index, key: endSortKey(exp) }))
        .sort((a, b) => b.key - a.key || a.index - b.index)
        .map((row) => row.exp);

const tagLabel = (tag: unknown): string => {
    if (typeof tag === 'string') return tag.trim();
    if (!tag || typeof tag !== 'object') return '';
    const row = tag as Record<string, unknown>;
    return oneLine(row.displayNameHe ?? row.nameHe ?? row.value ?? row.name ?? row.label ?? row.tagKey);
};

const tagType = (tag: unknown): string => {
    if (!tag || typeof tag !== 'object') return '';
    return inferSmartTagType(normalizeTagDetail(tag as Record<string, unknown>));
};

const uniqueJoin = (values: string[]) => [...new Set(values.filter(Boolean))].join(', ');

const hasCarFromMobility = (value: unknown): boolean => {
    const s = oneLine(value).toLowerCase();
    if (!s || s === '-' || /^(לא|no|אין)/.test(s)) return false;
    return s === 'yes' || s === 'כן' || s.includes('רכב') || s === 'true';
};

const heeboUrl = (): string => {
    const base = import.meta.env.BASE_URL || '/';
    return `${base.endsWith('/') ? base : `${base}/`}fonts/Heebo.ttf`;
};

export const PrintableResume: React.FC<{
    data: any;
    className?: string;
    hideCompanyLogo?: boolean;
    /** Tighter page padding for the print-mode modal. */
    density?: 'default' | 'compact';
    agency?: PrintableResumeAgency | null;
}> = ({ data, className = '', hideCompanyLogo = false, density = 'default', agency }) => {
    const brandAgency: PrintableResumeAgency = agency || data?.agency || {};
    const brand = /^#[0-9a-f]{3,8}$/i.test(String(brandAgency.brandColor || '').trim())
        ? String(brandAgency.brandColor).trim()
        : DEFAULT_BRAND;
    const agencyName = oneLine(brandAgency.name);
    const logoUrl = hideCompanyLogo ? '' : oneLine(brandAgency.logoUrl);

    const fullName = buildCandidateFullName(data.firstName, data.lastName) || oneLine(data.fullName);
    const titleRaw = stripGenderSlash(oneLine(data.title));
    const title = titleRaw && titleRaw !== fullName ? titleRaw : '';
    const address = oneLine(data.location || data.address);
    const phone = oneLine(data.phone);
    const email = oneLine(data.email);
    const hasCar = hasCarFromMobility(data.mobility);
    const keyFacts = (Array.isArray(data.keyFacts) ? data.keyFacts : [])
        .map((f: unknown) => oneLine(f))
        .filter(Boolean)
        .slice(0, 3);

    const { civilianWorkExperience, militaryExperience } = splitWorkExperienceForPrint(
        Array.isArray(data.workExperience) ? data.workExperience : [],
        Array.isArray(data.militaryExperience) ? data.militaryExperience : [],
    );
    const jobs = sortByEndDesc(civilianWorkExperience).map(toExperienceView);
    const military = sortByEndDesc(militaryExperience).map(toExperienceView);

    const education = (Array.isArray(data.education) ? data.education : [])
        .map((edu: unknown) => educationEntryToDisplayLine(edu))
        .filter(Boolean);
    const languagesLine = normalizeLanguagesForPrintRows(data.languages)
        .map((row) => (row.levelText ? `${row.name} (${row.levelText})` : row.name))
        .join(', ');
    const tags: unknown[] = Array.isArray(data.tagDetails) ? data.tagDetails : [];
    const toolsLine = uniqueJoin(tags.filter((t) => tagType(t) === 'tool').map(tagLabel));
    const licensesLine = uniqueJoin([
        ...tags.filter((t) => tagType(t) === 'certification').map(tagLabel),
        ...normalizeDrivingLicensesForPrint(data),
    ]);
    const hasBottomRight = Boolean(languagesLine || toolsLine || licensesLine);

    const renderJobs = (heading: string, items: ExperienceView[]) =>
        items.length ? (
            <section className="pr-section">
                <h2>{heading}</h2>
                {items.map((job, i) => (
                    <div key={`${heading}-${i}`} className="pr-job">
                        <div className="pr-job-line">
                            {job.dates ? <span className="pr-job-dates">{job.dates}</span> : null}
                            {job.title ? <span className="pr-job-title">{job.title}</span> : null}
                        </div>
                        {job.company ? <div className="pr-job-company">{job.company}</div> : null}
                        {job.bullets.length ? (
                            <ul>
                                {job.bullets.map((line, j) => (
                                    <li key={j}>{line}</li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ))}
            </section>
        ) : null;

    return (
        <div
            dir="rtl"
            className={`printable-resume-root ${density === 'compact' ? 'pr-compact' : ''} ${className}`}
            style={{ ['--pr-brand' as string]: brand } as React.CSSProperties}
        >
            <style>{`
                @font-face { font-family: 'Heebo'; src: url('${heeboUrl()}') format('truetype'); font-weight: 100 900; }
                .printable-resume-root {
                    --pr-ink: #1f1f1f; --pr-muted: #4a4a4a; --pr-line: #e3e3e3;
                    background: #fff; color: var(--pr-ink); font-family: Heebo, Arial, sans-serif;
                    font-size: 10.5pt; line-height: 1.55; max-width: 794px; margin: 0 auto; padding: 40px 48px;
                    display: flex; flex-direction: column; gap: 18px; text-align: right;
                }
                .printable-resume-root.pr-compact { padding: 16px 20px; }
                .printable-resume-root * { box-sizing: border-box; }
                .printable-resume-root .pr-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
                .printable-resume-root .pr-name { margin: 0; font-size: 26pt; font-weight: 800; line-height: 1.15; color: #111; }
                .printable-resume-root .pr-headline { font-size: 13.5pt; font-weight: 500; color: var(--pr-brand); }
                .printable-resume-root .pr-logo img { max-height: 48px; max-width: 160px; object-fit: contain; }
                .printable-resume-root .pr-contact { display: flex; flex-wrap: wrap; gap: 4px 20px; padding: 8px 0; border-top: 2px solid var(--pr-brand); border-bottom: 1px solid var(--pr-line); font-size: 10pt; color: #333; }
                .printable-resume-root .pr-ltr { direction: ltr; unicode-bidi: isolate; }
                .printable-resume-root .pr-facts { font-size: 11pt; font-weight: 500; color: #222; }
                .printable-resume-root .pr-facts span + span::before { content: " · "; color: #9a9a9a; }
                .printable-resume-root h2 { margin: 0 0 8px; font-size: 12.5pt; font-weight: 800; color: #111; padding-bottom: 4px; border-bottom: 1px solid var(--pr-line); }
                .printable-resume-root .pr-job { margin-bottom: 12px; break-inside: avoid; page-break-inside: avoid; }
                .printable-resume-root .pr-job-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
                .printable-resume-root .pr-job-title { font-size: 11.5pt; font-weight: 700; }
                .printable-resume-root .pr-job-dates { font-size: 10pt; font-weight: 700; color: var(--pr-brand); unicode-bidi: isolate; }
                .printable-resume-root .pr-job-company { font-size: 10pt; color: var(--pr-muted); }
                /* Custom bullets: html2canvas misplaces native list-style discs under dir=rtl. */
                .printable-resume-root .pr-job ul { margin: 3px 0 0; padding: 0; list-style: none; }
                .printable-resume-root .pr-job li {
                    position: relative; margin: 1px 0; padding-right: 14px;
                }
                .printable-resume-root .pr-job li::before {
                    content: "•"; position: absolute; right: 0; top: 0; width: 12px;
                    text-align: center; color: inherit; font-weight: 700; line-height: inherit;
                }
                .printable-resume-root .pr-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; break-inside: avoid; }
                .printable-resume-root .pr-bottom p { margin: 0 0 4px; }
                .printable-resume-root .pr-foot { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--pr-line); font-size: 8.5pt; color: #5c5c5c; }
                .printable-resume-root h2 { break-after: avoid-page; page-break-after: avoid; }
                @media print {
                    @page { size: A4; margin: 14mm 16mm; }
                    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .printable-resume-root { max-width: none !important; margin: 0 !important; padding: 0 !important; }
                    .printable-resume-root p, .printable-resume-root li { orphans: 3; widows: 3; }
                }
            `}</style>

            <div className="pr-head">
                <div>
                    <h1 className="pr-name">{fullName}</h1>
                    {title ? <div className="pr-headline">{title}</div> : null}
                </div>
                {logoUrl ? (
                    <div className="pr-logo">
                        <img src={logoUrl} alt={agencyName} />
                    </div>
                ) : null}
            </div>

            {address || phone || email || hasCar ? (
                <div className="pr-contact">
                    {address ? <span>{address}</span> : null}
                    {phone ? <span className="pr-ltr">{phone}</span> : null}
                    {email ? <span className="pr-ltr">{email}</span> : null}
                    {hasCar ? <span>בעל רכב</span> : null}
                </div>
            ) : null}

            {keyFacts.length ? (
                <div className="pr-facts">
                    {keyFacts.map((fact: string, i: number) => (
                        <span key={i}>{fact}</span>
                    ))}
                </div>
            ) : null}

            {renderJobs('ניסיון תעסוקתי', jobs)}
            {renderJobs('שירות צבאי', military)}

            {education.length || hasBottomRight ? (
                <div className="pr-bottom">
                    <div>
                        {education.length ? (
                            <>
                                <h2>השכלה</h2>
                                {education.map((line: string, i: number) => (
                                    <p key={i}>{line}</p>
                                ))}
                            </>
                        ) : null}
                    </div>
                    <div>
                        {hasBottomRight ? (
                            <>
                                <h2>שפות, כלים ורישיונות</h2>
                                {languagesLine ? (
                                    <p>
                                        <b>שפות:</b> {languagesLine}
                                    </p>
                                ) : null}
                                {toolsLine ? (
                                    <p>
                                        <b>כלים:</b> {toolsLine}
                                    </p>
                                ) : null}
                                {licensesLine ? (
                                    <p>
                                        <b>רישיונות:</b> {licensesLine}
                                    </p>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {agencyName ? <div className="pr-foot">הוגש על ידי {agencyName}</div> : null}
        </div>
    );
};

export default PrintableResume;
