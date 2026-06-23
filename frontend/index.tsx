
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import { SavedSearchesProvider } from './context/SavedSearchesContext';
import { DevModeProvider } from './context/DevModeContext';
import { LanguageProvider } from './context/LanguageContext';
import { AuthProvider } from './context/AuthContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';

// ─── Global 401 interceptor ───────────────────────────────────────────────────
// Patches window.fetch once so every API call in the app auto-redirects on
// 401 Unauthorized — no need to add handling to individual service files.
(function install401Interceptor() {
  const _originalFetch = window.fetch.bind(window);
  let _redirecting = false;

  /** Returns true if the stored JWT is genuinely expired (or absent). */
  function isTokenExpiredOrMissing(): boolean {
    try {
      const token = localStorage.getItem('token');
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
    const response = await _originalFetch(...args);

    if (response.status === 401 && !_redirecting) {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof URL
            ? args[0].href
            : (args[0] as Request).url;

      // Only intercept our own API calls, not CDN / external resources
      if (url.includes('/api/')) {
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

        const isPortal = window.location.hash.startsWith('#/candidate-portal');
        window.location.replace(isPortal ? '/#/candidate-portal/login' : '/#/login');
      }
    }

    return response;
  };
})();
// ─────────────────────────────────────────────────────────────────────────────

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
              <HashRouter>
                <AuthProvider>
                  <UserPreferencesProvider>
                    <App />
                  </UserPreferencesProvider>
                </AuthProvider>
              </HashRouter>
            </SavedSearchesProvider>
          </ErrorBoundary>
        </DevModeProvider>
      </ThemeProvider>
    </LanguageProvider>
  </React.StrictMode>
);
