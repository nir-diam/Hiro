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

const MARGIN_MM = 14;
const PAGE_H_MM = 297;
const LINE_H = 5.2;
const BODY_SIZE = 10.5;
const TITLE_SIZE = 20;
const SECTION_SIZE = 12;
const SUBTITLE_SIZE = 11;

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

function experienceDateLabel(exp: Record<string, unknown>): string {
    const preset = typeof exp.dateRangeLabel === 'string' ? exp.dateRangeLabel.trim() : '';
    if (preset) return preset;
    const start = formatCvPrintDate(exp.startDate as string | undefined);
    const end = formatCvPrintDate(exp.endDate as string | undefined);
    return [start, end].filter(Boolean).join(' — ');
}

type PdfWriter = {
    pdf: import('jspdf').jsPDF;
    pageW: number;
    contentW: number;
    rightX: number;
    y: number;
    ensureSpace: (neededMm: number) => void;
    sectionTitle: (title: string) => void;
    bodyLines: (text: string, opts?: { bold?: boolean; size?: number; gapAfter?: number }) => void;
    blank: (mm?: number) => void;
};

function createWriter(pdf: import('jspdf').jsPDF, startY = MARGIN_MM): PdfWriter {
    const pageW = pdf.internal.pageSize.getWidth();
    const contentW = pageW - MARGIN_MM * 2;
    const rightX = pageW - MARGIN_MM;
    const state = { y: startY };

    const ensureSpace = (neededMm: number) => {
        if (state.y + neededMm <= PAGE_H_MM - MARGIN_MM) return;
        pdf.addPage();
        state.y = MARGIN_MM;
    };

    const sectionTitle = (title: string) => {
        ensureSpace(SECTION_SIZE + LINE_H * 2);
        pdf.setFont(FONT_FAMILY, 'bold');
        pdf.setFontSize(SECTION_SIZE);
        pdf.setTextColor(31, 41, 55);
        pdf.text(title, rightX, state.y, { align: 'right' });
        state.y += LINE_H * 0.6;
        pdf.setDrawColor(209, 213, 219);
        pdf.line(MARGIN_MM, state.y, rightX, state.y);
        state.y += LINE_H * 1.1;
    };

    const bodyLines = (
        text: string,
        opts?: { bold?: boolean; size?: number; gapAfter?: number },
    ) => {
        const cleaned = stripResumeHtml(String(text || '')).trim();
        if (!cleaned) return;
        pdf.setFont(FONT_FAMILY, opts?.bold ? 'bold' : 'normal');
        pdf.setFontSize(opts?.size ?? BODY_SIZE);
        pdf.setTextColor(55, 65, 81);
        const lines = pdf.splitTextToSize(cleaned, contentW) as string[];
        for (const line of lines) {
            ensureSpace(LINE_H);
            pdf.text(line, rightX, state.y, { align: 'right' });
            state.y += LINE_H;
        }
        state.y += opts?.gapAfter ?? LINE_H * 0.35;
    };

    const blank = (mm = LINE_H * 0.5) => {
        state.y += mm;
    };

    return {
        pdf,
        pageW,
        contentW,
        rightX,
        get y() {
            return state.y;
        },
        set y(value: number) {
            state.y = value;
        },
        ensureSpace,
        sectionTitle,
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
        const title = String(exp.title || exp.position || exp.role || '').trim();
        const company = String(exp.company || exp.organization || exp.employer || '').trim();
        const dates = experienceDateLabel(exp);
        const description = String(exp.description || exp.summary || '').trim();

        if (title) {
            const head = dates ? `${title}  ·  ${dates}` : title;
            w.bodyLines(head, { bold: true, gapAfter: LINE_H * 0.15 });
        } else if (dates) {
            w.bodyLines(dates, { bold: true, gapAfter: LINE_H * 0.15 });
        }
        if (company) w.bodyLines(company, { size: SUBTITLE_SIZE, gapAfter: LINE_H * 0.1 });
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
    pdf.setR2L(true);

    let contentStartY = MARGIN_MM;
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
    pdf.text(displayName || 'קורות חיים', w.rightX, w.y, { align: 'right' });
    w.y += LINE_H * 1.35;

    if (title) {
        pdf.setFont(FONT_FAMILY, 'normal');
        pdf.setFontSize(SUBTITLE_SIZE + 1);
        pdf.setTextColor(37, 99, 235);
        w.ensureSpace(SUBTITLE_SIZE);
        pdf.text(title, w.rightX, w.y, { align: 'right' });
        w.y += LINE_H * 1.1;
    }

    const contactParts = [phone, email, location].filter(Boolean);
    if (contactParts.length) {
        pdf.setFont(FONT_FAMILY, 'normal');
        pdf.setFontSize(BODY_SIZE);
        pdf.setTextColor(75, 85, 99);
        w.ensureSpace(LINE_H);
        pdf.text(contactParts.join('  ·  '), w.rightX, w.y, { align: 'right' });
        w.y += LINE_H * 1.2;
    }

    pdf.setFontSize(8);
    pdf.setTextColor(156, 163, 175);
    w.ensureSpace(LINE_H);
    pdf.text('נוצר באמצעות HIRO', w.rightX, w.y, { align: 'right' });
    w.y += LINE_H * 1.1;

    if (summary) {
        w.sectionTitle('תמצית מנהלים');
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
        education.forEach((line) => w.bodyLines(line, { bold: true, gapAfter: LINE_H * 0.25 }));
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
