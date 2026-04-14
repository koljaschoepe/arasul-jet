/**
 * useTerminal - xterm.js + WebSocket hook for sandbox terminals
 *
 * Manages the full lifecycle: xterm instance, WebSocket connection,
 * binary data piping, resize handling, and cleanup.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { getValidToken } from '../../utils/token';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.VITE_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

interface UseTerminalOptions {
  projectId: string;
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
  const intentionalClose = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    intentionalClose.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (wsRef.current) {
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

  const connect = useCallback(() => {
    if (!terminalRef.current) return;

    // Cleanup previous
    if (wsRef.current) {
      intentionalClose.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }

    intentionalClose.current = false;
    setIsConnecting(true);
    setError(null);

    // Create xterm instance
    const term = new Terminal({
      fontSize,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#a1a1aa',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
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
      },
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

    // Connect WebSocket
    const token = getValidToken();
    if (!token) {
      setError('Nicht authentifiziert');
      setIsConnecting(false);
      return;
    }

    const wsUrl = `${WS_BASE}/sandbox/terminal/ws?projectId=${projectId}&token=${token}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);

      // Send initial resize
      const { cols, rows } = term;
      sendControl({ type: 'resize', cols, rows });

      onConnected?.();
    };

    ws.onmessage = event => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame: raw terminal data
        term.write(new Uint8Array(event.data));
      } else {
        // Text frame: control message
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'error') {
            setError(msg.message);
          } else if (msg.type === 'pong') {
            // keepalive response
          }
        } catch {
          // Not JSON, write as text
          term.write(event.data);
        }
      }
    };

    ws.onerror = () => {
      setError('Verbindungsfehler');
      setIsConnecting(false);
    };

    ws.onclose = event => {
      setIsConnected(false);
      setIsConnecting(false);
      onDisconnected?.();

      if (!intentionalClose.current && event.code !== 1000) {
        setError('Verbindung unterbrochen');
        onError?.('Verbindung unterbrochen');
      }
    };

    // Pipe terminal input to WebSocket as binary
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        ws.send(encoder.encode(data));
      }
    });

    // Terminal binary data handler
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
    const pingInterval = setInterval(() => {
      sendControl({ type: 'ping' });
    }, 25000);

    // Store cleanup for interval
    const prevCleanup = ws.onclose;
    ws.onclose = event => {
      clearInterval(pingInterval);
      if (typeof prevCleanup === 'function') {
        prevCleanup.call(ws, event);
      }
    };
  }, [projectId, fontSize, onConnected, onDisconnected, onError, sendControl]);

  const reconnect = useCallback(() => {
    cleanup();
    // Small delay to let cleanup finish
    reconnectTimerRef.current = setTimeout(() => {
      intentionalClose.current = false;
      connect();
    }, 300);
  }, [cleanup, connect]);

  // Initial connection
  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

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

export default useTerminal;
