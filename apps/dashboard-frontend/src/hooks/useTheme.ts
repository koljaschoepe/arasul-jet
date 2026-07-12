import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Drei-Theme-System: Schwarz (Default) · Dunkel · Hell.
 *
 * DOM contract on <html>:
 *   - data-theme="black|dark|light"  → drives the [data-theme=…] CSS blocks
 *   - class "dark" for black+dark    → keeps Tailwind `dark:` utilities alive
 *   - class "light" for light        → keeps the legacy `.light` CSS rules alive
 */
export type Theme = 'black' | 'dark' | 'light';

const STORAGE_KEY = 'arasul_theme';

/** Cycle order for toggleTheme(): black → dark → light → black */
const NEXT_THEME: Record<Theme, Theme> = {
  black: 'dark',
  dark: 'light',
  light: 'black',
};

function isTheme(value: string | null): value is Theme {
  return value === 'black' || value === 'dark' || value === 'light';
}

function getInitialTheme(): Theme {
  // Migration: stored 'dark'/'light' keep their meaning; missing or unknown
  // values fall back to the new default 'black'.
  const saved = localStorage.getItem(STORAGE_KEY);
  return isTheme(saved) ? saved : 'black';
}

// Module-level pub/sub so every mounted useTheme() instance (App shell,
// WorkspaceMenuBar, Settings, terminals) stays in sync without a provider.
const listeners = new Set<(theme: Theme) => void>();

function broadcast(theme: Theme) {
  listeners.forEach(listener => listener(theme));
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Keep a ref for stable-toggle without functional-update side effects
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Subscribe to theme changes made by other useTheme() instances
  useEffect(() => {
    const listener = (next: Theme) => setThemeState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    broadcast(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(NEXT_THEME[themeRef.current]);
  }, [setTheme]);

  // Apply theme to <html>: data-theme attribute + dark/light classes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'black' || theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.setAttribute('data-theme', theme);
  }, [theme]);

  return { theme, setTheme, toggleTheme } as const;
}
