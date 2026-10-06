import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserPreferences } from '../context/UserPreferencesContext';
import {
    layoutModeToViewMode,
    normalizeVisibleColumns,
    viewModeToLayoutMode,
    type LayoutMode,
    type ScreenPreferenceKey,
    type TableViewMode,
} from '../utils/userPreferences';

type Options = {
    defaultLayoutMode?: LayoutMode;
    defaultVisibleColumns: string[];
    allColumnIds?: string[];
};

function columnsEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function useScreenTablePreferences(screenKey: ScreenPreferenceKey, options: Options) {
    const { ready, preferences, getScreen, setScreenPrefs, flushScreen } = useUserPreferences();
    const defaultLayout = options.defaultLayoutMode ?? 'list';
    const defaultCols = options.defaultVisibleColumns;
    const screenPrefs = preferences.screens[screenKey];

    const saved = getScreen(screenKey);
    const initialView = layoutModeToViewMode(saved?.layoutMode ?? defaultLayout);
    const initialCols = normalizeVisibleColumns(
        saved?.visibleColumns,
        defaultCols,
        options.allColumnIds,
    );

    const [viewMode, setViewModeState] = useState<TableViewMode>(initialView);
    const [visibleColumns, setVisibleColumnsState] = useState<string[]>(initialCols);

    useEffect(() => {
        if (!ready) return;
        const nextView = layoutModeToViewMode(screenPrefs?.layoutMode ?? defaultLayout);
        setViewModeState((prev) => (prev === nextView ? prev : nextView));
        const nextCols = normalizeVisibleColumns(
            screenPrefs?.visibleColumns,
            defaultCols,
            options.allColumnIds,
        );
        setVisibleColumnsState((prev) => (columnsEqual(prev, nextCols) ? prev : nextCols));
    }, [ready, screenKey, screenPrefs, defaultLayout, defaultCols, options.allColumnIds]);

    const setViewMode = useCallback(
        (mode: TableViewMode) => {
            setViewModeState(mode);
            setScreenPrefs(screenKey, { layoutMode: viewModeToLayoutMode(mode) });
        },
        [screenKey, setScreenPrefs],
    );

    const setVisibleColumns = useCallback(
        (cols: string[]) => {
            const normalized = normalizeVisibleColumns(cols, defaultCols, options.allColumnIds);
            setVisibleColumnsState(normalized);
            setScreenPrefs(screenKey, { visibleColumns: normalized });
        },
        [screenKey, setScreenPrefs, defaultCols, options.allColumnIds],
    );

    const handleColumnToggle = useCallback(
        (columnId: string) => {
            setVisibleColumnsState((prev) => {
                const nextRaw = prev.includes(columnId)
                    ? prev.filter((id) => id !== columnId)
                    : [...prev, columnId];
                const normalized = normalizeVisibleColumns(
                    nextRaw,
                    defaultCols,
                    options.allColumnIds,
                );
                setScreenPrefs(screenKey, { visibleColumns: normalized });
                return normalized;
            });
        },
        [screenKey, setScreenPrefs, defaultCols, options.allColumnIds],
    );

    const persistColumnsNow = useCallback(() => {
        void flushScreen(screenKey);
    }, [flushScreen, screenKey]);

    const supportsBoard = useMemo(
        () => defaultLayout === 'board' || saved?.layoutMode === 'board',
        [defaultLayout, saved?.layoutMode],
    );

    return {
        ready,
        viewMode,
        setViewMode,
        visibleColumns,
        setVisibleColumns,
        handleColumnToggle,
        persistColumnsNow,
        supportsBoard,
    };
}
