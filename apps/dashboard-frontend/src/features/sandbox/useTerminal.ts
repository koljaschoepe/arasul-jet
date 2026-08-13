/**
 * useTerminal - xterm.js + WebSocket hook for sandbox terminals
 *
 * Manages the full lifecycle: xterm instance, WebSocket connection,
 * binary data piping, resize handling, auto-reconnect, and cleanup.
 *
 * Key features:
 * - Container-ready gate: WebSocket connection only when containerStatus === 'running'
 * - Auto-reconnect with exponential backoff on transient failures
 * - Stable hook identity: uses refs for callbacks to prevent re-render loops
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { useTheme } from '@/hooks/useTheme';
import { TERMINAL_THEMES } from '@/lib/terminalThemes';
import { API_BASE, getAuthHeaders } from '@/config/api';

/**
 * Holt ein Einmal-Ticket für den WS-Aufbau (Bearer-authentifiziert wie jeder
 * andere Aufruf). Der Browser kann auf der WebSocket-Verbindung selbst keinen
 * Authorization-Header setzen — das Ticket schließt diese Lücke, ohne den
 * langlebigen JWT in die WS-URL (und damit in Proxy-Logs) zu schreiben. Bei
 * Fehler `null` → der Aufrufer verbindet ohne Ticket (Cookie-Fallback).
 */
