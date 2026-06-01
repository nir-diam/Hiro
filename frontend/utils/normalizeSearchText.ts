/**
 * Collapse excessive blank lines in parsed CV text for display (and legacy rows
 * parsed before backend normalization).
 */

const SECTION_HEADER =
    /^(ניסיון תעסוקתי|השכלה|השכלות|כישורים|מיומנויות|שפות|הסמכות|הכשרות|פרטים אישיים|סיכום מקצועי|פרופיל מקצועי|experience|education|skills|languages|certifications|summary|profile)/i;

export function normalizeSearchTextLineBreaks(raw: string): string {
    if (!raw) return '';
    let text = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    text = text
        .split('\n')
        .map((line) => line.replace(/\u00a0/g, ' ').trimEnd())
        .join('\n');

    text = text
        .split('\n')
        .filter((line) => {
            const t = line.trim();
            if (!t) return true;
            if (/^[.\-–—•·]+$/.test(t)) return false;
            return true;
        })
        .join('\n');

    text = text.replace(/\n{2,}/g, '\n');

    const lines = text.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const trimmed = line.trim();
        if (
            i > 0 &&
            trimmed &&
            SECTION_HEADER.test(trimmed) &&
            out.length > 0 &&
            out[out.length - 1] !== ''
        ) {
            out.push('');
        }
        out.push(line);
    }
    text = out.join('\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}
