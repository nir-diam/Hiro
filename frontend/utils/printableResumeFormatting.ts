/** Shared helpers for PrintableResume & ResumeViewer payload shaping */

export function stripResumeHtml(input: string = '') {
    return input.replace(/<\/?[^>]+(>|$)/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Insert separators when years/ranges are glued to Hebrew/Latin text (e.g. "...עסקים2012 - 2015"). */
export function beautifyEducationDisplayLine(raw: string): string {
    let s = stripResumeHtml(raw);
    if (!s) return '';

    // "...text2020" or "...text)2020" -> add separator before 4-digit year
    s = s.replace(/([\p{L}\)\u0590-\u05FF"])(\d{4})(?=\s*[-–—])/gu, '$1 · $2');

    // "...text2020 - 2024" when no dash-boundary matched above (year-year glued to text)
    s = s.replace(/([\p{L}\)\u0590-\u05FF"])(\d{4}\s*[-–—]\s*\d{4})/gu, '$1 · $2');

    return s.replace(/\s+/g, ' ').trim();
}

export function educationEntryToDisplayLine(edu: unknown): string {
    if (edu == null) return '';
    if (typeof edu === 'string') return beautifyEducationDisplayLine(edu);

    const e = edu as Record<string, unknown>;
    const direct = e.value != null ? String(e.value).trim() : '';
    if (direct) return beautifyEducationDisplayLine(direct);

    const degree = String(e.degree || e.title || e.fieldOfStudy || '').trim();
    const inst = String(e.institution || e.school || e.university || '').trim();

    let years = String(e.years || e.period || '').trim();
    if (!years && (e.startYear || e.endYear)) {
        const a = e.startYear != null ? String(e.startYear).trim() : '';
        const b = e.endYear != null ? String(e.endYear).trim() : '';
        if (a && b) years = `${a} - ${b}`;
        else years = a || b;
    }

    const head = [years, inst].filter(Boolean).join(' – ');
    const parts = [head, degree].filter(Boolean);
    const composed = parts.join(parts.length > 1 ? ', ' : '');
    return beautifyEducationDisplayLine(composed);
}

export type PrintLanguageRow = { name: string; levelText: string };

export function languageEntryToPrintRow(lang: unknown): PrintLanguageRow | null {
    if (typeof lang === 'string') {
        const name = stripResumeHtml(lang);
        return name ? { name, levelText: '' } : null;
    }
    if (!lang || typeof lang !== 'object') return null;

    const l = lang as Record<string, unknown>;
    const nameRaw =
        l.name ||
        l.value ||
        l.language ||
        l.lang ||
        l.label ||
        '';
    const name = stripResumeHtml(String(nameRaw || ''));
    if (!name) return null;

    let levelText = '';
    if (typeof l.level === 'string') levelText = l.level;
    else if (l.levelText != null) levelText = String(l.levelText);
    else if (l.proficiency != null) levelText = String(l.proficiency);

    return { name, levelText: levelText.trim() };
}

export function normalizeLanguagesForPrintRows(raw: unknown): PrintLanguageRow[] {
    if (!Array.isArray(raw)) return [];
    const rows: PrintLanguageRow[] = [];
    for (const item of raw) {
        const row = languageEntryToPrintRow(item);
        if (row) rows.push(row);
    }
    return rows;
}
