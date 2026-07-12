/**
 * Tests: Terminal-Theme-Kopplung (Schwarz · Dunkel · Hell).
 *
 * 1. TERMINAL_THEMES map: vollständig für alle drei App-Themes,
 *    korrekte Hintergründe, volle 16-Farben-ANSI-Palette.
 * 2. useTerminal: initialisiert xterm mit dem aktiven App-Theme und
 *    re-themed live (ohne Reconnect), wenn das App-Theme wechselt.
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TERMINAL_THEMES } from '@/lib/terminalThemes';
import type { Theme } from '@/hooks/useTheme';
import { useTheme } from '@/hooks/useTheme';
import { useTerminal } from '../useTerminal';

const { terminalInstances } = vi.hoisted(() => ({
  terminalInstances: [] as Array<{ options: { theme?: unknown } }>,
}));

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    unicode = { activeVersion: '' };
    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminalInstances.push(this as unknown as { options: { theme?: unknown } });
    }
    open(): void {}
    loadAddon(): void {}
    onData(): void {}
    onBinary(): void {}
    write(): void {}
    dispose(): void {}
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
  },
}));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));

const ANSI_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

describe('TERMINAL_THEMES', () => {
  it('enthält eine vollständige Palette für alle drei App-Themes', () => {
    const themes: Theme[] = ['black', 'dark', 'light'];
    for (const theme of themes) {
      const t = TERMINAL_THEMES[theme];
      expect(t).toBeDefined();
      expect(t.background).toBeTruthy();
      expect(t.foreground).toBeTruthy();
      expect(t.cursor).toBeTruthy();
      expect(t.selectionBackground).toBeTruthy();
      for (const key of ANSI_KEYS) {
        expect(t[key], `${theme}.${key}`).toBeTruthy();
      }
    }
  });

  it('koppelt die Hintergründe an die App-Paletten', () => {
    expect(TERMINAL_THEMES.black.background).toBe('#0A0A0A');
    expect(TERMINAL_THEMES.dark.background).toBe('#181818');
    expect(TERMINAL_THEMES.light.background).toBe('#FFFFFF');
  });

  it('light hat dunkle Schrift auf hellem Grund', () => {
    expect(TERMINAL_THEMES.light.foreground).toBe('#1a1a1a');
  });
});

describe('useTerminal Theme-Kopplung', () => {
  beforeEach(() => {
    terminalInstances.length = 0;
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountConnectedTerminal() {
    const hook = renderHook(() => useTerminal({ projectId: 'p1' }));
    // DOM-Node anhängen (renderHook rendert keine Komponente) und verbinden
    hook.result.current.terminalRef.current = document.createElement('div');
    act(() => {
      hook.result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // reconnect-Delay (300ms) + ws.onopen
    });
    return hook;
  }

  it('initialisiert xterm mit dem Theme des App-Themes (Default: black)', async () => {
    const hook = await mountConnectedTerminal();

    expect(terminalInstances).toHaveLength(1);
    expect(terminalInstances[0]?.options.theme).toEqual(TERMINAL_THEMES.black);

    hook.unmount();
  });

  it('re-themed live bei App-Theme-Wechsel ohne neues Terminal', async () => {
    const hook = await mountConnectedTerminal();
    const themeHook = renderHook(() => useTheme());

    act(() => {
      themeHook.result.current.setTheme('light');
    });

    expect(terminalInstances).toHaveLength(1); // kein Reconnect
    expect(terminalInstances[0]?.options.theme).toEqual(TERMINAL_THEMES.light);

    act(() => {
      themeHook.result.current.setTheme('dark');
    });
    expect(terminalInstances[0]?.options.theme).toEqual(TERMINAL_THEMES.dark);

    themeHook.unmount();
    hook.unmount();
  });
});
