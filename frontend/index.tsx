
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import { SavedSearchesProvider } from './context/SavedSearchesContext';
import { DevModeProvider } from './context/DevModeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';

// ─── Global fetch patch (staff JWT + 401 handling) ───────────────────────────
// Production API requires Authorization on almost all /api/* routes (see backend SECURITY.md).
// Many legacy fetch() calls omit headers — attach the stored token here once for the whole app.
(function installFetchAuthAnd401Interceptor() {
  const _originalFetch = window.fetch.bind(window);
  let _redirecting = false;
  const apiBaseRaw = String(import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');

  const isLoginRoute = () => {
    const path = window.location.pathname;
    return path === '/login' || path.startsWith('/candidate-portal/login');
  };

  /** Auth endpoints return 401 for expected failures (wrong password, bad OTP) — never hard-redirect. */
  const isAuthFlowRequest = (url: string) =>
    /\/api\/auth\/(login|verify-login-code|resend-login-code|google|register|candidate-signup|candidate-login)(\/|\?|$)/i.test(
      url,
    );

  const resolveRequestUrl = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  };

  /** Hiro staff / portal API (not arbitrary third-party URLs that happen to contain "/api/"). */
  const isHiroApiRequest = (url: string): boolean => {
    if (url.startsWith('/api/')) return true;
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.pathname.startsWith('/api/')) {
        if (!apiBaseRaw) return true;
        const base = new URL(apiBaseRaw);
        return parsed.origin === base.origin;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  const readStoredToken = (): string | null => {
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token');
    } catch {
      return null;
    }
  };

  const headersHaveAuth = (headers: Headers): boolean => {
    const auth = headers.get('Authorization') || headers.get('authorization');
    return Boolean(auth && String(auth).trim());
  };

  const withStaffAuth = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): [RequestInfo | URL, RequestInit | undefined] => {
    const url = resolveRequestUrl(input);
    if (!isHiroApiRequest(url)) return [input, init];

    const token = readStoredToken();
    if (!token) return [input, init];

    if (input instanceof Request) {
      const merged = new Headers(input.headers);
      if (init?.headers) new Headers(init.headers).forEach((v, k) => merged.set(k, v));
      if (headersHaveAuth(merged)) return [input, init];
      merged.set('Authorization', `Bearer ${token}`);
      return [new Request(input, { ...init, headers: merged }), undefined];
    }

    const headers = new Headers(init?.headers ?? undefined);
    if (headersHaveAuth(headers)) return [input, init];
    headers.set('Authorization', `Bearer ${token}`);
    return [input, { ...init, headers }];
  };

  /** Returns true if the stored JWT is genuinely expired (or absent). */
  function isTokenExpiredOrMissing(): boolean {
    try {
      const token = readStoredToken();
      if (!token) return true;
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const [input, init] = withStaffAuth(args[0], args[1]);
    const response = await _originalFetch(input, init);

    if (response.status === 401 && !_redirecting) {
      const url = resolveRequestUrl(input);

      // Only intercept our own API calls, not CDN / external resources
      if (url.includes('/api/')) {
        // Login / OTP / signup — let the page show the error; do not reload.
        if (isAuthFlowRequest(url) || isLoginRoute()) {
          return response;
        }

        // Guard: if the client-side token still looks valid (not expired), this 401 may
        // be transient (server restart, brief outage). Skip the redirect so a background
        // poll or minor hiccup doesn't eject the user from the session.
        if (!isTokenExpiredOrMissing()) {
          return response;
        }

        _redirecting = true;
        // Reset flag after 5 s so a failed redirect doesn't permanently suppress future 401s
        setTimeout(() => { _redirecting = false; }, 5000);
        try {
          localStorage.removeItem('token');
          localStorage.removeItem('herouser');
          localStorage.removeItem('user');
          sessionStorage.clear();
        } catch { /* ignore */ }

        const isPortal = window.location.pathname.startsWith('/candidate-portal');
        window.location.replace(isPortal ? '/candidate-portal/login' : '/login');
      }
    }

    return response;
  };
})();
// ─────────────────────────────────────────────────────────────────────────────

// Legacy HashRouter links → clean paths (e.g. /#/jobs/... → /jobs/...)
(function migrateLegacyHashUrls() {
  const { hash, origin, search } = window.location;
  if (hash.startsWith('#/')) {
    window.location.replace(`${origin}${hash.slice(1)}${search}`);
  }
})();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        <DevModeProvider>
          <ErrorBoundary>
            <SavedSearchesProvider>
              <BrowserRouter future={{ v7_relativeSplatPath: true }}>
                <AuthProvider>
                  <UserPreferencesProvider>
                    <App />
                  </UserPreferencesProvider>
                </AuthProvider>
              </BrowserRouter>
            </SavedSearchesProvider>
          </ErrorBoundary>
        </DevModeProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>
);
