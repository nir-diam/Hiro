import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { permissionForPath } from '../access/pathAccess';

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
                    clearAuthLocalStorage();
                    setUser(null);
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

    /** Client usage `autoDisconnect`: log out and wipe auth from localStorage after 60 minutes idle. */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!user?.autoDisconnect) return;
        if (!localStorage.getItem('token')) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        const redirectAfterLogout = () => {
            const path = window.location.pathname.startsWith('/candidate-portal')
                ? '/candidate-portal/login'
                : '/login';
            window.location.assign(path);
        };

        const clearSession = () => {
            try {
                localStorage.clear();
            } catch {
                clearAuthLocalStorage();
            }
            setUser(null);
            redirectAfterLogout();
        };

        const schedule = () => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(clearSession, AUTO_DISCONNECT_IDLE_MS);
        };

        schedule();

        const onActivity = () => schedule();
        const events: (keyof WindowEventMap)[] = [
            'mousedown',
            'keydown',
            'touchstart',
            'scroll',
            'click',
            'wheel',
        ];
        const opts: AddEventListenerOptions = { capture: true, passive: true };
        events.forEach((ev) => window.addEventListener(ev, onActivity, opts));

        const onVisible = () => {
            if (document.visibilityState === 'visible') schedule();
        };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            window.clearTimeout(timeoutId);
            events.forEach((ev) => window.removeEventListener(ev, onActivity, opts));
            document.removeEventListener('visibilitychange', onVisible);
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
