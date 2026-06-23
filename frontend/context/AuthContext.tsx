import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { permissionForPath } from '../access/pathAccess';

/** Parse the `exp` claim from a JWT without a library. Returns ms timestamp or null. */
function getTokenExpiryMs(token: string): number | null {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function redirectToLogin() {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('herouser');
        localStorage.removeItem('user');
        sessionStorage.clear();
    } catch { /* ignore */ }
    const isPortal = window.location.hash.startsWith('#/candidate-portal');
    window.location.replace(isPortal ? '/#/candidate-portal/login' : '/#/login');
}

export type AuthUser = {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
    phone?: string;
    clientId?: string | null;
    /** From client usage settings: idle auto-logout after 60 minutes when true */
    autoDisconnect?: boolean;
    dataScope?: unknown;
    permissions?: Record<string, boolean>;
    effectivePermissions?: Record<string, boolean>;
    /** Per-tenant module toggles from `clients.modules` (admin). */
    tenantModules?: Record<string, boolean>;
    uiPreferences?: Record<string, unknown>;
};

type AuthContextValue = {
    user: AuthUser | null;
    ready: boolean;
    refreshUser: () => Promise<void>;
    canPage: (key: string) => boolean;
    canAccessPath: (pathname: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTO_DISCONNECT_IDLE_MS = 60 * 60 * 1000;

export function clearAuthLocalStorage(): void {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('herouser');
        localStorage.removeItem('user');
    } catch {
        /* ignore */
    }
}

const readStoredUser = (): AuthUser | null => {
    const raw = localStorage.getItem('herouser') || localStorage.getItem('user');
    if (!raw) return null;
    try {
        return JSON.parse(raw) as AuthUser;
    } catch {
        return null;
    }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
    const [ready, setReady] = useState(false);

    const refreshUser = useCallback(async () => {
        const token = localStorage.getItem('token');
        const apiBase = import.meta.env.VITE_API_BASE || '';
        if (!token) {
            setUser(null);
            setReady(true);
            return;
        }
        try {
            const meUrl = apiBase ? `${apiBase}/api/auth/me` : '/api/auth/me';
            const res = await fetch(meUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                if (res.status === 401) {
                    redirectToLogin();
                    return;
                }
                setReady(true);
                return;
            }
            const me = (await res.json()) as AuthUser;
            setUser(me);
            try {
                localStorage.setItem('herouser', JSON.stringify(me));
                localStorage.setItem('user', JSON.stringify(me));
            } catch {
                /* ignore */
            }
        } catch {
            setUser(readStoredUser());
        } finally {
            setReady(true);
        }
    }, []);

    useEffect(() => {
        void refreshUser();
    }, [refreshUser]);

    // Keep a stable ref so effects can call refreshUser without adding it as a dependency.
    const refreshUserRef = useRef(refreshUser);
    useEffect(() => { refreshUserRef.current = refreshUser; }, [refreshUser]);

    /**
     * Re-validate the session whenever the tab becomes visible after being hidden
     * for more than 2 minutes. This catches the case where the token expired while
     * the user was away, without forcing a redirect prematurely.
     */
    useEffect(() => {
        let hiddenAt: number | null = null;
        const AWAY_THRESHOLD_MS = 2 * 60 * 1000;

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
            } else if (document.visibilityState === 'visible' && hiddenAt !== null) {
                const awayMs = Date.now() - hiddenAt;
                hiddenAt = null;
                if (awayMs >= AWAY_THRESHOLD_MS) {
                    void refreshUserRef.current();
                }
            }
        };

        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    /** Schedule a redirect when the JWT itself expires (regardless of idle). */
    const tokenExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current);

        const token = localStorage.getItem('token');
        if (!token || !user) return;

        const expiryMs = getTokenExpiryMs(token);
        if (!expiryMs) return;

        const msUntilExpiry = expiryMs - Date.now();
        if (msUntilExpiry <= 0) {
            // Let the server confirm before redirecting (guards against clock skew).
            void refreshUserRef.current();
            return;
        }

        // When the timer fires, verify with the server before redirecting.
        tokenExpiryTimerRef.current = setTimeout(() => void refreshUserRef.current(), msUntilExpiry);

        // Also re-validate when the tab becomes visible after an apparent expiry.
        const onVisible = () => {
            if (document.visibilityState === 'visible' && Date.now() >= expiryMs) {
                void refreshUserRef.current();
            }
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            if (tokenExpiryTimerRef.current) clearTimeout(tokenExpiryTimerRef.current);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [user?.id]);

    /** Client usage `autoDisconnect`: log out after 60 minutes of idle. */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user?.autoDisconnect) return;
        if (!localStorage.getItem('token')) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        const schedule = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => redirectToLogin(), AUTO_DISCONNECT_IDLE_MS);
        };

        schedule();

        const onActivity = () => schedule();
        const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
        const opts: AddEventListenerOptions = { capture: true, passive: true };
        events.forEach((ev) => window.addEventListener(ev, onActivity, opts));

        return () => {
            window.clearTimeout(timeoutId);
            events.forEach((ev) => window.removeEventListener(ev, onActivity, opts));
        };
    }, [user?.autoDisconnect, user?.id]);

    const canPage = useCallback((key: string) => {
        if (!user) return false;
        const eff = user.effectivePermissions;
        if (!eff || typeof eff !== 'object') {
            return key === 'page:dashboard';
        }
        return !!eff[key];
    }, [user]);

    const canAccessPath = useCallback(
        (pathname: string) => canPage(permissionForPath(pathname)),
        [canPage],
    );

    const value = useMemo(
        () => ({
            user,
            ready,
            refreshUser,
            canPage,
            canAccessPath,
        }),
        [user, ready, refreshUser, canPage, canAccessPath],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return ctx;
};
