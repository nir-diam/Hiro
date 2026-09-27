import { buildCandidateFullName } from './candidateName';
import {
    educationEntryToDisplayLine,
    normalizeDrivingLicensesForPrint,
    normalizeLanguagesForPrintRows,
    splitWorkExperienceForPrint,
    stripResumeHtml,
} from './printableResumeFormatting';
import { sanitizePdfFilename } from './resumeViewerPdfExport';
import type { ExportImagePayload } from './exportImagePayload';
import {
    EXPORT_LOGO_LEFT_MM,
    EXPORT_LOGO_MAX_WIDTH_MM,
    EXPORT_LOGO_TOP_MM,
    exportImageToDataUrl,
    exportLogoHeightMm,
    jsPdfImageFormat,
} from './exportImagePayload';

const FONT_VFS_NAME = 'Heebo.ttf';
const FONT_FAMILY = 'Heebo';

function heeboFontUrl(): string {
    const base = import.meta.env.BASE_URL || '/';
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return `${prefix}fonts/Heebo.ttf`;
}

const MARGIN_TOP_MM = 18;
const MARGIN_BOTTOM_MM = 18;
const MARGIN_RIGHT_MM = 18;
/** Extra inset on the left — RTL lines extend leftward from the right margin. */
const MARGIN_LEFT_MM = 28;
const CONTENT_PAD_MM = 4;
const WRAP_SAFETY_MM = 6;
const PAGE_H_MM = 297;
const LINE_H = 5.2;
const BODY_SIZE = 10.5;
const TITLE_SIZE = 20;
const SECTION_SIZE = 12;
const SUBTITLE_SIZE = 11;
const SUBTITLE_COLOR = { r: 37, g: 99, b: 235 } as const;
const COMPANY_COLOR = { r: 29, g: 78, b: 216 } as const;
const HEBREW_RE = /[\u0590-\u05FF]/;
/** LTR runs in mixed Hebrew CV lines (dates, phones, emails, Latin words). */
const LTR_RUN_START =
    /^(?:\d{1,2}\/\d{1,2}\/\d{4}(?:\s*[—–-]\s*\d{1,2}\/\d{1,2}\/\d{4})?|\d{2,3}-[\d-]+|[([{]*[A-Za-z][A-Za-z0-9@._+\-#/]*[)\]}.\-—–·]*)/;

type TextToken = { dir: 'ltr' | 'rtl'; value: string };

let cachedFontBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

async function loadHeeboFontBase64(): Promise<string> {
    if (cachedFontBase64) return cachedFontBase64;
    const res = await fetch(heeboFontUrl());
    if (!res.ok) throw new Error('font_load_failed');
    cachedFontBase64 = arrayBufferToBase64(await res.arrayBuffer());
    return cachedFontBase64;
}

async function ensureHebrewFonts(pdf: import('jspdf').jsPDF): Promise<void> {
    const fontData = await loadHeeboFontBase64();
    pdf.addFileToVFS(FONT_VFS_NAME, fontData);
    pdf.addFont(FONT_VFS_NAME, FONT_FAMILY, 'normal');
    pdf.addFont(FONT_VFS_NAME, FONT_FAMILY, 'bold');
    pdf.setFont(FONT_FAMILY, 'normal');
    pdf.setR2L(false);
}

function contentMaxWidth(rightX: number, leftX: number): number {
    return rightX - leftX - CONTENT_PAD_MM;
}

function pdfTextRight(
    pdf: import('jspdf').jsPDF,
    text: string,
    x: number,
    y: number,
    options?: Record<string, unknown>,
): void {
    pdf.text(text, x, y, { align: 'right', R2L: false, ...options } as never);
}

function pdfTextRightBounded(
    pdf: import('jspdf').jsPDF,
    text: string,
    rightX: number,
    leftX: number,
    y: number,
): void {
    const maxW = contentMaxWidth(rightX, leftX);
    if (pdf.getTextWidth(text) <= maxW) {
        pdfTextRight(pdf, text, rightX, y);
        return;
    }
    pdf.text(text, leftX + maxW, y, { align: 'right', R2L: false } as never);
}

function formatCvPrintDate(d?: string | null): string {
    if (d == null || !String(d).trim()) return '';
    const s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).split('-').reverse().join('/');
    return s;
}

function tagDetailLabel(tag: unknown): string {
    if (typeof tag === 'string') return tag.trim();
    if (!tag || typeof tag !== 'object') return '';
    const row = tag as Record<string, unknown>;
    return String(
        row.displayNameHe ?? row.nameHe ?? row.value ?? row.name ?? row.label ?? row.tagKey ?? '',
    ).trim();
}

function normalizeExperienceList(items: unknown[]): Array<Record<string, unknown>> {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
}

const RTL_MIRROR_CHARS: Record<string, string> = {
    '(': ')',
    ')': '(',
    '[': ']',
    ']': '[',
    '{': '}',
    '}': '{',
    '«': '»',
    '»': '«',
};

/** Reverse Hebrew for jsPDF LTR paint; mirror brackets so (…) stay readable. */
function reverseRtlForPdf(text: string): string {
    return [...text]
        .reverse()
        .map((ch) => RTL_MIRROR_CHARS[ch] ?? ch)
        .join('');
}

function tokenizeMixedCvLine(text: string): TextToken[] {
    const tokens: TextToken[] = [];
    let i = 0;
    while (i < text.length) {
        const rest = text.slice(i);
        const ltrMatch = rest.match(LTR_RUN_START);
        if (ltrMatch) {
            tokens.push({ dir: 'ltr', value: ltrMatch[0] });
            i += ltrMatch[0].length;
            continue;
        }
        let rtl = '';
        while (i < text.length && !LTR_RUN_START.test(text.slice(i))) {
            rtl += text[i];
            i += 1;
        }
        if (rtl) tokens.push({ dir: 'rtl', value: rtl });
    }
    return tokens;
}

function tokenDrawText(token: TextToken): string {
    return token.dir === 'rtl' ? reverseRtlForPdf(token.value) : token.value;
}

function tokenWidth(pdf: import('jspdf').jsPDF, token: TextToken): number {
    return pdf.getTextWidth(tokenDrawText(token));
}

function lineHasLtr(tokens: TextToken[]): boolean {
    return tokens.some((token) => token.dir === 'ltr');
}

/** Draw one RTL line; mixed Hebrew/Latin uses separate pdf.text per token to avoid PDF bidi reversal. */
function drawLogicalLine(
    pdf: import('jspdf').jsPDF,
    logical: string,
    rightX: number,
    leftX: number,
    y: number,
): void {
    const raw = String(logical || '');
    if (!raw) return;

    const maxW = contentMaxWidth(rightX, leftX);

    if (!HEBREW_RE.test(raw)) {
        pdfTextRightBounded(pdf, raw, rightX, leftX, y);
        return;
    }

    const tokens = tokenizeMixedCvLine(raw);
    if (!lineHasLtr(tokens)) {
        pdfTextRightBounded(pdf, reverseRtlForPdf(raw), rightX, leftX, y);
        return;
    }

    const drawOrder = [...tokens].reverse();
    const widths = drawOrder.map((token) => tokenWidth(pdf, token));
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    let xLeft = Math.max(leftX, rightX - Math.min(totalWidth, maxW));

    for (let i = 0; i < drawOrder.length; i += 1) {
        pdf.text(tokenDrawText(drawOrder[i]), xLeft, y, { align: 'left', R2L: false } as never);
        xLeft += widths[i];
    }
}

function explodeTokenIfNeeded(
    pdf: import('jspdf').jsPDF,
    token: TextToken,
    maxWidth: number,
): TextToken[] {
    if (tokenWidth(pdf, token) <= maxWidth) return [token];

    if (token.dir === 'ltr') {
        const parts = pdf.splitTextToSize(token.value, maxWidth) as string[];
        return parts.map((part) => ({ dir: 'ltr' as const, value: part }));
    }

    const chunks: TextToken[] = [];
    let buffer = '';
    for (const segment of token.value.split(/(\s+)/).filter(Boolean)) {
        const candidate = buffer + segment;
        const candidateToken: TextToken = { dir: 'rtl', value: candidate };
        if (buffer && tokenWidth(pdf, candidateToken) > maxWidth) {
            chunks.push({ dir: 'rtl', value: buffer });
            buffer = segment;
        } else {
            buffer = candidate;
        }
    }
    if (buffer) chunks.push({ dir: 'rtl', value: buffer });
    return chunks.length ? chunks : [token];
}

function wrapLogicalToTokenLines(
    pdf: import('jspdf').jsPDF,
    logical: string,
    maxWidth: number,
): TextToken[][] {
    const tokens = tokenizeMixedCvLine(logical);
    const lines: TextToken[][] = [];
    let current: TextToken[] = [];
    let currentWidth = 0;

    for (const token of tokens) {
        for (const part of explodeTokenIfNeeded(pdf, token, maxWidth)) {
            const width = tokenWidth(pdf, part);
            if (current.length > 0 && currentWidth + width > maxWidth) {
                lines.push(current);
                current = [part];
                currentWidth = width;
            } else {
                current.push(part);
                currentWidth += width;
            }
        }
    }

    if (current.length) lines.push(current);
    return lines.length ? lines : [[]];
}

/** Footer Hebrew + trailing Latin — separate draws avoid PDF bidi reordering. */
function drawHiroFooterLine(pdf: import('jspdf').jsPDF, rightX: number, y: number): void {
    const hebrewVisual = reverseRtlForPdf('נוצר באמצעות');
    const brand = 'HIRO';
    const gapMm = 2;
    const hebrewWidth = pdf.getTextWidth(hebrewVisual);
    const brandWidth = pdf.getTextWidth(brand);
    pdfTextRight(pdf, hebrewVisual, rightX, y);
    pdf.text(brand, rightX - hebrewWidth - gapMm - brandWidth, y, {
        align: 'left',
        R2L: false,
    } as never);
}

function experienceDateLabel(exp: Record<string, unknown>): string {
    const start = formatCvPrintDate(exp.startDate as string | undefined);
    const end = formatCvPrintDate(exp.endDate as string | undefined);
    if (end || start) {
        if (end && start) {
            if (end === start) return end;
            return `${end} — ${start}`;
        }
        return end || start;
    }
    const preset = typeof exp.dateRangeLabel === 'string' ? exp.dateRangeLabel.trim() : '';
    return preset;
}

function buildExperienceSubtitle(exp: Record<string, unknown>): string {
    const title = String(exp.title || exp.position || exp.role || '').trim();
    const dates = experienceDateLabel(exp);
    if (dates && title) return `${dates} · ${title}`;
    return title || dates;
}

type PdfWriter = {
    pdf: import('jspdf').jsPDF;
    pageW: number;
    contentW: number;
    leftX: number;
    rightX: number;
    y: number;
    ensureSpace: (neededMm: number) => void;
    sectionTitle: (title: string) => void;
    subtitleLines: (text: string, opts?: { gapAfter?: number }) => void;
    companyLine: (text: string, opts?: { gapAfter?: number }) => void;
    bodyLines: (text: string, opts?: { bold?: boolean; size?: number; gapAfter?: number }) => void;
    blank: (mm?: number) => void;
};

function createWriter(pdf: import('jspdf').jsPDF, startY = MARGIN_TOP_MM): PdfWriter {
    const pageW = pdf.internal.pageSize.getWidth();
    const leftX = MARGIN_LEFT_MM;
    const rightX = pageW - MARGIN_RIGHT_MM;
    const contentW = contentMaxWidth(rightX, leftX);
    const wrapWidth = Math.max(40, contentW - WRAP_SAFETY_MM);
    const state = { y: startY };

    const ensureSpace = (neededMm: number) => {
        if (state.y + neededMm <= PAGE_H_MM - MARGIN_BOTTOM_MM) return;
        pdf.addPage();
        state.y = MARGIN_TOP_MM;
    };

    const sectionTitle = (title: string) => {
        ensureSpace(SECTION_SIZE + LINE_H * 2);
        pdf.setFont(FONT_FAMILY, 'bold');
        pdf.setFontSize(SECTION_SIZE);
        pdf.setTextColor(31, 41, 55);
        drawLogicalLine(pdf, title, rightX, leftX, state.y);
        state.y += LINE_H * 0.6;
        pdf.setDrawColor(209, 213, 219);
        pdf.line(leftX, state.y, rightX, state.y);
        state.y += LINE_H * 1.1;
    };

    const writeWrapped = (
        text: string,
        opts: {
            bold?: boolean;
            size?: number;
            gapAfter?: number;
            color?: { r: number; g: number; b: number };
        },
    ) => {
        const logical = stripResumeHtml(String(text || '')).trim();
        if (!logical) return;
        pdf.setFont(FONT_FAMILY, opts.bold ? 'bold' : 'normal');
        pdf.setFontSize(opts.size ?? BODY_SIZE);
        pdf.setTextColor(opts.color?.r ?? 55, opts.color?.g ?? 65, opts.color?.b ?? 81);
        if (!HEBREW_RE.test(logical)) {
            const rawLines = pdf.splitTextToSize(logical, wrapWidth) as string[];
            for (const rawLine of rawLines) {
                ensureSpace(LINE_H);
                pdfTextRightBounded(pdf, rawLine, rightX, leftX, state.y);
                state.y += LINE_H;
            }
        } else {
            const tokenLines = wrapLogicalToTokenLines(pdf, logical, wrapWidth);
            for (const tokenLine of tokenLines) {
                ensureSpace(LINE_H);
                const lineText = tokenLine.map((token) => token.value).join('');
                drawLogicalLine(pdf, lineText, rightX, leftX, state.y);
                state.y += LINE_H;
            }
        }
        state.y += opts.gapAfter ?? LINE_H * 0.35;
    };

    const subtitleLines = (text: string, opts?: { gapAfter?: number }) => {
        writeWrapped(text, {
            bold: true,
            size: SUBTITLE_SIZE,
            color: SUBTITLE_COLOR,
            gapAfter: opts?.gapAfter,
        });
    };

    const companyLine = (text: string, opts?: { gapAfter?: number }) => {
        writeWrapped(text, {
            bold: true,
            size: SUBTITLE_SIZE,
            color: COMPANY_COLOR,
            gapAfter: opts?.gapAfter,
        });
    };

    const bodyLines = (
        text: string,
        opts?: { bold?: boolean; size?: number; gapAfter?: number },
    ) => {
        writeWrapped(text, {
            bold: opts?.bold,
            size: opts?.size,
            gapAfter: opts?.gapAfter,
        });
    };

    const blank = (mm = LINE_H * 0.5) => {
        state.y += mm;
    };

    return {
        pdf,
        pageW,
        contentW,
        leftX,
        rightX,
        get y() {
            return state.y;
        },
        set y(value: number) {
            state.y = value;
        },
        ensureSpace,
        sectionTitle,
        subtitleLines,
        companyLine,
        bodyLines,
        blank,
    };
}

function renderExperienceSection(
    w: PdfWriter,
    heading: string,
    items: Array<Record<string, unknown>>,
) {
    if (!items.length) return;
    w.sectionTitle(heading);
    items.forEach((exp, index) => {
        const company = String(exp.company || exp.organization || exp.employer || '').trim();
        const description = String(exp.description || exp.summary || '').trim();
        const subtitle = buildExperienceSubtitle(exp);

        if (subtitle) {
            w.subtitleLines(subtitle, { gapAfter: LINE_H * 0.12 });
        }
        if (company) w.companyLine(company, { gapAfter: LINE_H * 0.1 });
        if (description) w.bodyLines(description, { gapAfter: LINE_H * 0.55 });
        else if (index < items.length - 1) w.blank(LINE_H * 0.35);
    });
}

/**
 * Export תצוגת AI חכמה as a real text PDF (selectable / parseable), not a blank image raster.
 */
export async function downloadPrintableResumeAsPdf(
    data: unknown,
    filename: string,
    options?: { clientLogo?: ExportImagePayload | null },
): Promise<void> {
    const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    await ensureHebrewFonts(pdf);

    let contentStartY = MARGIN_TOP_MM;
    const logo = options?.clientLogo ?? null;
    if (logo) {
        const drawWmm = EXPORT_LOGO_MAX_WIDTH_MM;
        const drawHmm = exportLogoHeightMm(logo);
        pdf.addImage(
            exportImageToDataUrl(logo),
            jsPdfImageFormat(logo),
            EXPORT_LOGO_LEFT_MM,
            EXPORT_LOGO_TOP_MM,
            drawWmm,
            drawHmm,
            undefined,
            'FAST',
        );
        contentStartY = EXPORT_LOGO_TOP_MM + drawHmm + 6;
    }

    const displayName =
        buildCandidateFullName(row.firstName as string, row.lastName as string) ||
        String(row.fullName || '').trim();
    const title = String(row.title || '').trim();
    const phone = String(row.phone || '').trim();
    const email = String(row.email || '').trim();
    const location = String(row.location || '').trim();
    const summary = stripResumeHtml(String(row.professionalSummary || ''));

    const workRaw = normalizeExperienceList(
        (Array.isArray(row.workExperience) ? row.workExperience : []) as unknown[],
    );
    const explicitMilitary = normalizeExperienceList(
        (Array.isArray(row.militaryExperience) ? row.militaryExperience : []) as unknown[],
    );
    const { civilianWorkExperience, militaryExperience } = splitWorkExperienceForPrint(
        workRaw,
        explicitMilitary,
    );

    const education = (Array.isArray(row.education) ? row.education : [])
        .map((edu) => educationEntryToDisplayLine(edu))
        .filter(Boolean);
    const languages = normalizeLanguagesForPrintRows(row.languages);
    const drivingLicenses = normalizeDrivingLicensesForPrint(row);
    const skillLabels = (Array.isArray(row.tagDetails) ? row.tagDetails : [])
        .map(tagDetailLabel)
        .filter(Boolean);

    const w = createWriter(pdf, contentStartY);

    // Header
    pdf.setFont(FONT_FAMILY, 'bold');
    pdf.setFontSize(TITLE_SIZE);
    pdf.setTextColor(17, 24, 39);
    w.ensureSpace(TITLE_SIZE);
    drawLogicalLine(pdf, displayName || 'קורות חיים', w.rightX, w.leftX, w.y);
    w.y += LINE_H * 1.35;

    if (title) {
        pdf.setFont(FONT_FAMILY, 'normal');
        pdf.setFontSize(SUBTITLE_SIZE + 1);
        pdf.setTextColor(37, 99, 235);
        w.ensureSpace(SUBTITLE_SIZE);
        drawLogicalLine(pdf, title, w.rightX, w.leftX, w.y);
        w.y += LINE_H * 1.1;
    }

    const contactParts = [phone, email, location].filter(Boolean);
    if (contactParts.length) {
        pdf.setFont(FONT_FAMILY, 'normal');
        pdf.setFontSize(BODY_SIZE);
        pdf.setTextColor(75, 85, 99);
        w.ensureSpace(LINE_H);
        drawLogicalLine(pdf, contactParts.join('  ·  '), w.rightX, w.leftX, w.y);
        w.y += LINE_H * 1.2;
    }

    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    w.ensureSpace(LINE_H);
    drawHiroFooterLine(pdf, w.rightX, w.y);
    w.y += LINE_H * 1.1;

    if (summary) {
        w.sectionTitle('תמצית ');
        w.bodyLines(summary);
    }

    renderExperienceSection(
        w,
        'ניסיון תעסוקתי',
        normalizeExperienceList(civilianWorkExperience as unknown[]),
    );
    renderExperienceSection(
        w,
        'ניסיון צבאי',
        normalizeExperienceList(militaryExperience as unknown[]),
    );

    if (education.length) {
        w.sectionTitle('השכלה');
        education.forEach((line) => w.subtitleLines(line, { gapAfter: LINE_H * 0.25 }));
    }

    if (drivingLicenses.length) {
        w.sectionTitle('רישיונות נהיגה');
        w.bodyLines(drivingLicenses.join(' · '), { gapAfter: LINE_H * 0.35 });
    }

    if (skillLabels.length) {
        w.sectionTitle('מיומנויות');
        w.bodyLines(skillLabels.join(' · '), { gapAfter: LINE_H * 0.35 });
    }

    if (languages.length) {
        w.sectionTitle('שפות');
        languages.forEach((lang) => {
            const line = lang.levelText ? `${lang.name} — ${lang.levelText}` : lang.name;
            w.bodyLines(line, { gapAfter: LINE_H * 0.15 });
        });
    }

    pdf.save(filename);
}

export function printableResumePdfFilename(baseName: string): string {
    return `${sanitizePdfFilename(baseName || 'resume')}_hir_resume.pdf`;
}
