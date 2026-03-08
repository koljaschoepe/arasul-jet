/**
 * useWebSocketMetrics - Custom Hook for Real-time Metrics
 *
 * PHASE 3: Extracts WebSocket logic from App.js for better separation of concerns.
 * Handles WebSocket connection, reconnection with exponential backoff,
 * and HTTP polling fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';

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

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || isIntentionallyClosedRef.current) return;

    try {
      const ws = new WebSocket(`${WS_BASE}/metrics/live-stream`);

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsConnected(true);
        setWsReconnecting(false);
        stopHttpPolling();
      };

      ws.onmessage = (event: MessageEvent) => {
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
  }, [isAuthenticated, calculateReconnectDelay, startHttpPolling, stopHttpPolling]);

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
    };
  }, [isAuthenticated, connectWebSocket, stopHttpPolling]);

  return {
    metrics,
    wsConnected,
    wsReconnecting,
  };
}

export default useWebSocketMetrics;
