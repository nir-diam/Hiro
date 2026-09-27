import {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    TextRun,
} from 'docx';
import { sanitizePdfFilename } from './resumeViewerPdfExport';
import {
    CV_EXPORT_COLORS,
    classifyCvLine,
    type CvLineStyle,
} from './parsedSearchTextFormatting';
import {
    PARSED_CV_DOCUMENT_TITLE,
    type ParsedSearchTextExportOptions,
} from './parsedSearchTextExportHtml';
import { downloadBlobAsFile } from './downloadBlobAsFile';
import { patchDocxBytesForMixedCvExport } from './docxPostProcess';
import { injectLogoIntoDocx } from './docxLogoInject';
import {
    cvLineUsesRtl,
    tokenizeMixedCvLine,
} from './cvMixedTextDirection';

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const YEAR_RANGE_GLOBAL = /\d{4}\s*[-–—]\s*\d{2,4}|\d{4}\s*[-–—]\s*היום/g;

function hexColor(hex: string): string {
    return hex.replace('#', '');
}

type DocxParagraphExtra = Record<string, unknown>;
type DocxRunStyle = Record<string, unknown>;

function cvParagraph(
    children: TextRun[],
    lineText: string,
    extra: DocxParagraphExtra = {},
) {
    const rtl = cvLineUsesRtl(lineText);
    // Word mirrors left/right in RTL paragraphs — use START so Hebrew aligns visually right
    // and English-only lines align visually left.
    return new Paragraph({
        bidirectional: rtl,
        alignment: AlignmentType.START,
        spacing: { after: 120 },
        children,
        ...extra,
    } as ConstructorParameters<typeof Paragraph>[0]);
}

function textRun(text: string, rtl: boolean, style: DocxRunStyle = {}) {
    return new TextRun({
        text,
        rightToLeft: rtl,
        font: 'Calibri',
        ...style,
    } as ConstructorParameters<typeof TextRun>[0]);
}

function styledRunsForSegment(segment: string, rtl: boolean, baseStyle: DocxRunStyle): TextRun[] {
    const trimmed = segment.trim();
    if (!trimmed) return [textRun(segment, rtl, baseStyle)];

    const runs: TextRun[] = [];
    let lastIndex = 0;
    const re = new RegExp(YEAR_RANGE_GLOBAL.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
            runs.push(textRun(trimmed.slice(lastIndex, match.index), rtl, baseStyle));
        }
        runs.push(textRun(match[0], rtl, { ...baseStyle, bold: true }));
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < trimmed.length) {
        runs.push(textRun(trimmed.slice(lastIndex), rtl, baseStyle));
    }
    return runs.length ? runs : [textRun(trimmed, rtl, baseStyle)];
}

function bodyTextRuns(line: string): TextRun[] {
    const trimmed = line.trim();
    if (!trimmed) return [textRun('', false)];

    const baseStyle = { size: 28, color: hexColor(CV_EXPORT_COLORS.body) };
    if (!cvLineUsesRtl(trimmed)) {
        return styledRunsForSegment(trimmed, false, baseStyle);
    }

    const tokens = tokenizeMixedCvLine(trimmed);
    if (tokens.length <= 1) {
        return styledRunsForSegment(trimmed, true, baseStyle);
    }

    return tokens.flatMap((token) =>
        styledRunsForSegment(token.value, token.dir === 'rtl', baseStyle),
    );
}

