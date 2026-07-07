/**
 * useWebSocketMetrics - Custom Hook for Real-time Metrics
 *
 * PHASE 3: Extracts WebSocket logic from App.js for better separation of concerns.
 * Handles WebSocket connection, reconnection with exponential backoff,
 * and HTTP polling fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import type { Metrics } from '../types';

// WebSocket URL: use wss:// if page is https://, otherwise ws://
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.VITE_WS_URL || `${WS_PROTOCOL}//${window.location.host}/api`;

const MAX_RECONNECT_ATTEMPTS = 10;

export type { Metrics } from '../types';

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

  // Calculate reconnection delay with exponential backoff and jitter.
  // P7.1: the very first reconnect attempt now uses a wider random window
  // (0–5s) instead of the deterministic 1s ±25% — when the backend restarts,
  // every connected dashboard tab tried to reconnect within the same ~750ms
  // window, hammering the server. Wide jitter on attempt 0 spreads the herd.
  const calculateReconnectDelay = useCallback((attempt: number): number => {
    if (attempt === 0) {
      return Math.floor(Math.random() * 5000); // 0–5s for the thundering-herd buffer
    }
    // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    // Add jitter ±25%
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    return Math.floor(delay + jitter);
  }, []);

  // Start HTTP polling as fallback when WebSocket fails
  const startHttpPolling = useCallback(() => {
    if (httpPollingRef.current) return; // Already polling

    httpPollingRef.current = setInterval(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        // useApi-exception: HTTP-polling fallback with its own 401→stopPolling
        // handling. useApi would instead trigger a global logout on 401, which
        // is wrong for a background metrics poll. Raw fetch is deliberate.
        const response = await fetch(`${API_BASE}/metrics/live`, {
          headers: getAuthHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (response.status === 401) {
          stopHttpPolling();
          return;
        }
        if (!response.ok) return;
        const data: Metrics = await response.json();
        setMetrics(data);
      } catch {
        clearTimeout(timeoutId);
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
      // P7.4: increased to 30s. Server heartbeat is 15s; 20s threshold flapped
      // under load when a single ping was momentarily delayed. 30s gives a 15s
      // grace window before declaring the connection stale.
      if (lastDataTimeRef.current > 0 && elapsed > 30000) {
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
      // SEC (P8-1): Do NOT put the JWT in the URL — WS URLs leak into Traefik
      // access logs. The httpOnly `arasul_session` cookie is sent automatically
      // on this same-origin WS upgrade handshake and the backend authenticates
      // the upgrade from that cookie (or an Authorization header).
      const wsUrl = `${WS_BASE}/metrics/live-stream`;
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
          const data = JSON.parse(event.data as string) as Metrics & { error?: unknown };
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
