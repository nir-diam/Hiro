import JSZip from 'jszip';
import {
    type ExportImagePayload,
    docxLogoEmuDimensions,
    exportImageToDataUrl,
} from './exportImagePayload';
import { patchDocxBytesForRtlDisplay } from './docxPostProcess';

export type DocxLogoAlign = 'left' | 'right';

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('logo_image_load_failed'));
        img.src = src;
    });
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

function buildLogoParagraphXml(
    relId: string,
    widthEmu: number,
    heightEmu: number,
    align: DocxLogoAlign = 'left',
): string {
    const jc = align === 'right' ? 'right' : 'left';
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:pPr><w:jc w:val="${jc}"/><w:bidi w:val="0"/><w:spacing w:after="240"/></w:pPr>
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

export type InjectDocxLogoOptions = {
    /** When true, add section-level RTL bidi (full RTL documents). */
    applyRtlSectionPatch?: boolean;
};

/** Inject tenant logo at the top of a DOCX (physical left by default). */
export async function injectLogoIntoDocx(
    docxBytes: ArrayBuffer,
    logo: ExportImagePayload,
    align: DocxLogoAlign = 'left',
    options?: InjectDocxLogoOptions,
): Promise<Uint8Array> {
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
    contentTypesXml = ensureContentType(contentTypesXml, 'png', 'image/png');
    zip.file(ctPath, contentTypesXml);

    const docPath = 'word/document.xml';
    let documentXml = await zip.file(docPath)?.async('string');
    if (!documentXml) throw new Error('docx_document_missing');

    const { widthEmu, heightEmu } = docxLogoEmuDimensions(logo);
    const logoParagraph = buildLogoParagraphXml(relId, widthEmu, heightEmu, align);
    documentXml = documentXml.replace(/<w:body>/, `<w:body>${logoParagraph}`);
    zip.file(docPath, documentXml);

    let out = await zip.generateAsync({ type: 'uint8array' });
    if (options?.applyRtlSectionPatch !== false) {
        out = await patchDocxBytesForRtlDisplay(out);
    }
    return out;
}
