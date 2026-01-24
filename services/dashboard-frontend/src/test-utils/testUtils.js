/**
 * Test Utilities for Frontend Components
 *
 * Provides helper functions for testing React components with:
 * - Context providers (Auth, Download, WebSocket)
 * - SSE stream mocking
 * - Axios mocking
 * - Custom waitFor utilities
 */

import React from 'react';
import { render } from '@testing-library/react';
import { AuthProvider } from '../contexts/AuthContext';
import { DownloadProvider } from '../contexts/DownloadContext';

/**
 * Renders a component wrapped with all necessary context providers
 *
 * @param {React.ReactElement} ui - The component to render
 * @param {Object} options - Render options
 * @param {Object} options.authValue - Custom auth context value
 * @param {Object} options.downloadValue - Custom download context value
 * @param {Object} options.renderOptions - Additional render options
 * @returns {Object} Render result with custom queries
 */
export function renderWithProviders(
  ui,
  {
    authValue = { user: { id: 1, username: 'testuser' }, isAuthenticated: true },
    downloadValue = {},
    ...renderOptions
  } = {}
) {
  function Wrapper({ children }) {
    return (
      <AuthProvider value={authValue}>
        <DownloadProvider value={downloadValue}>
          {children}
        </DownloadProvider>
      </AuthProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

/**
 * Creates a mock SSE stream response for fetch
 *
 * @param {Array} events - Array of event objects to stream
 * @param {Object} options - Stream options
 * @param {number} options.delayBetweenEvents - Delay in ms between events
 * @returns {Object} Mock fetch response with ReadableStream body
 */
export function createMockSSEStream(events, { delayBetweenEvents = 0 } = {}) {
  let eventIndex = 0;
  let readerClosed = false;

  const mockReader = {
    read: jest.fn().mockImplementation(async () => {
      if (readerClosed) {
        return { done: true, value: undefined };
      }

      if (delayBetweenEvents > 0 && eventIndex > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenEvents));
      }

      if (eventIndex < events.length) {
        const event = events[eventIndex];
        eventIndex++;

        // If this is a done signal event, close the reader after this
        if (event.done === true) {
          readerClosed = true;
        }

        const encoded = new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
        return { done: false, value: encoded };
      }

      return { done: true, value: undefined };
    }),
    cancel: jest.fn(),
    releaseLock: jest.fn(),
  };

  return {
    ok: true,
    body: {
      getReader: () => mockReader,
    },
  };
}

/**
 * Creates a mock Axios instance with common endpoint responses
 *
 * @param {Object} responses - Map of URL patterns to response data
 * @returns {Object} Mock axios with get/post/put/delete methods
 */
export function createMockAxios(responses = {}) {
  const defaultResponses = {
    '/api/health': { status: 'healthy' },
    '/api/auth/me': { id: 1, username: 'testuser' },
    ...responses,
  };

  const findResponse = (url) => {
    for (const [pattern, data] of Object.entries(defaultResponses)) {
      if (url.includes(pattern)) {
        return { data };
      }
    }
    return { data: {} };
  };

  return {
    get: jest.fn((url) => Promise.resolve(findResponse(url))),
    post: jest.fn((url) => Promise.resolve(findResponse(url))),
    put: jest.fn((url) => Promise.resolve(findResponse(url))),
    delete: jest.fn(() => Promise.resolve({ data: { success: true } })),
    create: jest.fn(() => createMockAxios(responses)),
    defaults: { headers: { common: {} } },
  };
}

/**
 * Enhanced waitFor with better error messages
 *
 * @param {Function} callback - Assertion callback
 * @param {Object} options - waitFor options
 * @param {number} options.timeout - Timeout in ms (default: 1000)
 * @param {string} options.errorMessage - Custom error message
 * @returns {Promise} waitFor result
 */
export async function waitForElement(callback, { timeout = 1000, errorMessage = '' } = {}) {
  const { waitFor } = await import('@testing-library/react');

  try {
    return await waitFor(callback, { timeout });
  } catch (error) {
    if (errorMessage) {
      throw new Error(`${errorMessage}\nOriginal error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Creates a mock fetch function with common endpoint handling
 *
 * @param {Object} endpoints - Map of URL patterns to response configurations
 * @returns {Function} Mock fetch function
 */
export function createMockFetch(endpoints = {}) {
  return jest.fn((url, options = {}) => {
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

    // Default response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });
}

/**
 * Waits for all pending promises to resolve
 * Useful for flushing async operations in tests
 */
export async function flushPromises() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Creates a deferred promise that can be resolved/rejected externally
 * Useful for controlling async operations in tests
 *
 * @returns {Object} { promise, resolve, reject }
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
