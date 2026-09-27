import {
    type ExportImagePayload,
    EXPORT_LOGO_LEFT_MM,
    EXPORT_LOGO_MAX_WIDTH_MM,
    EXPORT_LOGO_MAX_WIDTH_PX,
    EXPORT_LOGO_RIGHT_MM,
    EXPORT_LOGO_TOP_MM,
    exportImageToDataUrl,
    exportLogoHeightMm,
    jsPdfImageFormat,
} from './exportImagePayload';
import { downloadBlobAsFile } from './downloadBlobAsFile';
import { sanitizePdfFilename } from './resumeViewerPdfExport';
import { downloadParsedSearchTextAsPdf } from './parsedSearchTextPdfExport';
import { downloadParsedSearchTextAsDocx } from './parsedSearchTextDocxExport';
import { injectLogoIntoDocx, type DocxLogoAlign } from './docxLogoInject';

type OriginalFileKind = 'pdf' | 'docx' | 'image' | 'unknown';

export type ExportLogoAlign = DocxLogoAlign;

export type OriginalDocumentExportOptions = {
    candidateName?: string;
    clientLogo?: ExportImagePayload | null;
};

function detectKindFromNameAndType(name: string, contentType?: string): OriginalFileKind {
    const lower = String(name || '').toLowerCase();
    const ct = String(contentType ?? '').toLowerCase();
    if (/\.pdf(\?|$)/.test(lower) || ct.includes('pdf')) return 'pdf';
    if (/\.docx(\?|$)/.test(lower) || ct.includes('wordprocessingml')) return 'docx';
    if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/.test(lower) || ct.startsWith('image/')) return 'image';
    return 'unknown';
}

function detectKind(url: string, contentType?: string): OriginalFileKind {
    return detectKindFromNameAndType(url, contentType);
}

function pdfLogoLeftPt(pageWidthPt: number, drawWpt: number, align: ExportLogoAlign): number {
    if (align === 'right') {
        return pageWidthPt - mmToPt(EXPORT_LOGO_RIGHT_MM) - drawWpt;
    }
    return mmToPt(EXPORT_LOGO_LEFT_MM);
}

function jsPdfLogoLeftMm(pageWidthMm: number, drawWmm: number, align: ExportLogoAlign): number {
    if (align === 'right') {
        return pageWidthMm - EXPORT_LOGO_RIGHT_MM - drawWmm;
    }
    return EXPORT_LOGO_LEFT_MM;
}

function mmToPt(mm: number): number {
    return (mm * 72) / 25.4;
}

function pxToMm(px: number): number {
    return (px * 25.4) / 96;
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image_load_failed'));
        img.src = src;
    });
}

async function fetchOriginalBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('fetch_failed');
    return {
        bytes: await res.arrayBuffer(),
        contentType: res.headers.get('content-type') || '',
    };
}

async function logoAsPngBytes(logo: ExportImagePayload): Promise<Uint8Array> {
    if (logo.type === 'png') return logo.data;
    const dataUrl = exportImageToDataUrl(logo);
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, img.naturalWidth);
    canvas.height = Math.max(1, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas2d');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_encode_failed'))), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
}

async function logoAsEmbeddable(logo: ExportImagePayload): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' }> {
    if (logo.type === 'jpg') return { bytes: logo.data, type: 'jpg' };
    if (logo.type === 'png') return { bytes: logo.data, type: 'png' };
    return { bytes: await logoAsPngBytes(logo), type: 'png' };
}

async function stampPdfWithLogo(
    pdfBytes: ArrayBuffer,
    logo: ExportImagePayload,
    align: ExportLogoAlign = 'left',
): Promise<Uint8Array> {
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const { bytes, type } = await logoAsEmbeddable(logo);
    const embedded = type === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

    const drawWpt = mmToPt(EXPORT_LOGO_MAX_WIDTH_MM);
    const drawHpt = Math.max(8, (logo.height / Math.max(logo.width, 1)) * drawWpt);
    const topPt = mmToPt(EXPORT_LOGO_TOP_MM);

    for (const page of pdfDoc.getPages()) {
        const { width, height } = page.getSize();
        page.drawImage(embedded, {
            x: pdfLogoLeftPt(width, drawWpt, align),
            y: height - topPt - drawHpt,
            width: drawWpt,
            height: drawHpt,
        });
    }
    return pdfDoc.save();
}

