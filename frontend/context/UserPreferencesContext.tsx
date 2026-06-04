import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAuth } from './AuthContext';
import { useTheme, type Theme, type Mode, type FontSize, type Density } from './ThemeContext';
import { patchUserPreferences } from '../services/userPreferencesApi';
import {
    DEFAULT_GLOBAL_PREFERENCES,
    DEFAULT_USER_PREFERENCES,
    type GlobalUiPreferences,
    type ScreenPreferenceKey,
    type ScreenUiPreferences,
    type UserPreferencesV2,
} from '../utils/userPreferences';

type UserPreferencesContextValue = {
    ready: boolean;
    preferences: UserPreferencesV2;
    getScreen: (key: ScreenPreferenceKey) => ScreenUiPreferences | undefined;
    setScreenPrefs: (key: ScreenPreferenceKey, patch: ScreenUiPreferences) => void;
    updateGlobal: (patch: Partial<GlobalUiPreferences>) => void;
    flushGlobal: () => Promise<void>;
    flushScreen: (key: ScreenPreferenceKey) => Promise<void>;
};

const UserPreferencesContext = createContext<UserPreferencesContextValue | undefined>(
    undefined,
);

const GLOBAL_DEBOUNCE_MS = 600;

function mergePrefsFromUser(raw: unknown): UserPreferencesV2 {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_USER_PREFERENCES, screens: {} };
    const r = raw as UserPreferencesV2;
    return {
        version: 2,
        global: {
            ...DEFAULT_GLOBAL_PREFERENCES,
            ...(r.global && typeof r.global === 'object' ? r.global : {}),
        },
        screens: r.screens && typeof r.screens === 'object' ? { ...r.screens } : {},
    };
}

function applyGlobalToDom(global: GlobalUiPreferences) {
    const root = document.documentElement;
    root.setAttribute('data-theme', global.theme);
    root.setAttribute('data-mode', global.mode);
    root.setAttribute('data-font-size', global.fontSize);
    root.setAttribute('data-density', global.density);
    try {
        localStorage.setItem('theme', global.theme);
        localStorage.setItem('mode', global.mode);
        localStorage.setItem('fontSize', global.fontSize);
        localStorage.setItem('density', global.density);
    } catch {
        /* ignore */
    }
}

export const UserPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const { user, ready: authReady } = useAuth();
    const { setTheme, setMode, setFontSize, setDensity } = useTheme();
    const [preferences, setPreferences] = useState<UserPreferencesV2>(DEFAULT_USER_PREFERENCES);
    const [ready, setReady] = useState(false);
    const preferencesRef = useRef(preferences);
    const globalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const screenTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const hydratedUserIdRef = useRef<string | null>(null);

    preferencesRef.current = preferences;

    const persistPatch = useCallback(async (patch: Partial<UserPreferencesV2>) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const saved = await patchUserPreferences(patch);
        if (saved) {
            setPreferences(saved);
            preferencesRef.current = saved;
        }
    }, []);

    const scheduleGlobalSave = useCallback(() => {
        if (globalTimerRef.current) clearTimeout(globalTimerRef.current);
        globalTimerRef.current = setTimeout(() => {
            void persistPatch({ global: preferencesRef.current.global });
        }, GLOBAL_DEBOUNCE_MS);
    }, [persistPatch]);

    const scheduleScreenSave = useCallback(
        (key: ScreenPreferenceKey) => {
            const prev = screenTimersRef.current.get(key);
            if (prev) clearTimeout(prev);
            screenTimersRef.current.set(
                key,
                setTimeout(() => {
                    const screen = preferencesRef.current.screens[key];
                    if (screen) {
                        void persistPatch({ screens: { [key]: screen } });
                    }
                }, GLOBAL_DEBOUNCE_MS),
            );
        },
        [persistPatch],
    );

    useEffect(() => {
        if (!authReady) return;
        if (!user?.id) {
            hydratedUserIdRef.current = null;
            setReady(true);
            return;
        }
        if (hydratedUserIdRef.current === user.id) {
            setReady(true);
            return;
        }
        hydratedUserIdRef.current = user.id;
        const merged = mergePrefsFromUser(
            (user as { uiPreferences?: UserPreferencesV2 }).uiPreferences,
        );
        setPreferences(merged);
        preferencesRef.current = merged;
        applyGlobalToDom(merged.global);
        setTheme(merged.global.theme as Theme);
        setMode(merged.global.mode as Mode);
        setFontSize(merged.global.fontSize as FontSize);
        setDensity(merged.global.density as Density);
        setReady(true);
    }, [authReady, user, setTheme, setMode, setFontSize, setDensity]);

    const getScreen = useCallback(
        (key: ScreenPreferenceKey) => preferences.screens[key],
        [preferences.screens],
    );

    const setScreenPrefs = useCallback(
        (key: ScreenPreferenceKey, patch: ScreenUiPreferences) => {
            setPreferences((prev) => {
                const nextScreen = { ...prev.screens[key], ...patch };
                const next = {
                    ...prev,
                    screens: { ...prev.screens, [key]: nextScreen },
                };
                preferencesRef.current = next;
                return next;
            });
            scheduleScreenSave(key);
        },
        [scheduleScreenSave],
    );

    const updateGlobal = useCallback(
        (patch: Partial<GlobalUiPreferences>) => {
            setPreferences((prev) => {
                const nextGlobal = { ...prev.global, ...patch };
                const next = { ...prev, global: nextGlobal };
                preferencesRef.current = next;
                applyGlobalToDom(nextGlobal);
                if (patch.theme) setTheme(patch.theme);
                if (patch.mode) setMode(patch.mode);
                if (patch.fontSize) setFontSize(patch.fontSize);
                if (patch.density) setDensity(patch.density);
                return next;
            });
            scheduleGlobalSave();
        },
        [scheduleGlobalSave, setTheme, setMode, setFontSize, setDensity],
    );

    const flushGlobal = useCallback(async () => {
        if (globalTimerRef.current) {
            clearTimeout(globalTimerRef.current);
            globalTimerRef.current = null;
        }
        await persistPatch({ global: preferencesRef.current.global });
    }, [persistPatch]);

    const flushScreen = useCallback(
        async (key: ScreenPreferenceKey) => {
            const t = screenTimersRef.current.get(key);
            if (t) {
                clearTimeout(t);
                screenTimersRef.current.delete(key);
            }
            const screen = preferencesRef.current.screens[key];
            if (screen) {
                await persistPatch({ screens: { [key]: screen } });
            }
        },
        [persistPatch],
    );

    const value = useMemo(
        () => ({
            ready,
            preferences,
            getScreen,
            setScreenPrefs,
            updateGlobal,
            flushGlobal,
            flushScreen,
        }),
        [ready, preferences, getScreen, setScreenPrefs, updateGlobal, flushGlobal, flushScreen],
    );

    return (
        <UserPreferencesContext.Provider value={value}>
            {children}
        </UserPreferencesContext.Provider>
    );
};

export const useUserPreferences = (): UserPreferencesContextValue => {
    const ctx = useContext(UserPreferencesContext);
    if (!ctx) {
        throw new Error('useUserPreferences must be used within UserPreferencesProvider');
    }
    return ctx;
};
