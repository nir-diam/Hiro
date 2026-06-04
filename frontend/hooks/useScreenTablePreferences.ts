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

export function useScreenTablePreferences(screenKey: ScreenPreferenceKey, options: Options) {
    const { ready, getScreen, setScreenPrefs, flushScreen } = useUserPreferences();
    const defaultLayout = options.defaultLayoutMode ?? 'list';
    const defaultCols = options.defaultVisibleColumns;

    const saved = getScreen(screenKey);
    const initialView = layoutModeToViewMode(saved?.layoutMode ?? defaultLayout);
    const initialCols = normalizeVisibleColumns(
        saved?.visibleColumns,
        defaultCols,
        options.allColumnIds,
    );

    const [viewMode, setViewModeState] = useState<TableViewMode>(initialView);
    const [visibleColumns, setVisibleColumnsState] = useState<string[]>(initialCols);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        if (!ready || hydrated) return;
        const s = getScreen(screenKey);
        setViewModeState(layoutModeToViewMode(s?.layoutMode ?? defaultLayout));
        setVisibleColumnsState(
            normalizeVisibleColumns(s?.visibleColumns, defaultCols, options.allColumnIds),
        );
        setHydrated(true);
    }, [ready, hydrated, screenKey, getScreen, defaultLayout, defaultCols, options.allColumnIds]);

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
                const next = prev.includes(columnId)
                    ? prev.filter((id) => id !== columnId)
                    : [...prev, columnId];
                const normalized = normalizeVisibleColumns(
                    next,
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
        ready: ready && hydrated,
        viewMode,
        setViewMode,
        visibleColumns,
        setVisibleColumns,
        handleColumnToggle,
        persistColumnsNow,
        supportsBoard,
    };
}