async function imageToPdfWithLogo(
    imageBytes: ArrayBuffer,
    contentType: string,
    logo: ExportImagePayload | null,
    align: ExportLogoAlign = 'left',
): Promise<Uint8Array> {
    const blob = new Blob([imageBytes], { type: contentType || 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    try {
        const img = await loadImage(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, img.naturalWidth);
        canvas.height = Math.max(1, img.naturalHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 10;

        let contentTopMm = margin;
        if (logo) {
            const drawWmm = EXPORT_LOGO_MAX_WIDTH_MM;
            const drawHmm = exportLogoHeightMm(logo);
            pdf.addImage(
                exportImageToDataUrl(logo),
                jsPdfImageFormat(logo),
                jsPdfLogoLeftMm(pageW, drawWmm, align),
                EXPORT_LOGO_TOP_MM,
                drawWmm,
                drawHmm,
                undefined,
                'FAST',
            );
            contentTopMm = EXPORT_LOGO_TOP_MM + drawHmm + 4;
        }

        const imgWmm = pxToMm(canvas.width);
        const imgHmm = pxToMm(canvas.height);
        const maxW = pageW - margin * 2;
        const maxH = pageH - contentTopMm - margin;
        const scale = Math.min(maxW / imgWmm, maxH / imgHmm, 1);
        const drawW = imgWmm * scale;
        const drawH = imgHmm * scale;
        const x = margin + (maxW - drawW) / 2;

        pdf.addImage(
            canvas.toDataURL('image/jpeg', 0.92),
            'JPEG',
            x,
            contentTopMm,
            drawW,
            drawH,
            undefined,
            'FAST',
        );

        return new Uint8Array(pdf.output('arraybuffer'));
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

async function stampImageBytesWithLogo(
    imageBytes: ArrayBuffer,
    contentType: string,
    logo: ExportImagePayload,
    align: ExportLogoAlign = 'right',
): Promise<{ bytes: Uint8Array; contentType: string }> {
    const blob = new Blob([imageBytes], { type: contentType || 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    try {
        const img = await loadImage(blobUrl);
        const logoImg = await loadImage(exportImageToDataUrl(logo));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, img.naturalWidth);
        canvas.height = Math.max(1, img.naturalHeight);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas2d');
        ctx.drawImage(img, 0, 0);

        const maxLogoW = Math.min(
            EXPORT_LOGO_MAX_WIDTH_PX,
            Math.max(48, Math.round(canvas.width * 0.22)),
        );
        const scale = maxLogoW / Math.max(logo.width, 1);
        const drawW = Math.max(1, Math.round(logo.width * scale));
        const drawH = Math.max(1, Math.round(logo.height * scale));
        const margin = Math.max(8, Math.round(canvas.width * 0.02));
        const x =
            align === 'right'
                ? canvas.width - margin - drawW
                : margin;
        const y = margin;
        ctx.drawImage(logoImg, x, y, drawW, drawH);

        const preferJpeg = /jpe?g/i.test(contentType) || /\.jpe?g/i.test(contentType);
        const outType = preferJpeg ? 'image/jpeg' : 'image/png';
        const outBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('image_encode_failed'))),
                outType,
                preferJpeg ? 0.92 : undefined,
            );
        });
        return {
            bytes: new Uint8Array(await outBlob.arrayBuffer()),
            contentType: outType,
        };
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

export type StampedBinaryAttachment = {
    bytes: Uint8Array;
    filename: string;
    contentType: string;
};

/** Stamp PDF/DOCX/image bytes with the tenant logo (for outbound email attachments). */
export async function stampBinaryAttachmentWithClientLogo(
    input: { bytes: ArrayBuffer | Uint8Array; filename: string; contentType?: string },
    logo: ExportImagePayload,
    options?: { align?: ExportLogoAlign },
): Promise<StampedBinaryAttachment> {
    const align = options?.align ?? 'right';
    const filename = String(input.filename || 'attachment');
    const contentType = String(input.contentType || '').trim();
    const buffer =
        input.bytes instanceof Uint8Array
            ? input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength)
            : input.bytes;
    const kind = detectKindFromNameAndType(filename, contentType);

    if (kind === 'pdf') {
        const stamped = await stampPdfWithLogo(buffer, logo, align);
        return {
            bytes: stamped,
            filename,
            contentType: 'application/pdf',
        };
    }

    if (kind === 'docx') {
        const stamped = await injectLogoIntoDocx(buffer, logo, align);
        return {
            bytes: stamped,
            filename: /\.docx$/i.test(filename) ? filename : `${filename.replace(/\.[^.]+$/, '')}.docx`,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        };
    }

    if (kind === 'image') {
        const stamped = await stampImageBytesWithLogo(buffer, contentType, logo, align);
        return {
            bytes: stamped.bytes,
            filename,
            contentType: stamped.contentType,
        };
    }

    return {
        bytes: input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(buffer),
        filename,
        contentType: contentType || 'application/octet-stream',
    };
}

async function docxToPlainText(docxBytes: ArrayBuffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ arrayBuffer: docxBytes });
    return String(result.value ?? '').trim();
}

