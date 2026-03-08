/**
 * Vitest Setup File for Arasul Dashboard Frontend
 * This file is automatically loaded before each test file
 */

// Import jest-dom matchers for better assertions
import '@testing-library/jest-dom';

// Polyfill TextEncoder/TextDecoder for JSDOM
import { TextEncoder, TextDecoder } from 'util';
(globalThis as Record<string, unknown>).TextEncoder = TextEncoder;
(globalThis as Record<string, unknown>).TextDecoder = TextDecoder;

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string): string | null {
    return this.store[key] || null;
  },
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  },
  removeItem(key: string): void {
    delete this.store[key];
  },
  clear(): void {
    this.store = {};
  },
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock window.matchMedia
window.matchMedia =
  window.matchMedia ||
  function (query: string): MediaQueryList {
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  };

// Mock ResizeObserver
window.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

// Mock Element.scrollIntoView (not supported in jsdom)
Element.prototype.scrollIntoView = vi.fn();

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    this.readyState = 1;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }
  send(_data: string): void {}
  close(): void {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}
(window as Record<string, unknown>).WebSocket = MockWebSocket;

// Mock fetch
(globalThis as Record<string, unknown>).fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Suppress noisy React/testing warnings in test output
const originalError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && (args[0] as string).includes('Warning: An update to')) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clear localStorage before each test
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
