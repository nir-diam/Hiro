
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
