/** Session key used by CandidatesListView to restore list state when returning from a profile. */
export const CANDIDATES_LIST_VIEW_STATE_KEY = 'hiro.candidates.listViewState';

export const CANDIDATES_HAS_DEGREE_LIST_PATH = '/candidates?hasDegree=1';

const ACADEMIC_DEGREE_LABELS = new Set(['תואר אקדמי', 'academic degree']);

const ACADEMIC_DEGREE_TAG_KEYS = new Set(['profile.degree', 'degree.academic', 'academic_degree']);

export function isAcademicDegreeCatalogTag(label: string, tagKey?: string): boolean {
    const normalizedLabel = String(label || '').trim().replace(/\s+/g, ' ');
    if (normalizedLabel && ACADEMIC_DEGREE_LABELS.has(normalizedLabel)) return true;
    if (normalizedLabel && ACADEMIC_DEGREE_LABELS.has(normalizedLabel.toLowerCase())) return true;

    const key = String(tagKey || '').trim().toLowerCase();
    if (!key) return false;
    if (ACADEMIC_DEGREE_TAG_KEYS.has(key)) return true;
    if (key.endsWith('::תואר אקדמי')) return true;
    return false;
}

export function clearCandidatesListViewSessionState(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.removeItem(CANDIDATES_LIST_VIEW_STATE_KEY);
    } catch {
        /* ignore quota / privacy mode */
    }
}
