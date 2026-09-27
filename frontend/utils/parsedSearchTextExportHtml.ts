import { CV_EXPORT_COLORS, linesToStyledHtml } from './parsedSearchTextFormatting';
import type { ExportImagePayload } from './exportImagePayload';
import { exportImageToDataUrl } from './exportImagePayload';

export const PARSED_CV_DOCUMENT_TITLE = 'קורות חיים';

export const EXPORT_FONT =
    "system-ui, -apple-system, 'Segoe UI', Tahoma, Calibri, Arial, sans-serif";

export type ParsedSearchTextExportOptions = {
    /** Reserved for callers; name is taken from parsed CV body text. */
    candidateName?: string;
    /** Logged-in client logo for PDF/DOCX header */
    clientLogo?: ExportImagePayload | null;
};

function buildLogoHtml(logo?: ExportImagePayload | null): string {
    if (!logo) return '';
    const src = exportImageToDataUrl(logo);
    return `<img src="${src}" alt="" style="display:block;width:${logo.width}px;height:${logo.height}px;max-width:${logo.width}px;max-height:${logo.height}px;object-fit:contain;" />`;
}

/** Title block — shared by PDF and Word export */
export function buildParsedCvTitleHtml(options?: ParsedSearchTextExportOptions): string {
    const logoHtml = buildLogoHtml(options?.clientLogo);
    const logoBlock = logoHtml
        ? `<div style="position:absolute;top:0;left:0;z-index:2;">${logoHtml}</div>`
        : '';
    const titlePadLeft = options?.clientLogo
        ? Math.max(0, options.clientLogo.width + 24)
        : 0;

    return `
<div dir="rtl" style="margin:0 0 22px 0;font-family:${EXPORT_FONT};">
  <div style="position:relative;padding:0 0 12px 0;border-bottom:3px solid ${CV_EXPORT_COLORS.primary};min-height:${options?.clientLogo ? options.clientLogo.height + 8 : 0}px;">
    ${logoBlock}
    <div style="text-align:right;font-family:${EXPORT_FONT};padding-left:${titlePadLeft}px;">
      <h1 style="margin:0;font-size:32px;font-weight:800;color:${CV_EXPORT_COLORS.primaryDark};line-height:1.2;">${PARSED_CV_DOCUMENT_TITLE}</h1>
    </div>
  </div>
</div>`;
}

export function buildStyledCvBodyHtml(text: string): string {
    return linesToStyledHtml(String(text || '').split('\n'));
}