function paragraphForLine(line: string, style: CvLineStyle): Paragraph {
    const trimmed = line.trim();
    const lineForDir = trimmed || ' ';

    switch (style) {
        case 'spacer':
            return cvParagraph([textRun('', false)], ' ', { spacing: { after: 80 } });
        case 'name':
            return cvParagraph(
                [
                    textRun(trimmed, cvLineUsesRtl(trimmed), {
                        size: 52,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primaryDark),
                    }),
                ],
                lineForDir,
                { spacing: { after: 200 } },
            );
        case 'section':
            return cvParagraph(
                [
                    textRun(trimmed, true, {
                        size: 34,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primary),
                    }),
                ],
                lineForDir,
                {
                    spacing: { before: 320, after: 160 },
                    border: {
                        bottom: {
                            color: hexColor(CV_EXPORT_COLORS.sectionBorder),
                            size: 12,
                            style: BorderStyle.SINGLE,
                        },
                    },
                },
            );
        case 'label':
            return cvParagraph(
                [
                    textRun(trimmed, cvLineUsesRtl(trimmed), {
                        size: 26,
                        bold: true,
                        underline: {},
                        color: hexColor(CV_EXPORT_COLORS.label),
                    }),
                ],
                lineForDir,
                { spacing: { before: 200, after: 80 } },
            );
        case 'date':
            return cvParagraph(
                [
                    textRun(trimmed, cvLineUsesRtl(trimmed), {
                        size: 28,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.body),
                    }),
                ],
                lineForDir,
                { spacing: { before: 240, after: 80 } },
            );
        case 'role':
            return cvParagraph(
                [
                    textRun(trimmed, cvLineUsesRtl(trimmed), {
                        size: 30,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primaryDark),
                    }),
                ],
                lineForDir,
                { spacing: { after: 120 } },
            );
        case 'body':
        default:
            return cvParagraph(bodyTextRuns(line), lineForDir);
    }
}

function buildTitleParagraphs(): Paragraph[] {
    return [
        cvParagraph(
            [
                textRun(PARSED_CV_DOCUMENT_TITLE, true, {
                    size: 64,
                    bold: true,
                    color: hexColor(CV_EXPORT_COLORS.primaryDark),
                }),
            ],
            PARSED_CV_DOCUMENT_TITLE,
            {
                spacing: { after: 280 },
                border: {
                    bottom: {
                        color: hexColor(CV_EXPORT_COLORS.primary),
                        size: 18,
                        style: BorderStyle.SINGLE,
                    },
                },
            },
        ),
    ];
}

async function buildDocxBlob(text: string, options?: ParsedSearchTextExportOptions): Promise<Blob> {
    const lines = String(text || '').split('\n');
    const bodyParagraphs = lines.map((line, i) =>
        paragraphForLine(line, classifyCvLine(line, i, lines)),
    );

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Calibri',
                        language: { value: 'he-IL' },
                    },
                },
            },
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: { top: 720, right: 720, bottom: 720, left: 720 },
                    },
                },
                children: [...buildTitleParagraphs(), ...bodyParagraphs],
            },
        ],
    });

    let bytes = new Uint8Array(await (await Packer.toBlob(doc)).arrayBuffer());
    bytes = await patchDocxBytesForMixedCvExport(bytes);

    if (options?.clientLogo) {
        bytes = await injectLogoIntoDocx(bytes.buffer, options.clientLogo, 'left', {
            applyRtlSectionPatch: false,
        });
        bytes = await patchDocxBytesForMixedCvExport(bytes);
    }

    return new Blob([bytes], { type: DOCX_MIME });
}

function ensureDocxFilename(filename: string): string {
    const trimmed = filename.trim() || 'resume.docx';
    if (/\.docx$/i.test(trimmed)) return trimmed;
    const withoutExt = trimmed.replace(/\.(docx?|DOCX?)$/i, '');
    return `${withoutExt || 'resume'}.docx`;
}

/**
 * Download parsed CV as styled Word (.docx) — same layout as PDF export.
 */
export async function downloadParsedSearchTextAsDocx(
    text: string,
    filename: string,
    options?: ParsedSearchTextExportOptions,
): Promise<void> {
    const trimmed = String(text || '').trim();
    if (!trimmed) throw new Error('empty_text');

    const blob = await buildDocxBlob(trimmed, options);
    await downloadBlobAsFile(blob, ensureDocxFilename(filename), DOCX_MIME);
}

export function parsedSearchTextDocxFilename(baseName: string, versionLabel?: string): string {
    const base = sanitizePdfFilename(baseName || 'resume');
    const suffix = versionLabel ? `_${sanitizePdfFilename(versionLabel)}` : '_parsed';
    return `${base}${suffix}.docx`;
}

export type { ParsedSearchTextExportOptions };
