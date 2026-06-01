import { CV_EXPORT_COLORS, linesToStyledHtml } from './parsedSearchTextFormatting';

export const PARSED_CV_DOCUMENT_TITLE = 'קורות חיים';

export const EXPORT_FONT =
    "system-ui, -apple-system, 'Segoe UI', Tahoma, Calibri, Arial, sans-serif";

export type ParsedSearchTextExportOptions = {
    /** Candidate full name shown under the document title */
    candidateName?: string;
};

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Title block — shared by PDF and Word export */
export function buildParsedCvTitleHtml(candidateName?: string): string {
    const name = String(candidateName ?? '').trim();
    const nameLine = name
        ? `<p style="margin:8px 0 0;font-size:15px;font-weight:600;color:${CV_EXPORT_COLORS.label};font-family:${EXPORT_FONT};">${escapeHtml(name)}</p>`
        : '';
    return `
<div style="margin:0 0 22px 0;text-align:right;font-family:${EXPORT_FONT};">
  <div style="padding:0 0 12px 0;border-bottom:3px solid ${CV_EXPORT_COLORS.primary};">
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${CV_EXPORT_COLORS.primary};">מסמך קורות חיים</p>
    <h1 style="margin:0;font-size:32px;font-weight:800;color:${CV_EXPORT_COLORS.primaryDark};line-height:1.2;">${PARSED_CV_DOCUMENT_TITLE}</h1>
    ${nameLine}
  </div>
</div>`;
}

export function buildStyledCvBodyHtml(text: string): string {
    return linesToStyledHtml(String(text || '').split('\n'));
}