async function holeTerminalTicket(): Promise<string | null> {
  try {
    // useApi-exception: useApi ist ein Hook und hier (Modul-Funktion außerhalb
    // der Render-Phase, im async WS-Aufbau) nicht aufrufbar — wie in
    // useWebSocketMetrics/DownloadContext. getAuthHeaders liefert denselben
    // Bearer + CSRF wie useApi.
    const res = await fetch(`${API_BASE}/sandbox/terminal/ticket`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ticket?: string };
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.VITE_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

const MAX_RETRIES = 5;
const BASE_DELAY = 1500; // 1.5s, 3s, 6s, 12s, 24s

interface UseTerminalOptions {
  projectId: string;
  /**
   * tmux-Session-Name im Container. Mehrere Terminals im selben Projekt
   * brauchen distinkte Namen, um unabhängige Shells (statt Spiegel eines
   * Screens) zu sein. Weglassen → Backend-Default 'main' (Erst-Session).
   */
  terminalName?: string;
  containerStatus?: string;
  fontSize?: number;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
}

interface UseTerminalReturn {
  terminalRef: React.RefObject<HTMLDivElement | null>;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
  fit: () => void;
  sendInput: (text: string) => void;
}

export function useTerminal({
  projectId,
  terminalName,
  containerStatus,
  fontSize = 14,
  onConnected,
  onDisconnected,
  onError,
}: UseTerminalOptions): UseTerminalReturn {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalClose = useRef(false);
  const retryCountRef = useRef(0);
  const hasConnectedRef = useRef(false);

  // App-Theme → Terminal-Theme (black/dark/light). Ref keeps `connect`
  // stable; the live-update effect below re-themes without reconnecting.
  const { theme: appTheme } = useTheme();
  const appThemeRef = useRef(appTheme);
  appThemeRef.current = appTheme;

  // Stable callback refs — prevents connect from depending on callback identity
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const onErrorRef = useRef(onError);
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  onErrorRef.current = onError;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (resizeDebounceRef.current) {
      clearTimeout(resizeDebounceRef.current);
      resizeDebounceRef.current = null;
    }
    if (wsRef.current) {
      intentionalClose.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    fitAddonRef.current = null;
    searchAddonRef.current = null;
  }, []);

  const sendControl = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const fit = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;
    // NIE auf einen versteckten/0×0-Container fitten: FitAddon rechnet dann
    // einen winzigen Raster (z. B. 5 Spalten) aus und schickt das per resize an
    // tmux — beim Wieder-Einblenden zeichnet tmux in dieses falsche Raster und
    // hinterlässt Punkt-/Strich-Artefakte (Nutzerkritik). Der isVisible-Refit
    // (double-rAF) holt den Fit nach, sobald echte Maße vorliegen.
    const el = terminalRef.current;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
    try {
      fitAddonRef.current.fit();
      const { cols, rows } = xtermRef.current;
      sendControl({ type: 'resize', cols, rows });
    } catch {
      // Terminal not visible or not mounted
    }
  }, [sendControl]);

  const sendInput = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const encoder = new TextEncoder();
      wsRef.current.send(encoder.encode(text));
    }
  }, []);

  // connect stored in ref so useEffect never depends on it
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (!terminalRef.current) return;
    // Das Container-Element jetzt festhalten: nach dem späteren `await`
    // (Ticket-Abruf) ist `terminalRef.current` für TS wieder `| null` und die
    // Null-Prüfung oben greift nicht mehr über die Async-Grenze hinweg.
    const container = terminalRef.current;

    // Teardown previous connection
    teardown();
    intentionalClose.current = false;
    setIsConnecting(true);
    setError(null);

    // Create xterm instance
    const term = new Terminal({
      fontSize,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      theme: TERMINAL_THEMES[appThemeRef.current],
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 10000,
      allowProposedApi: true,
    });

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(unicodeAddon);
    term.unicode.activeVersion = '11';

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Mount to DOM. Renderer = xterm.js DOM-Standardrenderer. Der WebGL-Addon
    // wurde bewusst wieder entfernt: @xterm/addon-webgl@0.19.0 rendert in dieser
    // Umgebung (dpr=1) mit einem 2×-Backing-Store → winzige Glyphen (am Gerät
    // reproduziert). Der DOM-Renderer stellt Fullscreen-TUIs korrekt dar.
    term.open(container);

    // Fit after mount — aber nur, wenn der Container schon echte Maße hat.
    // Wird das Terminal versteckt gemountet (Panel zu), übernimmt der
    // isVisible-Refit; ein Fit auf 0×0 würde ein Fehlraster an tmux schicken.
    requestAnimationFrame(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });

    // Connect WebSocket. Der WS-Aufbau ist asynchron, weil er zuerst ein
    // Einmal-Ticket über den normalen (Bearer-)Auth-Pfad holt — der Browser
    // kann auf der WS-Verbindung selbst keinen Authorization-Header setzen, und
    // das httpOnly-Cookie allein ist über LAN-IP/SameSite unzuverlässig. Das
    // Ticket steht kurzlebig+einmalig in der URL (kein JWT-Log-Leck); ohne
    // Ticket bleibt der Cookie-Fallback im Backend.
    void (async () => {
      const ticket = await holeTerminalTicket();
      // Zwischen Ticket-Abruf und WS-Aufbau kann der Effekt bereits
      // abgebaut/ersetzt worden sein (Tab-Wechsel, Reconnect) — dann NICHT mehr
      // verbinden, sonst entsteht ein verwaister Socket.
      if (intentionalClose.current || xtermRef.current !== term) {
        return;
      }
      const terminalParam = terminalName ? `&terminal=${encodeURIComponent(terminalName)}` : '';
      const ticketParam = ticket ? `&ticket=${encodeURIComponent(ticket)}` : '';
      const wsUrl = `${WS_BASE}/sandbox/terminal/ws?projectId=${projectId}${terminalParam}${ticketParam}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return; // stale socket — schon ersetzt/abgebaut
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        retryCountRef.current = 0;
        hasConnectedRef.current = true;

        // Send initial resize
        const { cols, rows } = term;
        sendControl({ type: 'resize', cols, rows });

        onConnectedRef.current?.();
      };

      ws.onmessage = event => {
        if (wsRef.current !== ws) return; // stale socket
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'error') {
              setError(msg.message);
            }
            // pong and other control messages are silently handled
          } catch {
            term.write(event.data);
          }
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return; // stale socket
        setError('Verbindungsfehler');
        setIsConnecting(false);
      };

      ws.onclose = event => {
        // Stale-Guard: close-Events treffen asynchron ein — nach reconnect()
        // kann das 1006-Event der ALTEN Verbindung erst ankommen, wenn die neue
        // längst steht (intentionalClose wieder false). Ohne Guard würde es
        // einen Auto-Reconnect planen, der die gesunde Verbindung abreißt.
        if (wsRef.current !== ws) return;
        setIsConnected(false);
        setIsConnecting(false);
        onDisconnectedRef.current?.();

        // Graceful close — no error, no retry
        if (intentionalClose.current || event.code === 1000 || event.code === 1001) {
          setError(null);
          return;
        }

        // Auto-reconnect with exponential backoff
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retryCountRef.current);
          retryCountRef.current++;
          setError(`Neuversuch in ${Math.round(delay / 1000)}s...`);
          reconnectTimerRef.current = setTimeout(() => {
            intentionalClose.current = false;
            connectRef.current();
          }, delay);
        } else {
          setError('Verbindung fehlgeschlagen');
          onErrorRef.current?.('Verbindung fehlgeschlagen');
        }
      };

      // Pipe terminal input → WebSocket as binary
      term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
          const encoder = new TextEncoder();
          ws.send(encoder.encode(data));
        }
      });

      term.onBinary(data => {
        if (ws.readyState === WebSocket.OPEN) {
          const bytes = new Uint8Array(data.length);
          for (let i = 0; i < data.length; i++) {
            bytes[i] = data.charCodeAt(i) & 0xff;
          }
          ws.send(bytes);
        }
      });

      // Resize observer
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      // Entprellt: schnelle Drag-Resizes fluten sonst fit()+WS-Resize pro Frame
      // (Ruckeln, Neu-Zeichnen-Sturm). Ein 100ms-Fenster, danach genau EIN fit.
      const observer = new ResizeObserver(() => {
        if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = setTimeout(() => {
          requestAnimationFrame(() => {
            if (fitAddonRef.current && xtermRef.current) {
              // 0×0 überspringen (Panel gerade versteckt) — kein Fehlraster an tmux.
              if (container.clientWidth === 0 || container.clientHeight === 0) return;
              try {
                fitAddonRef.current.fit();
                const { cols, rows } = xtermRef.current;
                sendControl({ type: 'resize', cols, rows });
              } catch {
                // ignore
              }
            }
          });
        }, 100);
      });
      observer.observe(container);
      resizeObserverRef.current = observer;

      // Keepalive ping every 25s
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      pingIntervalRef.current = setInterval(() => {
        sendControl({ type: 'ping' });
      }, 25000);
    })();
  }, [projectId, terminalName, fontSize, sendControl, teardown]);

  // Keep connectRef in sync
  connectRef.current = connect;

  // Live re-theme on app theme change (no reconnect needed)
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = TERMINAL_THEMES[appTheme];
    }
  }, [appTheme]);

  // Manual reconnect — resets retry counter
  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    teardown();
    reconnectTimerRef.current = setTimeout(() => {
      intentionalClose.current = false;
      connectRef.current();
    }, 300);
  }, [teardown]);

  // Container-ready gate: connect only when container is running.
  // Uses connectRef to avoid depending on connect identity.
  useEffect(() => {
    const shouldConnect = containerStatus === undefined || containerStatus === 'running';

    if (shouldConnect && !hasConnectedRef.current) {
      // First connection — container just became ready
      connectRef.current();
    } else if (shouldConnect && hasConnectedRef.current && !wsRef.current) {
      // Container back to running after being stopped — reconnect
      retryCountRef.current = 0;
      connectRef.current();
    }

    return () => {
      // Only full teardown on unmount, not on every re-fire
      teardown();
      hasConnectedRef.current = false;
      retryCountRef.current = 0;
    };
    // NOTE: effect deps intentionally scoped (exhaustive-deps reviewed)
  }, [containerStatus, projectId, terminalName]);

  return {
    terminalRef,
    isConnected,
    isConnecting,
    error,
    reconnect,
    fit,
    sendInput,
  };
}
