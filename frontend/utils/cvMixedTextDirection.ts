/** Shared Hebrew / Latin direction helpers for CV export (PDF + Word). */

export const HEBREW_RE = /[\u0590-\u05FF]/;

/** LTR runs in mixed Hebrew CV lines (dates, phones, emails, Latin words). */
export const LTR_RUN_START =
    /^(?:\d{1,2}\/\d{1,2}\/\d{4}(?:\s*[—–-]\s*\d{1,2}\/\d{1,2}\/\d{4})?|\d{2,3}-[\d-]+|[([{]*[A-Za-z][A-Za-z0-9@._+\-#/]*[)\]}.\-—–·]*)/;

export type CvTextToken = { dir: 'ltr' | 'rtl'; value: string };

export function cvLineUsesRtl(text: string): boolean {
    return HEBREW_RE.test(String(text ?? ''));
}

export function tokenizeMixedCvLine(text: string): CvTextToken[] {
    const tokens: CvTextToken[] = [];
    let i = 0;
    while (i < text.length) {
        const rest = text.slice(i);
        const ltrMatch = rest.match(LTR_RUN_START);
        if (ltrMatch) {
            tokens.push({ dir: 'ltr', value: ltrMatch[0] });
            i += ltrMatch[0].length;
            continue;
        }
        let rtl = '';
        while (i < text.length && !LTR_RUN_START.test(text.slice(i))) {
            rtl += text[i];
            i += 1;
        }
        if (rtl) tokens.push({ dir: 'rtl', value: rtl });
    }
    return tokens;
}
