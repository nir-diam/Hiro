
import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';

export type Theme = 'purple' | 'blue' | 'red' | 'green' | 'slate' | 'orange' | 'teal' | 'rose' | 'indigo' | 'amber';
export type Mode = 'light' | 'dark' | 'dark-gray' | 'dark-black';
export type FontSize = 'sm' | 'base' | 'lg';
export type Density = 'comfortable' | 'compact';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'purple');
  const [mode, setModeState] = useState<Mode>(() => (localStorage.getItem('mode') as Mode) || 'light');
  const [fontSize, setFontSizeState] = useState<FontSize>(() => (localStorage.getItem('fontSize') as FontSize) || 'base');
  const [density, setDensityState] = useState<Density>(() => (localStorage.getItem('density') as Density) || 'comfortable');

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-mode', mode);
    localStorage.setItem('mode', mode);
  }, [mode]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-font-size', fontSize);
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.setAttribute('data-density', density);
    localStorage.setItem('density', density);
  }, [density]);


  const setTheme = (newTheme: Theme) => setThemeState(newTheme);
  const setMode = (newMode: Mode) => setModeState(newMode);
  const setFontSize = (newSize: FontSize) => setFontSizeState(newSize);
  const setDensity = (newDensity: Density) => setDensityState(newDensity);

  const value = useMemo(() => ({
    theme, setTheme,
    mode, setMode,
    fontSize, setFontSize,
    density, setDensity,
  }), [theme, mode, fontSize, density]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
