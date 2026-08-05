/**
 * Tests: Terminal-Theme-Kopplung (Schwarz · Dunkel · Hell).
 *
 * 1. TERMINAL_THEMES map: vollständig für alle drei App-Themes,
 *    korrekte Hintergründe, volle 16-Farben-ANSI-Palette.
 * 2. useTerminal: initialisiert xterm mit dem aktiven App-Theme und
 *    re-themed live (ohne Reconnect), wenn das App-Theme wechselt.
 * 3. Verbindungs-Dedup: pro Hook-Instanz existiert zu jedem Zeitpunkt
 *    höchstens EINE offene WebSocket-Verbindung — auch über reconnect()
 *    hinweg; unmount schließt sie (Terminal-Konsolidierung, Stufe 3).
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

describe('useTerminal Verbindungs-Dedup', () => {
  beforeEach(() => {
    terminalInstances.length = 0;
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('hält pro Hook-Instanz höchstens eine offene Verbindung, auch über reconnect()', async () => {
    // Zählender Wrapper um den globalen WebSocket-Mock (setupTests)
    const sockets: Array<{ readyState: number }> = [];
    const BaseWebSocket = window.WebSocket as unknown as new (url: string) => {
      readyState: number;
    };
    class TrackingWebSocket extends BaseWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    }
    vi.stubGlobal('WebSocket', TrackingWebSocket);

    const hook = renderHook(() => useTerminal({ projectId: 'p1' }));
    hook.result.current.terminalRef.current = document.createElement('div');
    act(() => {
      hook.result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(sockets.filter(ws => ws.readyState === 1)).toHaveLength(1);

    // Manueller Reconnect: alte Verbindung wird geschlossen, bevor die neue entsteht
    act(() => {
      hook.result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(sockets.filter(ws => ws.readyState === 1)).toHaveLength(1);
    expect(terminalInstances.length).toBeGreaterThan(0);

    // Unmount (z. B. Session schließen) räumt die letzte Verbindung ab
    hook.unmount();
    expect(sockets.filter(ws => ws.readyState === 1)).toHaveLength(0);
  });

  it('ignoriert das späte close-Event (1006) der alten Verbindung nach reconnect()', async () => {
    // Realistischer Mock: close() feuert das close-Event NICHT synchron —
    // im echten Browser trifft es asynchron ein, ggf. erst NACHDEM die neue
    // Verbindung steht und intentionalClose wieder false ist. Ohne Stale-Guard
    // würde der onclose-Handler der alten Verbindung dann einen Auto-Reconnect
    // planen, der die frische, gesunde Verbindung per teardown() abreißt.
    class AsyncCloseWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      static instances: AsyncCloseWebSocket[] = [];
      url: string;
      readyState = 0;
      binaryType = '';
      onopen: (() => void) | null = null;
      onclose: ((ev: { code: number; wasClean: boolean }) => void) | null = null;
      onmessage: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      constructor(url: string) {
        this.url = url;
        AsyncCloseWebSocket.instances.push(this);
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.();
        }, 0);
      }
      send(): void {}
      close(): void {
        this.readyState = 3;
        // Event bewusst NICHT feuern — der Test stellt es später manuell zu
      }
      emitLateClose(code: number): void {
        this.onclose?.({ code, wasClean: code === 1000 });
      }
    }
    vi.stubGlobal('WebSocket', AsyncCloseWebSocket);

    const hook = renderHook(() => useTerminal({ projectId: 'p1' }));
    hook.result.current.terminalRef.current = document.createElement('div');
    act(() => {
      hook.result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    const oldSocket = AsyncCloseWebSocket.instances[0]!;
    expect(oldSocket.readyState).toBe(1);

    // Reconnect: alte Verbindung wird geschlossen, neue aufgebaut
    act(() => {
      hook.result.current.reconnect();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(AsyncCloseWebSocket.instances).toHaveLength(2);
    const newSocket = AsyncCloseWebSocket.instances[1]!;
    expect(newSocket.readyState).toBe(1);
    expect(hook.result.current.isConnected).toBe(true);

    // Jetzt trifft das verspätete abnormale close-Event (1006) der ALTEN
    // Verbindung ein — intentionalClose ist längst wieder false
    act(() => {
      oldSocket.emitLateClose(1006);
    });

    // Kein Auto-Reconnect: auch nach Ablauf des Backoff-Fensters existiert
    // keine dritte Verbindung, die neue bleibt offen und verbunden
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(AsyncCloseWebSocket.instances).toHaveLength(2);
    expect(newSocket.readyState).toBe(1);
    expect(hook.result.current.isConnected).toBe(true);
    expect(hook.result.current.error).toBeNull();

    hook.unmount();
  });
});
