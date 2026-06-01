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

const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const YEAR_RANGE_GLOBAL = /\d{4}\s*[-–—]\s*\d{2,4}|\d{4}\s*[-–—]\s*היום/g;

function hexColor(hex: string): string {
    return hex.replace('#', '');
}

function rtlParagraph(
    children: TextRun[],
    extra: Partial<ConstructorParameters<typeof Paragraph>[0]> = {},
) {
    return new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        spacing: { after: 120 },
        children,
        ...extra,
    });
}

function textRun(text: string, style: Partial<ConstructorParameters<typeof TextRun>[0]> = {}) {
    return new TextRun({
        text,
        rightToLeft: true,
        font: 'Calibri',
        ...style,
    });
}

function bodyTextRuns(line: string): TextRun[] {
    const trimmed = line.trim();
    if (!trimmed) return [textRun('')];

    const runs: TextRun[] = [];
    let lastIndex = 0;
    const re = new RegExp(YEAR_RANGE_GLOBAL.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
            runs.push(
                textRun(trimmed.slice(lastIndex, match.index), {
                    size: 28,
                    color: hexColor(CV_EXPORT_COLORS.body),
                }),
            );
        }
        runs.push(
            textRun(match[0], {
                size: 28,
                bold: true,
                color: hexColor(CV_EXPORT_COLORS.body),
            }),
        );
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < trimmed.length) {
        runs.push(
            textRun(trimmed.slice(lastIndex), {
                size: 28,
                color: hexColor(CV_EXPORT_COLORS.body),
            }),
        );
    }
    return runs.length ? runs : [textRun(trimmed, { size: 28, color: hexColor(CV_EXPORT_COLORS.body) })];
}

function paragraphForLine(line: string, style: CvLineStyle): Paragraph {
    const trimmed = line.trim();

    switch (style) {
        case 'spacer':
            return rtlParagraph([textRun('')], { spacing: { after: 80 } });
        case 'name':
            return rtlParagraph(
                [
                    textRun(trimmed, {
                        size: 52,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primaryDark),
                    }),
                ],
                { spacing: { after: 200 } },
            );
        case 'section':
            return rtlParagraph(
                [
                    textRun(trimmed, {
                        size: 34,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primary),
                    }),
                ],
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
            return rtlParagraph(
                [
                    textRun(trimmed, {
                        size: 26,
                        bold: true,
                        underline: {},
                        color: hexColor(CV_EXPORT_COLORS.label),
                    }),
                ],
                { spacing: { before: 200, after: 80 } },
            );
        case 'date':
            return rtlParagraph(
                [
                    textRun(trimmed, {
                        size: 28,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.body),
                    }),
                ],
                { spacing: { before: 240, after: 80 } },
            );
        case 'role':
            return rtlParagraph(
                [
                    textRun(trimmed, {
                        size: 30,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.primaryDark),
                    }),
                ],
                { spacing: { after: 120 } },
            );
        case 'body':
        default:
            return rtlParagraph(bodyTextRuns(line));
    }
}

function buildTitleParagraphs(candidateName?: string): Paragraph[] {
    const name = String(candidateName ?? '').trim();
    const blocks: Paragraph[] = [
        rtlParagraph(
            [
                textRun('מסמך קורות חיים', {
                    size: 24,
                    bold: true,
                    color: hexColor(CV_EXPORT_COLORS.primary),
                }),
            ],
            { spacing: { after: 80 } },
        ),
        rtlParagraph(
            [
                textRun(PARSED_CV_DOCUMENT_TITLE, {
                    size: 64,
                    bold: true,
                    color: hexColor(CV_EXPORT_COLORS.primaryDark),
                }),
            ],
            {
                spacing: { after: name ? 120 : 280 },
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
    if (name) {
        blocks.push(
            rtlParagraph(
                [
                    textRun(name, {
                        size: 30,
                        bold: true,
                        color: hexColor(CV_EXPORT_COLORS.label),
                    }),
                ],
                { spacing: { after: 280 } },
            ),
        );
    }
    return blocks;
}

async function buildDocxBlob(text: string, options?: ParsedSearchTextExportOptions): Promise<Blob> {
    const lines = String(text || '').split('\n');
    const bodyParagraphs = lines.map((line, i) =>
        paragraphForLine(line, classifyCvLine(line, i, lines)),
    );

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: { top: 720, right: 720, bottom: 720, left: 720 },
                    },
                },
                children: [...buildTitleParagraphs(options?.candidateName), ...bodyParagraphs],
            },
        ],
    });

    return Packer.toBlob(doc);
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
