
import React, { useRef, useEffect, useId } from 'react';
import { XMarkIcon, SunIcon, MoonIcon, PaintBrushIcon, ViewColumnsIcon, Bars3BottomLeftIcon, GlobeAmericasIcon, ArrowUturnLeftIcon } from './Icons';
import { useTheme, Theme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface PreferencesModalProps {
  onClose: () => void;
}

const themes: { name: Theme; label: string; color: string }[] = [
    { name: 'purple', label: 'Hiro', color: '#8B5CF6' },
    { name: 'blue', label: 'Ocean', color: '#3B82F6' },
    { name: 'teal', label: 'Teal', color: '#14B8A6' },
    { name: 'green', label: 'Forest', color: '#22C55E' },
    { name: 'red', label: 'Crimson', color: '#EF4444' },
    { name: 'orange', label: 'Sunset', color: '#F97316' },
    { name: 'amber', label: 'Gold', color: '#F59E0B' },
    { name: 'rose', label: 'Rose', color: '#F43F5E' },
    { name: 'indigo', label: 'Royal', color: '#6366F1' },
    { name: 'slate', label: 'Slate', color: '#64748B' },
];

const PreferencesModal: React.FC<PreferencesModalProps> = ({ onClose }) => {
  const { theme, setTheme, mode, setMode, fontSize, setFontSize, density, setDensity } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            onClose();
        }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleReset = () => {
      setTheme('purple');
      setMode('light');
      setFontSize('base');
      setDensity('comfortable');
      setLanguage('he');
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* Backdrop - Transparent enough to see changes */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Side Panel (Drawer) - Opening from LEFT in RTL context (Right side visually if dir=rtl is set on body, but we want it opposite to nav usually. Let's stick to 'left-0' for this design to not cover the nav if nav is right) */}
      <div 
        ref={panelRef}
        className="relative w-full max-w-sm h-full bg-bg-card shadow-2xl border-r border-border-default flex flex-col transform transition-transform duration-300 ease-out animate-slide-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between p-5 border-b border-border-default bg-bg-card/95 backdrop-blur-md z-10">
          <div>
              <h2 id={titleId} className="text-xl font-black text-text-default flex items-center gap-2">
                  <PaintBrushIcon className="w-5 h-5 text-primary-500" />
                  עיצוב ותצוגה
              </h2>
              <p className="text-xs text-text-muted mt-1">התאם את המערכת להעדפותיך</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full text-text-subtle hover:bg-bg-hover hover:text-text-default transition-colors" aria-label="סגור">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            
            {/* 1. Theme Color */}
            <section>
                <h3 className="text-sm font-bold text-text-default mb-3">צבע ראשי (Theme)</h3>
                <div className="grid grid-cols-5 gap-3">
                    {themes.map((t) => (
                        <button
                            key={t.name}
                            onClick={() => setTheme(t.name)}
                            className={`group relative flex flex-col items-center gap-1 p-1 rounded-xl transition-all duration-200 ${theme === t.name ? 'bg-bg-subtle ring-2 ring-primary-500 ring-offset-2 ring-offset-bg-card' : 'hover:bg-bg-hover'}`}
                            title={t.label}
                        >
                            <div 
                                className="w-8 h-8 rounded-full shadow-sm border border-black/5" 
                                style={{ backgroundColor: t.color }}
                            >
                                {theme === t.name && (
                                    <div className="w-full h-full flex items-center justify-center text-white animate-fade-in">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <hr className="border-border-subtle" />

            {/* 2. Appearance Mode */}
            <section>
                <h3 className="text-sm font-bold text-text-default mb-3">מצב תצוגה</h3>
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { id: 'light', label: 'בהיר', icon: SunIcon, bg: 'bg-white', border: 'border-gray-200' },
                        { id: 'dark', label: 'כהה', icon: MoonIcon, bg: 'bg-slate-900', border: 'border-slate-700' },
                        { id: 'dark-gray', label: 'אפור', icon: MoonIcon, bg: 'bg-neutral-800', border: 'border-neutral-700' },
                        { id: 'dark-black', label: 'OLED', icon: MoonIcon, bg: 'bg-black', border: 'border-gray-800' },
                    ].map((opt) => (
                        <button
                            key={opt.id}
                            onClick={() => setMode(opt.id as any)}
                            className={`relative flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                                mode === opt.id 
                                ? 'border-primary-500 ring-1 ring-primary-500/20' 
                                : 'border-transparent hover:border-border-default bg-bg-subtle'
                            }`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${opt.bg} ${opt.border} border`}>
                                <opt.icon className={`w-4 h-4 ${opt.id === 'light' ? 'text-orange-500' : 'text-white'}`} />
                            </div>
                            <span className="text-sm font-semibold">{opt.label}</span>
                        </button>
                    ))}
                </div>
            </section>
            
            <hr className="border-border-subtle" />

            {/* 3. Interface Settings */}
            <section className="space-y-5">
                <div>
                    <div className="flex justify-between mb-2">
                        <h3 className="text-sm font-bold text-text-default">גודל טקסט</h3>
                        <span className="text-xs text-text-muted">{fontSize === 'sm' ? 'קטן' : fontSize === 'base' ? 'רגיל' : 'גדול'}</span>
                    </div>
                    <div className="bg-bg-subtle p-1 rounded-lg flex relative">
                        <div 
                            className="absolute top-1 bottom-1 bg-white rounded-md shadow-sm transition-all duration-300 ease-out"
                            style={{ 
                                left: fontSize === 'lg' ? '4px' : fontSize === 'base' ? '33.33%' : '66.66%',
                                right: fontSize === 'sm' ? '4px' : fontSize === 'base' ? '33.33%' : '66.66%'
                            }}
                        ></div>
                        <button onClick={() => setFontSize('sm')} className="flex-1 py-1.5 text-xs font-bold z-10 relative transition-colors">A</button>
                        <button onClick={() => setFontSize('base')} className="flex-1 py-1.5 text-sm font-bold z-10 relative transition-colors">A</button>
                        <button onClick={() => setFontSize('lg')} className="flex-1 py-1.5 text-lg font-bold z-10 relative transition-colors">A</button>
                    </div>
                </div>

                <div>
                     <div className="flex justify-between mb-2">
                        <h3 className="text-sm font-bold text-text-default">צפיפות</h3>
                        <span className="text-xs text-text-muted">{density === 'compact' ? 'דחוס' : 'מרווח'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={() => setDensity('comfortable')}
                            className={`flex flex-col items-center gap-2 p-2 rounded-lg border-2 transition-all ${density === 'comfortable' ? 'border-primary-500 bg-primary-50/50 text-primary-700' : 'border-transparent bg-bg-subtle text-text-muted hover:bg-bg-hover'}`}
                        >
                            <Bars3BottomLeftIcon className="w-5 h-5" />
                            <span className="text-xs font-bold">מרווח</span>
                        </button>
                        <button 
                            onClick={() => setDensity('compact')}
                            className={`flex flex-col items-center gap-2 p-2 rounded-lg border-2 transition-all ${density === 'compact' ? 'border-primary-500 bg-primary-50/50 text-primary-700' : 'border-transparent bg-bg-subtle text-text-muted hover:bg-bg-hover'}`}
                        >
                            <ViewColumnsIcon className="w-5 h-5" />
                            <span className="text-xs font-bold">דחוס</span>
                        </button>
                    </div>
                </div>
            </section>
            
             <hr className="border-border-subtle" />

             {/* 4. Language */}
             <section>
                <h3 className="text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                    <GlobeAmericasIcon className="w-4 h-4 text-text-muted"/>
                    שפה / Language
                </h3>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setLanguage('he')} 
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2 ${language === 'he' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default text-text-muted hover:border-primary-300'}`}
                    >
                        <span className="text-lg">🇮🇱</span> עברית
                    </button>
                    <button 
                        onClick={() => setLanguage('en')} 
                        className={`flex-1 py-2 px-3 rounded-lg border text-sm font-bold transition-all flex items-center justify-center gap-2 ${language === 'en' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default text-text-muted hover:border-primary-300'}`}
                    >
                        <span className="text-lg">🇺🇸</span> English
                    </button>
                </div>
             </section>

        </main>

        {/* Footer Actions */}
        <footer className="p-4 border-t border-border-default bg-bg-subtle/30">
          <div className="flex gap-3">
               <button 
                onClick={handleReset}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors w-1/3"
               >
                   <ArrowUturnLeftIcon className="w-4 h-4" />
                   <span className="text-xs">איפוס</span>
               </button>
               <button 
                onClick={onClose} 
                className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 w-2/3"
               >
                   סיום
               </button>
          </div>
        </footer>
      </div>
       <style>{`
            @keyframes slideIn { from { transform: translateX(-100%); opacity: 0.5; } to { transform: translateX(0); opacity: 1; } }
            .animate-slide-in { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            .custom-scrollbar::-webkit-scrollbar { width: 5px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        `}</style>
    </div>
  );
};

export default PreferencesModal;
