/**
 * xterm.js color themes coupled to the app theme (black · dark · light).
 *
 * xterm cannot read CSS variables, so this file is the one sanctioned place
 * where terminal colors live as literals. Backgrounds mirror the app tokens:
 * black → --background #0A0A0A, dark → surface #181818, light → #FFFFFF.
 */
import type { ITheme } from '@xterm/xterm';
import type { Theme } from '@/hooks/useTheme';

/** Shared dark ANSI palette (black + dark backgrounds). */
const DARK_ANSI = {
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
} as const;

/** Light ANSI palette — darker tones for readability on white. */
const LIGHT_ANSI = {
  black: '#1a1a1a',
  red: '#cd3131',
  green: '#107c10',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#b91c1c',
  brightGreen: '#15803d',
  brightYellow: '#a16207',
  brightBlue: '#1d4ed8',
  brightMagenta: '#a21caf',
  brightCyan: '#0e7490',
  brightWhite: '#a5a5a5',
} as const;

export const TERMINAL_THEMES: Record<Theme, ITheme> = {
  black: {
    background: '#0A0A0A',
    foreground: '#e4e4e7',
    cursor: '#a1a1aa',
    cursorAccent: '#0A0A0A',
    selectionBackground: 'rgba(255, 255, 255, 0.15)',
    ...DARK_ANSI,
  },
  dark: {
    background: '#181818',
    foreground: '#e4e4e7',
    cursor: '#a1a1aa',
    cursorAccent: '#181818',
    selectionBackground: 'rgba(255, 255, 255, 0.15)',
    ...DARK_ANSI,
  },
  light: {
    background: '#FFFFFF',
    foreground: '#1a1a1a',
    cursor: '#525252',
    cursorAccent: '#FFFFFF',
    selectionBackground: 'rgba(16, 16, 16, 0.15)',
    ...LIGHT_ANSI,
  },
};
