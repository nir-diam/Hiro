import { sanitizePdfFilename } from './resumeViewerPdfExport';
import { CV_EXPORT_COLORS, linesToStyledHtml } from './parsedSearchTextFormatting';
import {
    buildParsedCvTitleHtml,
    EXPORT_FONT,
    type ParsedSearchTextExportOptions,
} from './parsedSearchTextExportHtml';

const PDF_PAGE_WIDTH_PX = 794;
const PDF_PADDING_PX = 32;
const PDF_MARGIN_MM = 10;
const PDF_FONT = EXPORT_FONT;
const PDF_FONT_SIZE_PX = 15;
const PDF_LINE_HEIGHT = 1.75;

export type ParsedSearchTextPdfOptions = ParsedSearchTextExportOptions;

type Html2CanvasFn = typeof import('html2canvas')['default'];

/** Max body height (px) that fits one A4 page at our fixed width + jsPDF margins. */
function maxBodyHeightPx(extraReservePx = 0): number {
    const contentWidthPx = PDF_PAGE_WIDTH_PX - PDF_PADDING_PX * 2;
    const pageHmm = 297 - PDF_MARGIN_MM * 2;
    const pageWmm = 210 - PDF_MARGIN_MM * 2;
    const maxPx = Math.floor((pageHmm / pageWmm) * contentWidthPx);
    return Math.floor((maxPx - extraReservePx) * 0.96);
}

function measureTitleBlockHeightPx(candidateName?: string): number {
    const host = createPdfCaptureHost();
    const shell = document.createElement('div');
    shell.dir = 'rtl';
    shell.style.boxSizing = 'border-box';
    shell.style.width = `${PDF_PAGE_WIDTH_PX}px`;
    shell.style.padding = `${PDF_PADDING_PX}px`;
    shell.style.fontFamily = PDF_FONT;
    shell.style.background = '#ffffff';
    shell.innerHTML = buildParsedCvTitleHtml(candidateName);
    host.appendChild(shell);
    document.body.appendChild(host);
    const height = shell.offsetHeight;
    host.remove();
    return height;
}

function createPdfCaptureHost(): HTMLDivElement {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.left = '0';
    host.style.visibility = 'visible';
    host.style.opacity = '1';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '-1';
    host.style.width = `${PDF_PAGE_WIDTH_PX}px`;
    host.style.background = '#ffffff';
    return host;
}

function measureBodyHeight(body: HTMLElement): number {
    return body.offsetHeight;
}

/** Break a single logical line into chunks that fit within maxH when rendered alone. */
function splitOverflowLine(
    line: string,
    body: HTMLElement,
    maxH: number,
): string[] {
    const trimmed = line.trim();
    if (!trimmed) return [''];

    body.innerHTML = bodyInnerHtml([line]);
    if (measureBodyHeight(body) <= maxH) return [line];

    const parts = trimmed.split(/(\s+)/);
    const chunks: string[] = [];
    let buf = '';

    for (const part of parts) {
        const next = buf + part;
        body.innerHTML = bodyInnerHtml([next]);
        if (measureBodyHeight(body) > maxH && buf.trim()) {
            chunks.push(buf.trimEnd());
            buf = part;
        } else {
            buf = next;
        }
    }
    if (buf.trim() || chunks.length === 0) chunks.push(buf.trimEnd() || line);
    return chunks;
}

function bodyInnerHtml(lines: string[]): string {
    return linesToStyledHtml(lines);
}

function applyMeasureStyles(el: HTMLElement): void {
    el.dir = 'rtl';
    el.style.boxSizing = 'border-box';
    el.style.width = `${PDF_PAGE_WIDTH_PX}px`;
    el.style.padding = `${PDF_PADDING_PX}px`;
    el.style.fontFamily = PDF_FONT;
    el.style.fontSize = `${PDF_FONT_SIZE_PX}px`;
    el.style.lineHeight = String(PDF_LINE_HEIGHT);
    el.style.color = '#171717';
    el.style.textAlign = 'right';
    el.style.whiteSpace = 'pre-wrap';
    el.style.wordBreak = 'break-word';
    el.style.background = '#ffffff';
}

function buildPageShellHtml(bodyHtml: string, titleHtml?: string): string {
    return `<div dir="rtl" style="font-family:${PDF_FONT};color:${CV_EXPORT_COLORS.body};padding:${PDF_PADDING_PX}px;width:${PDF_PAGE_WIDTH_PX}px;background:#fff;box-sizing:border-box;text-align:right;">
  ${titleHtml ?? ''}
  <div style="word-break:break-word;margin:0;">${bodyHtml}</div>
</div>`;
}

