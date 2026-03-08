/**
 * Test Utilities for Frontend Components
 *
 * Provides helper functions for testing React components with:
 * - Context providers (Auth, Download, WebSocket)
 * - SSE stream mocking
 * - Custom waitFor utilities
 */

import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { AuthProvider } from '../contexts/AuthContext';
import { DownloadProvider } from '../contexts/DownloadContext';

/**
 * Renders a component wrapped with all necessary context providers
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    authValue = { user: { id: 1, username: 'testuser' }, isAuthenticated: true },
    downloadValue = {},
    ...renderOptions
  }: RenderOptions & { authValue?: any; downloadValue?: any } = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider value={authValue}>
        <DownloadProvider value={downloadValue}>{children}</DownloadProvider>
      </AuthProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

interface SSEEvent {
  done?: boolean;
  [key: string]: any;
}

/**
 * Creates a mock SSE stream response for fetch
 */
export function createMockSSEStream(events: SSEEvent[], { delayBetweenEvents = 0 } = {}) {
  let eventIndex = 0;
  let readerClosed = false;

  const mockReader = {
    read: vi.fn().mockImplementation(async () => {
      if (readerClosed) {
        return { done: true, value: undefined };
      }

      if (delayBetweenEvents > 0 && eventIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenEvents));
      }

      if (eventIndex < events.length) {
        const event = events[eventIndex];
        eventIndex++;

        if (event.done === true) {
          readerClosed = true;
        }

        const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
        return { done: false, value: encoded };
      }

      return { done: true, value: undefined };
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };

  return {
    ok: true,
    body: {
      getReader: () => mockReader,
    },
  };
}

interface MockEndpointConfig {
  reject?: any;
  ok?: boolean;
  status?: number;
  data?: any;
  extra?: Record<string, any>;
}

/**
 * Creates a mock Axios instance with common endpoint responses
 */
export function createMockAxios(responses: Record<string, any> = {}) {
  const defaultResponses: Record<string, any> = {
    '/api/health': { status: 'healthy' },
    '/api/auth/me': { id: 1, username: 'testuser' },
    ...responses,
  };

  const findResponse = (url: string) => {
    for (const [pattern, data] of Object.entries(defaultResponses)) {
      if (url.includes(pattern)) {
        return { data };
      }
    }
    return { data: {} };
  };

  return {
    get: vi.fn((url: string) => Promise.resolve(findResponse(url))),
    post: vi.fn((url: string) => Promise.resolve(findResponse(url))),
    put: vi.fn((url: string) => Promise.resolve(findResponse(url))),
    delete: vi.fn(() => Promise.resolve({ data: { success: true } })),
    create: vi.fn(() => createMockAxios(responses)),
    defaults: { headers: { common: {} } },
  };
}

/**
 * Enhanced waitFor with better error messages
 */
export async function waitForElement(
  callback: () => any,
  { timeout = 1000, errorMessage = '' } = {}
) {
  const { waitFor } = await import('@testing-library/react');

  try {
    return await waitFor(callback, { timeout });
  } catch (error: any) {
    if (errorMessage) {
      throw new Error(`${errorMessage}\nOriginal error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Creates a mock fetch function with common endpoint handling
 */
export function createMockFetch(endpoints: Record<string, MockEndpointConfig> = {}) {
  return vi.fn((url: string) => {
    for (const [pattern, config] of Object.entries(endpoints)) {
      if (url.includes(pattern)) {
        if (config.reject) {
          return Promise.reject(config.reject);
        }

        return Promise.resolve({
          ok: config.ok !== false,
          status: config.status || 200,
          json: () => Promise.resolve(config.data || {}),
          ...config.extra,
        });
      }
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

/**
 * Waits for all pending promises to resolve
 */
export async function flushPromises() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Creates a deferred promise that can be resolved/rejected externally
 */
export function createDeferred<T = any>() {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}
