/**
 * useWebSocketMetrics - Custom Hook for Real-time Metrics
 *
 * PHASE 3: Extracts WebSocket logic from App.js for better separation of concerns.
 * Handles WebSocket connection, reconnection with exponential backoff,
 * and HTTP polling fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import { getValidToken } from '../utils/token';

// WebSocket URL: use wss:// if page is https://, otherwise ws://
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.VITE_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

const MAX_RECONNECT_ATTEMPTS = 10;

export interface Metrics {
  [key: string]: unknown;
}

interface UseWebSocketMetricsReturn {
  metrics: Metrics | null;
  wsConnected: boolean;
  wsReconnecting: boolean;
}

/**
 * Custom hook for WebSocket-based metrics with HTTP fallback
 * @param isAuthenticated - Whether the user is authenticated
 * @returns { metrics, wsConnected, wsReconnecting }
 */
export function useWebSocketMetrics(isAuthenticated: boolean): UseWebSocketMetricsReturn {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);

  // Use refs to avoid stale closures in WebSocket callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isIntentionallyClosedRef = useRef(false);
  const httpPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // HEARTBEAT-001: Track last data time for stale connection detection
  const lastDataTimeRef = useRef<number>(0);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate reconnection delay with exponential backoff and jitter
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    // Add jitter ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }, []);

  // Start HTTP polling as fallback when WebSocket fails
  const startHttpPolling = useCallback(() => {
    if (httpPollingRef.current) return; // Already polling

    httpPollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/metrics/live`, { headers: getAuthHeaders() });
        const data: Metrics = await response.json();
        setMetrics(data);
      } catch {
        // Silently retry on next interval
      }
    }, 5000);
  }, []);

  // Stop HTTP polling
  const stopHttpPolling = useCallback(() => {
    if (httpPollingRef.current) {
      clearInterval(httpPollingRef.current);
      httpPollingRef.current = null;
    }
  }, []);

  // HEARTBEAT-001: Start stale connection checker
  // Server sends data every 5s, so 15s without data means connection is dead
  const startStaleCheck = useCallback(() => {
    if (staleCheckRef.current) return;
    staleCheckRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const elapsed = Date.now() - lastDataTimeRef.current;
      // HEARTBEAT-FIX: Increased from 15s to 20s — server heartbeat is 15s,
      // so 15s stale check races with heartbeat arrival
      if (lastDataTimeRef.current > 0 && elapsed > 20000) {
        // Connection is stale - force close to trigger reconnect
        ws.close();
      }
    }, 5000);
  }, []);

  const stopStaleCheck = useCallback(() => {
    if (staleCheckRef.current) {
      clearInterval(staleCheckRef.current);
      staleCheckRef.current = null;
    }
  }, []);

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || isIntentionallyClosedRef.current) return;

    // Close any existing connection before creating a new one
    if (wsRef.current) {
      const old = wsRef.current;
      wsRef.current = null;
      old.onclose = null; // Prevent onclose from triggering reconnect
      old.close();
    }

    try {
      // WebSocket API doesn't support custom headers, so send JWT via query param.
      // This is safe: the connection is over WSS (encrypted) through Traefik.
      const token = getValidToken();
      const wsUrl = token
        ? `${WS_BASE}/metrics/live-stream?token=${encodeURIComponent(token)}`
        : `${WS_BASE}/metrics/live-stream`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        lastDataTimeRef.current = Date.now();
        setWsConnected(true);
        setWsReconnecting(false);
        stopHttpPolling();
        startStaleCheck();
      };

      ws.onmessage = (event: MessageEvent) => {
        lastDataTimeRef.current = Date.now();
        try {
          const data = JSON.parse(event.data as string) as Metrics;
          // Only update if data doesn't contain an error
          if (!data.error) {
            setMetrics(data);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        stopStaleCheck();

        // Don't reconnect if closed intentionally
        if (isIntentionallyClosedRef.current) {
          return;
        }

        // Check if we should retry
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setWsReconnecting(false);
          startHttpPolling();
          return;
        }

        reconnectAttemptsRef.current++;
        setWsReconnecting(true);
        const delay = calculateReconnectDelay(reconnectAttemptsRef.current - 1);
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      };

      wsRef.current = ws;
    } catch {
      // Retry connection
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        setWsReconnecting(true);
        const delay = calculateReconnectDelay(reconnectAttemptsRef.current - 1);
        reconnectTimerRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      } else {
        // Fallback to HTTP polling
        startHttpPolling();
      }
    }
  }, [
    isAuthenticated,
    calculateReconnectDelay,
    startHttpPolling,
    stopHttpPolling,
    startStaleCheck,
    stopStaleCheck,
  ]);

  // Setup WebSocket connection
  useEffect(() => {
    if (!isAuthenticated) return;

    isIntentionallyClosedRef.current = false;
    connectWebSocket();

    return () => {
      // Cleanup on unmount or auth change
      isIntentionallyClosedRef.current = true;

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      stopHttpPolling();
      stopStaleCheck();
    };
  }, [isAuthenticated, connectWebSocket, stopHttpPolling, stopStaleCheck]);

  return {
    metrics,
    wsConnected,
    wsReconnecting,
  };
}

export default useWebSocketMetrics;
