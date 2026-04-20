/** Display / API full name from separate parts (Hebrew or any locale). */
export function buildCandidateFullName(firstName?: string | null, lastName?: string | null): string {
    return [firstName, lastName]
        .map((s) => (s != null ? String(s).trim() : ''))
        .filter(Boolean)
        .join(' ');
}

/** First token → firstName, remainder → lastName (legacy fullName only). */
export function splitFullNameToParts(fullName?: string | null): { firstName: string; lastName: string } {
    const full = fullName != null ? String(fullName).trim() : '';
    if (!full) return { firstName: '', lastName: '' };
    const idx = full.indexOf(' ');
    if (idx === -1) return { firstName: full, lastName: '' };
    return { firstName: full.slice(0, idx).trim(), lastName: full.slice(idx + 1).trim() };
}

/** Keep firstName, lastName, fullName consistent on candidate-shaped objects. */
export function syncCandidateNameFields<T extends Record<string, unknown>>(copy: T): T {
    const fn = String((copy as Record<string, unknown>).firstName ?? '').trim();
    const ln = String((copy as Record<string, unknown>).lastName ?? '').trim();
    const legacyFull = String((copy as Record<string, unknown>).fullName ?? '').trim();
    if (fn || ln) {
        (copy as Record<string, unknown>).firstName = fn;
        (copy as Record<string, unknown>).lastName = ln;
        (copy as Record<string, unknown>).fullName =
            buildCandidateFullName(fn, ln) || legacyFull;
    } else if (legacyFull) {
        const parts = splitFullNameToParts(legacyFull);
        (copy as Record<string, unknown>).firstName = parts.firstName;
        (copy as Record<string, unknown>).lastName = parts.lastName;
        (copy as Record<string, unknown>).fullName = legacyFull;
    } else {
        (copy as Record<string, unknown>).firstName = '';
        (copy as Record<string, unknown>).lastName = '';
        (copy as Record<string, unknown>).fullName = '';
    }
    return copy;
}
