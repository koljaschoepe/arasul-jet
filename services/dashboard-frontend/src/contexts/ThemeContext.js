import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// Note: System preference auto-detection removed - manual toggle only

const ThemeContext = createContext(undefined);

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light'
};

const STORAGE_KEY = 'arasul_theme';

export function ThemeProvider({ children }) {
  // Initialize theme from localStorage or default to dark (manual toggle only)
  const [theme, setThemeState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Object.values(THEMES).includes(stored)) {
      return stored;
    }
    // Default to dark mode (no system preference auto-detection)
    return THEMES.DARK;
  });

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((newTheme) => {
    if (Object.values(THEMES).includes(newTheme)) {
      setThemeState(newTheme);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => prev === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK);
  }, []);

  const isDark = theme === THEMES.DARK;
  const isLight = theme === THEMES.LIGHT;

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark,
    isLight
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default ThemeContext;
