/** Shared CV line styling for PDF and Word export. */

export type CvLineStyle =
    | 'name'
    | 'section'
    | 'label'
    | 'date'
    | 'role'
    | 'body'
    | 'spacer';

const SECTION_HEADER =
    /^(ניסיון תעסוקתי|השכלה|השכלות|כישורים|מיומנויות|שפות|הסמכות|הכשרות|פרטים אישיים|סיכום מקצועי|פרופיל מקצועי|הישגים|פרויקטים|שירות צבאי|מילות מפתח|experience|education|skills|languages|certifications|summary|profile|projects|military)/i;

const FIELD_LABEL =
    /^(מגורים|טלפון|נייד|פקס|מייל|אימייל|דוא"ל|אי-?מייל|שנת לידה|ת\.ז|תעודת זהות|כתובת|עיר|מיקום|מצב משפחתי|שפות|הסמכות|linkedin|לינקדאין)$/i;

const YEAR_RANGE_PATTERN = /\d{4}\s*[-–—]\s*\d{2,4}|\d{4}\s*[-–—]\s*היום/;
const YEAR_RANGE_GLOBAL = /\d{4}\s*[-–—]\s*\d{2,4}|\d{4}\s*[-–—]\s*היום/g;

const DATE_LINE =
    /^(\d{4}\s*[-–—]\s*\d{2,4}|\d{4}\s*[-–—]\s*היום|\d{1,2}\/\d{2,4}|\d{4}|\d{1,2}\.\d{4})$/;

function isDateLine(text: string): boolean {
    const t = text.trim();
    if (!t) return false;
    if (DATE_LINE.test(t)) return true;
    const withoutRange = t.replace(YEAR_RANGE_PATTERN, '').trim();
    return YEAR_RANGE_PATTERN.test(t) && withoutRange.length <= 2;
}

function escapeHtml(s: string): string {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function classifyCvLine(line: string, index: number, allLines: string[]): CvLineStyle {
    const t = line.trim();
    if (!t) return 'spacer';
    if (SECTION_HEADER.test(t)) return 'section';
    if (FIELD_LABEL.test(t)) return 'label';
    if (isDateLine(t)) return 'date';

    if (index === 0 && t.length <= 48 && !t.includes('@') && !/https?:\/\//i.test(t)) {
        return 'name';
    }

    const prev = index > 0 ? allLines[index - 1]?.trim() : '';
    if (prev && isDateLine(prev) && t.length <= 90 && !FIELD_LABEL.test(t)) {
        return 'role';
    }

    return 'body';
}

export const CV_EXPORT_COLORS = {
    primary: '#1d4ed8',
    primaryDark: '#1e3a8a',
    accent: '#7c3aed',
    label: '#475569',
    body: '#1e293b',
    muted: '#64748b',
    sectionBg: '#eff6ff',
    sectionBorder: '#93c5fd',
};

const HTML_STYLES: Record<CvLineStyle, string> = {
    name: `margin:0 0 14px 0;font-size:26px;font-weight:800;color:${CV_EXPORT_COLORS.primaryDark};letter-spacing:-0.02em;line-height:1.25;`,
    section: `margin:22px 0 10px 0;padding:8px 12px 6px 0;font-size:17px;font-weight:800;color:${CV_EXPORT_COLORS.primary};border-bottom:2px solid ${CV_EXPORT_COLORS.sectionBorder};background:linear-gradient(to left, ${CV_EXPORT_COLORS.sectionBg}, transparent);line-height:1.35;`,
    label: `margin:10px 0 2px 0;font-size:13px;font-weight:700;color:${CV_EXPORT_COLORS.label};text-decoration:underline;text-underline-offset:3px;`,
    date: `margin:14px 0 4px 0;font-size:14px;font-weight:800;color:${CV_EXPORT_COLORS.body};`,
    role: `margin:0 0 6px 0;font-size:15px;font-weight:700;color:${CV_EXPORT_COLORS.primaryDark};`,
    body: `margin:0 0 6px 0;font-size:14px;font-weight:400;color:${CV_EXPORT_COLORS.body};line-height:1.7;`,
    spacer: 'margin:0;height:8px;line-height:8px;',
};

export function emphasizeYearRangesInHtml(text: string): string {
    return escapeHtml(text).replace(
        YEAR_RANGE_GLOBAL,
        (m) => `<strong style="font-weight:800;">${m}</strong>`,
    );
}

function lineHtmlContent(line: string, style: CvLineStyle): string {
    const trimmed = line.trim();
    if (!trimmed) return '&nbsp;';
    if (style === 'date') {
        return `<strong style="font-weight:800;">${escapeHtml(trimmed)}</strong>`;
    }
    if (style === 'body') {
        return emphasizeYearRangesInHtml(trimmed);
    }
    return escapeHtml(trimmed);
}

export function linesToPlainHtml(lines: string[]): string {
    return lines
        .map((line) => {
            const safe = escapeHtml(line.trim());
            return safe
                ? `<p style="margin:0 0 6pt 0;line-height:1.5;">${safe}</p>`
                : '<p style="margin:0 0 6pt 0;">&nbsp;</p>';
        })
        .join('');
}

export function linesToStyledHtml(lines: string[]): string {
    return lines
        .map((line, i) => {
            const style = classifyCvLine(line, i, lines);
            if (style === 'spacer') return '<div style="margin:0;height:8px;"></div>';
            const tag = style === 'section' ? 'h2' : style === 'name' ? 'h1' : 'p';
            return `<${tag} style="${HTML_STYLES[style]}">${lineHtmlContent(line, style)}</${tag}>`;
        })
        .join('');
}
