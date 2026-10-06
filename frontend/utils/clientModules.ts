/** Module keys stored on `clients.modules` (admin → מודולים ורישוי). */
export const CLIENT_MODULE_DIGITAL_SCREENING = 'digital_screening';

export function isClientModuleEnabled(
    modules: Record<string, unknown> | null | undefined,
    key: string,
): boolean {
    if (!modules || typeof modules !== 'object') return false;
    const v = modules[key];
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1';
    }
    return false;
}