/** Split text into line groups — each group fits on one printed page (no mid-line cuts). */
function paginateTextLines(text: string, pdfOptions?: ParsedSearchTextPdfOptions): string[][] {
    const lines = String(text || '').split('\n');
    if (!lines.length) return [];

    const titleHeightPx = measureTitleBlockHeightPx(pdfOptions?.candidateName);
    const firstPageBodyMaxPx = Math.max(120, maxBodyHeightPx(titleHeightPx));
    const otherPageBodyMaxPx = maxBodyHeightPx();

    const probe = document.createElement('div');
    const body = document.createElement('div');
    applyMeasureStyles(probe);
    body.style.margin = '0';
    body.style.whiteSpace = 'pre-wrap';
    body.style.wordBreak = 'break-word';
    probe.appendChild(body);
    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';
    probe.style.zIndex = '-1';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);

    const pages: string[][] = [];
    let current: string[] = [];
    let firstPage = true;

    const maxH = () => (firstPage ? firstPageBodyMaxPx : otherPageBodyMaxPx);

    try {
        const flush = () => {
            if (current.length) {
                pages.push(current);
                current = [];
                firstPage = false;
            }
        };

        const appendLine = (line: string) => {
            const segments = splitOverflowLine(line, body, maxH());
            for (const segment of segments) {
                const candidate = [...current, segment];
                body.innerHTML = bodyInnerHtml(candidate);
                if (measureBodyHeight(body) > maxH() && current.length > 0) {
                    flush();
                    current = [segment];
                    body.innerHTML = bodyInnerHtml(current);
                    if (measureBodyHeight(body) > maxH()) {
                        pages.push([segment]);
                        current = [];
                        firstPage = false;
                    }
                } else {
                    current = candidate;
                }
            }
        };

        for (const line of lines) {
            appendLine(line);
        }
        flush();
    } finally {
        probe.remove();
    }

    return pages.length ? pages : [lines];
}

function canvasDrawSizeMm(
    canvas: HTMLCanvasElement,
    usableW: number,
    maxHmm?: number,
): { w: number; h: number } {
    let drawW = usableW;
    let drawH = (canvas.height * drawW) / canvas.width;
    if (maxHmm != null && drawH > maxHmm) {
        const shrink = maxHmm / drawH;
        drawH = maxHmm;
        drawW *= shrink;
    }
    return { w: drawW, h: drawH };
}

async function captureHtmlToCanvas(
    html2canvas: Html2CanvasFn,
    html: string,
): Promise<HTMLCanvasElement> {
    const host = createPdfCaptureHost();
    host.innerHTML = html;
    document.body.appendChild(host);

    try {
        const target = host.firstElementChild as HTMLElement | null;
        const el = target ?? host;
        void el.offsetHeight;
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const w = Math.max(el.offsetWidth, PDF_PAGE_WIDTH_PX, 1);
        const h = Math.max(el.scrollHeight, el.offsetHeight, 1);
        return await html2canvas(el, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: w,
            height: h,
            windowWidth: w,
            windowHeight: h,
        });
    } finally {
        host.remove();
    }
}

/**
 * Export plain parsed searchText to a multi-page A4 PDF (line-aware page breaks).
 */
export async function downloadParsedSearchTextAsPdf(
    text: string,
    filename: string,
    options?: ParsedSearchTextPdfOptions,
): Promise<void> {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('empty_text');

    const pageLineGroups = paginateTextLines(trimmed, options);
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const usableW = pageW - PDF_MARGIN_MM * 2;
    const usableH = pageH - PDF_MARGIN_MM * 2;

    const titleHtml = buildParsedCvTitleHtml(options?.candidateName);

    for (let i = 0; i < pageLineGroups.length; i += 1) {
        if (i > 0) pdf.addPage();

        const bodyHtml = bodyInnerHtml(pageLineGroups[i]);

        if (i === 0) {
            const pageCanvas = await captureHtmlToCanvas(
                html2canvas,
                buildPageShellHtml(bodyHtml, titleHtml),
            );
            const size = canvasDrawSizeMm(pageCanvas, usableW, usableH);
            const x = PDF_MARGIN_MM + (usableW - size.w) / 2;
            pdf.addImage(
                pageCanvas.toDataURL('image/png'),
                'PNG',
                x,
                PDF_MARGIN_MM,
                size.w,
                size.h,
                undefined,
                'FAST',
            );
            continue;
        }

        const html = buildPageShellHtml(bodyHtml);
        const canvas = await captureHtmlToCanvas(html2canvas, html);
        const size = canvasDrawSizeMm(canvas, usableW, usableH);
        const x = PDF_MARGIN_MM + (usableW - size.w) / 2;
        pdf.addImage(
            canvas.toDataURL('image/png'),
            'PNG',
            x,
            PDF_MARGIN_MM,
            size.w,
            size.h,
            undefined,
            'FAST',
        );
    }

    pdf.save(filename);
}

export function parsedSearchTextPdfFilename(baseName: string, versionLabel?: string): string {
    const base = sanitizePdfFilename(baseName || 'resume');
    const suffix = versionLabel ? `_${sanitizePdfFilename(versionLabel)}` : '_parsed';
    return `${base}${suffix}.pdf`;
}
