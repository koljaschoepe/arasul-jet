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

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.VITE_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

const MAX_RETRIES = 5;
const BASE_DELAY = 1500; // 1.5s, 3s, 6s, 12s, 24s

interface UseTerminalOptions {
  projectId: string;
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

    // Mount to DOM
    term.open(terminalRef.current);

    // Fit after mount
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {
        // ignore
      }
    });

    // Connect WebSocket.
    // SEC: Do NOT put the JWT in the URL — WS URLs leak into Traefik access logs.
    // The httpOnly `arasul_session` cookie is sent automatically on this
    // same-origin WS upgrade handshake and the backend authenticates from it.
    const wsUrl = `${WS_BASE}/sandbox/terminal/ws?projectId=${projectId}`;
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
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && xtermRef.current) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current;
            sendControl({ type: 'resize', cols, rows });
          } catch {
            // ignore
          }
        }
      });
    });
    observer.observe(terminalRef.current);
    resizeObserverRef.current = observer;

    // Keepalive ping every 25s
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    pingIntervalRef.current = setInterval(() => {
      sendControl({ type: 'ping' });
    }, 25000);
  }, [projectId, fontSize, sendControl, teardown]);

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
  }, [containerStatus, projectId]);

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
