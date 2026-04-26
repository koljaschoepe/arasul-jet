import React, { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// Mock window.location for WebSocket URL construction
const originalLocation = window.location;

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  send() {}

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  simulateMessage(data: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateError() {
    this.onerror?.({} as Event);
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);

// Mock config/api
vi.mock('../../config/api', () => ({
  API_BASE: '/api',
  getAuthHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

describe('useWebSocketMetrics', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    MockWebSocket.instances = [];
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns initial state when not authenticated', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(false), { wrapper: createWrapper() });

    expect(result.current.metrics).toBeNull();
    expect(result.current.wsConnected).toBe(false);
    expect(result.current.wsReconnecting).toBe(false);
  });

  it('creates WebSocket connection when authenticated', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(true), { wrapper: createWrapper() });

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(1);
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(ws.url).toContain('metrics/live-stream');
  });

  it('updates metrics on WebSocket message', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(true), { wrapper: createWrapper() });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      ws.simulateOpen();
    });

    expect(result.current.wsConnected).toBe(true);

    act(() => {
      ws.simulateMessage({ cpu: 45, memory: 60 });
    });

    expect(result.current.metrics).toEqual({ cpu: 45, memory: 60 });
  });

  it('ignores error messages from WebSocket', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(true), { wrapper: createWrapper() });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      ws.simulateOpen();
      ws.simulateMessage({ cpu: 45 });
    });

    expect(result.current.metrics).toEqual({ cpu: 45 });

    act(() => {
      ws.simulateMessage({ error: 'Metrics unavailable' });
    });

    // Should keep old metrics, not update with error
    expect(result.current.metrics).toEqual({ cpu: 45 });
  });

  it('sets wsReconnecting on close', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(true), { wrapper: createWrapper() });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      ws.simulateOpen();
    });

    act(() => {
      ws.close();
    });

    expect(result.current.wsConnected).toBe(false);
    expect(result.current.wsReconnecting).toBe(true);
  });

  it('cleans up on unmount', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result, unmount } = renderHook(() => useWebSocketMetrics(true), {
      wrapper: createWrapper(),
    });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      ws.simulateOpen();
    });

    unmount();

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('handles malformed WebSocket messages gracefully', async () => {
    const { useWebSocketMetrics } = await import('../../hooks/useWebSocketMetrics');
    const { result } = renderHook(() => useWebSocketMetrics(true), { wrapper: createWrapper() });

    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];

    act(() => {
      ws.simulateOpen();
    });

    // Send malformed data - should not throw
    act(() => {
      ws.onmessage?.({ data: 'not-json' } as MessageEvent);
    });

    expect(result.current.metrics).toBeNull();
  });
});
