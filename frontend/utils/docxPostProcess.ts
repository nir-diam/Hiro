import JSZip from 'jszip';
import { cvLineUsesRtl, HEBREW_RE } from './cvMixedTextDirection';

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function paragraphPlainText(pXml: string): string {
    return [...pXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => m[1] ?? '')
        .join('');
}

function documentHasHebrew(documentXml: string): boolean {
    return [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].some((m) =>
        HEBREW_RE.test(m[1] ?? ''),
    );
}

function isLogoParagraph(pXml: string): boolean {
    return pXml.includes('name="Client Logo"') || pXml.includes('Client Logo');
}

function applyParagraphDirection(pXml: string, rtl: boolean, physicalLeft = false): string {
    const jc = physicalLeft ? 'left' : 'start';
    const bidiTag = rtl ? '<w:bidi/>' : '<w:bidi w:val="0"/>';
    const directionPr = `<w:jc w:val="${jc}"/>${bidiTag}`;

    if (/<w:pPr\b/.test(pXml)) {
        return pXml.replace(/<w:pPr\b([^>]*)>([\s\S]*?)<\/w:pPr>/, (_match, attrs, inner) => {
            let cleaned = String(inner)
                .replace(/<w:jc\b[^/]*\/?>/g, '')
                .replace(/<w:bidi\b[^/]*\/?>/g, '');
            return `<w:pPr${attrs}>${directionPr}${cleaned}</w:pPr>`;
        });
    }

    return pXml.replace(/<w:p\b([^>]*)>/, `<w:p$1><w:pPr>${directionPr}</w:pPr>`);
}

function patchParagraphDirections(documentXml: string): string {
    return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (pXml) => {
        if (isLogoParagraph(pXml)) {
            return applyParagraphDirection(pXml, false, true);
        }
        const text = paragraphPlainText(pXml);
        if (!text.trim()) return pXml;
        return applyParagraphDirection(pXml, cvLineUsesRtl(text));
    });
}

function sectionHasBidi(documentXml: string): boolean {
    const sect = documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/);
    return sect ? /<w:bidi\b/.test(sect[0]) : false;
}

function ensureSectionBidi(documentXml: string): string {
    if (!documentHasHebrew(documentXml) || sectionHasBidi(documentXml)) {
        return documentXml;
    }
    if (documentXml.includes('</w:sectPr>')) {
        return documentXml.replace('</w:sectPr>', '    <w:bidi/>\n</w:sectPr>');
    }
    if (documentXml.includes('</w:body>')) {
        return documentXml.replace(
            '</w:body>',
            '<w:sectPr><w:bidi/></w:sectPr></w:body>',
        );
    }
    return documentXml;
}

async function patchMixedCvDocumentXml(zip: JSZip): Promise<void> {
    const docPath = 'word/document.xml';
    let documentXml = await zip.file(docPath)?.async('string');
    if (!documentXml) return;

    documentXml = patchParagraphDirections(documentXml);
    documentXml = ensureSectionBidi(documentXml);
    zip.file(docPath, documentXml);
}

async function ensureSectionBidiOnly(zip: JSZip): Promise<void> {
    const docPath = 'word/document.xml';
    let documentXml = await zip.file(docPath)?.async('string');
    if (!documentXml || sectionHasBidi(documentXml)) return;

    if (documentXml.includes('</w:sectPr>')) {
        documentXml = documentXml.replace('</w:sectPr>', '    <w:bidi/>\n</w:sectPr>');
    } else if (documentXml.includes('</w:body>')) {
        documentXml = documentXml.replace(
            '</w:body>',
            '<w:sectPr><w:bidi/></w:sectPr></w:body>',
        );
    } else {
        return;
    }
    zip.file(docPath, documentXml);
}

export async function patchDocxForRtlDisplay(input: Blob | Uint8Array): Promise<Blob> {
    const buffer =
        input instanceof Blob
            ? await input.arrayBuffer()
            : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    const zip = await JSZip.loadAsync(buffer);
    await ensureSectionBidiOnly(zip);
    return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

export async function patchDocxBytesForRtlDisplay(bytes: Uint8Array): Promise<Uint8Array> {
    const blob = await patchDocxForRtlDisplay(bytes);
    return new Uint8Array(await blob.arrayBuffer());
}

/** Mixed Hebrew/Latin CV: START alignment + per-paragraph bidi. */
export async function patchDocxForMixedCvExport(input: Blob | Uint8Array): Promise<Blob> {
    const buffer =
        input instanceof Blob
            ? await input.arrayBuffer()
            : input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    const zip = await JSZip.loadAsync(buffer);
    await patchMixedCvDocumentXml(zip);
    return zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME });
}

export async function patchDocxBytesForMixedCvExport(bytes: Uint8Array): Promise<Uint8Array> {
    const blob = await patchDocxForMixedCvExport(bytes);
    return new Uint8Array(await blob.arrayBuffer());
}
