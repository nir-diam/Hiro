
import React, { useRef, useEffect, useId } from 'react';
import { XMarkIcon, SunIcon, MoonIcon, PaintBrushIcon, ViewColumnsIcon, Bars3BottomLeftIcon } from './Icons';
import { useTheme, Theme } from '../context/ThemeContext';

interface PreferencesModalProps {
  onClose: () => void;
}

const themes: { name: Theme; label: string; colors: { primary: string; secondary: string; accent: string } }[] = [
    { name: 'purple', label: 'Hiro Purple', colors: { primary: '#8B5CF6', secondary: '#3B82F6', accent: '#10B981' } },
    { name: 'blue', label: 'Ocean Blue', colors: { primary: '#3B82F6', secondary: '#14B8A6', accent: '#F59E0B' } },
    { name: 'red', label: 'Crimson Red', colors: { primary: '#EF4444', secondary: '#F97316', accent: '#84CC16' } },
    { name: 'green', label: 'Emerald Green', colors: { primary: '#22C55E', secondary: '#0EA5E9', accent: '#F43F5E' } },
    { name: 'slate', label: 'Modern Slate', colors: { primary: '#64748B', secondary: '#334155', accent: '#0EA5E9' } },
    { name: 'orange', label: 'Sunset Orange', colors: { primary: '#F97316', secondary: '#D946EF', accent: '#06B6D4' } },
    { name: 'teal', label: 'Deep Teal', colors: { primary: '#14B8A6', secondary: '#EC4899', accent: '#F59E0B' } },
    { name: 'rose', label: 'Blushing Rose', colors: { primary: '#F43F5E', secondary: '#6D28D9', accent: '#FACC15' } },
    { name: 'indigo', label: 'Royal Indigo', colors: { primary: '#6366F1', secondary: '#14B8A6', accent: '#EC4899' } },
    { name: 'amber', label: 'Golden Amber', colors: { primary: '#F59E0B', secondary: '#8B5CF6', accent: '#EF4444' } },
];


const PreferencesModal: React.FC<PreferencesModalProps> = ({ onClose }) => {
  const { theme, setTheme, mode, setMode, fontSize, setFontSize, density, setDensity } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    previouslyFocusedElement.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Tab' && modalRef.current) {
            const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey) { // Shift+Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    event.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    event.preventDefault();
                }
            }
        } else if (event.key === 'Escape') {
            onClose();
        }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
        document.removeEventListener('keydown', handleKeyDown);
        previouslyFocusedElement.current?.focus();
    };
  }, [onClose]);


  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden text-text-default max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      >
        <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
          <h2 id={titleId} className="text-xl font-bold">העדפות תצוגה</h2>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="p-2 rounded-full text-text-subtle hover:bg-bg-hover" aria-label="סגור">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="p-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            <div className="space-y-6">
               {/* Display Mode */}
              <div>
                <h3 className="text-base font-semibold mb-3">מצב תצוגה</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setMode('light')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${mode === 'light' ? 'border-primary-500 bg-primary-50' : 'border-border-default bg-bg-subtle hover:border-primary-300'}`}>
                    <SunIcon className={`w-5 h-5 ${mode === 'light' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold text-sm ${mode === 'light' ? 'text-primary-700' : 'text-text-default'}`}>בהיר</span>
                  </button>
                  <button onClick={() => setMode('dark')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${mode === 'dark' ? 'border-primary-500 bg-slate-800' : 'border-border-default bg-slate-800/50 hover:border-primary-300'}`}>
                    <MoonIcon className={`w-5 h-5 ${mode === 'dark' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold text-sm ${mode === 'dark' ? 'text-primary-500' : 'text-white'}`}>כהה (Slate)</span>
                  </button>
                  <button onClick={() => setMode('dark-gray')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${mode === 'dark-gray' ? 'border-primary-500 bg-neutral-800' : 'border-border-default bg-neutral-800/50 hover:border-primary-300'}`}>
                    <MoonIcon className={`w-5 h-5 ${mode === 'dark-gray' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold text-sm ${mode === 'dark-gray' ? 'text-primary-500' : 'text-white'}`}>כהה (Gray)</span>
                  </button>
                  <button onClick={() => setMode('dark-black')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition ${mode === 'dark-black' ? 'border-primary-500 bg-black' : 'border-border-default bg-black/80 hover:border-primary-300'}`}>
                    <MoonIcon className={`w-5 h-5 ${mode === 'dark-black' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold text-sm ${mode === 'dark-black' ? 'text-primary-500' : 'text-white'}`}>כהה (OLED)</span>
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div>
                <h3 className="text-base font-semibold mb-3">גודל גופן</h3>
                <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                    <button onClick={() => setFontSize('sm')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${fontSize === 'sm' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted'}`}>קטן</button>
                    <button onClick={() => setFontSize('base')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${fontSize === 'base' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted'}`}>בינוני</button>
                    <button onClick={() => setFontSize('lg')} className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${fontSize === 'lg' ? 'bg-bg-card shadow-sm text-primary-700' : 'text-text-muted'}`}>גדול</button>
                </div>
              </div>
              
              {/* Density */}
              <div>
                <h3 className="text-base font-semibold mb-3">צפיפות תצוגה</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setDensity('comfortable')} className={`flex items-center justify-center gap-3 p-3 rounded-lg border-2 transition ${density === 'comfortable' ? 'border-primary-500 bg-primary-50' : 'border-border-default bg-bg-subtle hover:border-primary-300'}`}>
                    <Bars3BottomLeftIcon className={`w-6 h-6 ${density === 'comfortable' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold ${density === 'comfortable' ? 'text-primary-700' : 'text-text-default'}`}>מרווח</span>
                  </button>
                  <button onClick={() => setDensity('compact')} className={`flex items-center justify-center gap-3 p-3 rounded-lg border-2 transition ${density === 'compact' ? 'border-primary-500 bg-primary-50' : 'border-border-default bg-bg-subtle hover:border-primary-300'}`}>
                    <ViewColumnsIcon className={`w-6 h-6 ${density === 'compact' ? 'text-primary-600' : 'text-text-muted'}`} />
                    <span className={`font-semibold ${density === 'compact' ? 'text-primary-700' : 'text-text-default'}`}>דחוס</span>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Color Theme */}
            <div>
              <h3 className="text-base font-semibold mb-3">פלטת צבעים</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {themes.map(t => (
                  <button key={t.name} onClick={() => setTheme(t.name)} className={`p-3 rounded-lg border-2 transition ${theme === t.name ? 'border-primary-500 bg-primary-50' : 'border-border-default bg-bg-subtle hover:border-primary-300'}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{t.label}</span>
                      <div className="flex -space-x-2">
                          <div className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-800" style={{ backgroundColor: t.colors.primary }}></div>
                          <div className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-800" style={{ backgroundColor: t.colors.secondary }}></div>
                          <div className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-800" style={{ backgroundColor: t.colors.accent }}></div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
          <button type="button" onClick={onClose} className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition">סגור</button>
        </footer>
      </div>
       <style>{`
            @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        `}</style>
    </div>
  );
};

export default PreferencesModal;
