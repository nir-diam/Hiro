import type { Theme, Mode, FontSize, Density } from '../context/ThemeContext';

export type LayoutMode = 'list' | 'cards' | 'board';

export type ScreenPreferenceKey =
    | 'global_pool'
    | 'referrals_general'
    | 'jobs_list'
    | 'clients_list'
    | 'clients_contacts'
    | 'candidate_submissions'
    | 'candidate_referrals'
    | 'candidate_events'
    | 'admin_global_companies'
    | 'admin_candidates'
    | 'admin_jobs';

export type GlobalUiPreferences = {
    theme: Theme;
    mode: Mode;
    fontSize: FontSize;
    density: Density;
};

export type ScreenUiPreferences = {
    layoutMode?: LayoutMode;
    visibleColumns?: string[];
};

export type UserPreferencesV2 = {
    version: number;
    global: GlobalUiPreferences;
    screens: Partial<Record<ScreenPreferenceKey, ScreenUiPreferences>>;
};

export const DEFAULT_GLOBAL_PREFERENCES: GlobalUiPreferences = {
    theme: 'purple',
    mode: 'light',
    fontSize: 'base',
    density: 'comfortable',
};

export const DEFAULT_USER_PREFERENCES: UserPreferencesV2 = {
    version: 2,
    global: { ...DEFAULT_GLOBAL_PREFERENCES },
    screens: {},
};

export type TableViewMode = 'table' | 'grid' | 'board';

export function layoutModeToViewMode(layout: LayoutMode | undefined): TableViewMode {
    if (layout === 'cards') return 'grid';
    if (layout === 'board') return 'board';
    return 'table';
}

export function viewModeToLayoutMode(view: TableViewMode): LayoutMode {
    if (view === 'grid') return 'cards';
    if (view === 'board') return 'board';
    return 'list';
}

export function normalizeVisibleColumns(
    columns: string[] | undefined,
    defaultColumns: string[],
    allowedIds?: string[],
): string[] {
    const allowed = allowedIds?.length
        ? new Set(allowedIds)
        : null;
    const source = Array.isArray(columns) && columns.length ? columns : defaultColumns;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of source) {
        if (!id || seen.has(id)) continue;
        if (allowed && !allowed.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out.length ? out : [...defaultColumns];
}