async function imageToDocxWithLogo(
    imageBytes: ArrayBuffer,
    contentType: string,
    logo: ExportImagePayload | null,
): Promise<Blob> {
    const { AlignmentType, Document, ImageRun, Packer, Paragraph } = await import('docx');
    const blob = new Blob([imageBytes], { type: contentType || 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    try {
        const img = await loadImage(blobUrl);
        const maxW = 520;
        const scale = Math.min(maxW / Math.max(img.naturalWidth, 1), 1);
        const imgW = Math.max(1, Math.round(img.naturalWidth * scale));
        const imgH = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas2d');
        ctx.drawImage(img, 0, 0);
        const pngBytes = new Uint8Array(
            await (await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png_encode_failed'))), 'image/png');
            })).arrayBuffer(),
        );

        const blocks: InstanceType<typeof Paragraph>[] = [];
        if (logo) {
            blocks.push(
                new Paragraph({
                    bidirectional: true,
                    alignment: AlignmentType.LEFT,
                    spacing: { after: 160 },
                    children: [
                        new ImageRun({
                            type: logo.type === 'jpg' ? 'jpg' : 'png',
                            data: logo.data,
                            transformation: { width: logo.width, height: logo.height },
                        }),
                    ],
                }),
            );
        }
        blocks.push(
            new Paragraph({
                bidirectional: true,
                alignment: AlignmentType.CENTER,
                children: [
                    new ImageRun({
                        type: 'png',
                        data: pngBytes,
                        transformation: { width: imgW, height: imgH },
                    }),
                ],
            }),
        );

        const doc = new Document({
            sections: [{ properties: {}, children: blocks }],
        });
        return Packer.toBlob(doc);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

export function originalDocumentPdfFilename(baseName: string): string {
    return `${sanitizePdfFilename(baseName || 'resume')}_original.pdf`;
}

export function originalDocumentDocxFilename(baseName: string): string {
    return `${sanitizePdfFilename(baseName || 'resume')}_original.docx`;
}

export async function downloadOriginalDocumentWithLogo(
    fileUrl: string,
    filenameBase: string,
    format: 'pdf' | 'docx',
    options?: OriginalDocumentExportOptions,
): Promise<void> {
    const url = String(fileUrl ?? '').trim();
    if (!url) throw new Error('no_file');

    const logo = options?.clientLogo ?? null;
    const { bytes, contentType } = await fetchOriginalBytes(url);
    const kind = detectKind(url, contentType);

    if (format === 'pdf') {
        const filename = originalDocumentPdfFilename(filenameBase);
        if (kind === 'pdf') {
            if (!logo) {
                await downloadBlobAsFile(new Blob([bytes], { type: 'application/pdf' }), filename);
                return;
            }
            const stamped = await stampPdfWithLogo(bytes, logo);
            await downloadBlobAsFile(new Blob([stamped], { type: 'application/pdf' }), filename);
            return;
        }
        if (kind === 'image') {
            const pdfBytes = await imageToPdfWithLogo(bytes, contentType, logo);
            await downloadBlobAsFile(new Blob([pdfBytes], { type: 'application/pdf' }), filename);
            return;
        }
        if (kind === 'docx') {
            const text = await docxToPlainText(bytes);
            if (!text) throw new Error('empty_text');
            await downloadParsedSearchTextAsPdf(text, filename, {
                candidateName: options?.candidateName,
                clientLogo: logo,
            });
            return;
        }
        throw new Error('unsupported_format');
    }

    const filename = originalDocumentDocxFilename(filenameBase);
    if (kind === 'docx') {
        if (!logo) {
            await downloadBlobAsFile(
                new Blob([bytes], {
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                }),
                filename,
            );
            return;
        }
        const stamped = await injectLogoIntoDocx(bytes, logo);
        await downloadBlobAsFile(
            new Blob([stamped], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            }),
            filename,
        );
        return;
    }

    if (kind === 'image') {
        const blob = await imageToDocxWithLogo(bytes, contentType, logo);
        await downloadBlobAsFile(blob, filename);
        return;
    }

    if (kind === 'pdf') {
        await downloadParsedSearchTextAsDocx(
            options?.candidateName ? `${options.candidateName}\n\n(מסמך PDF מקורי)` : '(מסמך PDF מקורי)',
            filename,
            { candidateName: options?.candidateName, clientLogo: logo },
        );
        return;
    }

    throw new Error('unsupported_format');
}
