import JSZip from 'jszip';
import {
    type ExportImagePayload,
    EXPORT_LOGO_LEFT_MM,
    EXPORT_LOGO_MAX_WIDTH_MM,
    EXPORT_LOGO_TOP_MM,
    exportImageToDataUrl,
    exportLogoHeightMm,
    jsPdfImageFormat,
} from './exportImagePayload';
import { downloadBlobAsFile } from './downloadBlobAsFile';
import { sanitizePdfFilename } from './resumeViewerPdfExport';
import { downloadParsedSearchTextAsPdf } from './parsedSearchTextPdfExport';
import { downloadParsedSearchTextAsDocx } from './parsedSearchTextDocxExport';

type OriginalFileKind = 'pdf' | 'docx' | 'image' | 'unknown';

export type OriginalDocumentExportOptions = {
    candidateName?: string;
    clientLogo?: ExportImagePayload | null;
};

function detectKind(url: string, contentType?: string): OriginalFileKind {
    const lower = url.toLowerCase();
    const ct = String(contentType ?? '').toLowerCase();
    if (/\.pdf(\?|$)/.test(lower) || ct.includes('pdf')) return 'pdf';
    if (/\.docx?(\?|$)/.test(lower) || ct.includes('wordprocessingml')) return 'docx';
    if (/\.(png|jpe?g|gif|webp)(\?|$)/.test(lower) || ct.startsWith('image/')) return 'image';
    return 'unknown';
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

async function stampPdfWithLogo(pdfBytes: ArrayBuffer, logo: ExportImagePayload): Promise<Uint8Array> {
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const { bytes, type } = await logoAsEmbeddable(logo);
    const embedded = type === 'jpg' ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);

    const drawWpt = mmToPt(EXPORT_LOGO_MAX_WIDTH_MM);
    const drawHpt = Math.max(8, (logo.height / Math.max(logo.width, 1)) * drawWpt);
    const leftPt = mmToPt(EXPORT_LOGO_LEFT_MM);
    const topPt = mmToPt(EXPORT_LOGO_TOP_MM);

    for (const page of pdfDoc.getPages()) {
        const { height } = page.getSize();
        page.drawImage(embedded, {
            x: leftPt,
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
                EXPORT_LOGO_LEFT_MM,
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

function nextRelationshipId(relsXml: string): string {
    const matches = [...relsXml.matchAll(/Id="rId(\d+)"/g)];
    const max = matches.reduce((acc, m) => Math.max(acc, Number(m[1] || 0)), 0);
    return `rId${max + 1}`;
}

function ensureContentType(contentTypesXml: string, extension: string, contentType: string): string {
    if (contentTypesXml.includes(`Extension="${extension}"`)) return contentTypesXml;
    return contentTypesXml.replace(
        '</Types>',
        `  <Default Extension="${extension}" ContentType="${contentType}"/>\n</Types>`,
    );
}

function buildLogoParagraphXml(relId: string, widthEmu: number, heightEmu: number): string {
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:pPr><w:jc w:val="left"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="9001" name="Client Logo"/>
        <wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr><pic:cNvPr id="9002" name="Client Logo"/><pic:cNvPicPr/></pic:nvPicPr>
              <pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
              <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
}

async function injectLogoIntoDocx(docxBytes: ArrayBuffer, logo: ExportImagePayload): Promise<Uint8Array> {
    const zip = await JSZip.loadAsync(docxBytes);
    const pngBytes = await logoAsPngBytes(logo);
    const mediaPath = 'word/media/hiro_export_logo.png';
    zip.file(mediaPath, pngBytes);

    const relsPath = 'word/_rels/document.xml.rels';
    let relsXml = await zip.file(relsPath)?.async('string');
    if (!relsXml) throw new Error('docx_rels_missing');
    const relId = nextRelationshipId(relsXml);
    relsXml = relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/hiro_export_logo.png"/></Relationships>`,
    );
    zip.file(relsPath, relsXml);

    const ctPath = '[Content_Types].xml';
    let contentTypesXml = await zip.file(ctPath)?.async('string');
    if (!contentTypesXml) throw new Error('docx_content_types_missing');
    contentTypesXml = ensureContentType(
        contentTypesXml,
        'png',
        'image/png',
    );
    zip.file(ctPath, contentTypesXml);

    const docPath = 'word/document.xml';
    let documentXml = await zip.file(docPath)?.async('string');
    if (!documentXml) throw new Error('docx_document_missing');

    const widthEmu = Math.round((logo.width / 96) * 914400);
    const heightEmu = Math.round((logo.height / 96) * 914400);
    const logoParagraph = buildLogoParagraphXml(relId, widthEmu, heightEmu);
    documentXml = documentXml.replace(/<w:body>/, `<w:body>${logoParagraph}`);
    zip.file(docPath, documentXml);

    return zip.generateAsync({ type: 'uint8array' });
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
